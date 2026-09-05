import assert from 'node:assert/strict';
import { runStrix21M7QualificationBatch } from '../verification/framework/benchmarks/strix21FirstBatch.js';

const artifact = runStrix21M7QualificationBatch();
assert.match(artifact.batchHash, /^[0-9a-f]{64}$/);
assert.equal(artifact.summary.attempted, 6);
assert.equal(artifact.summary.PASS, 4);
assert.equal(artifact.summary.BLOCKED, 2);
assert.equal(artifact.summary.REVIEW, 0);
assert.equal(artifact.summary.metricPassCount, artifact.summary.metricCount, 'published primary metrics remain preliminary numerical passes');

const byId = Object.fromEntries(artifact.cases.map((row) => [row.id, row]));
for (const id of ['SB1', 'SB8', 'SB9', 'SB10']) {
  const row = byId[id];
  assert.equal(row.status, 'PASS', id);
  assert.equal(row.audit.phase15Qualification.status, 'PASS', `${id} qualification`);
  assert.ok(row.audit.phase15MandatoryGates.length > 0, `${id} mandatory gates`);
  assert.ok(row.audit.phase15MandatoryGates.every((gate) => gate.status === 'PASS'), `${id} all mandatory gates`);
}

assert.deepEqual(byId.SB1.audit.meshSequence.map((row) => row.elements), [1, 2, 4, 8]);
assert.ok(byId.SB1.audit.phase15Qualification.audit.maximumEnergyResidual <= 1e-8);
assert.ok(byId.SB1.audit.phase15Qualification.audit.maximumEquilibriumResidual <= 1e-8);

assert.deepEqual(byId.SB8.audit.meshSequence.map((row) => row.elements), [32, 64, 128, 256]);
for (const level of byId.SB8.audit.meshSequence) {
  assert.equal(level.frequenciesHz.length, 6);
  assert.ok(level.maximumEigenResidual <= 1e-8, `${level.elements} residual`);
  assert.ok(level.minimumMac >= 0.99, `${level.elements} MAC`);
  assert.ok(level.generalizedMass.every((value) => Math.abs(value - 1) <= 1e-8), `${level.elements} mass normalization`);
  assert.ok(level.maximumMassOrthogonality <= 1e-8, `${level.elements} mass orthogonality`);
}

assert.deepEqual(byId.SB9.audit.componentSequence.map((row) => row.elements), [2, 4, 8]);
const componentHashes = byId.SB9.audit.componentSequence.flatMap((row) => Object.values(row.componentRuns).map((run) => run.calculationHash));
assert.equal(new Set(componentHashes).size, 9, 'every component/mesh run must have a distinct calculation hash');

assert.ok(byId.SB10.audit.phase15Qualification.audit.magnitudeMutationMetrics.every((metric) => metric.status === 'FAIL'));

assert.equal(byId.PD1.status, 'BLOCKED');
assert.equal(byId.PD1.audit.phase15Qualification.status, 'BLOCKED');
assert.deepEqual(byId.PD1.audit.phase15Qualification.reasonCodes, ['PD1_STAGE_WORK_BALANCE_NOT_EXPOSED']);
assert.equal(byId.PD1.audit.actualMeshLoadStepRuns.length, 9);
assert.ok(byId.PD1.audit.actualMeshLoadStepRuns.every((run) => run.converged));
assert.ok(byId.PD1.audit.actualMeshLoadStepRuns.every((run) => run.stages.every((stage) => stage.workBalanceResidual === null)));

assert.equal(byId.SM5.status, 'BLOCKED');
assert.equal(byId.SM5.audit.phase15Qualification.status, 'BLOCKED');
assert.deepEqual(byId.SM5.audit.phase15Qualification.reasonCodes, ['SM5_INDEPENDENT_REFERENCE_MODE_VECTORS_UNAVAILABLE']);
assert.ok(byId.SM5.audit.actualModalAudit.every((mode) => mode.eigenResidual <= 1e-8));
assert.ok(byId.SM5.audit.actualModalAudit.every((mode) => Math.abs(mode.generalizedMass - 1) <= 1e-8));
assert.equal(byId.SM5.audit.phase15Qualification.audit.independentReferenceModeVectorsAvailable, false);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P15-M7',
  batchHash: artifact.batchHash,
  qualified: artifact.cases.filter((row) => row.status === 'PASS').map((row) => row.id),
  blocked: artifact.cases.filter((row) => row.status === 'BLOCKED').map((row) => ({ id: row.id, reasonCodes: row.audit.phase15Qualification.reasonCodes })),
  actualSolveArtifacts: {
    sb1Levels: byId.SB1.audit.meshSequence.length,
    sb8ModalSolves: byId.SB8.audit.meshSequence.length,
    sb9ComponentSolves: componentHashes.length,
    pd1MeshLoadStepRuns: byId.PD1.audit.actualMeshLoadStepRuns.length,
    sm5ModesAudited: byId.SM5.audit.actualModalAudit.length,
  },
}, null, 2));
