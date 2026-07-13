import { stableHash } from '../../core/stableHash.js';
import { materialOf, sectionOf } from '../../core/catalogs.js';
import { buildFiberSectionMesh } from './sectionMesh.js';
import { createConcreteMaterial, createSteelBilinearMaterial } from './materialModels.js';
import { solveSectionAxialEquilibrium } from './momentCurvatureV2.js';
import { generatePmmSurface } from './pmmSurface.js';
import { evaluateSectionResponse } from './sectionResponse.js';

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

export function buildMemberFiberInteraction(model = {}, member = {}, options = {}) {
  const material = materialOf(model, member.matId);
  const section = sectionOf(model, member.secId);
  const reinforcementSnapshot = options.reinforcementSnapshot
    || options.reinforcementSnapshots?.[member.id]
    || member.nonlinear?.reinforcementSnapshot
    || null;
  const family = materialFamily(material, section, reinforcementSnapshot);
  const mesh = buildFiberSectionMesh(section, {
    kind: family === 'concrete' ? 'rc' : 'steel',
    materialId: 'steel',
    reinforcementSnapshot,
    refinement: options.refinement,
    inputLengthUnit: options.inputLengthUnit,
    qualification: qualificationOf(section, reinforcementSnapshot),
  });
  requireSourcePropertyConsistency(mesh, options.sourcePropertyTolerance ?? 0.005);
  const materials = buildMaterialModels(material, mesh, reinforcementSnapshot, options);
  const axialCapacity = scanSectionAxialCapacity(mesh, materials, options);
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
  const defaultCurvatures = Array.from({ length: 17 }, (_, index) => defaultCurvatureMax * index / 16);
  const surface = generatePmmSurface(mesh, {
    axialIntercepts,
    axialLevels,
    angles: options.angles,
    angleCount: options.angleCount ?? 8,
    curvatures: options.curvatures || defaultCurvatures,
    curvatureMax: options.curvatureMax ?? defaultCurvatureMax,
    curvatureSteps: options.curvatureSteps ?? 5,
    axialTolerance: options.axialTolerance ?? 1e-6,
    axialAbsoluteTolerance: options.axialAbsoluteTolerance ?? options.forceTolerance ?? 1e-3,
    directionTolerance: options.directionTolerance ?? 5e-4,
    directionIterations: options.directionIterations ?? 12,
    solverId: 'p8-m6-target-axial-fiber-section',
    solverVersion: 'p8-m6-moment-curvature-v2',
    solverOptions: {
      materials,
      forceTolerance: options.forceTolerance ?? 1e-3,
      relativeTolerance: options.relativeTolerance ?? 1e-7,
      maxIterations: options.maxIterations ?? 80,
      epsilonBracket: options.epsilonBracket || [-0.05, 0.05],
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
      });
    },
  });
  const source = {
    version: MEMBER_FIBER_INTERACTION_VERSION,
    memberId: member.id || null,
    materialRef: member.matId || null,
    sectionRef: member.secId || null,
    materialHash: stableHash(material),
    sectionHash: mesh.sourceSnapshotHash,
    reinforcementHash: reinforcementSnapshot ? stableHash(reinforcementSnapshot) : null,
    meshHash: mesh.geometryHash,
    surfaceHash: surface.surfaceHash,
    family,
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
  for (const member of model.members || []) {
    const hinges = Array.isArray(member.nonlinear?.hinges) ? member.nonlinear.hinges : [];
    const distributed = member.nonlinear?.formulation === 'distributed-plasticity';
    if (hinges.length === 0 && !distributed) continue;
    const reinforcementSnapshot = options.reinforcementSnapshots?.[member.id]
      || member.nonlinear?.reinforcementSnapshot
      || null;
    const cacheKey = stableHash({
      matId: member.matId,
      secId: member.secId,
      materialSnapshot: sourceRecordForCache(model.materials, member.matId),
      sectionSnapshot: sourceRecordForCache(model.sections, member.secId),
      reinforcementSnapshot,
      options: interactionOptionSnapshot(options),
    });
    try {
      const interaction = cache.get(cacheKey) || interactionCache.get(cacheKey) || buildMemberFiberInteraction(model, member, {
        ...options,
        reinforcementSnapshot,
      });
      cache.set(cacheKey, interaction);
      interactionCache.set(cacheKey, interaction);
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
      });
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

function scanSectionAxialCapacity(mesh, materials, options) {
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
    response: evaluateSectionResponse(mesh, { epsilon0, kappaY: 0, kappaZ: 0 }, { materials }),
  })).map((row) => ({ ...row, N: row.response.N }));
  const zeroIndex = rows.reduce((best, row, index) => (
    Math.abs(row.epsilon0) < Math.abs(rows[best].epsilon0) ? index : best
  ), 0);
  const compression = firstAxialLimitState(
    rows.slice(0, zeroIndex + 1).reverse(),
    mesh,
    materials,
    options,
  );
  const tension = firstAxialLimitState(
    rows.slice(zeroIndex),
    mesh,
    materials,
    options,
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

function firstAxialLimitState(path, mesh, materials, options) {
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
      const response = evaluateSectionResponse(mesh, { epsilon0, kappaY: 0, kappaZ: 0 }, { materials });
      const candidate = { epsilon0, response, N: response.N };
      if (sectionStrengthLimitReached(response, materials)) upper = candidate;
      else lower = candidate;
    }
    return upper;
  }
  throw interactionError('FIBER_AXIAL_LIMIT_STATE_NOT_REACHED', 'A pure-axial material strength limit was not reached.');
}

function sectionStrengthLimitReached(response, materials) {
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
  const keys = [
    'inputLengthUnit', 'refinement', 'maxCellSize', 'maxCellSizeUnit', 'sourcePropertyTolerance',
    'angles', 'angleCount', 'curvatures', 'curvatureMax', 'curvatureSteps', 'axialLevels',
    'axialTolerance', 'axialAbsoluteTolerance', 'directionTolerance', 'directionIterations', 'capacityTolerance',
    'capacityIterations', 'capacityCurvatureTolerance', 'forceTolerance', 'relativeTolerance',
    'maxIterations', 'epsilonBracket', 'compressionStrainLimit', 'tensionStrainLimit',
    'axialCapacitySamples', 'axialCapacityIterations', 'steelHardeningRatio',
    'rebarHardeningRatio', 'concreteTensionStrength',
  ];
  return Object.fromEntries(keys.filter((key) => options[key] !== undefined).map((key) => [key, options[key]]));
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
