import { stableHash } from '../../core/stableHash.js';
import { createAnalysisRunRecord } from '../../core/analysisRunRecord.js';
import { createNonlinearResidentSession } from '../../compute/nonlinear/index.js';
import { prepareModelFiberPmmInteractions } from '../fiber/fiberPmmPreprocessor.js';
import { createNonlinearStateStore, createStateCheckpoint, restoreStateCheckpoint } from '../core/stateStore.js';
import { buildHingedFrame3dEntries } from '../elements/hingedFrame3d.js';
import { createEquilibriumAssembler } from '../equilibrium/assembler.js';
import { createWasmSparseBackend } from '../equilibrium/backends/wasmSparseBackend.js';
import {
  resolvePhysicalControlCoordinate,
  evaluatePhysicalControlCoordinate,
  runMdofDisplacementControl,
} from '../equilibrium/displacementControl.js';
import {
  buildArcLengthScaling,
  runMdofArcLength,
} from '../equilibrium/arcLength.js';
import { resolveDomainHingeAssignments } from '../properties/assignments.js';
import {
  runNonlinearGravityPreload,
  validateNonlinearInitialStateDependency,
} from '../workflow/initialState.js';
import { NONLINEAR_ENGINE_IDS } from '../capabilities.js';
import {
  buildNonlinearDesignTransferGuard,
  evaluateNonlinearIntegrationCapabilities,
} from '../integration/index.js';
import { buildPushoverLoadSet } from './loadPatterns.js';
import {
  buildProductionPushoverResult,
  compactPushoverStepIntegration,
  hingeSummary,
  recoverPushoverStep,
} from './results.js';

export const PRODUCTION_PUSHOVER_VERSION = 'p8-m7-production-pushover-v2';
export const PRODUCTION_PUSHOVER_ENGINE_VERSION = 'p8-m7-mdof-gravity-displacement-arc-pushover-v2';

