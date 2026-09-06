import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { collectTestInventory } from './testInventory.mjs';

const output = resolve(process.argv[2] || 'tmp/verification/inventory/test-inventory.json');
const inventory = await collectTestInventory();
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true, output, total: inventory.total,
  defaultCount: inventory.defaultCount, releaseLongCount: inventory.releaseLongCount,
}, null, 2));
