import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootTestApp, registerAndLogin } from './helpers/serverTestApp.mjs';
import { createTwoStoryElasticFrameModel } from '../src/index.js';

const app = await bootTestApp();
try {
  const owner = await registerAndLogin(app, 'audit-owner@example.com');
  const reviewer = await registerAndLogin(app, 'audit-reviewer@example.com');
  await app.api('POST', '/api/auth/login', {
    body: { email: 'audit-owner@example.com', password: 'wrong-password' },
  });

  const createProject = await app.api('POST', '/api/projects', { token: owner.token, body: { name: 'Audit Project' } });
  const projectId = createProject.data.data.project.id;
  await app.api('PUT', `/api/projects/${projectId}/members/${reviewer.user.id}`, {
    token: owner.token,
    body: { role: 'viewer' },
  });
  const forbidden = await app.api('POST', `/api/projects/${projectId}/revisions`, {
    token: reviewer.token,
    body: { model: createTwoStoryElasticFrameModel() },
  });
  assert.equal(forbidden.status, 403);

  await app.api('PUT', `/api/projects/${projectId}/members/${reviewer.user.id}`, {
    token: owner.token,
    body: { role: 'reviewer' },
  });
  await app.api('POST', `/api/projects/${projectId}/revisions`, {
    token: owner.token,
    body: { model: createTwoStoryElasticFrameModel() },
  });
  await app.api('POST', `/api/projects/${projectId}/approval`, {
    token: reviewer.token,
    body: { state: 'approved', rev: 1 },
  });
  await app.api('POST', '/api/auth/logout', { token: owner.token });

  const text = await readFile(join(app.config.dataDir, 'audit.log'), 'utf8');
  const rows = text.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const types = rows.map((row) => row.type);
  for (const type of ['login-failed', 'member-changed', 'forbidden', 'approval-changed', 'logout-all']) {
    assert.ok(types.includes(type), `missing audit event: ${type}`);
  }
  assert.doesNotMatch(text, /super-secret-pw|wrong-password|Bearer\s|eyJ/);

  console.log(JSON.stringify({ ok: true, version: 'p4-audit-log', rows: rows.length }, null, 2));
} finally {
  await app.close();
}