export async function runProductionPushover(model = {}, analysisCase = {}, options = {}) {
  const engine = Object.freeze({
    id: NONLINEAR_ENGINE_IDS.productionPushover,
    version: PRODUCTION_PUSHOVER_ENGINE_VERSION,
    formulation: {
      geometry: 'objective-corotational-3d',
      material: 'state-dependent-concentrated-or-distributed-fiber-plasticity',
      equilibrium: 'current-step-mdof-consistent-tangent',
      control: 'augmented-displacement-with-optional-crisfield-arc-length-continuation',
      gravity: 'nonlinear-load-control-predecessor',
    },
  });
  const production = options.production !== false;
  let backend = options.backend || null;
  let residentSession = null;
  let residentFinalized = false;
  try {
    const merged = mergeOptions(analysisCase, options);
    const targetDisplacement = Number(merged.targetDisplacement);
    if (!Number.isFinite(targetDisplacement) || !(targetDisplacement > 0)) {
      return blocked(engine, 'PUSHOVER_TARGET_DISPLACEMENT_REQUIRED', 'A positive control target is required.');
    }
    const modelHashAtStart = stableHash(model);
    const loadSet = buildPushoverLoadSet(model, analysisCase, merged);
    const integrationCapability = evaluateNonlinearIntegrationCapabilities(loadSet.domain, { mode: 'static' });
    if (!integrationCapability.ok) {
      const first = integrationCapability.blocking[0];
      return blocked(engine, first.code, first.message, integrationCapability);
    }
    const fiberPmm = merged.pmmInteractions
      ? externalFiberPmm(merged.pmmInteractions, model)
      : merged.fiberPmm === false ? disabledFiberPmm() : await prepareModelFiberPmmInteractions(model, {
        ...(merged.fiberPmm || {}),
        reinforcementSnapshots: merged.reinforcementSnapshots,
        strict: merged.fiberPmm?.strict,
        cache: options.pmmCache || merged.fiberPmm?.cache,
        cacheEnabled: merged.fiberPmm?.cacheEnabled,
        workerClient: options.pmmWorkerClient || merged.fiberPmm?.workerClient,
        useWorker: merged.fiberPmm?.useWorker,
        requireWorker: production && typeof document !== 'undefined'
          ? true
          : merged.fiberPmm?.requireWorker,
        signal: options.signal,
        isCancelled: options.isCancelled,
        onProgress: options.onProgress,
      });
    if (stableHash(model) !== modelHashAtStart) {
      const error = new Error('The nonlinear model changed while fiber PMM preprocessing was running.');
      error.code = 'PMM_SOURCE_CHANGED_DURING_PREPROCESSING';
      throw error;
    }
    if (!backend) backend = await createWasmSparseBackend(options.wasm || {});
    const pmmInteractions = merged.pmmInteractions || fiberPmm.interactions;
    const hingeResolution = resolveDomainHingeAssignments(loadSet.domain, {
      axialRatios: merged.axialRatios,
      assumedPolicy: merged.assumedPolicy,
      pmmInteractions,
    });
    const elements = buildHingedFrame3dEntries(loadSet.domain, {
      assignmentResolution: hingeResolution,
      fiberSections: fiberPmm.byMember,
      stationCount: merged.stationCount,
      integrationPoints: merged.fiberPmm?.integrationPoints,
    });
    const gravityHingeResolution = resolveDomainHingeAssignments(loadSet.gravityDomain, {
      axialRatios: merged.axialRatios,
      assumedPolicy: merged.assumedPolicy,
      pmmInteractions,
    });
    const gravityElements = buildHingedFrame3dEntries(loadSet.gravityDomain, {
      assignmentResolution: gravityHingeResolution,
      fiberSections: fiberPmm.byMember,
      stationCount: merged.stationCount,
      integrationPoints: merged.fiberPmm?.integrationPoints,
    });
    const assembler = createEquilibriumAssembler({
      domain: loadSet.domain,
      elements,
      loadPattern: loadSet.loadPattern,
    });
    const gravity = await resolveGravityState({
      model,
      analysisCase,
      merged,
      loadSet,
      elements,
      gravityElements,
      assembler,
      backend,
      production,
      options,
    });
    if (!gravity.ok) return failed(engine, gravity.reason || 'GRAVITY_PRELOAD_FAILED', gravity.message, gravity);
    const residentInitialCheckpoint = createStateCheckpoint(gravity.stateStore, {
      role: 'p9-m8-pushover-resident-initial',
      caseId: analysisCase.id || null,
      gravityCheckpointHash: gravity.checkpoint?.integrityHash || null,
    });
    residentSession = createNonlinearResidentSession({
      runId: clean(options.runId || options.runRecordId) || `${analysisCase.id || 'PUSHOVER'}:resident`,
      kind: 'pushover',
      assembler,
      stateStore: gravity.stateStore,
      checkpoint: residentInitialCheckpoint,
      production,
      computeTarget: merged.computeTarget || merged.backendPreference || 'auto',
      ...(merged.residentSession || {}),
    });
    const controlNodeId = clean(merged.controlNodeId) || pickControlNode(loadSet.domain, loadSet.lateral.directionVector);
    const control = resolvePhysicalControlCoordinate(loadSet.domain, {
      nodeId: controlNodeId,
      direction: loadSet.lateral.directionVector,
    });
    const initialEvaluation = await assembler.evaluate({
      q: gravity.stateStore.committed.q,
      lambda: 0,
      committedElementStates: gravity.stateStore.committed.elementStates,
      mode: 'static',
    });
    if (!initialEvaluation.ok) {
      const error = new Error(initialEvaluation.message || 'Pushover initial evaluation failed.');
      error.code = initialEvaluation.reason || 'PUSHOVER_INITIAL_EVALUATION_FAILED';
      throw error;
    }
    residentSession.auditEvaluation(initialEvaluation, { mode: 'pushover-initial' });
    const recovered = [recoverPushoverStep({
      domain: loadSet.domain,
      evaluation: initialEvaluation,
      loadSet,
      control,
      step: 0,
      targetDisplacement: evaluatePhysicalControlCoordinate(control, initialEvaluation.q),
      convergence: gravity.continuity,
      hingeEvents: [],
      gravityBaselineReactions: initialEvaluation.reactionsFull,
      model,
      analysisCase,
      capability: integrationCapability,
    })];
    let peakBaseShear = 0;
    let peakStep = 0;
    const displacement = await runMdofDisplacementControl({
      assembler,
      stateStore: gravity.stateStore,
      backend,
      production,
      control,
      targetDisplacement,
      signal: options.signal,
      isCancelled: options.isCancelled,
      onProgress: options.onProgress,
      onCommit(accepted) {
        residentSession.acceptBoundary(accepted.stateStore, {
          source: 'pushover-displacement',
          evaluation: accepted.evaluation,
          hingeEvents: accepted.hingeEvents,
          mode: 'pushover',
        });
        options.onCommit?.(accepted);
      },
      onReject(rejected) {
        residentSession.rejectBoundary(rejected.reason, { source: 'pushover-displacement', attempt: rejected.attempt });
        options.onReject?.(rejected);
      },
      options: displacementOptions(merged),
      shouldTerminate(accepted) {
        const summary = hingeSummary(accepted.evaluation);
        const mechanism = mechanismReached(summary.rows, summary.memberStates, merged);
        if (mechanism) return { stop: true, ok: true, reason: 'MECHANISM_DETECTED', hingeIds: mechanism };
        const baseShear = Math.abs(reactionBaseShear(
          accepted.evaluation.reactionsFull,
          initialEvaluation.reactionsFull,
          loadSet.lateral.directionVector,
          loadSet.domain.nodes.length,
        ));
        if (baseShear > peakBaseShear) {
          peakBaseShear = baseShear;
          peakStep = accepted.step;
        }
        const postPeakRatio = bounded(merged.postPeakRatio, 0.8, 0.05, 1);
        if (
          merged.stopAtPostPeak !== false
          && accepted.step > peakStep
          && peakBaseShear > 0
          && baseShear <= peakBaseShear * postPeakRatio
        ) {
          return { stop: true, ok: true, reason: 'POST_PEAK_THRESHOLD', peakBaseShear, postPeakRatio };
        }
        return null;
      },
    });
    if (displacement.status === 'cancelled' || /_CALLBACK_FAILED$/.test(displacement.reason || '')) {
      const error = new Error(displacement.reason || 'Pushover displacement-control run failed.');
      error.code = displacement.reason || 'ANALYSIS_CANCELLED';
      error.details = displacement;
      throw error;
    }
    for (const accepted of displacement.acceptedSteps || []) {
      appendRecoveredStep(recovered, recoverPushoverStep({
        domain: loadSet.domain,
        evaluation: accepted.evaluation,
        loadSet,
        control,
        step: accepted.step,
        targetDisplacement: accepted.targetDisplacement,
        convergence: accepted.convergence,
        hingeEvents: accepted.hingeEvents,
        gravityBaselineReactions: initialEvaluation.reactionsFull,
        model,
        analysisCase,
        capability: integrationCapability,
      }));
    }
    const handoffCheckpoint = displacement.stateStore?.committed
      ? createStateCheckpoint(displacement.stateStore, {
        role: 'pushover-displacement-control-handoff',
        caseId: analysisCase.id || null,
        terminationReason: displacement.reason,
      })
      : null;
    if (handoffCheckpoint) residentSession.recordCheckpoint(handoffCheckpoint, { source: 'pushover-displacement-handoff' });
    let arcLengthResult = null;
    const arcEnabled = merged.arcLength?.enabled === true;
    if (arcEnabled) {
      const displacementResult = buildProductionPushoverResult({
        model,
        analysisCase,
        domain: loadSet.domain,
        loadSet,
        gravity,
        control,
        controlResult: displacement,
        steps: recovered,
        hingeResolution,
        fiberPmm,
        backend,
        engine,
        handoffCheckpoint,
        options: { ...merged, prepareArcLengthHandoff: true },
      });
      const arcConfiguration = productionArcLengthConfiguration(
        loadSet.domain,
        displacementResult.arcLengthHandoff,
        merged,
      );
      arcLengthResult = await runMdofArcLength({
        assembler,
        stateStore: displacement.stateStore,
        checkpoint: handoffCheckpoint,
        handoff: displacementResult.arcLengthHandoff,
        backend,
        production,
        scaling: arcConfiguration.scaling,
        signal: options.signal,
        isCancelled: options.isCancelled,
        onProgress: options.onProgress,
        onCommit(accepted) {
          residentSession.acceptBoundary(accepted.stateStore, {
            source: 'pushover-arc-length',
            evaluation: accepted.evaluation,
            hingeEvents: accepted.hingeEvents,
            mode: 'pushover',
          });
          options.onCommit?.(accepted);
        },
        onReject(rejected) {
          residentSession.rejectBoundary(rejected.reason, { source: 'pushover-arc-length', attempt: rejected.attempt });
          options.onReject?.(rejected);
        },
        options: arcConfiguration.options,
        shouldTerminate(accepted) {
          const summary = hingeSummary(accepted.evaluation);
          const mechanism = mechanismReached(summary.rows, summary.memberStates, merged);
          return mechanism
            ? { stop: true, ok: true, reason: 'MECHANISM_DETECTED', hingeIds: mechanism }
            : null;
        },
      });
      if (arcLengthResult.status === 'cancelled' || /_CALLBACK_FAILED$/.test(arcLengthResult.reason || '')) {
        const error = new Error(arcLengthResult.reason || 'Pushover arc-length run failed.');
        error.code = arcLengthResult.reason || 'ANALYSIS_CANCELLED';
        error.details = arcLengthResult;
        throw error;
      }
      for (const accepted of arcLengthResult.acceptedSteps || []) {
        appendRecoveredStep(recovered, recoverPushoverStep({
          domain: loadSet.domain,
          evaluation: accepted.evaluation,
          loadSet,
          control,
          step: recovered.length,
          targetDisplacement: evaluatePhysicalControlCoordinate(control, accepted.q),
          convergence: accepted.convergence,
          hingeEvents: accepted.hingeEvents,
          gravityBaselineReactions: initialEvaluation.reactionsFull,
          model,
          analysisCase,
          capability: integrationCapability,
        }));
      }
      if (arcLengthResult.restartCheckpoint) {
        residentSession.recordCheckpoint(arcLengthResult.restartCheckpoint, { source: 'pushover-arc-length-restart' });
      }
    }
    const result = buildProductionPushoverResult({
      model,
      analysisCase,
      domain: loadSet.domain,
      loadSet,
      gravity,
      control,
      controlResult: displacement,
      arcLengthResult,
      steps: recovered,
      hingeResolution,
      fiberPmm,
      backend,
      engine,
      handoffCheckpoint,
      options: { ...merged, acceptExplicitTermination: arcEnabled || merged.acceptExplicitTermination === true },
    });
    const governedResult = Object.freeze({
      ...result,
      version: PRODUCTION_PUSHOVER_VERSION,
      capability: {
        available: true,
        production: true,
        qualification: 'candidate',
        supportedControls: ['displacement', 'arcLength'],
      },
      integrationCapability,
      routing: {
        requestedEngineId: engine.id,
        executedEngineId: engine.id,
        fallbackPolicy: 'forbidden',
        fallbackUsed: false,
      },
      provenance: {
        ...result.provenance,
        caseId: analysisCase.id || null,
        caseHash: stableHash(analysisCase).slice(0, 24),
      },
      internal: options.includeInternal === true ? {
        stateStore: arcLengthResult?.stateStore || displacement.stateStore,
        handoffCheckpoint,
        arcLengthRestartCheckpoint: arcLengthResult?.restartCheckpoint || null,
        loadSet,
        fiberPmm,
      } : undefined,
    });
    const designTransferGuard = buildNonlinearDesignTransferGuard(
      governedResult,
      { model, domain: loadSet.domain, analysisCase, loadSetHash: loadSet.loadSetHash },
      analysisCase,
    );
    const compute = residentSession.finalize(result.ok === false ? 'terminated' : 'completed', {
      caseId: analysisCase.id || null,
      reason: result.reason || null,
      acceptedStepCount: displacement.acceptedStepCount + Number(arcLengthResult?.acceptedStepCount || 0),
    });
    residentFinalized = true;
    const finalResult = Object.freeze({ ...governedResult, compute, designTransferGuard });
    const runRecord = Object.freeze(createAnalysisRunRecord({
      model,
      analysisCase,
      result: finalResult,
      attemptId: clean(options.runRecordId) || `${analysisCase.id || 'PUSHOVER'}:${result.resultHash}`,
    }));
    return Object.freeze({ ...finalResult, runRecord });
  } catch (error) {
    let residentRecovery = null;
    let compute = null;
    if (residentSession && !residentFinalized) {
      try {
        residentRecovery = residentSession.handleFailure(error.code || 'PRODUCTION_PUSHOVER_FAILED', {
          cancelled: ['CANCELLED', 'PMM_GENERATION_CANCELLED', 'ANALYSIS_CANCELLED'].includes(error?.code),
          deviceLost: /DEVICE_LOST/.test(error?.code || ''),
          oom: /OUT_OF_MEMORY|\bOOM\b/.test(error?.code || ''),
        });
        compute = residentSession.finalize('failed', { reason: error.code || 'PRODUCTION_PUSHOVER_FAILED' });
        residentFinalized = true;
      } catch (residentError) {
        residentRecovery = { reason: residentError.code || 'NONLINEAR_RESIDENT_FAILURE', message: residentError.message };
      }
    }
    if (['ANALYSIS_CANCELLED', 'CANCELLED', 'PMM_GENERATION_CANCELLED'].includes(error?.code)) {
      return cancelled(engine, error.code, { message: error.message, compute, residentRecovery });
    }
    return failed(engine, error.code || 'PRODUCTION_PUSHOVER_FAILED', error.message, {
      ...(error.details || {}),
      compute,
      residentRecovery,
    });
  }
}

