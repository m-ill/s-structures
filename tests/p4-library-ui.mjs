import assert from 'node:assert/strict';
import { createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';
import { createFakeWindow } from './helpers/fakeAppWindow.mjs';
import { bootTestApp } from './helpers/serverTestApp.mjs';
import { createApiClient } from '../src/app/apiClient.js';
import { createSessionState } from '../src/app/sessionState.js';
import { createAppShell } from '../src/app/shell.js';
import { buildHash, matchRoute } from '../src/app/routes.js';

assert.deepEqual(matchRoute('#/p/project-1/library'), {
  name: 'library',
  params: { projectId: 'project-1' },
  path: '/p/project-1/library',
});

const app = await bootTestApp();
try {
  await app.api('POST', '/api/auth/register', {
    body: { email: 'library-ui@example.com', password: 'super-secret-pw', name: 'Library UI' },
  });
  const api = createApiClient({ baseUrl: app.baseUrl, fetch });
  const session = createSessionState({ storage: null, api });
  await session.login('library-ui@example.com', 'super-secret-pw');
  const project = await api.post('/api/projects', { body: { name: 'Library UI Project' } });
  const projectId = project.project.id;

  const document = createFakeIndexDocument();
  const window = createFakeWindow();
  const mountPoint = document.createElement('div');
  document.body.appendChild(mountPoint);
  const shell = createAppShell({ window, document, api, session, mountPoint });
  window.location.hash = buildHash('library', { projectId });
  shell.start();
  await shell.getCurrentView().refresh();

  const view = shell.getCurrentView();
  view.fields.id.value = 'UI_STEEL';
  view.fields.version.value = '1';
  view.fields.e.value = '205000';
  view.fields.g.value = '79000';
  view.fields.fy.value = '275';
  view.fields.fu.value = '410';
  const saved = await view.saveItem();
  assert.equal(saved.id, 'UI_STEEL');
  assert.equal(mountPoint.querySelector('[data-library-id="UI_STEEL"]').getAttribute('data-library-version'), '1');

  view.fields.version.value = '2';
  view.fields.fy.value = '355';
  const savedV2 = await view.saveItem();
  assert.equal(savedV2.version, 2);
  const rows = mountPoint.querySelectorAll('[data-library-id="UI_STEEL"]');
  assert.equal(rows.length, 2);

  console.log(JSON.stringify({ ok: true, version: 'p4-library-ui', projectId }, null, 2));
} finally {
  await app.close();
}
