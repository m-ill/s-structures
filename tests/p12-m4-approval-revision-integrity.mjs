import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootTestApp, registerAndLogin } from './helpers/serverTestApp.mjs';
import { createTwoStoryElasticFrameModel } from '../src/index.js';

const app = await bootTestApp();
try {
  const owner = await registerAndLogin(app, 'p12-owner@example.com');
  const reviewer = await registerAndLogin(app, 'p12-reviewer@example.com');
  const created = await app.api('POST', '/api/projects', { token: owner.token, body: { name: 'Approval Integrity' } });
  const projectId = created.data.data.project.id;
  await app.api('PUT', `/api/projects/${projectId}/members/${reviewer.user.id}`, {
    token: owner.token, body: { role: 'reviewer' },
  });
  const model = createTwoStoryElasticFrameModel();
  assert.equal((await app.api('POST', `/api/projects/${projectId}/revisions`, {
    token: owner.token, body: { model },
  })).status, 200);

  const missing = await app.api('POST', `/api/projects/${projectId}/approval`, {
    token: owner.token, body: { state: 'approved', rev: 999 },
  });
  assert.equal(missing.status, 400);
  assert.equal(missing.data.error.code, 'REV_NOT_FOUND');

  const approved = await app.api('POST', `/api/projects/${projectId}/approval`, {
    token: reviewer.token, body: { state: 'approved', rev: 1, expectedVersion: 0 },
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.data));
  assert.equal(approved.data.data.approval.current, true);
  assert.match(approved.data.data.approval.modelHash, /^[0-9a-f]{64}$/);

  const reviewerRelease = await app.api('POST', `/api/projects/${projectId}/approval`, {
    token: reviewer.token, body: { state: 'released', rev: 1 },
  });
  assert.equal(reviewerRelease.status, 403);
  const released = await app.api('POST', `/api/projects/${projectId}/approval`, {
    token: owner.token, body: { state: 'released', rev: 1, expectedVersion: 1 },
  });
  assert.equal(released.status, 200, JSON.stringify(released.data));
  assert.equal(released.data.data.approval.state, 'released');
  assert.equal(released.data.data.approval.history.length, 2);

  assert.equal((await app.api('POST', `/api/projects/${projectId}/revisions`, {
    token: owner.token, body: { model: { ...model, p12Revision: 2 }, parentRev: 1 },
  })).status, 200);
  const stale = await app.api('GET', `/api/projects/${projectId}/approval`, { token: owner.token });
  assert.equal(stale.data.data.approval.state, 'stale');
  assert.equal(stale.data.data.approval.current, false);
  assert.equal(stale.data.data.approval.supersededByRev, 2);
  assert.ok(stale.data.data.approval.history.some((row) => row.state === 'released'));

  const oldRev = await app.api('POST', `/api/projects/${projectId}/approval`, {
    token: owner.token, body: { state: 'approved', rev: 1 },
  });
  assert.equal(oldRev.status, 409);
  assert.equal(oldRev.data.error.code, 'STALE_REV');

  const currentVersion = stale.data.data.approval.version;
  const first = await app.api('POST', `/api/projects/${projectId}/approval`, {
    token: reviewer.token, body: { state: 'approved', rev: 2, expectedVersion: currentVersion },
  });
  assert.equal(first.status, 200);
  const conflict = await app.api('POST', `/api/projects/${projectId}/approval`, {
    token: reviewer.token, body: { state: 'approved', rev: 2, expectedVersion: currentVersion },
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.error.code, 'VERSION_CONFLICT');

  const projectMeta = await app.api('GET', `/api/projects/${projectId}`, { token: owner.token });
  assert.deepEqual(projectMeta.data.data.project.approval, first.data.data.approval);

  const revisionPath = join(app.config.dataDir, 'projects', projectId, 'revisions', '2.json');
  const originalRevision = await readFile(revisionPath, 'utf8');
  await writeFile(revisionPath, JSON.stringify({ schemaVersion: 'tampered' }));
  const tampered = await app.api('POST', `/api/projects/${projectId}/approval`, {
    token: owner.token, body: { state: 'released', rev: 2, expectedVersion: first.data.data.approval.version },
  });
  assert.equal(tampered.status, 409);
  assert.equal(tampered.data.error.code, 'REV_TAMPERED');
  await writeFile(revisionPath, originalRevision);
} finally {
  await app.close();
}

console.log(JSON.stringify({ ok: true, version: 'p12-m4-approval-revision-integrity-v1' }, null, 2));

