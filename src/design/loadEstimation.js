import {
  createDesignBasis,
  getDesignBasisInputFields,
  summarizeAppliedLoadEstimation,
} from './designBasisInput.js';
import {
  buildLoadDerivationTraceFromParts,
  computeSeismicBaseShear,
} from './loadDerivationTrace.js';
import { getStoryLevels, nodesAtStoryLevel } from '../core/storyLevels.js';
import { buildStoryMassSummary } from '../core/storyMassSummary.js';
import { attachStoryMassToLateralRows } from './storyLateralMassAttach.js';
import { storyLoadDistribution } from './storyLoadDistribution.js';
import { signedAccidentalLoadCases } from './signedAccidentalLoadCases.js';
import { shouldGenerateSignedAccidental } from './signedAccidentalEligibility.js';
import { signedAccidentalVariants } from './signedAccidentalVariants.js';
import { finite } from './loadMath.js';
import { normalizeLoadCaseMetadata } from '../loads/loadCaseMetadata.js';

import { LOAD_ESTIMATION_VERSION } from './loadEstimationConstants.js';

export { LOAD_ESTIMATION_VERSION } from './loadEstimationConstants.js';
export {
  createDesignBasis,
  buildDesignBasisValueMetadata,
  DESIGN_BASIS_INPUT_VERSION,
  DESIGN_BASIS_NUMERIC_FIELDS,
  DEFAULT_DESIGN_BASIS,
  getDesignBasisInputFields,
  normalizeDesignBasisFamilyStates,
  OCCUPANCY_LOAD_PRESETS,
} from './designBasisInput.js';
export {
  buildLoadDerivationTrace,
  buildLoadDerivationTraceFromParts,
  LOAD_DERIVATION_TRACE_VERSION,
} from './loadDerivationTrace.js';
export {
  buildEccentricStoryLoadDistribution,
  STORY_ECCENTRIC_DISTRIBUTION_VERSION,
} from './storyEccentricDistribution.js';

export function buildDesignBasisInputState(model, input = {}) {
  const source = input.designBasis || input || {};
  const basis = createDesignBasis({
    ...(model?.designBasis || {}),
    ...source,
  });
  const preview = estimateModelLoads(model || { nodes: [], members: [] }, basis, { generateLoads: true });
  return {
    ...getDesignBasisInputFields(),
    loadEstimationVersion: LOAD_ESTIMATION_VERSION,
    basis,
    preview: {
      geometry: preview.geometry,
      loadCases: preview.loadCases,
      storyLoads: preview.storyLoads,
      summary: preview.summary,
      limitations: preview.limitations,
    },
    applied: summarizeAppliedLoadEstimation(model?.loadEstimation),
    generatedModelLoadCount: (model?.loads || []).filter((load) => load.generatedBy === LOAD_ESTIMATION_VERSION).length,
  };
}

export function setDesignBasisInput(model, input = {}) {
  if (!model || typeof model !== 'object') throw new Error('setDesignBasisInput requires a model.');
  model.designBasis = createDesignBasis({
    ...(model.designBasis || {}),
    ...(input.designBasis || input || {}),
  });
  return buildDesignBasisInputState(model, model.designBasis);
}

