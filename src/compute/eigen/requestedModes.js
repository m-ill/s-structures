import { stableHash } from '../../core/stableHash.js';
import { createCpuSparseBackend } from '../backends/cpuSparseBackend.js';
import { createSymmetricSparseOperator } from './sparseOperator.js';
import {
  SMALL_DENSE_REFERENCE_LIMIT,
  modalAssuranceCriterion,
  solveSmallSymmetricEigen,
} from './smallSymmetric.js';

export const REQUESTED_MODE_EIGEN_VERSION = 'p9-m6-requested-mode-eigen-v2-relative-metric-rank';

export function solveRequestedGeneralizedEigen(input = {}, options = {}) {
  const startedAt = now();
  let primary;
  let secondary;
  try {
    primary = normalizeOperator(input.primary || input.K, 'primary', 'spd');
    secondary = normalizeOperator(input.secondary || input.B || input.M || input.Kg, 'secondary', 'symmetric');
  } catch (error) {
    return failed(error.code || 'EIGEN_OPERATOR_INVALID', { message: error.message });
  }
  if (primary.dimension !== secondary.dimension) return failed('EIGEN_OPERATOR_DIMENSION_MISMATCH');
  const dimension = primary.dimension;
  const requestedModeCount = positiveInteger(input.modeCount ?? options.modeCount, 1);
  if (requestedModeCount > dimension) {
    return failed('EIGEN_REQUEST_EXCEEDS_DIMENSION', { requestedModeCount, dimension });
  }
  const residualTolerance = positive(input.residualTolerance ?? options.residualTolerance, 1e-8);
  const eigenTolerance = positive(input.eigenTolerance ?? options.eigenTolerance, 1e-11);
  const maxIterations = positiveInteger(input.maxIterations ?? options.maxIterations, 60);
  const smallReferenceLimit = positiveInteger(
    input.smallReferenceLimit ?? options.smallReferenceLimit,
    SMALL_DENSE_REFERENCE_LIMIT,
  );
  const oversampling = positiveInteger(input.oversampling ?? options.oversampling, Math.max(2, requestedModeCount));
  const maximumProjectionDimension = positiveInteger(
    input.maximumProjectionDimension ?? options.maximumProjectionDimension,
    Math.max(16, requestedModeCount + oversampling),
  );
  const blockDimension = dimension <= smallReferenceLimit
    ? dimension
    : Math.min(dimension, maximumProjectionDimension, Math.max(requestedModeCount + oversampling, requestedModeCount * 2));
  if (blockDimension < requestedModeCount) {
    return failed('EIGEN_PROJECTION_DIMENSION_INSUFFICIENT', { requestedModeCount, blockDimension, dimension });
  }

  const ownedBackend = !input.backend && !options.backend;
  const backend = input.backend || options.backend || createCpuSparseBackend({
    maxBytes: input.maxFactorBytes ?? options.maxFactorBytes,
  });
  let prepared = null;
  const convergenceTrace = [];
  let solveCount = 0;
  let latestModes = [];
  try {
    prepared = backend.createFactor(primary.matrix, {
      matrixClass: 'spd',
      pivotTolerance: input.stiffnessPivotTolerance ?? options.stiffnessPivotTolerance,
      symmetryTolerance: input.symmetryTolerance ?? options.symmetryTolerance,
      signal: input.signal || options.signal,
    });
    if (!prepared.ok) {
      return failed('PRIMARY_OPERATOR_NOT_POSITIVE_DEFINITE', {
        requestedModeCount,
        dimension,
        factorReason: prepared.reason,
        factorDiagnostics: prepared.diagnostics,
      });
    }

    let basis = kOrthonormalize(
      initialSubspace(primary, secondary, blockDimension),
      primary,
      Math.max(Number.EPSILON, eigenTolerance * 1e-3),
    );
    if (basis.length < requestedModeCount) {
      return failed('EIGEN_INITIAL_SUBSPACE_RANK_DEFICIENT', {
        requestedModeCount,
        availableVectorCount: basis.length,
      });
    }

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      if (cancelled(input, options)) return failed('CANCELLED', { requestedModeCount, dimension, convergenceTrace });
      const rhsList = basis.map((vector) => secondary.matvec(vector));
      const solved = backend.solveFactorMultiple(prepared.handle, rhsList, {
        signal: input.signal || options.signal,
      });
      solveCount += rhsList.length;
      if (!solved.ok) {
        return failed('EIGEN_SHIFT_INVERT_SOLVE_FAILED', {
          requestedModeCount,
          dimension,
          solveReason: solved.reason,
          solveDiagnostics: solved.diagnostics,
          convergenceTrace,
        });
      }
      basis = kOrthonormalize(
        solved.results.map((row) => row.x),
        primary,
        Math.max(Number.EPSILON, eigenTolerance * 1e-3),
      );
      if (basis.length < requestedModeCount) {
        return failed('EIGEN_SUBSPACE_RANK_DEFICIENT', {
          requestedModeCount,
          availableVectorCount: basis.length,
          iteration,
          convergenceTrace,
        });
      }
      const projected = projectSecondary(basis, secondary);
      const decomposition = solveSmallSymmetricEigen(projected, {
        tolerance: eigenTolerance,
        maxSweeps: Math.max(40, basis.length * 10),
        maxDimension: maximumProjectionDimension > smallReferenceLimit
          ? maximumProjectionDimension
          : smallReferenceLimit,
      });
      if (!decomposition.ok) {
        return failed(decomposition.reason || 'EIGEN_PROJECTED_SOLVE_FAILED', {
          requestedModeCount,
          dimension,
          projectionDimension: basis.length,
          convergenceTrace,
        });
      }
      latestModes = requestedModesFromProjection({
        basis,
        decomposition,
        primary,
        secondary,
        requestedModeCount,
        positiveEigenTolerance: input.positiveEigenTolerance ?? options.positiveEigenTolerance,
        residualTolerance,
      });
      const maximumResidual = Math.max(0, ...latestModes.map((mode) => mode.residual));
      convergenceTrace.push(Object.freeze({
        iteration,
        availableModeCount: latestModes.length,
        projectionDimension: basis.length,
        maximumResidual,
        eigenvalues: Object.freeze(latestModes.map((mode) => mode.eigenvalue)),
      }));
      input.onProgress?.({
        value: iteration / maxIterations,
        stage: 'requested-mode-iteration',
        iteration,
        maximumResidual,
      });
      if (latestModes.length >= requestedModeCount
        && latestModes.every((mode) => mode.residual <= residualTolerance)) {
        const orthogonality = orthogonalityAudit(latestModes, secondary);
        const diagnostics = diagnosticsOf({
          primary,
          secondary,
          dimension,
          requestedModeCount,
          blockDimension,
          convergenceTrace,
          solveCount,
          prepared,
          orthogonality,
          startedAt,
          executionTarget: backend.executionTarget || 'cpu',
        });
        return Object.freeze({
          version: REQUESTED_MODE_EIGEN_VERSION,
          ok: true,
          reason: null,
          requestedModeCount,
          availableModeCount: requestedModeCount,
          modes: Object.freeze(latestModes.slice(0, requestedModeCount)),
          convergenceTrace: Object.freeze(convergenceTrace),
          diagnostics,
        });
      }
    }
    return failed(latestModes.length < requestedModeCount
      ? 'INSUFFICIENT_POSITIVE_EIGENMODES'
      : 'EIGENSOLVER_NOT_CONVERGED', {
      requestedModeCount,
      availableModeCount: latestModes.length,
      modes: latestModes,
      residualTolerance,
      convergenceTrace,
      diagnostics: diagnosticsOf({
        primary,
        secondary,
        dimension,
        requestedModeCount,
        blockDimension,
        convergenceTrace,
        solveCount,
        prepared,
        orthogonality: orthogonalityAudit(latestModes, secondary),
        startedAt,
        executionTarget: backend.executionTarget || 'cpu',
      }),
    });
  } finally {
    if (prepared?.ok) backend.releaseFactor(prepared.handle);
    if (ownedBackend) backend.dispose?.();
  }
}

