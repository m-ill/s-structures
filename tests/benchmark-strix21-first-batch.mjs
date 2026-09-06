import assert from 'node:assert/strict';
import { runStrix21FirstBatch } from '../verification/framework/benchmarks/strix21FirstBatch.js';

const artifact = runStrix21FirstBatch();
assert.equal(artifact.externalRuntimeUsed, false);
assert.equal(artifact.summary.attempted, 12);
assert.equal(artifact.summary.PASS, 9);
assert.equal(artifact.summary.CUSTOM_PASS, 1);
assert.equal(artifact.summary.REVIEW, 0);
assert.equal(artifact.summary.BLOCKED, 2);
assert.equal(artifact.summary.metricPassCount, artifact.summary.metricCount);

for (const key of ['calculationHash', 'resultHash', 'runRecordHash', 'artifactHash']) assert.match(artifact[key], /^[0-9a-f]{64}$/, key);
assert.equal(artifact.artifactHash, artifact.resultHash, 'legacy artifactHash must be a deterministic result-hash alias');
assert.equal(artifact.runRecord.calculationHash, artifact.calculationHash);
assert.equal(artifact.runRecord.resultHash, artifact.resultHash);

const byId = Object.fromEntries(artifact.cases.map((row) => [row.id, row]));
for (const id of ['SB1', 'SB2', 'SB3', 'SB5', 'SB6', 'SB7', 'SB8', 'SB9', 'SB10']) {
  assert.equal(byId[id].status, 'PASS', id);
  assert.ok(byId[id].metrics.every((row) => row.passed), `${id} mandatory metrics`);
}
for (const id of ['PD1', 'SM5']) {
  assert.equal(byId[id].status, 'BLOCKED', id);
  assert.ok(byId[id].metrics.every((row) => row.passed), `${id} preliminary metrics`);
  assert.equal(byId[id].audit.phase15Qualification.status, 'BLOCKED');
}
assert.equal(byId['P3S2-SS'].status, 'CUSTOM_PASS');
assert.equal(byId['P3S2-SS'].audit.identicalToStrixP3S2, false);

assert.ok(byId.SB2.audit.finalRelativeChangePct <= 1.5);
assert.ok(Math.abs(byId.SB2.audit.sameMeshStrixErrorPct) <= 0.75);
assert.ok(byId.SB2.audit.meshSequence.every((row) => row.storage?.denseMatrixAllocated === false));
assert.ok(byId.SB3.audit.finalRelativeChangePct <= 0.5);
assert.ok(byId.SB5.audit.convergence.every((row) => row.finalRelativeChangePct <= 1));
assert.ok(byId.SB5.audit.sparseStorage.every((row) => row.denseMatrixAllocated === false));
assert.equal(byId.SB5.audit.factorizationReuse.solveCount, 24);
assert.equal(byId.SB5.audit.factorizationReuse.reusedSolveCount, 12);
assert.ok(byId.SB6.metrics.every((row) => Math.abs(row.errorVsReferencePct) <= 1));
assert.ok(byId.SB7.metrics.every((row) => Math.abs(row.errorVsReferencePct) <= 0.1));

const axial = byId.SB10.metrics.filter((row) => row.quantity.includes('axial'));
assert.ok(axial.every((row) => row.sStructures < 0 && row.reference < 0 && row.comparison === 'signed'));
for (const id of ['SB1', 'SB8', 'SB9', 'SB10']) {
  assert.equal(byId[id].audit.phase15Qualification.status, 'PASS', `${id} Phase 15 qualification`);
  assert.ok(byId[id].audit.phase15MandatoryGates.every((gate) => gate.status === 'PASS'), `${id} gates`);
}
assert.notEqual(byId.SB5.resultHash, byId.SB6.resultHash, 'different plate result payloads require distinct hashes');

console.log(JSON.stringify({
  ok: true,
  version: artifact.version,
  calculationHash: artifact.calculationHash,
  resultHash: artifact.resultHash,
  runRecordHash: artifact.runRecordHash,
  summary: artifact.summary,
}, null, 2));
