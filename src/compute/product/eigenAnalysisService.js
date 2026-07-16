import { prepareAnalysisContracts } from '../adapters/analysisAdapters.js';
import {
  PRODUCTION_EIGEN_OPERATIONS,
  createProductionEigenComputeBackend,
} from '../adapters/eigenProductionAdapter.js';
import { createAnalysisExecutionPlan } from '../execution/executionPlan.js';
import { createComputeWorkerClient } from '../runtime/workerClient.js';

export const EIGEN_ANALYSIS_SERVICE_VERSION = 'p9-m6-eigen-analysis-service-v1';

export function createEigenAnalysisService(options = {}) {
  const client = options.client || createComputeWorkerClient(options.worker || {});
  const backend = options.backend || createProductionEigenComputeBackend();
  let sequence = 0;
  let disposed = false;

  return Object.freeze({
    version: EIGEN_ANALYSIS_SERVICE_VERSION,
    runModalRsa(model, runOptions = {}) {
      return run(PRODUCTION_EIGEN_OPERATIONS.modalRsa, model, runOptions);
    },
    runBuckling(model, runOptions = {}) {
      return run(PRODUCTION_EIGEN_OPERATIONS.globalBuckling, model, runOptions);
    },
    cancel(runId = client.activeRunId) {
      return client.cancel(runId);
    },
    dispose() {
      if (disposed) return undefined;
      disposed = true;
      return client.dispose();
    },
    get activeRunId() {
      return client.activeRunId;
    },
  });

  function run(operation, model, runOptions) {
    if (disposed) return Promise.reject(serviceError('EIGEN_SERVICE_DISPOSED', 'Eigen analysis service is disposed.'));
    const computeTarget = String(runOptions.computeTarget || 'cpu').toLowerCase();
    if (!['auto', 'cpu'].includes(computeTarget)) {
      return Promise.reject(serviceError('EIGEN_GPU_NOT_QUALIFIED', 'M6 eigen analysis is qualified only for CPU f64 execution.'));
    }
    const contracts = prepareAnalysisContracts(model, runOptions.contractOptions);
    const runId = String(runOptions.runId || `eigen-${Date.now()}-${++sequence}`);
    const plan = createAnalysisExecutionPlan({
      runId,
      caseId: String(runOptions.caseId || operation),
      domainHash: contracts.domain.domainHash,
      workloadClass: runOptions.workloadClass || inferWorkloadClass(model),
      userPolicy: 'cpu',
      gpuEnabled: false,
      backends: [backend],
      operations: [{
        id: operation,
        kind: operation,
        matrixClass: 'spd',
        precision: 'f64',
        production: true,
        estimatedBytes: Number(runOptions.estimatedBytes || 0),
      }],
      settings: runOptions.settings || {},
    });
    return client.start(plan, operation, {
      model,
      settings: runOptions.settings || {},
      options: runOptions.options || {},
      preloadResult: runOptions.preloadResult || null,
      contractOptions: runOptions.contractOptions,
      expectedDomainHash: contracts.domain.domainHash,
      computeTarget: 'cpu',
    }, {
      onProgress: runOptions.onProgress,
      requestId: runOptions.requestId,
    });
  }
}

function inferWorkloadClass(model = {}) {
  const dof = (model.nodes?.length || 0) * 6;
  if (dof <= 1200) return 'S';
  if (dof <= 20000) return 'M';
  return 'L';
}

function serviceError(code, message) {
  return Object.assign(new Error(message), { code });
}
