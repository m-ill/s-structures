import assert from 'node:assert/strict';
import {
  aggregatePhase15EvidenceStatus,
  createPhase15MandatoryGate,
  evaluatePhase15Metric,
} from '../verification/framework/phase15/index.js';

const MANIFEST_HASHES = {
  referenceHash: 'a'.repeat(64),
  toleranceHash: 'b'.repeat(64),
  probeHash: 'c'.repeat(64),
};

const base = {
  id: 'brace-e1',
  probeId: 'brace-end-i',
  quantity: 'brace axial force',
  unit: 'N',
  axis: 'member-local-x',
  signConvention: 'tension-positive',
  ...MANIFEST_HASHES,
  reference: 10_000,
  relativeTolerance: 0.001,
};
const signMutation = evaluatePhase15Metric({ ...base, actual: -10_000 });
assert.equal(signMutation.metricType, 'signed');
assert.equal(signMutation.passed, false);
assert.equal(signMutation.relativeError, 2);

assert.throws(() => evaluatePhase15Metric({ ...base, actual: -10_000, compareMagnitude: true }), /forbidden/);
assert.throws(() => evaluatePhase15Metric({ ...base, actual: -10_000, metricType: 'magnitude' }), /magnitudeMeaning/);
const explicitMagnitude = evaluatePhase15Metric({
  ...base,
  actual: -10_000,
  metricType: 'magnitude',
  magnitudeMeaning: 'unsigned modal combination envelope',
  approvedBy: 'domain-reviewer',
  magnitudeApprovalHash: 'd'.repeat(64),
});
assert.equal(explicitMagnitude.passed, true);

const zeroReference = evaluatePhase15Metric({
  ...base,
  id: 'zero',
  actual: 0.05,
  reference: 0,
  relativeTolerance: null,
  absoluteTolerance: 0.1,
  comparisonPolicy: 'absolute-only',
});
assert.equal(zeroReference.passed, true);
assert.equal(zeroReference.relativeError, null);

const passGate = createPhase15MandatoryGate({ id: 'eq', status: 'PASS', reasonCode: 'OK' });
const approvedReview = [{ id: 'r1', required: true, status: 'APPROVED' }];
assert.equal(aggregatePhase15EvidenceStatus({
  executionStatus: 'PASS', metrics: [signMutation], mandatoryGates: [passGate], reviews: approvedReview,
}).status, 'FAIL');
assert.equal(aggregatePhase15EvidenceStatus({
  executionStatus: 'PASS', metrics: [explicitMagnitude], mandatoryGates: [], reviews: approvedReview,
}).status, 'BLOCKED');
assert.equal(aggregatePhase15EvidenceStatus({
  executionStatus: 'NOT_RUN', metrics: [], mandatoryGates: [], reviews: [],
}).status, 'NOT_RUN');
for (const executionStatus of ['FAIL', 'BLOCKED', 'NOT_RUN', 'PARTIAL', 'TIMEOUT', 'ERROR', 'INVALIDATED', 'SELF_TEST']) {
  const verdict = aggregatePhase15EvidenceStatus({
    executionStatus,
    metrics: [explicitMagnitude],
    mandatoryGates: [passGate],
    reviews: approvedReview,
  });
  assert.notEqual(verdict.status, 'PASS', executionStatus);
}
assert.equal(aggregatePhase15EvidenceStatus({
  executionStatus: 'NOT_APPLICABLE', metrics: [], mandatoryGates: [], reviews: [],
}).status, 'BLOCKED');
const notApplicableGate = createPhase15MandatoryGate({ id: 'scope', status: 'PASS', reasonCode: 'OUT_OF_SCOPE', details: 'Approved technical exclusion.' });
assert.equal(aggregatePhase15EvidenceStatus({
  executionStatus: 'NOT_APPLICABLE', metrics: [], mandatoryGates: [notApplicableGate], reviews: approvedReview,
}).status, 'NOT_APPLICABLE');

console.log(JSON.stringify({
  ok: true,
  milestone: 'P15-M1',
  signedMutationKilled: true,
  implicitMagnitudeRejected: true,
  explicitMagnitudeTypeSupported: true,
}, null, 2));
