import { stableHash } from '../../core/stableHash.js';
import { analyzeModel } from '../../solver/linear3d.js';
import { runProductionPushover } from '../../nonlinear/pushover/productionPushover.js';
import { runProductionNlth } from '../../nonlinear/dynamics/productionNlth.js';
import { packDomainBinary, unpackDomainBinary, validateDomainBinary } from '../contracts/domainBinary.js';
import { createSparsePatternFromDomain, validateSparsePattern } from '../contracts/sparsePattern.js';

export const ANALYSIS_ADAPTER_VERSION = 'p9-analysis-adapter-v1';
export const ANALYSIS_OPERATION_KINDS = Object.freeze({
  elasticStatic: 'elasticStatic',
  productionPushover: 'productionPushover',
  productionNlth: 'productionNlth',
});
const VOLATILE_RESULT_FIELDS = new Set(['totalSolveMs', 'durationMs', 'elapsedMs', 'startedAt', 'completedAt', 'finishedAt']);

export function prepareAnalysisContracts(model, options = {}) {
  const domain = packDomainBinary(model);
  const sparsePattern = createSparsePatternFromDomain(domain, {
    factorGroupKey: options.factorGroupKey || domain.domainHash,
  });
  assertValid(validateDomainBinary(domain), 'DomainBinary');
  assertValid(validateSparsePattern(sparsePattern), 'SparsePattern');
  return Object.freeze({
    version: ANALYSIS_ADAPTER_VERSION,
    domain,
    sparsePattern,
    contractHash: stableHash({
      domainHash: domain.domainHash,
      patternHash: sparsePattern.patternHash,
    }),
  });
}

export function describeCurrentAnalysisAdapter() {
  return Object.freeze({
    version: ANALYSIS_ADAPTER_VERSION,
    id: 'current-analysis-engine-adapter',
    buildHash: stableHash({ version: ANALYSIS_ADAPTER_VERSION, engines: Object.values(ANALYSIS_OPERATION_KINDS) }),
    family: 'reference',
    executionTarget: 'cpu-js',
    numericPrecision: 'f64',
    precisionModes: Object.freeze(['f64']),
    deterministic: true,
    deterministicScope: 'same-model-same-settings-current-engine',
    production: false,
    qualification: 'phase9-m1-compatibility',
    matrixClasses: Object.freeze(['spd', 'symmetric-indefinite', 'general']),
    operations: Object.freeze(Object.values(ANALYSIS_OPERATION_KINDS)),
    limits: Object.freeze({ execution: 'worker-required-for-product-callers' }),
  });
}

export async function executeCurrentAnalysis(operation, payload = {}, context = {}) {
  const kind = String(operation?.kind || operation || '');
  const model = payload.model || {};
  const settings = payload.settings || payload.analysisCase || {};
  const contracts = prepareAnalysisContracts(model, payload.contractOptions);
  if (payload.expectedDomainHash && payload.expectedDomainHash !== contracts.domain.domainHash) {
    throw adapterError('ANALYSIS_DOMAIN_HASH_MISMATCH', 'Worker model does not match the execution-plan domain hash.');
  }
  context.throwIfCancelled?.();
  context.reportProgress?.({ value: 0.05, stage: 'contract-ready' });
  const engineModel = unpackDomainBinary(contracts.domain).model;

  let result;
  if (kind === ANALYSIS_OPERATION_KINDS.elasticStatic) {
    result = analyzeModel(applyElasticSettings(engineModel, settings));
  } else if (kind === ANALYSIS_OPERATION_KINDS.productionPushover) {
    result = await runProductionPushover(engineModel, settings, nonlinearOptions(payload, context));
  } else if (kind === ANALYSIS_OPERATION_KINDS.productionNlth) {
    result = await runProductionNlth(engineModel, settings, nonlinearOptions(payload, context));
  } else {
    throw adapterError('ANALYSIS_OPERATION_UNSUPPORTED', 'Unsupported analysis operation: ' + kind + '.');
  }

  context.throwIfCancelled?.();
  context.commitBoundary?.({ stage: 'analysis-complete' });
  context.reportProgress?.({ value: 1, stage: 'complete' });
  return {
    version: ANALYSIS_ADAPTER_VERSION,
    operation: kind,
    result,
    resultHash: analysisResultParityHash(result),
    domainHash: contracts.domain.domainHash,
    patternHash: contracts.sparsePattern.patternHash,
    contractHash: contracts.contractHash,
  };
}

export function analysisResultParityHash(result) {
  return stableHash(withoutVolatileResultFields(result));
}

export function createCurrentAnalysisComputeBackend() {
  const descriptor = describeCurrentAnalysisAdapter();
  return Object.freeze({
    ...descriptor,
    descriptor,
    preflight(request = {}) {
      const ok = descriptor.operations.includes(String(request.operation || request.kind || ''));
      return { ok, code: ok ? null : 'ANALYSIS_OPERATION_UNSUPPORTED', backendId: descriptor.id };
    },
    execute(operation, payload, context) {
      return executeCurrentAnalysis(operation, payload, context);
    },
  });
}

export function createCurrentAnalysisExecutor() {
  const backend = createCurrentAnalysisComputeBackend();
  return async function executeAnalysisJob(job, context) {
    if (job.plan.domainHash !== job.payload?.expectedDomainHash) {
      throw adapterError('ANALYSIS_PLAN_DOMAIN_MISMATCH', 'Payload must bind to the execution-plan domain hash.');
    }
    if (job.operation?.backendId !== backend.id) {
      throw adapterError('ANALYSIS_BACKEND_ROUTE_MISMATCH', 'Execution plan selected an unavailable analysis adapter.');
    }
    return backend.execute(job.operation.kind, job.payload, context);
  };
}

function applyElasticSettings(model, settings) {
  if (!settings || !Object.keys(settings).length) return model;
  return {
    ...model,
    analysisSettings: {
      ...(model.analysisSettings || {}),
      ...settings,
    },
  };
}

function nonlinearOptions(payload, context) {
  return {
    ...(payload.options || {}),
    signal: context.signal,
    onProgress(progress) {
      payload.options?.onProgress?.(progress);
      const value = Number(progress?.value ?? progress?.fraction ?? progress?.ratio);
      if (Number.isFinite(value)) context.reportProgress?.({ ...progress, value: Math.max(0.05, Math.min(0.99, value)) });
    },
  };
}

function assertValid(validation, label) {
  if (!validation.ok) throw adapterError('ANALYSIS_CONTRACT_INVALID', label + ' validation failed: ' + validation.errors.join(', '));
}

function adapterError(code, message) {
  return Object.assign(new Error(message), { code });
}

function withoutVolatileResultFields(value, seen = new WeakMap()) {
  if (value == null || typeof value !== 'object') return value;
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const output = [];
    seen.set(value, output);
    for (const item of value) output.push(withoutVolatileResultFields(item, seen));
    return output;
  }
  if (value instanceof Set) return [...value].map((item) => withoutVolatileResultFields(item, seen)).sort();
  if (value instanceof Map) return [...value.entries()].map(([key, item]) => [key, withoutVolatileResultFields(item, seen)]);
  const output = {};
  seen.set(value, output);
  for (const key of Object.keys(value).sort()) {
    if (!VOLATILE_RESULT_FIELDS.has(key)) output[key] = withoutVolatileResultFields(value[key], seen);
  }
  return output;
}