function productionArcLengthConfiguration(domain, handoff, options) {
  const source = handoff?.sourceIncrement;
  if (!source?.deltaQ?.length) {
    const error = new Error('Arc-length continuation requires a nonzero displacement-control source increment.');
    error.code = 'ARC_LENGTH_HANDOFF_INCREMENT_REQUIRED';
    throw error;
  }
  const config = options.arcLength || {};
  const displacementNorm = Math.hypot(...source.deltaQ.map(Number));
  const lambdaIncrement = Math.abs(Number(source.deltaLambda || 0));
  const derivedAlpha = displacementNorm / Math.max(lambdaIncrement, 1e-12);
  const alpha = positive(config.alpha ?? config.scaling?.alpha, Math.max(derivedAlpha, 1e-12));
  const scaling = buildArcLengthScaling(domain, {
    ...(config.scaling || {}),
    alpha,
  });
  const weightedDisplacement = source.deltaQ.reduce(
    (sum, value, index) => sum + Number(scaling.weights[index]) * Number(value) ** 2,
    0,
  );
  const derivedRadius = Math.sqrt(weightedDisplacement + scaling.alpha ** 2 * Number(source.deltaLambda || 0) ** 2);
  const radius = positive(config.initialRadius ?? config.radius, derivedRadius);
  if (!(radius > 0)) {
    const error = new Error('Arc-length radius could not be derived from the displacement-control handoff.');
    error.code = 'ARC_LENGTH_RADIUS_INVALID';
    throw error;
  }
  return {
    scaling,
    options: {
      ...config,
      steps: positiveInteger(config.steps, 20),
      initialRadius: radius,
      radius,
      alpha,
      scaling: { ...(config.scaling || {}), alpha },
      backendPreference: config.backendPreference || options.backendPreference || options.computeTarget || 'auto',
      gpuEnabled: config.gpuEnabled === true || options.gpuEnabled === true,
    },
  };
}

