import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  auditPhase15EvidenceFreshness,
  createPhase15CalculationRecord,
  createPhase15EvidenceArtifact,
  createPhase15MandatoryGate,
  evaluatePhase15Metric,
  invalidatePhase15Evidence,
  validatePhase15EvidenceArtifact,
} from '../verification/framework/phase15/index.js';
import { HASH, phase15Binding, phase15Manifests } from './helpers/phase15-fixtures.mjs';

const manifests = phase15Manifests('SB10');
const evidenceSchema = JSON.parse(readFileSync('verification/specs/phase15/evidence-schema.json', 'utf8'));
assert.equal(evidenceSchema.properties.version.const, 'p15-evidence-artifact-v1');
assert.equal(evidenceSchema.additionalProperties, false);
const binding = phase15Binding(manifests);
const calculation = createPhase15CalculationRecord({
  caseId: 'SB10',
  specVersion: 'fixture-v1',
  claimScope: 'signed brace response',
  binding,
});
const metric = evaluatePhase15Metric({
  id: 'brace-e1',
  probeId: 'tip',
  quantity: 'brace axial force',
  unit: 'N',
  axis: 'member-local-x',
  signConvention: 'tension-positive',
  referenceHash: binding.referenceHash,
  toleranceHash: binding.toleranceHash,
  probeHash: binding.probeHash,
  actual: 10_000.5,
  reference: 10_000,
  relativeTolerance: 0.001,
});
const gate = createPhase15MandatoryGate({ id: 'equilibrium', status: 'PASS', reasonCode: 'TRUE_RESIDUAL_OK' });
const reviews = [{
  id: 'numerical-review',
  role: 'numerical',
  reviewer: 'independent-reviewer',
  status: 'APPROVED',
  required: true,
  approvalHash: HASH.approval,
}];

const first = evidenceAt('2026-08-27T00:00:00.000Z');
const later = evidenceAt('2026-08-27T01:00:00.000Z');
const third = evidenceAt('2026-08-27T02:00:00.000Z');
assert.equal(first.status, 'PASS');
assert.deepEqual(validatePhase15EvidenceArtifact(first), { ok: true, errors: [] });
assert.equal(first.calculation.calculationHash, later.calculation.calculationHash);
assert.equal(first.result.resultHash, later.result.resultHash);
assert.equal(new Set([first, later, third].map((row) => row.calculation.calculationHash)).size, 1);
assert.equal(new Set([first, later, third].map((row) => row.result.resultHash)).size, 1);
assert.notEqual(first.run.runRecordHash, later.run.runRecordHash);
assert.notEqual(first.evidenceHash, later.evidenceHash);

const otherEnvironment = createPhase15EvidenceArtifact({
  ...baseEvidenceInput(),
  result: resultInput(),
  run: { ...runInput('2026-08-27T00:00:00.000Z'), environment: { node: 'v22.0.0', platform: 'linux', arch: 'arm64' } },
});
assert.equal(otherEnvironment.calculation.calculationHash, first.calculation.calculationHash);
assert.equal(otherEnvironment.result.resultHash, first.result.resultHash);
assert.notEqual(otherEnvironment.run.runRecordHash, first.run.runRecordHash);

const changedResult = createPhase15EvidenceArtifact({
  ...baseEvidenceInput(),
  result: resultInput(10_001),
  run: runInput('2026-08-27T02:00:00.000Z'),
});
assert.equal(changedResult.calculation.calculationHash, first.calculation.calculationHash);
assert.notEqual(changedResult.result.resultHash, first.result.resultHash);

for (const field of ['sourceHash', 'buildHash', 'modelHash', 'inputHash', 'solverSettingsHash', 'referenceHash', 'toleranceHash', 'probeHash']) {
  const current = { ...binding, [field]: '9'.repeat(64) };
  const freshness = auditPhase15EvidenceFreshness(first, current);
  assert.equal(freshness.status, 'INVALIDATED', field);
  assert.equal(freshness.reasons.length, 1, field);
  const changedCalculation = createPhase15CalculationRecord({
    caseId: 'SB10', specVersion: 'fixture-v1', claimScope: 'signed brace response', binding: current,
  });
  assert.notEqual(changedCalculation.calculationHash, calculation.calculationHash, field);
}
const invalidated = invalidatePhase15Evidence(first, { ...binding, modelHash: '9'.repeat(64) });
assert.equal(invalidated.status, 'INVALIDATED');
assert.equal(invalidated.releaseAllowed, false);
assert.equal(validatePhase15EvidenceArtifact(invalidated).ok, true);

const failedGate = createPhase15MandatoryGate({ id: 'equilibrium', status: 'FAIL', reasonCode: 'TRUE_RESIDUAL_HIGH' });
const failed = createPhase15EvidenceArtifact({ ...baseEvidenceInput(), mandatoryGates: [failedGate], result: resultInput(), run: runInput('2026-08-27T03:00:00.000Z') });
assert.equal(failed.status, 'FAIL');
const unreviewed = createPhase15EvidenceArtifact({ ...baseEvidenceInput(), reviews: [], result: resultInput(), run: runInput('2026-08-27T04:00:00.000Z') });
assert.equal(unreviewed.status, 'BLOCKED');
const partial = createPhase15EvidenceArtifact({ ...baseEvidenceInput(), executionStatus: 'PARTIAL', result: resultInput(), run: runInput('2026-08-27T05:00:00.000Z') });
assert.equal(partial.status, 'FAIL');

assert.throws(() => createPhase15EvidenceArtifact({ ...baseEvidenceInput(), result: null, run: runInput('2026-08-27T06:00:00.000Z') }), /non-null result/);
assert.throws(() => createPhase15EvidenceArtifact({ ...baseEvidenceInput(), result: resultInput(Number.NaN), run: runInput('2026-08-27T06:00:00.000Z') }), /NaN or Infinity/);
assert.throws(() => createPhase15EvidenceArtifact({ ...baseEvidenceInput(), metrics: [metric, metric], result: resultInput(), run: runInput('2026-08-27T06:00:00.000Z') }), /duplicate/i);

const tampered = structuredClone(first);
tampered.result.payload.force = 999;
assert.equal(validatePhase15EvidenceArtifact(tampered).ok, false);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P15-M1',
  calculationHash: first.calculation.calculationHash,
  resultHash: first.result.resultHash,
  timestampOnlyRunHashChanged: true,
  staleMutationsDetected: 8,
  failClosedStatuses: ['FAIL', 'BLOCKED', 'INVALIDATED'],
}, null, 2));

function evidenceAt(timestamp) {
  return createPhase15EvidenceArtifact({
    ...baseEvidenceInput(),
    result: resultInput(),
    run: runInput(timestamp),
  });
}

function baseEvidenceInput() {
  return {
    calculation,
    executionStatus: 'PASS',
    metrics: [metric],
    mandatoryGates: [gate],
    reviews,
  };
}

function resultInput(force = 10_000.5) {
  return {
    payload: { force, displacement: -0.25 },
    solverDiagnostics: { backend: 'dense-spd', trueResidual: 1e-12 },
    audits: { equilibriumResidual: 1e-12, energyResidual: 1e-13 },
    convergenceHistory: [{ level: 1, force }],
  };
}

function runInput(startedAt) {
  return {
    startedAt,
    completedAt: new Date(Date.parse(startedAt) + 1000).toISOString(),
    environment: { node: 'v22.0.0', platform: 'win32', arch: 'x64' },
    runId: 'fixture-run',
  };
}
