import assert from 'node:assert/strict';
import { analyzeDynamics } from '../src/dynamics/modal.js';

const L = 4;
const E = 200000 * 1000;
const Iz = 8e-6;
const EI = E * Iz;

const cantilever = analyzeDynamics(singleColumnModel());
assert.equal(cantilever.ok, true);
assert.equal(cantilever.condensation.status, 'available');
assert.ok(cantilever.condensation.residualDofCount > 0);
assert.equal(cantilever.modes[0].residualRecovery.status, 'available');
assert.ok(cantilever.modes[0].residualRecovery.maxRelativeEquilibriumResidual < 1e-8);

const modalTopTranslation = cantilever.modes[0].vector[6];
const modalTopRotation = cantilever.modes[0].vector[10];
close(Math.abs(modalTopRotation), 1.5 * Math.abs(modalTopTranslation) / L, 1e-10, 'back-substituted tip rotation');
assert.equal(cantilever.rsa.memberForces.status, 'available');
assert.equal(cantilever.rsa.memberForces.designBlocked, false);
assert.equal(cantilever.rsa.designBlocked, false);
assert.equal(cantilever.rsa.designTransferQualification.eligible, true);

const cantileverResponse = directionResponse(cantilever, 'x');
const cantileverMember = cantileverResponse.memberForceRecovery.byMember.C1;
const tipDisplacement = Math.abs(cantileverResponse.nodalDisplacementByNode.N1[0]);
const expectedCantileverShear = (3 * EI * tipDisplacement) / L ** 3;
close(Math.abs(cantileverMember.endForces[1]), expectedCantileverShear, 1e-8, 'cantilever K*u shear');
close(Math.abs(cantileverMember.endForces[5]), expectedCantileverShear * L, 1e-8, 'cantilever static base moment');
close(Math.abs(cantileverMember.endForces[11]), 0, 1e-8, 'cantilever free-tip moment');
close(cantileverMember.peaks.Vy, expectedCantileverShear, 1e-8, 'cantilever station shear');
close(cantileverMember.peaks.Mz, expectedCantileverShear * L, 1e-8, 'cantilever station moment');
assert.equal(cantileverMember.checks.assembly.passed, true);
assert.equal(cantileverMember.checks.release.passed, true);
assert.deepEqual(cantileverMember.provenance.staticCaseReferences, []);

const restrained = analyzeDynamics(singleColumnModel({ restrainedTipRotation: true }));
const restrainedResponse = directionResponse(restrained, 'x');
const restrainedMember = restrainedResponse.memberForceRecovery.byMember.C1;
const restrainedDisplacement = Math.abs(restrainedResponse.nodalDisplacementByNode.N1[0]);
const expectedRestrainedShear = (12 * EI * restrainedDisplacement) / L ** 3;
close(Math.abs(restrainedMember.endForces[1]), expectedRestrainedShear, 1e-8, 'restrained frame K*u shear');
close(Math.abs(restrainedMember.endForces[5]), expectedRestrainedShear * L / 2, 1e-8, 'restrained frame i moment');
close(Math.abs(restrainedMember.endForces[11]), expectedRestrainedShear * L / 2, 1e-8, 'restrained frame j moment');
assert.equal(restrained.rsa.memberForces.designBlocked, false);

const released = analyzeDynamics(singleColumnModel({ releaseJ: true }));
const releasedMember = directionResponse(released, 'x').memberForceRecovery.byMember.C1;
assert.deepEqual(releasedMember.releaseDofs, [10, 11]);
assert.equal(releasedMember.checks.release.condensation, 'condensed');
assert.equal(releasedMember.checks.release.passed, true);
close(Math.abs(releasedMember.endForces[10]), 0, 1e-8, 'released j-My');
close(Math.abs(releasedMember.endForces[11]), 0, 1e-8, 'released j-Mz');
assert.equal(released.rsa.memberForces.designBlocked, false);

const invalidReleaseModel = singleColumnModel();
invalidReleaseModel.members[0].releases.j = 'partial';
const invalidRelease = analyzeDynamics(invalidReleaseModel);
assert.equal(invalidRelease.rsa.memberForces.designBlocked, true);
assert.ok(invalidRelease.rsa.memberForces.blockers.some((row) => row.code === 'RSA_MEMBER_RELEASE_TYPE_UNSUPPORTED'));

const diaphragmModel = rigidDiaphragmFrameModel();
const diaphragmAnalysis = analyzeDynamics(diaphragmModel);
assert.equal(diaphragmAnalysis.ok, true);
assert.equal(diaphragmAnalysis.diaphragmAssembly.applied, true);
assert.equal(diaphragmAnalysis.rsa.memberForces.designBlocked, false);
assert.ok(!diaphragmAnalysis.rsa.memberForces.blockers.some((row) => row.code === 'RSA_DIAPHRAGM_ASSEMBLY_PARITY_UNAVAILABLE'));
for (const mode of diaphragmAnalysis.modes) {
  close(mode.vector[12], mode.vector[18], 1e-10, 'rigid diaphragm equal floor ux');
  close(mode.vector[19] - mode.vector[13], 4 * mode.vector[17], 1e-10, 'rigid diaphragm in-plane rotation');
}

