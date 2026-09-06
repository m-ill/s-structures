import assert from 'node:assert/strict';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import {
  buildMdofMassDomain,
  combineGroundInfluence,
  recoverDynamicInertia,
} from '../src/nonlinear/dynamics/massDomain.js';
import {
  buildMdofGroundMotionSet,
  createMdofGroundMotionRecord,
  parseMdofGroundMotionText,
} from '../src/nonlinear/dynamics/mdofGroundMotion.js';
import {
  buildMdofDampingMatrix,
  dampingRatioAtOmega,
  solveMdofRayleighCoefficients,
} from '../src/nonlinear/dynamics/mdofDamping.js';
import { createDynamicHistoryCollector } from '../src/nonlinear/dynamics/dynamicHistory.js';
import {
  createCscFromTriplets,
  cscDiagonal,
  cscSymmetryError,
  validateDynamicCsc,
} from '../src/nonlinear/dynamics/sparseMatrix.js';

assert.throws(
  () => validateDynamicCsc({
    format: 'csc',
    rowCount: 2,
    colCount: 1,
    nnz: 2,
    colPtr: Int32Array.from([0, 2]),
    rowIdx: Int32Array.from([1, 0]),
    values: Float64Array.from([1, 1]),
  }),
  (error) => error.code === 'DYNAMIC_CSC_ROW_INVALID',
);
const tamperedMatrix = createCscFromTriplets(1, 1, [[0, 0, 1]]);
tamperedMatrix.values[0] = 2;
assert.throws(
  () => validateDynamicCsc(tamperedMatrix),
  (error) => error.code === 'DYNAMIC_CSC_VALUE_HASH_MISMATCH',
);

const retainedHistory = createDynamicHistoryCollector({
  retainInternalSteps: true,
  chunkSize: 1,
  memoryBudgetBytes: 4096,
});
retainedHistory.recordInternalStep({ time: 0.01, dt: 0.01, iterationCount: 2, substepLevel: 1 });
retainedHistory.appendOutput({ time: 0.01, q: [0.1] });
const retainedManifest = retainedHistory.finalize();
assert.equal(retainedManifest.retainedInternalStepCount, 1);
assert.equal(retainedManifest.internalSteps[0].substepLevel, 1);
assert.ok(retainedManifest.envelopes['q[0]']);

const model = rigidFloorModel();
const domain = buildCanonicalAnalysisDomain(model);
assert.equal(domain.ok, true);
const mass = buildMdofMassDomain(model, domain, { massSourceId: 'MS', formulation: 'lumped' });
assert.equal(mass.ok, true);
assert.equal(mass.formulation, 'lumped');
assert.deepEqual(mass.activeMassByAxis, [4, 4, 4]);
assert.ok(cscSymmetryError(mass.matrix) < 1e-14);
const rz = domain.constraint.reducedDofs.find((row) => row.key === 'dia:D:rz').index;
assert.equal(cscDiagonal(mass.matrix)[rz], 20, 'sum m*(x^2+y^2) must become diaphragm rotational inertia');
const xInfluence = combineGroundInfluence(mass, 'x');
const negativeX = combineGroundInfluence(mass, '-x');
assert.equal(xInfluence.resultantMass, 4);
Array.from(negativeX.vector).forEach((value, index) => {
  assert.ok(Math.abs(value + Number(xInfluence.vector[index])) < 1e-14);
});

const rotationalModel = singleColumnModel({
  density: 0,
  nodeMass: [1, 1, 1, 0.2, 0.3, 0.4],
  includeMemberMass: false,
});
const rotationalDomain = buildCanonicalAnalysisDomain(rotationalModel);
const rotationalMass = buildMdofMassDomain(rotationalModel, rotationalDomain, {
  massSourceId: 'MS',
  formulation: 'lumped',
});
const rotationalDiagonal = cscDiagonal(rotationalMass.matrix);
for (const [dof, expected] of [[3, 0.2], [4, 0.3], [5, 0.4]]) {
  const reduced = rotationalDomain.constraint.reducedDofs.find((row) => row.key === `n:T:${dof}`).index;
  assert.equal(rotationalDiagonal[reduced], expected, `node rotational inertia n:T:${dof}`);
}
const rotationalAcceleration = new Array(rotationalDomain.constraint.reducedDofCount).fill(0);
rotationalAcceleration[rotationalDomain.constraint.reducedDofs.find((row) => row.key === 'n:T:3').index] = 2;
const rotationalInertia = recoverDynamicInertia(rotationalMass, rotationalDomain, rotationalAcceleration);
assert.ok(Math.abs(rotationalInertia.baseReactionMoment[0] + 0.4) < 1e-14);

const consistentModel = singleColumnModel({ density: 2, nodeMass: null, includeMemberMass: true });
const consistentDomain = buildCanonicalAnalysisDomain(consistentModel);
const consistent = buildMdofMassDomain(consistentModel, consistentDomain, {
  massSourceId: 'MS',
  formulation: 'consistent',
});
assert.equal(consistent.formulation, 'consistent');
assert.equal(consistent.consistentMemberCount, 1);
assert.ok(consistent.matrix.nnz > 6, 'frame consistent mass must retain translational-rotational coupling');
assert.ok(cscSymmetryError(consistent.matrix) < 1e-12);

