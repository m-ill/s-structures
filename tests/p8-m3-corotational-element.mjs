import assert from 'node:assert/strict';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import { createLinearElasticElementKernel } from '../src/nonlinear/equilibrium/linearElasticElement.js';
import { buildNonlinearLoadPattern } from '../src/nonlinear/equilibrium/externalLoads.js';
import { createCorotationalFrame3dKernel } from '../src/nonlinear/elements/corotationalFrame3d.js';
import { createCorotationalTruss3dKernel } from '../src/nonlinear/elements/corotationalTruss3d.js';
import {
  pullBackSpatialMoment,
  pushForwardGeneralizedMoment,
  rotationCoordinateIncrementToSpatial,
  spatialRotationIncrementToCoordinates,
} from '../src/nonlinear/math/rotationCoordinates.js';
import {
  SECOND_ORDER_JET_VERSION,
  isSecondOrderJet,
  jetAtan2,
  jetConstant,
  jetReciprocal,
  jetScale,
  jetVariable,
} from '../src/nonlinear/math/secondOrderJet.js';

assert.equal(isSecondOrderJet({
  version: SECOND_ORDER_JET_VERSION,
  size: 1,
  value: 0,
  gradient: new Float64Array([Infinity]),
  hessian: new Float64Array([0]),
}), false);
assert.throws(
  () => jetScale(jetVariable(Number.MAX_VALUE, 0, 1), 2),
  (error) => ['JET_VALUE_NONFINITE', 'JET_DERIVATIVE_NONFINITE'].includes(error?.code),
);
assert.throws(
  () => jetReciprocal(jetVariable(1e-200, 0, 1)),
  (error) => error?.code === 'JET_DERIVATIVE_NONFINITE',
);
assert.equal(isSecondOrderJet(jetAtan2(jetVariable(1e-100, 0, 1), jetConstant(1e-100, 1))), true);

const frameDomain = buildCanonicalAnalysisDomain(baseModel('frame'));
assert.equal(frameDomain.ok, true, frameDomain.reason);
const descriptor = frameDomain.elements[0];
const kernel = createCorotationalFrame3dKernel(descriptor);
const linearKernel = createLinearElasticElementKernel(descriptor);

const zero = kernel.evaluate({ trialKinematics: { uGlobal: new Array(12).fill(0) } });
const linear = linearKernel.evaluate({ trialKinematics: { uGlobal: new Array(12).fill(0) } });
closeVector(zero.resistingForceGlobal, new Array(12).fill(0), 1e-8, 'zero force');
close(zero.energies.strain, 0, 1e-10, 'zero energy');
matrixClose(zero.tangentGlobal, linear.tangentGlobal, 2e-8, 'small-displacement tangent');

const translation = [2.4, -1.8, 3.1];
const translated = kernel.evaluate({
  trialKinematics: { uGlobal: [...translation, 0, 0, 0, ...translation, 0, 0, 0] },
});
closeVector(translated.resistingForceGlobal, new Array(12).fill(0), 2e-7, 'rigid translation force');
close(translated.energies.strain, 0, 1e-10, 'rigid translation energy');

const axis = normalize([0.4, -0.7, 0.55]);
const angle = 1.35;
const rotation = axis.map((value) => value * angle);
const Q = axisAngle(axis, angle);
const xj = [descriptor.geometry.grossLength, 0, 0];
const rotatedJ = matVec(Q, xj);
const rigid = [
  0.8, -0.3, 1.1, ...rotation,
  rotatedJ[0] - xj[0] + 0.8, rotatedJ[1] - xj[1] - 0.3, rotatedJ[2] - xj[2] + 1.1, ...rotation,
];
const rigidResponse = kernel.evaluate({ trialKinematics: { uGlobal: rigid } });
closeVector(rigidResponse.resistingForceGlobal, new Array(12).fill(0), 3e-5, 'rigid rotation force');
close(rigidResponse.energies.strain, 0, 1e-8, 'rigid rotation energy');

const probe = [
  0.002, -0.004, 0.003, 0.025, -0.018, 0.03,
  0.012, 0.035, -0.027, -0.015, 0.022, -0.01,
];
const probeResponse = kernel.evaluate({ trialKinematics: { uGlobal: probe } });
assert.ok(probeResponse.diagnostics.rawTangentSymmetryError < 1e-14);
const finiteDifference = finiteDifferenceTangent(kernel, probe, 2e-6);
matrixClose(probeResponse.tangentGlobal, finiteDifference, 4e-5, 'consistent tangent');

