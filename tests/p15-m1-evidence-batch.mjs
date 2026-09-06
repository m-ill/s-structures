import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createPhase15CalculationRecord,
  createPhase15EvidenceArtifact,
  createPhase15EvidenceBatch,
  createPhase15MandatoryGate,
  evaluatePhase15ManifestMetric,
  validatePhase15EvidenceBatch,
} from '../verification/framework/phase15/index.js';
import { HASH, phase15Binding, phase15Manifests } from './helpers/phase15-fixtures.mjs';

const sb1 = artifact('SB1');
const batchSchema = JSON.parse(readFileSync('verification/specs/phase15/evidence-batch-schema.json', 'utf8'));
assert.equal(batchSchema.additionalProperties, false);
const sb10 = artifact('SB10');
const first = batchAt('2026-08-27T00:00:00.000Z', [sb10, sb1]);
const later = batchAt('2026-08-27T01:00:00.000Z', [sb1, sb10]);
assert.equal(first.status, 'PASS');
assert.equal(first.attempted, 2);
assert.equal(first.statusCounts.PASS, 2);
assert.deepEqual(first.cases.map((row) => row.caseId), ['SB1', 'SB10']);
assert.deepEqual(validatePhase15EvidenceBatch(first), { ok: true, errors: [] });
assert.equal(first.batchCalculationHash, later.batchCalculationHash);
assert.equal(first.batchResultHash, later.batchResultHash);
assert.notEqual(first.run.batchRunRecordHash, later.run.batchRunRecordHash);

const malformed = structuredClone(sb1);
malformed.result.payload.value = Number.NaN;
const isolated = batchAt('2026-08-27T02:00:00.000Z', [malformed, sb10]);
assert.equal(isolated.status, 'FAIL');
assert.equal(isolated.cases.find((row) => row.caseId === 'SB1').status, 'FAIL');
assert.equal(isolated.cases.find((row) => row.caseId === 'SB10').status, 'PASS');

const duplicate = batchAt('2026-08-27T03:00:00.000Z', [sb1, sb1]);
assert.equal(duplicate.status, 'FAIL');
assert.equal(duplicate.cases.every((row) => row.errors.some((error) => error.includes('duplicate-case'))), true);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P15-M1',
  caseIsolation: true,
  duplicateCaseRejected: true,
  batchCalculationHash: first.batchCalculationHash,
  batchResultHash: first.batchResultHash,
}, null, 2));

function artifact(caseId) {
  const manifests = phase15Manifests(caseId);
  const binding = phase15Binding(manifests);
  const calculation = createPhase15CalculationRecord({ caseId, specVersion: 'fixture-v1', claimScope: 'fixture', binding });
  const metric = evaluatePhase15ManifestMetric({
    metricId: 'tip',
    actual: -1,
    referenceManifest: manifests.reference,
    toleranceManifest: manifests.tolerance,
    probeManifest: manifests.probe,
  });
  const gate = createPhase15MandatoryGate({ id: 'equilibrium', status: 'PASS', reasonCode: 'OK' });
  return createPhase15EvidenceArtifact({
    calculation,
    executionStatus: 'PASS',
    result: {
      payload: { value: -1 },
      solverDiagnostics: { trueResidual: 0 },
      audits: { equilibriumResidual: 0 },
      convergenceHistory: [{ level: 1, value: -1 }],
    },
    metrics: [metric],
    mandatoryGates: [gate],
    reviews: [{ id: 'review', role: 'verification', reviewer: 'reviewer', status: 'APPROVED', approvalHash: HASH.approval }],
    run: {
      startedAt: '2026-08-27T00:00:00.000Z',
      completedAt: '2026-08-27T00:00:01.000Z',
      environment: { node: 'v22.0.0' },
    },
  });
}

function batchAt(startedAt, artifacts) {
  return createPhase15EvidenceBatch({
    batchId: 'fixture-batch',
    artifacts,
    run: {
      startedAt,
      completedAt: new Date(Date.parse(startedAt) + 1000).toISOString(),
      environment: { node: 'v22.0.0' },
      runId: 'batch-run',
    },
  });
}
