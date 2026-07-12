export const RUNTIME_PREFLIGHT_VERSION = 'p8-m2-runtime-preflight-v1';
export const AVAILABLE_MEMORY_LIMIT_FRACTION = 0.6;
export const DENSE_REFERENCE_MAX_DOF = 300;
export const JS_SPARSE_REFERENCE_MAX_DOF = 2000;

export const RUNTIME_BACKEND_MODES = Object.freeze({
  production: 'production',
  denseReference: 'dense-reference',
  jsSparseReference: 'js-sparse-reference',
});

const FLOAT64_BYTES = Float64Array.BYTES_PER_ELEMENT;
const INT32_BYTES = Int32Array.BYTES_PER_ELEMENT;

export function estimateRuntimeMemory(input = {}) {
  const dofCount = nonnegativeInteger(input.dofCount ?? input.activeDof ?? input.dof ?? input.ndof, 0);
  const nnz = nonnegativeInteger(input.nnz, dofCount);
  const backendMode = normalizeBackendMode(input.backendMode ?? input.mode, input.backend);
  const dense = backendMode === RUNTIME_BACKEND_MODES.denseReference;
  const fillRatio = positiveNumber(input.factorFillRatio, 4);

  const matrixBytes = dense
    ? alignedBytes(safeProduct(dofCount, dofCount, FLOAT64_BYTES, 3) + safeProduct(dofCount, INT32_BYTES))
    : sparseMatrixBytes(dofCount, nnz, fillRatio);

  const stateVectorCount = nonnegativeInteger(input.stateVectorCount, 12);
  const stateValueCount = nonnegativeInteger(input.stateValueCount, safeProduct(dofCount, stateVectorCount));
  const stateBytes = alignedBytes(
    safeProduct(stateValueCount, FLOAT64_BYTES)
      + nonnegativeInteger(input.additionalStateBytes ?? input.elementStateBytes, 0),
  );

  const resultVectorCount = nonnegativeInteger(input.resultVectorCount ?? input.savedResultVectorCount, 4);
  const resultValueCount = nonnegativeInteger(input.resultValueCount, safeProduct(dofCount, resultVectorCount));
  const resultIndexCount = nonnegativeInteger(input.resultIndexCount, resultVectorCount);
  const resultBytes = alignedBytes(
    safeProduct(resultValueCount, FLOAT64_BYTES)
      + safeProduct(resultIndexCount, INT32_BYTES)
      + nonnegativeInteger(input.additionalResultBytes, 0),
  );

  return {
    version: RUNTIME_PREFLIGHT_VERSION,
    dofCount,
    nnz,
    matrixBytes,
    stateBytes,
    resultBytes,
    totalBytes: safeSum(matrixBytes, stateBytes, resultBytes),
    assumptions: {
      matrixStorage: dense ? 'dense-reference-workspace' : 'csc-plus-factor-workspace',
      factorFillRatio: dense ? null : fillRatio,
      stateVectorCount,
      resultVectorCount,
      floatBytes: FLOAT64_BYTES,
      indexBytes: INT32_BYTES,
    },
  };
}

export const estimateAnalysisMemory = estimateRuntimeMemory;

export function resolveRuntimeMemoryLimit(input = {}) {
  const memory = input.memory && typeof input.memory === 'object' ? input.memory : {};
  const configuredBytes = optionalPositiveInteger(
    input.configuredMemoryLimitBytes
      ?? input.memoryLimitBytes
      ?? memory.configuredBytes
      ?? memory.limitBytes,
  );
  const availableBytes = optionalPositiveInteger(
    input.availableMemoryBytes
      ?? memory.availableBytes,
  );
  const availableLimitBytes = availableBytes == null
    ? null
    : Math.floor(availableBytes * AVAILABLE_MEMORY_LIMIT_FRACTION);
  const candidates = [configuredBytes, availableLimitBytes].filter((value) => value != null);
  const hardLimitBytes = candidates.length ? Math.min(...candidates) : null;
  const source = configuredBytes != null && availableLimitBytes != null
    ? 'configured-and-available'
    : configuredBytes != null ? 'configured' : availableLimitBytes != null ? 'available' : 'unbounded';
  return {
    configuredBytes,
    availableBytes,
    availableFraction: AVAILABLE_MEMORY_LIMIT_FRACTION,
    availableLimitBytes,
    hardLimitBytes,
    source,
  };
}

export function classifyRuntimeBackend(input = {}) {
  const dofCount = nonnegativeInteger(input.dofCount ?? input.activeDof ?? input.dof ?? input.ndof, 0);
  const backend = input.backend || null;
  const mode = normalizeBackendMode(input.backendMode ?? input.mode, backend, input.production);
  let code = null;

  if (mode === RUNTIME_BACKEND_MODES.denseReference) {
    if (dofCount > DENSE_REFERENCE_MAX_DOF) code = 'DENSE_REFERENCE_DOF_LIMIT';
  } else if (mode === RUNTIME_BACKEND_MODES.jsSparseReference) {
    if (dofCount > JS_SPARSE_REFERENCE_MAX_DOF) code = 'JS_SPARSE_REFERENCE_DOF_LIMIT';
  } else if (mode === RUNTIME_BACKEND_MODES.production) {
    if (!backend || backend.production !== true || typeof backend.solve !== 'function') {
      code = 'PRODUCTION_BACKEND_UNAVAILABLE';
    } else if (!supportsMatrixClass(backend.matrixClasses, input.matrixClass || 'spd')) {
      code = 'BACKEND_MATRIX_CLASS_UNSUPPORTED';
    }
  } else {
    code = 'BACKEND_MODE_UNSUPPORTED';
  }

  return {
    ok: !code,
    code,
    mode,
    backendId: typeof backend?.id === 'string' ? backend.id : null,
    production: mode === RUNTIME_BACKEND_MODES.production,
    injected: !!backend,
    dofLimit: mode === RUNTIME_BACKEND_MODES.denseReference
      ? DENSE_REFERENCE_MAX_DOF
      : mode === RUNTIME_BACKEND_MODES.jsSparseReference ? JS_SPARSE_REFERENCE_MAX_DOF : null,
    fallbackPolicy: 'forbidden',
    fallbackUsed: false,
  };
}

