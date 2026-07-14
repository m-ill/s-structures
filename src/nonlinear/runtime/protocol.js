export const WORKER_PROTOCOL_VERSION = 'p8-m8-worker-protocol-v3';

export const WORKER_REQUEST_TYPES = Object.freeze({
  run: 'RUN',
  cancel: 'CANCEL',
  dispose: 'DISPOSE',
});

export const WORKER_RESPONSE_TYPES = Object.freeze({
  accepted: 'RUN_ACCEPTED',
  progress: 'PROGRESS',
  result: 'RESULT',
  error: 'ERROR',
  cancelAcknowledged: 'CANCEL_ACKNOWLEDGED',
  cancelled: 'CANCELLED',
  disposed: 'DISPOSED',
});

export const WORKER_TASK_TYPES = Object.freeze({
  echo: 'ECHO',
  solveSystem: 'SOLVE_SYSTEM',
  buildFiberPmm: 'BUILD_FIBER_PMM',
  runMdofNlth: 'RUN_MDOF_NLTH',
});

const REQUEST_TYPE_ALIASES = new Map([
  ['RUN', WORKER_REQUEST_TYPES.run],
  ['CANCEL', WORKER_REQUEST_TYPES.cancel],
  ['DISPOSE', WORKER_REQUEST_TYPES.dispose],
]);

const TASK_TYPE_ALIASES = new Map([
  ['ECHO', WORKER_TASK_TYPES.echo],
  ['SOLVE_SYSTEM', WORKER_TASK_TYPES.solveSystem],
  ['SOLVE-SYSTEM', WORKER_TASK_TYPES.solveSystem],
  ['BUILD_FIBER_PMM', WORKER_TASK_TYPES.buildFiberPmm],
  ['BUILD-FIBER-PMM', WORKER_TASK_TYPES.buildFiberPmm],
  ['RUN_MDOF_NLTH', WORKER_TASK_TYPES.runMdofNlth],
  ['RUN-MDOF-NLTH', WORKER_TASK_TYPES.runMdofNlth],
]);

export function createRunRequest(input = {}) {
  const task = normalizeWorkerTask(input.task ?? input.operation, input.payload);
  return {
    protocolVersion: WORKER_PROTOCOL_VERSION,
    type: WORKER_REQUEST_TYPES.run,
    requestId: normalizeIdentifier(input.requestId),
    runToken: normalizeIdentifier(input.runToken),
    task,
    preflight: input.preflight ?? null,
  };
}

export function createCancelRequest(input = {}) {
  return {
    protocolVersion: WORKER_PROTOCOL_VERSION,
    type: WORKER_REQUEST_TYPES.cancel,
    requestId: normalizeIdentifier(input.requestId),
    runToken: normalizeIdentifier(input.runToken),
  };
}

export function createDisposeRequest(input = {}) {
  return {
    protocolVersion: WORKER_PROTOCOL_VERSION,
    type: WORKER_REQUEST_TYPES.dispose,
    requestId: normalizeIdentifier(input.requestId),
    runToken: input.runToken == null ? null : normalizeIdentifier(input.runToken),
  };
}

export function normalizeWorkerTask(task, payload) {
  if (typeof task === 'string') {
    return { type: normalizeTaskType(task), payload: payload ?? null };
  }
  if (!task || typeof task !== 'object' || Array.isArray(task)) return null;
  const type = normalizeTaskType(task.type ?? task.kind ?? task.operation);
  if (!type) return null;
  return {
    type,
    payload: Object.prototype.hasOwnProperty.call(task, 'payload') ? task.payload : payload ?? null,
  };
}

