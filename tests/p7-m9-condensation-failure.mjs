import assert from 'node:assert/strict';
import { analyzeDynamics } from '../src/dynamics/modal.js';

const unbracedTruss = {
  units: { length: 'm', force: 'kN', moment: 'kN.m' },
  materials: [{ id: 'TEST', name: 'Test', E: 200000, G: 77000, density: 0 }],
  sections: [{ id: 'TRUSS', name: 'Truss', A: 0.01, Iy: 1e-6, Iz: 1e-6, J: 1e-6 }],
  nodes: [
    { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
    {
      id: 'N1',
      x: 1,
      y: 0,
      z: 0,
      support: 'custom',
      fix: [false, true, true, true, true, true],
      mass: [10, 0, 0],
    },
    { id: 'N2', x: 1, y: 1, z: 0 },
  ],
  members: [
    {
      id: 'T1',
      type: 'truss',
      n1: 'N0',
      n2: 'N1',
      matId: 'TEST',
      secId: 'TRUSS',
    },
    {
      id: 'T2',
      type: 'truss',
      n1: 'N0',
      n2: 'N2',
      matId: 'TEST',
      secId: 'TRUSS',
    },
  ],
  analysisSettings: {
    modalModeCount: 1,
    responseSpectrum: {
      enabled: true,
      method: 'SRSS',
      directions: ['x'],
      scale: 1,
      points: [{ period: 0, sa: 1 }, { period: 5, sa: 1 }],
    },
  },
};

const result = analyzeDynamics(unbracedTruss);

assert.equal(result.ok, false);
assert.equal(result.status, 'failed');
assert.equal(result.reason, 'RESIDUAL_DOF_BACK_SUBSTITUTION_FAILED');
assert.equal(result.designBlocked, true);
assert.equal(result.condensation.status, 'failed');
assert.equal(result.condensation.transformationPreserved, false);
assert.deepEqual(result.modes, []);
assert.equal(result.rsa, null);

console.log(JSON.stringify({
  ok: true,
  analysisOk: result.ok,
  reason: result.reason,
  condensation: result.condensation.status,
  rsa: result.rsa,
}, null, 2));
