import { stableHash } from '../../core/stableHash.js';
import { materialOf, sectionOf } from '../../core/catalogs.js';
import { FIBER_SECTION_MESH_VERSION, buildFiberSectionMesh } from './sectionMesh.js';
import { FIBER_MATERIAL_MODEL_VERSION, createConcreteMaterial, createSteelBilinearMaterial } from './materialModels.js';
import { MOMENT_CURVATURE_V2_VERSION, solveSectionAxialEquilibrium } from './momentCurvatureV2.js';
import { PMM_SURFACE_VERSION, generatePmmSurface } from './pmmSurface.js';
import {
  SECTION_ENVELOPE_VERSION,
  SECTION_RESPONSE_VERSION,
  createSectionEnvelopeEvaluator,
  evaluateSectionResponse,
} from './sectionResponse.js';

export const MEMBER_FIBER_INTERACTION_VERSION = 'p8-m6-member-fiber-interaction-v1';

const OPTIONAL_UNSUPPORTED_SOURCE_CODES = new Set([
  'FIBER_SECTION_SNAPSHOT_REQUIRED',
  'FIBER_SECTION_SHAPE_REQUIRED',
  'FIBER_SECTION_PARAMS_REQUIRED',
  'FIBER_SECTION_SHAPE_UNSUPPORTED',
  'FIBER_STEEL_SHAPE_UNSUPPORTED',
  'FIBER_RC_SHAPE_UNSUPPORTED',
]);

const interactionCache = new Map();
const MAX_MEMBER_INTERACTION_CACHE_ENTRIES = 64;

