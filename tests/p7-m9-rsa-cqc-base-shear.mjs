import assert from 'node:assert/strict';
import { runResponseSpectrum } from '../src/dynamics/modal.js';
import { buildBaseShearScaleTrace } from '../src/results/rsa/baseShearScale.js';

const theta = 0.35;
const c = Math.cos(theta);
const s = Math.sin(theta);
const periods = [1, 1.05];
const vectors = [
  dofVector(c, s),
  dofVector(-s, c),
];
const gammas = [c + s, c - s];
const modes = periods.map((period, index) => ({
  id: `M${index + 1}`,
  index: index + 1,
  period,
  omega: 2 * Math.PI / period,
  vector: vectors[index],
  participation: {
    x: {
      gamma: gammas[index],
      modalMass: 1,
      generalizedMass: 1,
      effectiveMass: gammas[index] ** 2,
      massRatio: gammas[index] ** 2 / 2,
    },
  },
}));
const mass = new Array(12).fill(0);
mass[0] = 1;
mass[6] = 1;
const nodes = [
  { id: 'N1', x: 0, y: 0, z: 0 },
  { id: 'N2', x: 0, y: 0, z: 3 },
];
const dampingRatio = 0.05;
const spectralAcceleration = 3;
const rsa = runResponseSpectrum(modes, [0, 6], mass, [2, 0, 0], {
  method: 'CQC',
  directions: ['x'],
  dampingRatio,
  scale: 1,
  points: [{ period: 0, sa: spectralAcceleration }, { period: 5, sa: spectralAcceleration }],
  analysisCaseId: 'RSA-CQC',
}, {
  nodes,
  units: { length: 'm', force: 'kN' },
});

const rho = cqcCorrelation(periods[0], periods[1], dampingRatio);
const modalN2 = [
  s * gammas[0] * spectralAcceleration / modes[0].omega ** 2,
  c * gammas[1] * spectralAcceleration / modes[1].omega ** 2,
];
const expectedN2 = cqc(modalN2, rho);
const combinedN2 = rsa.combined.x.nodalDisplacements.find((row) => row.nodeId === 'N2');
close(combinedN2.x, expectedN2, 1e-12, 'CQC nodal displacement');

const modalBaseShears = gammas.map((gamma) => gamma ** 2 * spectralAcceleration);
const expectedBaseShear = cqc(modalBaseShears, rho);
close(rsa.combined.x.baseShear, expectedBaseShear, 1e-12, 'CQC base shear');
close(rsa.combined.x.baseShear, rsa.combined.x.cqcBaseShear, 1e-12, 'selected CQC base shear');
assert.notEqual(rsa.combined.x.baseShear, rsa.combined.x.srssBaseShear);
assert.equal(rsa.combined.x.baseShearDimension, 'force');
assert.equal(rsa.combined.x.units.baseShear, 'kN');
assert.equal(rsa.provenance.analysisCaseId, 'RSA-CQC');
assert.deepEqual(rsa.provenance.staticCaseReferences, []);
assert.equal(rsa.memberForces.status, 'unsupported');
assert.equal(rsa.memberForces.designBlocked, true);

const minimum = expectedBaseShear * 1.5;
const scaling = buildBaseShearScaleTrace({ rsa, directionMinima: { x: minimum } });
close(scaling.rows[0].baseShear, expectedBaseShear, 1e-12, 'scaling before value');
close(scaling.rows[0].scaleFactor, 1.5, 1e-12, 'scaling factor');
close(scaling.rows[0].scaledBaseShear, minimum, 1e-12, 'scaling after value');
assert.equal(scaling.rows[0].dimensions.baseShear, 'force');

const displacementOnly = buildBaseShearScaleTrace({
  rsa: {
    method: 'SRSS',
    combined: { x: { srssDisplacement: 999, dimensions: { srssDisplacement: 'length' } } },
  },
  directionMinima: { x: 10 },
});
assert.equal(displacementOnly.rows[0].baseShear, null);
assert.equal(displacementOnly.rows[0].scaledBaseShear, null);
assert.equal(displacementOnly.rows[0].status, 'unsupported');
assert.equal(displacementOnly.rows[0].designBlocked, true);
const missingBaseShear = buildBaseShearScaleTrace({});
assert.equal(missingBaseShear.designBlocked, true);
assert.equal(missingBaseShear.summary.status, 'unsupported');

console.log(JSON.stringify({
  ok: true,
  cqcCorrelation: rho,
  cqcNodalDisplacement: combinedN2.x,
  cqcBaseShear: rsa.combined.x.baseShear,
  scaleFactor: scaling.rows[0].scaleFactor,
}, null, 2));

function dofVector(first, second) {
  const vector = new Array(12).fill(0);
  vector[0] = first;
  vector[6] = second;
  return vector;
}

function cqc(values, correlation) {
  return Math.sqrt(values[0] ** 2 + values[1] ** 2 + 2 * correlation * values[0] * values[1]);
}

function cqcCorrelation(firstPeriod, secondPeriod, damping) {
  const ratio = Math.max(firstPeriod, secondPeriod) / Math.min(firstPeriod, secondPeriod);
  return (8 * damping ** 2 * (1 + ratio) * ratio ** 1.5)
    / ((1 - ratio ** 2) ** 2 + 4 * damping ** 2 * ratio * (1 + ratio) ** 2);
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}
