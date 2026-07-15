import { stableHash } from '../../core/stableHash.js';
import { createCpuSparseBackend } from '../backends/cpuSparseBackend.js';
import { createCscFromTriplets, denseToCsc, sparsePatternHash, sparseValueHash } from '../sparse/matrix.js';
import { factorIncompleteCholesky, solveIccg } from '../sparse/iccg.js';

export const ELASTIC_FACTOR_SESSION_VERSION = 'p9-m3-elastic-factor-session-v1';

export function createElasticFactorSession(options = {}) {
  const backend = options.backend || createCpuSparseBackend({ maxBytes: options.maxBytes });
  const iccgThreshold = Math.max(1, Number(options.iccgThreshold ?? 512));
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
    const key = stableHash({ groupKey, componentKey, patternHash, valueHash });
    let row = factors.get(key);
    const factorReused = !!row;
    if (!row) {
      if (matrix.rowCount >= iccgThreshold && (solveOptions.matrixClass || 'spd') === 'spd') {
        const factor = factorIncompleteCholesky(matrix, { signal: solveOptions.signal });
        if (!factor.ok) return factor;
        row = { key, groupKey, componentKey, matrix, mode: 'iccg', factor, rhsCount: 0, patternHash, valueHash };
        iterativeAllocatedBytes += factor.estimatedBytes;
        iterativePeakBytes = Math.max(iterativePeakBytes, iterativeAllocatedBytes);
      } else {
        const prepared = backend.createFactor(matrix, {
          matrixClass: solveOptions.matrixClass || 'spd',
          signal: solveOptions.signal,
        });
        if (!prepared.ok) return prepared;
        row = { key, groupKey, componentKey, matrix, mode: 'direct', handle: prepared.handle, rhsCount: 0, patternHash, valueHash };
      }
      factors.set(key, row);
      seenGroupKeys.add(groupKey);
      seenFactorUnitKeys.add(`${groupKey}::${componentKey}`);
      factorizationCount += 1;
    } else {
      reusedSolveCount += 1;
    }
    const result = row.mode === 'iccg'
      ? solveIccg(row.factor, rhs, {
          signal: solveOptions.signal,
          tolerance: solveOptions.tolerance ?? options.iccgTolerance ?? 1e-9,
          maxIterations: solveOptions.maxIterations ?? options.iccgMaxIterations,
        })
      : backend.solveFactor(row.handle, rhs, { signal: solveOptions.signal });
    solveCount += 1;
    row.rhsCount += 1;
    return {
      ...result,
      diagnostics: {
        ...(result.diagnostics || {}),
        version: ELASTIC_FACTOR_SESSION_VERSION,
        method: row.mode === 'iccg' ? 'p9-common-sparse-iccg-session' : 'p9-common-sparse-factor-session',
        sparseAttempted: true,
        inputStorage: matrixInput?.format === 'csc' ? 'csc' : 'dense',
        matrixStorage: 'csc',
        factorStorage: row.mode === 'iccg'
          ? row.factor.factorStorage
          : row.handle.matrixClass === 'spd' ? 'sparse-row-column-maps' : 'sparse-row-map-lu',
        fallback: false,
        fallbackSucceeded: false,
        denseConversionCount: 0,
        factorReused,
        factorKey: groupKey,
        componentKey,
        rhsIndex: row.rhsCount - 1,
        rhsCount: row.rhsCount,
      },
    };
  }

  function snapshot() {
    const rows = [...factors.values()].map((row) => ({
      groupKey: row.groupKey,
      componentKey: row.componentKey,
      rhsCount: row.rhsCount,
      mode: row.mode,
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
      if (row.mode === 'direct') backend.releaseFactor(row.handle);
    }
    factors.clear();
    iterativeAllocatedBytes = 0;
    backend.dispose();
    disposed = true;
    return snapshot();
  }

  function backendSnapshot() {
    const state = backend.snapshot();
    return Object.freeze({
      ...state,
      iterativeMethod: 'incomplete-cholesky-zero-fill-pcg',
      iterativeAllocatedBytes,
      iterativePeakBytes,
      peakBytes: Number(state.peakBytes || 0) + iterativePeakBytes,
      allocationBalanced: disposed ? state.allocationBalanced === true && iterativeAllocatedBytes === 0 : null,
    });
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
