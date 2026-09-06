import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApiClient } from '../src/app/apiClient.js';
import { createEvidenceClient, EVIDENCE_CLIENT_VERSION } from '../src/app/evidenceClient.js';
import { buildAgentManifest } from '../src/index.js';
import { bootTestApp, registerAndLogin } from './helpers/serverTestApp.mjs';

const app = await bootTestApp();

try {
  const login = await registerAndLogin(app, 'evidence-client-owner@example.com');
  const api = createApiClient({ baseUrl: app.baseUrl, token: login.token });
  const client = createEvidenceClient(api);
  assert.equal(client.version, EVIDENCE_CLIENT_VERSION);

  const project = await api.post('/api/projects', { body: { name: 'Evidence Client Project' } });
  const projectId = project.project.id;

  const empty = await client.listProjectEvidence(projectId);
  assert.equal(empty.evidence.length, 0);
  assert.deepEqual(empty.finalApprovals, {});
  assert.equal(empty.finalApprovalReview.acceptedCount, 0);
  assert.equal(empty.ownerSignoffReview.summary.acceptedCount, 0);
  assert.equal(empty.ownerSignoffReview.deploymentApprovalGroup.status, 'APPROVAL_REQUIRED');
  assert.ok(empty.register.summary.missing.includes('real-office-dxf-fixtures'));

  const submitted = await client.submitProjectEvidence(projectId, {
    id: 'real-office-dxf-fixtures',
    accepted: true,
    reportPath: 'reports/import-validation/client-dxf.md',
  });
  assert.equal(submitted.evidence.accepted, true);
  assert.equal(submitted.register.summary.acceptedCount, 1);

  const listed = await client.listProjectEvidence(projectId);
  assert.equal(listed.evidence.length, 1);
  assert.equal(listed.register.rows.find((row) => row.id === 'real-office-dxf-fixtures').status, 'ACCEPTED');

  await assert.rejects(
    () => client.submitProjectEvidence(projectId, { id: 'not-in-phase3-plan', accepted: true }),
    /Evidence id or type is not in the Phase 3 evidence register/,
  );
  const afterRejected = await client.listProjectEvidence(projectId);
  assert.equal(afterRejected.evidence.length, 1);

  const packaged = await client.submitProjectEvidencePackage(projectId, {
    evidence: {
      id: 'real-pointcloud-files',
      accepted: true,
      reportPath: 'reports/pointcloud-validation/client-scan.md',
    },
    file: {
      name: 'scan.xyz',
      contentType: 'text/plain',
      raw: '0 0 0\n1 0 0\n',
    },
  });
  assert.match(packaged.file.id, /^[0-9a-f-]{36}$/);
  assert.equal(packaged.evidence.fileId, packaged.file.id);
  assert.equal(packaged.register.rows.find((row) => row.id === 'real-pointcloud-files').status, 'ACCEPTED');
  assert.equal(packaged.register.rows.find((row) => row.id === 'real-pointcloud-files').records[0].fileId, packaged.file.id);

  const finalApproval = await client.submitProjectEvidence(projectId, {
    id: 'final-structural-signoff',
    accepted: true,
    approved: true,
    finalApprovalField: 'finalStructuralSignoff',
    reportPath: 'reports/launch-readiness/final-signoff.md',
  });
  assert.equal(finalApproval.finalApprovals.finalStructuralSignoff, true);
  assert.equal(finalApproval.finalApprovalReview.rows.find((row) => row.id === 'final-structural-signoff').status, 'ACCEPTED');
  assert.equal(finalApproval.ownerSignoffReview.summary.productionDeploymentApproved, false);
  const finalListed = await client.listProjectEvidence(projectId);
  assert.equal(finalListed.finalApprovals.finalStructuralSignoff, true);
  assert.equal(finalListed.finalApprovalReview.acceptedCount, 1);
  assert.equal(finalListed.ownerSignoffReview.deploymentApprovalGroup.accepted, false);

  const serverPlan = readFileSync('docs/phase3/SERVER_API_PLAN.md', 'utf8');
  const launchVerification = readFileSync('verification/specs/P3_M20_LAUNCH_READINESS_VERIFICATION.md', 'utf8');
  assert.match(serverPlan, /finalApprovalReview/);
  assert.match(serverPlan, /ownerSignoffReview/);
  assert.match(serverPlan, /approval-group status/);
  assert.match(launchVerification, /owner sign-off deployment approval update/);
  assert.match(launchVerification, /final-approval review grouping update/);

  const manifest = buildAgentManifest();
  assert.equal(manifest.modules.phase3EvidenceClient, EVIDENCE_CLIENT_VERSION);
  assert.ok(manifest.dataContracts.includes('phase3EvidenceClient'));
  assert.equal(manifest.qaCommands.phase3EvidenceClient, 'node tests/p3-evidence-client.mjs');

  console.log(JSON.stringify({
    ok: true,
    version: EVIDENCE_CLIENT_VERSION,
    evidenceRows: listed.evidence.length,
  }, null, 2));
} finally {
  await app.close();
}
