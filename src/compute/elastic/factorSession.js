import { stableHash } from '../../core/stableHash.js';
import { createCpuSparseBackend } from '../backends/cpuSparseBackend.js';
import { createCscFromTriplets, denseToCsc, sparsePatternHash, sparseValueHash } from '../sparse/matrix.js';
import { createSpdSolvePolicy } from './spdSolvePolicy.js';

export const ELASTIC_FACTOR_SESSION_VERSION = 'p15-m2-elastic-factor-session-v2';

export function createElasticFactorSession(options = {}) {
  const backend = options.backend || createCpuSparseBackend({ maxBytes: options.maxBytes });
  const iccgThreshold = Math.max(1, Number(options.iccgThreshold ?? 512));
  const spdPolicy = createSpdSolvePolicy({
    backend,
    iccgThreshold,
    tolerance: options.iccgTolerance,
    maxIterations: options.iccgMaxIterations,
    trueResidualTolerance: options.trueResidualTolerance,
    scaling: options.scaling,
    fallback: options.fallback,
    symmetryTolerance: options.symmetryTolerance,
    pivotTolerance: options.pivotTolerance,
  });
  const factors = new Map();
  const seenGroupKeys = new Set();
  const seenFactorUnitKeys = new Set();
  let solveCount = 0;
  let reusedSolveCount = 0;
  let factorizationCount = 0;
  let iterativeAllocatedBytes = 0;
  let iterativePeakBytes = 0;
  let disposed = false;

  return Object.freeze({
    version: ELASTIC_FACTOR_SESSION_VERSION,
    solve,
    snapshot,
    dispose,
  });

  function solve(matrixInput, rhs, solveOptions = {}) {
    if (disposed) return failed('ELASTIC_FACTOR_SESSION_DISPOSED');
    const matrix = canonicalCsc(matrixInput);
    const patternHash = sparsePatternHash(matrix);
    const valueHash = sparseValueHash(matrix);
    const groupKey = requiredText(solveOptions.groupKey, 'groupKey');
    const componentKey = requiredText(solveOptions.componentKey, 'componentKey');
    const matrixClass = String(solveOptions.matrixClass || 'spd').toLowerCase();
    const policyIdentity = matrixClass === 'spd' ? {
      scaling: solveOptions.scaling ?? options.scaling ?? 'diagonal',
      fallback: solveOptions.fallback ?? options.fallback ?? 'sparse-direct',
      iccgThreshold: solveOptions.iccgThreshold ?? iccgThreshold,
      preferIterative: solveOptions.preferIterative !== false,
      symmetryTolerance: solveOptions.symmetryTolerance ?? options.symmetryTolerance ?? 1e-12,
      iccgBreakdownTolerance: solveOptions.iccgBreakdownTolerance ?? options.iccgBreakdownTolerance ?? null,
      pivotTolerance: solveOptions.pivotTolerance ?? options.pivotTolerance ?? null,
    } : null;
    const key = stableHash({ groupKey, componentKey, patternHash, valueHash, matrixClass, policyIdentity });
    let row = factors.get(key);
    const factorReused = !!row;
    if (!row) {
      if (matrixClass === 'spd') {
        const prepared = spdPolicy.prepare(matrix, {
          ...policyIdentity,
          signal: solveOptions.signal,
        });
        if (!prepared.ok) return sessionResult(prepared, matrixInput, groupKey, componentKey, false, 0);
        row = {
          key,
          groupKey,
          componentKey,
          matrix,
          matrixClass,
          kind: 'spd-policy',
          prepared: prepared.prepared,
          rhsCount: 0,
          patternHash,
          valueHash,
        };
        const iterativeBytes = Number(prepared.prepared.iccgFactor?.estimatedBytes || 0);
        iterativeAllocatedBytes += iterativeBytes;
        iterativePeakBytes = Math.max(iterativePeakBytes, iterativeAllocatedBytes);
      } else {
        const prepared = backend.createFactor(matrix, {
          matrixClass,
          signal: solveOptions.signal,
        });
        if (!prepared.ok) return sessionResult(prepared, matrixInput, groupKey, componentKey, false, 0);
        row = {
          key,
          groupKey,
          componentKey,
          matrix,
          matrixClass,
          kind: 'direct',
          handle: prepared.handle,
          rhsCount: 0,
          patternHash,
          valueHash,
        };
      }
      factors.set(key, row);
      seenGroupKeys.add(groupKey);
      seenFactorUnitKeys.add(`${groupKey}::${componentKey}`);
      factorizationCount += 1;
    } else {
      reusedSolveCount += 1;
    }
    const result = row.kind === 'spd-policy'
      ? spdPolicy.solvePrepared(row.prepared, rhs, {
          signal: solveOptions.signal,
          tolerance: solveOptions.tolerance ?? options.iccgTolerance ?? 1e-9,
          trueResidualTolerance: solveOptions.trueResidualTolerance ?? options.trueResidualTolerance,
          maxIterations: solveOptions.maxIterations ?? options.iccgMaxIterations,
          curvatureTolerance: solveOptions.curvatureTolerance ?? options.curvatureTolerance,
          symmetryTolerance: solveOptions.symmetryTolerance ?? options.symmetryTolerance,
          pivotTolerance: solveOptions.pivotTolerance ?? options.pivotTolerance,
        })
      : backend.solveFactor(row.handle, rhs, { signal: solveOptions.signal });
    solveCount += 1;
    row.rhsCount += 1;
    return sessionResult(result, matrixInput, groupKey, componentKey, factorReused, row.rhsCount);
  }

  function snapshot() {
    const rows = [...factors.values()].map((row) => ({
      groupKey: row.groupKey,
      componentKey: row.componentKey,
      rhsCount: row.rhsCount,
      mode: row.kind === 'spd-policy' ? row.prepared.mode : 'direct',
      matrixClass: row.matrixClass,
      patternHash: row.patternHash,
      valueHash: row.valueHash,
    }));
    return Object.freeze({
      version: ELASTIC_FACTOR_SESSION_VERSION,
      disposed,
      factorizationCount,
      factorGroupCount: seenFactorUnitKeys.size,
      combinationFactorGroupCount: seenGroupKeys.size,
      activeFactorCount: rows.length,
      solveCount,
      rhsChannelCount: solveCount,
      reusedSolveCount,
      rows: Object.freeze(rows),
      backend: backendSnapshot(),
    });
  }

  function dispose() {
    if (disposed) return snapshot();
    for (const row of factors.values()) {
      if (row.kind === 'spd-policy') spdPolicy.release(row.prepared);
      else backend.releaseFactor(row.handle);
    }
    factors.clear();
    iterativeAllocatedBytes = 0;
    spdPolicy.dispose();
    backend.dispose();
    disposed = true;
    return snapshot();
  }

  function backendSnapshot() {
    const state = backend.snapshot();
    const policyState = spdPolicy.snapshot();
    const { backend: _policyBackend, ...policy } = policyState;
    return Object.freeze({
      ...state,
      iterativeMethod: 'incomplete-cholesky-zero-fill-pcg',
      iterativeAllocatedBytes,
      iterativePeakBytes,
      peakBytes: Number(state.peakBytes || 0) + iterativePeakBytes,
      allocationBalanced: disposed ? state.allocationBalanced === true && iterativeAllocatedBytes === 0 : null,
      spdPolicy: policy,
    });
  }

  function sessionResult(result, matrixInput, groupKey, componentKey, factorReused, rhsCount) {
    const selectedMethod = result.diagnostics?.selectedMethod || null;
    return {
      ...result,
      diagnostics: {
        ...(result.diagnostics || {}),
        version: ELASTIC_FACTOR_SESSION_VERSION,
        method: result.diagnostics?.method || (selectedMethod === 'iccg'
          ? 'scaled-ic0-pcg'
          : 'sparse-factor-session'),
        sparseAttempted: true,
        inputStorage: matrixInput?.format === 'csc' ? 'csc' : 'dense',
        matrixStorage: 'csc',
        factorStorage: selectedMethod === 'iccg'
          ? 'incomplete-cholesky-zero-fill'
          : result.diagnostics?.factorStorage || 'sparse-row-column-maps',
        fallback: result.diagnostics?.fallback === true,
        fallbackSucceeded: result.diagnostics?.fallbackSucceeded === true,
        denseConversionCount: 0,
        factorReused,
        factorKey: groupKey,
        componentKey,
        rhsIndex: Math.max(0, rhsCount - 1),
        rhsCount,
      },
    };
  }
}

function canonicalCsc(matrix) {
  if (Array.isArray(matrix)) return denseToCsc(matrix);
  if (matrix?.format !== 'csc') throw factorSessionError('ELASTIC_FACTOR_MATRIX_INVALID', 'Elastic factor matrix must be dense or CSC.');
  const triplets = [];
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let pointer = matrix.colPtr[column]; pointer < matrix.colPtr[column + 1]; pointer += 1) {
      triplets.push([matrix.rowIdx[pointer], column, matrix.values[pointer]]);
    }
  }
  return createCscFromTriplets(matrix.rowCount, matrix.colCount, triplets);
}

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw factorSessionError('ELASTIC_FACTOR_FIELD_REQUIRED', `${field} is required.`);
  return text;
}

function failed(reason) {
  return { ok: false, x: null, reason, diagnostics: { version: ELASTIC_FACTOR_SESSION_VERSION, reason } };
}

function factorSessionError(code, message) {
  return Object.assign(new Error(message), { code });
}
