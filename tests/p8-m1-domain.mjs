import assert from 'node:assert/strict';
import {
  buildCanonicalAnalysisDomain,
  buildConstraintSystem,
  createTwoStoryElasticFrameModel,
  deriveCanonicalAnalysisDomain,
  expandConstraintDisplacements,
  reduceConstraintMatrix,
} from '../src/index.js';
import { stableHash } from '../src/core/stableHash.js';
import { buildDiaphragmDofMap } from '../src/solver/diaphragmDofMap.js';
import { reduceSystem } from '../src/solver/diaphragmReduce.js';

const model = createTwoStoryElasticFrameModel();
model.analysisSettings.includeSelfWeight = false;
const topZ = Math.max(...model.nodes.map((node) => Number(node.z || 0)));
const topNodeIds = model.nodes.filter((node) => Math.abs(Number(node.z || 0) - topZ) < 1e-9).map((node) => node.id);
model.diaphragms = [{ id: 'ROOF', type: 'rigid', nodeIds: topNodeIds }];
model.nodes.find((node) => node.id === topNodeIds[0]).mass = [2, 3, 4];
model.loads = [{ id: 'PX', type: 'nodal', node: topNodeIds[0], P: 12.5, direction: [1, 0, 0], case: 'D' }];
const sourceHash = stableHash(model);

const first = buildCanonicalAnalysisDomain(model);
const second = buildCanonicalAnalysisDomain(model);
assert.equal(first.ok, true, first.reason);
assert.equal(first.identity.identityHash, second.identity.identityHash);
assert.equal(first.snapshotHash, second.snapshotHash);
assert.equal(stableHash(model), sourceHash, 'domain build must not mutate source model');
assert.equal(first.sourceMutationDetected, false);
assert.equal(Object.isFrozen(first), true);
assert.equal(Object.isFrozen(first.elements[0].geometry), true);

const reordered = structuredClone(model);
for (const key of ['nodes', 'members', 'materials', 'sections', 'loads', 'loadCases', 'loadCombinations', 'massSources']) {
  if (Array.isArray(reordered[key])) reordered[key].reverse();
}
const reorderedDomain = buildCanonicalAnalysisDomain(reordered);
assert.equal(reorderedDomain.identity.identityHash, first.identity.identityHash, 'canonical identity must not depend on input array order');
const sameNodeLoads = structuredClone(model);
sameNodeLoads.loads = [
  { type: 'nodal', node: topNodeIds[0], P: 3, direction: [1, 0, 0], case: 'D' },
  { type: 'nodal', node: topNodeIds[0], P: 7, direction: [0, 1, 0], case: 'D' },
];
const sameNodeForward = buildCanonicalAnalysisDomain(sameNodeLoads);
sameNodeLoads.loads.reverse();
const sameNodeReverse = buildCanonicalAnalysisDomain(sameNodeLoads);
assert.equal(sameNodeForward.snapshotHash, sameNodeReverse.snapshotHash, 'same-target loads must have deterministic ordering');
assert.equal(sameNodeForward.identity.identityHash, sameNodeReverse.identity.identityHash);

const offsetChanged = structuredClone(model);
offsetChanged.members[0].endOffset = { i: 0.1, j: 0, rigidFactor: 1 };
assert.notEqual(buildCanonicalAnalysisDomain(offsetChanged).identity.constraintHash, first.identity.constraintHash);
const prescribedChanged = structuredClone(model);
prescribedChanged.nodes.find((node) => node.id === topNodeIds[0]).prescribedDisplacement = { ux: 0.001 };
assert.notEqual(buildCanonicalAnalysisDomain(prescribedChanged).identity.constraintHash, first.identity.constraintHash);

const factored = deriveCanonicalAnalysisDomain(first, { factors: { D: 2 } });
assert.equal(factored.loadDerivation.structuralSnapshotReused, true);
assert.equal(factored.elements, first.elements);
assert.equal(factored.constraint, first.constraint);
assert.equal(factored.identity.topologyHash, first.identity.topologyHash);
assert.notEqual(factored.identity.loadHash, first.identity.loadHash);
assert.equal(factored.snapshot.loads.reduce((sum, load) => sum + Number(load.P || 0), 0), 25);

assert.equal(first.constraint.fullDofCount, first.nodes.length * 6);
assert.equal(first.constraint.fullDofs.length, first.constraint.fullDofCount);
assert.equal(first.constraint.reducedDofs.length, first.constraint.reducedDofCount);
const reduced = Array.from({ length: first.constraint.reducedDofCount }, (_value, index) => Math.sin(index + 1) * 0.001);
const full = expandConstraintDisplacements(first.constraint, reduced);
assert.equal(full.length, first.constraint.fullDofCount);
const indexByNode = new Map(first.nodes.map((node, index) => [node.id, index]));
const roof = first.rigidDiaphragms.find((row) => row.id === 'ROOF');
const anchor = roof.nodeIds[0];
for (const nodeId of roof.nodeIds.slice(1)) {
  const i = indexByNode.get(anchor) * 6;
  const j = indexByNode.get(nodeId) * 6;
  const a = first.nodes[indexByNode.get(anchor)];
  const b = first.nodes[indexByNode.get(nodeId)];
  assert.ok(close(full[j] - full[i], -(Number(b.y) - Number(a.y)) * full[i + 5]));
  assert.ok(close(full[j + 1] - full[i + 1], (Number(b.x) - Number(a.x)) * full[i + 5]));
  assert.ok(close(full[j + 5], full[i + 5]));
}

