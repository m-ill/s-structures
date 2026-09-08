import { PRODUCTION_NLTH_ENGINE_VERSION, PRODUCTION_NLTH_VERSION } from '../../metadata/numericVersions.js';
export { PRODUCTION_NLTH_ENGINE_VERSION, PRODUCTION_NLTH_VERSION };
import { createAnalysisRunRecord } from '../../core/analysisRunRecord.js';
import { stableHash } from '../../core/stableHash.js';
import { createNonlinearResidentSession } from '../../compute/nonlinear/index.js';
import { buildCanonicalAnalysisDomain } from '../../solver/domain/canonicalDomain.js';
import { NONLINEAR_ENGINE_IDS } from '../capabilities.js';
import {
  buildNonlinearDesignTransferGuard,
  evaluateNonlinearIntegrationCapabilities,
  recoverIntegratedNonlinearState,
  recoverNonlinearHistoryEnvelope,
} from '../integration/index.js';
import { createNonlinearStateStore, createStateCheckpoint, restoreStateCheckpoint } from '../core/stateStore.js';
import { buildHingedFrame3dEntries } from '../elements/hingedFrame3d.js';
import { createEquilibriumAssembler } from '../equilibrium/assembler.js';
import { createWasmSparseBackend } from '../equilibrium/backends/wasmSparseBackend.js';
import { buildNonlinearLoadPattern } from '../equilibrium/externalLoads.js';
import { prepareModelFiberPmmInteractions } from '../fiber/fiberPmmPreprocessor.js';
import { resolveDomainHingeAssignments } from '../properties/assignments.js';
import { resolveGravityCombination } from '../pushover/loadPatterns.js';
import {
  runNonlinearGravityPreload,
  validateNonlinearInitialStateDependency,
} from '../workflow/initialState.js';
import { buildMdofDampingMatrix } from './mdofDamping.js';
import {
  buildMdofGroundMotionSet,
  createMdofGroundMotionRecord,
  parseMdofGroundMotionText,
} from './mdofGroundMotion.js';
import { buildMdofMassDomain } from './massDomain.js';
import { runMdofNewmark } from './mdofNewmark.js';



export const NLTH_LOAD_SET_VERSION = 'p8-m8-nlth-load-set-v1';

