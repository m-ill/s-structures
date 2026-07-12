import { runRuntimePreflight } from './preflight.js';
import {
  WORKER_PROTOCOL_VERSION,
  WORKER_REQUEST_TYPES,
  WORKER_RESPONSE_TYPES,
  WORKER_TASK_TYPES,
  postProtocolMessage,
  protocolError,
  serializeProtocolError,
  validateWorkerRequest,
} from './protocol.js';

export const WORKER_CORE_VERSION = 'p8-m2-worker-core-v1';
export const WORKER_CANCELLATION_CODE = 'CANCELLED';

export class WorkerCancellationError extends Error {
  constructor(runToken, committedBoundary = 0) {
    super('Analysis run was cancelled at a committed boundary.');
    this.name = 'WorkerCancellationError';
    this.code = WORKER_CANCELLATION_CODE;
    this.runToken = runToken;
    this.committedBoundary = committedBoundary;
  }
}

export function createWorkerCore(options = {}) {
  const postTarget = options.postMessage || options.post || options.target;
  const taskHandler = options.taskHandler || options.handleTask || null;
  const backend = options.backend || null;
  const preflightHandler = options.preflight || options.preflightHandler || runRuntimePreflight;
  const yieldHandler = options.yieldControl || defaultYieldControl;
  const seenRunTokens = new Set();
  const seenRequestIds = new Set();
  let activeRun = null;
  let disposed = false;

  const api = {
    version: WORKER_CORE_VERSION,
    handleMessage,
    dispose,
    get activeRunToken() {
      return activeRun?.runToken || null;
    },
    get disposed() {
      return disposed;
    },
  };

  return Object.freeze(api);

  async function handleMessage(rawMessage) {
    const validated = validateWorkerRequest(rawMessage);
    if (!validated.ok) {
      emitError({
        requestId: validated.error.requestId,
        runToken: validated.error.runToken,
        error: validated.error,
        phase: 'protocol',
      });
      return { ok: false, code: validated.error.code };
    }

    const message = validated.message;
    if (seenRequestIds.has(message.requestId)) {
      emitError({
        requestId: message.requestId,
        runToken: message.runToken,
        error: protocolError('DUPLICATE_REQUEST_ID', `Request ID ${message.requestId} was already processed.`),
        phase: 'protocol',
      });
      return { ok: false, code: 'DUPLICATE_REQUEST_ID' };
    }
    seenRequestIds.add(message.requestId);

    if (message.type === WORKER_REQUEST_TYPES.cancel) return handleCancel(message);
    if (message.type === WORKER_REQUEST_TYPES.dispose) return handleDispose(message);
    return handleRun(message);
  }

  async function handleRun(message) {
    if (disposed) {
      emitError({
        requestId: message.requestId,
        runToken: message.runToken,
        error: protocolError('WORKER_DISPOSED', 'Worker runtime has been disposed.'),
        phase: 'runtime',
      });
      return { ok: false, code: 'WORKER_DISPOSED' };
    }
    if (seenRunTokens.has(message.runToken)) {
      emitError({
        requestId: message.requestId,
        runToken: message.runToken,
        error: protocolError('STALE_RUN_TOKEN', `Run token ${message.runToken} was already used.`),
        phase: 'protocol',
      });
      return { ok: false, code: 'STALE_RUN_TOKEN' };
    }
    if (activeRun) {
      emitError({
        requestId: message.requestId,
        runToken: message.runToken,
        error: protocolError('RUN_ALREADY_ACTIVE', `Run ${activeRun.runToken} is still active.`, {
          activeRunToken: activeRun.runToken,
        }),
        phase: 'runtime',
      });
      return { ok: false, code: 'RUN_ALREADY_ACTIVE' };
    }

    const run = {
      requestId: message.requestId,
      runToken: message.runToken,
      task: message.task,
      eventSequence: 0,
      progressSequence: 0,
      committedBoundary: 0,
      cancelRequested: false,
      cancelRequestId: null,
    };
    seenRunTokens.add(run.runToken);
    activeRun = run;

    let preflight = null;
    let phase = 'preflight';
    try {
      const preflightInput = buildPreflightInput(message, backend);
      if (preflightInput) {
        preflight = await preflightHandler(preflightInput);
        if (!preflight || typeof preflight !== 'object') {
          throw codedError('PREFLIGHT_RESULT_INVALID', 'Runtime preflight returned an invalid result.');
        }
        if (!preflight.ok) {
          emitError({
            requestId: run.requestId,
            runToken: run.runToken,
            sequence: 0,
            error: protocolError(preflight.code || 'PREFLIGHT_FAILED', preflightMessage(preflight.code), preflight),
            phase: 'preflight',
            preflight,
          });
          return { ok: false, code: preflight.code || 'PREFLIGHT_FAILED', preflight };
        }
      }

      post({
        protocolVersion: WORKER_PROTOCOL_VERSION,
        type: WORKER_RESPONSE_TYPES.accepted,
        requestId: run.requestId,
        runToken: run.runToken,
        sequence: 0,
        preflight,
      });

      phase = 'task';
      const context = createTaskContext(run);
      const result = await dispatchTask(run.task, context);
      if (run.cancelRequested) throw new WorkerCancellationError(run.runToken, run.committedBoundary);
      post({
        protocolVersion: WORKER_PROTOCOL_VERSION,
        type: WORKER_RESPONSE_TYPES.result,
        requestId: run.requestId,
        runToken: run.runToken,
        sequence: nextEventSequence(run),
        progressSequence: run.progressSequence,
        committedBoundary: run.committedBoundary,
        result: result ?? null,
      });
      return { ok: true, result: result ?? null };
    } catch (error) {
      if (error?.code === WORKER_CANCELLATION_CODE || run.cancelRequested) {
        post({
          protocolVersion: WORKER_PROTOCOL_VERSION,
          type: WORKER_RESPONSE_TYPES.cancelled,
          requestId: run.requestId,
          runToken: run.runToken,
          sequence: nextEventSequence(run),
          progressSequence: run.progressSequence,
          cancelRequestId: run.cancelRequestId,
          committedBoundary: run.committedBoundary,
          discardedUncommitted: true,
          effectiveAt: 'committed-boundary',
        });
        return { ok: false, code: WORKER_CANCELLATION_CODE };
      }
      emitError({
        requestId: run.requestId,
        runToken: run.runToken,
        sequence: nextEventSequence(run),
        error,
        phase,
      });
      return { ok: false, code: error?.code || 'WORKER_TASK_FAILED' };
    } finally {
      if (activeRun === run) activeRun = null;
    }
  }

  function handleCancel(message) {
    const run = activeRun;
    if (!run || run.runToken !== message.runToken) {
      emitError({
        requestId: message.requestId,
        runToken: message.runToken,
        error: protocolError('STALE_RUN_TOKEN', `Run token ${message.runToken} is not active.`, {
          activeRunToken: run?.runToken || null,
        }),
        phase: 'cancel',
      });
      return { ok: false, code: 'STALE_RUN_TOKEN' };
    }
    const alreadyRequested = run.cancelRequested;
    run.cancelRequested = true;
    run.cancelRequestId ||= message.requestId;
    post({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      type: WORKER_RESPONSE_TYPES.cancelAcknowledged,
      requestId: message.requestId,
      runToken: run.runToken,
      runRequestId: run.requestId,
      sequence: nextEventSequence(run),
      accepted: true,
      alreadyRequested,
      committedBoundary: run.committedBoundary,
      effectiveAt: 'committed-boundary',
    });
    return { ok: true, acknowledged: true, alreadyRequested };
  }

  function handleDispose(message) {
    disposed = true;
    if (activeRun) {
      activeRun.cancelRequested = true;
      activeRun.cancelRequestId ||= message.requestId;
    }
    post({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      type: WORKER_RESPONSE_TYPES.disposed,
      requestId: message.requestId,
      runToken: activeRun?.runToken || message.runToken || null,
      sequence: activeRun ? nextEventSequence(activeRun) : 0,
      activeRunCancelled: !!activeRun,
      effectiveAt: activeRun ? 'committed-boundary' : null,
    });
    return { ok: true, disposed: true };
  }

  function createTaskContext(run) {
    const cancellation = {};
    Object.defineProperties(cancellation, {
      requested: { enumerable: true, get: () => run.cancelRequested },
      aborted: { enumerable: true, get: () => run.cancelRequested },
      reason: {
        enumerable: true,
        get: () => run.cancelRequested
          ? { code: WORKER_CANCELLATION_CODE, effectiveAt: 'committed-boundary' }
          : null,
      },
    });

    const commitBoundary = (commitOrDetail = null, detail = null) => {
      if (run.cancelRequested) throw new WorkerCancellationError(run.runToken, run.committedBoundary);
      let value;
      if (typeof commitOrDetail === 'function') {
        value = commitOrDetail();
        if (value && typeof value.then === 'function') {
          throw codedError('COMMIT_BOUNDARY_MUST_BE_SYNCHRONOUS', 'commitBoundary callback must be synchronous.');
        }
      } else {
        detail = commitOrDetail;
      }
      run.committedBoundary += 1;
      return typeof commitOrDetail === 'function' ? value : detail;
    };

    return Object.freeze({
      version: WORKER_CORE_VERSION,
      runToken: run.runToken,
      requestId: run.requestId,
      backend,
      cancellation: Object.freeze(cancellation),
      signal: Object.freeze(cancellation),
      reportProgress(progress) {
        if (run.cancelRequested || activeRun !== run || disposed) return false;
        run.progressSequence += 1;
        post({
          protocolVersion: WORKER_PROTOCOL_VERSION,
          type: WORKER_RESPONSE_TYPES.progress,
          requestId: run.requestId,
          runToken: run.runToken,
          sequence: nextEventSequence(run),
          progressSequence: run.progressSequence,
          committedBoundary: run.committedBoundary,
          progress: normalizeProgress(progress),
        });
        return true;
      },
      commitBoundary,
      atCommittedBoundary: commitBoundary,
      isCancellationRequested() {
        return run.cancelRequested;
      },
      throwIfCancellationRequested() {
        if (run.cancelRequested) throw new WorkerCancellationError(run.runToken, run.committedBoundary);
      },
      yieldControl() {
        return yieldHandler();
      },
    });
  }

  async function dispatchTask(task, context) {
    if (backend && task.type === WORKER_TASK_TYPES.echo) {
      context.commitBoundary({ task: WORKER_TASK_TYPES.echo });
      return task.payload;
    }
    if (backend && task.type === WORKER_TASK_TYPES.solveSystem) {
      const payload = task.payload && typeof task.payload === 'object' ? task.payload : {};
      context.throwIfCancellationRequested();
      const result = await backend.solve(payload.matrix, payload.rhs, payload.options || {});
      context.commitBoundary({ task: WORKER_TASK_TYPES.solveSystem });
      return result;
    }
    if (typeof taskHandler === 'function') return taskHandler(task, context);
    if (task.type === WORKER_TASK_TYPES.solveSystem) {
      throw codedError('PRODUCTION_BACKEND_UNAVAILABLE', 'SOLVE_SYSTEM requires an injected production backend.');
    }
    throw codedError('WORKER_TASK_HANDLER_UNAVAILABLE', `No worker task handler is registered for ${task.type}.`);
  }

  function emitError({ requestId, runToken, sequence = null, error, phase, preflight = null }) {
    const serialized = serializeProtocolError(error, phase === 'task' ? 'WORKER_TASK_FAILED' : 'WORKER_RUNTIME_ERROR');
    post({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      type: WORKER_RESPONSE_TYPES.error,
      requestId: requestId || null,
      runToken: runToken || null,
      sequence,
      phase,
      code: serialized.code,
      message: serialized.message,
      error: serialized,
      preflight,
    });
  }

  function post(message) {
    return postProtocolMessage(postTarget, message);
  }

  function dispose() {
    disposed = true;
    if (activeRun) activeRun.cancelRequested = true;
  }
}