const momentRotation = [0.6, -0.3, 0.4];
const spatialMoment = [2.5, -1.2, 3.1];
const pulledMoment = pullBackSpatialMoment(momentRotation, spatialMoment);
matrixClose(pulledMoment.tangent, finiteDifferenceMoment(momentRotation, spatialMoment, 1e-6), 2e-7, 'moment pullback tangent');
closeVector(
  pushForwardGeneralizedMoment(momentRotation, pulledMoment.generalized),
  spatialMoment,
  2e-12,
  'moment pullback inverse',
);
const coordinateIncrement = [0.2, -0.15, 0.08];
closeVector(
  spatialRotationIncrementToCoordinates(
    momentRotation,
    rotationCoordinateIncrementToSpatial(momentRotation, coordinateIncrement),
  ),
  coordinateIncrement,
  2e-12,
  'rotation-coordinate increment round trip',
);
assert.throws(
  () => kernel.evaluate({ trialKinematics: { uGlobal: [0, 0, 0, 2 * Math.PI, 0, 0, 0, 0, 0, 2 * Math.PI, 0, 0] } }),
  (error) => error?.code === 'ROTATION_VECTOR_BRANCH_LIMIT',
);

const axialExtension = 0.01;
const axial = kernel.evaluate({
  trialKinematics: { uGlobal: [0, 0, 0, 0, 0, 0, axialExtension, 0, 0, 0, 0, 0] },
});
const effectiveMaterial = descriptor.propertySnapshot.effectiveMaterial;
const effectiveSection = descriptor.propertySnapshot.effectiveSection;
const expectedAxial = effectiveMaterial.E * effectiveSection.A / descriptor.geometry.length * axialExtension;
close(axial.resistingForceGlobal[6], expectedAxial, 2e-8, 'axial force');
close(axial.energies.strain, 0.5 * expectedAxial * axialExtension, 2e-8, 'axial energy');

const trussDomain = buildCanonicalAnalysisDomain(baseModel('truss'));
assert.equal(trussDomain.ok, true, trussDomain.reason);
const truss = createCorotationalTruss3dKernel(trussDomain.elements[0]);
const trussResponse = truss.evaluate({
  trialKinematics: { uGlobal: [0, 0, 0, 3.05, -2.4, 1.9, axialExtension, 0, 0, -2.8, 2.7, -3.04] },
});
close(trussResponse.resistingForceGlobal[6], expectedAxial, 2e-8, 'truss axial force');
for (const dof of [3, 4, 5, 9, 10, 11]) close(trussResponse.resistingForceGlobal[dof], 0, 1e-8, `truss rotation ${dof}`);
assert.throws(
  () => createCorotationalFrame3dKernel(buildCanonicalAnalysisDomain(baseModel('tensionOnly')).elements[0]),
  (error) => error?.code === 'COROTATIONAL_UNILATERAL_UNSUPPORTED',
);
assert.throws(
  () => truss.evaluate({
    trialKinematics: { uGlobal: new Array(12).fill(0) },
    elementLoads: { trace: [{ fixedEnd: { q0: [0, 1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0] } }] },
  }),
  (error) => error?.code === 'COROTATIONAL_TRUSS_TRANSVERSE_MEMBER_LOAD_UNSUPPORTED',
);

const twist = 0.004;
const torsion = kernel.evaluate({
  trialKinematics: { uGlobal: [0, 0, 0, 0, 0, 0, 0, 0, 0, twist, 0, 0] },
});
const expectedTorque = effectiveMaterial.G * effectiveSection.J / descriptor.geometry.length * twist;
close(torsion.resistingForceGlobal[9], expectedTorque, 2e-5, 'torsional moment');
close(torsion.resistingForceGlobal[3], -expectedTorque, 2e-5, 'torsional reaction');

const tipY = 1e-4;
const bendY = kernel.evaluate({
  trialKinematics: { uGlobal: [0, 0, 0, 0, 0, 0, 0, tipY, 0, 0, 0, 1.5 * tipY / descriptor.geometry.length] },
});
const expectedShearY = 3 * effectiveMaterial.E * effectiveSection.Iz * tipY / descriptor.geometry.length ** 3;
close(bendY.resistingForceGlobal[7], expectedShearY, 2e-4, 'local-y bending shear');

