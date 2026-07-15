import { stableHash } from '../../core/stableHash.js';
import {
  finalizeElasticAnalysis,
  prepareElasticAnalysis,
  solveElasticCombination,
} from '../../solver/linear3d.js';
import { createEnvelopeAccumulator } from '../../solver/linear3dPost.js';
import { prepareAnalysisContracts } from './analysisAdapters.js';
import { classifyElasticFactorGroups, elasticFactorKeyForCombo } from '../elastic/factorGroups.js';
import { createElasticFactorSession } from '../elastic/factorSession.js';

export const PRODUCTION_ELASTIC_ADAPTER_VERSION = 'p9-m3-production-elastic-adapter-v1';
export const PRODUCTION_ELASTIC_BACKEND_ID = 'p9-elastic-cpu-production-v1';
export const PRODUCTION_ELASTIC_OPERATION = 'elasticStatic';

const PHYSICAL_OMIT_FIELDS = new Set([
  'completedAt',
  'durationMs',
  'elapsedMs',
  'finishedAt',
  'methodTrace',
  'solver',
  'startedAt',
  'totalSolveMs',
  'validation',
]);

export async function executeProductionElastic(payload = {}, context = {}) {
  const inputModel = payload.model || {};
  const contracts = prepareAnalysisContracts(inputModel, payload.contractOptions);
  if (payload.expectedDomainHash && payload.expectedDomainHash !== contracts.domain.domainHash) {
    throw elasticAdapterError('ANALYSIS_DOMAIN_HASH_MISMATCH', 'Worker model does not match the execution-plan domain hash.');
  }
  const sourceModel = applyElasticSettings(inputModel, payload.settings || payload.analysisCase || {});
  context.throwIfCancelled?.();
  context.reportProgress?.({ value: 0.03, stage: 'contract-ready' });

  const prepared = prepareElasticAnalysis(sourceModel);
  const factorPlan = classifyElasticFactorGroups(prepared.model, prepared.combos, {
    pDeltaMethod: prepared.pDeltaMethod,
  });
  const componentCache = new Map();
  const factorSession = createElasticFactorSession({ maxBytes: payload.maxFactorBytes });
  const retainDetailedCombinations = shouldRetainDetailedCombinations(prepared, payload);
  const envelopeAccumulator = retainDetailedCombinations ? null : createEnvelopeAccumulator(prepared.combos);
  const byCombo = {};
  const resultSlices = [];
  let result;
  let sessionBeforeDispose;
  let sessionAfterDispose;
  let componentCacheEntryCount = 0;

  try {
    if (!prepared.terminal) {
      for (let index = 0; index < prepared.combos.length; index += 1) {
        const combo = prepared.combos[index];
        context.throwIfCancelled?.();
        await context.yieldControl?.();
        context.throwIfCancelled?.();
        const factorGroupKey = elasticFactorKeyForCombo(factorPlan, combo.id);
        const comboResult = solveElasticCombination(prepared, combo, {
          componentCache,
          factorSession,
          factorGroupKey,
          signal: context.signal,
        });
        envelopeAccumulator?.add(combo, comboResult);
        byCombo[combo.id] = retainDetailedCombinations ? comboResult : compactElasticCombinationResult(comboResult);
        const slice = elasticResultSlice(combo.id, comboResult, index);
        resultSlices.push(slice);
        context.commitBoundary?.({ stage: 'combination-complete', comboId: combo.id, resultSliceHash: slice.resultSliceHash });
        context.reportProgress?.({
          value: 0.05 + (0.75 * (index + 1)) / Math.max(1, prepared.combos.length),
          stage: 'combination-complete',
          comboId: combo.id,
          combinationIndex: index,
          combinationCount: prepared.combos.length,
          resultSlice: slice,
        });
      }
    }

    context.throwIfCancelled?.();
    context.reportProgress?.({ value: 0.85, stage: 'recovery-envelope-design-audit' });
    await context.yieldControl?.();
    context.throwIfCancelled?.();
    result = finalizeElasticAnalysis(prepared, byCombo, {
      envelopeOverride: envelopeAccumulator?.finalize(),
      combinationStorage: retainDetailedCombinations
        ? { mode: 'detailed', detailedCombinationCount: prepared.combos.length, sliceCombinationCount: 0 }
        : {
            mode: 'bounded-slices',
            detailedCombinationCount: 0,
            sliceCombinationCount: prepared.combos.length,
            detailAccess: 'result-slice-and-final-envelope',
          },
    });
    sessionBeforeDispose = factorSession.snapshot();
  } finally {
    componentCacheEntryCount = componentCache.size;
    componentCache.clear();
    sessionAfterDispose = factorSession.dispose();
  }

  context.throwIfCancelled?.();
  context.commitBoundary?.({ stage: 'elastic-analysis-complete' });
  context.reportProgress?.({ value: 1, stage: 'complete' });
  return Object.freeze({
    version: PRODUCTION_ELASTIC_ADAPTER_VERSION,
    operation: PRODUCTION_ELASTIC_OPERATION,
    result,
    resultHash: elasticPhysicalParityHash(result),
    domainHash: contracts.domain.domainHash,
    patternHash: contracts.sparsePattern.patternHash,
    contractHash: contracts.contractHash,
    factorPlan,
    execution: Object.freeze({
      combinationCount: prepared.combos.length,
      resultSliceCount: resultSlices.length,
      componentCacheEntryCount,
      factorizationCount: sessionBeforeDispose?.factorizationCount || 0,
      factorGroupCount: sessionBeforeDispose?.factorGroupCount || 0,
      combinationFactorGroupCount: sessionBeforeDispose?.combinationFactorGroupCount || 0,
      solveCount: sessionBeforeDispose?.solveCount || 0,
      reusedSolveCount: sessionBeforeDispose?.reusedSolveCount || 0,
      resourceBalanced: sessionAfterDispose?.backend?.allocationBalanced === true,
      sessionBeforeDispose,
      sessionAfterDispose,
    }),
    resultSlices: Object.freeze(resultSlices),
  });
}

