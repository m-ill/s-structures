import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { collectTestInventory } from './testInventory.mjs';

const OUTPUT = path.resolve('verification', 'tests', 'taxonomy.json');
const checkOnly = process.argv.includes('--check');
const inventory = await collectTestInventory();
const records = inventory.records.map((row) => ({
  file: row.file.startsWith('verification/tests/') ? row.file : `tests/${row.file}`,
  taxonomy: taxonomy(row.file),
  execution: row.classification,
  owner: row.owner,
}));
const document = {
  version: 'p16-m5-test-taxonomy-v1',
  generatedAt: '2026-08-29',
  collectionMode: 'recursive-multi-root',
  roots: inventory.roots,
  plannedCount: records.length,
  categoryCounts: countBy(records, 'taxonomy'),
  executionCounts: countBy(records, 'execution'),
  records,
};
const serialized = `${JSON.stringify(document, null, 2)}\n`;
if (checkOnly) {
  const current = await readFile(OUTPUT, 'utf8');
  if (current !== serialized) throw new Error('Verification test taxonomy is stale. Run npm run generate:test-taxonomy.');
} else {
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, serialized, 'utf8');
}
console.log(JSON.stringify({ ok: true, checkOnly, output: path.relative('.', OUTPUT), plannedCount: records.length, categoryCounts: document.categoryCounts }, null, 2));

function taxonomy(file) {
  const name = path.posix.basename(file).toLowerCase();
  if (/^(?:p(?:8|9|10|11|12|13|14|15|17|18)-|benchmark-|final-use-release)/.test(name)) return 'qualification';
  if (/(?:e2e|browser|install|recovery|release-package|pilot)/.test(name)) return 'e2e';
  if (/(?:integration|workflow|bridge|server|api|ui|route|persistence)/.test(name)) return 'integration';
  return 'unit';
}

function countBy(rows, field) {
  return Object.fromEntries([...new Set(rows.map((row) => row[field]))].sort().map((value) => [value, rows.filter((row) => row[field] === value).length]));
}