export function buildMemberFiberInteraction(model = {}, member = {}, options = {}) {
  const material = materialOf(model, member.matId);
  const section = sectionOf(model, member.secId);
  const reinforcementSnapshot = options.reinforcementSnapshot
    || options.reinforcementSnapshots?.[member.id]
    || member.nonlinear?.reinforcementSnapshot
    || null;
  const cacheIdentity = createMemberFiberInteractionCacheIdentity(model, member, {
    ...options,
    reinforcementSnapshot,
  });
  const cacheKey = stableHash(cacheIdentity);
  const family = materialFamily(material, section, reinforcementSnapshot);
  const mesh = buildFiberSectionMesh(section, {
    kind: family === 'concrete' ? 'rc' : 'steel',
    materialId: 'steel',
    reinforcementSnapshot,
    refinement: options.refinement,
    maxCellSize: options.maxCellSize,
    maxCellSizeUnit: options.maxCellSizeUnit,
    inputLengthUnit: options.inputLengthUnit,
    qualification: qualificationOf(section, reinforcementSnapshot),
  });
  requireSourcePropertyConsistency(mesh, options.sourcePropertyTolerance ?? 0.005);
  const materials = buildMaterialModels(material, mesh, reinforcementSnapshot, options);
  const envelopeEvaluator = createSectionEnvelopeEvaluator(mesh, { materials });
  const axialCapacity = scanSectionAxialCapacity(mesh, materials, options, envelopeEvaluator);
  const axialIntercepts = axialCapacity.bounds;
  const axialLevels = options.axialLevels || [
    0.5 * axialIntercepts.compression,
    0,
    0.5 * axialIntercepts.tension,
  ];
  const characteristicDepth = Math.max(
    Number(mesh.sourceSnapshot?.properties?.H || mesh.sourceSnapshot?.H || 0),
    Number(mesh.sourceSnapshot?.properties?.B || mesh.sourceSnapshot?.B || 0),
    Number(mesh.summary.bounds?.maxY || 0) - Number(mesh.summary.bounds?.minY || 0),
    Number(mesh.summary.bounds?.maxZ || 0) - Number(mesh.summary.bounds?.minZ || 0),
    1e-6,
  );
  const yieldStrain = minimumYieldStrain(materials);
  const defaultCurvatureMax = 8 * yieldStrain / characteristicDepth;
  const curvatureMax = Number(options.curvatureMax ?? defaultCurvatureMax);
  const curvatureSteps = Math.max(2, Math.trunc(Number(options.curvatureSteps ?? 16)));
  const defaultCurvatures = Array.from({ length: curvatureSteps + 1 }, (_, index) => curvatureMax * index / curvatureSteps);
  const surface = generatePmmSurface(mesh, {
    axialIntercepts,
    axialLevels,
    angles: options.angles,
    angleCount: options.angleCount ?? 8,
    curvatures: options.curvatures || defaultCurvatures,
    curvatureMax,
    curvatureSteps,
    axialTolerance: options.axialTolerance ?? 1e-6,
    axialAbsoluteTolerance: options.axialAbsoluteTolerance ?? options.forceTolerance ?? 1e-3,
    directionTolerance: options.directionTolerance ?? 5e-4,
    directionIterations: options.directionIterations ?? 12,
    capacityTolerance: options.capacityTolerance,
    capacityIterations: options.capacityIterations,
    capacityCurvatureTolerance: options.capacityCurvatureTolerance,
    memoizeSectionStates: true,
    signal: options.signal,
    cancellation: options.cancellation,
    isCancelled: options.isCancelled,
    shouldCancel: options.shouldCancel,
    onProgress: options.onProgress,
    solverId: 'p8-m6-target-axial-fiber-section',
    solverVersion: 'p8-m6-moment-curvature-v2',
    solverOptions: {
      materials,
      forceTolerance: options.forceTolerance ?? 1e-3,
      relativeTolerance: options.relativeTolerance ?? 1e-7,
      maxIterations: options.maxIterations ?? 80,
      epsilonBracket: options.epsilonBracket || [-0.05, 0.05],
      initialBracket: options.initialBracket,
      bracketExpansion: options.bracketExpansion,
      maxBracketExpansions: options.maxBracketExpansions,
      bracketSamples: options.bracketSamples,
    },
    solveTargetAxial(sectionMesh, input) {
      const pureAxial = Math.hypot(Number(input.kappaY || 0), Number(input.kappaZ || 0)) <= 1e-16;
      const intercept = nearlyEqual(input.targetN, axialCapacity.compression.N)
        ? axialCapacity.compression
        : nearlyEqual(input.targetN, axialCapacity.tension.N) ? axialCapacity.tension : null;
      if (pureAxial && intercept) {
        return {
          converged: true,
          epsilon0: intercept.epsilon0,
          residual: 0,
          axialResidual: 0,
          response: intercept.response,
        };
      }
      return solveSectionAxialEquilibrium(sectionMesh, {
        ...input,
        materials,
        evaluateSection(_section, deformation) {
          return envelopeEvaluator.evaluate(deformation);
        },
      });
    },
  });
  const source = {
    version: MEMBER_FIBER_INTERACTION_VERSION,
    memberId: member.id || null,
    materialRef: member.matId || null,
    sectionRef: member.secId || null,
    materialHash: stableHash(material),
    materialSourceHash: stableHash(cacheIdentity.materialSnapshot),
    sectionHash: mesh.sourceSnapshotHash,
    sectionSourceHash: stableHash(cacheIdentity.sectionSnapshot),
    reinforcementHash: reinforcementSnapshot ? stableHash(reinforcementSnapshot) : null,
    meshHash: mesh.geometryHash,
    surfaceHash: surface.surfaceHash,
    family,
    cacheKey,
    cacheIdentityHash: cacheKey,
  };
  return deepFreeze({
    version: MEMBER_FIBER_INTERACTION_VERSION,
    id: `FIBER-PMM:${member.id || member.secId || surface.surfaceHash.slice(0, 12)}`,
    qualification: mesh.qualification,
    units: {
      sectionForce: 'N',
      sectionMoment: 'N.m',
      analysisForceScale: 1000,
      analysisMomentScale: 1000,
    },
    mesh,
    materials,
    surface,
    preprocessing: {
      evaluator: 'stateless-monotonic-section-envelope',
      sectionEvaluationCount: envelopeEvaluator.evaluationCount,
      historyStateCreated: false,
    },
    source,
    contentHash: stableHash(source),
  });
}