const tipZ = -1e-4;
const bendZ = kernel.evaluate({
  trialKinematics: { uGlobal: [0, 0, 0, 0, 0, 0, 0, 0, tipZ, 0, -1.5 * tipZ / descriptor.geometry.length, 0] },
});
const expectedShearZ = 3 * effectiveMaterial.E * effectiveSection.Iy * tipZ / descriptor.geometry.length ** 3;
close(bendZ.resistingForceGlobal[8], expectedShearZ, 2e-4, 'local-z bending shear');

const releasedDomain = buildCanonicalAnalysisDomain({
  ...baseModel('frame'),
  members: [{
    ...baseModel('frame').members[0],
    releases: { i: 'rigid', j: 'pin' },
  }],
});
assert.equal(releasedDomain.ok, true, releasedDomain.reason);
const released = createCorotationalFrame3dKernel(releasedDomain.elements[0]);
const releasedResponse = released.evaluate({ trialKinematics: { uGlobal: probe } });
assert.equal(releasedResponse.diagnostics.energyConservative, false);
assert.equal(releasedResponse.energies.elementPotential, undefined);
assert.throws(
  () => released.evaluate({ mode: 'dynamic', trialKinematics: { uGlobal: probe } }),
  (error) => error?.code === 'COROTATIONAL_RELEASE_ENERGY_MODE_UNSUPPORTED',
);
for (const dof of releasedDomain.elements[0].releases.localDofs) {
  close(releasedResponse.localResponse.elasticResistingForce[dof], 0, 1e-7, `released local force ${dof}`);
}
const releasedSpatialMomentJ = releasedResponse.globalResponse.resistingForce.slice(9, 12);
const releasedCurrentY = releasedResponse.localResponse.currentAxes[1];
const releasedCurrentZ = releasedResponse.localResponse.currentAxes[2];
close(dot(releasedSpatialMomentJ, releasedCurrentY), 0, 5e-8, 'released physical My');
close(dot(releasedSpatialMomentJ, releasedCurrentZ), 0, 5e-8, 'released physical Mz');

const unsupportedBehaviorModel = baseModel('frame');
unsupportedBehaviorModel.members[0].type = 'cable';
unsupportedBehaviorModel.members[0].behavior = 'cable';
const unsupportedBehaviorDomain = buildCanonicalAnalysisDomain(unsupportedBehaviorModel);
assert.equal(unsupportedBehaviorDomain.ok, true, unsupportedBehaviorDomain.reason);
assert.throws(
  () => createCorotationalFrame3dKernel(unsupportedBehaviorDomain.elements[0]),
  (error) => error?.code === 'COROTATIONAL_BEHAVIOR_UNSUPPORTED',
);

const invalidReleaseModel = baseModel('frame');
invalidReleaseModel.members[0].releases = { i: 'rigid', j: 'partial' };
const invalidReleaseDomain = buildCanonicalAnalysisDomain(invalidReleaseModel);
assert.equal(invalidReleaseDomain.ok, true, invalidReleaseDomain.reason);
assert.throws(
  () => createCorotationalFrame3dKernel(invalidReleaseDomain.elements[0]),
  (error) => error?.code === 'COROTATIONAL_RELEASE_CONTRACT_INVALID',
);

const offsetModel = baseModel('frame');
offsetModel.members[0].endOffset = { i: 0.35, j: 0.2, rigidFactor: 1 };
const offsetDomain = buildCanonicalAnalysisDomain(offsetModel);
assert.equal(offsetDomain.ok, true, offsetDomain.reason);
const offsetDescriptor = offsetDomain.elements[0];
const offsetKernel = createCorotationalFrame3dKernel(offsetDescriptor);
const offsetLinear = createLinearElasticElementKernel(offsetDescriptor);
const offsetZero = offsetKernel.evaluate({ trialKinematics: { uGlobal: new Array(12).fill(0) } });
const offsetLinearZero = offsetLinear.evaluate({ trialKinematics: { uGlobal: new Array(12).fill(0) } });
matrixClose(offsetZero.tangentGlobal, offsetLinearZero.tangentGlobal, 3e-8, 'offset linear tangent');
const offsetXj = [offsetDescriptor.geometry.grossLength, 0, 0];
const offsetRotatedJ = matVec(Q, offsetXj);
const offsetRigid = [
  0.8, -0.3, 1.1, ...rotation,
  offsetRotatedJ[0] - offsetXj[0] + 0.8,
  offsetRotatedJ[1] - offsetXj[1] - 0.3,
  offsetRotatedJ[2] - offsetXj[2] + 1.1,
  ...rotation,
];
const offsetRigidResponse = offsetKernel.evaluate({ trialKinematics: { uGlobal: offsetRigid } });
closeVector(offsetRigidResponse.resistingForceGlobal, new Array(12).fill(0), 5e-5, 'offset rigid rotation force');

