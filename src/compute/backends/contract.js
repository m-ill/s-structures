import { stableHash } from '../../core/stableHash.js';
import { createResourceLedger } from '../telemetry/resourceLedger.js';
import { createComputeTelemetry } from '../telemetry/telemetry.js';

export const COMPUTE_BACKEND_CONTRACT_VERSION = 'p9-compute-backend-v1';
export const COMPUTE_BACKEND_TARGETS = Object.freeze(['auto', 'cpu', 'wasm', 'gpu']);
export const COMPUTE_OPERATION_CAPABILITIES = Object.freeze([
  'elementBatch',
  'assembleSparse',
  'solveSpd',
  'solveGeneral',
  'eigenSymmetric',
  'reduceEnvelope',
  'fiberBatch',
]);

export function describeComputeBackend(backend = {}) {
  const id = requiredText(backend.id, 'backend.id');
  const executionTarget = String(backend.executionTarget || backend.family || 'reference');
  const family = normalizeFamily(backend.family || executionTarget);
  const numericPrecision = String(backend.numericPrecision || backend.precision || 'unknown');
  const precisionModes = uniqueStrings(backend.precisionModes || [numericPrecision]);
  const matrixClasses = uniqueStrings(backend.matrixClasses || []);
  const operations = uniqueStrings(backend.operations || inferOperations(backend, matrixClasses));
  const deterministic = backend.deterministic === true;
  const core = {
    version: COMPUTE_BACKEND_CONTRACT_VERSION,
    id,
    buildHash: String(backend.buildHash || stableHash({
      id,
      version: backend.version || null,
      executionTarget,
      numericPrecision,
      matrixClasses,
      operations,
    })),
    family,
    executionTarget,
    targetFamily: targetFamily(family),
    production: backend.production === true,
    numericPrecision,
    precisionModes,
    deterministic,
    deterministicScope: backend.deterministicScope || (deterministic ? 'declared-all-operations' : 'not-declared'),
    matrixClasses,
    operations,
    limits: cloneRecord(backend.limits),
    qualification: String(backend.qualification || (backend.production === true ? 'production' : 'reference')),
  };
  return deepFreeze(core);
}

export function preflightComputeBackend(backend, request = {}) {
  let descriptor;
  try {
    descriptor = describeComputeBackend(backend);
    assertComputeBackendPolicy(backend, request);
  } catch (error) {
    return failed(error.code || 'BACKEND_DESCRIPTOR_INVALID', error.message, error.details || null);
  }
  const operation = String(request.operation || request.kind || '');
  if (operation && !descriptor.operations.includes(operation)) {
    return failed('BACKEND_OPERATION_UNSUPPORTED', 'Backend does not support ' + operation + '.', { descriptor, operation });
  }
  const matrixClass = String(request.matrixClass || '');
  if (matrixClass && !computeBackendSupportsMatrixClass(descriptor.matrixClasses, matrixClass)) {
    return failed('BACKEND_MATRIX_CLASS_UNSUPPORTED', 'Backend does not support ' + matrixClass + '.', { descriptor, matrixClass });
  }
  const precision = String(request.precision || '');
  if (precision && !descriptor.precisionModes.includes(precision)) {
    return failed('BACKEND_PRECISION_UNSUPPORTED', 'Backend does not support ' + precision + '.', { descriptor, precision });
  }
  let backendResult = null;
  if (typeof backend.preflight === 'function') {
    try {
      backendResult = backend.preflight(request);
      if (backendResult && typeof backendResult.then === 'function') {
        return failed('BACKEND_PREFLIGHT_ASYNC_UNSUPPORTED', 'Backend preflight must be synchronous in the M1 contract.', { descriptor });
      }
      if (backendResult === false || backendResult?.ok === false) {
        return failed(backendResult?.code || backendResult?.reason || 'BACKEND_PREFLIGHT_FAILED', 'Backend preflight failed.', {
          descriptor,
          backendResult,
        });
      }
    } catch (error) {
      return failed(error.code || 'BACKEND_PREFLIGHT_FAILED', error.message || String(error), { descriptor });
    }
  }
  return { ok: true, code: null, reason: null, descriptor, backendResult, fallbackUsed: false };
}