export function buildModelFiberPmmInteractions(model = {}, options = {}) {
  const interactions = {};
  const byMember = {};
  const members = [];
  const warnings = [];
  const cache = new Map();
  const precomputed = normalizePrecomputedInteractions(options.precomputedInteractions);
  const precomputedSkipped = normalizePrecomputedInteractions(options.precomputedSkippedInteractions);
  for (const member of model.members || []) {
    throwIfInteractionBuildCancelled(options);
    const hinges = Array.isArray(member.nonlinear?.hinges) ? member.nonlinear.hinges : [];
    const distributed = member.nonlinear?.formulation === 'distributed-plasticity';
    if (hinges.length === 0 && !distributed) continue;
    const reinforcementSnapshot = options.reinforcementSnapshots?.[member.id]
      || member.nonlinear?.reinforcementSnapshot
      || null;
    const cacheKey = createMemberFiberInteractionCacheKey(model, member, {
      ...options,
      reinforcementSnapshot,
    });
    const skipped = precomputedSkipped.get(cacheKey);
    if (skipped) {
      warnings.push({
        code: skipped.code || 'FIBER_PMM_BUILD_SKIPPED',
        memberId: member.id || null,
        message: skipped.message || 'Fiber PMM preprocessing skipped this unsupported source.',
      });
      continue;
    }
    try {
      const localCached = cache.get(cacheKey);
      const precomputedCached = precomputed.get(cacheKey);
      const processCached = readInteractionCache(cacheKey);
      const cacheSource = localCached
        ? 'model-deduplicated'
        : precomputedCached ? 'precomputed' : processCached ? 'process-memory' : 'computed';
      const interaction = localCached
        || precomputedCached
        || processCached
        || (options.precomputedOnly === true ? null : buildMemberFiberInteraction(model, member, {
          ...options,
          reinforcementSnapshot,
        }));
      if (!interaction) {
        throw interactionError(
          'FIBER_PMM_PRECOMPUTED_INTERACTION_REQUIRED',
          `Precomputed fiber PMM interaction ${cacheKey} is unavailable.`,
        );
      }
      if (interaction.source?.cacheKey !== cacheKey || interaction.source?.cacheIdentityHash !== cacheKey) {
        throw interactionError(
          'FIBER_PMM_CACHE_IDENTITY_MISMATCH',
          `Fiber PMM interaction does not belong to cache identity ${cacheKey}.`,
        );
      }
      cache.set(cacheKey, interaction);
      rememberInteraction(cacheKey, interaction);
      const memberInteraction = interaction.source.memberId === member.id
        ? interaction
        : rebindInteractionMember(interaction, member.id);
      for (const hinge of hinges) interactions[`${member.id}:${hinge.axis}`] = memberInteraction;
      if (distributed) byMember[member.id] = memberInteraction;
      members.push({
        memberId: member.id,
        interactionId: memberInteraction.id,
        surfaceHash: memberInteraction.surface.surfaceHash,
        meshHash: memberInteraction.mesh.geometryHash,
        hingeCount: hinges.length,
        distributed,
        cacheKey,
      });
      options.onInteractionBuilt?.(Object.freeze({
        memberId: member.id || null,
        cacheKey,
        surfaceHash: memberInteraction.surface.surfaceHash,
        reused: cacheSource !== 'computed',
        cacheSource,
      }));
    } catch (error) {
      const warning = {
        code: error?.code || 'FIBER_PMM_BUILD_FAILED',
        memberId: member.id || null,
        message: error?.message || String(error),
      };
      const optionalUnsupportedSource = OPTIONAL_UNSUPPORTED_SOURCE_CODES.has(warning.code);
      if (options.strict === true || (options.strict !== false && !optionalUnsupportedSource)) {
        const blocked = new Error(warning.message);
        blocked.code = warning.code;
        blocked.memberId = warning.memberId;
        throw blocked;
      }
      warnings.push(warning);
    }
  }
  const core = {
    version: MEMBER_FIBER_INTERACTION_VERSION,
    interactions,
    byMember,
    members,
    warnings,
    summary: {
      interactionCount: Object.keys(interactions).length,
      distributedMemberCount: Object.keys(byMember).length,
      memberCount: members.length,
      skippedMemberCount: warnings.length,
      strict: options.strict !== false,
    },
  };
  return deepFreeze({ ...core, contentHash: stableHash({ members, warnings }) });
}

