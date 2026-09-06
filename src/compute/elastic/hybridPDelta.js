import { stableHash } from '../../core/stableHash.js';
import {
  assemblePartitionedTangentSolution,
  buildPartitionedTangentSystem,
} from '../../solver/pdelta/secondOrder.js';
import { createMixedPrecisionSpdSession } from '../hybrid/mixedPrecisionSpd.js';

export const HYBRID_PDELTA_TANGENT_VERSION = 'p9-m5-hybrid-pdelta-tangent-v1';

export function createHybridPDeltaTangentSolver(options = {}) {
  if (typeof options.gpuSessionFactory !== 'function') {
    throw pDeltaHybridError('HYBRID_PDELTA_GPU_FACTORY_REQUIRED', 'A qualified GPU SPD session factory is required.');
  }
  const rows = [];
  let solveCount = 0;
  let correctionSolveCount = 0;
  let failedSolveCount = 0;
  let disposed = false;

  return Object.freeze({
    version: HYBRID_PDELTA_TANGENT_VERSION,
    solve,
    snapshot,
    dispose,
  });

  async function solve(request = {}) {
    if (disposed) throw pDeltaHybridError('HYBRID_PDELTA_TANGENT_SOLVER_DISPOSED', 'The hybrid Direct P-Delta solver is disposed.');
    const system = buildPartitionedTangentSystem(request.K, request.F, request.Dc, request.free, request.fixedDofs);
    solveCount += 1;
    if (!system.free.length) return assemblePartitionedTangentSolution(system, [], emptyDiagnostics(request));
    let session = null;
    let result = null;
    let afterDispose = null;
    let completed = false;
    let failureRecorded = false;
    try {
      session = await createMixedPrecisionSpdSession(system.Kff, {
        ...options,
        gpuSessionFactory: options.gpuSessionFactory,
        signal: options.signal,
      });
      result = await session.solve(system.Ff, { signal: options.signal });
      correctionSolveCount += Number(result.diagnostics?.correctionCount || 0);
      if (!result.ok) {
        failedSolveCount += 1;
        failureRecorded = true;
        throw pDeltaHybridError(result.reason || 'HYBRID_PDELTA_TANGENT_SOLVE_FAILED', 'The Direct P-Delta GPU tangent solve failed.', result);
      }
      const solution = assemblePartitionedTangentSolution(system, result.x, {
        ...result.diagnostics,
        version: HYBRID_PDELTA_TANGENT_VERSION,
        method: 'p9-m5-direct-pdelta-mixed-f32-f64',
        step: request.step,
        iteration: request.iteration,
        lambda: request.lambda,
        tangentSessionReused: false,
        tangentInvalidation: 'new-Kt-invalidates-previous-gpu-session',
        f64Residual: result.f64Residual,
        designTransferAllowed: result.designTransferAllowed,
      });
      completed = true;
      return solution;
    } catch (error) {
      if (!failureRecorded) failedSolveCount += 1;
      throw error;
    } finally {
      if (session) afterDispose = await session.dispose();
      rows.push(Object.freeze({
        step: request.step ?? null,
        iteration: request.iteration ?? null,
        lambda: request.lambda ?? null,
        matrixHash: session?.prepared?.valueHash || stableHash(system.Kff),
        ok: completed,
        correctionCount: Number(result?.diagnostics?.correctionCount || 0),
        f64BackwardError: result?.f64Residual?.backwardError ?? null,
        resourceBalanced: afterDispose?.gpu?.resourceBalanced === true,
      }));
    }
  }

  function snapshot() {
    return Object.freeze({
      version: HYBRID_PDELTA_TANGENT_VERSION,
      disposed,
      solveCount,
      matrixSessionCount: rows.length,
      reusedMatrixSessionCount: 0,
      correctionSolveCount,
      failedSolveCount,
      tangentInvalidation: 'every-tangent-rebuild',
      rows: Object.freeze([...rows]),
      resourceBalanced: rows.every((row) => row.resourceBalanced === true),
      designTransferAllowed: false,
    });
  }

  function dispose() {
    disposed = true;
    return snapshot();
  }
}

function emptyDiagnostics(request) {
  return {
    version: HYBRID_PDELTA_TANGENT_VERSION,
    method: 'empty-constrained-system',
    step: request.step,
    iteration: request.iteration,
    lambda: request.lambda,
    tangentSessionReused: false,
    designTransferAllowed: true,
  };
}

function pDeltaHybridError(code, message, details = null) {
  return Object.assign(new Error(message), { code, details });
}