const verticalModel = baseModel('frame');
verticalModel.nodes[1] = { id: 'N2', x: 1e-6, y: -2e-6, z: 4 };
verticalModel.members[0] = {
  ...verticalModel.members[0],
  n2: 'N2',
  localAxis: { roll: 33, strongAxis: 'z' },
};
const verticalDomain = buildCanonicalAnalysisDomain(verticalModel);
assert.equal(verticalDomain.ok, true, verticalDomain.reason);
const verticalDescriptor = verticalDomain.elements[0];
const verticalKernel = createCorotationalFrame3dKernel(verticalDescriptor);
const verticalReference = verticalDescriptor.geometry.axes.x.map((value) => value * verticalDescriptor.geometry.grossLength);
const verticalRotated = matVec(Q, verticalReference);
const verticalRigid = [
  ...translation, ...rotation,
  verticalRotated[0] - verticalReference[0] + translation[0],
  verticalRotated[1] - verticalReference[1] + translation[1],
  verticalRotated[2] - verticalReference[2] + translation[2],
  ...rotation,
];
const verticalResponse = verticalKernel.evaluate({ trialKinematics: { uGlobal: verticalRigid } });
closeVector(verticalResponse.resistingForceGlobal, new Array(12).fill(0), 5e-5, 'near-vertical rigid rotation force');
for (const axisRow of verticalResponse.localResponse.currentAxes) close(Math.hypot(...axisRow), 1, 2e-10, 'near-vertical unit axis');

const thermalModel = baseModel('frame');
thermalModel.loads = [{ id: 'TEMP', type: 'temperature', member: 'M1', dT: 30, alpha: 1.2e-5, case: 'D' }];
const thermalDomain = buildCanonicalAnalysisDomain(thermalModel, { factors: { D: 1 } });
assert.equal(thermalDomain.ok, true, thermalDomain.reason);
const thermalPattern = buildNonlinearLoadPattern(thermalDomain);
assert.equal(thermalPattern.ok, true, thermalPattern.reason);
const thermalTrace = thermalPattern.trace.filter((row) => row.target?.memberId === 'M1');
const thermalFixedEnd = thermalTrace[0].condensedFixedEnd;
const thermalKernel = createCorotationalFrame3dKernel(thermalDomain.elements[0]);
const thermalResponse = thermalKernel.evaluate({
  trialKinematics: { uGlobal: new Array(12).fill(0), lambda: 1, memberFixedEndLocal: thermalFixedEnd },
  elementLoads: { trace: thermalTrace },
});
const thermalUnloaded = thermalKernel.evaluate({ trialKinematics: { uGlobal: new Array(12).fill(0), lambda: 0 } });
assert.ok(Math.abs(thermalResponse.trialState.axialForce) > 1e5, 'restrained thermal axial force must enter state');
assert.ok(maxMatrixError(thermalResponse.tangentGlobal, thermalUnloaded.tangentGlobal) > 1e-8, 'thermal prestress must alter tangent');
closeVector(thermalResponse.localResponse.resistingForce, thermalFixedEnd, 2e-10, 'thermal fixed-end recovery');

const deadLoadModel = baseModel('frame');
deadLoadModel.loads = [{ id: 'W', type: 'udl', member: 'M1', w: 20, dir: '-z', case: 'D' }];
const deadLoadDomain = buildCanonicalAnalysisDomain(deadLoadModel, { factors: { D: 1 } });
assert.equal(deadLoadDomain.ok, true, deadLoadDomain.reason);
const deadLoadPattern = buildNonlinearLoadPattern(deadLoadDomain);
assert.equal(deadLoadPattern.ok, true, deadLoadPattern.reason);
const deadLoadTrace = deadLoadPattern.trace.filter((row) => row.target?.memberId === 'M1');
const deadLoadKernel = createCorotationalFrame3dKernel(deadLoadDomain.elements[0]);
const deadLoadZero = deadLoadKernel.evaluate({
  trialKinematics: { uGlobal: new Array(12).fill(0), lambda: 1 },
  elementLoads: { trace: deadLoadTrace },
});
const quarterTurn = Math.PI / 2;
const quarterRotation = [0, quarterTurn, 0];
const quarterMatrix = axisAngle([0, 1, 0], quarterTurn);
const quarterEnd = matVec(quarterMatrix, [4, 0, 0]);
const deadLoadRotated = deadLoadKernel.evaluate({
  trialKinematics: {
    uGlobal: [0, 0, 0, ...quarterRotation, quarterEnd[0] - 4, quarterEnd[1], quarterEnd[2], ...quarterRotation],
    lambda: 1,
  },
  elementLoads: { trace: deadLoadTrace },
});
for (const key of ['N', 'Vy', 'Vz', 'Tq', 'My', 'Mz']) {
  closeVector(deadLoadRotated.localResponse.stations[key], deadLoadZero.localResponse.stations[key], 2e-10, `dead-load reference recovery ${key}`);
}

