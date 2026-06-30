import { createModel } from '../core/model.js';
import { normalizeStories } from '../core/storyModel.js';

export const REPRESENTATIVE_BUILDINGS_VERSION = 'm33-representative-building-set';

export const REPRESENTATIVE_BUILDING_SPECS = [
  {
    id: '01-regular-office-frame',
    name: 'Regular office frame',
    type: 'office',
    description: 'Four-story regular moment frame used as a baseline office building.',
    xs: [0, 6, 12],
    ys: [0, 5, 10],
    stories: 4,
    storyH: 3.6,
    deadUdl: 4.2,
    liveUdl: 2.0,
    windX: 8,
    windY: 7,
  },
  {
    id: '02-l-shaped-neighborhood',
    name: 'L-shaped neighborhood facility',
    type: 'neighborhood-living',
    description: 'Three-story L-shaped low-rise commercial frame with plan irregularity.',
    xs: [0, 5.5, 11, 16.5],
    ys: [0, 4.5, 9, 13.5],
    stories: 3,
    storyH: 3.5,
    mask: ({ ix, iy }) => ix <= 1 || iy <= 1,
    deadUdl: 4.0,
    liveUdl: 2.4,
    windX: 7,
    windY: 6,
  },
  {
    id: '03-u-shaped-school',
    name: 'U-shaped school wing',
    type: 'school',
    description: 'Three-story U-shaped education building around an open courtyard.',
    xs: [0, 7, 14, 21],
    ys: [0, 6, 12, 18],
    stories: 3,
    storyH: 3.7,
    mask: ({ ix, iy }) => iy === 0 || ix === 0 || ix === 3,
    deadUdl: 3.8,
    liveUdl: 2.2,
    windX: 7,
    windY: 6,
  },
  {
    id: '04-podium-tower-setback',
    name: 'Podium tower setback',
    type: 'mixed-use',
    description: 'Six-story mixed-use frame with a broad podium and upper setback tower.',
    xs: [0, 6, 12, 18, 24],
    ys: [0, 6, 12, 18],
    stories: 6,
    storyH: 3.4,
    mask: ({ ix, iy, level }) => level <= 2 || (ix >= 1 && ix <= 3 && iy >= 1 && iy <= 2),
    deadUdl: 3.5,
    liveUdl: 1.8,
    windX: 5,
    windY: 4.5,
  },
  {
    id: '05-long-span-warehouse',
    name: 'Long-span warehouse',
    type: 'industrial',
    description: 'Single-story long-span industrial warehouse with wide transverse bays.',
    xs: [0, 8, 16, 24, 32],
    ys: [0, 12, 24],
    stories: 1,
    storyH: 8,
    deadUdl: 2.8,
    liveUdl: 0.8,
    windX: 18,
    windY: 14,
  },
  {
    id: '06-open-parking-frame',
    name: 'Open parking frame',
    type: 'parking',
    description: 'Five-story open parking structure with repetitive long bays.',
    xs: [0, 7.5, 15, 22.5],
    ys: [0, 7.5, 15],
    stories: 5,
    storyH: 3.2,
    deadUdl: 3.2,
    liveUdl: 1.8,
    windX: 4.5,
    windY: 4,
  },
  {
    id: '07-apartment-frame-equivalent',
    name: 'Apartment frame equivalent',
    type: 'apartment',
    description: 'Six-story elongated residential block represented as an equivalent 3D frame.',
    xs: [0, 5, 10, 15, 20, 25],
    ys: [0, 3.8, 7.6],
    stories: 6,
    storyH: 2.9,
    deadUdl: 3.0,
    liveUdl: 1.4,
    windX: 3.5,
    windY: 3.2,
  },
  {
    id: '08-courtyard-hospital',
    name: 'Courtyard hospital frame',
    type: 'hospital',
    description: 'Four-story public facility frame with a central courtyard opening.',
    xs: [0, 6, 12, 18, 24],
    ys: [0, 6, 12, 18, 24],
    stories: 4,
    storyH: 3.8,
    mask: ({ ix, iy }) => !(ix === 2 && iy === 2),
    deadUdl: 3.7,
    liveUdl: 2.0,
    windX: 5,
    windY: 5,
  },
  {
    id: '09-transfer-podium-frame',
    name: 'Transfer podium frame',
    type: 'transfer',
    description: 'Six-story frame with a two-story podium and narrower upper block.',
    xs: [0, 7, 14, 21, 28],
    ys: [0, 7, 14],
    stories: 6,
    storyH: 3.5,
    mask: ({ ix, level }) => level <= 2 || (ix >= 1 && ix <= 3),
    deadUdl: 3.4,
    liveUdl: 1.7,
    windX: 4.5,
    windY: 4,
  },
  {
    id: '10-torsion-irregular-frame',
    name: 'Torsion irregular corner frame',
    type: 'irregular',
    description: 'Five-story frame with a missing corner and offset stiffness distribution.',
    xs: [0, 5, 10, 15],
    ys: [0, 5, 10, 15],
    stories: 5,
    storyH: 3.4,
    mask: ({ ix, iy, level }) => !(ix === 3 && iy === 3) && (level <= 3 || !(ix === 0 && iy === 3)),
    deadUdl: 3.3,
    liveUdl: 1.6,
    windX: 4.2,
    windY: 4.2,
  },
];

