import { stableHash } from '../../core/stableHash.js';
import {
  buildDirectPDeltaAnalysis,
  finalizeElasticAnalysis,
  prepareElasticAnalysis,
  solveElasticCombination,
} from '../../solver/linear3d.js';
import { runSecondOrderPDeltaAsync } from '../../solver/pdelta/secondOrder.js';
import { createEnvelopeAccumulator } from '../../solver/linear3dPost.js';
import { prepareAnalysisContracts } from './analysisAdapters.js';
import { classifyElasticFactorGroups, elasticFactorKeyForCombo } from '../elastic/factorGroups.js';
import { createElasticFactorSession } from '../elastic/factorSession.js';
import { createHybridElasticSession, solveElasticCombinationHybrid } from '../elastic/hybridElasticSession.js';
import { createHybridPDeltaTangentSolver } from '../elastic/hybridPDelta.js';
import { createWebGpuPlatform, createWebGpuSpdSession } from '../backends/webgpu/index.js';

export const PRODUCTION_ELASTIC_ADAPTER_VERSION = 'p9-m5-production-elastic-adapter-v2';
export const PRODUCTION_ELASTIC_BACKEND_ID = 'p9-elastic-cpu-production-v1';
export const PRODUCTION_ELASTIC_HYBRID_BACKEND_ID = 'p9-elastic-webgpu-hybrid-candidate-v1';
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
  const route = resolveElasticExecutionRoute(payload, context, prepared);
  const hybridOptions = qualifiedHybridOptions(payload.hybridOptions);
  let ownedPlatform = null;
  const gpuSessionFactory = route.target === 'gpu'
    ? context.gpuSessionFactory || (async (matrix, defaults) => {
        ownedPlatform ||= await createWebGpuPlatform({ label: 'S-Structures P9-M5 elastic analysis' });
        return createWebGpuSpdSession(ownedPlatform, matrix, defaults);
      })
    : null;
  const factorSession = route.target === 'gpu'
    ? createHybridElasticSession({
        gpuSessionFactory,
        ...hybridOptions,
        skipSpdProbe: true,
        spdProof: 'qualified-constrained-elastic-stiffness-contract',
        signal: context.signal,
      })
    : createElasticFactorSession({ maxBytes: payload.maxFactorBytes });
  const retainDetailedCombinations = shouldRetainDetailedCombinations(prepared, payload);
  const envelopeAccumulator = retainDetailedCombinations ? null : createEnvelopeAccumulator(prepared.combos);
  const byCombo = {};
  const linearSeeds = {};
  const resultSlices = [];
  let result;
  let pDeltaOverride = null;
  let pDeltaTangentSolver = null;
  let pDeltaSessionBeforeDispose = null;
  let pDeltaSessionAfterDispose = null;
  let sessionBeforeDispose;
  let sessionAfterDispose;
  let platformBeforeDispose = null;
  let platformAfterDispose = null;
  let componentCacheEntryCount = 0;

  try {
    if (!prepared.terminal) {
      for (let index = 0; index < prepared.combos.length; index += 1) {
        const combo = prepared.combos[index];
        context.throwIfCancelled?.();
        await context.yieldControl?.();
        context.throwIfCancelled?.();
        const factorGroupKey = elasticFactorKeyForCombo(factorPlan, combo.id);
        const comboResult = route.target === 'gpu'
          ? await solveElasticCombinationHybrid(prepared, combo, {
              componentCache,
              hybridSession: factorSession,
              factorGroupKey,
              signal: context.signal,
            })
          : solveElasticCombination(prepared, combo, {
              componentCache,
              factorSession,
              factorGroupKey,
              signal: context.signal,
            });
        envelopeAccumulator?.add(combo, comboResult);
        if (route.target === 'gpu' && prepared.pDeltaMethod === 'direct') linearSeeds[combo.id] = comboResult;
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

    if (!prepared.terminal && route.target === 'gpu' && prepared.pDeltaMethod === 'direct') {
      context.throwIfCancelled?.();
      context.reportProgress?.({ value: 0.81, stage: 'direct-pdelta-hybrid' });
      pDeltaTangentSolver = createHybridPDeltaTangentSolver({
        gpuSessionFactory,
        ...hybridOptions,
        skipSpdProbe: true,
        spdProof: 'cpu-f64-constrained-tangent-stability-check',
        signal: context.signal,
      });
      const runByCombo = {};
      for (const combo of prepared.combos) {
        context.throwIfCancelled?.();
        const run = await runSecondOrderPDeltaAsync(prepared.model, combo.factors, {
          ...(prepared.model.analysisSettings || {}),
          pDeltaMethod: 'direct',
          linear: linearSeeds[combo.id],
          tangentSolver: pDeltaTangentSolver.solve,
        });
        run.provenance = {
          ...(run.provenance || {}),
          computeRoute: 'webgpu-f32-tangent-solve-cpu-f64-audit',
          fallbackUsed: false,
        };
        runByCombo[combo.id] = run;
      }
      pDeltaOverride = buildDirectPDeltaAnalysis(prepared.model, prepared.combos, runByCombo, {
        pDeltaMethod: 'direct',
      });
      pDeltaSessionBeforeDispose = pDeltaTangentSolver.snapshot();
      pDeltaSessionAfterDispose = pDeltaTangentSolver.dispose();
      pDeltaTangentSolver = null;
    }

    context.throwIfCancelled?.();
    context.reportProgress?.({ value: 0.85, stage: 'recovery-envelope-design-audit' });
    await context.yieldControl?.();
    context.throwIfCancelled?.();
    result = finalizeElasticAnalysis(prepared, byCombo, {
      envelopeOverride: envelopeAccumulator?.finalize(),
      pDeltaOverride,
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
    if (pDeltaTangentSolver) {
      pDeltaSessionBeforeDispose ||= pDeltaTangentSolver.snapshot();
      pDeltaSessionAfterDispose = pDeltaTangentSolver.dispose();
    }
    sessionAfterDispose = await factorSession.dispose();
    if (ownedPlatform) {
      platformBeforeDispose = ownedPlatform.snapshot();
      platformAfterDispose = await ownedPlatform.dispose();
    }
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
      target: route.target,
      requestedTarget: route.requestedTarget,
      routeReason: route.reason,
      fallbackUsed: false,
      precisionMode: route.target === 'gpu' ? 'mixed-f32-f64-audited' : 'f64',
      combinationCount: prepared.combos.length,
      resultSliceCount: resultSlices.length,
      componentCacheEntryCount,
      factorizationCount: sessionBeforeDispose?.factorizationCount || 0,
      factorGroupCount: sessionBeforeDispose?.factorGroupCount || 0,
      combinationFactorGroupCount: sessionBeforeDispose?.combinationFactorGroupCount || 0,
      solveCount: sessionBeforeDispose?.solveCount || 0,
      reusedSolveCount: sessionBeforeDispose?.reusedSolveCount || 0,
      correctionSolveCount: sessionBeforeDispose?.correctionSolveCount || 0,
      resourceBalanced: route.target === 'gpu'
        ? sessionAfterDispose?.resourceBalanced === true
          && (!pDeltaSessionAfterDispose || pDeltaSessionAfterDispose.resourceBalanced === true)
          && (!platformAfterDispose || platformAfterDispose.pool?.allocationBalanced === true)
        : sessionAfterDispose?.backend?.allocationBalanced === true,
      sessionBeforeDispose,
      sessionAfterDispose,
      platformBeforeDispose,
      platformAfterDispose,
      pDeltaSessionBeforeDispose,
      pDeltaSessionAfterDispose,
    }),
    resultSlices: Object.freeze(resultSlices),
  });
}