function requestedModesFromProjection({
  basis,
  decomposition,
  primary,
  secondary,
  requestedModeCount,
  positiveEigenTolerance,
  residualTolerance,
}) {
  const values = decomposition.values;
  const maximumMu = Math.max(0, ...values);
  const positiveTolerance = positive(positiveEigenTolerance, Math.max(1e-18, maximumMu * 1e-12));
  return values
    .map((mu, column) => ({ mu, column }))
    .filter((item) => Number.isFinite(item.mu) && item.mu > positiveTolerance)
    .sort((left, right) => right.mu - left.mu || left.column - right.column)
    .slice(0, requestedModeCount)
    .map((item, index) => {
      const vector = combineBasis(basis, decomposition.vectors.map((row) => row[item.column]));
      canonicalize(vector);
      const eigenvalue = 1 / item.mu;
      const residual = generalizedResidual(primary, secondary, vector, eigenvalue);
      return Object.freeze({
        mode: index + 1,
        eigenvalue,
        inverseEigenvalue: item.mu,
        vector: Object.freeze(Array.from(vector)),
        residual: residual.normalized,
        residualAbsolute: residual.absolute,
        converged: residual.normalized <= residualTolerance,
        normalization: 'canonical-max-absolute-component',
      });
    });
}

function initialSubspace(primary, secondary, count) {
  const primaryDiagonal = primary.diagonal();
  const diagonal = secondary.diagonal();
  const rowNorms = secondary.rowNorms();
  const ranking = Array.from({ length: primary.dimension }, (_item, index) => index)
    .sort((left, right) => (
      seedScore(right, primaryDiagonal, diagonal, rowNorms)
      - seedScore(left, primaryDiagonal, diagonal, rowNorms)
      || left - right
    ));
  const vectors = [];
  for (let column = 0; column < count; column += 1) {
    const vector = new Float64Array(primary.dimension);
    const pivot = ranking[column % ranking.length];
    if (count >= primary.dimension) {
      vector[pivot] = 1;
    } else {
      for (let row = 0; row < vector.length; row += 1) {
        vector[row] = deterministicSeedValue(row, column);
      }
      vector[pivot] += 2;
    }
    vectors.push(vector);
  }
  return vectors;
}

