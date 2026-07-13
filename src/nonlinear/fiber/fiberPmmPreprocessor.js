import {
  buildMemberFiberInteraction,
  buildModelFiberPmmInteractions,
  createMemberFiberInteractionCacheKey,
  isOptionalUnsupportedFiberSourceError,
  planModelFiberPmmInteractions,
} from './memberInteraction.js';
import { createPmmInteractionCache } from './pmmInteractionCache.js';
import { createWorkerClient } from '../runtime/workerClient.js';
import { WORKER_TASK_TYPES } from '../runtime/protocol.js';

export const FIBER_PMM_PREPROCESSOR_VERSION = 'p8-m6.1-fiber-pmm-preprocessor-v1';

const defaultCache = createPmmInteractionCache();

export async function prepareModelFiberPmmInteractions(model = {}, options = {}) {
  const modelSnapshot = clone(model);
  const plans = planModelFiberPmmInteractions(modelSnapshot, options);
  const planSignature = signatureOfPlans(plans);
  const preflight = preflightFiberPmmWorkload(modelSnapshot, plans, options);
  if (!preflight.ok) throw preprocessorError(preflight.code, preflight.message, preflight);
  report(options, { stage: 'fiber-pmm-preflight', completed: 1, total: 1, ratio: 1, preflight });
  const cache = options.cache || defaultCache;
  const cacheStatsBefore = typeof cache.stats === 'function' ? cache.stats() : null;
  const seeds = new Map();
  const misses = [];
  const skippedInteractions = new Map();

  for (let index = 0; index < plans.length; index += 1) {
    throwIfCancelled(options);
    const plan = plans[index];
    const cached = options.cacheEnabled === false ? null : await cache.get(plan.cacheKey, plan.cacheIdentity);
    if (cached) {
      seeds.set(plan.cacheKey, cached);
    } else {
      misses.push(plan);
    }
    report(options, {
      stage: 'fiber-pmm-cache-lookup',
      completed: index + 1,
      total: plans.length,
      ratio: plans.length ? (index + 1) / plans.length : 1,
      cacheHit: Boolean(cached),
      cacheKey: plan.cacheKey,
    });
  }

  let executionMode = misses.length ? 'local-cooperative' : 'cache-only';
  if (misses.length) {
    const worker = resolveWorkerClient(options);
    if (!worker.client && options.requireWorker === true) {
      throw preprocessorError('PMM_WORKER_REQUIRED', 'Production PMM preprocessing requires an available dedicated Worker.');
    }
    executionMode = worker.client ? 'worker' : 'local-cooperative';
    try {
      const skippedKeys = new Set();
      const safeOptions = workerSafeOptions(options);
      for (let missIndex = 0; missIndex < misses.length; missIndex += 1) {
        throwIfCancelled(options);
        const plan = misses[missIndex];
        const payload = {
          version: FIBER_PMM_PREPROCESSOR_VERSION,
          model: modelSnapshot,
          plans: [{
            cacheKey: plan.cacheKey,
            representativeMemberId: plan.representativeMemberId,
            memberIds: [...plan.memberIds],
          }],
          planOffset: missIndex,
          totalPlanCount: misses.length,
          options: safeOptions,
        };
        const computed = worker.client
          ? await runWorkerComputation(worker.client, payload, options, { terminateOnAbort: worker.owned })
          : await runFiberPmmWorkerTask(payload, localTaskContext(options));
        for (const entry of computed.entries || []) {
          if (entry.cacheKey !== plan.cacheKey) {
            throw preprocessorError('PMM_WORKER_RESULT_UNEXPECTED', 'Worker returned an unrequested PMM cache key.');
          }
          throwIfCancelled(options);
          const stored = options.cacheEnabled === false
            ? entry.interaction
            : await cache.set(entry.cacheKey, entry.interaction, plan.cacheIdentity);
          if (cancelled(options)) {
            if (options.cacheEnabled !== false) await cache.delete(entry.cacheKey);
            throwIfCancelled(options);
          }
          seeds.set(entry.cacheKey, stored);
          report(options, {
            stage: 'fiber-pmm-cache-commit',
            completed: missIndex + 1,
            total: misses.length,
            ratio: (missIndex + 1) / misses.length,
            cacheKey: entry.cacheKey,
          });
        }
        for (const row of computed.skipped || []) {
          skippedKeys.add(row.cacheKey);
          skippedInteractions.set(row.cacheKey, row);
        }
      }
      if (misses.some((plan) => !seeds.has(plan.cacheKey) && !skippedKeys.has(plan.cacheKey))) {
        throw preprocessorError('PMM_WORKER_RESULT_INCOMPLETE', 'PMM preprocessing did not return every requested unique interaction.');
      }
    } finally {
      if (worker.owned) await worker.client?.dispose?.();
    }
  }

  throwIfCancelled(options);
  if (signatureOfPlans(planModelFiberPmmInteractions(model, options)) !== planSignature) {
    throw preprocessorError(
      'PMM_SOURCE_CHANGED_DURING_PREPROCESSING',
      'Fiber PMM source assignments changed while preprocessing; the stale artifact was discarded.',
    );
  }
  const catalog = buildModelFiberPmmInteractions(modelSnapshot, {
    ...options,
    precomputedInteractions: seeds,
    precomputedSkippedInteractions: skippedInteractions,
    precomputedOnly: true,
  });
  const cacheStatsAfter = typeof cache.stats === 'function' ? cache.stats() : null;
  const memoryHitCount = counterDelta(cacheStatsBefore, cacheStatsAfter, 'memoryHits');
  const persistentHitCount = counterDelta(cacheStatsBefore, cacheStatsAfter, 'persistentHits');
  const preprocessing = {
    version: FIBER_PMM_PREPROCESSOR_VERSION,
    executionMode,
    uniqueInteractionCount: plans.length,
    computedInteractionCount: misses.length,
    cacheHitCount: memoryHitCount + persistentHitCount,
    memoryHitCount,
    persistentHitCount,
    deduplicatedMemberCount: plans.reduce((count, plan) => count + Math.max(0, plan.memberIds.length - 1), 0),
    cacheEnabled: options.cacheEnabled !== false,
    preflight,
    cache: cacheStatsAfter,
  };
  return deepFreeze({
    ...catalog,
    summary: { ...catalog.summary, preprocessing },
    preprocessing,
  });
}