export const createAnalysisWorkerCore = createWorkerCore;

function buildPreflightInput(message, backend) {
  const explicit = message.preflight && typeof message.preflight === 'object' ? message.preflight : null;
  const solveTask = message.task.type === WORKER_TASK_TYPES.solveSystem;
  if (!explicit && !solveTask) return null;
  const payload = message.task.payload && typeof message.task.payload === 'object' ? message.task.payload : {};
  const matrix = payload.matrix;
  const rhs = payload.rhs;
  const dofCount = explicit?.dofCount
    ?? explicit?.activeDof
    ?? matrix?.colCount
    ?? matrix?.length
    ?? rhs?.length;
  const nnz = explicit?.nnz ?? matrix?.nnz ?? countDenseNonzeros(matrix);
  const solveOptions = payload.options && typeof payload.options === 'object' ? payload.options : {};
  return {
    ...(explicit || {}),
    dofCount,
    nnz,
    backendMode: explicit?.backendMode ?? explicit?.mode ?? solveOptions.backendMode ?? solveOptions.mode,
    production: explicit?.production ?? solveOptions.production,
    matrixClass: explicit?.matrixClass ?? solveOptions.matrixClass ?? 'spd',
    backend,
  };
}

function countDenseNonzeros(matrix) {
  if (!Array.isArray(matrix)) return undefined;
  let count = 0;
  for (const row of matrix) {
    if (!Array.isArray(row) && !ArrayBuffer.isView(row)) continue;
    for (const value of row) if (Number(value) !== 0) count += 1;
  }
  return count;
}

function normalizeProgress(progress) {
  if (progress == null) return null;
  if (typeof progress === 'string') return { stage: progress };
  if (typeof progress === 'number') return { value: progress };
  return progress;
}

function nextEventSequence(run) {
  run.eventSequence += 1;
  return run.eventSequence;
}

function codedError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function preflightMessage(code) {
  if (code === 'PRODUCTION_BACKEND_UNAVAILABLE') {
    return 'Production execution requires an injected production backend; reference fallback is forbidden.';
  }
  if (code === 'PREFLIGHT_MEMORY_LIMIT_EXCEEDED') return 'Estimated analysis memory exceeds the runtime hard limit.';
  return `Runtime preflight blocked the analysis: ${code || 'PREFLIGHT_FAILED'}.`;
}

function defaultYieldControl() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
