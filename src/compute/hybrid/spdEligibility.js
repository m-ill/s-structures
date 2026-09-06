import { stableHash } from '../../core/stableHash.js';
import { factorIncompleteCholesky } from '../sparse/iccg.js';
import {
  createCscFromTriplets,
  cscDiagonal,
  cscRowNorms,
  cscSymmetryError,
  cscToCsr,
  denseToCsc,
  sparsePatternHash,
  sparseValueHash,
} from '../sparse/matrix.js';

export const HYBRID_SPD_ELIGIBILITY_VERSION = 'p9-m5-hybrid-spd-eligibility-v1';
const F32_UNIT_ROUNDOFF = 2 ** -24;

export function prepareHybridSpdSystem(matrixInput, options = {}) {
  const matrix = canonicalCsc(matrixInput);
  const limits = {
    symmetryTolerance: positive(options.symmetryTolerance, 1e-9),
    maxScaleRatio: positive(options.maxScaleRatio, 1e8),
    maxConditionProxy: positive(options.maxConditionProxy, 1e5),
    maxRoundoffRisk: positive(options.maxRoundoffRisk, 5e-3),
    maxDofs: positiveInteger(options.maxDofs, 50000),
  };
  const reasons = [];
  if (!matrix.rowCount || matrix.rowCount !== matrix.colCount) reasons.push('HYBRID_SPD_MATRIX_NOT_SQUARE');
  if (matrix.rowCount > limits.maxDofs) reasons.push('HYBRID_SPD_DOF_LIMIT_EXCEEDED');
  const symmetryError = cscSymmetryError(matrix);
  if (!Number.isFinite(symmetryError) || symmetryError > limits.symmetryTolerance) reasons.push('HYBRID_SPD_MATRIX_NOT_SYMMETRIC');
  const diagonal = cscDiagonal(matrix);
  const invalidDiagonalIndex = diagonal.findIndex((value) => !(value > 0) || !Number.isFinite(value));
  if (invalidDiagonalIndex >= 0) reasons.push('HYBRID_SPD_DIAGONAL_NOT_POSITIVE');

  const scales = invalidDiagonalIndex < 0
    ? Float64Array.from(diagonal, (value) => 1 / Math.sqrt(value))
    : new Float64Array(diagonal.length);
  const positiveScales = [...scales].filter((value) => value > 0 && Number.isFinite(value));
  const scaleRatio = positiveScales.length
    ? Math.max(...positiveScales) / Math.min(...positiveScales)
    : Infinity;
  if (!Number.isFinite(scaleRatio) || scaleRatio > limits.maxScaleRatio) reasons.push('HYBRID_SPD_SCALING_RATIO_UNSAFE');

  let scaledCsc = null;
  let scaledCsr = null;
  let conditionProxy = Infinity;
  let roundoffRisk = Infinity;
  let f32RangeOk = false;
  if (!reasons.length) {
    scaledCsc = scaleSymmetricCsc(matrix, scales);
    const rowNorms = cscRowNorms(scaledCsc);
    const scaledDiagonal = cscDiagonal(scaledCsc);
    const minDiagonal = Math.min(...scaledDiagonal);
    conditionProxy = Math.max(...rowNorms) / Math.max(Number.EPSILON, minDiagonal);
    roundoffRisk = conditionProxy * F32_UNIT_ROUNDOFF;
    if (!Number.isFinite(conditionProxy) || conditionProxy > limits.maxConditionProxy || roundoffRisk > limits.maxRoundoffRisk) {
      reasons.push('HYBRID_SPD_CONDITION_PROXY_UNSAFE');
    }
    const csr = cscToCsr(scaledCsc);
    f32RangeOk = [...csr.values].every((value) => Number.isFinite(Math.fround(value)));
    if (!f32RangeOk) reasons.push('HYBRID_SPD_F32_RANGE_UNSAFE');
    scaledCsr = Object.freeze({
      format: 'csr-f32',
      rowCount: csr.rowCount,
      colCount: csr.colCount,
      nnz: csr.nnz,
      rowPtr: Uint32Array.from(csr.rowPtr),
      colIdx: Uint32Array.from(csr.colIdx),
      values: Float32Array.from(csr.values),
      diagonal: Float32Array.from(cscDiagonal(scaledCsc)),
    });
  }

  let spdProbe = { ok: false, reason: reasons[0] || 'NOT_RUN' };
  if (!reasons.length && options.skipSpdProbe !== true) {
    const probe = factorIncompleteCholesky(matrix, {
      symmetryTolerance: limits.symmetryTolerance,
      breakdownTolerance: positive(options.breakdownTolerance, 1e-14),
      signal: options.signal,
    });
    spdProbe = probe.ok
      ? { ok: true, method: probe.method, nonzeros: probe.nonzeros, estimatedBytes: probe.estimatedBytes }
      : { ok: false, reason: probe.reason };
    if (!probe.ok) reasons.push('HYBRID_SPD_POSITIVE_DEFINITE_PROBE_FAILED');
  } else if (!reasons.length) {
    spdProbe = {
      ok: true,
      method: options.spdProof ? 'qualified-upstream-spd-contract' : 'explicitly-skipped-by-qualified-test',
      source: options.spdProof || null,
    };
  }

  const summary = {
    version: HYBRID_SPD_ELIGIBILITY_VERSION,
    eligible: reasons.length === 0,
    reason: reasons[0] || null,
    reasons,
    rowCount: matrix.rowCount,
    nnz: matrix.nnz,
    symmetryError,
    invalidDiagonalIndex,
    scaleRatio,
    conditionProxy,
    roundoffRisk,
    f32RangeOk,
    spdProbe,
    limits,
    patternHash: sparsePatternHash(matrix),
    valueHash: sparseValueHash(matrix),
  };
  return Object.freeze({
    ...summary,
    eligibilityHash: stableHash(summary),
    matrix,
    scales,
    scaledCsc,
    scaledCsr,
  });
}