export function preflightFiberPmmWorkload(model = {}, plansInput = null, options = {}) {
  const plans = Array.isArray(plansInput) ? plansInput : planModelFiberPmmInteractions(model, options);
  const angleCount = Array.isArray(options.angles) ? options.angles.length : Math.max(4, Number(options.angleCount ?? 8));
  const axialLevelCount = Array.isArray(options.axialLevels) ? options.axialLevels.length : 3;
  const curvatureCount = Array.isArray(options.curvatures)
    ? options.curvatures.length
    : Math.max(3, Number(options.curvatureSteps ?? 16) + 1);
  const directionIterations = Math.max(1, Number(options.directionIterations ?? 12));
  const capacityIterations = Math.max(4, Number(options.capacityIterations ?? 18));
  const bracketSamples = Math.max(4, Number(options.bracketSamples ?? 64));
  let estimatedFiberCount = 0;
  for (const plan of plans) {
    const member = (model.members || []).find((row) => String(row.id) === String(plan.representativeMemberId));
    const section = sourceRecord(model.sections, member?.secId);
    const reinforcement = options.reinforcementSnapshots?.[member?.id] || member?.nonlinear?.reinforcementSnapshot || null;
    estimatedFiberCount += estimateSectionFiberCount(section, reinforcement, options);
  }
  const estimatedSectionSolves = plans.length * axialLevelCount * angleCount
    * (curvatureCount + capacityIterations + 2) * (1 + Math.min(6, directionIterations));
  const estimatedFiberEvaluations = estimatedFiberCount * estimatedSectionSolves * Math.min(16, bracketSamples + 1);
  const estimatedResultBytes = plans.length * axialLevelCount * angleCount * 1024 + estimatedFiberCount * 768;
  const limits = {
    uniqueInteractionCount: Math.max(1, Number(options.maxUniqueInteractions ?? 256)),
    fiberEvaluations: Math.max(1, Number(options.maxEstimatedFiberEvaluations ?? 1e11)),
    resultBytes: Math.max(1, Number(options.maxEstimatedPmmResultBytes ?? 256 * 1024 * 1024)),
  };
  let code = null;
  if (plans.length > limits.uniqueInteractionCount) code = 'PMM_PREFLIGHT_UNIQUE_INTERACTION_LIMIT';
  else if (estimatedFiberEvaluations > limits.fiberEvaluations) code = 'PMM_PREFLIGHT_WORK_LIMIT';
  else if (estimatedResultBytes > limits.resultBytes) code = 'PMM_PREFLIGHT_RESULT_MEMORY_LIMIT';
  return Object.freeze({
    version: FIBER_PMM_PREPROCESSOR_VERSION,
    ok: !code,
    code,
    message: code ? `Fiber PMM preprocessing was blocked by ${code}.` : null,
    estimates: Object.freeze({
      uniqueInteractionCount: plans.length,
      estimatedFiberCount,
      estimatedSectionSolves,
      estimatedFiberEvaluations,
      estimatedResultBytes,
    }),
    limits: Object.freeze(limits),
  });
}

