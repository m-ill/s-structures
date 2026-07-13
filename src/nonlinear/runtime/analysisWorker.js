import { createWorkerCore } from './workerCore.js';
import { WORKER_TASK_TYPES } from './protocol.js';

export const ANALYSIS_WORKER_VERSION = 'p8-m6.1-analysis-worker-v2';

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
    taskHandler: options.taskHandler || handleBuiltInAnalysisTask,
    preflight: options.preflight,
  });
  endpoint.onMessage((message) => {
    void core.handleMessage(message);
  });
  return core;
}

export async function handleBuiltInAnalysisTask(task, context) {
  if (task.type === WORKER_TASK_TYPES.buildFiberPmm) {
    const module = await import('../fiber/fiberPmmPreprocessor.js');
    return module.runFiberPmmWorkerTask(task.payload, context);
  }
  const error = new Error(`No built-in analysis worker handler is registered for ${task.type}.`);
  error.code = 'WORKER_TASK_HANDLER_UNAVAILABLE';
  throw error;
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

const workerRole = (() => {
  try { return new URL(import.meta.url).searchParams.get('role'); }
  catch { return null; }
})();
export const analysisWorkerReady = attachAnalysisWorker(workerRole === 'fiber-pmm' ? { backend: null } : {});
await analysisWorkerReady;
