import assert from 'node:assert/strict';
import {
  analyzeDynamics,
  analyzeModel,
  classifyElasticFactorGroups,
  createModel,
  createWinklerLineFoundationProperty,
} from '../src/index.js';

const denseModel = beamModel({ foundation: true });
const dense = analyzeModel(denseModel);
assert.equal(dense.ok, true, JSON.stringify(dense.validation.errors));
assert.equal(dense.byCombo.D_ONLY.solver.rigidModeGauges.length, 1);
assert.deepEqual(dense.byCombo.D_ONLY.solver.rigidModeGauges[0].gaugeLabels, ['N1.rx']);
assert.equal(dense.byCombo.D_ONLY.solver.rigidModeGauges[0].artificialStiffnessAdded, false);

const sparseModel = beamModel({ foundation: true });
sparseModel.analysisSettings = { ...sparseModel.analysisSettings, useSparseSolver: true, sparseThreshold: 0 };
const sparse = analyzeModel(sparseModel);
assert.equal(sparse.ok, true, JSON.stringify(sparse.validation.errors));
close(dense.byCombo.D_ONLY.disp.N2[2], sparse.byCombo.D_ONLY.disp.N2[2], 1e-10, 'dense/sparse displacement');
close(
  dense.byCombo.D_ONLY.summary.totalFoundationReaction[2],
  sparse.byCombo.D_ONLY.summary.totalFoundationReaction[2],
  1e-10,
  'dense/sparse foundation reaction',
);

const timoshenkoModel = beamModel({ foundation: true });
timoshenkoModel.analysisSettings = { ...timoshenkoModel.analysisSettings, includeShearDeformation: true };
const timoshenko = analyzeModel(timoshenkoModel);
assert.equal(timoshenko.ok, true, JSON.stringify(timoshenko.validation.errors));
assert.equal(timoshenko.byCombo.D_ONLY.memberResults.M1.foundation.behavior, 'linear-bilateral');

const releaseModel = beamModel({ foundation: true });
releaseModel.members[0].releases = { i: 'rigid', j: 'pin' };
releaseModel.members[1].releases = { i: 'pin', j: 'rigid' };
const released = analyzeModel(releaseModel);
assert.equal(released.ok, true, JSON.stringify(released.validation.errors));
assert.equal(released.byCombo.D_ONLY.memberResults.M1.matrixOwnership.releaseRecovery, 'klTotal');

const offsetModel = beamModel({ foundation: true });
offsetModel.members[0].endOffset = { i: 0.1, j: 0.15, rigidFactor: 1 };
offsetModel.members[1].endOffset = { i: 0.15, j: 0.1, rigidFactor: 1 };
const offset = analyzeModel(offsetModel);
assert.equal(offset.ok, true, JSON.stringify(offset.validation.errors));
assert.equal(Object.keys(offset.byCombo.D_ONLY.foundationResults).length, 2);

const rotated = analyzeModel(beamModel({ foundation: true, axis: 'y' }));
assert.equal(rotated.ok, true, JSON.stringify(rotated.validation.errors));
close(
  Math.abs(dense.byCombo.D_ONLY.disp.N2[2]),
  Math.abs(rotated.byCombo.D_ONLY.disp.N2[2]),
  1e-10,
  'rigid rotation invariance',
);

const reversedModel = beamModel({ foundation: true });
reversedModel.members = reversedModel.members.map((member) => ({ ...member, n1: member.n2, n2: member.n1 }));
const reversed = analyzeModel(reversedModel);
assert.equal(reversed.ok, true, JSON.stringify(reversed.validation.errors));
close(
  Math.abs(dense.byCombo.D_ONLY.disp.N2[2]),
  Math.abs(reversed.byCombo.D_ONLY.disp.N2[2]),
  1e-10,
  'member reversal invariance',
);

const plainModal = analyzeDynamics(beamModel({ foundation: false }));
const foundationModal = analyzeDynamics(beamModel({ foundation: true }));
assert.equal(plainModal.ok, true, plainModal.reason);
assert.equal(foundationModal.ok, true, foundationModal.reason);
assert.ok(foundationModal.modes[0].period < plainModal.modes[0].period, 'foundation must increase modal stiffness');

const pdeltaModel = columnModel();
const pdelta = analyzeModel(pdeltaModel);
assert.equal(pdelta.ok, true, JSON.stringify(pdelta.validation.errors));
assert.equal(pdelta.pDelta?.method, 'direct');
assert.equal(pdelta.pDelta?.ok, true, pdelta.pDelta?.reason);
assert.equal(Object.keys(pdelta.byCombo.D_ONLY.foundationResults).length, 1);