function deterministicSeedValue(row, column) {
  let state = Math.imul(row + 1, 0x45d9f3b) ^ Math.imul(column + 1, 0x119de1f3);
  state ^= state >>> 16;
  state = Math.imul(state, 0x45d9f3b);
  state ^= state >>> 16;
  return ((state >>> 0) / 0xffffffff) - 0.5;
}

function seedScore(index, primaryDiagonal, secondaryDiagonal, secondaryRowNorms) {
  const numerator = Math.max(Math.abs(secondaryDiagonal[index] || 0), secondaryRowNorms[index] || 0);
  const denominator = Math.max(Number.EPSILON, Math.abs(primaryDiagonal[index] || 0));
  return numerator / denominator;
}

function kOrthonormalize(inputVectors, metric, tolerance) {
  const basis = [];
  const metricBasis = [];
  for (const input of inputVectors) {
    const vector = Float64Array.from(input || [], Number);
    if (vector.length !== metric.dimension || vector.some((value) => !Number.isFinite(value))) continue;
    const inputMetricVector = metric.matvec(vector);
    const inputNormSquared = dot(vector, inputMetricVector);
    if (!(inputNormSquared > 0) || !Number.isFinite(inputNormSquared)) continue;
    for (let pass = 0; pass < 2; pass += 1) {
      let metricVector = metric.matvec(vector);
      for (let column = 0; column < basis.length; column += 1) {
        const coefficient = dot(basis[column], metricVector);
        if (coefficient === 0) continue;
        axpy(vector, basis[column], -coefficient);
        axpy(metricVector, metricBasis[column], -coefficient);
      }
    }
    const metricVector = metric.matvec(vector);
    const normSquared = dot(vector, metricVector);
    const relativeRankThreshold = Math.max(Number.MIN_VALUE, inputNormSquared * tolerance);
    if (!(normSquared > relativeRankThreshold) || !Number.isFinite(normSquared)) continue;
    const scale = 1 / Math.sqrt(normSquared);
    scaleVector(vector, scale);
    scaleVector(metricVector, scale);
    basis.push(vector);
    metricBasis.push(metricVector);
  }
  return basis;
}

function projectSecondary(basis, secondary) {
  const products = basis.map((vector) => secondary.matvec(vector));
  return basis.map((left, row) => basis.map((_right, column) => (
    0.5 * (dot(left, products[column]) + dot(basis[column], products[row]))
  )));
}

function combineBasis(basis, coefficients) {
  const output = new Float64Array(basis[0]?.length || 0);
  for (let column = 0; column < basis.length; column += 1) axpy(output, basis[column], coefficients[column]);
  return output;
}