export function elasticPhysicalParityHash(result) {
  return stableHash(physicalResult(result));
}

export function describeProductionElasticAdapter(options = {}) {
  const hybrid = options.executionTarget === 'gpu' || options.hybrid === true;
  return Object.freeze({
    version: PRODUCTION_ELASTIC_ADAPTER_VERSION,
    id: hybrid ? PRODUCTION_ELASTIC_HYBRID_BACKEND_ID : PRODUCTION_ELASTIC_BACKEND_ID,
    buildHash: stableHash({ version: PRODUCTION_ELASTIC_ADAPTER_VERSION, operation: PRODUCTION_ELASTIC_OPERATION, hybrid }),
    family: hybrid ? 'webgpu-hybrid' : 'cpu',
    executionTarget: hybrid ? 'gpu' : 'cpu',
    numericPrecision: hybrid ? 'mixed-f32-f64-audited' : 'f64',
    precisionModes: Object.freeze(hybrid ? ['f32', 'f64-audited'] : ['f64']),
    deterministic: true,
    deterministicScope: hybrid
      ? 'fixed-tree-gpu-f32-with-original-system-cpu-f64-audit'
      : 'same-domain-same-combination-order-cpu-f64',
    production: true,
    qualification: hybrid ? 'G2-hybrid-elastic-implemented-auto-disabled' : 'phase9-m3-elastic-production',
    matrixClasses: Object.freeze(['spd']),
    operations: Object.freeze([PRODUCTION_ELASTIC_OPERATION]),
    limits: Object.freeze({ execution: 'worker-only', synchronous: false }),
  });
}

export function createProductionElasticComputeBackend(options = {}) {
  const descriptor = describeProductionElasticAdapter(options);
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
      return executeProductionElastic({
        ...payload,
        requestedComputeTarget: payload.computeTarget || descriptor.executionTarget,
        computeTarget: descriptor.executionTarget,
      }, context);
    },
  });
}

