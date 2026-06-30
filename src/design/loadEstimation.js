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
import { finite } from './loadMath.js';

import { LOAD_ESTIMATION_VERSION } from './loadEstimationConstants.js';

export { LOAD_ESTIMATION_VERSION } from './loadEstimationConstants.js';
export {
  createDesignBasis,
  DESIGN_BASIS_INPUT_VERSION,
  DESIGN_BASIS_NUMERIC_FIELDS,
  DEFAULT_DESIGN_BASIS,
  getDesignBasisInputFields,
  OCCUPANCY_LOAD_PRESETS,
} from './designBasisInput.js';
export {
  buildLoadDerivationTrace,
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

  if (options.generateLoads !== false) {
    addWindLoads(loads, model, lateralRows, storyMassSummary, distributionOptions);
  }
  addSeismicLoads(loads, model, lateralRows, basis, distributionOptions, storyMassSummary);

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
  };

  return {
    version: LOAD_ESTIMATION_VERSION,
    basis,
    geometry,
    loadCases: defaultDerivedLoadCases(),
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
  const estimation = estimateModelLoads(model, designBasis, options);
  const replaceGenerated = options.replaceGenerated !== false;
  if (replaceGenerated) {
    model.loads = (model.loads || []).filter((load) => load.generatedBy !== LOAD_ESTIMATION_VERSION);
  }
  model.loadCases = mergeLoadCases(model.loadCases || [], estimation.loadCases);
  model.loads = [...(model.loads || []), ...estimation.loads];
  model.designBasis = estimation.basis;
  model.loadEstimation = {
    ...estimation,
    loads: estimation.loads.map((load) => ({
      id: load.id,
      type: load.type,
      case: load.case,
      member: load.member || null,
      node: load.node || null,
      value: load.w ?? load.P ?? load.M ?? null,
      direction: load.dir || null,
      derivation: load.derivation || null,
    })),
  };
  return estimation;
}

function defaultDerivedLoadCases() {
  return [
    { id: 'D', name: 'Dead load', type: 'dead' },
    { id: 'L', name: 'Live load', type: 'live' },
    { id: 'WX', name: 'Wind X', type: 'wind' },
    { id: 'WY', name: 'Wind Y', type: 'wind' },
    { id: 'EX', name: 'Seismic X', type: 'seismic' },
    { id: 'EY', name: 'Seismic Y', type: 'seismic' },
  ];
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

function addWindLoads(loads, model, storyLoads, storyMassSummary, options) {
  for (const item of storyLoads) {
    addStoryNodalLoads(loads, model, item.z, item.windX, '+x', 'WX', `LD-WX-${item.story}`, {
      story: item.story,
      traceRowId: `WX-NODE-ST${item.story}`,
    }, storyMassSummary, options);
    addStoryNodalLoads(loads, model, item.z, item.windY, '+y', 'WY', `LD-WY-${item.story}`, {
      story: item.story,
      traceRowId: `WY-NODE-ST${item.story}`,
    }, storyMassSummary, options);
  }
}

function addSeismicLoads(loads, model, storyLoads, basis, options, storyMassSummary) {
  if (options.generateLoads === false) return;
  const { denominator, baseShearX, baseShearY } = computeSeismicBaseShear(storyLoads, basis);
  for (const item of storyLoads) {
    const factor = item.effectiveWeight * Math.max(item.z, 0) / denominator;
    addStoryNodalLoads(loads, model, item.z, baseShearX * factor, '+x', 'EX', `LD-EX-${item.story}`, {
      story: item.story,
      traceRowId: `EX-NODE-ST${item.story}`,
    }, storyMassSummary, options);
    addStoryNodalLoads(loads, model, item.z, baseShearY * factor, '+y', 'EY', `LD-EY-${item.story}`, {
      story: item.story,
      traceRowId: `EY-NODE-ST${item.story}`,
    }, storyMassSummary, options);
  }
}

function storyHeightForLevel(geometry, index) {
  const current = geometry.storyLevels[index];
  const previous = index === 0 ? geometry.baseLevel : geometry.storyLevels[index - 1];
  return Math.max(1, current - previous);
}

function mergeLoadCases(existing, generated) {
  const map = new Map();
  for (const item of existing) if (item?.id) map.set(item.id, { ...item });
  for (const item of generated) if (!map.has(item.id)) map.set(item.id, { ...item });
  return [...map.values()];
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
