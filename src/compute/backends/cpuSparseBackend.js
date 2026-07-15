import { stableHash } from '../../core/stableHash.js';
import { createSparseFactorRuntime } from '../sparse/factorRuntime.js';

export const CPU_SPARSE_BACKEND_ID = 'p9-cpu-sparse-f64-v1';

export function createCpuSparseBackend(options = {}) {
  const runtime = options.runtime || createSparseFactorRuntime(options);
  const capabilities = Object.freeze({
    abiVersion: 1,
    sparseFormats: Object.freeze(['csr', 'csc']),
    matrixClasses: Object.freeze(['spd', 'general', 'indefinite', 'symmetric-indefinite']),
    multiRhs: true,
    persistentSymbolic: true,
    persistentNumeric: true,
    simd: Object.freeze({ supported: false, enabled: false, reason: 'scalar-reference-determinism' }),
    threads: Object.freeze({ supported: false, enabled: false, reason: 'single-thread-event-order' }),
    denseFallback: false,
  });
  const backend = {
    id: CPU_SPARSE_BACKEND_ID,
    version: CPU_SPARSE_BACKEND_ID,
    buildHash: stableHash({ id: CPU_SPARSE_BACKEND_ID, capabilities }),
    family: 'cpu',
    executionTarget: 'cpu',
    production: true,
    numericPrecision: 'f64',
    precisionModes: ['f64'],
    deterministic: true,
    deterministicScope: 'single-thread-sparse-factor-and-rhs-order',
    matrixClasses: capabilities.matrixClasses,
    matrixFormats: capabilities.sparseFormats,
    operations: ['solveSpd', 'solveGeneral'],
    capabilities,
    preflight(request = {}) {
      const requestedClass = String(request.matrixClass || 'general');
      if (!capabilities.matrixClasses.includes(requestedClass)) {
        return { ok: false, reason: 'BACKEND_MATRIX_CLASS_UNSUPPORTED' };
      }
      return {
        ok: true,
        available: true,
        reason: null,
        backendId: CPU_SPARSE_BACKEND_ID,
        numericPrecision: 'f64',
        deterministic: true,
        denseFallback: false,
        capabilities,
      };
    },
    createFactor(matrix, factorOptions = {}) {
      return runtime.prepare(matrix, factorOptions);
    },
    solveFactor(handle, rhs, solveOptions = {}) {
      return runtime.solve(handle, rhs, solveOptions);
    },
    solveFactorMultiple(handle, rhsList, solveOptions = {}) {
      return runtime.solveMultiple(handle, rhsList, solveOptions);
    },
    releaseFactor(handle) {
      return runtime.release(handle);
    },
    solve(matrix, rhs, solveOptions = {}) {
      const prepared = runtime.prepare(matrix, solveOptions);
      if (!prepared.ok) return prepared;
      try {
        return runtime.solve(prepared.handle, rhs, solveOptions);
      } finally {
        runtime.release(prepared.handle);
      }
    },
    solveMultiple(matrix, rhsList, solveOptions = {}) {
      const prepared = runtime.prepare(matrix, solveOptions);
      if (!prepared.ok) return { ...prepared, results: [], x: [] };
      try {
        return runtime.solveMultiple(prepared.handle, rhsList, solveOptions);
      } finally {
        runtime.release(prepared.handle);
      }
    },
    execute(operation, payload = {}, context = {}) {
      const matrixClass = operation === 'solveSpd' ? 'spd' : payload.options?.matrixClass || 'general';
      const solveOptions = { ...(payload.options || {}), matrixClass, signal: context.signal || payload.options?.signal };
      return Array.isArray(payload.rhsList)
        ? backend.solveMultiple(payload.matrix, payload.rhsList, solveOptions)
        : backend.solve(payload.matrix, payload.rhs, solveOptions);
    },
    snapshot() {
      return runtime.snapshot();
    },
    dispose() {
      return runtime.dispose();
    },
  };
  return Object.freeze(backend);
}

export function resolveCpuWasmSparseBackend(options = {}) {
  const preference = String(options.preference || 'auto').toLowerCase();
  if (preference === 'wasm') {
    return options.wasmBackend
      ? { ok: true, backend: options.wasmBackend, fallbackUsed: false }
      : unavailable('WASM_BACKEND_UNAVAILABLE');
  }
  if (preference === 'cpu') {
    return options.cpuBackend
      ? { ok: true, backend: options.cpuBackend, fallbackUsed: false }
      : unavailable('CPU_BACKEND_UNAVAILABLE');
  }
  const backend = options.wasmBackend || options.cpuBackend;
  return backend
    ? { ok: true, backend, fallbackUsed: false }
    : unavailable('SPARSE_BACKEND_UNAVAILABLE');
}

function unavailable(reason) {
  return { ok: false, backend: null, reason, fallbackUsed: false };
}
