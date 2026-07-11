import assert from 'node:assert/strict';
import { runSecondOrderPDelta } from '../src/solver/pdelta/secondOrder.js';

const E = 1e6;
const INTERNAL_E = E * 1000;
const A = 1;
const alpha = 1e-5;
const dT = -10;
const expectedAxial = INTERNAL_E * A * alpha * dT;

const direct = runSecondOrderPDelta(restrainedTemperatureModel(), { T: 1 }, { loadSteps: 2 });

assert.equal(direct.ok, true, direct.reason);
close(direct.result.memberResults.C.N[0], expectedAxial, 1e-9, 'recovered start axial force');
close(direct.result.memberResults.C.N.at(-1), expectedAxial, 1e-9, 'recovered end axial force');
close(direct.result.axialForces.C, expectedAxial, 1e-9, 'Direct tangent axial-force map');
close(
  direct.stability.critical.referenceAxialForces.C,
  expectedAxial,
  1e-9,
  'critical-stability reference axial force',
);
close(
  direct.stability.critical.referenceCompressionByMember.C,
  -expectedAxial,
  1e-9,
  'compression-positive stability demand',
);
assert.equal(direct.steps.at(-1).iterations.at(-1).tangent.compressionMemberCount, 1);
close(
  direct.steps[0].iterations.at(-1).tangent.maxAbsAxialForce,
  Math.abs(expectedAxial) * 0.5,
  1e-9,
  'first load-step fixed-end axial force',
);
assert.equal(direct.result.summary.equilibriumStatus, 'PASS');

console.log(JSON.stringify({
  ok: true,
  recoveredAxial: direct.result.memberResults.C.N[0],
  tangentAxial: direct.result.axialForces.C,
  referenceCompression: direct.stability.critical.referenceCompressionByMember.C,
  stability: direct.stability.status,
}, null, 2));

function restrainedTemperatureModel() {
  return {
    nodes: [
      { id: 'B', x: 0, y: 0, z: 0, support: 'fixed' },
      {
        id: 'T',
        x: 0,
        y: 0,
        z: 3,
        support: 'custom',
        fix: [false, false, true, false, false, false],
      },
    ],
    members: [{ id: 'C', n1: 'B', n2: 'T', matId: 'MAT', secId: 'SEC' }],
    materials: [{
      id: 'MAT',
      E,
      G: 4e5,
      alpha,
      Fy: 1e9,
      allow: { fb: 1e9, ft: 1e9, fc: 1e9, fv: 1e9 },
    }],
    sections: [{
      id: 'SEC',
      type: 'direct',
      A,
      Iy: 1e-3,
      Iz: 1e-3,
      J: 1e-3,
      Zy: 1,
      Zz: 1,
    }],
    loads: [{ id: 'TEMP', type: 'temperature', member: 'C', dT, case: 'T' }],
    loadCases: [{ id: 'T', type: 'temperature' }],
    loadCombinations: [{ id: 'TEMP-COMB', factors: { T: 1 } }],
    analysisSettings: { validateBeforeSolve: false, responseSpectrum: { enabled: false } },
  };
}

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`,
  );
}
