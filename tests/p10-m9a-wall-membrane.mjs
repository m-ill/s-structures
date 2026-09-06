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
assert.equal(element.elementFormulation, 'QM6-EAS');
assert.equal(element.qualification.status, 'pass');
assert.equal(element.designEligibility.allowed, false);
assert.deepEqual(element.designEligibility.reasonCodes, ['SHELL_MODEL_MESH_CONVERGENCE_REQUIRED']);
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
assert.equal(criteria.drillingStiffnessRatioMax, 1e-4);

for (const drillingAlpha of [1e-300, 1e50]) {
  const outside = buildWallMembraneQm6({ ...input, drillingAlpha });
  assert.equal(outside.ok, true);
  assert.equal(outside.qualification.status, 'blocked');
  assert.equal(outside.qualification.reason, 'SHELL_DRILLING_ALPHA_OUTSIDE_QUALIFIED_RANGE');
  assert.equal(outside.designEligibility.allowed, false);
}
assert.equal(buildWallMembraneQm6({ ...input, material: { ...input.material, E: 0 } }).reason, 'SHELL_MATERIAL_E_INVALID');
assert.equal(buildWallMembraneQm6({ ...input, material: { ...input.material, nu: 0.5 } }).reason, 'SHELL_MATERIAL_NU_INVALID');
assert.equal(buildWallMembraneQm6({ ...input, t: -1 }).reason, 'SHELL_THICKNESS_INVALID');
assert.equal(buildWallMembraneQm6({ ...input, t: undefined }).reason, 'SHELL_THICKNESS_INVALID');
assert.equal(buildWallMembraneQm6({ ...input, material: { ...input.material, E: true } }).reason, 'SHELL_MATERIAL_E_INVALID');
assert.equal(buildWallMembraneQm6({ ...input, material: { ...input.material, E: [] } }).reason, 'SHELL_MATERIAL_E_INVALID');
assert.equal(buildWallMembraneQm6({ ...input, nodes: nodes.map((node, index) => ({ ...node, x: index === 1 ? true : node.x })) }).reason, 'SHELL_NODE_COORDINATE_INVALID');
const invalidRatioLimit = buildWallMembraneQm6({ ...input, drillingStiffnessRatioMax: true });
assert.equal(invalidRatioLimit.qualification.status, 'blocked');
assert.equal(invalidRatioLimit.qualification.reason, 'SHELL_DRILLING_STIFFNESS_RATIO_LIMIT_INVALID');

assert.equal(recoverWallMembraneQm6(element, new Array(24).fill(true)).reason, 'SHELL_DISPLACEMENT_VECTOR_INVALID');
const overflowRecovery = new Array(24).fill(0);
overflowRecovery[0] = Number.MAX_VALUE;
assert.equal(recoverWallMembraneQm6(element, overflowRecovery).reason, 'SHELL_RECOVERY_NONFINITE');

const scaledDrillingRatios = [0.01, 0.1, 1, 10, 100].map((length) => {
  const scaled = nodes.map((node) => ({ ...node, x: node.x * length / 2, z: node.z * length }));
  return buildWallMembraneQm6({ ...input, nodes: scaled }).drilling.stiffnessRatio;
});
const drillingScaleSpread = Math.max(...scaledDrillingRatios) / Math.min(...scaledDrillingRatios);
assert.ok(drillingScaleSpread < 1.000001, `dimensionless drilling ratio scale spread ${drillingScaleSpread}`);
const drillingInvariantRatios = [
  buildWallMembraneQm6(input).drilling.stiffnessRatio,
  buildWallMembraneQm6({ ...input, material: { ...input.material, E: 3e6 } }).drilling.stiffnessRatio,
  buildWallMembraneQm6({ ...input, nodes: nodes.map((node) => ({ x: node.x, y: node.z, z: 0 })) }).drilling.stiffnessRatio,
];
assert.ok(Math.max(...drillingInvariantRatios) / Math.min(...drillingInvariantRatios) < 1.000001);

function rhombus(angleDegrees) {
  const angle = angleDegrees * Math.PI / 180;
  return [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1 + Math.cos(angle), y: 0, z: Math.sin(angle) },
    { x: Math.cos(angle), y: 0, z: Math.sin(angle) },
  ];
}
const moderateSkew = buildWallMembraneQm6({ ...input, nodes: rhombus(30) });
assert.equal(moderateSkew.qualification.status, 'pass');
const extremeSkew = buildWallMembraneQm6({ ...input, nodes: rhombus(5) });
assert.equal(extremeSkew.qualification.status, 'blocked');
assert.ok(extremeSkew.designEligibility.reasonCodes.includes('SHELL_ELEMENT_JACOBIAN_CONDITION_OUTSIDE_QUALIFIED_RANGE'));
const warpedMembrane = buildWallMembraneQm6({
  ...input,
  nodes: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0.2 }, { x: 0, y: 1, z: 0 }],
});
assert.equal(warpedMembrane.qualification.status, 'blocked');
assert.ok(warpedMembrane.designEligibility.reasonCodes.includes('SHELL_WARP_EXCEEDS_QUALIFIED_LIMIT'));

export const M9A_SNAPSHOT = Object.freeze({ version: 'p10-m9a-verification-v2-hard-qualified-scope', patchError, cantilever, symmetryError: element.diagnostics.symmetryError, drillingScaleSpread, modelHash: stableHash(input).slice(0, 24) });
console.log(JSON.stringify({ ok: true, ...M9A_SNAPSHOT }, null, 2));
function relative(a, b) { return Math.abs(a - b) / Math.max(1e-30, Math.abs(b)); }