export function estimateModelLoads(model, designBasis = {}, options = {}) {
  const basis = createDesignBasis(designBasis);
  const geometry = summarizeModelGeometry(model);
  const storyLevels = geometry.storyLevels;
  const floorArea = basis.floorArea || Math.max(1, geometry.planArea);
  const roofArea = basis.roofArea || floorArea;
  const storyDeadLoads = [];
  const storyLiveLoads = [];
  const storyLateralLoads = [];
  const loads = [];

  let loadIndex = 1;
  for (const [index, z] of storyLevels.entries()) {
    const isRoof = index === storyLevels.length - 1;
    const area = isRoof ? roofArea : floorArea;
    const deadTotal = area * basis.deadLoad;
    const liveTotal = area * (isRoof ? basis.roofLiveLoad : basis.liveLoad);
    const beams = horizontalMembersAtLevel(model, z);
    const beamLength = beams.reduce((sum, item) => sum + item.length, 0);
    const storyNodes = nodesAtStoryLevel(model, z);

    storyDeadLoads.push({ story: index + 1, z, area, intensity: basis.deadLoad, total: deadTotal, beamLength, beamCount: beams.length });
    storyLiveLoads.push({ story: index + 1, z, area, intensity: isRoof ? basis.roofLiveLoad : basis.liveLoad, total: liveTotal, beamLength, beamCount: beams.length });

    if (options.generateLoads !== false && beamLength > 0) {
      for (const item of beams) {
        const tributaryShare = item.length / beamLength;
        loads.push(gravityLoad(`LD-D-${loadIndex++}`, item.member.id, deadTotal * tributaryShare / item.length, 'D', {
          story: index + 1,
          area,
          intensity: basis.deadLoad,
          total: deadTotal,
          tributaryShare,
          traceRowId: `D-DIST-ST${index + 1}`,
        }));
        loads.push(gravityLoad(`LD-L-${loadIndex++}`, item.member.id, liveTotal * tributaryShare / item.length, 'L', {
          story: index + 1,
          area,
          intensity: isRoof ? basis.roofLiveLoad : basis.liveLoad,
          total: liveTotal,
          tributaryShare,
          traceRowId: `L-DIST-ST${index + 1}`,
        }));
      }
    }

    const storyHeight = storyHeightForLevel(geometry, index);
    const windX = basis.windPressureX * Math.max(1, geometry.size.y) * storyHeight;
    const windY = basis.windPressureY * Math.max(1, geometry.size.x) * storyHeight;
    storyLateralLoads.push({
      story: index + 1,
      z,
      storyHeight,
      windX,
      windY,
      effectiveWeight: deadTotal + liveTotal * basis.seismicLiveLoadFactor,
      nodeCount: storyNodes.length,
    });

  }

  const storyMassSummary = buildStoryMassSummary(model);
  const lateralRows = attachStoryMassToLateralRows(storyLateralLoads, storyMassSummary);
  const distributionOptions = { ...options, designBasis: basis };
  const useSignedAccidental = shouldGenerateSignedAccidental(storyMassSummary, basis, options);

  if (options.generateLoads !== false) {
    addWindLoads(loads, model, lateralRows, storyMassSummary, distributionOptions, useSignedAccidental);
  }
  addSeismicLoads(loads, model, lateralRows, basis, distributionOptions, storyMassSummary, useSignedAccidental);

  const seismicSummary = computeSeismicBaseShear(lateralRows, basis);
  const derivationTrace = buildLoadDerivationTraceFromParts({
    basis,
    geometry,
    storyDeadLoads,
    storyLiveLoads,
    storyLateralLoads: lateralRows,
    seismicSummary,
    storyMassSummary,
  });

  const summary = {
    version: LOAD_ESTIMATION_VERSION,
    occupancy: basis.occupancy,
    floorArea,
    roofArea,
    storyCount: storyLevels.length,
    totalDead: storyDeadLoads.reduce((sum, item) => sum + item.total, 0),
    totalLive: storyLiveLoads.reduce((sum, item) => sum + item.total, 0),
    totalWindX: lateralRows.reduce((sum, item) => sum + item.windX, 0),
    totalWindY: lateralRows.reduce((sum, item) => sum + item.windY, 0),
    totalSeismicX: seismicSummary.baseShearX,
    totalSeismicY: seismicSummary.baseShearY,
    generatedLoadCount: loads.length,
    storyMassVersion: storyMassSummary.version,
    eccentricDistribution: options.eccentricDistribution !== false,
    accidentalEccentricityRatio: basis.accidentalEccentricityRatio,
    signedAccidentalCases: useSignedAccidental,
  };

  return {
    version: LOAD_ESTIMATION_VERSION,
    basis,
    geometry,
    loadCases: defaultDerivedLoadCases(useSignedAccidental),
    loads,
    storyLoads: {
      gravity: storyDeadLoads.map((dead, index) => ({
        story: dead.story,
        z: dead.z,
        area: dead.area,
        deadIntensity: dead.intensity,
        deadTotal: dead.total,
        liveIntensity: storyLiveLoads[index]?.intensity || 0,
        liveTotal: storyLiveLoads[index]?.total || 0,
        beamLength: dead.beamLength,
        beamCount: dead.beamCount,
      })),
      lateral: lateralRows,
    },
    storyMassSummary,
    derivationTrace,
    summary,
    limitations: [
      'Area loads are distributed to horizontal frame members by member length share.',
      'Wind and seismic loads use story-mass eccentric nodal distribution when story mass and diaphragm data are available.',
      'Project-specific KDS coefficients, exposure, importance, seismic site class, and load reductions are not yet fully automated.',
    ],
  };
}

