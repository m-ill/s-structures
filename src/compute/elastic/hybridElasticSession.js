import { stableHash } from '../../core/stableHash.js';
import {
  captureElasticCombinationSystems,
  resumeElasticCombinationSystems,
} from '../../solver/linear3d.js';
import { createMixedPrecisionSpdSession } from '../hybrid/mixedPrecisionSpd.js';

export const HYBRID_ELASTIC_SESSION_VERSION = 'p9-m5-hybrid-elastic-session-v1';

export function createHybridElasticSession(options = {}) {
  if (typeof options.gpuSessionFactory !== 'function') {
    throw hybridElasticError('HYBRID_ELASTIC_GPU_FACTORY_REQUIRED', 'A qualified GPU SPD session factory is required.');
  }
  const sessions = new Map();
  const seenGroupKeys = new Set();
  let disposedRows = [];
  let solveCount = 0;
  let reusedSolveCount = 0;
  let correctionSolveCount = 0;
  let failedSolveCount = 0;
  let disposed = false;

  return Object.freeze({
    version: HYBRID_ELASTIC_SESSION_VERSION,
    solveCapture,
    snapshot,
    dispose,
  });

  async function solveCapture(capture, solveOptions = {}) {
    if (disposed) return failedReplay(capture, 'HYBRID_ELASTIC_SESSION_DISPOSED');
    validateCapture(capture);
    solveCount += 1;
    if (capture.freeDofCount === 0) return trivialReplay(capture);
    const matrixHash = captureMatrixHash(capture.matrix);
    const key = stableHash({
      version: HYBRID_ELASTIC_SESSION_VERSION,
      factorGroupKey: capture.factorGroupKey,
      componentKey: capture.componentKey,
      matrixHash,
    });
    let row = sessions.get(key);
    if (!row) {
      const session = await createMixedPrecisionSpdSession(capture.matrix, {
        ...options,
        ...solveOptions,
        gpuSessionFactory: options.gpuSessionFactory,
        signal: solveOptions.signal,
      });
      row = {
        key,
        matrixHash,
        factorGroupKey: capture.factorGroupKey,
        componentKey: capture.componentKey,
        session,
        rhsCount: 0,
      };
      sessions.set(key, row);
      seenGroupKeys.add(capture.factorGroupKey);
    } else {
      reusedSolveCount += 1;
    }
    row.rhsCount += 1;
    const result = await row.session.solve(capture.rhs, { signal: solveOptions.signal });
    correctionSolveCount += Number(result.diagnostics?.correctionCount || 0);
    if (!result.ok) {
      failedSolveCount += 1;
      return failedReplay(capture, result.reason || 'HYBRID_ELASTIC_GPU_SOLVE_FAILED', result);
    }
    return Object.freeze({
      ...result,
      systemHash: capture.systemHash,
      factorGroupKey: capture.factorGroupKey,
      componentKey: capture.componentKey,
    });
  }

  function snapshot() {
    const rows = disposed ? disposedRows : sessionRows();
    return Object.freeze({
      version: HYBRID_ELASTIC_SESSION_VERSION,
      disposed,
      factorizationCount: rows.length,
      factorGroupCount: rows.length,
      combinationFactorGroupCount: seenGroupKeys.size,
      activeFactorCount: rows.length,
      solveCount,
      rhsChannelCount: solveCount,
      reusedSolveCount,
      correctionSolveCount,
      failedSolveCount,
      rows: Object.freeze(rows),
      resourceBalanced: disposed
        ? rows.every((row) => row.session?.disposed === true && row.session?.gpu?.resourceBalanced === true)
        : null,
      designTransferAllowed: false,
    });
  }

  async function dispose() {
    if (disposed) return snapshot();
    for (const row of sessions.values()) await row.session.dispose();
    disposedRows = sessionRows();
    sessions.clear();
    disposed = true;
    return snapshot();
  }

  function sessionRows() {
    return [...sessions.values()].map((row) => Object.freeze({
      factorGroupKey: row.factorGroupKey,
      componentKey: row.componentKey,
      matrixHash: row.matrixHash,
      rhsCount: row.rhsCount,
      session: row.session.snapshot(),
    }));
  }
}

export async function solveElasticCombinationHybrid(prepared, combo, options = {}) {
  if (!options.hybridSession?.solveCapture) {
    throw hybridElasticError('HYBRID_ELASTIC_SESSION_REQUIRED', 'A hybrid elastic session is required.');
  }
  if ((prepared.model.members || []).some((member) => ['tensionOnly', 'compressionOnly'].includes(member.behavior || member.type))) {
    throw hybridElasticError(
      'HYBRID_ELASTIC_UNILATERAL_UNSUPPORTED',
      'Unilateral active-set combinations are not qualified for the Phase 9 M5 GPU route.',
    );
  }
  const capture = captureElasticCombinationSystems(prepared, combo, {
    componentCache: options.componentCache,
    factorGroupKey: options.factorGroupKey,
    signal: options.signal,
  });
  if (!capture.ok) {
    throw hybridElasticError(capture.reason || 'HYBRID_ELASTIC_CAPTURE_FAILED', 'Elastic component systems could not be captured.', capture);
  }
  const precomputedSolutions = new Map();
  for (const system of capture.systemCaptures || []) {
    const replay = await options.hybridSession.solveCapture(system, { signal: options.signal });
    if (!replay.ok) {
      throw hybridElasticError(replay.reason || 'HYBRID_ELASTIC_GPU_SOLVE_FAILED', 'The qualified GPU elastic solve failed.', replay);
    }
    precomputedSolutions.set(system.componentKey, replay);
  }
  return resumeElasticCombinationSystems(prepared, combo, capture, precomputedSolutions);
}

function captureMatrixHash(matrix) {
  if (Array.isArray(matrix)) return stableHash(matrix);
  return stableHash({
    format: matrix?.format,
    rowCount: matrix?.rowCount,
    colCount: matrix?.colCount,
    colPtr: Array.from(matrix?.colPtr || []),
    rowIdx: Array.from(matrix?.rowIdx || []),
    values: Array.from(matrix?.values || []),
  });
}

function validateCapture(capture) {
  if (!capture?.componentKey || !capture?.factorGroupKey || !capture?.systemHash) {
    throw hybridElasticError('HYBRID_ELASTIC_CAPTURE_INVALID', 'The elastic component capture is incomplete.');
  }
  if (capture.freeDofCount > 0 && !capture.matrix) {
    throw hybridElasticError('HYBRID_ELASTIC_CAPTURE_MATRIX_REQUIRED', 'A free-DOF matrix is required.');
  }
}

function trivialReplay(capture) {
  return Object.freeze({
    ok: true,
    x: new Float64Array(),
    reason: null,
    systemHash: capture.systemHash,
    f64Residual: Object.freeze({
      ok: true,
      reason: null,
      residual: new Float64Array(),
      backwardError: 0,
      loadRelativeResidual: 0,
      equation: 'empty constrained system',
    }),
    diagnostics: Object.freeze({
      version: HYBRID_ELASTIC_SESSION_VERSION,
      route: 'empty-constrained-system',
      correctionCount: 0,
      fallback: false,
    }),
    designTransferAllowed: true,
  });
}

function failedReplay(capture, reason, details = null) {
  return Object.freeze({
    ok: false,
    x: null,
    reason,
    systemHash: capture?.systemHash || null,
    f64Residual: details?.f64Residual || null,
    diagnostics: details?.diagnostics || null,
    designTransferAllowed: false,
  });
}

function hybridElasticError(code, message, details = null) {
  return Object.assign(new Error(message), { code, details });
}