export async function runProductionNlth(model = {}, analysisCase = {}, options = {}) {
  const engine = Object.freeze({
    id: NONLINEAR_ENGINE_IDS.productionNlth,
    version: PRODUCTION_NLTH_ENGINE_VERSION,
    formulation: Object.freeze({
      geometry: 'objective-corotational-3d',
      material: 'state-dependent-concentrated-or-distributed-fiber-plasticity',
      equilibrium: 'current-step-mdof-effective-tangent',
      integration: 'newmark-average-acceleration-full-newton',
      excitation: 'uniform-base-acceleration-one-to-three-components',
      gravity: 'nonlinear-load-control-predecessor',
    }),
  });
  const production = options.production !== false;
  let backend = options.backend || null;
  let residentSession = null;
  let residentFinalized = false;
  try {
    if (model.zeroLengthPmmHinges?.length || model.pmmHinges?.length) {
      throw nlthError('ZERO_LENGTH_PMM_DYNAMIC_ENERGY_UNQUALIFIED', 'SH1 dynamic energy and cyclic recovery are not qualified.');
    }
    const merged = mergeOptions(analysisCase, options);
    const modelHashAtStart = stableHash(model);
    const loadSet = buildNlthLoadSet(model, analysisCase, merged);
    const gravityCapability = evaluateNonlinearIntegrationCapabilities(loadSet.gravityDomain, { mode: 'static' });
    if (!gravityCapability.ok) {
      const first = gravityCapability.blocking[0];
      throw nlthError(first.code, first.message, gravityCapability);
    }
    const integrationCapability = evaluateNonlinearIntegrationCapabilities(loadSet.domain, { mode: 'dynamic' });
    if (!integrationCapability.ok) {
      const first = integrationCapability.blocking[0];
      throw nlthError(first.code, first.message, integrationCapability);
    }
    const massSourceId = clean(merged.massSourceId);
    if (!massSourceId) throw nlthError('NLTH_MASS_SOURCE_REQUIRED', 'Production NLTH requires an explicit Phase 7 massSourceId.');
    if (!(model.massSources || []).some((row) => String(row.id) === massSourceId)) {
      throw nlthError('DYNAMIC_MASS_SOURCE_NOT_FOUND', `Mass source ${massSourceId} was not found.`);
    }
    const massDomain = buildMdofMassDomain(model, loadSet.domain, {
      massSourceId,
      formulation: merged.massFormulation || 'lumped',
    });
    const records = await resolveGroundMotionRecords(model, analysisCase, merged, production);
    const groundMotion = buildMdofGroundMotionSet(records, massDomain, merged.groundMotionSet);
    if (stableHash(model) !== modelHashAtStart) {
      throw nlthError('NLTH_MODEL_CHANGED_DURING_INPUT_RESOLUTION', 'The model changed while NLTH inputs were being resolved.');
    }
    const fiberPmm = merged.pmmInteractions
      ? externalFiberPmm(merged.pmmInteractions, model)
      : merged.fiberPmm === false
        ? disabledFiberPmm()
        : await prepareModelFiberPmmInteractions(model, {
          ...(merged.fiberPmm || {}),
          reinforcementSnapshots: merged.reinforcementSnapshots,
          strict: merged.fiberPmm?.strict,
          cache: options.pmmCache || merged.fiberPmm?.cache,
          cacheEnabled: merged.fiberPmm?.cacheEnabled,
          workerClient: options.pmmWorkerClient || merged.fiberPmm?.workerClient,
          useWorker: merged.fiberPmm?.useWorker,
          requireWorker: production && typeof document !== 'undefined' ? true : merged.fiberPmm?.requireWorker,
          signal: options.signal,
          isCancelled: options.isCancelled,
          onProgress: options.onProgress,
        });
    if (stableHash(model) !== modelHashAtStart) {
      throw nlthError('NLTH_MODEL_CHANGED_DURING_PREPROCESSING', 'The model changed while fiber PMM preprocessing was running.');
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
      assembler,
      gravityElements,
      backend,
      production,
      options,
    });
    if (!gravity.ok) return failed(engine, gravity.reason || 'GRAVITY_PRELOAD_FAILED', gravity.message, gravity);
    if (stableHash(model) !== modelHashAtStart) {
      throw nlthError('NLTH_MODEL_CHANGED_DURING_GRAVITY', 'The model changed while nonlinear gravity preload was running.');
    }
    const initialEvaluation = await assembler.evaluate({
      q: new Array(loadSet.domain.constraint.reducedDofCount).fill(0),
      lambda: 0,
      committedElementStates: {},
      mode: 'dynamic',
      dt: 0,
    });
    if (!initialEvaluation.ok) throw nlthError(initialEvaluation.reason || 'NLTH_INITIAL_TANGENT_FAILED', initialEvaluation.message || 'Initial tangent evaluation failed.');
    const committedEvaluation = await assembler.evaluate({
      q: gravity.stateStore.committed.q,
      lambda: 0,
      committedElementStates: gravity.stateStore.committed.elementStates,
      mode: 'dynamic',
      dt: 0,
    });
    if (!committedEvaluation.ok) throw nlthError(committedEvaluation.reason || 'NLTH_COMMITTED_TANGENT_FAILED', committedEvaluation.message || 'Committed tangent evaluation failed.');
    const stiffnessPolicy = String(merged.damping?.stiffnessPolicy || merged.damping?.stiffnessSource || 'initial').toLowerCase();
    const damping = buildMdofDampingMatrix({
      massDomain,
      stiffnessMatrix: stiffnessPolicy === 'committed'
        ? committedEvaluation.tangentReduced
        : initialEvaluation.tangentReduced,
      specification: merged.damping,
    });
    const restartCheckpoint = merged.restartCheckpoint || options.restartCheckpoint || null;
    const residentStateStore = restartCheckpoint
      ? restoreStateCheckpoint(restartCheckpoint, { domainHash: loadSet.domain.identity.domainHash })
      : gravity.stateStore;
    const residentInitialCheckpoint = restartCheckpoint || createStateCheckpoint(residentStateStore, {
      role: 'p9-m8-nlth-resident-initial',
      caseId: analysisCase.id || null,
      gravityCheckpointHash: gravity.checkpoint?.integrityHash || null,
    });
    residentSession = createNonlinearResidentSession({
      runId: clean(options.runId || options.runRecordId) || `${analysisCase.id || 'NLTH'}:resident`,
      kind: 'nlth',
      assembler,
      stateStore: residentStateStore,
      checkpoint: residentInitialCheckpoint,
      production,
      computeTarget: merged.computeTarget || merged.backendPreference || 'auto',
      ...(merged.residentSession || {}),
    });
    const residentInitialEvaluation = restartCheckpoint
      ? await assembler.evaluate({
        q: residentStateStore.committed.q,
        lambda: 0,
        committedElementStates: residentStateStore.committed.elementStates,
        mode: 'dynamic-restart',
        dt: 0,
      })
      : committedEvaluation;
    if (!residentInitialEvaluation.ok) {
      throw nlthError(residentInitialEvaluation.reason || 'NLTH_RESIDENT_INITIAL_EVALUATION_FAILED', residentInitialEvaluation.message || 'Resident NLTH initial evaluation failed.');
    }
    residentSession.auditEvaluation(residentInitialEvaluation, {
      mode: restartCheckpoint ? 'nlth-restart' : 'nlth-gravity',
      energies: residentStateStore.committed.energies?.dynamic,
    });
    const dynamic = await runMdofNewmark({
      assembler,
      massDomain,
      damping,
      groundMotion,
      stateStore: gravity.stateStore,
      checkpoint: restartCheckpoint,
      backend,
      production,
      signal: options.signal,
      isCancelled: options.isCancelled,
      onProgress: options.onProgress,
      onChunk(chunk) {
        residentSession.recordTransfer('nlth-history-chunk', chunk);
        options.onChunk?.(chunk);
      },
      onCheckpoint(checkpoint) {
        residentSession.recordCheckpoint(checkpoint, { source: 'nlth-periodic-checkpoint' });
        options.onCheckpoint?.(checkpoint);
      },
      onCommit(accepted) {
        residentSession.acceptBoundary(accepted.stateStore, {
          source: 'nlth-internal-step',
          evaluation: accepted.evaluation,
          energies: accepted.energies,
          matrixClass: accepted.matrixClass,
          mode: 'nlth',
        });
        options.onCommit?.(accepted);
      },
      onReject(rejected) {
        residentSession.rejectBoundary(rejected.reason, {
          source: 'nlth-substep',
          substepLevel: rejected.substepLevel,
          attemptedDt: rejected.attemptedDt,
        });
        options.onReject?.(rejected);
      },
      options: {
        ...(merged.integrator || {}),
        ...(merged.newmark || {}),
        history: merged.output?.history || merged.history,
        backendPreference: merged.backendPreference || merged.computeTarget || 'auto',
        gpuEnabled: merged.gpuEnabled === true,
      },
    });
    if (!dynamic.ok) {
      const residentRecovery = residentSession.handleFailure(dynamic.reason || 'MDOF_NLTH_FAILED', {
        cancelled: dynamic.status === 'cancelled',
        deviceLost: /DEVICE_LOST/.test(dynamic.reason || ''),
        oom: /OUT_OF_MEMORY|\bOOM\b/.test(dynamic.reason || ''),
      });
      const compute = residentSession.finalize(dynamic.status || 'failed', { reason: dynamic.reason || 'MDOF_NLTH_FAILED' });
      residentFinalized = true;
      const details = { ...dynamic, compute, residentRecovery };
      if (dynamic.status === 'cancelled') return cancelled(engine, dynamic.reason, details);
      return failed(engine, dynamic.reason || 'MDOF_NLTH_FAILED', dynamic.message, details);
    }
    residentSession.recordCheckpoint(dynamic.checkpoint, { source: 'nlth-final-checkpoint' });
    if (stableHash(model) !== modelHashAtStart) {
      throw nlthError('NLTH_MODEL_CHANGED_DURING_RUN', 'The model changed while nonlinear time-history analysis was running.');
    }
    const result = buildProductionNlthResult({
      model,
      analysisCase,
      engine,
      loadSet,
      massDomain,
      groundMotion,
      damping,
      gravity,
      dynamic,
      elements,
      hingeResolution,
      fiberPmm,
      backend,
      integrationCapability,
      gravityCapability,
    });
    const designTransferGuard = buildNonlinearDesignTransferGuard(
      result,
      {
        model,
        domain: loadSet.domain,
        analysisCase,
        massDomain,
        loadSetHash: loadSet.loadSetHash,
      },
      analysisCase,
    );
    const compute = residentSession.finalize('completed', {
      caseId: analysisCase.id || null,
      outputStepCount: dynamic.outputStepCount,
      internalStepCount: dynamic.internalStepCount,
    });
    residentFinalized = true;
    const governedResult = Object.freeze({ ...result, compute, designTransferGuard });
    const runRecord = Object.freeze(createAnalysisRunRecord({
      model,
      analysisCase,
      result: governedResult,
      attemptId: clean(options.runRecordId) || `${analysisCase.id || 'NLTH'}:${result.resultHash}`,
    }));
    return Object.freeze({
      ...governedResult,
      runRecord,
      routing: {
        requestedEngineId: engine.id,
        executedEngineId: engine.id,
        fallbackPolicy: 'forbidden',
        fallbackUsed: false,
      },
      internal: options.includeInternal === true ? Object.freeze({
        stateStore: dynamic.stateStore,
        checkpoint: dynamic.checkpoint,
        gravityStateStore: gravity.stateStore,
        loadSet,
        massDomain,
        groundMotion,
        damping,
        fiberPmm,
      }) : undefined,
    });
  } catch (error) {
    let residentRecovery = null;
    let compute = null;
    if (residentSession && !residentFinalized) {
      try {
        residentRecovery = residentSession.handleFailure(error.code || 'PRODUCTION_NLTH_FAILED', {
          cancelled: ['ANALYSIS_CANCELLED', 'CANCELLED', 'PMM_GENERATION_CANCELLED'].includes(error?.code),
          deviceLost: /DEVICE_LOST/.test(error?.code || ''),
          oom: /OUT_OF_MEMORY|\bOOM\b/.test(error?.code || ''),
        });
        compute = residentSession.finalize('failed', { reason: error.code || 'PRODUCTION_NLTH_FAILED' });
        residentFinalized = true;
      } catch (residentError) {
        residentRecovery = { reason: residentError.code || 'NONLINEAR_RESIDENT_FAILURE', message: residentError.message };
      }
    }
    if (['ANALYSIS_CANCELLED', 'CANCELLED', 'PMM_GENERATION_CANCELLED'].includes(error?.code)) {
      return cancelled(engine, error.code, { error, compute, residentRecovery });
    }
    return failed(engine, error.code || 'PRODUCTION_NLTH_FAILED', error.message, {
      ...(error.details || {}),
      compute,
      residentRecovery,
    });
  }
}

