import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bootTestApp } from './helpers/serverTestApp.mjs';
import { createTwoStoryElasticFrameModel } from '../src/index.js';

const app = await bootTestApp();
try {
  await app.api('POST', '/api/auth/register', {
    body: { email: 'owner@example.com', password: 'super-secret-pw', name: 'Owner' },
  });
  const login = await app.api('POST', '/api/auth/login', {
    body: { email: 'owner@example.com', password: 'super-secret-pw' },
  });
  const token = login.data.data.token;
  const createProject = await app.api('POST', '/api/projects', { token, body: { name: 'Approval Guard' } });
  const projectId = createProject.data.data.project.id;
  await app.api('POST', `/api/projects/${projectId}/revisions`, {
    token,
    body: { model: createTwoStoryElasticFrameModel() },
  });

  const originalMemberRole = app.ctx.projectStore.memberRole;
  const originalGet = app.ctx.projectStore.get;
  app.ctx.projectStore.memberRole = async () => 'viewer';
  app.ctx.projectStore.get = async () => null;
  const missingAfterRoleCheck = await app.api('GET', `/api/projects/${projectId}/approval`, { token });
  assert.equal(missingAfterRoleCheck.status, 404);
  assert.equal(missingAfterRoleCheck.data.error.code, 'NOT_FOUND');
  app.ctx.projectStore.memberRole = originalMemberRole;
  app.ctx.projectStore.get = originalGet;

  const source = await readFile('server/store/projectStore.mjs', 'utf8');
  assert.match(source, /latest\?\.rev \?\? 0/);
  assert.doesNotMatch(source, /latest\?\.rev \|\| 0/);

  console.log(JSON.stringify({ ok: true, version: 'p4-approval-route-guards' }, null, 2));
} finally {
  await app.close();
}
