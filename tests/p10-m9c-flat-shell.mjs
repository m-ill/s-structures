import assert from 'node:assert/strict';
import { buildFlatShellAllmanDkq } from '../src/index.js';
import { maxAbs } from '../src/solver/shell/shellElementMath.js';
import { quadraticEnergy, rigidModes } from './helpers/p10Shell.mjs';

const nodes = [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 2, z: 0 }, { x: 0, y: 2, z: 0 }];
const element = buildFlatShellAllmanDkq({ id: 'S1', nodes, material: { E: 30e9, nu: 0.2 }, t: 0.2 });
assert.equal(element.ok, true);
assert.equal(element.matrix.length, 24);
assert.ok(element.diagnostics.symmetryError < 1e-12);
const scale = maxAbs(element.matrix);
const rigidEnergyRatio = Math.max(...rigidModes(nodes).map((mode) => Math.abs(quadraticEnergy(element.matrix, mode)) / Math.max(1, scale)));
assert.ok(rigidEnergyRatio < 1e-8, `SH-C01 rigid energy ${rigidEnergyRatio}`);
assert.ok(element.diagnostics.spuriousEnergyRatio < 1e-4);

const warned = buildFlatShellAllmanDkq({ nodes: nodes.map((node, i) => ({ ...node, z: i === 2 ? 0.03 : 0 })), material: { E: 30e9, nu: 0.2 }, t: 0.2 }, { warpTol: 1e-2 });
assert.equal(warned.warp.status, 'warning');
const blocked = buildFlatShellAllmanDkq({ nodes: nodes.map((node, i) => ({ ...node, z: i === 2 ? 0.2 : 0 })), material: { E: 30e9, nu: 0.2 }, t: 0.2 }, { warpTol: 1e-2 });
assert.equal(blocked.ok, false);
assert.equal(blocked.reason, 'SHELL_WARP_EXCEEDS_LIMIT');

export const M9C_SNAPSHOT = Object.freeze({ version: 'p10-m9c-verification-v1', rigidEnergyRatio, symmetryError: element.diagnostics.symmetryError, spuriousEnergyRatio: element.diagnostics.spuriousEnergyRatio, warpedWarningRatio: warned.warp.ratio });
console.log(JSON.stringify({ ok: true, ...M9C_SNAPSHOT }, null, 2));