export function buildNlthLoadSet(model = {}, analysisCase = {}, options = {}) {
  const gravity = resolveGravityCombination(model, options.gravityCombinationId || analysisCase.inputRefs?.gravityCombinationId);
  const gravityDomain = buildCanonicalAnalysisDomain(model, {
    analysisCase: {
      id: `${analysisCase.id || 'NLTH'}:GRAVITY`,
      kind: 'nonlinearStatic',
      settings: { comboId: gravity.id },
      initialState: { policy: 'zero' },
    },
    factors: gravity.factors,
    strictCapabilities: options.strictCapabilities === true,
  });
  if (!gravityDomain.ok) throw nlthError(gravityDomain.reason || 'GRAVITY_DOMAIN_INVALID', 'Unable to build the gravity domain.');
  const domain = buildCanonicalAnalysisDomain(model, {
    analysisCase,
    factors: gravity.factors,
    strictCapabilities: options.strictCapabilities === true,
  });
  if (!domain.ok) throw nlthError(domain.reason || 'NLTH_DOMAIN_INVALID', 'Unable to build the nonlinear dynamic domain.');
  const gravityLoadPattern = constantLoadPattern(gravityDomain);
  const loadPattern = constantLoadPattern(domain);
  const core = {
    version: NLTH_LOAD_SET_VERSION,
    gravity,
    gravityDomain,
    domain,
    gravityLoadPattern,
    loadPattern,
    ownership: Object.freeze({
      gravityCombinationId: gravity.id,
      gravityFactorHash: gravity.contentHash,
      constantLoadIds: Object.freeze(domain.loads.map((row) => row.id).sort()),
      referenceLoadIds: Object.freeze([]),
      physicalLoadPolicy: 'gravity-combination-applied-once-as-constant-load',
    }),
  };
  return Object.freeze({
    ...core,
    loadSetHash: stableHash({
      version: core.version,
      gravity: gravity.contentHash,
      gravityDomain: gravityDomain.identity.domainHash,
      domain: domain.identity.domainHash,
      gravityPattern: gravityLoadPattern.patternHash,
      pattern: loadPattern.patternHash,
    }).slice(0, 24),
  });
}

