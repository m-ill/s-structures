import assert from 'node:assert/strict';
import { analyzeDynamics } from '../src/dynamics/modal.js';

const sdofMass = 10;
const stiffness = 1000;
const sdof = axialChainModel([sdofMass], stiffness, {
  enabled: true,
  method: 'SRSS',
  directions: ['x'],
  scale: 1,
  points: [{ period: 0, sa: 2 }, { period: 5, sa: 2 }],
});
const sdofResult = analyzeDynamics(sdof);
assert.equal(sdofResult.ok, true);
assert.equal(sdofResult.modes.length, 1);
close(sdofResult.modes[0].period, 2 * Math.PI * Math.sqrt(sdofMass / stiffness), 1e-10, 'SDOF period');
close(generalizedMass(sdofResult.modes[0], [sdofMass]), 1, 1e-12, 'SDOF mass normalization');
close(sdofResult.modes[0].normalization.generalizedMass, 1, 1e-12, 'reported generalized mass');
close(maxAbs(sdofResult.modes[0].displayVector), 1, 1e-12, 'separate display normalization');
assert.equal(sdofResult.modes[0].dimensions.modeVector, 'inverse-square-root-mass');

const sdofRsa = sdofResult.rsa.combined.x;
close(sdofRsa.displacement, 2 / (stiffness / sdofMass), 1e-12, 'SDOF spectral displacement');
close(sdofRsa.baseShear, sdofMass * 2, 1e-10, 'SDOF base shear');
assert.equal(sdofRsa.dimensions.baseShear, 'force');
assert.equal(sdofRsa.units.baseShear, 'kN');

const twoDofMass = 5;
const twoDof = axialChainModel([twoDofMass, twoDofMass], stiffness, { enabled: false });
const twoDofResult = analyzeDynamics(twoDof);
assert.equal(twoDofResult.ok, true);
assert.equal(twoDofResult.modes.length, 2);
const expectedEigenvalues = [
  (stiffness / twoDofMass) * (3 - Math.sqrt(5)) / 2,
  (stiffness / twoDofMass) * (3 + Math.sqrt(5)) / 2,
];
for (let index = 0; index < 2; index += 1) {
  close(twoDofResult.modes[index].omega ** 2, expectedEigenvalues[index], 1e-8, `2DOF eigenvalue ${index + 1}`);
  close(generalizedMass(twoDofResult.modes[index], [twoDofMass, twoDofMass]), 1, 1e-12, `2DOF mode ${index + 1} mass`);
}
const orthogonality = twoDofMass * (
  twoDofResult.modes[0].vector[6] * twoDofResult.modes[1].vector[6]
  + twoDofResult.modes[0].vector[12] * twoDofResult.modes[1].vector[12]
);
close(orthogonality, 0, 1e-12, '2DOF mass orthogonality');
close(
  twoDofResult.modes.reduce((sum, mode) => sum + mode.participation.x.effectiveMass, 0),
  2 * twoDofMass,
  1e-10,
  '2DOF effective mass closure',
);

console.log(JSON.stringify({
  ok: true,
  sdofPeriod: sdofResult.modes[0].period,
  sdofBaseShear: sdofRsa.baseShear,
  twoDofEigenvalues: twoDofResult.modes.map((mode) => mode.omega ** 2),
}, null, 2));

function axialChainModel(masses, targetStiffness, responseSpectrum) {
  const E = 1;
  const A = targetStiffness / (E * 1000);
  const nodes = [{ id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' }];
  for (let index = 0; index < masses.length; index += 1) {
    nodes.push({
      id: `N${index + 1}`,
      x: index + 1,
      y: 0,
      z: 0,
      support: 'custom',
      fix: [false, true, true, true, true, true],
      mass: [masses[index], 0, 0],
    });
  }
  return {
    units: { length: 'm', force: 'kN', moment: 'kN.m' },
    materials: [{ id: 'TEST', name: 'Test', E, G: E / 2.6, density: 0 }],
    sections: [{ id: 'AXIAL', name: 'Axial', A, Iy: 1, Iz: 1, J: 1 }],
    nodes,
    members: masses.map((_, index) => ({
      id: `M${index + 1}`,
      type: 'truss',
      n1: `N${index}`,
      n2: `N${index + 1}`,
      matId: 'TEST',
      secId: 'AXIAL',
    })),
    analysisSettings: {
      modalModeCount: masses.length,
      responseSpectrum,
    },
  };
}

function generalizedMass(mode, masses) {
  return masses.reduce((sum, mass, index) => sum + mass * mode.vector[(index + 1) * 6] ** 2, 0);
}

function maxAbs(values) {
  return Math.max(...values.map((value) => Math.abs(value)));
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}
