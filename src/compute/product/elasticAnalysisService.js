import { DEFAULT_RESOURCE_BUDGETS } from '../../core/resourceBudget.js';
import { createAnalysisExecutionPlan } from '../execution/executionPlan.js';
import { createComputeWorkerClient } from '../runtime/workerClient.js';
import { prepareAnalysisContracts } from '../adapters/analysisAdapters.js';
import {
  PRODUCTION_ELASTIC_OPERATION,
  createProductionElasticComputeBackend,
  isElasticAutoGpuProfileEligible,
} from '../adapters/elasticProductionAdapter.js';

export const ELASTIC_ANALYSIS_SERVICE_VERSION = 'p9-m3-elastic-analysis-service-v1';

export function createElasticAnalysisService(options = {}) {
  const client = options.client || createComputeWorkerClient(options.worker || {});
  const backend = options.backend || createProductionElasticComputeBackend();
  const hybridBackend = options.hybridBackend || createProductionElasticComputeBackend({ executionTarget: 'gpu' });
  const backends = options.backends || [backend, hybridBackend];
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
    const comboId = runOptions.settings?.comboId;
    if (comboId && comboId !== 'ENVELOPE') {
      const combo = model.loadCombinations?.find(row => row.id === comboId);
      if (!combo) return Promise.reject(serviceError('ELASTIC_COMBINATION_NOT_FOUND', `Load combination ${comboId} was not found.`));
      model = { ...model, loadCombinations: [combo] };
      runOptions = { ...runOptions, retainDetailedCombinations: true };
    }
    const fullDof=(model.nodes?.length||0)*6,estimatedWorkingBytes=240*fullDof*fullDof;
    const maxWorkingBytes=runOptions.maxWorkingBytes??DEFAULT_RESOURCE_BUDGETS.workerAdmissionBytes;
    if(!Number.isFinite(maxWorkingBytes)||maxWorkingBytes<=0||estimatedWorkingBytes>maxWorkingBytes) return Promise.reject(serviceError('ELASTIC_WORKING_SET_BUDGET_EXCEEDED',`Estimated working set ${estimatedWorkingBytes} exceeds ${maxWorkingBytes} bytes.`));
    const contracts = prepareAnalysisContracts(model, runOptions.contractOptions);
    const runId = String(runOptions.runId || `elastic-${Date.now()}-${++sequence}`);
    const caseId = String(runOptions.caseId || model?.meta?.id || 'elastic-static');
    const computeTarget = String(runOptions.computeTarget || 'cpu').toLowerCase();
    const planBackends = selectPlanBackends(backends, computeTarget, model, runOptions.computeProfile);
    const plan = createAnalysisExecutionPlan({
      runId,
      caseId,
      domainHash: contracts.domain.domainHash,
      workloadClass: runOptions.workloadClass || inferWorkloadClass(model),
      userPolicy: computeTarget,
      gpuEnabled: planBackends.some((candidate) => candidate.executionTarget === 'gpu')
        || runOptions.gpuEnabled === true,
      backends: planBackends,
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
      computeTarget,
      computeProfile: runOptions.computeProfile,
      hybridOptions: runOptions.hybridOptions,
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

function selectPlanBackends(backends, computeTarget, model, profile) {
  if (computeTarget !== 'auto') return backends;
  const gpuEligible = isElasticAutoGpuProfileEligible(model, profile || {});
  return backends.filter((candidate) => (
    gpuEligible
      ? candidate.executionTarget === 'gpu'
      : candidate.executionTarget !== 'gpu'
  ));
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
