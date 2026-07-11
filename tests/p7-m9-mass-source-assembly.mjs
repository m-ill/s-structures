import assert from 'node:assert/strict';
import { analyzeDynamics, buildLumpedMass, createTwoStoryElasticFrameModel } from '../src/index.js';
import { buildMassSourceTrace } from '../src/loads/loadsV2.js';

const model = createTwoStoryElasticFrameModel();
for (const node of model.nodes) delete node.mass;
model.analysisSettings.responseSpectrum = { enabled: false };

const emptySource = source({ includeNodeMass: false });
const empty = analyzeDynamics(model, { massSource: emptySource, responseSpectrum: { enabled: false } });
assert.equal(empty.ok, false);
assert.equal(empty.reason, 'NO_MASS');

const memberSource = source({ includeMemberMass: true });
const member = analyzeDynamics(model, { massSource: memberSource, responseSpectrum: { enabled: false } });
assert.equal(member.ok, true);
assert.ok(member.mass.total.every((value) => value > 0));

const selfWeightSource = source({ includeSelfWeight: true });
const selfWeight = analyzeDynamics(model, { massSource: selfWeightSource, responseSpectrum: { enabled: false } });
assert.deepEqual(selfWeight.mass.total, member.mass.total);

const bothSource = source({ includeMemberMass: true, includeSelfWeight: true });
const both = analyzeDynamics(model, { massSource: bothSource, responseSpectrum: { enabled: false } });
assert.deepEqual(both.mass.total, member.mass.total, 'member mass and self weight must share one physical source');
assert.equal(both.mass.massSource.physicalMemberMassDeduplicated, true);

const explicitSelfWeightModel = structuredClone(model);
explicitSelfWeightModel.loadCases = [{ id: 'D-SW', name: 'Self weight', type: 'dead', family: 'D', variant: 'selfWeight' }];
explicitSelfWeightModel.loads = [{ id: 'SW-EXPLICIT', type: 'nodal', node: explicitSelfWeightModel.nodes[1].id, case: 'D-SW', P: 100, dir: '-z' }];
const deduplicatedSelfWeightSource = source({ includeMemberMass: true, combos: [{ case: 'D-SW', factor: 1 }] });
const deduplicatedSelfWeight = analyzeDynamics(explicitSelfWeightModel, {
  massSource: deduplicatedSelfWeightSource,
  responseSpectrum: { enabled: false },
});
assert.deepEqual(deduplicatedSelfWeight.mass.total, member.mass.total);
assert.ok(deduplicatedSelfWeight.mass.massSource.skipped.some((row) => row.reason === 'self-weight-physical-mass-already-included'));

const directionalModel = {
  nodes: [{ id: 'N1', x: 0, y: 0, z: 0, mass: [10, 0, 3] }],
  members: [],
  loads: [],
};
const directionalSource = source({ includeNodeMass: true });
const directionalTrace = buildMassSourceTrace(directionalModel, directionalSource);
assert.deepEqual(directionalTrace.rows[0].massVector, [10, 0, 3]);
assert.deepEqual(directionalTrace.totalMassByDirection, [10, 0, 3]);
const directionalMass = buildLumpedMass(
  directionalModel,
  { ndof: 6, idx: { N1: 0 }, memData: {} },
  directionalSource,
  directionalTrace,
);
assert.deepEqual(directionalMass.slice(0, 3), [10, 0, 3]);

console.log(JSON.stringify({
  ok: true,
  excludedMemberMassReason: empty.reason,
  memberMass: member.mass.total,
  deduplicatedMass: both.mass.total,
  directionalMass: directionalMass.slice(0, 3),
}, null, 2));

function source(overrides = {}) {
  return {
    id: 'MS-TEST',
    combos: [],
    includeNodeMass: false,
    includeMemberMass: false,
    includeSelfWeight: false,
    gravity: 9.80665,
    ...overrides,
  };
}
