import { parentPort, workerData } from 'node:worker_threads';
import {
  buildPhase8TridiagonalCsr,
  createWasmSparseBackend,
} from '../src/index.js';
import { stableHash } from '../src/core/stableHash.js';

try {
  const config = normalizeConfig(workerData);
  const backend = await createWasmSparseBackend();
  const matrix = buildPhase8TridiagonalCsr(config.dofCount);
  const exact = Float64Array.from(
    { length: config.dofCount },
    (_, index) => 0.75 + Math.sin((index + 1) / 19),
  );
  const baseRhs = multiplyCsr(matrix, exact);
  const events = [];
  let maximumRelativeResidual = 0;

  for (let step = 0; step < config.solveCount; step += 1) {
    const scale = 1 + step / config.solveCount;
    const rhs = Float64Array.from(baseRhs, (value) => value * scale);
    const result = backend.solve(matrix, rhs, {
      matrixClass: 'spd',
      pivotTolerance: 1e-13,
      relativeTolerance: 1e-10,
    });
    if (!result.ok) throw workerError(result.reason || 'PARALLEL_WORKER_SOLVE_FAILED');
    const normalized = Array.from(result.x, (value) => value / scale);
    maximumRelativeResidual = Math.max(
      maximumRelativeResidual,
      Number(result.diagnostics?.relativeResidual || 0),
    );
    events.push({
      sequence: step + 1,
      kind: 'solve-completed',
      solutionHash: stableHash(normalized).slice(0, 24),
    });
  }

  const deterministicCore = {
    config,
    backend: {
      id: backend.id,
      executionTarget: backend.executionTarget,
      numericPrecision: backend.numericPrecision,
      deterministic: backend.deterministic === true,
    },
    matrix: { rowCount: matrix.rowCount, nnz: matrix.nnz },
    events,
  };
  parentPort.postMessage({
    ok: true,
    ...deterministicCore,
    maximumRelativeResidual,
    eventOrderingHash: stableHash(events).slice(0, 24),
    resultHash: stableHash(deterministicCore).slice(0, 24),
  });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    code: error?.code || 'PARALLEL_WORKER_FAILED',
    message: error?.message || String(error),
  });
}

function normalizeConfig(input = {}) {
  return {
    dofCount: positiveInteger(input.dofCount, 1024),
    solveCount: positiveInteger(input.solveCount, 12),
  };
}

function positiveInteger(value, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number <= 0) throw workerError('PARALLEL_WORKER_CONFIG_INVALID');
  return number;
}

function multiplyCsr(matrix, vector) {
  const result = new Float64Array(matrix.rowCount);
  for (let row = 0; row < matrix.rowCount; row += 1) {
    let sum = 0;
    for (let offset = matrix.rowPtr[row]; offset < matrix.rowPtr[row + 1]; offset += 1) {
      sum += matrix.values[offset] * vector[matrix.colIdx[offset]];
    }
    result[row] = sum;
  }
  return result;
}

function workerError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
