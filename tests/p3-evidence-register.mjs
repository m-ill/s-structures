import assert from 'node:assert/strict';
import {
  buildAgentManifest,
  buildPhase3EvidenceRegister,
  buildPhase3FinalApprovalReview,
  buildPhase3FinalApprovals,
  PHASE3_EVIDENCE_REGISTER_VERSION,
  PHASE3_FINAL_APPROVAL_FIELDS,
  PHASE3_FINAL_APPROVAL_GROUPS,
  normalizeFinalApprovalField,
  validatePhase3EvidenceRecord,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const empty = buildPhase3EvidenceRegister();
assert.equal(empty.version, PHASE3_EVIDENCE_REGISTER_VERSION);
assert.equal(empty.summary.requiredCount, 25);
assert.equal(empty.summary.acceptedCount, 0);
assert.equal(empty.summary.evidenceComplete, false);
assert.equal(empty.summary.productionReady, false);
assert.equal(empty.summary.agentDecision, 'collect-phase3-evidence');
assert.ok(empty.summary.missing.includes('real-office-dxf-fixtures'));
assert.ok(empty.summary.missing.includes('real-pointcloud-files'));
assert.ok(empty.summary.missing.includes('office-grade-ks-catalog-policy'));
assert.ok(empty.summary.missing.includes('simultaneous-hinge-equilibrium-qualification'));
assert.ok(empty.summary.missing.includes('final-structural-signoff'));
assert.ok(empty.summary.missing.includes('nonlinear-solver-certification'));
assert.ok(empty.summary.missing.includes('security-signoff'));
assert.ok(empty.agentUse.relatedApis.includes('getPhase3OwnerSignoffReview'));

const evidence = [
  { id: 'real-office-dxf-fixtures', accepted: true, reviewer: 'engineer', fileId: 'file-1', reportPath: 'reports/import-validation/dxf.md' },
  { id: 'real-pointcloud-files', status: 'accepted', reviewer: 'owner', reportPath: 'reports/pointcloud-validation/scan.md' },
  { id: 'security-signoff', accepted: true, owner: 'owner', reportPath: 'reports/launch-readiness/security.md' },
];
const partial = buildPhase3EvidenceRegister({ evidence });
assert.equal(partial.summary.acceptedCount, 3);
assert.equal(partial.rows.find((row) => row.id === 'real-office-dxf-fixtures').status, 'ACCEPTED');
assert.equal(partial.rows.find((row) => row.id === 'real-office-dxf-fixtures').records[0].fileId, 'file-1');
assert.equal(partial.rows.find((row) => row.id === 'real-pointcloud-files').records[0].accepted, true);
assert.ok(partial.summary.missing.includes('external-dwg-converter-log'));

const full = buildPhase3EvidenceRegister({
  evidence: empty.rows.map((row) => ({ id: row.id, accepted: true })),
});
assert.equal(full.summary.acceptedCount, 25);
assert.deepEqual(full.summary.missing, []);
assert.equal(full.summary.evidenceComplete, true);
assert.equal(full.summary.agentDecision, 'phase3-evidence-ready-for-owner-and-engineer-review');
assert.equal(full.summary.productionReady, false);

assert.equal(validatePhase3EvidenceRecord({ id: 'security-signoff' }).ok, true);
assert.equal(validatePhase3EvidenceRecord({ id: 'final-structural-signoff' }).ok, true);
assert.equal(validatePhase3EvidenceRecord({ type: 'security sign-off' }).ok, true);
assert.equal(validatePhase3EvidenceRecord({ type: 'office-grade KS material and section catalog policy' }).ok, true);
const invalidRecord = validatePhase3EvidenceRecord({ id: 'not-in-phase3-plan' });
assert.equal(invalidRecord.ok, false);
assert.equal(invalidRecord.reason, 'unknown-phase3-evidence');
assert.ok(invalidRecord.allowedIds.includes('security-signoff'));

assert.ok(PHASE3_FINAL_APPROVAL_FIELDS.includes('finalStructuralSignoff'));
assert.ok(PHASE3_FINAL_APPROVAL_GROUPS.find((group) => group.id === 'production-deployment-approval').fields.includes('ownerProductionDeploymentApproved'));
assert.equal(normalizeFinalApprovalField('finalStructuralSignoff'), 'finalStructuralSignoff');
assert.equal(normalizeFinalApprovalField('notAllowed'), null);
assert.deepEqual(buildPhase3FinalApprovals([
  { id: 'final-structural-signoff', accepted: true, finalApprovalField: 'finalStructuralSignoff' },
]), {});
assert.deepEqual(buildPhase3FinalApprovals([
  { id: 'final-structural-signoff', accepted: true, approved: true, finalApprovalField: 'finalStructuralSignoff' },
  { id: 'security-signoff', accepted: true, finalApprovalAccepted: true, finalApprovalField: 'securitySignoffAccepted' },
]), {
  finalStructuralSignoff: true,
  securitySignoffAccepted: true,
});
const approvalReview = buildPhase3FinalApprovalReview({
  finalApprovals: {
    finalStructuralSignoff: true,
    securitySignoffAccepted: true,
    ownerProductionDeploymentApproved: true,
  },
});
assert.equal(approvalReview.allowedFields.length, PHASE3_FINAL_APPROVAL_FIELDS.length);
assert.equal(approvalReview.requiredCount, PHASE3_FINAL_APPROVAL_GROUPS.length);
assert.equal(approvalReview.acceptedCount, 3);
assert.equal(approvalReview.complete, false);
assert.ok(approvalReview.missing.includes('production-equilibrium-solver'));
assert.equal(approvalReview.rows.find((row) => row.id === 'final-structural-signoff').status, 'ACCEPTED');
assert.deepEqual(approvalReview.rows.find((row) => row.id === 'production-deployment-approval').acceptedFields, ['ownerProductionDeploymentApproved']);
assert.equal(approvalReview.allowedRows.find((row) => row.field === 'finalStructuralSignoff').status, 'ACCEPTED');

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3EvidenceRegister, PHASE3_EVIDENCE_REGISTER_VERSION);
assert.ok(manifest.readApis.includes('getPhase3EvidenceRegister'));
assert.ok(manifest.dataContracts.includes('phase3EvidenceRegister'));
assert.equal(manifest.qaCommands.phase3EvidenceRegister, 'node tests/p3-evidence-register.mjs');

const agent = createIndexAgentApi({ model: () => null, reanalyze: () => {} });
assert.equal(agent.getPhase3EvidenceRegister().version, PHASE3_EVIDENCE_REGISTER_VERSION);
assert.equal(agent.getPhase3EvidenceRegister({ evidence }).summary.acceptedCount, 3);

console.log(JSON.stringify({
  ok: true,
  version: PHASE3_EVIDENCE_REGISTER_VERSION,
  requiredCount: empty.summary.requiredCount,
  partialAccepted: partial.summary.acceptedCount,
}, null, 2));
