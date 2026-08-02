import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const build = spawnSync(process.execPath, ['tools/build-release.mjs'], { encoding: 'utf8', timeout: 180_000 });
assert.equal(build.status, 0, build.stderr || build.stdout);
const release = JSON.parse(build.stdout);
const root = await mkdtemp(join(tmpdir(), 's-structures-p12-m5-'));
const unpackRoot = join(root, 'install');
const dataDir = join(root, 'state', 'data');
const secretsDir = join(root, 'state', 'secrets');
const restoredData = join(root, 'restored', 'data');
const backupDir = join(root, 'backup');

try {
  const expand = spawnSync('powershell.exe', [
    '-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${release.zip.replace(/'/g, "''")}' -DestinationPath '${unpackRoot.replace(/'/g, "''")}' -Force`,
  ], { encoding: 'utf8', timeout: 120_000 });
  assert.equal(expand.status, 0, expand.stderr || expand.stdout);

  const manifest = JSON.parse(await readFile(join(unpackRoot, 'release-manifest.json'), 'utf8'));
  assert.deepEqual(manifest.layout, { publicRoot: 'public', dataRoot: 'external', secretsRoot: 'external' });
  assert.equal(manifest.forbiddenPathCount, 0);
  const packageFiles = await listFiles(unpackRoot);
  const forbidden = packageFiles.filter((path) => /(^|\/)(\.git|data|secrets|reports|output|tmp)(\/|$)|(^|\/)(secret\.key|session-hmac\.json|users\.json|server\.lock)$/i.test(path));
  assert.deepEqual(forbidden, []);
  for (const file of manifest.files) {
    const path = join(unpackRoot, file.path);
    assert.equal((await stat(path)).size, file.bytes, file.path);
    assert.equal(await hashBuffer(await readFile(path)), file.sha256, file.path);
  }

  const port = await freePort();
  let server = await startPackagedServer(unpackRoot, dataDir, secretsDir, port);
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const webManifestResponse = await fetch(`${baseUrl}/web-asset-manifest.json`);
    assert.equal(webManifestResponse.status, 200);
    const webManifest = await webManifestResponse.json();
    await mapLimit(webManifest.files, 24, async (file) => {
      const response = await fetch(`${baseUrl}/${file.path.split('/').map(encodeURIComponent).join('/')}`);
      assert.equal(response.status, 200, file.path);
      const body = Buffer.from(await response.arrayBuffer());
      assert.equal(body.length, file.bytes, file.path);
      assert.equal(await hashBuffer(body), file.sha256, file.path);
    });

    for (const path of [
      '/.git/HEAD', '/package.json', '/config.sample.json', '/server/main.mjs',
      '/data/users.json', '/data/secret.key', '/secrets/session-hmac.json',
      '/release-manifest.json', '/docs/user-manual/00-install.md', '/reports/', '/output/',
    ]) assert.equal((await fetch(`${baseUrl}${path}`)).status, 404, path);

    assert.equal((await api(baseUrl, 'POST', '/api/auth/register', {
      email: 'package@example.com', password: 'super-secret-pw', name: 'Package User',
    })).status, 200);
    const login = await api(baseUrl, 'POST', '/api/auth/login', { email: 'package@example.com', password: 'super-secret-pw' });
    assert.equal(login.status, 200);
    const token = login.body.data.token;
    const project = await api(baseUrl, 'POST', '/api/projects', { name: 'Packaged Project' }, token);
    assert.equal(project.status, 200);
  } finally {
    await stopServer(server);
  }

  server = await startPackagedServer(unpackRoot, dataDir, secretsDir, port);
  try {
    const login = await api(baseUrl, 'POST', '/api/auth/login', { email: 'package@example.com', password: 'super-secret-pw' });
    assert.equal(login.status, 200);
    const projects = await api(baseUrl, 'GET', '/api/projects', undefined, login.body.data.token);
    assert.equal(projects.status, 200);
    assert.equal(projects.body.data.projects.length, 1);
  } finally {
    await stopServer(server);
  }

  const backup = spawnSync(process.execPath, [
    join(unpackRoot, 'tools', 'backup-data.mjs'), `--dataDir=${dataDir}`, `--out=${backupDir}`, '--verify',
  ], { cwd: unpackRoot, encoding: 'utf8' });
  assert.equal(backup.status, 0, backup.stderr || backup.stdout);
  const backupResult = JSON.parse(backup.stdout);
  assert.equal(backupResult.verified, true);
  const backupManifest = JSON.parse(await readFile(join(backupDir, 'backup-manifest.json'), 'utf8'));
  assert.equal(backupManifest.secretsIncluded, false);
  assert.equal(backupManifest.files.some((file) => /secret|server\.lock/i.test(file.path)), false);

  const restore = spawnSync(process.execPath, [
    join(unpackRoot, 'tools', 'restore-data.mjs'), `--backup=${backupDir}`, `--dataDir=${restoredData}`,
  ], { cwd: unpackRoot, encoding: 'utf8' });
  assert.equal(restore.status, 0, restore.stderr || restore.stdout);
  assert.equal(JSON.parse(restore.stdout).fileCount, backupManifest.files.length);

  server = await startPackagedServer(unpackRoot, restoredData, secretsDir, port);
  try {
    const login = await api(baseUrl, 'POST', '/api/auth/login', { email: 'package@example.com', password: 'super-secret-pw' });
    assert.equal(login.status, 200);
    const projects = await api(baseUrl, 'GET', '/api/projects', undefined, login.body.data.token);
    assert.equal(projects.body.data.projects.length, 1);
  } finally {
    await stopServer(server);
  }

  assert.equal(existsSync(join(unpackRoot, 'public', 'help.html')), true);
  assert.equal(existsSync(join(unpackRoot, 'tools', 'backup-data.mjs')), true);
  assert.equal(existsSync(join(unpackRoot, 'tools', 'restore-data.mjs')), true);
  assert.equal(existsSync(join(unpackRoot, 'tools', 'migrate-state.mjs')), true);
  assert.equal(existsSync(join(unpackRoot, 'desktop', 'main.mjs')), true);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  version: 'p12-m5-release-package-install-recovery-v1',
  releaseSha256: release.sha256,
  publicFileCount: release.publicFileCount,
  releaseFileCount: release.releaseFileCount,
}, null, 2));

async function startPackagedServer(rootDir, data, secrets, port) {
  const child = spawn(process.execPath, [join(rootDir, 'server', 'main.mjs'), String(port)], {
    cwd: rootDir,
    env: {
      ...process.env,
      S_STRUCTURES_DATA_DIR: data,
      S_STRUCTURES_SECRETS_DIR: secrets,
      S_STRUCTURES_ALLOW_REGISTRATION: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const url = `http://127.0.0.1:${port}/api/health`;
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    if (child.exitCode !== null) throw new Error(`Packaged server exited ${child.exitCode}: ${stderr}`);
    try {
      if ((await fetch(url)).ok) return child;
    } catch {}
    await delay(50);
  }
  await stopServer(child);
  throw new Error(`Packaged server startup timed out: ${stderr}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), delay(2000).then(() => child.kill('SIGKILL'))]);
}

async function api(baseUrl, method, path, body, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const options = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${path}`, options);
  return { status: response.status, body: await response.json() };
}

async function listFiles(root, prefix = '') {
  const rows = [];
  for (const item of await readdir(join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) rows.push(...await listFiles(root, rel));
    else rows.push(rel);
  }
  return rows.sort();
}

function hashBuffer(buffer) {
  return Promise.resolve(createHash('sha256').update(buffer).digest('hex'));
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  }));
}

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  server.close();
  await once(server, 'close');
  return port;
}

