import { createAnalysisExecutionPlan } from '../execution/executionPlan.js';
import { createComputeWorkerClient } from '../runtime/workerClient.js';
import { prepareAnalysisContracts } from '../adapters/analysisAdapters.js';
import {
  PRODUCTION_ELASTIC_OPERATION,
  createProductionElasticComputeBackend,
} from '../adapters/elasticProductionAdapter.js';

export const ELASTIC_ANALYSIS_SERVICE_VERSION = 'p9-m3-elastic-analysis-service-v1';

export function createElasticAnalysisService(options = {}) {
  const client = options.client || createComputeWorkerClient(options.worker || {});
  const backend = options.backend || createProductionElasticComputeBackend();
  let sequence = 0;
  let disposed = false;

  return Object.freeze({
    version: ELASTIC_ANALYSIS_SERVICE_VERSION,
    run,
    runCombination,
    cancel,
    dispose,
    get activeRunId() {
      return client.activeRunId;
    },
  });

  function run(model, runOptions = {}) {
    if (disposed) return Promise.reject(serviceError('ELASTIC_SERVICE_DISPOSED', 'Elastic analysis service is disposed.'));
    const contracts = prepareAnalysisContracts(model, runOptions.contractOptions);
    const runId = String(runOptions.runId || `elastic-${Date.now()}-${++sequence}`);
    const caseId = String(runOptions.caseId || model?.meta?.id || 'elastic-static');
    const plan = createAnalysisExecutionPlan({
      runId,
      caseId,
      domainHash: contracts.domain.domainHash,
      workloadClass: runOptions.workloadClass || inferWorkloadClass(model),
      userPolicy: 'cpu',
      backends: [backend],
      operations: [{
        id: 'elastic-static',
        kind: PRODUCTION_ELASTIC_OPERATION,
        matrixClass: 'spd',
        production: true,
        estimatedBytes: Number(runOptions.estimatedBytes || 0),
      }],
      settings: runOptions.settings || {},
    });
    return client.start(plan, 'elastic-static', {
      model,
      settings: runOptions.settings || {},
      contractOptions: runOptions.contractOptions,
      expectedDomainHash: contracts.domain.domainHash,
      maxFactorBytes: runOptions.maxFactorBytes,
      retainDetailedCombinations: runOptions.retainDetailedCombinations,
      detailedStationRowLimit: runOptions.detailedStationRowLimit,
    }, {
      onProgress: runOptions.onProgress,
      requestId: runOptions.requestId,
    });
  }

  function runCombination(model, comboId, runOptions = {}) {
    const combo = (model?.loadCombinations || []).find((item) => item.id === comboId);
    if (!combo) return Promise.reject(serviceError('ELASTIC_COMBINATION_NOT_FOUND', `Load combination ${comboId} was not found.`));
    return run({ ...model, loadCombinations: [combo] }, {
      ...runOptions,
      caseId: runOptions.caseId || comboId,
      retainDetailedCombinations: true,
    });
  }

  function cancel(runId = client.activeRunId) {
    return client.cancel(runId);
  }

  function dispose() {
    if (disposed) return undefined;
    disposed = true;
    return client.dispose();
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