function disabledFiberPmm() {
  return Object.freeze({
    version: 'p8-m6-member-fiber-interaction-v1',
    interactions: Object.freeze({}),
    byMember: Object.freeze({}),
    members: Object.freeze([]),
    warnings: Object.freeze([{ code: 'FIBER_PMM_DISABLED', memberId: null, message: 'Fiber PMM coupling was explicitly disabled.' }]),
    summary: Object.freeze({ interactionCount: 0, memberCount: 0, skippedMemberCount: 0, strict: false }),
    contentHash: null,
  });
}

function externalFiberPmm(interactions, model = {}) {
  const entries = interactions instanceof Map ? [...interactions.entries()] : Object.entries(interactions || {});
  const members = entries.map(([key, interaction]) => ({
    memberId: interaction?.source?.memberId || String(key).replace(/:[yz]$/, ''),
    interactionId: interaction?.id || null,
    surfaceHash: interaction?.surface?.surfaceHash || null,
    meshHash: interaction?.mesh?.geometryHash || null,
    hingeCount: 1,
  }));
  const uniqueMembers = [...new Map(members.map((row) => [row.memberId, row])).values()];
  const byMember = Object.fromEntries(entries
    .map(([key, interaction]) => [interaction?.source?.memberId || String(key).replace(/:[yz]$/, ''), interaction])
    .filter(([memberId]) => memberId));
  const distributedMemberIds = new Set((model.members || [])
    .filter((member) => member.nonlinear?.formulation === 'distributed-plasticity')
    .map((member) => String(member.id)));
  return Object.freeze({
    version: 'p8-m6-member-fiber-interaction-v1',
    interactions,
    byMember: Object.freeze(byMember),
    members: Object.freeze(uniqueMembers),
    warnings: Object.freeze([]),
    summary: Object.freeze({
      interactionCount: entries.length,
      distributedMemberCount: Object.keys(byMember).filter((memberId) => distributedMemberIds.has(memberId)).length,
      memberCount: uniqueMembers.length,
      skippedMemberCount: 0,
      strict: true,
      source: 'external-precomputed',
    }),
    contentHash: stableHash(entries.map(([key, interaction]) => ({
      key,
      contentHash: interaction?.contentHash || null,
      surfaceHash: interaction?.surface?.surfaceHash || null,
    }))).slice(0, 24),
  });
}

