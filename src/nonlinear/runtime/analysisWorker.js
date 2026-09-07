import { createWorkerCore } from './workerCore.js';
import { WORKER_TASK_TYPES } from './protocol.js';

export const ANALYSIS_WORKER_VERSION = 'p8-m10-analysis-worker-v4';

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
  // Register before asynchronous WASM initialization. Otherwise the first RUN
  // can arrive during loading and disappear without an accepted/error response.
  let core;
  const pending = [];
  endpoint.onMessage((message) => {
    if (core) void core.handleMessage(message);
    else pending.push(message);
  });
  const backend = Object.prototype.hasOwnProperty.call(options, 'backend')
    ? options.backend
    : await createAvailableWasmSparseBackend(options);
  core = createWorkerCore({
    postMessage(message, transferables) {
      endpoint.postMessage(message, transferables);
    },
    backend,
    taskHandler: options.taskHandler || handleBuiltInAnalysisTask,
    preflight: options.preflight,
  });
  for (const message of pending) void core.handleMessage(message);
  pending.length = 0;
  return core;
}

export async function handleBuiltInAnalysisTask(task, context) {
  if (task.type === WORKER_TASK_TYPES.buildFiberPmm) {
    const module = await import('../fiber/fiberPmmPreprocessor.js');
    return module.runFiberPmmWorkerTask(task.payload, context);
  }
  if (task.type === WORKER_TASK_TYPES.runProductionPushover) {
    const module = await import('../pushover/productionPushover.js');
    const payload = task.payload && typeof task.payload === 'object' ? task.payload : {};
    return module.runProductionPushover(payload.model || {}, payload.analysisCase || {}, {
      ...(payload.options || {}),
      backend: context.backend,
      signal: context.signal,
      isCancelled: context.isCancellationRequested,
      onProgress(progress) {
        if (['displacement-step-accepted', 'arc-length-step-accepted'].includes(progress?.type)) {
          context.commitBoundary({
            task: WORKER_TASK_TYPES.runProductionPushover,
            step: progress.step,
            lambda: progress.lambda,
          });
        }
        context.reportProgress(progress);
      },
    });
  }
  if (task.type === WORKER_TASK_TYPES.runMdofNlth) {
    const module = await import('../dynamics/productionNlth.js');
    const payload = task.payload && typeof task.payload === 'object' ? task.payload : {};
    return module.runProductionNlth(payload.model || {}, payload.analysisCase || {}, {
      ...(payload.options || {}),
      backend: context.backend,
      signal: context.signal,
      isCancelled: context.isCancellationRequested,
      onProgress: context.reportProgress,
      onChunk(chunk) {
        context.reportProgress({ type: 'result-chunk', chunk });
      },
      onCheckpoint(checkpoint) {
        context.reportProgress({
          type: 'checkpoint',
          integrityHash: checkpoint.integrityHash,
          committedHash: checkpoint.committedHash,
          time: checkpoint.committed?.time || 0,
          checkpoint,
        });
      },
      onCommit(detail) {
        context.commitBoundary({
          task: WORKER_TASK_TYPES.runMdofNlth,
          time: detail.time,
          dt: detail.dt,
          stateHash: detail.stateHash,
        });
      },
    });
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