/** Worker-side task. One unique interaction is the cancellation/commit boundary. */
export async function runFiberPmmWorkerTask(payload = {}, context = {}) {
  if (payload.version !== FIBER_PMM_PREPROCESSOR_VERSION) {
    throw preprocessorError('PMM_WORKER_PAYLOAD_VERSION_INVALID', 'Fiber PMM worker payload version is invalid.');
  }
  const model = payload.model || {};
  const options = payload.options || {};
  const members = new Map((model.members || []).map((member) => [String(member.id), member]));
  const plans = Array.isArray(payload.plans) ? payload.plans : [];
  const planOffset = Math.max(0, Math.trunc(Number(payload.planOffset || 0)));
  const totalPlanCount = Math.max(plans.length, Math.trunc(Number(payload.totalPlanCount || plans.length)));
  const entries = [];
  const skipped = [];
  for (let index = 0; index < plans.length; index += 1) {
    context.throwIfCancellationRequested?.();
    const plan = plans[index];
    const member = members.get(String(plan.representativeMemberId));
    if (!member) throw preprocessorError('PMM_WORKER_MEMBER_MISSING', `Representative member ${plan.representativeMemberId} is unavailable.`);
    const cacheKey = createMemberFiberInteractionCacheKey(model, member, options);
    if (cacheKey !== plan.cacheKey) {
      throw preprocessorError('PMM_WORKER_CACHE_KEY_MISMATCH', 'Worker input changed after the PMM cache key was created.');
    }
    let interaction;
    try {
      interaction = buildMemberFiberInteraction(model, member, {
        ...options,
        reinforcementSnapshot: options.reinforcementSnapshots?.[member.id]
          || member.nonlinear?.reinforcementSnapshot
          || null,
        shouldCancel: () => context.isCancellationRequested?.() === true,
        onProgress(progress) {
          context.reportProgress?.({
            ...progress,
            stage: `fiber-pmm-${progress.stage || 'surface'}`,
            uniqueInteractionIndex: planOffset + index,
            uniqueInteractionCount: totalPlanCount,
            memberId: member.id,
            cacheKey,
          });
        },
      });
    } catch (error) {
      const optional = isOptionalUnsupportedFiberSourceError(error?.code);
      if (options.strict === true || (options.strict !== false && !optional)) throw error;
      skipped.push({ cacheKey, memberId: member.id, code: error?.code || 'FIBER_PMM_BUILD_FAILED', message: error?.message || String(error) });
      context.reportProgress?.({
        stage: 'fiber-pmm-interaction-skipped',
        completed: planOffset + index + 1,
        total: totalPlanCount,
        memberId: member.id,
        cacheKey,
        code: error?.code || 'FIBER_PMM_BUILD_FAILED',
      });
      await context.yieldControl?.();
      continue;
    }
    entries.push({ cacheKey, representativeMemberId: member.id, interaction });
    context.reportProgress?.({
      stage: 'fiber-pmm-interaction-complete',
      completed: planOffset + index + 1,
      total: totalPlanCount,
      ratio: totalPlanCount ? (planOffset + index + 1) / totalPlanCount : 1,
      memberId: member.id,
      cacheKey,
    });
    await context.yieldControl?.();
  }
  return deepFreeze({
    version: FIBER_PMM_PREPROCESSOR_VERSION,
    entries,
    skipped,
    summary: { uniqueInteractionCount: plans.length, completedInteractionCount: entries.length, skippedInteractionCount: skipped.length },
  });
}

async function runWorkerComputation(client, payload, options, control = {}) {
  const run = client.run(WORKER_TASK_TYPES.buildFiberPmm, payload, {
    onProgress: (progress) => report(options, progress),
  });
  const abort = () => {
    if (control.terminateOnAbort) void Promise.resolve(client.dispose?.()).catch(() => {});
    else void run.cancel?.().catch(() => {});
  };
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener?.('abort', abort, { once: true });
  try {
    return await run;
  } catch (error) {
    if (options.signal?.aborted === true) {
      throw preprocessorError('PMM_GENERATION_CANCELLED', 'Fiber PMM Worker was terminated after cancellation.', {
        causeCode: error?.code || null,
      });
    }
    throw error;
  } finally {
    options.signal?.removeEventListener?.('abort', abort);
  }
}

