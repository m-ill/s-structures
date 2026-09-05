import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import packageJson from '../package.json' with { type: 'json' };
import { collectTestInventory } from '../verification/harnesses/testInventory.mjs';

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

const committed = JSON.parse(await readFile('verification/specs/phase12/test-inventory.json', 'utf8'));
// The Phase 12 inventory is a frozen milestone artifact. Phase 16 owns the
// current recursive inventory and must preserve every historical record.
assert.ok(committed.total <= inventory.total);
const currentByFile = new Map(inventory.records.map((row) => [row.file, row]));
for (const historical of committed.records) {
  const current = currentByFile.get(historical.file);
  assert.ok(current, `historical test disappeared: ${historical.file}`);
  assert.deepEqual(
    pickInventoryContract(current),
    pickInventoryContract(historical),
    `historical test classification changed: ${historical.file}`,
  );
}
const taxonomy = JSON.parse(await readFile('verification/tests/taxonomy.json', 'utf8'));
assert.equal(taxonomy.collectionMode, 'recursive-multi-root');
assert.equal(taxonomy.plannedCount, inventory.total);

const releaseManifest = JSON.parse(await readFile('verification/specs/phase12/release-manifest.json', 'utf8'));
const phaseComplete = releaseManifest.completedMilestones?.includes('P12-M7') === true;
assert.equal(releaseManifest.releaseQualified, phaseComplete);
assert.equal(releaseManifest.localPilotAllowed, phaseComplete);
assert.equal(releaseManifest.productReleaseAllowed, false);
assert.equal(releaseManifest.lanAllowed, false);
assert.equal(releaseManifest.publicInternetAllowed, false);
assert.equal(releaseManifest.designTransferAllowed, false);

console.log(JSON.stringify({
  ok: true,
  version: 'p12-m6-windows-regression-release-gates-v2',
  total: inventory.total,
  defaultCount: inventory.defaultCount,
  releaseLongCount: inventory.releaseLongCount,
}, null, 2));

function pickInventoryContract({ file, classification, runner, owner, reason }) {
  return { file, classification, runner, owner, reason };
}