export function clearMemberFiberInteractionCache() {
  interactionCache.clear();
}

function readInteractionCache(cacheKey) {
  if (!interactionCache.has(cacheKey)) return null;
  const interaction = interactionCache.get(cacheKey);
  interactionCache.delete(cacheKey);
  interactionCache.set(cacheKey, interaction);
  return interaction;
}

function rememberInteraction(cacheKey, interaction) {
  if (interactionCache.has(cacheKey)) interactionCache.delete(cacheKey);
  interactionCache.set(cacheKey, interaction);
  while (interactionCache.size > MAX_MEMBER_INTERACTION_CACHE_ENTRIES) {
    interactionCache.delete(interactionCache.keys().next().value);
  }
}

export function isOptionalUnsupportedFiberSourceError(code) {
  return OPTIONAL_UNSUPPORTED_SOURCE_CODES.has(String(code || ''));
}

export function createMemberFiberInteractionCacheKey(model = {}, member = {}, options = {}) {
  return stableHash(createMemberFiberInteractionCacheIdentity(model, member, options));
}

export function createMemberFiberInteractionCacheIdentity(model = {}, member = {}, options = {}) {
  const reinforcementSnapshot = options.reinforcementSnapshot
    || options.reinforcementSnapshots?.[member.id]
    || member.nonlinear?.reinforcementSnapshot
    || null;
  return deepFreeze(cloneValue({
    contract: MEMBER_FIBER_INTERACTION_VERSION,
    algorithms: {
      mesh: FIBER_SECTION_MESH_VERSION,
      material: FIBER_MATERIAL_MODEL_VERSION,
      sectionResponse: SECTION_RESPONSE_VERSION,
      sectionEnvelope: SECTION_ENVELOPE_VERSION,
      axialEquilibrium: MOMENT_CURVATURE_V2_VERSION,
      pmmSurface: PMM_SURFACE_VERSION,
    },
    matId: member.matId,
    secId: member.secId,
    materialSnapshot: sourceRecordForCache(model.materials, member.matId),
    sectionSnapshot: sourceRecordForCache(model.sections, member.secId),
    reinforcementSnapshot,
    options: interactionOptionSnapshot(options),
  }));
}

export function planModelFiberPmmInteractions(model = {}, options = {}) {
  const grouped = new Map();
  for (const member of model.members || []) {
    const hinges = Array.isArray(member.nonlinear?.hinges) ? member.nonlinear.hinges : [];
    const distributed = member.nonlinear?.formulation === 'distributed-plasticity';
    if (hinges.length === 0 && !distributed) continue;
    const cacheIdentity = createMemberFiberInteractionCacheIdentity(model, member, options);
    const cacheKey = stableHash(cacheIdentity);
    const existing = grouped.get(cacheKey);
    if (existing) {
      existing.memberIds.push(member.id);
      continue;
    }
    grouped.set(cacheKey, {
      cacheKey,
      cacheIdentity,
      representativeMemberId: member.id,
      memberIds: [member.id],
    });
  }
  return Object.freeze([...grouped.values()].map((row) => Object.freeze({
    ...row,
    cacheIdentity: row.cacheIdentity,
    memberIds: Object.freeze(row.memberIds.slice()),
  })));
}