console.log(JSON.stringify({
  ok: true,
  verificationIds: [
    'NL-COR-01', 'NL-COR-02', 'NL-COR-03', 'NL-COR-04', 'NL-COR-05',
    'NL-COR-06', 'NL-COR-07', 'NL-COR-11', 'NL-COR-12',
  ],
  rigidRotationEnergy: rigidResponse.energies.strain,
  tangentError: maxMatrixError(probeResponse.tangentGlobal, finiteDifference),
  axialForce: axial.resistingForceGlobal[6],
}, null, 2));

function baseModel(type) {
  return {
    schemaVersion: 5,
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N2', x: 4, y: 0, z: 0 },
    ],
    members: [{
      id: 'M1', type, behavior: type, n1: 'N1', n2: 'N2', matId: 'MAT', secId: 'SEC',
      localAxis: { refVector: [0, 1, 0], roll: 0, strongAxis: 'z' },
    }],
    materials: [{ id: 'MAT', E: 210e6, G: 80e6, density: 0 }],
    sections: [{ id: 'SEC', type: 'direct', A: 0.02, Iy: 8e-5, Iz: 1.2e-4, J: 3e-5 }],
    loads: [], loadCases: [], loadCombinations: [],
    analysisSettings: { includeSelfWeight: false },
  };
}

function finiteDifferenceTangent(element, q, step) {
  const out = Array.from({ length: q.length }, () => new Array(q.length).fill(0));
  for (let column = 0; column < q.length; column += 1) {
    const plus = q.slice();
    const minus = q.slice();
    plus[column] += step;
    minus[column] -= step;
    const fp = element.evaluate({ trialKinematics: { uGlobal: plus } }).resistingForceGlobal;
    const fm = element.evaluate({ trialKinematics: { uGlobal: minus } }).resistingForceGlobal;
    for (let row = 0; row < q.length; row += 1) out[row][column] = (fp[row] - fm[row]) / (2 * step);
  }
  return out;
}

function finiteDifferenceMoment(rotation, moment, step) {
  const out = Array.from({ length: 3 }, () => new Array(3).fill(0));
  for (let column = 0; column < 3; column += 1) {
    const plus = rotation.slice();
    const minus = rotation.slice();
    plus[column] += step;
    minus[column] -= step;
    const fp = pullBackSpatialMoment(plus, moment).generalized;
    const fm = pullBackSpatialMoment(minus, moment).generalized;
    for (let row = 0; row < 3; row += 1) out[row][column] = (fp[row] - fm[row]) / (2 * step);
  }
  return out;
}

function axisAngle(axis, angle) {
  const [x, y, z] = axis;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const d = 1 - c;
  return [
    [c + x * x * d, x * y * d - z * s, x * z * d + y * s],
    [y * x * d + z * s, c + y * y * d, y * z * d - x * s],
    [z * x * d - y * s, z * y * d + x * s, c + z * z * d],
  ];
}

function matVec(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function normalize(vector) {
  const norm = Math.hypot(...vector);
  return vector.map((value) => value / norm);
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function matrixClose(actual, expected, tolerance, label) {
  actual.forEach((row, i) => row.forEach((value, j) => close(value, expected[i][j], tolerance, `${label}[${i},${j}]`)));
}

function closeVector(actual, expected, tolerance, label) {
  actual.forEach((value, index) => close(value, expected[index], tolerance, `${label}[${index}]`));
}

function maxMatrixError(actual, expected) {
  let error = 0;
  actual.forEach((row, i) => row.forEach((value, j) => {
    error = Math.max(error, Math.abs(value - expected[i][j]) / Math.max(1, Math.abs(value), Math.abs(expected[i][j])));
  }));
  return error;
}

function close(actual, expected, tolerance, label) {
  const scale = Math.max(1, Math.abs(Number(actual)), Math.abs(Number(expected)));
  assert.ok(Math.abs(Number(actual) - Number(expected)) <= tolerance * scale, `${label}: ${actual} != ${expected}`);
}
