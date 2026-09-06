import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createPhase15ProbeManifest,
  createPhase15ReferenceManifest,
  createPhase15ToleranceManifest,
  evaluatePhase15ManifestMetric,
  isApprovedPhase15ProbeManifest,
  isApprovedPhase15ReferenceManifest,
  isApprovedPhase15ToleranceManifest,
} from '../verification/framework/phase15/index.js';
import { HASH, phase15Manifests } from './helpers/phase15-fixtures.mjs';

const { reference, tolerance, probe } = phase15Manifests('SB10');
for (const path of [
  'verification/specs/phase15/reference-manifest-schema.json',
  'verification/specs/phase15/tolerance-manifest-schema.json',
  'verification/specs/phase15/probe-manifest-schema.json',
]) {
  const schema = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(schema.additionalProperties, false, path);
}
assert.equal(isApprovedPhase15ReferenceManifest(reference), true);
assert.equal(isApprovedPhase15ToleranceManifest(tolerance), true);
assert.equal(isApprovedPhase15ProbeManifest(probe), true);
assert.equal(tolerance.metrics[0].relativeTolerance, 0.001);
assert.equal(tolerance.metrics[0].metricType, 'signed');
const manifestMetric = evaluatePhase15ManifestMetric({
  metricId: 'tip',
  actual: -1.0005,
  referenceManifest: reference,
  toleranceManifest: tolerance,
  probeManifest: probe,
});
assert.equal(manifestMetric.status, 'PASS');
assert.equal(manifestMetric.referenceHash, reference.referenceHash);

const reordered = createPhase15ToleranceManifest({
  caseId: 'SB10',
  specVersion: 'fixture-v1',
  referenceHash: reference.referenceHash,
  metrics: [
    { id: 'z', unit: 'N', relativeTolerance: 0.001, rationale: 'signed z' },
    { id: 'a', unit: 'N', absoluteTolerance: 1, rationale: 'signed a' },
  ],
  frozenBeforeRun: true,
  rationale: 'order independent',
  approvedBy: 'reviewer',
  approvalHash: HASH.approval,
});
const reversed = createPhase15ToleranceManifest({
  caseId: 'SB10',
  specVersion: 'fixture-v1',
  referenceHash: reference.referenceHash,
  metrics: [...reordered.metrics].reverse(),
  frozenBeforeRun: true,
  rationale: 'order independent',
  approvedBy: 'reviewer',
  approvalHash: HASH.approval,
});
assert.equal(reordered.toleranceHash, reversed.toleranceHash);

assert.throws(() => createPhase15ToleranceManifest({
  caseId: 'BAD', specVersion: 'v1', referenceHash: reference.referenceHash, rationale: 'bad',
  metrics: [{ id: 'x', unit: 'N', tolerancePct: 0.1, rationale: 'percent is forbidden' }],
}), /fraction/);
assert.throws(() => createPhase15ToleranceManifest({
  caseId: 'BAD', specVersion: 'v1', referenceHash: reference.referenceHash, rationale: 'bad',
  metrics: [{ id: 'x', unit: 'N', relativeTolerance: 3, rationale: 'not a fraction' }],
}), /between 0 and 1/);
assert.throws(() => createPhase15ToleranceManifest({
  caseId: 'BAD', specVersion: 'v1', referenceHash: reference.referenceHash, rationale: 'bad',
  metrics: [{ id: 'x', unit: 'N', absoluteTolerance: Number.NaN, rationale: 'nonfinite' }],
}), /finite/);
assert.throws(() => createPhase15ReferenceManifest({ ...reference, values: [{ ...reference.values[0], value: Infinity }] }), /NaN or Infinity|finite/);
assert.throws(() => createPhase15ProbeManifest({
  caseId: 'BAD', specVersion: 'v1', referenceHash: reference.referenceHash,
  probes: [probe.probes[0], probe.probes[0]],
}), /duplicate/);

const tampered = structuredClone(reference);
tampered.values[0].value = 123;
assert.equal(isApprovedPhase15ReferenceManifest(tampered), false);
assert.equal(isApprovedPhase15ReferenceManifest({ ...reference, unboundNote: 'must be rejected' }), false);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P15-M1',
  referenceHash: reference.referenceHash,
  toleranceHash: tolerance.toleranceHash,
  probeHash: probe.probeHash,
  percentInputRejected: true,
  nonfiniteRejected: true,
}, null, 2));