const freeNodes = [
  { id: 'A', x: 0, y: 0, z: 3, support: null },
  { id: 'B', x: 4, y: 0, z: 3, support: null },
  { id: 'C', x: 0, y: 3, z: 3, support: null },
];
const group = { id: 'D1', type: 'rigid', nodeIds: ['A', 'B', 'C'], center: { x: 4 / 3, y: 1, z: 3 } };
const legacyMap = buildDiaphragmDofMap(freeNodes, [group]);
const canonicalConstraint = buildConstraintSystem(freeNodes, [group]);
const size = freeNodes.length * 6;
const K = Array.from({ length: size }, (_row, i) => Array.from({ length: size }, (_column, j) => (
  i === j ? 10 + i : ((i + j) % 7 === 0 ? 0.25 : 0)
)));
const F = Array.from({ length: size }, (_value, index) => index + 1);
const legacyReduced = reduceSystem(K, F, legacyMap);
assertMatrixClose(reduceConstraintMatrix(canonicalConstraint, K), legacyReduced.K);

const prescribedNodes = [{
  id: 'P1', x: 0, y: 0, z: 0, support: 'custom', fix: [true, false, false, false, false, false],
  settlement: { ux: 0.015 },
}];
const prescribedConstraint = buildConstraintSystem(prescribedNodes, []);
assert.equal(prescribedConstraint.ok, true);
assert.ok(close(expandConstraintDisplacements(prescribedConstraint, new Array(5).fill(0))[0], 0.015));
assert.throws(
  () => expandConstraintDisplacements(prescribedConstraint, [Number.NaN, 0, 0, 0, 0]),
  (error) => error.code === 'CONSTRAINT_VALUE_NONFINITE',
);

const invalidMemberModel = structuredClone(model);
invalidMemberModel.members[0].n2 = 'MISSING-NODE';
const invalidMemberDomain = buildCanonicalAnalysisDomain(invalidMemberModel);
assert.equal(invalidMemberDomain.ok, false);
assert.equal(invalidMemberDomain.reason, 'DOMAIN_REFERENCE_INVALID');
assert.ok(invalidMemberDomain.referenceErrors.some((row) => row.code === 'ELEMENT_NODE_REFERENCE_INVALID'));
const legacySkipDomain = buildCanonicalAnalysisDomain(invalidMemberModel, { allowInvalidReferences: true });
assert.equal(legacySkipDomain.ok, true);
assert.equal(legacySkipDomain.referencePolicy, 'skip-invalid');
assert.equal(legacySkipDomain.members.some((member) => member.id === invalidMemberModel.members[0].id), false);
const invalidLoadModel = structuredClone(model);
invalidLoadModel.loads.push({ id: 'BAD-LOAD', type: 'nodal', node: 'MISSING-NODE', P: 1, direction: [1, 0, 0], case: 'D' });
const invalidLoadDomain = buildCanonicalAnalysisDomain(invalidLoadModel);
assert.equal(invalidLoadDomain.ok, false);
assert.ok(invalidLoadDomain.referenceErrors.some((row) => row.code === 'LOAD_NODE_REFERENCE_INVALID'));

const generatedModel = structuredClone(model);
generatedModel.diaphragms = [{
  id: 'SEMI-ROOF', type: 'semiRigid', nodeIds: topNodeIds.slice(0, 4), inPlaneStiffness: 25000, matId: 'steel',
}];
const generated = buildCanonicalAnalysisDomain(generatedModel);
assert.ok(generated.generatedMemberIds.length > 0);
for (const id of generated.generatedMemberIds) {
  const origin = generated.originMap.members.find((row) => row.generatedId === id);
  assert.equal(origin.originType, 'diaphragm');
  assert.equal(origin.originId, 'SEMI-ROOF');
}

const unsupportedModel = structuredClone(model);
unsupportedModel.loads.push({ id: 'FOLLOW', type: 'follower', node: topNodeIds[0], P: 1, follower: true });
const unsupported = buildCanonicalAnalysisDomain(unsupportedModel, { strictCapabilities: true });
assert.equal(unsupported.ok, false);
assert.equal(unsupported.reason, 'DOMAIN_CAPABILITY_UNSUPPORTED');
assert.ok(unsupported.capabilities.blocking.some((row) => row.code === 'NONLINEAR_FOLLOWER_LOAD_UNSUPPORTED'));

assert.equal(first.snapshot.loads.reduce((sum, load) => sum + Number(load.P || 0), 0), 12.5);
assert.deepEqual(first.snapshot.mass.nodes.find((row) => row.id === topNodeIds[0]).mass, [2, 3, 4]);
assert.deepEqual(first.solverModel.units, model.units);

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-DOM-01', 'NL-DOM-02', 'NL-DOM-03', 'NL-DOM-04', 'NL-DOM-05', 'NL-DOM-06', 'NL-DOM-07', 'NL-DOM-08'],
  domainHash: first.identity.domainHash,
  fullDofs: first.constraint.fullDofCount,
  reducedDofs: first.constraint.reducedDofCount,
  generatedMembers: generated.generatedMemberIds.length,
}, null, 2));

function assertMatrixClose(actual, expected) {
  assert.equal(actual.length, expected.length);
  actual.forEach((row, i) => row.forEach((value, j) => assert.ok(close(value, expected[i][j]), `${i},${j}: ${value} != ${expected[i][j]}`)));
}

function close(a, b, tolerance = 1e-10) {
  return Math.abs(Number(a) - Number(b)) <= tolerance * Math.max(1, Math.abs(Number(a)), Math.abs(Number(b)));
}