export function buildProductionPushoverCompatibilityView(result = {}) {
  return Object.freeze({
    version: PRODUCTION_PUSHOVER_VERSION,
    ok: result.ok === true,
    controlNodeId: result.controlNodeId || null,
    direction: result.direction || null,
    pattern: result.pattern || null,
    firstYield: clone(result.firstYield || null),
    curve: clone(result.curve || []),
    memberStates: clone(result.memberStates || {}),
    summary: clone(result.summary || {}),
    warnings: clone(result.warnings || []),
    productionSource: result.version || null,
    legacySecantUsed: false,
  });
}

async function resolveGravityState(input) {
  const policy = input.analysisCase.initialState?.policy || 'zero';
  if (policy === 'nonlinear-case') {
    const predecessor = input.options.predecessor || input.merged.predecessor;
    if (!predecessor?.checkpoint) return { ok: false, reason: 'GRAVITY_PREDECESSOR_CHECKPOINT_REQUIRED' };
    const validation = validateNonlinearInitialStateDependency({
      analysisCase: input.analysisCase,
      runRecords: predecessor.runRecords || [predecessor.runRecord].filter(Boolean),
      analysisStates: predecessor.analysisStates || [predecessor.analysisState].filter(Boolean),
      checkpoint: predecessor.checkpoint,
      domain: input.loadSet.domain,
    });
    if (!validation.ok) return { ok: false, reason: 'GRAVITY_PREDECESSOR_REJECTED', validation };
    const predecessorStore = restoreStateCheckpoint(predecessor.checkpoint);
    const stateStore = predecessorStore.domainHash === input.loadSet.domain.identity.domainHash
      ? predecessorStore
      : createNonlinearStateStore({
        domainHash: input.loadSet.domain.identity.domainHash,
        revision: predecessorStore.revision,
        eventSequence: predecessorStore.eventSequence,
        committed: {
          ...predecessorStore.committed,
          predecessorDomainHash: predecessorStore.domainHash,
          reboundDomainHash: input.loadSet.domain.identity.domainHash,
        },
        eventLog: predecessorStore.eventLog,
      });
    const continuityEvaluation = await input.assembler.evaluate({
      q: stateStore.committed.q,
      lambda: stateStore.committed.lambda,
      committedElementStates: stateStore.committed.elementStates,
      mode: 'static',
    });
    if (
      !continuityEvaluation.ok
      || continuityEvaluation.audit?.ok === false
      || maxAbs(continuityEvaluation.residualReduced) > positive(input.merged.gravityResidualTolerance, 1e-6)
    ) {
      return { ok: false, reason: 'GRAVITY_PREDECESSOR_EQUILIBRIUM_FAILED' };
    }
    return {
      ok: true,
      status: 'accepted-predecessor',
      stateStore,
      checkpoint: predecessor.checkpoint,
      runRecord: validation.predecessor.runRecord,
      analysisState: validation.predecessor.analysisState,
      continuity: {
        ok: true,
        residualNorm: maxAbs(continuityEvaluation.residualReduced),
        responseHash: continuityEvaluation.responseHash,
      },
    };
  }
  const gravity = await runNonlinearGravityPreload({
    model: input.model,
    analysisCase: {
      id: input.merged.gravityCaseId || `${input.analysisCase.id || 'PUSHOVER'}:GRAVITY`,
      kind: 'nonlinearStatic',
      settings: { comboId: input.loadSet.gravity.id },
      initialState: { policy: 'zero' },
    },
    domain: input.loadSet.gravityDomain,
    elements: input.gravityElements,
    loadPattern: input.loadSet.gravityLoadPattern,
    combinedAssembler: input.assembler,
    backend: input.backend,
    production: input.production,
    caseId: input.merged.gravityCaseId || `${input.analysisCase.id || 'PUSHOVER'}:GRAVITY`,
    runRecordId: input.merged.gravityRunRecordId,
    combinationId: input.loadSet.gravity.id,
    linearInitialGuess: input.analysisCase.initialState?.policy === 'verified-linear-import'
      ? input.options.linearInitialGuess || input.merged.linearInitialGuess
      : null,
    signal: input.options.signal,
    isCancelled: input.options.isCancelled,
    onProgress: input.options.onProgress,
    options: input.merged.gravity || input.merged.gravityControl || {},
  });
  if (!gravity.ok) return gravity;
  return {
    ...gravity,
    predecessorStateStore: gravity.stateStore,
    stateStore: rebindStateStore(gravity.stateStore, input.loadSet.domain.identity.domainHash),
  };
}