assert.throws(
  () => parseMdofGroundMotionText('0 1 bad 0', { dt: 0.02, unit: 'm/s2' }),
  (error) => error.code === 'GROUND_MOTION_TOKEN_INVALID',
);
assert.throws(
  () => parseMdofGroundMotionText('0 1 0', { dt: 0.02 }),
  (error) => error.code === 'GROUND_MOTION_UNIT_REQUIRED',
);
const record = createMdofGroundMotionRecord({
  id: 'GM-X',
  values: [0, 0.1, -0.2, 0],
  dt: 0.02,
  unit: 'g',
  baseline: 'none',
  targetPga: 1.5,
  direction: 'x',
});
assert.ok(Math.abs(record.pga - 1.5) < 1e-12);
assert.equal(record.spectrumMatched, false);
assert.equal(record.scaleMethod, 'target-pga');
const tamperedRecord = createMdofGroundMotionRecord({
  id: 'GM-TAMPERED',
  values: [0, 1, 0],
  dt: 0.02,
  unit: 'm/s2',
  direction: 'x',
});
tamperedRecord.accelerations[1] = 2;
assert.throws(
  () => buildMdofGroundMotionSet(tamperedRecord, mass),
  (error) => error.code === 'GROUND_MOTION_RECORD_HASH_MISMATCH',
);
const set = buildMdofGroundMotionSet(record, mass);
set.records[0].accelerations[1] = 999;
const load = set.effectiveLoadAt(0.02);
assert.ok(Math.abs(load[domain.constraint.reducedDofs.find((row) => row.key === 'dia:D:ux').index] + 3) < 1e-12);

const rayleigh = solveMdofRayleighCoefficients({
  first: { omega: 1, dampingRatio: 0.05 },
  second: { omega: 4, dampingRatio: 0.05 },
});
assert.ok(Math.abs(dampingRatioAtOmega(rayleigh, 1) - 0.05) < 1e-12);
assert.ok(Math.abs(dampingRatioAtOmega(rayleigh, 4) - 0.05) < 1e-12);
const simpleMass = {
  ...mass,
  reducedDofCount: 2,
  massHash: 'simple-mass',
  matrix: createCscFromTriplets(2, 2, [[0, 0, 2], [1, 1, 3]]),
};
const stiffness = createCscFromTriplets(2, 2, [[0, 0, 8], [1, 1, 12]]);
const damping = buildMdofDampingMatrix({
  massDomain: simpleMass,
  stiffnessMatrix: stiffness,
  specification: { type: 'rayleigh', coefficients: rayleigh, stiffnessPolicy: 'initial' },
});
const dampingDiagonal = cscDiagonal(damping.matrix);
assert.ok(Math.abs(dampingDiagonal[0] - (2 * rayleigh.alpha + 8 * rayleigh.beta)) < 1e-12);
assert.ok(Math.abs(dampingDiagonal[1] - (3 * rayleigh.alpha + 12 * rayleigh.beta)) < 1e-12);
assert.equal(damping.stiffnessPolicy, 'initial');

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-DYN-01', 'NL-DYN-02', 'NL-DYN-03', 'NL-DYN-04', 'NL-DYN-05', 'NL-DYN-06'],
  reducedDofCount: domain.constraint.reducedDofCount,
  diaphragmRotationalInertia: cscDiagonal(mass.matrix)[rz],
  consistentMassNnz: consistent.matrix.nnz,
  groundMotionPga: record.pga,
  rayleigh: { alpha: rayleigh.alpha, beta: rayleigh.beta },
}, null, 2));

function rigidFloorModel() {
  const nodes = [];
  const members = [];
  const coordinates = [[-2, -1], [2, -1], [2, 1], [-2, 1]];
  coordinates.forEach(([x, y], index) => {
    nodes.push(
      { id: `B${index}`, x, y, z: 0, support: 'fixed' },
      { id: `T${index}`, x, y, z: 3, mass: [1, 1, 1, 0, 0, 0] },
    );
    members.push(frame(`C${index}`, `B${index}`, `T${index}`));
  });
  return {
    schemaVersion: 5,
    nodes,
    members,
    materials: [{ id: 'MAT', E: 2e8, G: 8e7, density: 0 }],
    sections: [{ id: 'SEC', A: 0.02, Iy: 1e-4, Iz: 1e-4, J: 2e-5 }],
    loads: [],
    loadCases: [],
    loadCombinations: [],
    massSources: [{ id: 'MS', version: 1, includeNodeMass: true, includeMemberMass: false, combos: [] }],
    diaphragms: [{ id: 'D', type: 'rigid', nodeIds: coordinates.map((_row, index) => `T${index}`) }],
    analysisSettings: { includeSelfWeight: false },
  };
}

function singleColumnModel({ density, nodeMass, includeMemberMass }) {
  return {
    schemaVersion: 5,
    nodes: [
      { id: 'B', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'T', x: 0, y: 0, z: 3, ...(nodeMass == null ? {} : { mass: nodeMass }) },
    ],
    members: [frame('C', 'B', 'T')],
    materials: [{ id: 'MAT', E: 2e8, G: 8e7, density }],
    sections: [{ id: 'SEC', A: 0.02, Iy: 1e-4, Iz: 1e-4, J: 2e-5 }],
    loads: [],
    loadCases: [],
    loadCombinations: [],
    massSources: [{ id: 'MS', version: 1, includeNodeMass: true, includeMemberMass, combos: [] }],
    analysisSettings: { includeSelfWeight: false },
  };
}

function frame(id, n1, n2) {
  return {
    id,
    type: 'frame',
    behavior: 'frame',
    n1,
    n2,
    matId: 'MAT',
    secId: 'SEC',
    localAxis: { refVector: [1, 0, 0], roll: 0, strongAxis: 'z' },
  };
}