function generalizedResidual(primary, secondary, vector, eigenvalue) {
  const primaryProduct = primary.matvec(vector);
  const secondaryProduct = secondary.matvec(vector);
  const residual = new Float64Array(vector.length);
  for (let index = 0; index < vector.length; index += 1) {
    residual[index] = primaryProduct[index] - eigenvalue * secondaryProduct[index];
  }
  const absolute = norm(residual);
  const denominator = Math.max(norm(primaryProduct), Math.abs(eigenvalue) * norm(secondaryProduct), Number.EPSILON);
  return { absolute, normalized: absolute / denominator };
}

function orthogonalityAudit(modes, secondary) {
  let maximumOffDiagonalMac = 0;
  for (let left = 0; left < modes.length; left += 1) {
    for (let right = left + 1; right < modes.length; right += 1) {
      maximumOffDiagonalMac = Math.max(maximumOffDiagonalMac, modalAssuranceCriterion(
        modes[left].vector,
        modes[right].vector,
        (vector) => secondary.matvec(vector),
      ));
    }
  }
  return Object.freeze({
    metric: secondary.id,
    maximumOffDiagonalMac,
    passed: maximumOffDiagonalMac <= 1e-8,
  });
}

function diagnosticsOf({
  primary,
  secondary,
  dimension,
  requestedModeCount,
  blockDimension,
  convergenceTrace,
  solveCount,
  prepared,
  orthogonality,
  startedAt,
  executionTarget,
}) {
  const finalTrace = convergenceTrace.at(-1) || null;
  const core = {
    algorithm: 'sparse-shift-invert-block-subspace-rayleigh-ritz',
    numericPrecision: 'f64',
    executionTarget,
    dimension,
    requestedModeCount,
    projectionDimension: finalTrace?.projectionDimension ?? blockDimension,
    fullDenseEigenMatrixAllocated: false,
    smallProjectedDenseMatrixAllocated: true,
    denseReferenceAllowed: dimension <= SMALL_DENSE_REFERENCE_LIMIT,
    primaryOperator: primary.descriptor,
    secondaryOperator: secondary.descriptor,
    factorizationCount: prepared?.ok ? 1 : 0,
    solveCount,
    iterationCount: convergenceTrace.length,
    finalMaximumResidual: finalTrace?.maximumResidual ?? null,
    orthogonality,
    gpuCandidateOperations: Object.freeze(['sparse-matvec', 'block-vector-update']),
    cpuAuditOperations: Object.freeze(['factorization', 'rayleigh-ritz', 'residual', 'canonicalization']),
  };
  return Object.freeze({
    ...core,
    durationMs: now() - startedAt,
    auditHash: stableHash(core),
  });
}

function normalizeOperator(value, id, matrixClass) {
  if (value?.matvec && value?.matrix && Number.isInteger(value.dimension)) return value;
  return createSymmetricSparseOperator(value, { id, matrixClass });
}

function canonicalize(vector) {
  let pivot = 0;
  let maximum = 0;
  for (let index = 0; index < vector.length; index += 1) {
    if (Math.abs(vector[index]) > maximum) {
      maximum = Math.abs(vector[index]);
      pivot = index;
    }
  }
  if (!(maximum > 0)) return vector;
  const scale = (vector[pivot] < 0 ? -1 : 1) / maximum;
  scaleVector(vector, scale);
  return vector;
}

function dot(left, right) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += left[index] * right[index];
  return sum;
}

function axpy(target, source, scale) {
  for (let index = 0; index < target.length; index += 1) target[index] += scale * source[index];
}

function scaleVector(vector, scale) {
  for (let index = 0; index < vector.length; index += 1) vector[index] *= scale;
}

function norm(vector) {
  return Math.sqrt(dot(vector, vector));
}

function cancelled(input, options) {
  return input.signal?.aborted === true
    || options.signal?.aborted === true
    || input.shouldCancel?.() === true
    || options.shouldCancel?.() === true;
}

function failed(reason, detail = {}) {
  return Object.freeze({
    version: REQUESTED_MODE_EIGEN_VERSION,
    ok: false,
    reason,
    requestedModeCount: detail.requestedModeCount || 0,
    availableModeCount: detail.availableModeCount || detail.modes?.length || 0,
    modes: Object.freeze(detail.modes || []),
    convergenceTrace: Object.freeze(detail.convergenceTrace || []),
    ...detail,
  });
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}
