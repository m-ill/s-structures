import assert from 'node:assert/strict';
import { buildFlatShellAllmanDkq, buildFlatShellQm6Mitc4 } from '../src/index.js';
import { maxAbs } from '../src/solver/shell/shellElementMath.js';
import { quadraticEnergy, rigidModes } from './helpers/p10Shell.mjs';

const nodes = [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 2, z: 0 }, { x: 0, y: 2, z: 0 }];
const input = { id: 'S1', nodes, material: { E: 30e9, nu: 0.2 }, t: 0.1 };
const element = buildFlatShellQm6Mitc4(input);
assert.equal(element.ok, true);
assert.equal(element.elementFormulation, 'QM6-EAS+MITC4');
assert.equal(element.qualification.status, 'pass');
assert.equal(element.designEligibility.allowed, false);
assert.deepEqual(element.designEligibility.reasonCodes, ['SHELL_MODEL_MESH_CONVERGENCE_REQUIRED']);
assert.equal(element.matrix.length, 24);
assert.ok(element.diagnostics.symmetryError < 1e-12);
const scale = maxAbs(element.matrix);
const rigidEnergyRatio = Math.max(...rigidModes(nodes).map((mode) => Math.abs(quadraticEnergy(element.matrix, mode)) / Math.max(1, scale)));
assert.ok(rigidEnergyRatio < 1e-8, `SH-C01 rigid energy ${rigidEnergyRatio}`);
assert.ok(element.diagnostics.drillingStiffnessRatio < 1e-4);

const legacy = buildFlatShellAllmanDkq(input);
assert.equal(legacy.version, element.version);
assert.deepEqual(legacy.matrix, element.matrix);

const warned = buildFlatShellQm6Mitc4({ nodes: nodes.map((node, i) => ({ ...node, z: i === 2 ? 0.03 : 0 })), material: { E: 30e9, nu: 0.2 }, t: 0.1 }, { warpTol: 1e-2 });
assert.equal(warned.warp.status, 'warning');
assert.equal(warned.qualification.status, 'blocked');
assert.equal(warned.designEligibility.allowed, false);
const blocked = buildFlatShellQm6Mitc4({ nodes: nodes.map((node, i) => ({ ...node, z: i === 2 ? 0.2 : 0 })), material: { E: 30e9, nu: 0.2 }, t: 0.1 }, { warpTol: 1e-2 });
assert.equal(blocked.ok, false);
assert.equal(blocked.reason, 'SHELL_WARP_EXCEEDS_LIMIT');
const cannotLoosenWarpGate = buildFlatShellQm6Mitc4({ nodes: nodes.map((node, i) => ({ ...node, z: i === 2 ? 1 : 0 })), material: { E: 30e9, nu: 0.2 }, t: 0.1 }, { warpTol: 1e6 });
assert.equal(cannotLoosenWarpGate.ok, false);
assert.equal(cannotLoosenWarpGate.reason, 'SHELL_WARP_EXCEEDS_LIMIT');
assert.equal(cannotLoosenWarpGate.warp?.qualifiedToleranceMax, 1e-2);
for (const invalidWarpTol of [true, [0.005]]) {
  const invalidTolerance = buildFlatShellQm6Mitc4({ ...input, warpTol: invalidWarpTol });
  assert.equal(invalidTolerance.ok, true);
  assert.equal(invalidTolerance.qualification.status, 'blocked');
  assert.equal(invalidTolerance.qualification.reason, 'SHELL_WARP_TOLERANCE_INVALID');
}

export const M9C_SNAPSHOT = Object.freeze({ version: 'p10-m9c-verification-v3-hard-qualified-scope', rigidEnergyRatio, symmetryError: element.diagnostics.symmetryError, drillingStiffnessRatio: element.diagnostics.drillingStiffnessRatio, warpedWarningRatio: warned.warp.ratio });
console.log(JSON.stringify({ ok: true, ...M9C_SNAPSHOT }, null, 2));
