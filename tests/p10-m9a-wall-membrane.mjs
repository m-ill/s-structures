import assert from 'node:assert/strict';
import { buildWallMembraneQm6, recoverWallMembraneQm6, resolveAnalysisCriteria, defaultAnalysisCriteria } from '../src/index.js';
import { stableHash } from '../src/core/stableHash.js';
import { wallCantileverBenchmark } from './helpers/p10Shell.mjs';

const nodes = [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }];
const input = { id: 'W1', nodes, material: { E: 30e9, nu: 0.2, density: 2400 }, t: 0.2 };
const element = buildWallMembraneQm6(input);
assert.equal(element.ok, true);
assert.equal(element.matrix.length, 24);
assert.equal(element.internalModeCount, 4);
assert.ok(element.diagnostics.symmetryError < 1e-12);

const strain = { ex: 1e-3, ey: 4e-4, gxy: 2e-4 };
const displacement = new Array(24).fill(0);
for (let i = 0; i < 4; i += 1) {
  displacement[i * 6] = strain.ex * nodes[i].x + strain.gxy * nodes[i].z / 2;
  displacement[i * 6 + 2] = strain.ey * nodes[i].z + strain.gxy * nodes[i].x / 2;
}
const recovered = recoverWallMembraneQm6(element, displacement);
assert.equal(recovered.ok, true);
const patchError = Math.max(relative(recovered.strain.ex, strain.ex), relative(recovered.strain.ey, strain.ey), relative(recovered.strain.gxy, strain.gxy));
assert.ok(patchError < 1e-10, `SH-A01 patch error ${patchError}`);

const cantilever = wallCantileverBenchmark();
assert.ok(cantilever.relativeError < 5e-2, `SH-A02 wall beam error ${cantilever.relativeError}`);
const criteria = resolveAnalysisCriteria(defaultAnalysisCriteria()).criteria.shell;
assert.equal(criteria.drillingAlpha, 1e-5);

export const M9A_SNAPSHOT = Object.freeze({ version: 'p10-m9a-verification-v1', patchError, cantilever, symmetryError: element.diagnostics.symmetryError, modelHash: stableHash(input).slice(0, 24) });
console.log(JSON.stringify({ ok: true, ...M9A_SNAPSHOT }, null, 2));
function relative(a, b) { return Math.abs(a - b) / Math.max(1e-30, Math.abs(b)); }
