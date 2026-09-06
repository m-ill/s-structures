import {
  WORKER_PROTOCOL_VERSION,
  WORKER_RESPONSE_TYPES,
  collectTransferables,
  createCancelRequest,
  createRunRequest,
} from './protocol.js';

export const WORKER_CLIENT_VERSION = 'p8-m2-worker-client-v1';

export class WorkerRuntimeError extends Error {
  constructor(code, message, detail = {}) {
    super(message || code || 'Worker runtime error.');
    this.name = 'WorkerRuntimeError';
    this.code = code || 'WORKER_RUNTIME_ERROR';
    this.requestId = detail.requestId || null;
    this.runToken = detail.runToken || null;
    this.phase = detail.phase || null;
    this.preflight = detail.preflight || null;
    this.details = detail.details || null;
  }
}

export class WorkerRunCancelledError extends WorkerRuntimeError {
  constructor(message = {}) {
    super('CANCELLED', 'Analysis run was cancelled at a committed boundary.', {
      requestId: message.requestId,
      runToken: message.runToken,
      details: {
        committedBoundary: message.committedBoundary ?? 0,
        discardedUncommitted: message.discardedUncommitted === true,
        effectiveAt: message.effectiveAt || 'committed-boundary',
      },
    });
    this.name = 'WorkerRunCancelledError';
    this.committedBoundary = message.committedBoundary ?? 0;
  }
}

export class AnalysisWorkerClient {
  constructor(options = {}) {
    if (typeof options === 'function') options = { workerFactory: options };
    this.version = WORKER_CLIENT_VERSION;
    this._options = options;
    this._requestCounter = 0;
    this._runCounter = 0;
    this._usedRequestIds = new Set();
    this._usedRunTokens = new Set();
    this._active = null;
    this._cancelRequests = new Map();
    this._disposed = false;
    this._worker = options.worker || createWorker(options);
    if (!this._worker || typeof this._worker.postMessage !== 'function') {
      throw new WorkerRuntimeError('WORKER_UNAVAILABLE', 'Worker factory did not return a valid Worker.');
    }
    this._detachListeners = attachWorkerListeners(
      this._worker,
      (message) => this._handleMessage(message),
      (error) => this._handleWorkerFailure(error),
    );
  }

  get worker() {
    return this._worker;
  }

  get activeRunToken() {
    return this._active?.runToken || null;
  }

  get disposed() {
    return this._disposed;
  }

  run(taskOrDescriptor, payloadOrOptions = null, maybeOptions = {}) {
    if (this._disposed) return rejected('WORKER_CLIENT_DISPOSED', 'Worker client has been disposed.');
    if (this._active) return rejected('RUN_ALREADY_ACTIVE', `Run ${this._active.runToken} is still active.`);
    const parsed = parseRunArguments(taskOrDescriptor, payloadOrOptions, maybeOptions);
    const options = parsed.options;
    const runToken = identifier(options.runToken) || this._nextRunToken();
    const requestId = identifier(options.requestId) || this._nextRequestId();
    this._usedRunTokens.add(runToken);
    this._usedRequestIds.add(requestId);
    const request = createRunRequest({
      requestId,
      runToken,
      task: parsed.task,
      preflight: options.preflight ?? parsed.preflight,
    });
    if (!request.task) return rejected('TASK_TYPE_REQUIRED', 'run() requires a task type.');

    const deferred = createDeferred();
    const promise = deferred.promise;
    Object.defineProperties(promise, {
      runToken: { value: runToken, enumerable: true },
      requestId: { value: requestId, enumerable: true },
      cancel: { value: () => this.cancel(runToken), enumerable: false },
    });
    this._active = {
      requestId,
      runToken,
      deferred,
      onProgress: typeof options.onProgress === 'function' ? options.onProgress : null,
      accepted: false,
      lastSequence: -1,
      progressSequence: 0,
    };

    try {
      this._post(request, options.transfer);
    } catch (error) {
      this._active = null;
      deferred.reject(toRuntimeError(error, request));
    }
    return promise;
  }

  cancel(runTokenOrOptions = null, maybeOptions = {}) {
    if (this._disposed) return rejected('WORKER_CLIENT_DISPOSED', 'Worker client has been disposed.');
    const options = runTokenOrOptions && typeof runTokenOrOptions === 'object'
      ? runTokenOrOptions
      : maybeOptions;
    const runToken = identifier(
      runTokenOrOptions && typeof runTokenOrOptions !== 'object' ? runTokenOrOptions : options.runToken,
    ) || this.activeRunToken;
    if (!runToken) return rejected('NO_ACTIVE_RUN', 'No active run is available to cancel.');
    const requestId = identifier(options.requestId) || this._nextRequestId();
    this._usedRequestIds.add(requestId);
    const request = createCancelRequest({ requestId, runToken });
    const deferred = createDeferred();
    this._cancelRequests.set(requestId, { deferred, runToken });
    try {
      this._post(request, false);
    } catch (error) {
      this._cancelRequests.delete(requestId);
      deferred.reject(toRuntimeError(error, request));
    }
    Object.defineProperties(deferred.promise, {
      runToken: { value: runToken, enumerable: true },
      requestId: { value: requestId, enumerable: true },
    });
    return deferred.promise;
  }

