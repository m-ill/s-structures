import { createResourceLedger } from '../telemetry/resourceLedger.js';
import { createComputeTelemetry } from '../telemetry/telemetry.js';
import {
  COMPUTE_JOB_EVENT_TYPES,
  COMPUTE_JOB_REQUEST_TYPES,
  COMPUTE_WORKER_PROTOCOL_VERSION,
  computeProtocolError,
  postComputeMessage,
  serializeComputeError,
  validateComputeJobRequest,
} from './protocol.js';

export const COMPUTE_WORKER_CORE_VERSION = 'p9-compute-worker-core-v1';
export const COMPUTE_CANCELLED_CODE = 'CANCELLED';

export class ComputeCancellationError extends Error {
  constructor(runId, committedBoundary = 0) {
    super('Compute job was cancelled at a committed boundary.');
    this.name = 'ComputeCancellationError';
    this.code = COMPUTE_CANCELLED_CODE;
    this.runId = runId;
    this.committedBoundary = committedBoundary;
  }
}

export function createComputeWorkerCore(options = {}) {
  const postTarget = options.postMessage || options.post || options.target;
  const executor = options.executor;
  const yieldControl = options.yieldControl || defaultYieldControl;
  const seenRequestIds = new Set();
  const seenRunIds = new Set();
  let active = null;
  let disposed = false;

  return Object.freeze({
    version: COMPUTE_WORKER_CORE_VERSION,
    handleMessage,
    get activeRunId() {
      return active?.runId || null;
    },
    get disposed() {
      return disposed;
    },
  });

  async function handleMessage(raw) {
    const validation = validateComputeJobRequest(raw);
    if (!validation.ok) {
      postError(validation.error.requestId, validation.error.runId, validation.error, 'protocol', null);
      return { ok: false, code: validation.error.code };
    }
    const message = validation.message;
    if (seenRequestIds.has(message.requestId)) {
      postError(message.requestId, message.runId, computeProtocolError('COMPUTE_REQUEST_DUPLICATE', 'requestId was already used.'), 'protocol', null);
      return { ok: false, code: 'COMPUTE_REQUEST_DUPLICATE' };
    }
    seenRequestIds.add(message.requestId);
    if (message.type === COMPUTE_JOB_REQUEST_TYPES.cancel) return cancel(message);
    if (message.type === COMPUTE_JOB_REQUEST_TYPES.dispose) return dispose(message);
    return start(message);
  }

  async function start(message) {
    if (disposed) {
      postError(message.requestId, message.runId, computeProtocolError('COMPUTE_WORKER_DISPOSED', 'Compute worker is disposed.'), 'runtime', null);
      return { ok: false, code: 'COMPUTE_WORKER_DISPOSED' };
    }
    if (active) {
      postError(message.requestId, message.runId, computeProtocolError('COMPUTE_RUN_ACTIVE', 'Another compute run is active.'), 'runtime', null);
      return { ok: false, code: 'COMPUTE_RUN_ACTIVE' };
    }
    if (seenRunIds.has(message.runId)) {
      postError(message.requestId, message.runId, computeProtocolError('COMPUTE_RUN_STALE', 'runId was already used.'), 'protocol', null);
      return { ok: false, code: 'COMPUTE_RUN_STALE' };
    }
    if (typeof executor !== 'function') {
      postError(message.requestId, message.runId, computeProtocolError('COMPUTE_EXECUTOR_UNAVAILABLE', 'Compute executor is unavailable.'), 'runtime', null);
      return { ok: false, code: 'COMPUTE_EXECUTOR_UNAVAILABLE' };
    }

    const run = {
      requestId: message.requestId,
      runId: message.runId,
      plan: message.plan,
      operationId: message.operationId,
      sequence: 0,
      progressSequence: 0,
      lastProgress: 0,
      committedBoundary: 0,
      cancelRequested: false,
      cancelRequestId: null,
      terminal: false,
      ledger: createResourceLedger({ runId: message.runId }),
      telemetry: createComputeTelemetry({ runId: message.runId }),
    };
    active = run;
    seenRunIds.add(run.runId);
    post({
      protocolVersion: COMPUTE_WORKER_PROTOCOL_VERSION,
      type: COMPUTE_JOB_EVENT_TYPES.accepted,
      requestId: run.requestId,
      runId: run.runId,
      sequence: 0,
      planHash: run.plan.planHash,
      operationId: run.operationId,
    });

    try {
      const context = createContext(run);
      const result = await executor({
        plan: run.plan,
        operation: run.plan.operations.find((row) => row.id === run.operationId),
        operationId: run.operationId,
        payload: message.payload,
      }, context);
      if (run.cancelRequested) throw new ComputeCancellationError(run.runId, run.committedBoundary);
      run.ledger.assertBalanced();
      terminal(run, COMPUTE_JOB_EVENT_TYPES.result, {
        result: result ?? null,
        resourceLedger: run.ledger.snapshot(),
        telemetry: run.telemetry.snapshot(),
      });
      return { ok: true, result: result ?? null };
    } catch (error) {
      if (error?.code === COMPUTE_CANCELLED_CODE || run.cancelRequested) {
        terminal(run, COMPUTE_JOB_EVENT_TYPES.cancelled, {
          cancelRequestId: run.cancelRequestId,
          committedBoundary: run.committedBoundary,
          discardedUncommitted: true,
          effectiveAt: 'committed-boundary',
        });
        return { ok: false, code: COMPUTE_CANCELLED_CODE };
      }
      terminal(run, COMPUTE_JOB_EVENT_TYPES.error, {
        phase: 'execute',
        error: serializeComputeError(error, 'COMPUTE_EXECUTION_FAILED'),
      });
      return { ok: false, code: error?.code || 'COMPUTE_EXECUTION_FAILED' };
    } finally {
      await run.ledger.disposeAll().catch(() => {});
      if (active === run) active = null;
    }
  }

  function cancel(message) {
    if (!active || active.runId !== message.runId) {
      postError(message.requestId, message.runId, computeProtocolError('COMPUTE_RUN_STALE', 'runId is not active.'), 'cancel', null);
      return { ok: false, code: 'COMPUTE_RUN_STALE' };
    }
    const alreadyRequested = active.cancelRequested;
    active.cancelRequested = true;
    active.cancelRequestId ||= message.requestId;
    post({
      protocolVersion: COMPUTE_WORKER_PROTOCOL_VERSION,
      type: COMPUTE_JOB_EVENT_TYPES.cancelAcknowledged,
      requestId: message.requestId,
      runRequestId: active.requestId,
      runId: active.runId,
      sequence: nextSequence(active),
      committedBoundary: active.committedBoundary,
      accepted: true,
      alreadyRequested,
      effectiveAt: 'committed-boundary',
    });
    return { ok: true, alreadyRequested };
  }

  function dispose(message) {
    disposed = true;
    if (active) {
      active.cancelRequested = true;
      active.cancelRequestId ||= message.requestId;
    }
    post({
      protocolVersion: COMPUTE_WORKER_PROTOCOL_VERSION,
      type: COMPUTE_JOB_EVENT_TYPES.disposed,
      requestId: message.requestId,
      runId: active?.runId || message.runId || null,
      sequence: active ? nextSequence(active) : 0,
      activeRunCancelled: Boolean(active),
    });
    return { ok: true, disposed: true };
  }

  function createContext(run) {
    const signal = {};
    Object.defineProperties(signal, {
      aborted: { enumerable: true, get: () => run.cancelRequested },
      reason: { enumerable: true, get: () => run.cancelRequested ? { code: COMPUTE_CANCELLED_CODE } : null },
    });
    return Object.freeze({
      version: COMPUTE_WORKER_CORE_VERSION,
      runId: run.runId,
      planHash: run.plan.planHash,
      operationId: run.operationId,
      signal: Object.freeze(signal),
      resourceLedger: run.ledger,
      telemetry: run.telemetry,
      reportProgress(progress = {}) {
        if (run.cancelRequested || run.terminal || active !== run) return false;
        const value = progressValue(progress);
        if (value != null && value < run.lastProgress) {
          throw workerError('COMPUTE_PROGRESS_NOT_MONOTONIC', 'Progress value moved backwards.');
        }
        if (value != null) run.lastProgress = value;
        run.progressSequence += 1;
        post({
          protocolVersion: COMPUTE_WORKER_PROTOCOL_VERSION,
          type: COMPUTE_JOB_EVENT_TYPES.progress,
          requestId: run.requestId,
          runId: run.runId,
          sequence: nextSequence(run),
          progressSequence: run.progressSequence,
          committedBoundary: run.committedBoundary,
          progress,
        });
        return true;
      },
      commitBoundary(detail = null) {
        throwIfCancelled(run);
        run.committedBoundary += 1;
        return { committedBoundary: run.committedBoundary, detail };
      },
      throwIfCancelled() {
        throwIfCancelled(run);
      },
      yieldControl,
    });
  }

  function terminal(run, type, detail) {
    if (run.terminal) throw workerError('COMPUTE_TERMINAL_DUPLICATE', 'Compute run already emitted a terminal event.');
    run.terminal = true;
    post({
      protocolVersion: COMPUTE_WORKER_PROTOCOL_VERSION,
      type,
      requestId: run.requestId,
      runId: run.runId,
      sequence: nextSequence(run),
      progressSequence: run.progressSequence,
      committedBoundary: run.committedBoundary,
      planHash: run.plan.planHash,
      operationId: run.operationId,
      ...detail,
    });
  }

  function postError(requestId, runId, error, phase, sequence) {
    const serialized = serializeComputeError(error);
    post({
      protocolVersion: COMPUTE_WORKER_PROTOCOL_VERSION,
      type: COMPUTE_JOB_EVENT_TYPES.error,
      requestId: requestId || null,
      runId: runId || null,
      sequence,
      phase,
      error: serialized,
      code: serialized.code,
      message: serialized.message,
    });
  }

  function post(message) {
    return postComputeMessage(postTarget, message);
  }
}

function throwIfCancelled(run) {
  if (run.cancelRequested) throw new ComputeCancellationError(run.runId, run.committedBoundary);
}

function progressValue(progress) {
  const candidate = progress.value ?? progress.fraction ?? progress.ratio;
  if (candidate == null) return null;
  const value = Number(candidate);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw workerError('COMPUTE_PROGRESS_INVALID', 'Progress value must be between zero and one.');
  return value;
}

function nextSequence(run) {
  run.sequence += 1;
  return run.sequence;
}

function workerError(code, message) {
  return Object.assign(new Error(message), { code });
}

function defaultYieldControl() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
