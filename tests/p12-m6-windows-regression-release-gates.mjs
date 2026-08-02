import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import packageJson from '../package.json' with { type: 'json' };
import { collectTestInventory } from '../tools/testInventory.mjs';

const source = await readFile('tests/p4-user-guide.mjs', 'utf8');
assert.match(source, /normalizeText/);
assert.match(source, /replace\(\/\\r\\n\?\/g, '\\n'\)/);

for (const script of ['test:fast', 'test:long', 'test:p12', 'test:uncovered', 'test:release']) {
  assert.equal(typeof packageJson.scripts[script], 'string', `missing ${script}`);
}
assert.match(packageJson.scripts.test, /run-phase12-tests\.mjs/);
assert.match(packageJson.scripts['test:release'], /test:uncovered/);

const inventory = await collectTestInventory();
assert.ok(inventory.total >= 349, inventory.total);
assert.equal(inventory.records.length, inventory.total);
assert.equal(inventory.unclassifiedCount, 0);
assert.equal(inventory.defaultCount + inventory.releaseLongCount, inventory.total);
assert.equal(new Set(inventory.records.map((row) => row.file)).size, inventory.total);
for (const row of inventory.records) {
  assert.ok(['default', 'release-long'].includes(row.classification));
  assert.ok(row.owner);
  assert.ok(row.runner);
  assert.ok(row.reason);
}

const committed = JSON.parse(await readFile('docs/verification/phase12/test-inventory.json', 'utf8'));
assert.equal(committed.total, inventory.total);
assert.deepEqual(
  committed.records.map(({ file, classification, runner, owner, reason }) => ({ file, classification, runner, owner, reason })),
  inventory.records,
);

const releaseManifest = JSON.parse(await readFile('docs/verification/phase12/release-manifest.json', 'utf8'));
assert.equal(releaseManifest.releaseQualified, false);
assert.equal(releaseManifest.localPilotAllowed, false);

console.log(JSON.stringify({
  ok: true,
  version: 'p12-m6-windows-regression-release-gates-v1',
  total: inventory.total,
  defaultCount: inventory.defaultCount,
  releaseLongCount: inventory.releaseLongCount,
}, null, 2));