function buildMaterialModels(material, mesh, reinforcement, options) {
  const E = toPa(material.E, 'material.E');
  if (mesh.family === 'steel') {
    const fy = toPa(material.Fy ?? material.strength?.steel?.Fy, 'material.Fy');
    return deepFreeze({
      [mesh.materialIds.steel]: createSteelBilinearMaterial({
        id: mesh.materialIds.steel,
        E,
        Fy: fy,
        hardeningRatio: options.steelHardeningRatio ?? material.nonlinear?.hardeningRatio ?? 0.01,
        sourceSnapshot: material,
        qualification: qualificationOf(material),
      }),
    });
  }
  const fckMpa = positiveNumber(
    material.strength?.concrete?.fck ?? material.fck ?? material.fc ?? material.Fy / 1000,
    'material.fck',
  );
  const fc = fckMpa * 1e6;
  const ft = positiveNumber(options.concreteTensionStrength ?? 0.33 * Math.sqrt(fckMpa) * 1e6, 'concrete.ft');
  const rebarE = positiveNumber(reinforcement?.material?.E ?? reinforcement?.rebar?.E ?? 200000, 'rebar.E') * 1e6;
  const rebarFy = positiveNumber(
    reinforcement?.material?.Fy ?? reinforcement?.rebar?.Fy ?? material.fy_rebar ?? 400,
    'rebar.Fy',
  ) * 1e6;
  return deepFreeze({
    [mesh.materialIds.cover]: createConcreteMaterial({
      id: mesh.materialIds.cover,
      E,
      fc,
      ft,
      sourceSnapshot: material,
      qualification: qualificationOf(material),
    }),
    [mesh.materialIds.core]: createConcreteMaterial({
      id: mesh.materialIds.core,
      E,
      fc,
      ft,
      confinement: reinforcement?.confinement || { enabled: false },
      sourceSnapshot: { material, confinement: reinforcement?.confinement || null },
      qualification: qualificationOf(reinforcement),
    }),
    [mesh.materialIds.rebar]: createSteelBilinearMaterial({
      id: mesh.materialIds.rebar,
      E: rebarE,
      Fy: rebarFy,
      hardeningRatio: options.rebarHardeningRatio ?? 0.01,
      sourceSnapshot: reinforcement?.material || reinforcement?.rebar || null,
      qualification: qualificationOf(reinforcement),
    }),
  });
}

function scanSectionAxialCapacity(mesh, materials, options, envelopeEvaluator = null) {
  const evaluate = envelopeEvaluator
    ? (deformation) => envelopeEvaluator.evaluate(deformation)
    : (deformation) => evaluateSectionResponse(mesh, deformation, { materials });
  const materialRows = Object.values(materials);
  const steelYieldStrains = materialRows
    .filter((row) => row.type === 'steel-bilinear-kinematic')
    .map((row) => row.parameters.yieldStrain);
  const concreteRows = materialRows.filter((row) => row.type === 'concrete-compression-tension-damage');
  const compressionLimit = positiveNumber(options.compressionStrainLimit ?? Math.max(
    ...steelYieldStrains,
    ...concreteRows.map((row) => row.parameters.epscu),
    0.003,
  ), 'compressionStrainLimit');
  const defaultTensionLimit = 1.05 * Math.max(
    ...steelYieldStrains,
    ...concreteRows.map((row) => row.parameters.tensionUltimateStrain),
    0.002,
  );
  const tensionLimit = positiveNumber(options.tensionStrainLimit ?? defaultTensionLimit, 'tensionStrainLimit');
  const count = Math.max(40, Math.trunc(Number(options.axialCapacitySamples || 160)));
  const strains = new Set([0, -compressionLimit, tensionLimit]);
  for (const value of steelYieldStrains) {
    strains.add(value);
    strains.add(-value);
  }
  for (const row of concreteRows) {
    strains.add(-row.parameters.epsc0);
    strains.add(-row.parameters.epscu);
    strains.add(row.parameters.tensionCrackStrain);
    strains.add(row.parameters.tensionUltimateStrain);
  }
  for (let index = 0; index <= count; index += 1) {
    strains.add(-compressionLimit + (compressionLimit + tensionLimit) * index / count);
  }
  const rows = [...strains].sort((a, b) => a - b).map((epsilon0) => ({
    epsilon0,
    response: evaluate({ epsilon0, kappaY: 0, kappaZ: 0 }),
  })).map((row) => ({ ...row, N: row.response.N }));
  const zeroIndex = rows.reduce((best, row, index) => (
    Math.abs(row.epsilon0) < Math.abs(rows[best].epsilon0) ? index : best
  ), 0);
  const compression = firstAxialLimitState(
    rows.slice(0, zeroIndex + 1).reverse(),
    mesh,
    materials,
    options,
    envelopeEvaluator,
  );
  const tension = firstAxialLimitState(
    rows.slice(zeroIndex),
    mesh,
    materials,
    options,
    envelopeEvaluator,
  );
  if (!(compression.N < 0 && tension.N > 0)) {
    throw interactionError('FIBER_AXIAL_INTERCEPTS_INVALID', 'Fiber axial intercepts are invalid.');
  }
  return {
    bounds: { compression: compression.N, tension: tension.N },
    compression,
    tension,
  };
}

