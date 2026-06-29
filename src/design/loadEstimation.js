import {
  createDesignBasis,
  getDesignBasisInputFields,
  summarizeAppliedLoadEstimation,
} from './designBasisInput.js';
import {
  buildLoadDerivationTraceFromParts,
  computeSeismicBaseShear,
} from './loadDerivationTrace.js';
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

    storyDeadLoads.push({ story: index + 1, z, area, intensity: basis.deadLoad, total: deadTotal, beamLength });
    storyLiveLoads.push({ story: index + 1, z, area, intensity: isRoof ? basis.roofLiveLoad : basis.liveLoad, total: liveTotal, beamLength });

    if (options.generateLoads !== false && beamLength > 0) {
      for (const item of beams) {
        const tributaryShare = item.length / beamLength;
        loads.push(gravityLoad(`LD-D-${loadIndex++}`, item.member.id, deadTotal * tributaryShare / item.length, 'D', {
          story: index + 1,
          area,
          intensity: basis.deadLoad,
          total: deadTotal,
          tributaryShare,
        }));
        loads.push(gravityLoad(`LD-L-${loadIndex++}`, item.member.id, liveTotal * tributaryShare / item.length, 'L', {
          story: index + 1,
          area,
          intensity: isRoof ? basis.roofLiveLoad : basis.liveLoad,
          total: liveTotal,
          tributaryShare,
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
    });

    if (options.generateLoads !== false) {
      addStoryNodalLoads(loads, model, z, windX, '+x', 'WX', `LD-WX-${index + 1}`);
      addStoryNodalLoads(loads, model, z, windY, '+y', 'WY', `LD-WY-${index + 1}`);
    }
  }

  addSeismicLoads(loads, model, storyLateralLoads, basis, options);

  const seismicSummary = computeSeismicBaseShear(storyLateralLoads, basis);
  const derivationTrace = buildLoadDerivationTraceFromParts({
    basis,
    geometry,
    storyDeadLoads,
    storyLiveLoads,
    storyLateralLoads,
    seismicSummary,
  });

  const summary = {
    version: LOAD_ESTIMATION_VERSION,
    occupancy: basis.occupancy,
    floorArea,
    roofArea,
    storyCount: storyLevels.length,
    totalDead: storyDeadLoads.reduce((sum, item) => sum + item.total, 0),
    totalLive: storyLiveLoads.reduce((sum, item) => sum + item.total, 0),
    totalWindX: storyLateralLoads.reduce((sum, item) => sum + item.windX, 0),
    totalWindY: storyLateralLoads.reduce((sum, item) => sum + item.windY, 0),
    totalSeismicX: seismicSummary.baseShearX,
    totalSeismicY: seismicSummary.baseShearY,
    generatedLoadCount: loads.length,
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
      })),
      lateral: storyLateralLoads,
    },
    derivationTrace,
    summary,
    limitations: [
      'Area loads are distributed to horizontal frame members by member length share.',
      'Wind and seismic loads are equivalent preliminary story nodal loads.',
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
  const storyLevels = uniqueSorted(nodes.map((node) => finite(node.z, 0)).filter((z) => z > bounds.min.z + 1e-6));
  return {
    bounds,
    size: bounds.size,
    planArea: Math.max(0, bounds.size.x * bounds.size.y),
    storyLevels,
    baseLevel: bounds.min.z,
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

function addStoryNodalLoads(loads, model, z, totalForce, dir, loadCase, prefix) {
  if (Math.abs(totalForce) <= 1e-9) return;
  const nodes = nodesAtLevel(model, z);
  if (!nodes.length) return;
  const share = totalForce / nodes.length;
  for (const [index, node] of nodes.entries()) {
    loads.push({
      id: `${prefix}-${index + 1}`,
      type: 'nodal',
      node: node.id,
      P: share,
      dir,
      case: loadCase,
      unit: 'kN',
      generatedBy: LOAD_ESTIMATION_VERSION,
      derivation: {
        storyZ: z,
        totalForce,
        nodeShare: share,
      },
    });
  }
}

function addSeismicLoads(loads, model, storyLoads, basis, options) {
  if (options.generateLoads === false) return;
  const { denominator, baseShearX, baseShearY } = computeSeismicBaseShear(storyLoads, basis);
  for (const item of storyLoads) {
    const factor = item.effectiveWeight * Math.max(item.z, 0) / denominator;
    addStoryNodalLoads(loads, model, item.z, baseShearX * factor, '+x', 'EX', `LD-EX-${item.story}`);
    addStoryNodalLoads(loads, model, item.z, baseShearY * factor, '+y', 'EY', `LD-EY-${item.story}`);
  }
}

function nodesAtLevel(model, z) {
  return (model?.nodes || []).filter((node) => Math.abs(finite(node.z, 0) - z) <= 1e-6);
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

function uniqueSorted(values) {
  return [...new Set(values.map((value) => Number(value.toFixed(6))))].sort((a, b) => a - b);
}