function supportsMatrixClass(classes, requested) {
  if (!Array.isArray(classes)) return false;
  const normalized = requested === 'symmetric-indefinite' ? 'indefinite' : requested;
  return classes.some((value) => {
    const candidate = value === 'symmetric-indefinite' ? 'indefinite' : value;
    return candidate === normalized;
  });
}

export function runRuntimePreflight(input = {}) {
  const dofValue = input.dofCount ?? input.activeDof ?? input.dof ?? input.ndof;
  const nnzValue = input.nnz;
  const validDof = Number.isInteger(Number(dofValue)) && Number(dofValue) > 0;
  const validNnz = nnzValue == null || (Number.isInteger(Number(nnzValue)) && Number(nnzValue) >= 0);
  const dofCount = validDof ? Number(dofValue) : 0;
  const nnz = validNnz ? nonnegativeInteger(nnzValue, dofCount) : 0;
  const backend = classifyRuntimeBackend({ ...input, dofCount });
  const estimate = estimateRuntimeMemory({ ...input, dofCount, nnz, backendMode: backend.mode });
  const memory = resolveRuntimeMemoryLimit(input);
  let code = !validDof || !validNnz ? 'PREFLIGHT_SIZE_INVALID' : backend.code;
  let backendPreflight = null;

  if (!code && input.backend && typeof input.backend.preflight === 'function') {
    try {
      backendPreflight = input.backend.preflight({
        dofCount,
        nnz,
        matrixClass: input.matrixClass || 'spd',
        production: backend.production,
        memoryEstimate: estimate,
      });
      if (backendPreflight && typeof backendPreflight.then === 'function') {
        code = 'BACKEND_PREFLIGHT_ASYNC_UNSUPPORTED';
        backendPreflight = null;
      } else if (backendPreflight === false || backendPreflight?.ok === false) {
        code = backendPreflight?.code || backendPreflight?.reason || 'BACKEND_PREFLIGHT_FAILED';
      }
    } catch (error) {
      code = error?.code || 'BACKEND_PREFLIGHT_FAILED';
      backendPreflight = {
        ok: false,
        code,
        message: error?.message || String(error),
      };
    }
  }

  if (!code && memory.hardLimitBytes != null && estimate.totalBytes > memory.hardLimitBytes) {
    code = 'PREFLIGHT_MEMORY_LIMIT_EXCEEDED';
  }

  return {
    version: RUNTIME_PREFLIGHT_VERSION,
    ok: !code,
    code,
    reason: code,
    dofCount,
    nnz,
    backend,
    backendPreflight,
    estimate,
    memory: {
      ...memory,
      withinLimit: memory.hardLimitBytes == null || estimate.totalBytes <= memory.hardLimitBytes,
    },
  };
}

export const preflightAnalysisRuntime = runRuntimePreflight;
export const runPreflight = runRuntimePreflight;

export function normalizeBackendMode(value, backend = null, production = false) {
  if (production === true) return RUNTIME_BACKEND_MODES.production;
  const requested = String(value || '').trim().toLowerCase();
  if (requested === 'production' || requested === 'wasm' || requested.startsWith('wasm-')) {
    return RUNTIME_BACKEND_MODES.production;
  }
  if (requested === 'dense' || requested === 'dense-reference' || requested === 'reference-dense') {
    return RUNTIME_BACKEND_MODES.denseReference;
  }
  if (requested === 'js-sparse' || requested === 'js-sparse-reference' || requested === 'reference-sparse') {
    return RUNTIME_BACKEND_MODES.jsSparseReference;
  }
  if (requested && requested !== 'auto') return requested;
  if (backend?.production === true) return RUNTIME_BACKEND_MODES.production;
  const backendId = String(backend?.id || '').toLowerCase();
  if (backendId.includes('js-sparse')) return RUNTIME_BACKEND_MODES.jsSparseReference;
  if (backendId.includes('dense') && backend?.production !== true) return RUNTIME_BACKEND_MODES.denseReference;
  return RUNTIME_BACKEND_MODES.production;
}

function sparseMatrixBytes(dofCount, nnz, fillRatio) {
  const cscBytes = safeProduct(nnz, FLOAT64_BYTES + INT32_BYTES) + safeProduct(dofCount + 1, INT32_BYTES);
  const assemblyValueBytes = safeProduct(nnz, FLOAT64_BYTES);
  const factorNnz = Math.ceil(nnz * fillRatio);
  const factorBytes = safeProduct(factorNnz, FLOAT64_BYTES + INT32_BYTES) + safeProduct(dofCount + 1, INT32_BYTES);
  return alignedBytes(safeSum(cscBytes, assemblyValueBytes, factorBytes));
}

function alignedBytes(value) {
  const finite = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.ceil(Number(value) || 0)));
  return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(finite / 8) * 8);
}

function safeProduct(...values) {
  let result = 1;
  for (const value of values) {
    result *= Math.max(0, Number(value) || 0);
    if (!Number.isSafeInteger(result)) return Number.MAX_SAFE_INTEGER;
  }
  return result;
}

function safeSum(...values) {
  let result = 0;
  for (const value of values) {
    result += Math.max(0, Number(value) || 0);
    if (!Number.isSafeInteger(result)) return Number.MAX_SAFE_INTEGER;
  }
  return result;
}

function nonnegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function optionalPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