function rebindStateStore(store, domainHash) {
  if (store.domainHash === domainHash) return store;
  return createNonlinearStateStore({
    domainHash,
    revision: store.revision,
    eventSequence: store.eventSequence,
    committed: {
      ...store.committed,
      predecessorDomainHash: store.domainHash,
      reboundDomainHash: domainHash,
    },
    eventLog: store.eventLog,
  });
}

function mechanismReached(hinges, memberStates, options) {
  const plastic = new Set(hinges.filter((row) => ['yielded', 'capping', 'residual', 'failure'].includes(row.state)).map((row) => row.id));
  for (const [memberId, state] of Object.entries(memberStates || {})) {
    if (state?.distributed?.yielded === true) plastic.add(`${memberId}:distributed`);
  }
  const ids = Array.isArray(options.mechanismHingeIds) ? options.mechanismHingeIds.map(String) : [];
  if (ids.length && ids.every((id) => plastic.has(id))) return ids;
  const count = Number(options.mechanismHingeCount);
  return Number.isFinite(count) && count > 0 && plastic.size >= count ? [...plastic].sort() : null;
}

function reactionBaseShear(reactions, baseline, direction, nodeCount) {
  let projection = 0;
  for (let node = 0; node < nodeCount; node += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      projection += (Number(reactions[node * 6 + axis]) - Number(baseline[node * 6 + axis])) * Number(direction[axis]);
    }
  }
  return -projection;
}