export async function resolveGroundMotionRecords(model = {}, analysisCase = {}, options = {}, production = false) {
  const direct = options.groundMotionRecords || options.records || options.groundMotion;
  if (direct) {
    const source = Array.isArray(direct) ? direct : [direct];
    return Promise.all(source.map((row, index) => normalizeGroundRecord(row, {
      ...options,
      direction: row?.direction || componentDirection(options, index),
      source: row?.source || 'explicit-analysis-input',
    })));
  }
  const ids = analysisCase.inputRefs?.functionIds || options.functionIds || [];
  if (!Array.isArray(ids) || !ids.length) throw nlthError('NLTH_GROUND_MOTION_REQUIRED', 'NLTH requires ground-motion record input or functionIds.');
  const records = [];
  for (let index = 0; index < ids.length; index += 1) {
    const id = String(ids[index]);
    const registry = (model.timeHistoryFunctions || []).find((row) => String(row.id) === id);
    if (!registry) throw nlthError('TIME_HISTORY_FUNCTION_NOT_FOUND', `Time-history function ${id} was not found.`);
    if (!/accel/i.test(String(registry.quantity || ''))) throw nlthError('TIME_HISTORY_QUANTITY_INVALID', `${id} is not an acceleration function.`);
    let resolved = mapValue(options.timeHistoryData, registry.dataRef) ?? mapValue(options.timeHistoryData, id);
    if (resolved == null && typeof options.resolveTimeHistoryData === 'function') resolved = await options.resolveTimeHistoryData(registry.dataRef, registry);
    if (resolved == null) throw nlthError('TIME_HISTORY_DATA_UNAVAILABLE', `Immutable data ${registry.dataRef} for ${id} is unavailable.`);
    if (production && resolved.contentHash && registry.contentHash && resolved.contentHash !== registry.contentHash) {
      throw nlthError('TIME_HISTORY_CONTENT_HASH_MISMATCH', `${id} resolved data does not match its registry content hash.`);
    }
    records.push(await normalizeGroundRecord(resolved, {
      id,
      dt: registry.sampling?.dt ?? registry.sampling?.timeStep,
      unit: registry.unit,
      direction: registry.direction || componentDirection(options, index),
      baseline: registry.baseline || options.baseline,
      scale: registry.scale ?? options.scale,
      targetPga: registry.targetPga ?? options.targetPga,
      source: `time-history-registry:${registry.dataRef}`,
    }));
  }
  return records;
}

