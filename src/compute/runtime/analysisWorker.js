import { createCurrentAnalysisExecutor } from '../adapters/analysisAdapters.js';
import { createComputeWorkerCore } from './workerCore.js';

export const COMPUTE_ANALYSIS_WORKER_VERSION = 'p9-compute-analysis-worker-v1';

export function attachComputeAnalysisWorker(endpoint, options = {}) {
  if (!endpoint) return null;
  const core = createComputeWorkerCore({
    executor: options.executor || createCurrentAnalysisExecutor(),
    postMessage: (message, transferables) => endpoint.postMessage(message, transferables),
    yieldControl: options.yieldControl,
  });
  const handle = (event) => core.handleMessage(event?.data ?? event);
  if (typeof endpoint.addEventListener === 'function') endpoint.addEventListener('message', handle);
  else if (typeof endpoint.on === 'function') endpoint.on('message', handle);
  else endpoint.onmessage = handle;
  return Object.freeze({ core, handle });
}

export async function resolveComputeWorkerEndpoint() {
  if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof document === 'undefined') return self;
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const { parentPort, isMainThread } = await import('node:worker_threads');
      if (!isMainThread && parentPort) return parentPort;
    } catch {
      return null;
    }
  }
  return null;
}

export const computeAnalysisWorkerReady = resolveComputeWorkerEndpoint()
  .then((endpoint) => attachComputeAnalysisWorker(endpoint));
