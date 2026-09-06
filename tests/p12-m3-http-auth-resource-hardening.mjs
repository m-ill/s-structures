import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { bootTestApp, registerAndLogin } from './helpers/serverTestApp.mjs';
import { startServer } from '../server/main.mjs';

const app = await bootTestApp({
  authRateLimit: 3,
  rateLimitWindowSeconds: 60,
  maxProjectStorageBytes: 10,
  maxFilesPerProject: 1,
  maxConcurrentUploads: 1,
  maxUploadBytes: 10,
  maxAuditLogBytes: 100,
  minFreeSpaceBytes: 1,
});
try {
  const root = await fetch(`${app.baseUrl}/`);
  assert.equal(root.status, 200);
  for (const header of [
    'x-content-type-options', 'referrer-policy', 'cross-origin-resource-policy',
    'cross-origin-opener-policy', 'x-frame-options', 'permissions-policy', 'content-security-policy',
  ]) assert.ok(root.headers.get(header), `missing ${header}`);
  assert.doesNotMatch(root.headers.get('content-security-policy'), /'unsafe-eval'/);

  const health = await app.api('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal((await app.api('DELETE', '/api/health')).status, 405);
  assert.equal((await app.api('GET', '/api/not-found')).status, 404);

  const badOrigin = await fetch(`${app.baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.invalid' },
    body: JSON.stringify({ email: 'origin@example.com', password: 'super-secret-pw' }),
  });
  assert.equal(badOrigin.status, 403);
  const badHost = await rawHostRequest(app.baseUrl, 'evil.invalid');
  assert.equal(badHost, 400);

  const oversizedAuth = await fetch(`${app.baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(70_000) }),
  });
  assert.equal(oversizedAuth.status, 413);

  for (let index = 0; index < 2; index += 1) {
    const failed = await app.api('POST', '/api/auth/login', { body: { email: 'none@example.com', password: 'bad-password' } });
    assert.equal(failed.status, 401);
  }
  const limited = await app.api('POST', '/api/auth/login', { body: { email: 'none@example.com', password: 'bad-password' } });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);

  // Use a new client bucket by resetting the in-memory limiter for the loopback login path.
  app.ctx.rateLimiter.reset(`auth:127.0.0.1:/api/auth/login`);
  app.ctx.rateLimiter.reset(`auth:::ffff:127.0.0.1:/api/auth/login`);
  const owner = await registerAndLogin(app, 'quota@example.com');
  const project = await app.api('POST', '/api/projects', { token: owner.token, body: { name: 'Quota' } });
  const projectId = project.data.data.project.id;
  const upload = await app.api('POST', `/api/projects/${projectId}/files`, {
    token: owner.token, raw: '1234567890', headers: { 'x-file-name': 'one.txt', 'content-type': 'text/plain' },
  });
  assert.equal(upload.status, 200);
  const fileQuota = await app.api('POST', `/api/projects/${projectId}/files`, {
    token: owner.token, raw: '1', headers: { 'x-file-name': 'two.txt', 'content-type': 'text/plain' },
  });
  assert.equal(fileQuota.status, 409);
  app.ctx.uploadCounts = new Map([[projectId, 1]]);
  const busy = await app.api('POST', `/api/projects/${projectId}/files`, {
    token: owner.token, raw: '1', headers: { 'x-file-name': 'busy.txt', 'content-type': 'text/plain' },
  });
  assert.equal(busy.status, 429);
  app.ctx.uploadCounts.clear();

  const ready = await app.api('GET', '/api/readiness');
  assert.equal(ready.status, 200);
  assert.equal(ready.data.data.status, 'ready');
  assert.equal(ready.data.data.checks.dataWritable, true);

  const auditText = await readFile(join(app.config.dataDir, 'audit.log'), 'utf8');
  assert.doesNotMatch(auditText, /none@example\.com|quota@example\.com|bad-password/);
  assert.match(auditText, /emailHash/);
  assert.equal(existsSync(join(app.config.dataDir, 'audit.log.1')), true);
} finally {
  await app.close();
}

const networkRoot = await mkdtemp(join(tmpdir(), 's-structures-network-policy-'));
try {
  await assert.rejects(() => startServer({
    host: '0.0.0.0', port: 0,
    dataDir: join(networkRoot, 'data'), secretsDir: join(networkRoot, 'secrets'),
  }), /allowNetworkBind/);
} finally {
  await rm(networkRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, version: 'p12-m3-http-auth-resource-hardening-v1' }, null, 2));

function rawHostRequest(baseUrl, hostHeader) {
  const url = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const req = request({ hostname: url.hostname, port: url.port, path: '/api/health', headers: { Host: hostHeader } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}