export function buildProductionNlthResult(input = {}) {
  const records = input.groundMotion.records.map((row) => Object.freeze({
    id: row.id,
    dt: row.dt,
    pointCount: row.pointCount,
    duration: row.duration,
    inputUnit: row.inputUnit,
    outputUnit: row.outputUnit,
    direction: row.direction,
    baseline: row.baseline,
    pga: row.pga,
    targetPga: row.targetPga,
    pgaScale: row.pgaScale,
    scaleMethod: row.scaleMethod,
    spectrumMatched: false,
    source: row.source,
    recordHash: row.recordHash,
  }));
  const domainHashes = input.loadSet.domain.hashes || input.loadSet.domain.identity;
  const provenance = Object.freeze({
    version: PRODUCTION_NLTH_VERSION,
    modelHash: stableHash(input.model),
    caseId: input.analysisCase.id || null,
    caseHash: stableHash(input.analysisCase).slice(0, 24),
    domainHashes: structuralHashes(domainHashes),
    domainHash: input.loadSet.domain.identity.domainHash,
    gravityDomainHash: input.loadSet.gravityDomain.identity.domainHash,
    loadSetHash: input.loadSet.loadSetHash,
    gravityRunRecordId: input.gravity.runRecord?.id || null,
    gravityCheckpointHash: input.gravity.checkpoint?.integrityHash || null,
    massSourceId: input.massDomain.sourceSnapshot.sourceId,
    massHash: input.massDomain.massHash,
    massMatrixHash: input.massDomain.matrix.valueHash,
    dampingHash: input.damping.dampingHash,
    groundMotionSetHash: input.groundMotion.setHash,
    nodeCount: input.loadSet.domain.nodes.length,
    elementCount: input.elements.length,
    physicalElementCount: input.loadSet.domain.elements.filter((row) => !row.generated).length,
    generatedElementCount: input.loadSet.domain.elements.filter((row) => row.generated).length,
    reducedDofCount: input.loadSet.domain.constraint.reducedDofCount,
    hingeAssignmentHash: input.hingeResolution.contentHash || null,
    fiberPmmCatalogHash: input.fiberPmm.contentHash || null,
    backendId: input.backend?.id || null,
    dynamicMatrixClass: input.dynamic.matrixClass,
    dynamicMatrixClassReason: input.dynamic.matrixClassReason,
    fallbackUsed: false,
  });
  const integration = recoverIntegratedNonlinearState({
    model: input.model,
    analysisCase: input.analysisCase,
    domain: input.loadSet.domain,
    evaluation: input.dynamic.finalEvaluation,
    massDomain: input.massDomain,
    analysisType: 'nonlinear-time-history',
    time: input.dynamic.endTime,
    groundAcceleration: input.groundMotion.vectorAt(input.dynamic.endTime),
    capability: input.integrationCapability,
    loadSetHash: input.loadSet.loadSetHash,
    convergence: input.dynamic.stateStore.committed.norms,
  });
  const historyEnvelope = recoverNonlinearHistoryEnvelope({
    domain: input.loadSet.domain,
    history: input.dynamic.history,
    massDomain: input.massDomain,
  });
  const core = {
    version: PRODUCTION_NLTH_VERSION,
    ok: true,
    status: 'completed',
    qualification: 'candidate',
    designBlocked: true,
    designBlockReason: 'P8_M8_COMPONENT_CANDIDATE_REQUIRES_INDEPENDENT_QUALIFICATION',
    modelBound: true,
    engine: input.engine,
    gravity: Object.freeze({
      combinationId: input.loadSet.gravity.id,
      runRecordId: input.gravity.runRecord?.id || null,
      checkpointHash: input.gravity.checkpoint?.integrityHash || null,
      continuity: input.gravity.continuity,
    }),
    mass: Object.freeze({
      formulation: input.massDomain.formulation,
      sourceSnapshot: input.massDomain.sourceSnapshot,
      activeMassByAxis: input.massDomain.activeMassByAxis,
      physicalMassByAxis: input.massDomain.physicalMassByAxis,
      activeDofCount: input.massDomain.activeDofs.length,
      matrixHash: input.massDomain.matrix.valueHash,
    }),
    damping: Object.freeze({
      type: input.damping.type,
      stiffnessPolicy: input.damping.stiffnessPolicy,
      coefficients: input.damping.coefficients,
      dampingHash: input.damping.dampingHash,
    }),
    groundMotion: Object.freeze({
      componentCount: records.length,
      duration: input.groundMotion.duration,
      dt: input.groundMotion.dt,
      records: Object.freeze(records),
      signConvention: input.groundMotion.signConvention,
      setHash: input.groundMotion.setHash,
    }),
    history: input.dynamic.history,
    historyEnvelope,
    integration,
    dependencies: integration.dependencies,
    dimensions: integration.dimensions,
    integrationCapability: input.integrationCapability,
    gravityCapability: input.gravityCapability,
    checkpoint: Object.freeze({
      version: input.dynamic.checkpoint?.version || null,
      integrityHash: input.dynamic.checkpoint?.integrityHash || null,
      committedHash: input.dynamic.checkpoint?.committedHash || null,
      time: input.dynamic.stateStore.committed.time,
    }),
    summary: Object.freeze({
      outputStepCount: input.dynamic.outputStepCount,
      internalStepCount: input.dynamic.internalStepCount,
      acceptedStepCount: input.dynamic.acceptedStepCount,
      rejectedStepCount: input.dynamic.rejectedStepCount,
      stepTrace: input.dynamic.stepTrace,
      maximumSubstepLevel: input.dynamic.maximumSubstepLevel,
      matrixClass: input.dynamic.matrixClass,
      matrixClassReason: input.dynamic.matrixClassReason,
      completedTime: input.dynamic.endTime,
      requestedEndTime: input.dynamic.requestedEndTime,
      finalEnergy: input.dynamic.finalEnergy,
      energyAudit: input.dynamic.energyAudit,
    }),
    convergence: Object.freeze({
      acceptedSteps: input.dynamic.acceptedStepCount,
      rejectedSteps: input.dynamic.rejectedStepCount,
      matrixClass: input.dynamic.matrixClass,
      matrixClassReason: input.dynamic.matrixClassReason,
      substepPolicy: 'failed-step-rollback-and-binary-reintegration',
      nonconvergedCommitCount: 0,
    }),
    provenance,
    limitations: Object.freeze([
      'Candidate Phase 8 engine; design transfer remains blocked pending independent commercial comparison.',
      'Uniform support excitation is qualified in this milestone; spatially varying support motion is not included.',
      'GPU execution remains opt-in and requires a deterministic f64 qualified backend.',
    ]),
  };
  return Object.freeze({ ...core, resultHash: stableHash(core).slice(0, 24) });
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
    const stateStore = rebindStateStore(predecessorStore, input.loadSet.domain.identity.domainHash);
    const continuity = await input.assembler.evaluate({
      q: stateStore.committed.q,
      lambda: 0,
      committedElementStates: stateStore.committed.elementStates,
      mode: 'dynamic',
      dt: 0,
    });
    if (!continuity.ok || maxAbs(continuity.residualReduced) > positiveOr(input.merged.gravityResidualTolerance, 1e-6)) {
      return { ok: false, reason: 'GRAVITY_PREDECESSOR_EQUILIBRIUM_FAILED' };
    }
    return {
      ok: true,
      stateStore,
      checkpoint: predecessor.checkpoint,
      runRecord: validation.predecessor.runRecord,
      analysisState: validation.predecessor.analysisState,
      continuity: { ok: true, residualNorm: maxAbs(continuity.residualReduced), responseHash: continuity.responseHash },
    };
  }
  const gravity = await runNonlinearGravityPreload({
    model: input.model,
    analysisCase: {
      id: input.merged.gravityCaseId || `${input.analysisCase.id || 'NLTH'}:GRAVITY`,
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
    caseId: input.merged.gravityCaseId || `${input.analysisCase.id || 'NLTH'}:GRAVITY`,
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
  return { ...gravity, stateStore: rebindStateStore(gravity.stateStore, input.loadSet.domain.identity.domainHash) };
}

function constantLoadPattern(domain) {
  const pattern = buildNonlinearLoadPattern(domain, {
    constantLoadIds: domain.loads.map((row) => row.id),
    referenceLoadIds: [],
    strictRoles: true,
  });
  if (!pattern.ok) throw nlthError(pattern.reason || 'NLTH_LOAD_PATTERN_INVALID', pattern.message || 'NLTH load assembly failed.');
  return pattern;
}

async function normalizeGroundRecord(row, defaults) {
  if (row?.version === 'p8-m8-mdof-ground-motion-v1') return row;
  const input = typeof row === 'object' && row != null ? row : { text: row };
  const merged = { ...defaults, ...input };
  if (typeof input === 'string' || typeof merged.text === 'string') return parseMdofGroundMotionText(input.text || input, merged);
  const values = merged.values || merged.accelerations || merged.data?.values || merged.data?.accelerations;
  return createMdofGroundMotionRecord({ ...merged, values });
}

function componentDirection(options, index) {
  const source = options.componentDirections;
  return (Array.isArray(source) ? source[index] : source?.[index]) || ['x', 'y', 'z'][index] || 'x';
}

function rebindStateStore(store, domainHash) {
  if (store.domainHash === domainHash) return store;
  return createNonlinearStateStore({
    domainHash,
    revision: store.revision,
    eventSequence: store.eventSequence,
    eventLog: store.eventLog,
    committed: {
      ...store.committed,
      predecessorDomainHash: store.domainHash,
      reboundDomainHash: domainHash,
    },
  });
}

function disabledFiberPmm() {
  return Object.freeze({
    version: 'p8-m6-member-fiber-interaction-v1',
    interactions: Object.freeze({}),
    byMember: Object.freeze({}),
    members: Object.freeze([]),
    warnings: Object.freeze([{ code: 'FIBER_PMM_DISABLED', message: 'Fiber PMM coupling was explicitly disabled.' }]),
    summary: Object.freeze({ interactionCount: 0, memberCount: 0, distributedMemberCount: 0, skippedMemberCount: 0 }),
    contentHash: null,
  });
}

function externalFiberPmm(interactions, model = {}) {
  const entries = interactions instanceof Map ? [...interactions.entries()] : Object.entries(interactions || {});
  const byMember = Object.fromEntries(entries.map(([key, interaction]) => [
    interaction?.source?.memberId || String(key).replace(/:[yz]$/, ''),
    interaction,
  ]));
  const distributed = new Set((model.members || []).filter((row) => row.nonlinear?.formulation === 'distributed-plasticity').map((row) => row.id));
  return Object.freeze({
    version: 'p8-m6-member-fiber-interaction-v1',
    interactions,
    byMember: Object.freeze(byMember),
    members: Object.freeze(Object.keys(byMember).map((memberId) => ({ memberId }))),
    warnings: Object.freeze([]),
    summary: Object.freeze({
      interactionCount: entries.length,
      memberCount: Object.keys(byMember).length,
      distributedMemberCount: Object.keys(byMember).filter((id) => distributed.has(id)).length,
      skippedMemberCount: 0,
    }),
    contentHash: stableHash(entries).slice(0, 24),
  });
}

function mergeOptions(analysisCase, options) {
  return {
    ...(analysisCase.settings || {}),
    ...(analysisCase.input || {}),
    ...(analysisCase.inputRefs || {}),
    ...(analysisCase.controls || {}),
    ...(analysisCase.output || {}),
    ...options,
    gravityCombinationId: options.gravityCombinationId
      || analysisCase.inputRefs?.gravityCombinationId
      || analysisCase.settings?.gravityCombinationId,
    massSourceId: options.massSourceId
      || analysisCase.inputRefs?.massSourceId
      || analysisCase.settings?.massSourceId,
    damping: options.damping || analysisCase.settings?.damping || analysisCase.damping,
    output: options.output || analysisCase.output || {},
  };
}

function structuralHashes(hashes = {}) {
  return Object.freeze(Object.fromEntries(
    ['domainHash', 'topologyHash', 'propertyHash', 'constraintHash', 'loadHash', 'massHash', 'nonlinearHash', 'outputHash']
      .filter((key) => hashes[key] != null)
      .map((key) => [key, hashes[key]]),
  ));
}

function blocked(engine, reason, message) {
  return Object.freeze({
    version: PRODUCTION_NLTH_VERSION,
    ok: false,
    status: 'blocked',
    qualification: 'blocked',
    designBlocked: true,
    designBlockReason: reason,
    modelBound: true,
    reason,
    message,
    engine,
    routing: { requestedEngineId: engine.id, executedEngineId: null, fallbackPolicy: 'forbidden', fallbackUsed: false },
  });
}

function failed(engine, reason, message = null, details = null) {
  if (String(reason).endsWith('_REQUIRED') || String(reason).includes('NOT_FOUND') || String(reason).includes('UNAVAILABLE')) {
    return blocked(engine, reason, message || reason);
  }
  return Object.freeze({
    version: PRODUCTION_NLTH_VERSION,
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
  return Object.freeze({
    version: PRODUCTION_NLTH_VERSION,
    ok: false,
    status: 'cancelled',
    qualification: 'not-evaluated',
    designBlocked: true,
    designBlockReason: reason,
    modelBound: true,
    reason,
    message: 'Nonlinear time-history analysis was cancelled.',
    details: serializable(details),
    engine,
    routing: { requestedEngineId: engine.id, executedEngineId: engine.id, fallbackPolicy: 'forbidden', fallbackUsed: false },
  });
}

function mapValue(source, key) {
  return source instanceof Map ? source.get(key) : source?.[key];
}

function maxAbs(values) {
  return Array.from(values || []).reduce((maximum, value) => Math.max(maximum, Math.abs(Number(value))), 0);
}

function positiveOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function serializable(value) {
  if (value == null) return value;
  if (value instanceof Error) return { name: value.name, code: value.code || null, message: value.message, details: value.details || null };
  try { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
  catch { return { message: String(value) }; }
}

function nlthError(code, message, details = null) {
  const error = new Error(message);
  error.name = 'ProductionNlthError';
  error.code = code;
  error.details = details;
  return error;
}
