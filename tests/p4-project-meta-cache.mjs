import assert from 'node:assert/strict';
import { bootTestApp, registerAndLogin } from './helpers/serverTestApp.mjs';

const app = await bootTestApp();
try {
  const session = await registerAndLogin(app, 'cache-owner@example.com');
  const createProject = await app.api('POST', '/api/projects', {
    token: session.token,
    body: { name: 'Cache Probe' },
  });
  const projectId = createProject.data.data.project.id;

  app.ctx.projectStore.resetDebugCounters();
  const readProject = await app.api('GET', `/api/projects/${projectId}`, { token: session.token });
  assert.equal(readProject.status, 200);
  assert.equal(app.ctx.projectStore.debugMetaReadCount(projectId), 1);

  console.log(JSON.stringify({ ok: true, version: 'p4-project-meta-cache' }, null, 2));
} finally {
  await app.close();
}
