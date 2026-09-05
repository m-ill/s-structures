import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDetailedReportData, buildMembraneWorkflowReport, createDetailedHtmlReport, createModel } from '../src/index.js';
import {
  buildConsistentMembraneEdgeTraction,
  compareMembraneMeshLevels,
  createStructuredQuadMesh,
  probeMembraneStress,
  recoverMembraneField,
} from '../src/solver/shell/membraneWorkflow.js';
import { planeStressMatrix } from '../src/solver/shell/shellElementMath.js';

const properties = { E: 30e9, nu: 0.2, t: 0.2, density: 0, stressUnit: 'Pa' };
const strain = { ex: 1e-3, ey: 4e-4, gxy: 2e-4 };
const expectedStress = multiply(planeStressMatrix(properties.E, properties.nu), [strain.ex, strain.ey, strain.gxy]);
const mesh = createStructuredQuadMesh({
  id: 'PATCH-L1', familyId: 'PATCH', level: 1, nx: 2, ny: 2,
  corners: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }],
});
assert.equal(mesh.elements.length, 4);
assert.equal(mesh.geometry.chordError, 0);
assert.ok(mesh.geometry.minDetJ > 0);

const displacement = affineDisplacements(mesh, 1);
const field = recoverMembraneField(mesh, displacement, properties);
assert.equal(field.integrationPoints.length, 16);
for (const row of field.integrationPoints) {
  close(row.sx, expectedStress[0], 1e-7 * expectedStress[0], 'constant sx patch');
  close(row.sy, expectedStress[1], 1e-7 * expectedStress[1], 'constant sy patch');
  close(row.txy, expectedStress[2], 1e-7 * expectedStress[2], 'constant txy patch');
}
for (const row of field.averagedNodes) close(row.sx, expectedStress[0], 1e-7 * expectedStress[0], 'averaged sx patch');

const probe = probeMembraneStress(mesh, field, { id: 'P', point: { x: 1, y: 0, z: 0.5 } });
close(probe.stress.sx, expectedStress[0], 1e-7 * expectedStress[0], 'point probe sx');
assert.ok(Math.abs(probe.xi) <= 1 && Math.abs(probe.eta) <= 1);

const scaledMesh = createStructuredQuadMesh({
  id: 'PATCH-MM', nx: 2, ny: 2,
  corners: [{ x: 0, y: 0, z: 0 }, { x: 2000, y: 0, z: 0 }, { x: 2000, y: 0, z: 1000 }, { x: 0, y: 0, z: 1000 }],
});
const scaledField = recoverMembraneField(scaledMesh, affineDisplacements(scaledMesh, 1), properties);
close(scaledField.integrationPoints[0].sx, field.integrationPoints[0].sx, 1e-7 * expectedStress[0], 'length-unit invariant stress');

const reordered = JSON.parse(JSON.stringify(mesh));
reordered.elements.reverse();
const reorderedField = recoverMembraneField(reordered, displacement, properties);
const stressById = Object.fromEntries(field.integrationPoints.map((row) => [`${row.elementId}:${row.xi}:${row.eta}`, row.sx]));
for (const row of reorderedField.integrationPoints) close(row.sx, stressById[`${row.elementId}:${row.xi}:${row.eta}`], 1e-4, 'element-order invariant stress');

const rigidDisplacement = Object.fromEntries(mesh.nodes.map((node) => [node.id, [-0.01 * node.z, 0, 0.01 * node.x, 0, 0.01, 0]]));
const rigidField = recoverMembraneField(mesh, rigidDisplacement, properties);
assert.ok(Math.max(...rigidField.integrationPoints.flatMap((row) => [Math.abs(row.sx), Math.abs(row.sy), Math.abs(row.txy)])) < 1e-5);

const traction = buildConsistentMembraneEdgeTraction(mesh, { edge: 'u1', traction: [100, 0, 0], thickness: properties.t });
close(traction.length, 1, 1e-12, 'edge length');
close(traction.resultant[0], 20, 1e-12, 'edge resultant');
close(traction.equilibriumResidual, 0, 1e-12, 'edge equilibrium');
close(Object.values(traction.nodalLoads).reduce((sum, row) => sum + row[0], 0), 20, 1e-12, 'nodal resultant');

const curved1 = createStructuredQuadMesh({ id: 'CURVE-1', nx: 2, ny: 1, mapPoint: curvedPoint });
const curved2 = createStructuredQuadMesh({ id: 'CURVE-2', nx: 4, ny: 2, mapPoint: curvedPoint, parentMeshHash: curved1.meshHash, level: 2 });
assert.ok(curved1.geometry.chordError > 0);
assert.ok(curved2.geometry.chordError < curved1.geometry.chordError);
assert.equal(curved2.lineage.parentMeshHash, curved1.meshHash);

