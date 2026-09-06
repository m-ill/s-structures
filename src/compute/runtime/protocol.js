import { validateAnalysisExecutionPlan } from '../execution/executionPlan.js';
import { collectComputeTransferables, postComputeMessage } from './transferables.js';

export const COMPUTE_WORKER_PROTOCOL_VERSION = 'p9-compute-worker-protocol-v1';

export const COMPUTE_JOB_REQUEST_TYPES = Object.freeze({
  start: 'START',
  cancel: 'CANCEL',
  dispose: 'DISPOSE',
});

export const COMPUTE_JOB_EVENT_TYPES = Object.freeze({
  accepted: 'ACCEPTED',
  progress: 'PROGRESS',
  cancelAcknowledged: 'CANCEL_ACKNOWLEDGED',
  result: 'RESULT',
  error: 'ERROR',
  cancelled: 'CANCELLED',
  disposed: 'DISPOSED',
});

export const COMPUTE_JOB_TERMINAL_TYPES = Object.freeze([
  COMPUTE_JOB_EVENT_TYPES.result,
  COMPUTE_JOB_EVENT_TYPES.error,
  COMPUTE_JOB_EVENT_TYPES.cancelled,
]);

export function createComputeStartRequest(input = {}) {
  return {
    protocolVersion: COMPUTE_WORKER_PROTOCOL_VERSION,
    type: COMPUTE_JOB_REQUEST_TYPES.start,
    requestId: identifier(input.requestId),
    runId: identifier(input.runId || input.plan?.runId),
    plan: input.plan || null,
    operationId: identifier(input.operationId),
    payload: input.payload ?? null,
  };
}

export function createComputeCancelRequest(input = {}) {
  return {
    protocolVersion: COMPUTE_WORKER_PROTOCOL_VERSION,
    type: COMPUTE_JOB_REQUEST_TYPES.cancel,
    requestId: identifier(input.requestId),
    runId: identifier(input.runId),
  };
}

export function createComputeDisposeRequest(input = {}) {
  return {
    protocolVersion: COMPUTE_WORKER_PROTOCOL_VERSION,
    type: COMPUTE_JOB_REQUEST_TYPES.dispose,
    requestId: identifier(input.requestId),
    runId: input.runId == null ? null : identifier(input.runId),
  };
}

export function validateComputeJobRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('COMPUTE_MESSAGE_INVALID', 'Compute request must be an object.');
  if (value.protocolVersion !== COMPUTE_WORKER_PROTOCOL_VERSION) return invalid('COMPUTE_PROTOCOL_UNSUPPORTED', 'Unsupported compute protocol version.');
  if (!Object.values(COMPUTE_JOB_REQUEST_TYPES).includes(value.type)) return invalid('COMPUTE_REQUEST_TYPE_UNSUPPORTED', 'Unsupported compute request type.');
  const requestId = identifier(value.requestId);
  if (!requestId) return invalid('COMPUTE_REQUEST_ID_REQUIRED', 'requestId is required.');
  if (value.type === COMPUTE_JOB_REQUEST_TYPES.dispose) {
    return { ok: true, message: createComputeDisposeRequest({ requestId, runId: value.runId }), error: null };
  }
  const runId = identifier(value.runId);
  if (!runId) return invalid('COMPUTE_RUN_ID_REQUIRED', 'runId is required.', requestId);
  if (value.type === COMPUTE_JOB_REQUEST_TYPES.cancel) {
    return { ok: true, message: createComputeCancelRequest({ requestId, runId }), error: null };
  }
  const planValidation = validateAnalysisExecutionPlan(value.plan);
  if (!planValidation.ok) return invalid('COMPUTE_PLAN_INVALID', planValidation.errors.join(', '), requestId, runId);
  if (value.plan.runId !== runId) return invalid('COMPUTE_PLAN_RUN_MISMATCH', 'Plan runId does not match request runId.', requestId, runId);
  const operationId = identifier(value.operationId);
  if (!operationId || !value.plan.operations.some((row) => row.id === operationId)) {
    return invalid('COMPUTE_OPERATION_INVALID', 'operationId is not present in the plan.', requestId, runId);
  }
  return {
    ok: true,
    message: createComputeStartRequest({ requestId, runId, plan: value.plan, operationId, payload: value.payload }),
    error: null,
  };
}

export function computeProtocolError(code, message, details = null) {
  return {
    code: identifier(code) || 'COMPUTE_RUNTIME_ERROR',
    message: typeof message === 'string' && message ? message : 'Compute runtime error.',
    details: details ?? null,
  };
}

export function serializeComputeError(error, fallbackCode = 'COMPUTE_RUNTIME_ERROR') {
  if (typeof error === 'string') return computeProtocolError(fallbackCode, error);
  return computeProtocolError(error?.code || fallbackCode, error?.message || 'Compute runtime error.', error?.details || null);
}

export function isComputeTerminalEvent(value) {
  return COMPUTE_JOB_TERMINAL_TYPES.includes(value?.type);
}

export { collectComputeTransferables, postComputeMessage };

function invalid(code, message, requestId = null, runId = null) {
  return { ok: false, message: null, error: { requestId, runId, ...computeProtocolError(code, message) } };
}

function identifier(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}
