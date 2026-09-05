import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PRODUCT_VERSION } from '../src/platform/platformVersion.js';

const build = spawnSync(process.execPath, ['tools/build-release.mjs'], { encoding: 'utf8' });
assert.equal(build.status, 0, build.stderr || build.stdout);
const release = JSON.parse(build.stdout);
const unpackRoot = await mkdtemp(join(tmpdir(), 's-structures-install-smoke-'));
const dataDir = await mkdtemp(join(tmpdir(), 's-structures-install-data-'));
const port = 5193;
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const expand = expandReleaseArchive(release.zip, unpackRoot);
  assert.equal(expand.status, 0, expand.stderr || expand.stdout);

  const serverPath = join(unpackRoot, 'server', 'main.mjs');
  assert.equal(existsSync(serverPath), true);
  const server = spawn(process.execPath, [serverPath, String(port)], {
    cwd: unpackRoot,
    env: { ...process.env, S_STRUCTURES_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  server.stderr.on('data', (chunk) => { stderr += chunk; });

  try {
    await waitForHttp(`${baseUrl}/api/health`, server, () => stderr);
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).data.status, 'ok');

    const root = await fetch(`${baseUrl}/`);
    assert.equal(root.status, 200);
    assert.match(await root.text(), /S-Structures/);

    const index = await fetch(`${baseUrl}/index.html`);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /SStructuresNativeRuntime/);
  } finally {
    await stopServer(server);
  }

  console.log(JSON.stringify({
    ok: true,
    version: 'p4-install-smoke-web',
    productVersion: PRODUCT_VERSION,
    zip: release.zip,
    unpacked: true,
  }, null, 2));
} finally {
  await rm(unpackRoot, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
}

function expandReleaseArchive(zipPath, destinationPath) {
  const powershell = spawnSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destinationPath.replace(/'/g, "''")}' -Force`,
  ], { encoding: 'utf8' });
  if (powershell.status === 0) return { ...powershell, extractor: 'powershell-expand-archive' };

  const windowsTar = spawnSync('tar.exe', ['-xf', zipPath, '-C', destinationPath], { encoding: 'utf8' });
  if (windowsTar.status === 0) return { ...windowsTar, extractor: 'windows-bsdtar' };

  return {
    ...windowsTar,
    stderr: [
      'PowerShell Expand-Archive failed:',
      powershell.stderr || powershell.stdout,
      'Windows tar.exe fallback failed:',
      windowsTar.stderr || windowsTar.stdout,
    ].filter(Boolean).join('\n'),
  };
}

async function waitForHttp(url, server, getStderr) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    if (server.exitCode !== null) {
      throw new Error(`Install smoke server exited early with code ${server.exitCode}\n${getStderr()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await delay(50);
    }
  }
  throw new Error(`Timed out waiting for ${url}\n${getStderr()}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    once(child, 'exit'),
    delay(1000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }),
  ]);
}