assert.throws(
  () => createStructuredQuadMesh({ nx: 1, ny: 1, corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] }),
  (error) => error.code === 'SHELL_JACOBIAN_NONPOSITIVE',
);
assert.throws(
  () => probeMembraneStress(mesh, field, { point: { x: 100, y: 0, z: 100 } }),
  (error) => error.code === 'SHELL_PROBE_OUTSIDE_MESH',
);

const comparison = compareMembraneMeshLevels([
  { meshHash: 'a', level: 1, elementCount: 4, quantity: 100, probeHash: 'p1' },
  { meshHash: 'b', level: 2, elementCount: 16, quantity: 98, probeHash: 'p2' },
  { meshHash: 'c', level: 3, elementCount: 64, quantity: 97.8, probeHash: 'p3' },
], { tolerance: 0.01 });
assert.equal(comparison.convergenceAvailable, true);
assert.equal(comparison.converged, true);
assert.equal(comparison.benchmarkExecuted, false);

const workflowReport = buildMembraneWorkflowReport({ mesh, field, probes: [probe], loads: [traction], comparison });
assert.equal(workflowReport.available, true);
assert.equal(workflowReport.designTransferAllowed, false);
assert.equal(workflowReport.probes[0].probeHash, probe.probeHash);
const reportModel = createModel();
reportModel.nodes = [{ id: 'R1', x: 0, y: 0, z: 0, support: 'fixed' }, { id: 'R2', x: 0, y: 0, z: 3, support: null }];
reportModel.members = [{ id: 'RM', n1: 'R1', n2: 'R2', matId: 'RMAT', secId: 'RSEC', type: 'frame', releases: { i: 'rigid', j: 'rigid' } }];
reportModel.materials = [{ id: 'RMAT', E: 200e6, G: 80e6, Fy: 300e3, density: 0 }];
reportModel.sections = [{ id: 'RSEC', type: 'RECT', B: 0.3, H: 0.5, A: 0.15, Iy: 0.003125, Iz: 0.001125, J: 0.002 }];
const detailed = buildDetailedReportData(reportModel, {}, { membraneWorkflow: { mesh, field, probes: [probe], loads: [traction], comparison }, generatedAt: '2026-08-27T00:00:00.000Z' });
assert.equal(detailed.membraneWorkflow.available, true);
assert.match(createDetailedHtmlReport(reportModel, {}, { membraneWorkflow: { mesh, field, probes: [probe], loads: [traction], comparison } }).html, /Membrane Mesh and Stress Trace/);

const cliDirectory = await mkdtemp(join(tmpdir(), 'sstructures-p14-m5-'));
const cliInputPath = join(cliDirectory, 'workflow.json');
await writeFile(cliInputPath, JSON.stringify({
  mesh: { id: 'CLI', nx: 2, ny: 2, corners: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }] },
  displacements: displacement,
  properties,
  probes: [{ id: 'CLI-P', point: { x: 1, y: 0, z: 0.5 } }],
  edgeTractions: [{ edge: 'u1', traction: [100, 0, 0], thickness: properties.t }],
}), 'utf8');
const cli = JSON.parse(execFileSync(process.execPath, ['tools/sstructures-membrane.mjs', cliInputPath], { encoding: 'utf8' }));
assert.equal(cli.elementCount, 4);
assert.equal(cli.probeHashes.length, 1);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P14-M5',
  meshHash: mesh.meshHash,
  resultHash: field.resultHash,
  probeHash: probe.probeHash,
  curvedChordErrors: [curved1.geometry.chordError, curved2.geometry.chordError],
  tractionResultant: traction.resultant,
}, null, 2));

function affineDisplacements(targetMesh, coordinateScale) {
  return Object.fromEntries(targetMesh.nodes.map((node) => {
    const x = node.x / coordinateScale;
    const z = node.z / coordinateScale;
    const ux = (strain.ex * x + strain.gxy * z / 2) * coordinateScale;
    const uz = (strain.ey * z + strain.gxy * x / 2) * coordinateScale;
    return [node.id, [ux, 0, uz, 0, 0, 0]];
  }));
}
function curvedPoint(u, v) { return { x: 2 * u, y: 0.2 * u * (1 - u), z: v }; }
function multiply(matrix, vector) { return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0)); }
function close(actual, expected, tolerance, label) { assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`); }
