import {
  COMPUTE_JOB_EVENT_TYPES,
  COMPUTE_WORKER_PROTOCOL_VERSION,
  collectComputeTransferables,
  createComputeCancelRequest,
  createComputeDisposeRequest,
  createComputeStartRequest,
  isComputeTerminalEvent,
} from './protocol.js';

export const COMPUTE_WORKER_CLIENT_VERSION = 'p9-compute-worker-client-v1';

export class ComputeJobError extends Error {
  constructor(code, message, detail = {}) {
    super(message || code || 'Compute job failed.');
    this.name = 'ComputeJobError';
    this.code = code || 'COMPUTE_JOB_FAILED';
    this.requestId = detail.requestId || null;
    this.runId = detail.runId || null;
    this.details = detail.details || null;
  }
}

export class ComputeJobCancelledError extends ComputeJobError {
  constructor(message = {}) {
    super('CANCELLED', 'Compute job was cancelled at a committed boundary.', {
      requestId: message.requestId,
      runId: message.runId,
      details: {
        committedBoundary: message.committedBoundary || 0,
        discardedUncommitted: message.discardedUncommitted === true,
      },
    });
    this.name = 'ComputeJobCancelledError';
    this.committedBoundary = message.committedBoundary || 0;
  }
}

export class ComputeWorkerClient {
  constructor(options = {}) {
    this.version = COMPUTE_WORKER_CLIENT_VERSION;
    this._options = options;
    this._worker = options.worker || createWorker(options);
    if (!this._worker || typeof this._worker.postMessage !== 'function') throw new ComputeJobError('COMPUTE_WORKER_UNAVAILABLE', 'A valid Worker is required.');
    this._counter = 0;
    this._active = null;
    this._cancelRequests = new Map();
    this._disposed = false;
    this._detach = attachListeners(this._worker, (message) => this._onMessage(message), (error) => this._onFailure(error));
  }

  get activeRunId() {
    return this._active?.runId || null;
  }

  start(plan, operationId, payload = null, options = {}) {
    if (this._disposed) return Promise.reject(new ComputeJobError('COMPUTE_CLIENT_DISPOSED', 'Compute client is disposed.'));
    if (this._active) return Promise.reject(new ComputeJobError('COMPUTE_RUN_ACTIVE', 'A compute run is already active.'));
    const requestId = options.requestId || this._nextId('request');
    const runId = plan?.runId;
    const request = createComputeStartRequest({ requestId, runId, plan, operationId, payload });
    const deferred = createDeferred();
    const promise = deferred.promise;
    Object.defineProperties(promise, {
      requestId: { value: requestId, enumerable: true },
      runId: { value: runId, enumerable: true },
      cancel: { value: () => this.cancel(runId), enumerable: false },
    });
    this._active = {
      requestId,
      runId,
      deferred,
      lastSequence: -1,
      progressSequence: 0,
      terminal: false,
      onProgress: typeof options.onProgress === 'function' ? options.onProgress : null,
    };
    try {
      this._post(request, options.transfer);
    } catch (error) {
      this._active = null;
      deferred.reject(runtimeError(error, request));
    }
    return promise;
  }

  cancel(runId = this.activeRunId, options = {}) {
    if (!runId) return Promise.reject(new ComputeJobError('COMPUTE_RUN_MISSING', 'No active run is available.'));
    const requestId = options.requestId || this._nextId('cancel');
    const deferred = createDeferred();
    this._cancelRequests.set(requestId, deferred);
    this._post(createComputeCancelRequest({ requestId, runId }), false);
    return deferred.promise;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    const requestId = this._nextId('dispose');
    try {
      this._post(createComputeDisposeRequest({ requestId, runId: this.activeRunId }), false);
    } catch {
      // Worker termination below is the final containment path.
    }
    const error = new ComputeJobError('COMPUTE_CLIENT_DISPOSED', 'Compute client is disposed.');
    if (this._active) this._active.deferred.reject(error);
    for (const deferred of this._cancelRequests.values()) deferred.reject(error);
    this._active = null;
    this._cancelRequests.clear();
    this._detach?.();
    this._detach = null;
    return this._worker.terminate?.();
  }

  _post(message, transferOption) {
    const transferables = transferOption === false
      ? []
      : collectComputeTransferables(message, Array.isArray(transferOption) ? transferOption : []);
    this._worker.postMessage(message, transferables);
  }