export function scaleHybridRhs(prepared, rhsInput) {
  const rhs = finiteVector(rhsInput, prepared.matrix.rowCount, 'rhs');
  return Float32Array.from(rhs, (value, index) => Math.fround(value * prepared.scales[index]));
}

export function unscaleHybridSolution(prepared, solutionInput) {
  const solution = finiteVector(solutionInput, prepared.matrix.rowCount, 'solution');
  return Float64Array.from(solution, (value, index) => value * prepared.scales[index]);
}

function canonicalCsc(matrix) {
  if (Array.isArray(matrix)) return denseToCsc(matrix);
  if (matrix?.format !== 'csc') throw eligibilityError('HYBRID_SPD_MATRIX_INVALID', 'Hybrid SPD input must be dense or CSC.');
  const triplets = [];
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let pointer = matrix.colPtr[column]; pointer < matrix.colPtr[column + 1]; pointer += 1) {
      triplets.push([matrix.rowIdx[pointer], column, matrix.values[pointer]]);
    }
  }
  return createCscFromTriplets(matrix.rowCount, matrix.colCount, triplets);
}

function scaleSymmetricCsc(matrix, scales) {
  const triplets = [];
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let pointer = matrix.colPtr[column]; pointer < matrix.colPtr[column + 1]; pointer += 1) {
      const row = matrix.rowIdx[pointer];
      triplets.push([row, column, matrix.values[pointer] * scales[row] * scales[column]]);
    }
  }
  return createCscFromTriplets(matrix.rowCount, matrix.colCount, triplets);
}

function finiteVector(value, length, field) {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) throw eligibilityError('HYBRID_SPD_VECTOR_REQUIRED', `${field} is required.`);
  if (value.length !== length) throw eligibilityError('HYBRID_SPD_VECTOR_SHAPE_INVALID', `${field} length is invalid.`);
  const output = Float64Array.from(value, Number);
  if (output.some((item) => !Number.isFinite(item))) throw eligibilityError('HYBRID_SPD_VECTOR_NONFINITE', `${field} must be finite.`);
  return output;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function eligibilityError(code, message) { return Object.assign(new Error(message), { code }); }
