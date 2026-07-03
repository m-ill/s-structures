import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PRODUCT_VERSION } from '../src/platform/platformVersion.js';

const ROOT = resolve('.');
const OUT = resolve('output', 'release', `s-structures-${PRODUCT_VERSION}`);
const ZIP = `${OUT}.zip`;
const INCLUDE = [
  'index.html', 'app.html', 'm3.html', 'package.json', 'README.md', 'LICENSE.txt',
  'CHANGELOG.md', 'config.sample.json', 'src', 'server', 'docs/user-manual',
];

await rm(OUT, { recursive: true, force: true });
await rm(ZIP, { force: true });
await mkdir(OUT, { recursive: true });

const copied = [];
for (const item of INCLUDE) {
  const source = join(ROOT, item);
  try {
    await stat(source);
  } catch {
    continue;
  }
  const target = join(OUT, item);
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
  copied.push(item);
}

const manifest = {
  version: PRODUCT_VERSION,
  builtAt: new Date().toISOString(),
  copied,
  excluded: ['tests', 'tools/dev', 'docs/phase4', 'reports', '.git', 'data'],
};
await writeFile(join(OUT, 'release-manifest.json'), JSON.stringify(manifest, null, 2));

const ps = spawnSync('powershell.exe', [
  '-NoProfile',
  '-Command',
  `Compress-Archive -Path '${OUT.replace(/'/g, "''")}\\*' -DestinationPath '${ZIP.replace(/'/g, "''")}' -Force`,
], { encoding: 'utf8' });
if (ps.status !== 0) throw new Error(ps.stderr || ps.stdout || 'Compress-Archive failed.');

const sha256 = await hashFile(ZIP);
await writeFile(`${ZIP}.sha256`, `${sha256}  ${basename(ZIP)}\n`);
console.log(JSON.stringify({ ok: true, version: PRODUCT_VERSION, out: OUT, zip: ZIP, sha256 }, null, 2));

function hashFile(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    createReadStream(path).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', () => resolveHash(hash.digest('hex')));
  });
}
