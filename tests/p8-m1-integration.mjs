import assert from 'node:assert/strict';
import {
  RESULT_DIMENSIONS,
  analyzeAll,
  analyzeDynamics,
  buildCanonicalAnalysisDomain,
  buildDomainAdapterIdentity,
  compareDomainAdapterIdentities,
  createModel,
  memberAxes,
  runSecondOrderPDelta,
} from '../src/index.js';
import { materialOf, sectionOf } from '../src/core/catalogs.js';
import { stableHash } from '../src/core/stableHash.js';

const model = createModel({
  nodes: [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 3, support: null, mass: [5, 5, 5] },
  ],
  members: [{
    id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300',
    localAxis: { roll: 0.15, strongAxis: 'z' }, releases: { i: 'rigid', j: 'rigid' },
    endOffset: { i: 0.1, j: 0.15, rigidFactor: 1 },
  }],
  loadCases: [{ id: 'D', name: 'Dead and lateral', type: 'dead' }],
  loadCombinations: [{ id: 'D1', name: 'D', type: 'service', factors: { D: 1 } }],
  loads: [
    { id: 'PZ', type: 'nodal', node: 'N2', P: 80, direction: [0, 0, -1], case: 'D' },
    { id: 'PX', type: 'nodal', node: 'N2', P: 8, direction: [1, 0, 0], case: 'D' },
  ],
  analysisSettings: {
    includeSelfWeight: false,
    validateBeforeSolve: true,
    pDeltaMethod: 'off',
    useSparseSolver: false,
  },
});
const before = stableHash(model);
const canonical = buildCanonicalAnalysisDomain(model);
const nonlinearIdentity = buildDomainAdapterIdentity(canonical, 'nonlinear');
const linear = analyzeAll(model, { D: 1 });
const direct = runSecondOrderPDelta(model, { D: 1 }, { loadSteps: 2, maxIterations: 20 });
const modal = analyzeDynamics(model, { modalModeCount: 1, responseSpectrum: { enabled: false } });
assert.equal(linear.ok, true, linear.reason);
assert.equal(direct.ok, true, direct.reason);
assert.equal(modal.ok, true, modal.reason);
assert.equal(stableHash(model), before, 'solver adapters must not mutate source model');
assert.equal(linear.analysisDomain.adapter, 'linear');
assert.equal(direct.analysisDomain.adapter, 'direct-pdelta');
assert.equal(modal.analysisDomain.adapter, 'modal');
const compatibility = compareDomainAdapterIdentities([
  linear.analysisDomain,
  direct.analysisDomain,
  modal.analysisDomain,
  nonlinearIdentity,
]);
assert.equal(compatibility.ok, true, JSON.stringify(compatibility.differences));

const invalidModel = structuredClone(model);
invalidModel.members[0].n2 = 'MISSING-NODE';
const failedLinear = analyzeAll(invalidModel, { D: 1 });
const failedDirect = runSecondOrderPDelta(invalidModel, { D: 1 });
const failedModal = analyzeDynamics(invalidModel, { modalModeCount: 1, responseSpectrum: { enabled: false } });
assert.equal(failedLinear.ok, false);
assert.equal(failedDirect.ok, false);
assert.equal(failedModal.ok, false);
assert.equal(failedLinear.analysisDomain.adapter, 'linear');
assert.equal(failedDirect.analysisDomain.adapter, 'direct-pdelta');
assert.equal(failedModal.analysisDomain.adapter, 'modal');

const descriptor = canonical.elements.find((row) => row.id === 'M1');
const expectedAxes = memberAxes(model.nodes[0], model.nodes[1], model.members[0].localAxis);
assert.deepEqual(descriptor.geometry.axes, { x: expectedAxes.x, y: expectedAxes.y, z: expectedAxes.z });
assert.equal(descriptor.geometry.offsets.i, 0.1);
assert.equal(descriptor.geometry.offsets.j, 0.15);
assert.deepEqual(descriptor.releases.localDofs, []);
assert.equal(descriptor.propertyRefs.materialId, materialOf(model, 'steel').id);
assert.equal(descriptor.propertyRefs.sectionId, sectionOf(model, 'h300').id);
assert.equal(descriptor.propertySnapshot.material.E, materialOf(model, 'steel').E);
assert.equal(descriptor.propertySnapshot.section.A, sectionOf(model, 'h300').A);
assert.equal(descriptor.origin.type, 'member');
assert.equal(canonical.originMap.members.find((row) => row.generatedId === 'M1').originId, 'M1');

assert.equal(RESULT_DIMENSIONS.velocity, 'velocity');
assert.equal(RESULT_DIMENSIONS.curvature, 'curvature');
assert.equal(RESULT_DIMENSIONS.strain, 'dimensionless');
assert.equal(RESULT_DIMENSIONS.stress, 'stress');
assert.equal(RESULT_DIMENSIONS.energy, 'energy');

const generatedMassModel = structuredClone(model);
generatedMassModel.nodes.push(
  { id: 'N3', x: 3, y: 0, z: 3, support: null, mass: [2, 2, 2] },
  { id: 'N4', x: 3, y: 0, z: 0, support: 'fixed' },
);
generatedMassModel.members.push({
  id: 'M2', type: 'frame', n1: 'N4', n2: 'N3', matId: 'steel', secId: 'h300',
  localAxis: { roll: 0, strongAxis: 'z' }, releases: { i: 'rigid', j: 'rigid' },
});
const withoutGenerated = analyzeDynamics(generatedMassModel, { modalModeCount: 1, responseSpectrum: { enabled: false } });
generatedMassModel.diaphragms = [{
  id: 'SEMI', type: 'semiRigid', nodeIds: ['N2', 'N3'], inPlaneStiffness: 10000, matId: 'steel',
}];
const withGenerated = analyzeDynamics(generatedMassModel, { modalModeCount: 1, responseSpectrum: { enabled: false } });
assert.deepEqual(withGenerated.mass.total, withoutGenerated.mass.total, 'generated stiffness links must be massless');

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-MEI-01', 'NL-MEI-02', 'NL-MEI-03', 'NL-MEI-04', 'NL-MEI-05', 'NL-MEI-06', 'NL-MEI-07', 'NL-MEI-08'],
  topologyHash: canonical.identity.topologyHash,
  propertyHash: canonical.identity.propertyHash,
  constraintHash: canonical.identity.constraintHash,
  adapters: [linear.analysisDomain.adapter, direct.analysisDomain.adapter, modal.analysisDomain.adapter, nonlinearIdentity.adapter],
}, null, 2));