export function assertComputeBackendPolicy(backend, options = {}) {
  const requested = normalizeComputeTarget(options.backendPreference || options.computeTarget || options.userPolicy || 'auto');
  const capability = describeComputeBackend(backend);
  if (requested === 'gpu' && capability.targetFamily !== 'gpu') {
    throw policyError('GPU_BACKEND_UNAVAILABLE', 'GPU execution was requested, but the selected backend is not GPU.', { requested, capability });
  }
  if (requested === 'wasm' && capability.targetFamily !== 'wasm') {
    throw policyError('WASM_BACKEND_UNAVAILABLE', 'WASM execution was requested, but the selected backend is not WASM.', { requested, capability });
  }
  if (requested === 'cpu' && capability.targetFamily === 'gpu') {
    throw policyError('CPU_BACKEND_REQUIRED', 'CPU execution was requested, but the selected backend is GPU.', { requested, capability });
  }
  if (capability.targetFamily === 'gpu' && options.gpuEnabled !== true) {
    throw policyError('GPU_BACKEND_NOT_ENABLED', 'GPU backend requires explicit enablement.', { requested, capability });
  }
  if (capability.targetFamily === 'gpu'
    && options.production
    && (capability.numericPrecision !== 'f64'
      && !capability.precisionModes.includes('f64-audited')
      || capability.deterministic !== true)) {
    throw policyError('GPU_BACKEND_QUALIFICATION_REQUIRED', 'Production GPU execution is not qualified by the current precision policy.', {
      requested,
      capability,
    });
  }
  return capability;
}

export function adaptLegacyComputeBackend(backend, options = {}) {
  if (!backend || typeof backend !== 'object') throw policyError('BACKEND_REQUIRED', 'Legacy backend is required.');
  const operations = options.operations || inferOperations(backend, backend.matrixClasses || []);
  const descriptorInput = {
    ...backend,
    operations,
    family: options.family || backend.family || backend.executionTarget,
    buildHash: options.buildHash || backend.buildHash,
    qualification: options.qualification || backend.qualification,
  };
  const descriptor = describeComputeBackend(descriptorInput);
  return Object.freeze({
    ...descriptorInput,
    id: descriptor.id,
    operations: descriptor.operations,
    descriptor,
    legacy: true,
    execute(operation, payload = {}, context = {}) {
      if (operation === 'solveSpd' || operation === 'solveGeneral') {
        if (typeof backend.solve !== 'function') throw policyError('BACKEND_OPERATION_UNSUPPORTED', 'Legacy backend has no solve method.');
        const matrixClass = operation === 'solveSpd' ? 'spd' : payload.options?.matrixClass || 'general';
        return backend.solve(payload.matrix, payload.rhs, { ...(payload.options || {}), matrixClass, signal: context.signal });
      }
      if (typeof backend.execute === 'function') return backend.execute(operation, payload, context);
      throw policyError('BACKEND_OPERATION_UNSUPPORTED', 'Legacy backend does not support ' + operation + '.');
    },
  });
}

