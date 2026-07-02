import assert from 'node:assert/strict';
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
