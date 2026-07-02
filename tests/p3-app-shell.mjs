import assert from 'node:assert/strict';
import { createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';
import { createFakeWindow } from './helpers/fakeAppWindow.mjs';
import { bootTestApp } from './helpers/serverTestApp.mjs';
import { createApiClient } from '../src/app/apiClient.js';
import { createSessionState, SESSION_TOKEN_KEY } from '../src/app/sessionState.js';
import { createAppShell, APP_SHELL_VERSION } from '../src/app/shell.js';
import { matchRoute, buildHash } from '../src/app/routes.js';
import { APP_SHELL_VERSION as PLATFORM_APP_SHELL_VERSION } from '../src/platform/platformVersion.js';
import { buildAgentManifest } from '../src/ui/agentManifest.js';

assert.equal(APP_SHELL_VERSION, PLATFORM_APP_SHELL_VERSION);

// route table matching
assert.deepEqual(matchRoute('#/login'), { name: 'login', params: {}, path: '/login' });
assert.deepEqual(matchRoute('#/local/modeler'), { name: 'localModeler', params: {}, path: '/local/modeler' });
assert.deepEqual(matchRoute('#/p/abc-123/modeler'), { name: 'modeler', params: { projectId: 'abc-123' }, path: '/p/abc-123/modeler' });
assert.deepEqual(matchRoute('#/p/abc-123/revisions'), { name: 'revisions', params: { projectId: 'abc-123' }, path: '/p/abc-123/revisions' });
assert.deepEqual(matchRoute('#/p/abc-123/report'), { name: 'report', params: { projectId: 'abc-123' }, path: '/p/abc-123/report' });
assert.equal(matchRoute('#/nope'), null);
assert.equal(matchRoute('#/p/%E0%A4%A/modeler'), null);
assert.equal(buildHash('modeler', { projectId: 'xyz' }), '#/p/xyz/modeler');

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3AppShell, APP_SHELL_VERSION);
assert.ok(manifest.dataContracts.includes('phase3AppShellRoutes'));
assert.ok(manifest.milestones.some((row) => row.id === 'P3-M4' && row.status === 'available'));

const app = await bootTestApp();
try {
  await app.api('POST', '/api/auth/register', { body: { email: 'shell@example.com', password: 'super-secret-pw', name: 'Shell' } });

  function createMemoryStorage() {
    const map = new Map();
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, value),
      removeItem: (key) => map.delete(key),
    };
  }

  const storage = createMemoryStorage();
  const document = createFakeIndexDocument();
  const window = createFakeWindow();
  const mountPoint = document.createElement('div');
  document.body.appendChild(mountPoint);

  const api = createApiClient({ baseUrl: app.baseUrl, fetch });
  const session = createSessionState({ storage, api });
  const shell = createAppShell({ window, document, api, session, mountPoint });

  // unauthenticated users land on the local modeling entry, not login.
  const started = shell.start();
  assert.equal(started.name, 'localModeler');
  assert.equal(window.location.hash, '#/local/modeler');
  assert.equal(mountPoint.querySelector('[data-role="modeler-project-id"]').textContent, 'local-model');
  assert.ok(mountPoint.querySelector('[data-role="open-local-modeler"]'));

  // login stays available as an explicit route for server project storage.
  shell.navigate(buildHash('login'));
  const loginForm = mountPoint.querySelector('[data-view="login"]');
  assert.ok(loginForm);

  // fill and submit login
  const emailField = mountPoint.querySelector('[data-field="email"]');
  const passwordField = mountPoint.querySelector('[data-field="password"]');
  emailField.value = 'shell@example.com';
  passwordField.value = 'super-secret-pw';
  await shell.getCurrentView().submit();

  assert.equal(session.getState().authenticated, true);
  assert.equal(storage.getItem(SESSION_TOKEN_KEY), api.getToken());
  assert.equal(window.location.hash, '#/projects');
  assert.ok(mountPoint.querySelector('[data-role="project-list"]'));

  // create a project through the UI
  const nameField = mountPoint.querySelector('[data-field="new-project-name"]');
  nameField.value = 'Shell E2E Project';
  await shell.getCurrentView().createProject();
  const projectItems = mountPoint.querySelectorAll('[data-project-id]');
  assert.equal(projectItems.length, 1);
  const projectId = projectItems[0].getAttribute('data-project-id');
  assert.equal(projectItems[0].textContent, 'Shell E2E Project');

  // click into the project -> modeler route
  projectItems[0].click();
  assert.equal(window.location.hash, `#/p/${projectId}/modeler`);
  assert.equal(mountPoint.querySelector('[data-role="modeler-project-id"]').textContent, projectId);
  assert.equal(session.getState().currentProjectId, projectId);

  shell.navigate(buildHash('revisions', { projectId }));
  assert.equal(mountPoint.querySelector('[data-role="revisions-project-id"]').textContent, projectId);
  assert.ok(mountPoint.querySelector('[data-role="revision-list"]'));
  await shell.getCurrentView().refresh();
  assert.equal(mountPoint.querySelector('[data-role="revision-status"]').textContent, '');

  shell.navigate(buildHash('report', { projectId }));
  assert.equal(mountPoint.querySelector('[data-role="report-project-id"]').textContent, projectId);
  assert.ok(mountPoint.querySelector('[data-role="report-shell-note"]'));

  // a fresh session restores from the persisted token
  const api2 = createApiClient({ baseUrl: app.baseUrl, fetch });
  const session2 = createSessionState({ storage, api: api2 });
  const restored = await session2.restore();
  assert.equal(restored.authenticated, true);
  assert.equal(restored.user.email, 'shell@example.com');

  // logout clears session and re-routes protected views back to login
  await session.logout();
  assert.equal(session.getState().authenticated, false);
  assert.equal(storage.getItem(SESSION_TOKEN_KEY), null);
  assert.ok(mountPoint.querySelector('[data-view="login"]'), 'expected shell to redirect to login after logout');

  console.log(JSON.stringify({ ok: true, version: 'p3-app-shell', projectId }, null, 2));
} finally {
  await app.close();
}