  _onMessage(raw) {
    const message = raw?.protocolVersion ? raw : raw?.data;
    if (!message || message.protocolVersion !== COMPUTE_WORKER_PROTOCOL_VERSION) return;
    const active = this._active;
    if (message.type === COMPUTE_JOB_EVENT_TYPES.cancelAcknowledged) {
      if (active && !this._recordSequence(active, message)) return;
      const deferred = this._cancelRequests.get(message.requestId);
      if (deferred) {
        this._cancelRequests.delete(message.requestId);
        deferred.resolve(message);
      }
      return;
    }
    if (!active || message.runId !== active.runId) return;
    if (message.requestId !== active.requestId) return;
    if (message.type === COMPUTE_JOB_EVENT_TYPES.error && message.sequence == null) {
      this._finish('reject', errorFromMessage(message));
      return;
    }
    if (!this._recordSequence(active, message)) return;
    if (message.type === COMPUTE_JOB_EVENT_TYPES.progress) {
      if (!Number.isInteger(message.progressSequence) || message.progressSequence <= active.progressSequence) {
        this._finish('reject', new ComputeJobError('COMPUTE_PROGRESS_SEQUENCE_INVALID', 'Progress sequence is not monotonic.', message));
        return;
      }
      active.progressSequence = message.progressSequence;
      active.onProgress?.(message.progress, message);
      this._options.onProgress?.(message.progress, message);
      return;
    }
    if (!isComputeTerminalEvent(message)) return;
    if (active.terminal) {
      this._finish('reject', new ComputeJobError('COMPUTE_TERMINAL_DUPLICATE', 'Multiple terminal events were received.', message));
      return;
    }
    active.terminal = true;
    if (message.type === COMPUTE_JOB_EVENT_TYPES.result) this._finish('resolve', this._options.returnEnvelope ? message : message.result);
    else if (message.type === COMPUTE_JOB_EVENT_TYPES.cancelled) this._finish('reject', new ComputeJobCancelledError(message));
    else this._finish('reject', errorFromMessage(message));
  }

  _recordSequence(active, message) {
    if (!Number.isInteger(message.sequence) || message.sequence <= active.lastSequence) {
      this._finish('reject', new ComputeJobError('COMPUTE_EVENT_SEQUENCE_INVALID', 'Worker event sequence is invalid.', message));
      return false;
    }
    active.lastSequence = message.sequence;
    return true;
  }

  _finish(action, value) {
    const active = this._active;
    if (!active) return;
    this._active = null;
    for (const [requestId, deferred] of this._cancelRequests) {
      this._cancelRequests.delete(requestId);
      deferred.reject(new ComputeJobError('COMPUTE_CANCEL_NOT_ACKNOWLEDGED', 'Run ended before cancel acknowledgement.', { requestId, runId: active.runId }));
    }
    active.deferred[action](value);
  }

  _onFailure(error) {
    const converted = runtimeError(error, this._active || {});
    if (this._active) this._finish('reject', converted);
    for (const deferred of this._cancelRequests.values()) deferred.reject(converted);
    this._cancelRequests.clear();
    this._options.onError?.(converted);
  }

  _nextId(prefix) {
    this._counter += 1;
    return prefix + '-' + this._counter;
  }
}

export function createComputeWorkerClient(options = {}) {
  return new ComputeWorkerClient(options);
}

function createWorker(options) {
  const url = options.workerUrl || new URL('./analysisWorker.js', import.meta.url);
  const workerOptions = { type: 'module', name: 's-structures-compute-worker', ...(options.workerOptions || {}) };
  if (typeof options.workerFactory === 'function') return options.workerFactory(url, workerOptions);
  if (typeof Worker === 'undefined') throw new ComputeJobError('COMPUTE_WORKER_UNAVAILABLE', 'Global Worker is unavailable; inject workerFactory.');
  return new Worker(url, workerOptions);
}

function attachListeners(worker, onMessage, onFailure) {
  if (typeof worker.addEventListener === 'function') {
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onFailure);
    worker.addEventListener('messageerror', onFailure);
    return () => {
      worker.removeEventListener?.('message', onMessage);
      worker.removeEventListener?.('error', onFailure);
      worker.removeEventListener?.('messageerror', onFailure);
    };
  }
  if (typeof worker.on === 'function') {
    worker.on('message', onMessage);
    worker.on('error', onFailure);
    worker.on('messageerror', onFailure);
    return () => {
      const off = typeof worker.off === 'function' ? worker.off.bind(worker) : worker.removeListener?.bind(worker);
      off?.('message', onMessage);
      off?.('error', onFailure);
      off?.('messageerror', onFailure);
    };
  }
  throw new ComputeJobError('COMPUTE_WORKER_EVENT_API_UNAVAILABLE', 'Worker has no supported event API.');
}

function errorFromMessage(message) {
  return new ComputeJobError(message.code || message.error?.code, message.message || message.error?.message, {
    requestId: message.requestId,
    runId: message.runId,
    details: message.error?.details,
  });
}

function runtimeError(error, detail) {
  return error instanceof ComputeJobError
    ? error
    : new ComputeJobError(error?.code || 'COMPUTE_WORKER_FAILURE', error?.message || String(error), detail);
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}