export function createRepresentativeBuildingModel(specOrId) {
  const spec = resolveSpec(specOrId);
  const model = createModel();
  model.sections.push({
    id: 'box400h',
    name: 'BOX-400x400x16 equivalent',
    type: 'BOX',
    dims: { H: 400, B: 400, t: 16 },
    A: 0.0246,
    Iz: 6.08e-4,
    Zz: 3.04e-3,
    Iy: 6.08e-4,
    Zy: 3.04e-3,
    J: 1.12e-3,
  });
  model.meta = {
    id: spec.id,
    name: spec.name,
    type: spec.type,
    description: spec.description,
    generatorVersion: REPRESENTATIVE_BUILDINGS_VERSION,
  };
  model.analysisSettings = {
    ...model.analysisSettings,
    analysisType: 'linear_static',
    elementType: '3d_frame',
    includeGeometricStiffness: false,
    includeSelfWeight: false,
    responseSpectrum: {
      ...(model.analysisSettings.responseSpectrum || {}),
      enabled: false,
    },
  };
  model.loadCases = [
    { id: 'D', name: 'Dead load', type: 'dead' },
    { id: 'L', name: 'Live load', type: 'live' },
    { id: 'WX', name: 'Wind X', type: 'wind' },
    { id: 'WY', name: 'Wind Y', type: 'wind' },
  ];
  model.loadCombinations = [
    { id: 'EL-DL', name: '1.0D + 1.0L', type: 'service', factors: { D: 1, L: 1, WX: 0, WY: 0 } },
    { id: 'EL-WX', name: '1.0D + 0.5L + 1.0WX', type: 'service', factors: { D: 1, L: 0.5, WX: 1, WY: 0 } },
    { id: 'EL-WY', name: '1.0D + 0.5L + 1.0WY', type: 'service', factors: { D: 1, L: 0.5, WX: 0, WY: 1 } },
  ];

  const levels = buildLevels(spec);
  const nodeAt = new Map();
  const pointKey = (ix, iy) => `${ix}:${iy}`;
  const levelKey = (ix, iy, level) => `${ix}:${iy}:${level}`;
  let nodeIndex = 1;
  for (let level = 0; level < levels.length; level += 1) {
    for (const point of levels[level]) {
      const node = {
        id: `N${nodeIndex}`,
        x: spec.xs[point.ix],
        y: spec.ys[point.iy],
        z: level * spec.storyH,
        support: level === 0 ? 'fixed' : null,
      };
      model.nodes.push(node);
      nodeAt.set(levelKey(point.ix, point.iy, level), node.id);
      nodeIndex += 1;
    }
  }

  let memberIndex = 1;
  const addMember = (n1, n2, role) => {
    model.members.push({
      id: `M${memberIndex}`,
      type: 'frame',
      n1,
      n2,
      matId: 'steel',
      secId: spec.secId || 'box400h',
      localAxis: { roll: 0, strongAxis: 'z' },
      releases: { i: 'rigid', j: 'rigid' },
      design: { role },
    });
    memberIndex += 1;
  };

  for (let level = 0; level < spec.stories; level += 1) {
    const lower = new Set(levels[level].map((point) => pointKey(point.ix, point.iy)));
    for (const point of levels[level + 1]) {
      if (!lower.has(pointKey(point.ix, point.iy))) continue;
      addMember(
        nodeAt.get(levelKey(point.ix, point.iy, level)),
        nodeAt.get(levelKey(point.ix, point.iy, level + 1)),
        'column',
      );
    }
  }

  for (let level = 1; level <= spec.stories; level += 1) {
    const points = new Set(levels[level].map((point) => pointKey(point.ix, point.iy)));
    for (const point of levels[level]) {
      const right = pointKey(point.ix + 1, point.iy);
      const up = pointKey(point.ix, point.iy + 1);
      if (points.has(right)) addMember(nodeAt.get(levelKey(point.ix, point.iy, level)), nodeAt.get(levelKey(point.ix + 1, point.iy, level)), 'beam');
      if (points.has(up)) addMember(nodeAt.get(levelKey(point.ix, point.iy, level)), nodeAt.get(levelKey(point.ix, point.iy + 1, level)), 'beam');
    }
  }

  addGravityLoads(model, spec);
  addStoryLateralLoads(model, spec, levels);
  return normalizeStories(model);
}