export function createProductionElasticExecutor() {
  const backends = [
    createProductionElasticComputeBackend(),
    createProductionElasticComputeBackend({ executionTarget: 'gpu' }),
  ];
  return async function executeProductionElasticJob(job, context) {
    if (job.plan.domainHash !== job.payload?.expectedDomainHash) {
      throw elasticAdapterError('ANALYSIS_PLAN_DOMAIN_MISMATCH', 'Payload must bind to the execution-plan domain hash.');
    }
    const backend = backends.find((candidate) => candidate.id === job.operation?.backendId);
    if (!backend) {
      throw elasticAdapterError('ANALYSIS_BACKEND_ROUTE_MISMATCH', 'Execution plan selected an unavailable production elastic adapter.');
    }
    return backend.execute(job.operation.kind, job.payload, context);
  };
}

export function isProductionElasticBackendId(value) {
  return [PRODUCTION_ELASTIC_BACKEND_ID, PRODUCTION_ELASTIC_HYBRID_BACKEND_ID].includes(String(value || ''));
}

export function isElasticAutoGpuProfileEligible(model = {}, profile = {}, pDeltaMethod = null) {
  const dofCount = (model.nodes?.length || 0) * 6;
  const method = String(pDeltaMethod || model.analysisSettings?.pDeltaMethod || '').trim().toLowerCase();
  const hasUnilateralMember = (model.members || []).some((member) => (
    ['tensionOnly', 'compressionOnly'].includes(member.behavior || member.type)
  ));
  return !hasUnilateralMember
    && profile.elasticCandidateApproved === true
    && Number(profile.endToEndSpeedup || 0) >= 1.2
    && dofCount >= Math.max(1, Number(profile.minDofs || 1200))
    && (method !== 'direct' || profile.directPDeltaCandidateApproved === true);
}

function resolveElasticExecutionRoute(payload, context, prepared) {
  const executionTarget = String(payload.computeTarget || 'cpu').trim().toLowerCase();
  const requestedTarget = String(payload.requestedComputeTarget || executionTarget).trim().toLowerCase();
  if (!['cpu', 'gpu', 'auto'].includes(requestedTarget)) {
    throw elasticAdapterError('ELASTIC_COMPUTE_TARGET_INVALID', `Unsupported elastic compute target: ${requestedTarget}.`);
  }
  if (!['cpu', 'gpu', 'auto'].includes(executionTarget)) {
    throw elasticAdapterError('ELASTIC_COMPUTE_TARGET_INVALID', `Unsupported elastic execution target: ${executionTarget}.`);
  }
  if (requestedTarget === 'auto' && executionTarget !== 'auto') {
    const eligible = isElasticAutoGpuProfileEligible(
      prepared.model,
      payload.computeProfile || {},
      prepared.pDeltaMethod,
    );
    const expectedTarget = eligible ? 'gpu' : 'cpu';
    if (executionTarget !== expectedTarget) {
      throw elasticAdapterError('ANALYSIS_BACKEND_ROUTE_MISMATCH', 'The planned elastic backend does not match the qualified auto route.');
    }
    return {
      target: executionTarget,
      requestedTarget,
      reason: eligible ? 'qualified-profile-threshold' : 'auto-profile-not-qualified',
    };
  }
  if (requestedTarget === 'cpu') return { target: 'cpu', requestedTarget, reason: 'explicit-cpu' };
  if (requestedTarget === 'auto') {
    const eligible = isElasticAutoGpuProfileEligible(
      prepared.model,
      payload.computeProfile || {},
      prepared.pDeltaMethod,
    );
    return eligible
      ? { target: 'gpu', requestedTarget, reason: 'qualified-profile-threshold' }
      : { target: 'cpu', requestedTarget, reason: 'auto-profile-not-qualified' };
  }
  if ((prepared.model.members || []).some((member) => ['tensionOnly', 'compressionOnly'].includes(member.behavior || member.type))) {
    throw elasticAdapterError('HYBRID_ELASTIC_UNILATERAL_UNSUPPORTED', 'Explicit GPU execution does not support unilateral active-set members in P9-M5.');
  }
  return { target: 'gpu', requestedTarget, reason: 'explicit-gpu-no-fallback' };
}

function qualifiedHybridOptions(input = {}) {
  const requestedF64 = Number(input.f64Tolerance);
  const requestedLoad = Number(input.loadResidualTolerance);
  const requestedCorrections = Number(input.maxCorrections);
  return {
    ...input,
    f64Tolerance: Number.isFinite(requestedF64) && requestedF64 > 0
      ? Math.min(requestedF64, 1e-10)
      : 1e-10,
    loadResidualTolerance: Number.isFinite(requestedLoad) && requestedLoad > 0
      ? Math.min(requestedLoad, 1e-9)
      : 1e-9,
    maxCorrections: Number.isInteger(requestedCorrections) && requestedCorrections >= 0
      ? Math.max(requestedCorrections, 4)
      : 4,
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