export function elasticPhysicalParityHash(result) {
  return stableHash(physicalResult(result));
}

export function describeProductionElasticAdapter() {
  return Object.freeze({
    version: PRODUCTION_ELASTIC_ADAPTER_VERSION,
    id: PRODUCTION_ELASTIC_BACKEND_ID,
    buildHash: stableHash({ version: PRODUCTION_ELASTIC_ADAPTER_VERSION, operation: PRODUCTION_ELASTIC_OPERATION }),
    family: 'cpu',
    executionTarget: 'cpu',
    numericPrecision: 'f64',
    precisionModes: Object.freeze(['f64']),
    deterministic: true,
    deterministicScope: 'same-domain-same-combination-order-cpu-f64',
    production: true,
    qualification: 'phase9-m3-elastic-production',
    matrixClasses: Object.freeze(['spd']),
    operations: Object.freeze([PRODUCTION_ELASTIC_OPERATION]),
    limits: Object.freeze({ execution: 'worker-only', synchronous: false }),
  });
}

export function createProductionElasticComputeBackend() {
  const descriptor = describeProductionElasticAdapter();
  return Object.freeze({
    ...descriptor,
    descriptor,
    preflight(request = {}) {
      const operation = String(request.operation || request.kind || '');
      const matrixClass = String(request.matrixClass || 'spd').toLowerCase();
      const ok = operation === PRODUCTION_ELASTIC_OPERATION && matrixClass === 'spd';
      return { ok, code: ok ? null : 'PRODUCTION_ELASTIC_OPERATION_UNSUPPORTED', backendId: descriptor.id };
    },
    execute(operation, payload, context) {
      if (String(operation) !== PRODUCTION_ELASTIC_OPERATION) {
        throw elasticAdapterError('PRODUCTION_ELASTIC_OPERATION_UNSUPPORTED', `Unsupported production elastic operation: ${operation}.`);
      }
      return executeProductionElastic(payload, context);
    },
  });
}