const twoStory = analyzeDynamics(twoStoryColumnModel());
assert.equal(twoStory.rsa.method, 'CQC');
assert.equal(twoStory.rsa.memberForces.status, 'available');
const twoStoryResponses = twoStory.rsa.modal.find((row) => row.direction === 'x').responses;
assert.equal(twoStoryResponses.length, 2);
const modalMoments = twoStoryResponses.map((response) => response.memberForceRecovery.byMember.C1.endForces[5]);
const rho = cqcCorrelation(twoStoryResponses[0].period, twoStoryResponses[1].period, 0.05);
const expectedCqcMoment = Math.sqrt(
  modalMoments[0] ** 2
  + modalMoments[1] ** 2
  + 2 * rho * modalMoments[0] * modalMoments[1],
);
const combinedC1 = twoStory.rsa.combined.x.memberForces.byMember.C1;
close(combinedC1.endForces[5], expectedCqcMoment, 1e-8, 'CQC member end moment');
const modalStationMoments = twoStoryResponses.map((response) => response.memberForceRecovery.byMember.C1.Mz[0]);
const expectedCqcStationMoment = Math.sqrt(
  modalStationMoments[0] ** 2
  + modalStationMoments[1] ** 2
  + 2 * rho * modalStationMoments[0] * modalStationMoments[1],
);
close(combinedC1.Mz[0], expectedCqcStationMoment, 1e-8, 'CQC member station moment');
assert.equal(combinedC1.responseMethod, 'CQC');
assert.equal(combinedC1.modalContributors.length, 2);
assert.equal(twoStory.rsa.memberForces.checks.responseMethodConsistent, true);

console.log(JSON.stringify({
  ok: true,
  residualRotation: modalTopRotation,
  cantileverShear: cantileverMember.peaks.Vy,
  cantileverMoment: cantileverMember.peaks.Mz,
  restrainedMoment: Math.abs(restrainedMember.endForces[5]),
  releasedForceResidual: releasedMember.checks.release.maxReleasedForceResidual,
  cqcMemberMoment: combinedC1.endForces[5],
}, null, 2));

function singleColumnModel(options = {}) {
  const top = {
    id: 'N1',
    x: 0,
    y: 0,
    z: L,
    mass: [10, 0, 0],
    support: options.restrainedTipRotation
      ? 'custom'
      : null,
  };
  if (options.restrainedTipRotation) top.fix = [false, true, true, true, true, true];
  return baseModel({
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      top,
    ],
    members: [{
      id: 'C1',
      type: 'frame',
      n1: 'N0',
      n2: 'N1',
      matId: 'TEST',
      secId: 'FRAME',
      releases: { i: 'rigid', j: options.releaseJ ? 'pin' : 'rigid' },
    }],
    modeCount: 1,
    method: 'SRSS',
  });
}

function twoStoryColumnModel() {
  return baseModel({
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 0, y: 0, z: L, mass: [10, 0, 0] },
      { id: 'N2', x: 0, y: 0, z: 2 * L, mass: [10, 0, 0] },
    ],
    members: [
      { id: 'C1', type: 'frame', n1: 'N0', n2: 'N1', matId: 'TEST', secId: 'FRAME' },
      { id: 'C2', type: 'frame', n1: 'N1', n2: 'N2', matId: 'TEST', secId: 'FRAME' },
    ],
    modeCount: 2,
    method: 'CQC',
  });
}

function rigidDiaphragmFrameModel() {
  const model = baseModel({
    nodes: [
      { id: 'B1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'B2', x: 4, y: 0, z: 0, support: 'fixed' },
      { id: 'T1', x: 0, y: 0, z: L, mass: [10, 10, 0] },
      { id: 'T2', x: 4, y: 0, z: L, mass: [10, 10, 0] },
    ],
    members: [
      { id: 'C1', type: 'frame', n1: 'B1', n2: 'T1', matId: 'TEST', secId: 'FRAME' },
      { id: 'C2', type: 'frame', n1: 'B2', n2: 'T2', matId: 'TEST', secId: 'FRAME' },
    ],
    modeCount: 3,
    method: 'SRSS',
  });
  model.diaphragms = [{ id: 'D1', type: 'rigid', nodeIds: ['T1', 'T2'] }];
  return model;
}

function baseModel({ nodes, members, modeCount, method }) {
  return {
    units: { length: 'm', force: 'kN', moment: 'kN.m' },
    materials: [{ id: 'TEST', name: 'Test', E: 200000, G: 77000, density: 0 }],
    sections: [{ id: 'FRAME', name: 'Frame', A: 0.01, Iy: 5e-6, Iz, J: 1e-6 }],
    nodes,
    members,
    diaphragms: [],
    analysisSettings: {
      modalModeCount: modeCount,
      memberStations: 21,
      responseSpectrum: {
        enabled: true,
        method,
        directions: ['x'],
        dampingRatio: 0.05,
        scale: 1,
        points: [{ period: 0, sa: 1 }, { period: 10, sa: 1 }],
      },
    },
  };
}

function directionResponse(result, direction) {
  return result.rsa.modal.find((row) => row.direction === direction).responses[0];
}

function cqcCorrelation(firstPeriod, secondPeriod, damping) {
  const ratio = Math.max(firstPeriod, secondPeriod) / Math.min(firstPeriod, secondPeriod);
  return (8 * damping ** 2 * (1 + ratio) * ratio ** 1.5)
    / ((1 - ratio ** 2) ** 2 + 4 * damping ** 2 * ratio * (1 + ratio) ** 2);
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}
