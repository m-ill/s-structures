import assert from 'node:assert/strict';
import {
  buildCanonicalAnalysisDomain,
  buildMdofMassDomain,
  createTwoStoryElasticFrameModel,
  evaluateNonlinearIntegrationCapabilities,
  requireNonlinearIntegrationCapabilities,
} from '../src/index.js';

const model = createTwoStoryElasticFrameModel();
model.analysisSettings.includeSelfWeight = false;
const roofZ = Math.max(...model.nodes.map((node) => Number(node.z || 0)));
const roofNodes = model.nodes.filter((node) => Math.abs(Number(node.z || 0) - roofZ) < 1e-9).map((node) => node.id);
model.diaphragms = [{ id: 'ROOF', type: 'rigid', nodeIds: roofNodes }];
model.nodes.find((node) => node.id === roofNodes[0]).mass = [10, 12, 8];

const rigidDomain = buildCanonicalAnalysisDomain(model);
assert.equal(rigidDomain.ok, true, rigidDomain.reason);
assert.ok(rigidDomain.constraint.reducedDofCount < rigidDomain.constraint.fullDofCount);
assert.equal(evaluateNonlinearIntegrationCapabilities(rigidDomain, { mode: 'static' }).ok, true);
assert.equal(evaluateNonlinearIntegrationCapabilities(rigidDomain, { mode: 'dynamic' }).ok, true);
const mass = buildMdofMassDomain(model, rigidDomain, { formulation: 'lumped' });
assert.equal(mass.ok, true);
assert.ok(mass.activeMassByAxis[0] > 0);

const semiModel = structuredClone(model);
semiModel.diaphragms = [{
  id: 'SEMI-ROOF',
  type: 'semiRigid',
  nodeIds: roofNodes.slice(0, 4),
  inPlaneStiffness: 25000,
  matId: semiModel.materials[0].id,
}];
const semiDomain = buildCanonicalAnalysisDomain(semiModel);
assert.ok(semiDomain.generatedMemberIds.length > 0);
assert.ok(semiDomain.originMap.members
  .filter((row) => semiDomain.generatedMemberIds.includes(row.generatedId))
  .every((row) => row.originType === 'diaphragm' && row.originId === 'SEMI-ROOF'));

const releaseModel = structuredClone(model);
releaseModel.members[0].releases = { i: 'rigid', j: 'pin' };
const releaseDomain = buildCanonicalAnalysisDomain(releaseModel);
assert.equal(evaluateNonlinearIntegrationCapabilities(releaseDomain, { mode: 'static' }).ok, true);
const dynamicRelease = evaluateNonlinearIntegrationCapabilities(releaseDomain, { mode: 'dynamic' });
assert.equal(dynamicRelease.ok, false);
assert.equal(dynamicRelease.blocking[0].code, 'NONLINEAR_DYNAMIC_MEMBER_RELEASE_UNSUPPORTED');
assert.throws(
  () => requireNonlinearIntegrationCapabilities(releaseDomain, { mode: 'dynamic' }),
  (error) => error.code === dynamicRelease.blocking[0].code,
);

const offsetModel = structuredClone(model);
offsetModel.members[0].endOffset = { i: 0.15, j: 0.1, rigidFactor: 1 };
offsetModel.members[0].localAxis = { refVector: [0.2, 1, 0.3], roll: 17, strongAxis: 'z' };
const offsetDomain = buildCanonicalAnalysisDomain(offsetModel);
assert.equal(evaluateNonlinearIntegrationCapabilities(offsetDomain, { mode: 'static' }).ok, true);
assert.ok(offsetDomain.elements[0].geometry.offsets.i > 0);
assert.equal(offsetDomain.elements[0].geometry.localAxis.roll, 17);

const badOffsetModel = structuredClone(offsetModel);
badOffsetModel.members[0].endOffset.rigidFactor = 0.5;
const badOffset = evaluateNonlinearIntegrationCapabilities(buildCanonicalAnalysisDomain(badOffsetModel), { mode: 'static' });
assert.ok(badOffset.blocking.some((row) => row.code === 'NONLINEAR_OFFSET_RIGID_FACTOR_UNSUPPORTED'));

const unilateralModel = structuredClone(model);
unilateralModel.members[0].behavior = 'tensionOnly';
const unilateral = evaluateNonlinearIntegrationCapabilities(buildCanonicalAnalysisDomain(unilateralModel), { mode: 'static' });
assert.equal(unilateral.ok, false);
assert.ok(unilateral.blocking.some((row) => row.code === 'NONLINEAR_UNILATERAL_ACTIVE_SET_UNSUPPORTED'));

const shellModel = structuredClone(model);
const shellNodeIds = [roofNodes[0], roofNodes[1], roofNodes[4], roofNodes[3]];
shellModel.shells = [{
  id: 'S1',
  nodeIds: shellNodeIds,
  thickness: 0.18,
  matId: shellModel.materials[0].id,
}];
const shellDomain = buildCanonicalAnalysisDomain(shellModel);
assert.equal(shellDomain.ok, true, shellDomain.reason);
const shellCapability = evaluateNonlinearIntegrationCapabilities(shellDomain, { mode: 'static' });
assert.equal(shellCapability.ok, true);
assert.ok(shellCapability.warnings.some((row) => row.code === 'NONLINEAR_SHELL_EQUIVALENT_ONLY'));

const femShellModel = structuredClone(shellModel);
femShellModel.shells[0].formulation = 'shell';
const femShellDomain = buildCanonicalAnalysisDomain(femShellModel);
assert.equal(femShellDomain.ok, true, femShellDomain.reason);
const femShellCapability = evaluateNonlinearIntegrationCapabilities(femShellDomain, { mode: 'static' });
assert.equal(femShellCapability.ok, false);
assert.ok(femShellCapability.blocking.some((row) => row.code === 'NONLINEAR_SHELL_FEM_UNSUPPORTED'));
assert.ok(!femShellCapability.warnings.some((row) => row.code === 'NONLINEAR_SHELL_EQUIVALENT_ONLY'));
assert.ok(femShellDomain.capabilities.issues.some((row) => row.code === 'NONLINEAR_SHELL_FEM_UNSUPPORTED'));

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-INT-01', 'NL-INT-02', 'NL-INT-03', 'NL-INT-04', 'NL-INT-05', 'NL-INT-06', 'NL-INT-12'],
  rigidDofs: { full: rigidDomain.constraint.fullDofCount, reduced: rigidDomain.constraint.reducedDofCount },
  activeMassX: mass.activeMassByAxis[0],
  semiRigidGeneratedMemberCount: semiDomain.generatedMemberIds.length,
  dynamicReleaseReason: dynamicRelease.blocking[0].code,
  unilateralReason: unilateral.blocking[0].code,
  shellWarningCount: shellCapability.warnings.length,
  femShellReason: femShellCapability.blocking[0].code,
}, null, 2));
