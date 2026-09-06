import assert from 'node:assert/strict';
import {
  buildWinklerLineLocalMatrix,
  recoverWinklerLineResult,
  resolveMemberWinklerFoundation,
} from '../src/solver/foundation/index.js';

const L = 6;
const k = 12;
const matrix = buildWinklerLineLocalMatrix({ length: L, localZ: k });
const dofs = [2, 4, 8, 10];
const expected = [
  [156, -22 * L, 54, 13 * L],
  [-22 * L, 4 * L * L, -13 * L, -3 * L * L],
  [54, -13 * L, 156, 22 * L],
  [13 * L, -3 * L * L, 22 * L, 4 * L * L],
].map((row) => row.map((value) => value * k * L / 420));
for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) {
  assert.ok(relativeClose(matrix[dofs[i]][dofs[j]], expected[i][j], 1e-12));
  assert.ok(relativeClose(matrix[dofs[i]][dofs[j]], matrix[dofs[j]][dofs[i]], 1e-15));
}
for (const vector of [[1, 2, -1, 3], [0, 1, 0, -1], [4, 0, 4, 0]]) {
  const full = new Array(12).fill(0);
  dofs.forEach((dof, index) => { full[dof] = vector[index]; });
  assert.ok(quadratic(matrix, full) >= -1e-10);
}

const model = {
  foundationProperties: [{
    id: 'WF1', type: 'winkler-line', behavior: 'linear-bilateral',
    localZ: { lineStiffness: k, derivation: { subgradeModulus: 4, tributaryWidth: 3, source: 'test' } },
  }],
};
const foundation = resolveMemberWinklerFoundation(model, { id: 'B1', type: 'frame', foundationId: 'WF1' }, {
  memberBehavior: 'frame', length: L, timoshenko: { enabled: false },
});
assert.equal(foundation.ok, true);
assert.equal(foundation.active, true);
const displacement = new Array(12).fill(0);
displacement[2] = 0.025;
displacement[8] = 0.025;
const result = recoverWinklerLineResult(foundation, displacement, 11, {
  x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], flexibleStart: { x: 0, y: 0, z: 0 },
});
assert.ok(relativeClose(result.resultant.localZ, -k * L * 0.025, 1e-12));
assert.ok(relativeClose(result.centroid.localZ, L / 2, 1e-12));
assert.ok(relativeClose(result.strainEnergy, 0.5 * k * L * 0.025 ** 2, 1e-12));
assert.deepEqual(result.globalForce.map(round12), [0, 0, round12(-k * L * 0.025)]);

const mismatched = resolveMemberWinklerFoundation({ foundationProperties: [{
  id: 'BAD', type: 'winkler-line', localZ: { lineStiffness: 10, derivation: { subgradeModulus: 2, tributaryWidth: 3 } },
}] }, { id: 'B2', type: 'frame', foundationId: 'BAD' }, { memberBehavior: 'frame', length: L });
assert.equal(mismatched.ok, false);
assert.equal(mismatched.reason, 'FOUNDATION_LOCALZ_DERIVATION_MISMATCH');

const truss = resolveMemberWinklerFoundation(model, { id: 'T1', type: 'truss', foundationId: 'WF1' }, { memberBehavior: 'truss', length: L });
assert.equal(truss.ok, false);
assert.equal(truss.reason, 'FOUNDATION_MEMBER_BEHAVIOR_UNSUPPORTED');

console.log(JSON.stringify({
  ok: true,
  milestone: 'P14-M1',
  matrixParity: true,
  rigidTranslationEnergy: result.strainEnergy,
  resultant: result.resultant,
}, null, 2));

function quadratic(K, x) { return x.reduce((sum, value, i) => sum + value * K[i].reduce((row, item, j) => row + item * x[j], 0), 0); }
function relativeClose(a, b, tol) { return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b)); }
function round12(value) { return Number(value.toFixed(12)); }