function displacementOptions(options) {
  return {
    targetDisplacement: Number(options.targetDisplacement),
    steps: positiveInteger(options.steps, 20),
    initialIncrement: options.initialIncrement,
    minIncrement: options.minIncrement,
    maxIncrement: options.maxIncrement,
    cutbackFactor: options.cutbackFactor,
    growthFactor: options.growthFactor,
    fastIterations: options.fastIterations,
    maxAttempts: options.maxAttempts,
    eventAware: options.eventAware !== false,
    eventLocalizationTolerance: options.eventLocalizationTolerance,
    newton: {
      ...(options.newton || {}),
      maxIterations: positiveInteger(options.newton?.maxIterations ?? options.maxIterations, 30),
      convergence: options.newton?.convergence || options.convergence,
      lineSearch: options.newton?.lineSearch ?? options.lineSearch,
      lineSearchAlphas: options.newton?.lineSearchAlphas,
      pivotTolerance: options.newton?.pivotTolerance,
      linearRelativeTolerance: options.newton?.linearRelativeTolerance,
      controlAbsolute: options.newton?.controlAbsolute,
      controlRelative: options.newton?.controlRelative,
    },
  };
}

function mergeOptions(analysisCase, options) {
  return {
    ...(analysisCase.settings || {}),
    ...(analysisCase.input || {}),
    ...(analysisCase.inputRefs || {}),
    ...options,
    gravityCombinationId: options.gravityCombinationId
      || analysisCase.inputRefs?.gravityCombinationId
      || analysisCase.settings?.gravityCombinationId,
    targetDisplacement: options.targetDisplacement
      ?? analysisCase.control?.targetDisplacement
      ?? analysisCase.settings?.targetDisplacement,
    controlNodeId: options.controlNodeId
      || analysisCase.control?.nodeId
      || analysisCase.settings?.controlNodeId,
    direction: options.direction
      || analysisCase.control?.direction
      || analysisCase.settings?.direction,
  };
}

