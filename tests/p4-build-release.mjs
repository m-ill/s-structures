import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { PRODUCT_VERSION } from '../src/platform/platformVersion.js';

const output = execFileSync(process.execPath, ['tools/build-release.mjs'], { encoding: 'utf8' });
const result = JSON.parse(output);
assert.equal(result.ok, true);
assert.equal(result.version, PRODUCT_VERSION);
assert.ok((await stat(result.out)).isDirectory());
assert.ok((await stat(result.zip)).isFile());
assert.ok((await stat(`${result.zip}.sha256`)).isFile());
const manifest = JSON.parse(await readFile(`${result.out}/release-manifest.json`, 'utf8'));
assert.ok(manifest.copied.includes('index.html'));
assert.ok(manifest.copied.includes('server'));
assert.ok(manifest.excluded.includes('tests'));

console.log(JSON.stringify({ ok: true, version: 'p4-build-release', zip: result.zip }, null, 2));
