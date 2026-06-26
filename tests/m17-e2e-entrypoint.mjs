import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const root = new URL('..', import.meta.url);
const port = 5187;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['tools/serve.mjs', String(port)], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
server.stdout.on('data', (chunk) => {
  stdout += chunk;
});
server.stderr.on('data', (chunk) => {
  stderr += chunk;
});

try {
  await waitForHttp(`${baseUrl}/`);

  const rootResponse = await fetch(`${baseUrl}/`);
  assert.equal(rootResponse.status, 200);
  assert.match(rootResponse.headers.get('content-type') || '', /text\/html/);
  const rootHtml = await rootResponse.text();
  assert.match(rootHtml, /S-Structures/);
  assert.match(rootHtml, /src\/ui\/indexBridge\.js/);
  assert.match(rootHtml, /SStructuresNativeRuntime/);
  assert.match(rootHtml, /src\/ui\/indexBridge\.js\?runtime=m31/);
  assert.match(rootHtml, /id="canvasWrap"/);

  const bridgeResponse = await fetch(`${baseUrl}/src/ui/indexBridge.js`);
  assert.equal(bridgeResponse.status, 200);
  assert.match(bridgeResponse.headers.get('content-type') || '', /javascript/);
  const bridgeText = await bridgeResponse.text();
  assert.match(bridgeText, /installIndexEngineBridge/);

  const standaloneResponse = await fetch(`${baseUrl}/m3.html`);
  assert.equal(standaloneResponse.status, 200);

  assert.match(stdout, /index\.html/);

  console.log(JSON.stringify({
    ok: true,
    rootStatus: rootResponse.status,
    bridgeStatus: bridgeResponse.status,
    entrypoint: 'index.html',
  }, null, 2));
} finally {
  await stopServer(server);
}

async function waitForHttp(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    if (server.exitCode !== null) {
      throw new Error(`Dev server exited early with code ${server.exitCode}\n${stderr}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await delay(50);
    }
  }
  throw new Error(`Timed out waiting for ${url}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
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