function pickControlNode(domain, direction) {
  return domain.nodes.slice().sort((a, b) => {
    const dz = Number(b.z) - Number(a.z);
    if (Math.abs(dz) > 1e-9) return dz;
    const aProjection = Number(a.x) * direction[0] + Number(a.y) * direction[1];
    const bProjection = Number(b.x) * direction[0] + Number(b.y) * direction[1];
    return bProjection - aProjection;
  })[0]?.id || null;
}

function appendRecoveredStep(rows, row) {
  if (rows.length) rows[rows.length - 1] = compactPushoverStepIntegration(rows.at(-1));
  rows.push(row);
}

function blocked(engine, reason, message, details = null) {
  return Object.freeze({
    version: PRODUCTION_PUSHOVER_VERSION,
    ok: false,
    status: 'blocked',
    qualification: 'blocked',
    designBlocked: true,
    designBlockReason: reason,
    modelBound: true,
    reason,
    message,
    details: serializable(details),
    engine,
    routing: { requestedEngineId: engine.id, executedEngineId: null, fallbackPolicy: 'forbidden', fallbackUsed: false },
  });
}

function failed(engine, reason, message = null, details = null) {
  return Object.freeze({
    version: PRODUCTION_PUSHOVER_VERSION,
    ok: false,
    status: 'failed',
    qualification: 'invalid',
    designBlocked: true,
    designBlockReason: reason,
    modelBound: true,
    reason,
    message: message || reason,
    details: serializable(details),
    engine,
    routing: { requestedEngineId: engine.id, executedEngineId: engine.id, fallbackPolicy: 'forbidden', fallbackUsed: false },
  });
}

function cancelled(engine, reason, details = null) {
  const message = typeof details === 'string' ? details : details?.message;
  return Object.freeze({
    version: PRODUCTION_PUSHOVER_VERSION,
    ok: false,
    status: 'cancelled',
    qualification: 'not-evaluated',
    designBlocked: true,
    designBlockReason: reason,
    modelBound: true,
    reason,
    message: message || 'Nonlinear analysis was cancelled before PMM preprocessing completed.',
    details: typeof details === 'object' ? serializable(details) : null,
    engine,
    routing: { requestedEngineId: engine.id, executedEngineId: engine.id, fallbackPolicy: 'forbidden', fallbackUsed: false },
  });
}

function maxAbs(values) {
  let maximum = 0;
  for (const value of values || []) maximum = Math.max(maximum, Math.abs(Number(value)));
  return maximum;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  return Math.max(1, Math.trunc(positive(value, fallback)));
}

function bounded(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function serializable(value) {
  if (!value) return value;
  if (value instanceof Error) return { name: value.name, code: value.code || null, message: value.message };
  try { return structuredClone(value); } catch { return { message: String(value) }; }
}
