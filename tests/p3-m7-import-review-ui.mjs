import assert from 'node:assert/strict';
import { createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';
import { createFakeWindow } from './helpers/fakeAppWindow.mjs';
import { bootTestApp } from './helpers/serverTestApp.mjs';
import { createApiClient } from '../src/app/apiClient.js';
import { createSessionState } from '../src/app/sessionState.js';
import { createAppShell } from '../src/app/shell.js';
import { buildImportCandidate, buildAgentManifest } from '../src/index.js';

const app = await bootTestApp();
try {
  await app.api('POST', '/api/auth/register', { body: { email: 'import-ui@example.com', password: 'super-secret-pw', name: 'Import UI' } });
  const login = await app.api('POST', '/api/auth/login', { body: { email: 'import-ui@example.com', password: 'super-secret-pw' } });
  const token = login.data.data.token;
  const project = await app.api('POST', '/api/projects', { token, body: { name: 'Import Review' } });
  const projectId = project.data.data.project.id;
  const candidate = buildImportCandidate({
    source: { type: 'dxf', fileId: 'fixture-plan' },
    stories: [{ id: 'S1', z: 0 }],
    grids: [{ id: 'GX1', axis: 'X', position: 0 }],
    nodes: [{ id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 4, y: 0, z: 0 }],
    members: [{ id: 'B1', kind: 'beam', from: 'N1', to: 'N2' }],
    audit: { warnings: ['review required'] },
  });
  const saved = await app.api('POST', `/api/projects/${projectId}/imports`, { token, body: { fileId: 'fixture-plan', candidate, audit: candidate.audit } });
  const jobId = saved.data.data.import.id;

  const document = createFakeIndexDocument();
  const window = createFakeWindow();
  const mountPoint = document.createElement('div');
  document.body.appendChild(mountPoint);
  const api = createApiClient({ baseUrl: app.baseUrl, fetch, token });
  const session = createSessionState({ storage: null, api });
  await session.login('import-ui@example.com', 'super-secret-pw');
  const shell = createAppShell({ window, document, api, session, mountPoint });
  shell.navigate(`#/p/${projectId}/import/${jobId}`);
  await shell.getCurrentView().refresh();

  assert.equal(mountPoint.querySelector('[data-role="confirm-import"]').disabled, false);
  assert.match(mountPoint.querySelector('[data-role="audit"]').textContent, /review required/);
  assert.match(mountPoint.querySelector('[data-role="audit"]').textContent, /confirmable/);
  shell.getCurrentView().updateCandidate({ ...candidate, audit: candidate.audit }, 'agent adjusted candidate');
  assert.match(shell.getCurrentView().getSummary().candidate.audit.reviewHistory[0].note, /agent adjusted/);
  await shell.getCurrentView().confirm();
  const after = await app.api('GET', `/api/projects/${projectId}/imports/${jobId}`, { token });
  assert.equal(after.data.data.import.status, 'confirmed');
  assert.ok(buildAgentManifest().dataContracts.includes('phase3ImportReviewUi'));

  console.log(JSON.stringify({ ok: true, version: 'p3-m7-import-review-ui', projectId, jobId }, null, 2));
} finally {
  await app.close();
}
