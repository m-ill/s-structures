import { stableHash } from '../../core/stableHash.js';
import { analyzeDynamics } from '../../dynamics/modal.js';
import { estimateGlobalBucklingTrace } from '../../dynamics/globalBuckling.js';
import {
  analysisResultParityHash,
  prepareAnalysisContracts,
} from './analysisAdapters.js';

export const PRODUCTION_EIGEN_ADAPTER_VERSION = 'p9-m6-production-eigen-adapter-v1';
export const PRODUCTION_EIGEN_BACKEND_ID = 'p9-eigen-cpu-f64-production-v1';
export const PRODUCTION_EIGEN_OPERATIONS = Object.freeze({
  modalRsa: 'modalRsa',
  globalBuckling: 'globalBuckling',
});

export function describeProductionEigenAdapter() {
  return Object.freeze({
    version: PRODUCTION_EIGEN_ADAPTER_VERSION,
    id: PRODUCTION_EIGEN_BACKEND_ID,
    buildHash: stableHash({
      version: PRODUCTION_EIGEN_ADAPTER_VERSION,
      operations: Object.values(PRODUCTION_EIGEN_OPERATIONS),
    }),
    family: 'cpu',
    executionTarget: 'cpu',
    numericPrecision: 'f64',
    precisionModes: Object.freeze(['f64']),
    deterministic: true,
    deterministicScope: 'fixed-sparse-order-requested-mode-cpu-f64-audit',
    production: true,
    qualification: 'phase9-m6-sparse-eigen-production',
    matrixClasses: Object.freeze(['spd']),
    operations: Object.freeze(Object.values(PRODUCTION_EIGEN_OPERATIONS)),
    limits: Object.freeze({
      execution: 'worker-only',
      synchronous: false,
      gpu: 'candidate-spmv-only-not-qualified',
    }),
  });
}

export async function executeProductionEigen(operation, payload = {}, context = {}) {
  const kind = String(operation?.kind || operation || '');
  const inputModel = payload.model || {};
  const contracts = prepareAnalysisContracts(inputModel, payload.contractOptions);
  if (payload.expectedDomainHash && payload.expectedDomainHash !== contracts.domain.domainHash) {
    throw eigenAdapterError('ANALYSIS_DOMAIN_HASH_MISMATCH', 'Worker model does not match the execution-plan domain hash.');
  }
  context.throwIfCancelled?.();
  context.reportProgress?.({ value: 0.05, stage: 'contract-ready' });
  const settings = payload.settings || payload.analysisCase || {};
  const model = applySettings(inputModel, settings);
  let result;
  if (kind === PRODUCTION_EIGEN_OPERATIONS.modalRsa) {
    context.reportProgress?.({ value: 0.2, stage: 'modal-operator-assembly' });
    await context.yieldControl?.();
    context.throwIfCancelled?.();
    result = analyzeDynamics(model, {
      ...settings,
      signal: context.signal,
      onEigenProgress: (progress) => context.reportProgress?.({
        ...progress,
        value: 0.2 + 0.7 * Math.max(0, Math.min(1, Number(progress?.value) || 0)),
      }),
    });
  } else if (kind === PRODUCTION_EIGEN_OPERATIONS.globalBuckling) {
    context.reportProgress?.({ value: 0.2, stage: 'buckling-preload-qualification' });
    await context.yieldControl?.();
    context.throwIfCancelled?.();
    result = estimateGlobalBucklingTrace(model, {
      ...settings,
      ...(payload.options || {}),
      preloadResult: payload.preloadResult || payload.options?.preloadResult,
      signal: context.signal,
      onEigenProgress: (progress) => context.reportProgress?.({
        ...progress,
        value: 0.2 + 0.7 * Math.max(0, Math.min(1, Number(progress?.value) || 0)),
      }),
    });
  } else {
    throw eigenAdapterError('PRODUCTION_EIGEN_OPERATION_UNSUPPORTED', `Unsupported production eigen operation: ${kind}.`);
  }
  context.throwIfCancelled?.();
  context.commitBoundary?.({ stage: `${kind}-complete` });
  context.reportProgress?.({ value: 1, stage: 'complete' });
  return Object.freeze({
    version: PRODUCTION_EIGEN_ADAPTER_VERSION,
    operation: kind,
    result,
    resultHash: analysisResultParityHash(result),
    domainHash: contracts.domain.domainHash,
    patternHash: contracts.sparsePattern.patternHash,
    contractHash: contracts.contractHash,
    execution: Object.freeze({
      target: 'cpu',
      precisionMode: 'f64',
      fallbackUsed: false,
      algorithm: 'sparse-requested-mode-cpu-f64-audit',
      eigen: result?.eigen || null,
    }),
  });
}

export function createProductionEigenComputeBackend() {
  const descriptor = describeProductionEigenAdapter();
  return Object.freeze({
    ...descriptor,
    descriptor,
    preflight(request = {}) {
      const operation = String(request.operation || request.kind || '');
      const matrixClass = String(request.matrixClass || 'spd').toLowerCase();
      const ok = descriptor.operations.includes(operation) && matrixClass === 'spd';
      return { ok, code: ok ? null : 'PRODUCTION_EIGEN_OPERATION_UNSUPPORTED', backendId: descriptor.id };
    },
    execute(operation, payload, context) {
      return executeProductionEigen(operation, payload, context);
    },
  });
}

export function createProductionEigenExecutor() {
  const backend = createProductionEigenComputeBackend();
  return async function executeProductionEigenJob(job, context) {
    if (job.plan.domainHash !== job.payload?.expectedDomainHash) {
      throw eigenAdapterError('ANALYSIS_PLAN_DOMAIN_MISMATCH', 'Payload must bind to the execution-plan domain hash.');
    }
    if (job.operation?.backendId !== backend.id) {
      throw eigenAdapterError('ANALYSIS_BACKEND_ROUTE_MISMATCH', 'Execution plan selected an unavailable production eigen adapter.');
    }
    return backend.execute(job.operation.kind, job.payload, context);
  };
}

export function isProductionEigenBackendId(value) {
  return String(value || '') === PRODUCTION_EIGEN_BACKEND_ID;
}

function applySettings(model, settings) {
  if (!settings || !Object.keys(settings).length) return model;
  return {
    ...model,
    analysisSettings: {
      ...(model.analysisSettings || {}),
      ...settings,
    },
  };
}

function eigenAdapterError(code, message) {
  return Object.assign(new Error(message), { code });
}