export function createAllRepresentativeBuildingModels() {
  return REPRESENTATIVE_BUILDING_SPECS.map((spec) => ({
    spec,
    model: createRepresentativeBuildingModel(spec),
  }));
}

export function summarizeRepresentativeBuilding(spec, model, analysis) {
  const byCombo = Object.fromEntries(Object.entries(analysis?.byCombo || {}).map(([id, result]) => [id, {
    ok: !!result.ok,
    maxDisplacement: result.summary?.maxDisplacement ?? null,
    maxUtilization: result.maxRatio ?? null,
    equilibriumResidual: result.summary?.equilibriumResidual ?? null,
    totalLoad: result.summary?.totalLoad || null,
    totalReaction: result.summary?.totalReaction || null,
  }]));
  return {
    version: REPRESENTATIVE_BUILDINGS_VERSION,
    id: spec.id,
    name: spec.name,
    type: spec.type,
    description: spec.description,
    model: {
      nodeCount: model.nodes.length,
      memberCount: model.members.length,
      loadCount: model.loads.length,
      loadCaseCount: model.loadCases.length,
      combinationCount: model.loadCombinations.length,
      stories: spec.stories,
      size: {
        x: Math.max(...model.nodes.map((node) => node.x)) - Math.min(...model.nodes.map((node) => node.x)),
        y: Math.max(...model.nodes.map((node) => node.y)) - Math.min(...model.nodes.map((node) => node.y)),
        z: Math.max(...model.nodes.map((node) => node.z)) - Math.min(...model.nodes.map((node) => node.z)),
      },
    },
    analysis: {
      ok: !!analysis?.ok,
      comboIds: (analysis?.combos || []).map((combo) => combo.id),
      maxEnvelopeDisplacement: analysis?.envelope?.dmax ?? null,
      maxEnvelopeUtilization: analysis?.envelope?.maxRatio ?? null,
      designStatus: analysis?.design ? (analysis.design.ok ? 'OK' : 'NG') : null,
      governing: analysis?.design?.summary?.governing || null,
      combos: byCombo,
      errors: analysis?.validation?.errors || [],
      warnings: analysis?.validation?.warnings || [],
    },
  };
}

function resolveSpec(specOrId) {
  if (typeof specOrId === 'object' && specOrId?.id) return specOrId;
  const found = REPRESENTATIVE_BUILDING_SPECS.find((spec) => spec.id === specOrId);
  if (!found) throw new Error(`Representative building spec not found: ${specOrId}`);
  return found;
}

function buildLevels(spec) {
  const levels = [];
  for (let level = 0; level <= spec.stories; level += 1) {
    const points = [];
    for (let iy = 0; iy < spec.ys.length; iy += 1) {
      for (let ix = 0; ix < spec.xs.length; ix += 1) {
        const include = spec.mask ? spec.mask({ ix, iy, level, spec }) : true;
        if (include) points.push({ ix, iy });
      }
    }
    levels.push(points);
  }
  return levels;
}

function addGravityLoads(model, spec) {
  let loadIndex = 1;
  for (const member of model.members.filter((item) => item.design?.role === 'beam')) {
    model.loads.push({
      id: `L${loadIndex}`,
      type: 'udl',
      member: member.id,
      w: spec.deadUdl,
      dir: '-z',
      coordinate: 'global',
      case: 'D',
      source: 'representative:dead-floor',
    });
    loadIndex += 1;
    model.loads.push({
      id: `L${loadIndex}`,
      type: 'udl',
      member: member.id,
      w: spec.liveUdl,
      dir: '-z',
      coordinate: 'global',
      case: 'L',
      source: 'representative:live-floor',
    });
    loadIndex += 1;
  }
}

function addStoryLateralLoads(model, spec, levels) {
  let loadIndex = model.loads.length + 1;
  for (let level = 1; level <= spec.stories; level += 1) {
    const z = level * spec.storyH;
    const nodes = model.nodes.filter((node) => nearlyEqual(node.z || 0, z));
    if (!nodes.length) continue;
    const levelRatio = level / spec.stories;
    const planRatio = Math.max(0.4, levels[level].length / Math.max(1, levels[1].length));
    const totalWx = spec.windX * level * planRatio * (0.65 + levelRatio * 0.35);
    const totalWy = spec.windY * level * planRatio * (0.65 + levelRatio * 0.35);
    for (const node of nodes) {
      model.loads.push({
        id: `L${loadIndex}`,
        type: 'nodal',
        node: node.id,
        P: totalWx / nodes.length,
        dir: '+x',
        case: 'WX',
        source: 'representative:wind-x',
      });
      loadIndex += 1;
      model.loads.push({
        id: `L${loadIndex}`,
        type: 'nodal',
        node: node.id,
        P: totalWy / nodes.length,
        dir: '+y',
        case: 'WY',
        source: 'representative:wind-y',
      });
      loadIndex += 1;
    }
  }
}

function nearlyEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) <= 1e-9;
}
