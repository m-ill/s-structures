import assert from 'node:assert/strict';
import {
  assessMembraneDistortion,
  buildMembraneEnergyTrace,
  createCookMembraneMesh,
  normalizeMembraneResponse,
} from '../src/solver/shell/membraneRobustness.js';
import { compareMembraneMeshLevels, probeMembraneStress, recoverMembraneField } from '../src/solver/shell/membraneWorkflow.js';

const properties = { E: 30e6, nu: 0.25, t: 1, density: 0 };
const coarse = createCookMembraneMesh({ nx: 2, ny: 2, level: 1 });
const fine = createCookMembraneMesh({ nx: 4, ny: 4, level: 2, parentMeshHash: coarse.meshHash });
assert.equal(fine.lineage.parentMeshHash, coarse.meshHash);
const coarseAssessment = assessMembraneDistortion(coarse);
const fineAssessment = assessMembraneDistortion(fine);
assert.equal(coarseAssessment.status, 'WARNING');
assert.ok(coarseAssessment.warnings.includes('SHELL_DISTORTION_ASPECT_WARNING'));
assert.equal(fineAssessment.falseGreenGuardPassed, true);

const displacement = affine(coarse, 1e-4, 2e-4, 5e-5);
const field = recoverMembraneField(coarse, displacement, properties);
const midpoint = probeMembraneStress(coarse, field, { id: 'MID', point: { x: 48, y: 0, z: 52 } });
assert.ok(Object.values(midpoint.stress).every(Number.isFinite));
const energy = buildMembraneEnergyTrace(coarse, displacement, properties);
assert.ok(energy.totals.condensedMembrane > 0);
assert.ok(energy.totals.enhancedReduction >= 0);
assert.ok(energy.totals.drillingRatio < 1e-12);
assert.equal(energy.qualification.passed, true);

const rotated = createCookMembraneMesh({ nx: 2, ny: 2, transform: { kind: 'rotate', angle: Math.PI / 3 } });
const reflected = createCookMembraneMesh({ nx: 2, ny: 2, transform: { kind: 'reflect' } });
const rotatedEnergy = buildMembraneEnergyTrace(rotated, affineInLocalMap(rotated, 1e-4, 2e-4, 5e-5), properties);
const reflectedEnergy = buildMembraneEnergyTrace(reflected, affineInLocalMap(reflected, 1e-4, 2e-4, 5e-5), properties);
close(rotatedEnergy.totals.total, energy.totals.total, energy.totals.total * 1e-10, 'rotation energy invariance');
close(reflectedEnergy.totals.total, energy.totals.total, energy.totals.total * 1e-10, 'reflection energy invariance');

const strict = assessMembraneDistortion(coarse, { blockAspect: 1.01, warningAspect: 1.001 });
assert.equal(strict.status, 'BLOCKED');
assert.ok(strict.blockers.includes('SHELL_DISTORTION_ASPECT_BLOCK'));
assert.throws(
  () => createCookMembraneMesh({ nx: 2, ny: 2, rightBottom: 60, rightTop: 16 }),
  (error) => error.code === 'COOK_GEOMETRY_INVALID',
);

const normalized = normalizeMembraneResponse(0.1, { force: 10, E: 200, thickness: 0.5, length: 2 });
close(normalized.value, 0.5, 1e-12, 'dimensionless response');
const convergence = compareMembraneMeshLevels([
  { meshHash: coarse.meshHash, level: 1, elementCount: coarse.elements.length, quantity: 1 },
  { meshHash: fine.meshHash, level: 2, elementCount: fine.elements.length, quantity: 0.96 },
  { meshHash: 'L3', level: 3, elementCount: 64, quantity: 0.955 },
], { tolerance: 0.01 });
assert.equal(convergence.converged, true);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P14-M6',
  coarseAssessment: coarseAssessment.status,
  energyHash: energy.energyHash,
  drillingEnergyRatio: energy.totals.drillingRatio,
  midpointStress: midpoint.stress,
}, null, 2));

function affine(mesh, ex, ez, gxz) {
  return Object.fromEntries(mesh.nodes.map((node) => [node.id, [ex * node.x + gxz * node.z / 2, 0, ez * node.z + gxz * node.x / 2, 0, 0, 0]]));
}
function affineInLocalMap(mesh, ex, ey, gxy) {
  const origin = mesh.nodes[0];
  const a = mesh.nodes.find((node) => node.i === 1 && node.j === 0);
  const exAxis = unit([a.x - origin.x, a.y - origin.y, a.z - origin.z]);
  const normal = unit(cross(exAxis, [mesh.nodes.find((node) => node.i === 0 && node.j === 1).x - origin.x, mesh.nodes.find((node) => node.i === 0 && node.j === 1).y - origin.y, mesh.nodes.find((node) => node.i === 0 && node.j === 1).z - origin.z]));
  const eyAxis = cross(normal, exAxis);
  return Object.fromEntries(mesh.nodes.map((node) => {
    const r = [node.x - origin.x, node.y - origin.y, node.z - origin.z];
    const x = dot(r, exAxis); const y = dot(r, eyAxis);
    const ux = ex * x + gxy * y / 2; const uy = ey * y + gxy * x / 2;
    return [node.id, [exAxis[0] * ux + eyAxis[0] * uy, exAxis[1] * ux + eyAxis[1] * uy, exAxis[2] * ux + eyAxis[2] * uy, 0, 0, 0]];
  }));
}
function unit(v) { const n = Math.hypot(...v); return v.map((x) => x / n); }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a.reduce((sum, value, index) => sum + value * b[index], 0); }
function close(actual, expected, tolerance, label) { assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`); }