function firstAxialLimitState(path, mesh, materials, options, envelopeEvaluator = null) {
  let lower = path[0];
  for (let index = 1; index < path.length; index += 1) {
    let upper = path[index];
    if (!sectionStrengthLimitReached(upper.response, materials)) {
      lower = upper;
      continue;
    }
    const iterations = Math.max(12, Math.trunc(Number(options.axialCapacityIterations || 32)));
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const epsilon0 = 0.5 * (lower.epsilon0 + upper.epsilon0);
      const response = envelopeEvaluator
        ? envelopeEvaluator.evaluate({ epsilon0, kappaY: 0, kappaZ: 0 })
        : evaluateSectionResponse(mesh, { epsilon0, kappaY: 0, kappaZ: 0 }, { materials });
      const candidate = { epsilon0, response, N: response.N };
      if (sectionStrengthLimitReached(response, materials)) upper = candidate;
      else lower = candidate;
    }
    return upper;
  }
  throw interactionError('FIBER_AXIAL_LIMIT_STATE_NOT_REACHED', 'A pure-axial material strength limit was not reached.');
}

function sectionStrengthLimitReached(response, materials) {
  if (response?.strengthLimitState?.reached === true) return true;
  if (response?.limitState?.reached === true) return true;
  return (response?.fibers || []).some((fiber) => {
    const branch = String(fiber?.trialState?.branch || fiber?.branch || '');
    const material = materials?.[fiber.materialId];
    const steelYield = material?.type === 'steel-bilinear-kinematic'
      && Math.abs(Number(fiber.stress)) >= material.parameters.Fy * (1 - 1e-10);
    const concretePeak = material?.type === 'concrete-compression-tension-damage'
      && Number(fiber.strain) <= -material.parameters.epsc0 * (1 - 1e-10);
    return steelYield
      || concretePeak
      || branch.startsWith('plastic-')
      || branch.includes('compression-descending')
      || branch.includes('compression-residual');
  });
}

function interactionOptionSnapshot(options) {
  return {
    inputLengthUnit: options.inputLengthUnit ?? null,
    refinement: normalizedRefinementSnapshot(options),
    sourcePropertyTolerance: options.sourcePropertyTolerance ?? 0.005,
    angles: options.angles ?? null,
    angleCount: options.angles ? null : options.angleCount ?? 8,
    curvatures: options.curvatures ?? null,
    curvatureMax: options.curvatureMax ?? null,
    curvatureSteps: options.curvatureSteps ?? 16,
    axialLevels: options.axialLevels ?? null,
    axialTolerance: options.axialTolerance ?? 1e-6,
    axialAbsoluteTolerance: options.axialAbsoluteTolerance ?? options.forceTolerance ?? 1e-3,
    directionTolerance: options.directionTolerance ?? 5e-4,
    directionIterations: options.directionIterations ?? 12,
    capacityTolerance: options.capacityTolerance ?? 1e-12,
    capacityIterations: options.capacityIterations ?? 18,
    capacityCurvatureTolerance: options.capacityCurvatureTolerance ?? 1e-6,
    forceTolerance: options.forceTolerance ?? 1e-3,
    relativeTolerance: options.relativeTolerance ?? 1e-7,
    maxIterations: options.maxIterations ?? 80,
    epsilonBracket: options.epsilonBracket ?? [-0.05, 0.05],
    initialBracket: options.initialBracket ?? null,
    bracketExpansion: options.bracketExpansion ?? 2,
    maxBracketExpansions: options.maxBracketExpansions ?? 40,
    bracketSamples: options.bracketSamples ?? 64,
    compressionStrainLimit: options.compressionStrainLimit ?? null,
    tensionStrainLimit: options.tensionStrainLimit ?? null,
    axialCapacitySamples: options.axialCapacitySamples ?? 160,
    axialCapacityIterations: options.axialCapacityIterations ?? 32,
    steelHardeningRatio: options.steelHardeningRatio ?? 0.01,
    rebarHardeningRatio: options.rebarHardeningRatio ?? 0.01,
    concreteTensionStrength: options.concreteTensionStrength ?? null,
  };
}