  dispose() {
    if (this._disposed) return undefined;
    this._disposed = true;
    const error = new WorkerRuntimeError('WORKER_CLIENT_DISPOSED', 'Worker client has been disposed.');
    if (this._active) {
      this._active.deferred.reject(error);
      this._active = null;
    }
    for (const { deferred } of this._cancelRequests.values()) deferred.reject(error);
    this._cancelRequests.clear();
    this._detachListeners?.();
    this._detachListeners = null;
    return typeof this._worker.terminate === 'function' ? this._worker.terminate() : undefined;
  }

  _nextRequestId() {
    let requestId;
    do {
      this._requestCounter += 1;
      requestId = `request-${this._requestCounter}`;
    } while (this._usedRequestIds.has(requestId));
    return requestId;
  }

  _nextRunToken() {
    let runToken;
    do {
      this._runCounter += 1;
      runToken = `run-${this._runCounter}`;
    } while (this._usedRunTokens.has(runToken));
    return runToken;
  }

  _post(message, transferOption) {
    const transferables = transferOption === false
      ? []
      : collectTransferables(message, Array.isArray(transferOption) ? transferOption : []);
    this._worker.postMessage(message, transferables);
  }

  _handleMessage(rawMessage) {
    const message = rawMessage?.protocolVersion ? rawMessage : rawMessage?.data;
    if (!message || message.protocolVersion !== WORKER_PROTOCOL_VERSION) return;
    invokeCallback(this._options.onMessage, message, null, this._options.onCallbackError);

    if (message.type === WORKER_RESPONSE_TYPES.cancelAcknowledged) {
      this._recordSequence(message);
      const pending = this._cancelRequests.get(message.requestId);
      if (pending) {
        this._cancelRequests.delete(message.requestId);
        pending.deferred.resolve(message);
      }
      return;
    }

    if (message.type === WORKER_RESPONSE_TYPES.error) {
      const error = errorFromMessage(message);
      const pendingCancel = this._cancelRequests.get(message.requestId);
      if (pendingCancel) {
        this._cancelRequests.delete(message.requestId);
        pendingCancel.deferred.reject(error);
        if (message.code !== 'STALE_RUN_TOKEN' || message.runToken !== this.activeRunToken) return;
      }
      if (this._active && message.runToken === this._active.runToken) this._finishActive('reject', error);
      else this._notifyError(error);
      return;
    }

    const active = this._active;
    if (!active || message.runToken !== active.runToken || message.requestId !== active.requestId) return;
    if (!this._recordSequence(message)) return;

    if (message.type === WORKER_RESPONSE_TYPES.accepted) {
      active.accepted = true;
      invokeCallback(this._options.onAccepted, message, null, this._options.onCallbackError);
      return;
    }
    if (message.type === WORKER_RESPONSE_TYPES.progress) {
      const expected = active.progressSequence + 1;
      if (message.progressSequence !== expected) {
        this._finishActive('reject', new WorkerRuntimeError(
          'PROGRESS_SEQUENCE_INVALID',
          `Expected progress sequence ${expected}, received ${String(message.progressSequence)}.`,
          { requestId: active.requestId, runToken: active.runToken },
        ));
        return;
      }
      active.progressSequence = message.progressSequence;
      invokeCallback(active.onProgress, message.progress, message, this._options.onCallbackError);
      invokeCallback(this._options.onProgress, message.progress, message, this._options.onCallbackError);
      return;
    }
    if (message.type === WORKER_RESPONSE_TYPES.result) {
      this._finishActive('resolve', this._options.returnEnvelope ? message : message.result);
      return;
    }
    if (message.type === WORKER_RESPONSE_TYPES.cancelled) {
      this._finishActive('reject', new WorkerRunCancelledError(message));
    }
  }

  _recordSequence(message) {
    const active = this._active;
    if (!active || message.runToken !== active.runToken || !Number.isInteger(message.sequence)) return true;
    if (message.sequence <= active.lastSequence) {
      this._finishActive('reject', new WorkerRuntimeError(
        'EVENT_SEQUENCE_INVALID',
        `Worker event sequence ${message.sequence} is not greater than ${active.lastSequence}.`,
        { requestId: active.requestId, runToken: active.runToken },
      ));
      return false;
    }
    active.lastSequence = message.sequence;
    return true;
  }

