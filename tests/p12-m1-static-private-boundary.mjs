import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootTestApp, registerAndLogin } from './helpers/serverTestApp.mjs';
import { createApp } from '../server/main.mjs';

const app = await bootTestApp();
try {
  for (const path of ['/', '/index.html', '/app.html', '/m3.html', '/help.html', '/src/ui/indexBridge.js']) {
    const response = await fetch(`${app.baseUrl}${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }

  const head = await fetch(`${app.baseUrl}/src/ui/indexBridge.js`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const postStatic = await fetch(`${app.baseUrl}/index.html`, { method: 'POST' });
  assert.equal(postStatic.status, 405);

  const forbidden = [
    '/.git/HEAD', '/.git/config', '/package.json', '/config.sample.json',
    '/server/main.mjs', '/server/config.mjs', '/data/server.lock', '/data/users.json',
    '/data/secret.key', '/reports/', '/output/', '/docs/phase11/README.md',
    '/src/../server/main.mjs', '/src/%2e%2e/server/main.mjs', '/src/%252e%252e/server/main.mjs',
    '/src%5c..%5cserver%5cmain.mjs', '/SRC/ui/indexBridge.js', '/src/ui/indexBridge.js.json',
  ];
  for (const path of forbidden) {
    const response = await fetch(`${app.baseUrl}${path}`);
    assert.notEqual(response.status, 200, path);
    assert.doesNotMatch(await response.text(), /f6f75bb|secret|package.json/i, path);
  }

  const owner = await registerAndLogin(app, 'p12-boundary@example.com');
  const project = await app.api('POST', '/api/projects', { token: owner.token, body: { name: 'Synthetic' } });
  const projectId = project.data.data.project.id;
  await app.api('POST', `/api/projects/${projectId}/files`, {
    token: owner.token,
    raw: 'synthetic-only',
    headers: { 'x-file-name': 'fixture.txt', 'content-type': 'text/plain' },
  });
  for (const path of ['/data/users.json', '/data/secret.key', `/data/projects/${projectId}/project.json`]) {
    assert.equal((await fetch(`${app.baseUrl}${path}`)).status, 404, path);
  }
} finally {
  await app.close();
}

const overlapRoot = await mkdtemp(join(tmpdir(), 's-structures-overlap-'));
try {
  await mkdir(join(overlapRoot, 'data'), { recursive: true });
  assert.throws(() => createApp({
    staticRoot: overlapRoot,
    dataDir: join(overlapRoot, 'data'),
    secretsDir: `${overlapRoot}-secrets`,
    port: 0,
  }), /must not overlap/);

  const outside = join(overlapRoot, 'outside.js');
  const publicRoot = join(overlapRoot, 'public');
  await mkdir(join(publicRoot, 'src'), { recursive: true });
  await writeFile(join(publicRoot, 'index.html'), '<h1>safe</h1>');
  await writeFile(outside, 'private');
  try {
    await symlink(outside, join(publicRoot, 'src', 'escape.js'));
    const symlinkApp = await bootTestApp({ staticRoot: publicRoot });
    try {
      assert.equal((await fetch(`${symlinkApp.baseUrl}/src/escape.js`)).status, 404);
    } finally {
      await symlinkApp.close();
    }
  } catch (error) {
    if (!['EPERM', 'EACCES'].includes(error?.code)) throw error;
  }
} finally {
  await rm(overlapRoot, { recursive: true, force: true });
  await rm(`${overlapRoot}-secrets`, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, version: 'p12-m1-static-private-boundary-v1' }, null, 2));

