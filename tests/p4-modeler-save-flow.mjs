import assert from 'node:assert/strict';
import { createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';
import { createFakeWindow } from './helpers/fakeAppWindow.mjs';
import { bootTestApp } from './helpers/serverTestApp.mjs';
import { createApiClient } from '../src/app/apiClient.js';
import { createSessionState } from '../src/app/sessionState.js';
import { createAppShell } from '../src/app/shell.js';
import { buildHash } from '../src/app/routes.js';
import { createTwoStoryElasticFrameModel } from '../src/index.js';

const app = await bootTestApp();

try {
  await app.api('POST', '/api/auth/register', {
    body: { email: 'modeler-save@example.com', password: 'super-secret-pw', name: 'Modeler Save' },
  });

  const api = createApiClient({ baseUrl: app.baseUrl, fetch });
  const session = createSessionState({ storage: createMemoryStorage(), api });
  await session.login('modeler-save@example.com', 'super-secret-pw');

  const project = await api.post('/api/projects', { body: { name: 'Modeler Save Flow' } });
  const projectId = project.project.id;
  const document = createFakeIndexDocument();
  const window = createFakeWindow();
  const mountPoint = document.createElement('div');
  document.body.appendChild(mountPoint);

  const model = createTwoStoryElasticFrameModel();
  let readCount = 0;
  const shell = createAppShell({
    window,
    document,
    api,
    session,
    mountPoint,
    modelerBridgeFactory: () => ({
      getModel: async () => {
        readCount += 1;
        return model;
      },
      dispose() {},
    }),
  });

  window.location.hash = buildHash('modeler', { projectId });
  shell.start();
  await waitFor(() => shell.getRoutingState().rerouteScheduled === false);
  assert.equal(mountPoint.querySelector('[data-role="modeler-save"]').disabled, false);

  const first = await shell.getCurrentView().saveProjectRevision();
  assert.equal(first.rev, 1);
  assert.equal(shell.getCurrentView().getLastSavedRev(), 1);
  assert.equal(mountPoint.querySelector('[data-role="modeler-host-status"]').textContent, 'Saved rev 1');

  const second = await shell.getCurrentView().saveProjectRevision();
  assert.equal(second.rev, 2);
  assert.equal(shell.getCurrentView().getLastSavedRev(), 2);
  assert.equal(readCount, 2);

  let prevented = false;
  window.dispatchEvent({
    type: 'keydown',
    key: 's',
    ctrlKey: true,
    preventDefault() { prevented = true; },
  });
  await waitFor(() => shell.getCurrentView().getLastSavedRev() === 3);
  assert.equal(prevented, true);

  const revisions = await api.get(`/api/projects/${projectId}/revisions`);
  assert.equal(revisions.revisions.length, 3);
  assert.deepEqual(revisions.revisions.map((item) => item.rev), [1, 2, 3]);

  console.log(JSON.stringify({ ok: true, version: 'p4-modeler-save-flow', projectId }, null, 2));
} finally {
  await app.close();
}

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}

async function waitFor(predicate, timeoutMs = 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Timed out waiting for save flow.');
}