export function applyDesignBasisLoads(model, designBasis = {}, options = {}) {
  if (!model || typeof model !== 'object') throw new Error('applyDesignBasisLoads requires a model.');
  const estimation = estimateModelLoads(model, designBasis, options);
  const replaceGenerated = options.replaceGenerated !== false;
  const loadMerge = mergeGeneratedLoads(model.loads || [], estimation.loads, { replaceGenerated });
  const caseMerge = mergeLoadCases(model.loadCases || [], estimation.loadCases);
  const application = {
    mode: replaceGenerated ? 'replace-generated' : 'merge',
    created: loadMerge.created,
    updated: loadMerge.updated,
    unchanged: loadMerge.unchanged,
    removed: loadMerge.removed,
    preserved: loadMerge.preserved,
    conflicts: [...loadMerge.conflicts, ...caseMerge.conflicts],
  };
  const loadEstimation = {
    ...estimation,
    application,
    loads: loadMerge.loads
      .filter((load) => load.generatedBy === LOAD_ESTIMATION_VERSION || load.sourceId === LOAD_ESTIMATION_VERSION)
      .map((load) => ({
      id: load.id,
      type: load.type,
      case: load.case,
      member: load.member || null,
      node: load.node || null,
      value: load.w ?? load.P ?? load.M ?? null,
      direction: load.dir || null,
      derivation: load.derivation || null,
      generatedKey: load.generatedKey || null,
      userModified: load.userModified === true,
    })),
  };
  const previous = {
    loads: model.loads,
    loadCases: model.loadCases,
    designBasis: model.designBasis,
    loadEstimation: model.loadEstimation,
  };
  try {
    model.loads = loadMerge.loads;
    model.loadCases = caseMerge.loadCases;
    model.designBasis = estimation.basis;
    model.loadEstimation = loadEstimation;
  } catch (error) {
    try {
      model.loads = previous.loads;
      model.loadCases = previous.loadCases;
      model.designBasis = previous.designBasis;
      model.loadEstimation = previous.loadEstimation;
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  }
  return { ...estimation, application };
}

function defaultDerivedLoadCases(useSignedAccidental = false) {
  const base = [
    { id: 'D', name: 'Dead load', type: 'dead', family: 'D', variant: 'superimposed' },
    { id: 'L', name: 'Live load', type: 'live', family: 'L', variant: 'occupancy' },
    { id: 'WX', name: 'Wind X', type: 'wind', family: 'W', direction: 'x', variant: 'base' },
    { id: 'WY', name: 'Wind Y', type: 'wind', family: 'W', direction: 'y', variant: 'base' },
    { id: 'EX', name: 'Seismic X', type: 'seismic', family: 'E', direction: 'x', variant: 'base' },
    { id: 'EY', name: 'Seismic Y', type: 'seismic', family: 'E', direction: 'y', variant: 'base' },
  ];
  const cases = useSignedAccidental ? [...base, ...signedAccidentalLoadCases()] : base;
  return cases.map((loadCase) => normalizeLoadCaseMetadata({
    ...loadCase,
    origin: 'template',
    sourceId: LOAD_ESTIMATION_VERSION,
    status: 'candidate',
    inputState: 'candidate',
    userModified: false,
  }, {
    sourceId: LOAD_ESTIMATION_VERSION,
    origin: 'template',
    status: 'candidate',
    inputState: 'candidate',
  }));
}

function summarizeModelGeometry(model) {
  const nodes = model?.nodes || [];
  const bounds = modelBounds(nodes);
  const storyInfo = getStoryLevels(model);
  return {
    bounds,
    size: bounds.size,
    planArea: Math.max(0, bounds.size.x * bounds.size.y),
    storyLevels: storyInfo.storyTops,
    baseLevel: storyInfo.baseZ,
  };
}

function horizontalMembersAtLevel(model, z) {
  const nodesById = new Map((model?.nodes || []).map((node) => [node.id, node]));
  return (model?.members || [])
    .map((member) => {
      const n1 = nodesById.get(member.n1);
      const n2 = nodesById.get(member.n2);
      if (!n1 || !n2) return null;
      const dz1 = Math.abs(finite(n1.z, 0) - z);
      const dz2 = Math.abs(finite(n2.z, 0) - z);
      if (dz1 > 1e-6 || dz2 > 1e-6) return null;
      const length = Math.hypot(finite(n2.x, 0) - finite(n1.x, 0), finite(n2.y, 0) - finite(n1.y, 0), finite(n2.z, 0) - finite(n1.z, 0));
      return length > 1e-6 ? { member, length } : null;
    })
    .filter(Boolean);
}

function gravityLoad(id, member, w, loadCase, derivation) {
  return {
    id,
    type: 'udl',
    member,
    w,
    dir: '-z',
    direction: [0, 0, -1],
    coordinate: 'global',
    unit: 'kN/m',
    case: loadCase,
    generatedBy: LOAD_ESTIMATION_VERSION,
    origin: 'template',
    sourceId: LOAD_ESTIMATION_VERSION,
    generatedKey: generatedLoadKey({ type: 'udl', caseId: loadCase, memberId: member, story: derivation?.story, role: 'gravity-distribution' }),
    userModified: false,
    status: 'candidate',
    derivation,
  };
}

function addStoryNodalLoads(loads, model, z, totalForce, dir, loadCase, prefix, derivation = {}, storyMassSummary, options = {}) {
  const distribution = storyLoadDistribution(model, z, totalForce, dir, { ...derivation, caseId: loadCase }, storyMassSummary, options);
  if (!distribution) return;
  for (const [index, item] of distribution.nodeForces.entries()) {
    loads.push({
      id: `${prefix}-${index + 1}`,
      type: 'nodal',
      node: item.nodeId,
      P: item.P,
      dir: item.dir || dir,
      case: loadCase,
      unit: 'kN',
      generatedBy: LOAD_ESTIMATION_VERSION,
      origin: 'template',
      sourceId: LOAD_ESTIMATION_VERSION,
      generatedKey: generatedLoadKey({
        type: 'nodal',
        caseId: loadCase,
        nodeId: item.nodeId,
        story: derivation.story,
        role: derivation.parentCase ? 'signed-lateral-distribution' : 'lateral-distribution',
      }),
      userModified: false,
      status: 'candidate',
      derivation: {
        ...derivation,
        storyZ: z,
        totalForce,
        nodeShare: item.P,
        distributionMethod: distribution.method,
        torsionMz: distribution.torsionMz,
        storyMassVersion: storyMassSummary?.version || null,
        massCenter: distribution.massCenter || null,
        diaphragmCenter: distribution.diaphragmCenter || null,
        baseEccentricity: distribution.baseEccentricity || null,
        accidentalEccentricity: distribution.accidentalEccentricity || null,
        eccentricity: distribution.eccentricity || null,
      },
    });
  }
}

function addWindLoads(loads, model, storyLoads, storyMassSummary, options, useSignedAccidental) {
  const baseOptions = { ...options, accidentalEccentricityRatio: 0 };
  for (const item of storyLoads) {
    addStoryNodalLoads(loads, model, item.z, item.windX, '+x', 'WX', `LD-WX-${item.story}`, {
      story: item.story,
      traceRowId: `WX-NODE-ST${item.story}`,
    }, storyMassSummary, baseOptions);
    addStoryNodalLoads(loads, model, item.z, item.windY, '+y', 'WY', `LD-WY-${item.story}`, {
      story: item.story,
      traceRowId: `WY-NODE-ST${item.story}`,
    }, storyMassSummary, baseOptions);
    if (useSignedAccidental) addSignedWindLoads(loads, model, item, storyMassSummary, options);
  }
}

function addSeismicLoads(loads, model, storyLoads, basis, options, storyMassSummary, useSignedAccidental) {
  if (options.generateLoads === false) return;
  const baseOptions = { ...options, accidentalEccentricityRatio: 0 };
  const { denominator, baseShearX, baseShearY } = computeSeismicBaseShear(storyLoads, basis);
  for (const item of storyLoads) {
    const factor = item.effectiveWeight * Math.max(item.z, 0) / denominator;
    addStoryNodalLoads(loads, model, item.z, baseShearX * factor, '+x', 'EX', `LD-EX-${item.story}`, {
      story: item.story,
      traceRowId: `EX-NODE-ST${item.story}`,
    }, storyMassSummary, baseOptions);
    addStoryNodalLoads(loads, model, item.z, baseShearY * factor, '+y', 'EY', `LD-EY-${item.story}`, {
      story: item.story,
      traceRowId: `EY-NODE-ST${item.story}`,
    }, storyMassSummary, baseOptions);
    if (useSignedAccidental) addSignedSeismicLoads(loads, model, item, { baseShearX, baseShearY, factor }, storyMassSummary, options);
  }
}

function addSignedWindLoads(loads, model, item, storyMassSummary, options) {
  addSignedLateral(loads, model, item, 'WX', item.windX, '+x', storyMassSummary, options);
  addSignedLateral(loads, model, item, 'WY', item.windY, '+y', storyMassSummary, options);
}

function addSignedSeismicLoads(loads, model, item, shear, storyMassSummary, options) {
  addSignedLateral(loads, model, item, 'EX', shear.baseShearX * shear.factor, '+x', storyMassSummary, options);
  addSignedLateral(loads, model, item, 'EY', shear.baseShearY * shear.factor, '+y', storyMassSummary, options);
}

function addSignedLateral(loads, model, item, baseCase, totalForce, dir, storyMassSummary, options) {
  for (const variant of signedAccidentalVariants(baseCase)) {
    addStoryNodalLoads(loads, model, item.z, totalForce, dir, variant.caseId, `LD-${variant.caseId}-${item.story}`, {
      story: item.story,
      traceRowId: `${variant.caseId}-NODE-ST${item.story}`,
      parentCase: baseCase,
      accidentalSign: variant.sign,
    }, storyMassSummary, { ...options, accidentalEccentricitySign: variant.sign });
  }
}

function storyHeightForLevel(geometry, index) {
  const current = geometry.storyLevels[index];
  const previous = index === 0 ? geometry.baseLevel : geometry.storyLevels[index - 1];
  return Math.max(1, current - previous);
}

function mergeLoadCases(existing, generated) {
  const loadCases = existing.filter((item) => item?.id).map((item) => clonePlain(item));
  const conflicts = [];
  for (const proposed of generated) {
    const index = loadCases.findIndex((item) => (
      item.generatedKey && proposed.generatedKey && item.generatedKey === proposed.generatedKey
    ) || item.id === proposed.id);
    if (index < 0) {
      loadCases.push(clonePlain(proposed));
      continue;
    }
    const current = loadCases[index];
    if (sameGeneratedContent(current, proposed)) continue;
    if (current.userModified === true || !current.generatedKey || current.origin === 'manual') {
      conflicts.push(generationConflict('load-case', current, proposed));
      continue;
    }
    loadCases[index] = clonePlain(proposed);
  }
  return { loadCases: deduplicateById(loadCases), conflicts };
}

function mergeGeneratedLoads(existingInput, generatedInput, { replaceGenerated }) {
  const loads = existingInput.filter(Boolean).map((item) => clonePlain(item));
  const proposed = generatedInput.filter(Boolean).map((item) => clonePlain(item));
  const proposedKeys = new Set();
  const conflicts = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let preserved = 0;

  for (const candidate of proposed) {
    const logicalKey = candidate.generatedKey || candidate.id;
    proposedKeys.add(logicalKey);
    const index = loads.findIndex((item) => (
      item.generatedKey && candidate.generatedKey
        ? item.generatedKey === candidate.generatedKey
        : item.id === candidate.id
    ));
    if (index < 0) {
      const usedIds = new Set(loads.map((item) => item.id).filter(Boolean));
      loads.push({ ...candidate, id: uniqueGeneratedId(candidate.id, usedIds) });
      created += 1;
      continue;
    }
    const current = loads[index];
    if (sameGeneratedContent(current, candidate)) {
      unchanged += 1;
      continue;
    }
    if (current.userModified === true || (!current.generatedKey && current.generatedBy !== LOAD_ESTIMATION_VERSION)) {
      conflicts.push(generationConflict('load', current, candidate));
      preserved += 1;
      continue;
    }
    loads[index] = { ...candidate, id: current.id || candidate.id };
    updated += 1;
  }

  let removed = 0;
  const merged = replaceGenerated
    ? loads.filter((load) => {
      const owned = load.generatedBy === LOAD_ESTIMATION_VERSION || load.sourceId === LOAD_ESTIMATION_VERSION;
      const key = load.generatedKey || load.id;
      const remove = owned && !proposedKeys.has(key) && load.userModified !== true;
      if (remove) removed += 1;
      return !remove;
    })
    : loads;
  return {
    loads: deduplicateById(merged),
    conflicts,
    created,
    updated,
    unchanged,
    removed,
    preserved,
  };
}

function generatedLoadKey({ type, caseId, nodeId = null, memberId = null, story = null, role = 'load' }) {
  return [
    'load',
    stableToken(LOAD_ESTIMATION_VERSION),
    stableToken(role),
    stableToken(caseId),
    story == null ? 'story-none' : `story-${stableToken(story)}`,
    nodeId ? `node-${stableToken(nodeId)}` : `member-${stableToken(memberId || 'none')}`,
    stableToken(type),
  ].join(':');
}

function generationConflict(kind, existing, proposed) {
  return {
    code: `${kind}-user-modified-conflict`,
    id: existing.id || proposed.id || null,
    generatedKey: existing.generatedKey || proposed.generatedKey || null,
    existing: clonePlain(existing),
    proposed: clonePlain(proposed),
  };
}

function sameGeneratedContent(a, b) {
  return stableJson(comparableGenerated(a)) === stableJson(comparableGenerated(b));
}

function comparableGenerated(value = {}) {
  const copy = clonePlain(value);
  delete copy.userModified;
  delete copy.generatedAt;
  return copy;
}

function deduplicateById(items) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function uniqueGeneratedId(baseId, usedIds) {
  let id = baseId || 'LD-GENERATED';
  let index = 2;
  while (usedIds.has(id)) id = `${baseId}-${index++}`;
  return id;
}

function stableToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'none';
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function clonePlain(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function modelBounds(nodes) {
  if (!nodes.length) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } };
  const min = {
    x: Math.min(...nodes.map((node) => finite(node.x, 0))),
    y: Math.min(...nodes.map((node) => finite(node.y, 0))),
    z: Math.min(...nodes.map((node) => finite(node.z, 0))),
  };
  const max = {
    x: Math.max(...nodes.map((node) => finite(node.x, 0))),
    y: Math.max(...nodes.map((node) => finite(node.y, 0))),
    z: Math.max(...nodes.map((node) => finite(node.z, 0))),
  };
  return { min, max, size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z } };
}