export function createProductionElasticExecutor() {
  const backend = createProductionElasticComputeBackend();
  return async function executeProductionElasticJob(job, context) {
    if (job.plan.domainHash !== job.payload?.expectedDomainHash) {
      throw elasticAdapterError('ANALYSIS_PLAN_DOMAIN_MISMATCH', 'Payload must bind to the execution-plan domain hash.');
    }
    if (job.operation?.backendId !== backend.id) {
      throw elasticAdapterError('ANALYSIS_BACKEND_ROUTE_MISMATCH', 'Execution plan selected an unavailable production elastic adapter.');
    }
    return backend.execute(job.operation.kind, job.payload, context);
  };
}

function elasticResultSlice(comboId, result, index) {
  const core = {
    version: PRODUCTION_ELASTIC_ADAPTER_VERSION,
    index,
    comboId,
    ok: result?.ok === true,
    anyOk: result?.anyOk === true,
    memberCount: Object.keys(result?.memberResults || {}).length,
    reactionCount: Object.keys(result?.reactions || {}).length,
    dmax: finiteOrNull(result?.dmax),
    maxRatio: finiteOrNull(result?.maxRatio),
    equilibriumStatus: result?.summary?.equilibriumStatus || null,
    physicalSummaryHash: stableHash({
      comboId,
      ok: result?.ok === true,
      dmax: finiteOrNull(result?.dmax),
      maxRatio: finiteOrNull(result?.maxRatio),
      summary: result?.summary || null,
    }),
  };
  return Object.freeze({ ...core, resultSliceHash: stableHash(core) });
}

function shouldRetainDetailedCombinations(prepared, payload) {
  if (payload.retainDetailedCombinations === true) return true;
  if (payload.retainDetailedCombinations === false) return false;
  const stationCount = Math.max(21, prepared.model.analysisSettings?.memberStations | 0 || 21);
  const estimatedStationRows = (prepared.model.members?.length || 0) * prepared.combos.length * stationCount;
  return estimatedStationRows <= Math.max(1, Number(payload.detailedStationRowLimit || 1_000_000));
}

function compactElasticCombinationResult(result) {
  return {
    ok: result?.ok === true,
    anyOk: result?.anyOk === true,
    reason: result?.reason || null,
    combo: result?.combo || null,
    dmax: finiteOrNull(result?.dmax),
    maxRatio: finiteOrNull(result?.maxRatio),
    ngCount: Number(result?.ngCount || 0),
    okCount: Number(result?.okCount || 0),
    unstableMembers: new Set(result?.unstableMembers || []),
    failedComponents: result?.failedComponents || [],
    summary: result?.summary || null,
    solver: result?.solver || null,
    recovery: result?.recovery || null,
    completeness: result?.completeness || null,
    audit: result?.audit || null,
    provenance: result?.provenance || null,
    eligibility: result?.eligibility || null,
    unilateral: result?.unilateral || null,
    storage: 'bounded-result-slice',
    disp: {},
    reactions: {},
    memberResults: {},
  };
}

function physicalResult(value, seen = new WeakMap()) {
  if (value == null || typeof value !== 'object') return value;
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const output = [];
    seen.set(value, output);
    for (const item of value) output.push(physicalResult(item, seen));
    return output;
  }
  if (value instanceof Set) return [...value].map((item) => physicalResult(item, seen)).sort();
  if (value instanceof Map) return [...value.entries()].map(([key, item]) => [key, physicalResult(item, seen)]);
  const output = {};
  seen.set(value, output);
  for (const key of Object.keys(value).sort()) {
    if (!PHYSICAL_OMIT_FIELDS.has(key)) output[key] = physicalResult(value[key], seen);
  }
  return output;
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

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function elasticAdapterError(code, message) {
  return Object.assign(new Error(message), { code });
}