const cache = new Map();
const cacheA = beamModel({ foundation: true, stiffness: 18000 });
const keyA = classifyElasticFactorGroups(cacheA, cacheA.loadCombinations).baseStiffnessHash;
const resultA = analyzeModel(cacheA, { componentCache: cache, factorGroupKey: keyA });
assert.equal(resultA.ok, true);
assert.equal(cache.size, 1);
const cacheB = beamModel({ foundation: true, stiffness: 36000 });
const keyB = classifyElasticFactorGroups(cacheB, cacheB.loadCombinations).baseStiffnessHash;
assert.notEqual(keyA, keyB);
const resultB = analyzeModel(cacheB, { componentCache: cache, factorGroupKey: keyB });
assert.equal(resultB.ok, true);
assert.equal(cache.size, 2, 'foundation mutation must not reuse stale component stiffness');
assert.notEqual(resultA.byCombo.D_ONLY.disp.N2[2], resultB.byCombo.D_ONLY.disp.N2[2]);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P14-M1',
  paths: ['dense', 'sparse', 'Timoshenko', 'release', 'offset', 'rotation', 'reversal', 'modal', 'direct-PDelta', 'cache-invalidation'],
  periodPlain: plainModal.modes[0].period,
  periodFoundation: foundationModal.modes[0].period,
  cacheEntries: cache.size,
}, null, 2));

function beamModel({ foundation, stiffness = 24000, axis = 'x' }) {
  const model = createModel();
  const coordinates = axis === 'y'
    ? [[0, 0, 0], [0, 3, 0], [0, 6, 0]]
    : [[0, 0, 0], [3, 0, 0], [6, 0, 0]];
  model.nodes = coordinates.map(([x, y, z], index) => ({
    id: `N${index + 1}`, x, y, z,
    support: index === 0 ? 'pin' : index === 2 ? 'custom' : null,
    ...(index === 2 ? { fix: axis === 'y' ? [true, false, true, false, false, false] : [false, true, true, false, false, false] } : {}),
  }));
  model.members = [
    member('M1', 'N1', 'N2', foundation),
    member('M2', 'N2', 'N3', foundation),
  ];
  model.foundationProperties = foundation ? [createWinklerLineFoundationProperty({
    id: 'WF', localY: { lineStiffness: stiffness }, localZ: { lineStiffness: stiffness },
  })] : [];
  model.loadCases = [{ id: 'D', name: 'D', type: 'dead' }];
  model.loadCombinations = [{ id: 'D_ONLY', name: 'D', factors: { D: 1 } }];
  model.loads = [{ id: 'P', type: 'nodal', node: 'N2', P: 80, dir: '-z', case: 'D' }];
  model.analysisSettings = { ...model.analysisSettings, includeSelfWeight: false, modalModeCount: 4 };
  return model;
}

function columnModel() {
  const model = createModel();
  model.nodes = [
    { id: 'B', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'T', x: 0, y: 0, z: 4, support: null },
  ];
  model.members = [member('C1', 'B', 'T', true)];
  model.foundationProperties = [createWinklerLineFoundationProperty({
    id: 'WF', localY: { lineStiffness: 5000 }, localZ: { lineStiffness: 5000 },
  })];
  model.loadCases = [{ id: 'D', name: 'D', type: 'dead' }];
  model.loadCombinations = [{ id: 'D_ONLY', name: 'D', factors: { D: 1 } }];
  model.loads = [
    { id: 'PZ', type: 'nodal', node: 'T', P: 200, dir: '-z', case: 'D' },
    { id: 'PX', type: 'nodal', node: 'T', P: 5, dir: '+x', case: 'D' },
  ];
  model.analysisSettings = {
    ...model.analysisSettings,
    includeSelfWeight: false,
    pDeltaMethod: 'direct',
    pDeltaLoadSteps: 3,
    pDeltaMaxIterations: 12,
    pDeltaTolerance: 1e-8,
  };
  return model;
}

function member(id, n1, n2, foundation) {
  return { id, type: 'frame', n1, n2, matId: 'steel', secId: 'h300', releases: { i: 'rigid', j: 'rigid' }, ...(foundation ? { foundationId: 'WF' } : {}) };
}

function close(actual, expected, tolerance, label) {
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
  assert.ok(Math.abs(actual - expected) / scale <= tolerance, `${label}: ${actual} vs ${expected}`);
}