export function createComputeSession(backend, options = {}) {
  const runId = requiredText(options.runId, 'runId');
  const adapted = typeof backend.execute === 'function' ? backend : adaptLegacyComputeBackend(backend, options);
  const descriptor = describeComputeBackend(adapted);
  const ledger = options.ledger || createResourceLedger({ runId });
  const telemetry = options.telemetry || createComputeTelemetry({ runId });
  let state = 'created';
  let cancelled = false;
  let disposed = false;
  let operationCount = 0;

  return Object.freeze({
    version: COMPUTE_BACKEND_CONTRACT_VERSION,
    runId,
    descriptor,
    ledger,
    telemetry,
    get state() {
      return state;
    },
    get cancelled() {
      return cancelled;
    },
    prepare(domain, pattern = null) {
      assertState(['created']);
      state = 'prepared';
      telemetry.record({ stage: 'session', backendId: descriptor.id, status: 'prepared', bytes: (domain?.byteLength || 0) + (pattern?.byteLength || 0) });
      return { domainHash: domain?.domainHash || null, patternHash: pattern?.patternHash || null };
    },
    async execute(operation, payload = {}) {
      assertState(['prepared']);
      if (cancelled) throw policyError('COMPUTE_SESSION_CANCELLED', 'Compute session is cancelled.');
      const preflight = preflightComputeBackend(adapted, { ...payload.options, operation, matrixClass: payload.options?.matrixClass });
      if (!preflight.ok) throw policyError(preflight.code, preflight.reason, preflight);
      const started = now();
      state = 'running';
      try {
        const result = await adapted.execute(operation, payload, { runId, signal: { get aborted() { return cancelled; } }, ledger, telemetry });
        operationCount += 1;
        telemetry.record({ stage: 'operation', operationId: operation, backendId: descriptor.id, durationMs: now() - started, status: result?.ok === false ? 'failed' : 'complete' });
        state = 'prepared';
        return result;
      } catch (error) {
        state = 'failed';
        telemetry.record({ stage: 'operation', operationId: operation, backendId: descriptor.id, durationMs: now() - started, status: 'failed', detail: error?.code || error?.message });
        throw error;
      }
    },
    cancel() {
      if (disposed) return false;
      cancelled = true;
      state = state === 'running' ? 'cancelling' : 'cancelled';
      telemetry.record({ stage: 'session', backendId: descriptor.id, status: 'cancel-requested' });
      return true;
    },
    complete() {
      assertState(['prepared']);
      state = 'completed';
      return { runId, operationCount, telemetry: telemetry.snapshot() };
    },
    async dispose() {
      if (disposed) return ledger.snapshot();
      await ledger.disposeAll();
      disposed = true;
      state = 'disposed';
      return ledger.snapshot();
    },
  });

  function assertState(allowed) {
    if (disposed) throw policyError('COMPUTE_SESSION_DISPOSED', 'Compute session is disposed.');
    if (!allowed.includes(state)) throw policyError('COMPUTE_SESSION_STATE_INVALID', 'Compute session state ' + state + ' is invalid for this operation.');
  }
}

export function computeBackendSupportsMatrixClass(classes, requested) {
  if (!Array.isArray(classes)) return false;
  const normalized = requested === 'symmetric-indefinite' ? 'indefinite' : requested;
  return classes.some((value) => (value === 'symmetric-indefinite' ? 'indefinite' : value) === normalized);
}

export function normalizeComputeTarget(value) {
  const target = String(value || 'auto').trim().toLowerCase();
  if (!COMPUTE_BACKEND_TARGETS.includes(target)) throw policyError('COMPUTE_TARGET_INVALID', 'Unsupported compute target: ' + target + '.');
  return target;
}

function inferOperations(backend, matrixClasses) {
  const operations = [];
  if (typeof backend.solve === 'function') {
    if (computeBackendSupportsMatrixClass(matrixClasses, 'spd')) operations.push('solveSpd');
    if (computeBackendSupportsMatrixClass(matrixClasses, 'general') || computeBackendSupportsMatrixClass(matrixClasses, 'indefinite')) operations.push('solveGeneral');
  }
  return operations;
}

function normalizeFamily(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('webgpu')) return 'webgpu-hybrid';
  if (text.includes('native') && text.includes('gpu')) return 'native-gpu';
  if (text.includes('wasm')) return 'wasm-cpu';
  if (text.includes('cpu') || text.includes('js')) return 'reference';
  return text || 'reference';
}

function targetFamily(value) {
  if (value.includes('gpu')) return 'gpu';
  if (value.includes('wasm')) return 'wasm';
  if (value === 'reference' || value.includes('cpu') || value.includes('js')) return 'cpu';
  return 'unknown';
}

function uniqueStrings(value) {
  return Object.freeze([...new Set((Array.isArray(value) ? value : []).map(String).filter(Boolean))].sort());
}

function cloneRecord(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : {};
}

function failed(code, reason, details) {
  return { ok: false, code, reason, details, fallbackUsed: false };
}

function policyError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function requiredText(value, field) {
  const normalized = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (!normalized) throw policyError('BACKEND_FIELD_REQUIRED', field + ' is required.');
  return normalized;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}
