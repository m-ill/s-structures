import { createWorkerCore } from './workerCore.js';

export const ANALYSIS_WORKER_VERSION = 'p8-m2-analysis-worker-v1';

export async function createAvailableWasmSparseBackend(options = {}) {
  let factory = options.createWasmSparseBackend
    || globalThis.createWasmSparseBackend
    || globalThis.__DCR_CREATE_WASM_SPARSE_BACKEND__;

  if (typeof factory !== 'function' && options.loadModule !== false) {
    try {
      const moduleUrl = new URL('../equilibrium/backends/wasmSparseBackend.js', import.meta.url);
      const module = await import(moduleUrl.href);
      factory = module.createWasmSparseBackend;
    } catch {
      factory = null;
    }
  }
  if (typeof factory !== 'function') return null;
  try {
    return await factory(options.backendOptions || {});
  } catch {
    return null;
  }
}

export async function attachAnalysisWorker(options = {}) {
  const endpoint = options.endpoint || await resolveWorkerEndpoint();
  if (!endpoint) return null;
  const backend = Object.prototype.hasOwnProperty.call(options, 'backend')
    ? options.backend
    : await createAvailableWasmSparseBackend(options);
  const core = createWorkerCore({
    postMessage(message, transferables) {
      endpoint.postMessage(message, transferables);
    },
    backend,
    taskHandler: options.taskHandler,
    preflight: options.preflight,
  });
  endpoint.onMessage((message) => {
    void core.handleMessage(message);
  });
  return core;
}

export async function resolveWorkerEndpoint() {
  if (
    typeof document === 'undefined'
    && typeof globalThis.postMessage === 'function'
    && typeof globalThis.addEventListener === 'function'
  ) {
    return {
      kind: 'web-worker',
      postMessage(message, transferables) {
        globalThis.postMessage(message, transferables);
      },
      onMessage(listener) {
        globalThis.addEventListener('message', (event) => listener(event.data));
      },
    };
  }

  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const { parentPort } = await import('node:worker_threads');
      if (!parentPort) return null;
      return {
        kind: 'node-worker-thread',
        postMessage(message, transferables) {
          parentPort.postMessage(message, transferables);
        },
        onMessage(listener) {
          parentPort.on('message', listener);
        },
      };
    } catch {
      return null;
    }
  }
  return null;
}

export const analysisWorkerReady = attachAnalysisWorker();
await analysisWorkerReady;