  _finishActive(action, value) {
    const active = this._active;
    if (!active) return;
    this._active = null;
    for (const [requestId, pending] of this._cancelRequests) {
      if (pending.runToken !== active.runToken) continue;
      this._cancelRequests.delete(requestId);
      pending.deferred.reject(new WorkerRuntimeError(
        'RUN_FINISHED_BEFORE_CANCEL_ACKNOWLEDGEMENT',
        'Run finished before cancellation was acknowledged.',
        { requestId, runToken: active.runToken },
      ));
    }
    active.deferred[action](value);
  }

  _handleWorkerFailure(error) {
    const runtimeError = toRuntimeError(error, this._active || {});
    if (this._active) this._finishActive('reject', runtimeError);
    for (const { deferred } of this._cancelRequests.values()) deferred.reject(runtimeError);
    this._cancelRequests.clear();
    this._notifyError(runtimeError);
  }

  _notifyError(error) {
    invokeCallback(this._options.onError, error, null, this._options.onCallbackError);
  }
}

export function createWorkerClient(options = {}) {
  return new AnalysisWorkerClient(options);
}

export const createAnalysisWorkerClient = createWorkerClient;

function createWorker(options) {
  const url = options.workerUrl || new URL('./analysisWorker.js', import.meta.url);
  const workerOptions = { type: 'module', name: 'dcr-analysis-worker', ...(options.workerOptions || {}) };
  if (typeof options.workerFactory === 'function') return options.workerFactory(url, workerOptions);
  if (typeof Worker === 'undefined') {
    throw new WorkerRuntimeError('WORKER_UNAVAILABLE', 'Global Worker is unavailable; inject workerFactory in this environment.');
  }
  return new Worker(url, workerOptions);
}

function attachWorkerListeners(worker, onMessage, onFailure) {
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
    const onExit = (exitCode) => {
      const error = new Error(`Worker exited with code ${exitCode}.`);
      error.code = 'WORKER_EXITED';
      error.exitCode = exitCode;
      onFailure(error);
    };
    worker.on('message', onMessage);
    worker.on('error', onFailure);
    worker.on('messageerror', onFailure);
    worker.on('exit', onExit);
    return () => {
      const off = typeof worker.off === 'function' ? worker.off.bind(worker) : worker.removeListener?.bind(worker);
      off?.('message', onMessage);
      off?.('error', onFailure);
      off?.('messageerror', onFailure);
      off?.('exit', onExit);
    };
  }
  throw new WorkerRuntimeError('WORKER_EVENT_API_UNAVAILABLE', 'Worker does not expose an event listener API.');
}

function parseRunArguments(taskOrDescriptor, payloadOrOptions, maybeOptions) {
  if (taskOrDescriptor && typeof taskOrDescriptor === 'object' && !ArrayBuffer.isView(taskOrDescriptor)) {
    const descriptor = taskOrDescriptor;
    const options = payloadOrOptions && typeof payloadOrOptions === 'object' ? payloadOrOptions : {};
    const descriptorTask = typeof descriptor.task === 'string'
      ? { type: descriptor.task, payload: descriptor.payload ?? null }
      : descriptor.task && typeof descriptor.task === 'object'
        ? {
          ...descriptor.task,
          payload: Object.prototype.hasOwnProperty.call(descriptor.task, 'payload')
            ? descriptor.task.payload
            : descriptor.payload ?? null,
        }
        : null;
    return {
      task: descriptorTask || {
        type: descriptor.type ?? descriptor.kind ?? descriptor.operation,
        payload: Object.prototype.hasOwnProperty.call(descriptor, 'payload') ? descriptor.payload : null,
      },
      preflight: descriptor.preflight ?? null,
      options,
    };
  }
  return {
    task: { type: taskOrDescriptor, payload: payloadOrOptions },
    preflight: null,
    options: maybeOptions || {},
  };
}

function errorFromMessage(message) {
  const detail = message.error?.details || null;
  return new WorkerRuntimeError(
    message.code || message.error?.code,
    message.message || message.error?.message,
    {
      requestId: message.requestId,
      runToken: message.runToken,
      phase: message.phase,
      preflight: message.preflight,
      details: detail,
    },
  );
}

function toRuntimeError(error, detail = {}) {
  if (error instanceof WorkerRuntimeError) return error;
  return new WorkerRuntimeError(error?.code || 'WORKER_FAILURE', error?.message || String(error), {
    requestId: detail.requestId,
    runToken: detail.runToken,
    details: error?.details,
  });
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

function rejected(code, message) {
  return Promise.reject(new WorkerRuntimeError(code, message));
}

function identifier(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function invokeCallback(callback, first, second, onCallbackError) {
  if (typeof callback !== 'function') return;
  try {
    callback(first, second);
  } catch (error) {
    if (typeof onCallbackError === 'function') onCallbackError(error);
  }
}
