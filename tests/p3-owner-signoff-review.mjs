import assert from 'node:assert/strict';
import {
  buildAgentManifest,
  buildPhase3OwnerSignoffReview,
  PHASE3_OWNER_SIGNOFF_REVIEW_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const empty = buildPhase3OwnerSignoffReview();
assert.equal(empty.version, PHASE3_OWNER_SIGNOFF_REVIEW_VERSION);
assert.equal(empty.milestone, 'P3-M20');
assert.equal(empty.summary.requiredCount, 7);
assert.equal(empty.summary.acceptedCount, 0);
assert.deepEqual(empty.summary.missing, [
  'license-policy',
  'deployment-target',
  'real-dwg-conversion',
  'real-pointcloud-validation',
  'field-pilot-feedback',
  'backup-restore',
  'security-signoff',
]);
assert.equal(empty.summary.ownerReviewRequired, true);
assert.equal(empty.summary.productionReady, false);
assert.equal(empty.summary.productionDeploymentApproved, false);
assert.equal(empty.summary.agentDecision, 'collect-owner-signoff-evidence');
assert.ok(empty.requiredEvidence.find((row) => row.id === 'real-dwg-conversion'));
assert.ok(empty.requiredEvidence.find((row) => row.id === 'security-signoff'));
assert.equal(empty.agentUse.readApi, 'getPhase3OwnerSignoffReview');

const acceptedEvidence = empty.requiredEvidence.map((row) => ({
  id: row.id,
  accepted: true,
  owner: 'owner',
  recordedAt: '2026-07-03T00:00:00.000Z',
}));
const accepted = buildPhase3OwnerSignoffReview({ evidence: acceptedEvidence });
assert.equal(accepted.summary.acceptedCount, 7);
assert.deepEqual(accepted.summary.missing, []);
assert.equal(accepted.summary.agentDecision, 'owner-signoff-ready-for-final-deployment-decision');
assert.equal(accepted.summary.productionReady, false);
assert.equal(accepted.summary.productionDeploymentApproved, false);
assert.ok(accepted.rows.every((row) => row.status === 'ACCEPTED'));

const deploymentApproved = buildPhase3OwnerSignoffReview({
  evidence: acceptedEvidence,
  finalApprovals: { productionDeploymentApproved: true },
});
assert.equal(deploymentApproved.summary.productionReady, true);
assert.equal(deploymentApproved.summary.ownerReviewRequired, false);
assert.equal(deploymentApproved.summary.productionDeploymentApproved, true);
assert.equal(deploymentApproved.summary.agentDecision, 'owner-production-deployment-approved');

const registerKeyEvidence = [
  { id: 'owner-license-policy', accepted: true, owner: 'owner' },
  { id: 'deployment-target-selection', accepted: true, owner: 'owner' },
  { id: 'external-dwg-converter-log', accepted: true, owner: 'owner' },
  { id: 'real-scan-extraction-validation', accepted: true, owner: 'owner' },
  { id: 'field-pilot-feedback', accepted: true, owner: 'owner' },
  { id: 'backup-restore-rehearsal', accepted: true, owner: 'owner' },
  { id: 'security-signoff', accepted: true, owner: 'owner' },
];
const acceptedFromRegisterKeys = buildPhase3OwnerSignoffReview({ evidence: registerKeyEvidence });
assert.equal(acceptedFromRegisterKeys.summary.acceptedCount, 7);
assert.deepEqual(acceptedFromRegisterKeys.summary.missing, []);
assert.equal(acceptedFromRegisterKeys.rows.find((row) => row.id === 'license-policy').acceptedFrom, 'owner-license-policy');

const pointCloudFileOnly = buildPhase3OwnerSignoffReview({
  evidence: [{ id: 'real-pointcloud-files', accepted: true, owner: 'owner' }],
});
assert.ok(pointCloudFileOnly.summary.missing.includes('real-pointcloud-validation'));

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3OwnerSignoffReview, PHASE3_OWNER_SIGNOFF_REVIEW_VERSION);
assert.ok(manifest.readApis.includes('getPhase3OwnerSignoffReview'));
assert.ok(manifest.dataContracts.includes('phase3OwnerSignoffReview'));
assert.equal(manifest.qaCommands.phase3OwnerSignoffReview, 'node tests/p3-owner-signoff-review.mjs');

const agent = createIndexAgentApi({ model: () => null, reanalyze: () => {} });
assert.equal(agent.getPhase3OwnerSignoffReview().version, PHASE3_OWNER_SIGNOFF_REVIEW_VERSION);
assert.equal(agent.getPhase3OwnerSignoffReview({ evidence: acceptedEvidence }).summary.acceptedCount, 7);

console.log(JSON.stringify({
  ok: true,
  version: PHASE3_OWNER_SIGNOFF_REVIEW_VERSION,
  requiredCount: empty.summary.requiredCount,
  acceptedCount: accepted.summary.acceptedCount,
}, null, 2));
