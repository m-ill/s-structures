import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';
import { createFakeWindow } from './helpers/fakeAppWindow.mjs';
import { bootTestApp } from './helpers/serverTestApp.mjs';
import { createApiClient } from '../src/app/apiClient.js';
import { createSessionState } from '../src/app/sessionState.js';
import { createAppShell } from '../src/app/shell.js';
import { buildHash } from '../src/app/routes.js';
import { buildImportCandidate, createTwoStoryElasticFrameModel } from '../src/index.js';

const evidencePath = 'reports/validation-evidence/p4-preview-integrated-validation.json';
const app = await bootTestApp();

try {
  await app.api('POST', '/api/auth/register', {
    body: { email: 'preview@example.com', password: 'super-secret-pw', name: 'Preview' },
  });
  const api = createApiClient({ baseUrl: app.baseUrl, fetch });
  const session = createSessionState({ storage: createMemoryStorage(), api });
  await session.login('preview@example.com', 'super-secret-pw');
  const project = await api.post('/api/projects', { body: { name: 'Preview Integrated Validation' } });
  const projectId = project.project.id;

  const document = createFakeIndexDocument();
  const window = createFakeWindow();
  const mountPoint = document.createElement('div');
  document.body.appendChild(mountPoint);
  const shell = createAppShell({
    window,
    document,
    api,
    session,
    mountPoint,
    modelerBridgeFactory: () => ({ getModel: async () => createTwoStoryElasticFrameModel(), dispose() {} }),
  });

  window.location.hash = buildHash('modeler', { projectId });
  shell.start();
  await waitFor(() => !shell.getRoutingState().rerouteScheduled);
  const save = await shell.getCurrentView().saveProjectRevision();
  assert.equal(save.rev, 1);

  shell.navigate(buildHash('revisions', { projectId }));
  await shell.getCurrentView().refresh();
  assert.equal(mountPoint.querySelectorAll('[data-revision-rev]').length, 1);

  shell.navigate(buildHash('library', { projectId }));
  await shell.getCurrentView().refresh();
  await shell.getCurrentView().saveItem({ id: 'PREVIEW_STEEL', version: 1, E: 205000, G: 79000, Fy: 275, Fu: 410 });
  assert.equal(mountPoint.querySelector('[data-library-id="PREVIEW_STEEL"]').getAttribute('data-library-version'), '1');

  const candidate = buildImportCandidate({
    source: { type: 'dxf', fileId: 'preview-plan' },
    nodes: [{ id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 4, y: 0, z: 0 }],
    members: [{ id: 'B1', kind: 'beam', from: 'N1', to: 'N2', confidence: 0.9 }],
  });
  const savedImport = await api.post(`/api/projects/${projectId}/imports`, {
    body: { fileId: 'preview-plan', candidate, audit: candidate.audit },
  });
  shell.navigate(`#/p/${projectId}/import/${savedImport.import.id}`);
  await shell.getCurrentView().refresh();
  const overlayState = shell.getCurrentView().selectOverlayEntity('B1');
  assert.equal(overlayState.selected.id, 'B1');
  assert.equal(mountPoint.querySelector('[data-entity-id="B1"]').getAttribute('data-selected'), 'true');

  const evidence = {
    ok: true,
    version: 'p4-preview-integrated-validation',
    projectId,
    checks: ['modeler-save', 'revisions', 'library', 'import-overlay'],
  };
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
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
  assert.fail('Timed out waiting for preview validation.');
}