function resolveWorkerClient(options) {
  if (options.workerClient) return { client: options.workerClient, owned: false };
  if (options.useWorker === false || typeof Worker !== 'function' || typeof document === 'undefined') {
    return { client: null, owned: false };
  }
  try {
    const workerUrl = new URL('../runtime/analysisWorker.js', import.meta.url);
    workerUrl.searchParams.set('role', 'fiber-pmm');
    return {
      client: createWorkerClient({
        workerFactory: () => new Worker(workerUrl, { type: 'module' }),
      }),
      owned: true,
    };
  } catch {
    return { client: null, owned: false };
  }
}

function localTaskContext(options) {
  return {
    throwIfCancellationRequested: () => throwIfCancelled(options),
    isCancellationRequested: () => cancelled(options),
    reportProgress: (progress) => report(options, progress),
    commitBoundary: () => null,
    yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
}

function workerSafeOptions(options) {
  const keys = [
    'inputLengthUnit', 'refinement', 'maxCellSize', 'maxCellSizeUnit', 'sourcePropertyTolerance',
    'angles', 'angleCount', 'curvatures', 'curvatureMax', 'curvatureSteps', 'axialLevels',
    'axialTolerance', 'axialAbsoluteTolerance', 'directionTolerance', 'directionIterations', 'capacityTolerance',
    'capacityIterations', 'capacityCurvatureTolerance', 'forceTolerance', 'relativeTolerance', 'maxIterations',
    'epsilonBracket', 'initialBracket', 'bracketExpansion', 'maxBracketExpansions', 'bracketSamples',
    'compressionStrainLimit', 'tensionStrainLimit', 'axialCapacitySamples', 'axialCapacityIterations',
    'steelHardeningRatio', 'rebarHardeningRatio', 'concreteTensionStrength', 'reinforcementSnapshots', 'strict',
  ];
  return Object.fromEntries(keys
    .filter((key) => options[key] !== undefined)
    .map((key) => [key, clone(options[key])]));
}

function estimateSectionFiberCount(section = {}, reinforcement = null, options = {}) {
  const shape = String(section?.shape || section?.type || '').toUpperCase();
  const refinement = typeof options.refinement === 'number' ? { level: options.refinement } : options.refinement || {};
  const level = Math.max(1, Number(refinement.level ?? 1));
  const longitudinal = Math.max(1, Number(refinement.longitudinal ?? 8 * level));
  const thickness = Math.max(1, Number(refinement.thickness ?? 2 * level));
  const sectors = Math.max(8, Number(refinement.sectors ?? 32 * level));
  const radial = Math.max(1, Number(refinement.radial ?? 2 * level));
  const rc = Math.max(2, Number(refinement.rcDivisions ?? 8 * level));
  if (shape === 'PIPE') return Math.ceil(sectors * radial);
  if (shape === 'H') return Math.ceil(2 * longitudinal * thickness + longitudinal * thickness);
  if (shape === 'BOX') return Math.ceil(2 * longitudinal * thickness + 2 * longitudinal * thickness);
  if (['RECT', 'SQUARE'].includes(shape)) {
    const barCount = Array.isArray(reinforcement?.bars) ? reinforcement.bars.length : 0;
    return Math.ceil((rc + 2 * barCount + 6) ** 2 + barCount);
  }
  return 1;
}

function sourceRecord(records, reference) {
  const [id, versionText] = String(reference || '').split('@');
  const version = versionText == null ? null : Number(versionText);
  return (records || [])
    .filter((row) => String(row.id) === id && (version == null || Number(row.version) === version))
    .sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0] || null;
}

function report(options, progress) {
  if (typeof options.onProgress !== 'function') return;
  try {
    options.onProgress(Object.freeze({
      type: 'fiber-pmm-preprocessing',
      ...progress,
    }));
  } catch (error) {
    options.onProgressError?.(error);
  }
}

function cancelled(options) {
  return options.signal?.aborted === true
    || options.cancellation?.requested === true
    || options.isCancelled?.() === true
    || options.shouldCancel?.() === true;
}

function throwIfCancelled(options) {
  if (!cancelled(options)) return;
  throw preprocessorError('PMM_GENERATION_CANCELLED', 'Fiber PMM preprocessing was cancelled.');
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function signatureOfPlans(plans) {
  return JSON.stringify((plans || []).map((plan) => ({
    cacheKey: plan.cacheKey,
    memberIds: [...(plan.memberIds || [])].map(String).sort(),
  })).sort((a, b) => a.cacheKey.localeCompare(b.cacheKey)));
}

function counterDelta(before, after, key) {
  return Math.max(0, Number(after?.[key] || 0) - Number(before?.[key] || 0));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function preprocessorError(code, message, details = null) {
  const error = new Error(message);
  error.name = 'FiberPmmPreprocessorError';
  error.code = code;
  error.details = details;
  return error;
}