function normalizedRefinementSnapshot(options) {
  const source = typeof options.refinement === 'number'
    ? { level: options.refinement }
    : options.refinement || {};
  const level = Math.max(1, Math.trunc(Number(source.level ?? 1)));
  return {
    level,
    longitudinal: source.longitudinal ?? 8 * level,
    thickness: source.thickness ?? 2 * level,
    sectors: source.sectors ?? 32 * level,
    radial: source.radial ?? 2 * level,
    rcDivisions: source.rcDivisions ?? 8 * level,
    maxCellSize: source.maxCellSize ?? options.maxCellSize ?? null,
    maxCellSizeUnit: source.units?.length || source.maxCellSizeUnit || options.maxCellSizeUnit || 'm',
  };
}

function normalizePrecomputedInteractions(value) {
  if (value instanceof Map) return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return new Map();
  return new Map(Object.entries(value));
}

function cloneValue(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function throwIfInteractionBuildCancelled(options) {
  const cancelled = options.signal?.aborted === true
    || options.cancellation?.requested === true
    || options.isCancelled?.() === true
    || options.shouldCancel?.() === true;
  if (!cancelled) return;
  throw interactionError('PMM_GENERATION_CANCELLED', 'Fiber PMM preprocessing was cancelled.');
}

function requireSourcePropertyConsistency(mesh, toleranceInput) {
  const tolerance = Number(toleranceInput);
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw interactionError('FIBER_SOURCE_TOLERANCE_INVALID', 'sourcePropertyTolerance must be finite and nonnegative.');
  }
  const mismatches = Object.entries(mesh.sourcePropertyAudit?.rows || {})
    .filter(([, row]) => Number(row.relativeError) > tolerance)
    .map(([property, row]) => ({ property, relativeError: row.relativeError, expected: row.expected, actual: row.actual }));
  if (mismatches.length) {
    const error = interactionError(
      'FIBER_SOURCE_PROPERTY_MISMATCH',
      `Fiber mesh does not match Phase 7 section properties within ${tolerance}.`,
    );
    error.mismatches = mismatches;
    throw error;
  }
}

function minimumYieldStrain(materials) {
  const values = Object.values(materials).map((material) => (
    material.type === 'steel-bilinear-kinematic'
      ? material.parameters.yieldStrain
      : material.parameters.epsc0
  )).filter((value) => Number.isFinite(value) && value > 0);
  return Math.min(...values);
}

function materialFamily(material, section, reinforcement) {
  const text = `${material.kind || ''} ${material.type || ''} ${material.name || ''}`.toLowerCase();
  if (reinforcement || /concrete|\brc\b/.test(text)) return 'concrete';
  if (['RECT', 'SQUARE'].includes(String(section.shape || section.type || '').toUpperCase())) return 'concrete';
  return 'steel';
}

function rebindInteractionMember(interaction, memberId) {
  const source = { ...interaction.source, memberId };
  return deepFreeze({
    ...interaction,
    id: `FIBER-PMM:${memberId}`,
    source,
    contentHash: stableHash(source),
  });
}

function sourceRecordForCache(records, reference) {
  const [id, versionText] = String(reference || '').split('@');
  const version = versionText == null ? null : Number(versionText);
  const matches = (records || []).filter((row) => String(row.id) === id && (version == null || Number(row.version) === version));
  return matches.sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0] || reference || null;
}

function qualificationOf(...sources) {
  for (const source of sources) {
    const value = String(source?.qualification || '').trim();
    if (['verified', 'candidate', 'implemented', 'preliminary', 'assumed'].includes(value)) return value;
  }
  return 'candidate';
}

function toPa(value, path) {
  return positiveNumber(value, path) * 1000;
}

function positiveNumber(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw interactionError('FIBER_SOURCE_VALUE_INVALID', `${path} must be positive.`);
  return number;
}

function interactionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function nearlyEqual(a, b, tolerance = 1e-10) {
  return Math.abs(Number(a) - Number(b)) <= tolerance * Math.max(1, Math.abs(Number(a)), Math.abs(Number(b)));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