export function validateWorkerRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalid('INVALID_PROTOCOL_MESSAGE', 'Worker request must be an object.');
  }
  if (value.protocolVersion !== WORKER_PROTOCOL_VERSION) {
    return invalid('PROTOCOL_VERSION_UNSUPPORTED', `Unsupported worker protocol version: ${String(value.protocolVersion)}.`);
  }
  const type = normalizeRequestType(value.type);
  if (!type) return invalid('REQUEST_TYPE_UNSUPPORTED', `Unsupported worker request type: ${String(value.type || '(missing)')}.`);
  const requestId = normalizeIdentifier(value.requestId);
  if (!requestId) return invalid('REQUEST_ID_REQUIRED', 'Worker request requires a non-empty requestId.');

  if (type === WORKER_REQUEST_TYPES.dispose) {
    return {
      ok: true,
      message: createDisposeRequest({ requestId, runToken: value.runToken }),
      error: null,
    };
  }

  const runToken = normalizeIdentifier(value.runToken);
  if (!runToken) return invalid('RUN_TOKEN_REQUIRED', 'Worker request requires a non-empty runToken.', requestId);
  if (type === WORKER_REQUEST_TYPES.cancel) {
    return { ok: true, message: createCancelRequest({ requestId, runToken }), error: null };
  }

  const task = normalizeWorkerTask(value.task ?? value.operation, value.payload);
  if (!task?.type) return invalid('TASK_TYPE_REQUIRED', 'RUN request requires a task type.', requestId, runToken);
  return {
    ok: true,
    message: createRunRequest({
      requestId,
      runToken,
      task,
      preflight: value.preflight,
    }),
    error: null,
  };
}

export function protocolError(code, message, details = null) {
  return {
    code: normalizeIdentifier(code) || 'WORKER_RUNTIME_ERROR',
    message: typeof message === 'string' && message ? message : 'Worker runtime error.',
    details: details ?? null,
  };
}

export function serializeProtocolError(error, fallbackCode = 'WORKER_RUNTIME_ERROR') {
  if (typeof error === 'string') return protocolError(fallbackCode, error);
  const code = normalizeIdentifier(error?.code) || fallbackCode;
  const message = typeof error?.message === 'string' && error.message
    ? error.message
    : code === 'CANCELLED' ? 'Analysis run was cancelled.' : 'Worker runtime error.';
  const details = error?.details ?? null;
  return protocolError(code, message, details);
}

export function collectTransferables(value, initial = []) {
  const transferables = [];
  const included = new Set();
  const visited = new Set();

  for (const item of initial || []) addTransferable(item, transferables, included);
  visit(value);
  return transferables;

  function visit(item) {
    if (item == null || (typeof item !== 'object' && typeof item !== 'function')) return;
    if (isArrayBuffer(item)) {
      addTransferable(item, transferables, included);
      return;
    }
    if (ArrayBuffer.isView(item)) {
      addTransferable(item.buffer, transferables, included);
      return;
    }
    if (visited.has(item)) return;
    visited.add(item);
    if (Array.isArray(item)) {
      for (const entry of item) visit(entry);
      return;
    }
    if (item instanceof Map) {
      for (const [key, entry] of item) {
        visit(key);
        visit(entry);
      }
      return;
    }
    if (item instanceof Set) {
      for (const entry of item) visit(entry);
      return;
    }
    for (const key of Object.keys(item).sort()) visit(item[key]);
  }
}

export function postProtocolMessage(target, message, transferables = null) {
  const post = typeof target === 'function' ? target : target?.postMessage?.bind(target);
  if (typeof post !== 'function') throw Object.assign(new Error('Worker postMessage target is unavailable.'), { code: 'POST_MESSAGE_UNAVAILABLE' });
  const transfer = transferables || collectTransferables(message);
  post(message, transfer);
  return transfer;
}

export function normalizeRequestType(value) {
  return REQUEST_TYPE_ALIASES.get(String(value || '').trim().toUpperCase()) || null;
}

export function normalizeTaskType(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return TASK_TYPE_ALIASES.get(text.toUpperCase()) || text;
}

function invalid(code, message, requestId = null, runToken = null) {
  return {
    ok: false,
    message: null,
    error: {
      requestId,
      runToken,
      ...protocolError(code, message),
    },
  };
}

function normalizeIdentifier(value) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
}

function addTransferable(value, target, included) {
  const transferable = ArrayBuffer.isView(value) ? value.buffer : value;
  if (!isArrayBuffer(transferable) || included.has(transferable)) return;
  // Detached and zero-length buffers do not benefit from transfer and can fail in older runtimes.
  if (transferable.byteLength === 0) return;
  included.add(transferable);
  target.push(transferable);
}

function isArrayBuffer(value) {
  return typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer;
}
