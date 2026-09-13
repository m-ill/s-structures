import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolvePublicAsset } from '../server/staticAssets.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const path of ['/src/agentHarness/check.mjs', '/src/agentHarness/install.mjs']) {
  const asset = resolvePublicAsset(root, path);
  assert.ok(asset, `${path} must be available to harness package fetch`);
  assert.match(asset.contentType, /javascript/);
}
assert.ok(resolvePublicAsset(root, '/assets/fonts/phase24/SStructuresSans.ttf'));
for (const path of ['/server/main.mjs', '/tools/backup-data.mjs', '/docs/archive/phase12/README.md', '/src/../server/main.mjs']) {
  assert.equal(resolvePublicAsset(root, path), null, `${path} must stay private`);
}
console.log('runtime portability asset boundary: PASS');
