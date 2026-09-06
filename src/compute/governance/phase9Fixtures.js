import { stableHash } from '../../core/stableHash.js';

export const PHASE9_FIXTURE_GENERATOR_VERSION = 'p9-m0-grid-fixture-v1';

export const PHASE9_GRID_FIXTURE_SPECS = Object.freeze([
  spec('S', 3, 3, 3, 2, 10),
  spec('M', 12, 12, 8, 4, 30),
  spec('L', 20, 20, 11, 6, 60),
]);

export function createPhase9GridFixture(tier) {
  const config = PHASE9_GRID_FIXTURE_SPECS.find((row) => row.tier === String(tier).toUpperCase());
  if (!config) throw new RangeError(`Unknown Phase 9 fixture tier: ${tier}`);
  const nodes = [];
  const members = [];
  const loads = [];
  const nodeId = (ix, iy, iz) => `N-${ix}-${iy}-${iz}`;

  for (let iz = 0; iz <= config.stories; iz += 1) {
    for (let iy = 0; iy <= config.baysY; iy += 1) {
      for (let ix = 0; ix <= config.baysX; ix += 1) {
        nodes.push({
          id: nodeId(ix, iy, iz),
          x: ix * 6,
          y: iy * 6,
          z: iz * 3.4,
          support: iz === 0 ? 'fixed' : null,
        });
      }
    }
  }

  let memberIndex = 1;
  const pairKeys = new Set();
  const addMember = (n1, n2, role, type = 'frame') => {
    const pair = [n1, n2].sort().join('|');
    if (pairKeys.has(pair)) throw new Error(`Duplicate fixture member pair: ${pair}`);
    pairKeys.add(pair);
    members.push({
      id: `M-${memberIndex++}`,
      type,
      n1,
      n2,
      matId: 'P9-STEEL',
      secId: role === 'brace' ? 'P9-BRACE' : 'P9-FRAME',
      design: { role },
    });
  };

  for (let iz = 0; iz < config.stories; iz += 1) {
    for (let iy = 0; iy <= config.baysY; iy += 1) {
      for (let ix = 0; ix <= config.baysX; ix += 1) {
        addMember(nodeId(ix, iy, iz), nodeId(ix, iy, iz + 1), 'column');
      }
    }
  }
  for (let iz = 1; iz <= config.stories; iz += 1) {
    for (let iy = 0; iy <= config.baysY; iy += 1) {
      for (let ix = 0; ix < config.baysX; ix += 1) {
        addMember(nodeId(ix, iy, iz), nodeId(ix + 1, iy, iz), 'beam');
      }
    }
    for (let ix = 0; ix <= config.baysX; ix += 1) {
      for (let iy = 0; iy < config.baysY; iy += 1) {
        addMember(nodeId(ix, iy, iz), nodeId(ix, iy + 1, iz), 'beam');
      }
    }
  }
  for (let iz = 1; iz <= config.stories; iz += 1) {
    for (let iy = 0; iy < config.baysY; iy += 1) {
      for (let ix = 0; ix < config.baysX; ix += 1) {
        const candidates = braceCandidates(nodeId, ix, iy, iz);
        for (const [n1, n2] of candidates.slice(0, config.bracesPerCell)) addMember(n1, n2, 'brace', 'truss');
      }
    }
  }

  const topNodes = nodes.filter((node) => node.z === config.stories * 3.4);
  for (const node of topNodes) {
    loads.push({ id: `WX-${node.id}`, type: 'nodal', node: node.id, P: 1, dir: '+x', case: 'WX' });
    loads.push({ id: `D-${node.id}`, type: 'nodal', node: node.id, P: 5, dir: '-z', case: 'D' });
  }

  const model = {
    schemaVersion: 5,
    meta: { id: `P9-PERF-ELA-${config.tier}`, name: `Phase 9 ${config.tier} grid fixture` },
    units: { length: 'm', force: 'kN', moment: 'kN.m' },
    materials: [{
      id: 'P9-STEEL',
      version: 1,
      name: 'Phase 9 baseline steel',
      kind: 'steel',
      E: 205000000,
      G: 78846153.846,
      Fy: 275000,
      Fu: 410000,
      density: 7850,
      strength: { steel: { Fy: 275000, Fu: 410000 } },
    }],
    sections: [
      { id: 'P9-FRAME', version: 1, type: 'direct', A: 0.02, Iy: 8e-4, Iz: 12e-4, J: 5e-5 },
      { id: 'P9-BRACE', version: 1, type: 'direct', A: 0.008, Iy: 1e-5, Iz: 1e-5, J: 1e-6 },
    ],
    nodes,
    members,
    loads,
    loadCases: [
      { id: 'D', name: 'Dead', type: 'dead' },
      { id: 'L', name: 'Live', type: 'live' },
      { id: 'WX', name: 'Wind X', type: 'wind' },
      { id: 'WY', name: 'Wind Y', type: 'wind' },
    ],
    loadCombinations: combinations(config.combinationCount),
    analysisCriteria: {
      criteria: {
        audit: { equilibriumRelative: 1e-6 },
      },
    },
    analysisSettings: {
      analysisType: 'linear_static',
      validateBeforeSolve: true,
      responseSpectrum: { enabled: false },
    },
  };
  const summary = summarizePhase9Fixture(model, config);
  return { version: PHASE9_FIXTURE_GENERATOR_VERSION, config, model, summary, inputHash: stableHash(model) };
}

export function summarizePhase9Fixture(model, config = null) {
  const fixedNodes = (model.nodes || []).filter((node) => node.support === 'fixed').length;
  const activeDof = Math.max(0, ((model.nodes || []).length - fixedNodes) * 6);
  return {
    tier: config?.tier || null,
    nodeCount: model.nodes?.length || 0,
    memberCount: model.members?.length || 0,
    loadCount: model.loads?.length || 0,
    combinationCount: model.loadCombinations?.length || 0,
    fixedNodeCount: fixedNodes,
    activeDof,
  };
}

function spec(tier, baysX, baysY, stories, bracesPerCell, combinationCount) {
  return Object.freeze({
    version: PHASE9_FIXTURE_GENERATOR_VERSION,
    tier,
    baysX,
    baysY,
    stories,
    bracesPerCell,
    combinationCount,
    execution: tier === 'S' ? 'measured-ci' : 'materialize-and-preflight-only',
  });
}

function braceCandidates(nodeId, ix, iy, iz) {
  const lower = iz - 1;
  return [
    [nodeId(ix, iy, lower), nodeId(ix + 1, iy, iz)],
    [nodeId(ix + 1, iy, lower), nodeId(ix, iy, iz)],
    [nodeId(ix, iy, lower), nodeId(ix, iy + 1, iz)],
    [nodeId(ix, iy + 1, lower), nodeId(ix, iy, iz)],
    [nodeId(ix, iy, lower), nodeId(ix + 1, iy + 1, iz)],
    [nodeId(ix + 1, iy + 1, lower), nodeId(ix, iy, iz)],
  ];
}

function combinations(count) {
  return Array.from({ length: count }, (_item, index) => {
    const direction = index % 4;
    return {
      id: `P9-C${String(index + 1).padStart(2, '0')}`,
      name: `Phase 9 combination ${index + 1}`,
      type: index % 3 === 0 ? 'strength' : 'service',
      factors: {
        D: 1 + (index % 3) * 0.1,
        L: index % 2 ? 0.5 : 1,
        WX: direction === 0 ? 1 : direction === 1 ? -1 : 0,
        WY: direction === 2 ? 1 : direction === 3 ? -1 : 0,
      },
    };
  });
}
