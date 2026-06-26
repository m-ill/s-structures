import { createModel } from '../core/model.js';

export const TWO_STORY_ELASTIC_FRAME_VERSION = 'm32-two-story-elastic-frame';

export function createTwoStoryElasticFrameModel(options = {}) {
  const model = createModel();
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

  const bayX = positiveNumber(options.bayX, 6);
  const bayY = positiveNumber(options.bayY, 5);
  const storyH = positiveNumber(options.storyH, 3.4);
  const xs = [0, bayX, bayX * 2];
  const ys = [0, bayY, bayY * 2];
  const zs = [0, storyH, storyH * 2];
  const nodeId = (ix, iy, iz) => `N${ix + 1}${iy + 1}${iz + 1}`;

  for (let iz = 0; iz < zs.length; iz += 1) {
    for (let iy = 0; iy < ys.length; iy += 1) {
      for (let ix = 0; ix < xs.length; ix += 1) {
        model.nodes.push({
          id: nodeId(ix, iy, iz),
          x: xs[ix],
          y: ys[iy],
          z: zs[iz],
          support: iz === 0 ? 'fixed' : null,
        });
      }
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
      secId: 'h400',
      localAxis: { roll: 0, strongAxis: 'z' },
      releases: { i: 'rigid', j: 'rigid' },
      design: { role },
    });
    memberIndex += 1;
  };

  for (let iz = 0; iz < 2; iz += 1) {
    for (let iy = 0; iy < 3; iy += 1) {
      for (let ix = 0; ix < 3; ix += 1) {
        addMember(nodeId(ix, iy, iz), nodeId(ix, iy, iz + 1), 'column');
      }
    }
  }

  for (let iz = 1; iz < 3; iz += 1) {
    for (let iy = 0; iy < 3; iy += 1) {
      for (let ix = 0; ix < 2; ix += 1) {
        addMember(nodeId(ix, iy, iz), nodeId(ix + 1, iy, iz), 'beam');
      }
    }
    for (let ix = 0; ix < 3; ix += 1) {
      for (let iy = 0; iy < 2; iy += 1) {
        addMember(nodeId(ix, iy, iz), nodeId(ix, iy + 1, iz), 'beam');
      }
    }
  }

  addFloorBeamLoads(model, {
    deadUdl: positiveNumber(options.deadUdl, 5.5),
    liveUdl: positiveNumber(options.liveUdl, 2.5),
  });
  addLateralStoryLoads(model, {
    story1Wx: positiveNumber(options.story1Wx, 36),
    story2Wx: positiveNumber(options.story2Wx, 54),
    story1Wy: positiveNumber(options.story1Wy, 30),
    story2Wy: positiveNumber(options.story2Wy, 45),
    storyH,
  });

  return model;
}

export function summarizeTwoStoryElasticWorkflow(model, analysis) {
  const comboSummaries = Object.fromEntries(Object.entries(analysis?.byCombo || {}).map(([id, result]) => [id, {
    ok: !!result?.ok,
    maxDisplacement: result?.summary?.maxDisplacement ?? null,
    maxUtilization: result?.maxRatio ?? null,
    equilibriumResidual: result?.summary?.equilibriumResidual ?? null,
    totalLoad: result?.summary?.totalLoad || null,
    totalReaction: result?.summary?.totalReaction || null,
  }]));
  return {
    version: TWO_STORY_ELASTIC_FRAME_VERSION,
    importReadiness: {
      targetSources: ['drawing-image', 'mgt-file', 'structured-json'],
      canonicalEntry: 'SStructuresAgent.execute("setModel", { model })',
      visionAgentContract: 'extract grid lines, story levels, member axes, supports, sections, and load tags into schemaVersion 3 model data',
    },
    model: {
      nodeCount: model?.nodes?.length || 0,
      memberCount: model?.members?.length || 0,
      loadCount: model?.loads?.length || 0,
      loadCaseCount: model?.loadCases?.length || 0,
      combinationCount: model?.loadCombinations?.length || 0,
      stories: 2,
      baysX: 2,
      baysY: 2,
    },
    analysis: {
      ok: !!analysis?.ok,
      comboIds: (analysis?.combos || []).map((combo) => combo.id),
      maxEnvelopeDisplacement: analysis?.envelope?.summary?.maxDisplacement ?? analysis?.envelope?.dmax ?? null,
      maxEnvelopeUtilization: analysis?.envelope?.maxRatio ?? null,
      combos: comboSummaries,
    },
  };
}

function addFloorBeamLoads(model, options) {
  let loadIndex = 1;
  for (const member of model.members.filter((item) => item.design?.role === 'beam')) {
    model.loads.push({
      id: `LD${loadIndex}`,
      type: 'udl',
      member: member.id,
      w: options.deadUdl,
      dir: '-z',
      coordinate: 'global',
      case: 'D',
    });
    loadIndex += 1;
    model.loads.push({
      id: `LL${loadIndex}`,
      type: 'udl',
      member: member.id,
      w: options.liveUdl,
      dir: '-z',
      coordinate: 'global',
      case: 'L',
    });
    loadIndex += 1;
  }
}

function addLateralStoryLoads(model, options) {
  const storyLoads = [
    { z: options.storyH, wx: options.story1Wx, wy: options.story1Wy },
    { z: options.storyH * 2, wx: options.story2Wx, wy: options.story2Wy },
  ];
  let loadIndex = model.loads.length + 1;
  for (const story of storyLoads) {
    const nodes = model.nodes.filter((node) => nearlyEqual(node.z || 0, story.z));
    const wx = story.wx / nodes.length;
    const wy = story.wy / nodes.length;
    for (const node of nodes) {
      model.loads.push({ id: `LWX${loadIndex}`, type: 'nodal', node: node.id, P: wx, dir: '+x', case: 'WX' });
      loadIndex += 1;
      model.loads.push({ id: `LWY${loadIndex}`, type: 'nodal', node: node.id, P: wy, dir: '+y', case: 'WY' });
      loadIndex += 1;
    }
  }
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nearlyEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) <= 1e-9;
}
