import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PRODUCT_VERSION } from '../src/platform/platformVersion.js';

const ROOT = resolve('.');
const OUT = resolve('output', 'release', `s-structures-${PRODUCT_VERSION}`);
const PUBLIC = join(OUT, 'public');
const ZIP = `${OUT}.zip`;
const PUBLIC_ASSETS = ['index.html', 'app.html', 'm3.html', 'help.html', 'manual.html', 'guide.html', 'src'];
const RUNTIME_ASSETS = [
  'package.json', 'README.md', 'LICENSE.txt', 'CHANGELOG.md', 'config.sample.json',
  'src', 'server', 'desktop', 'docs/user-manual',
];
const OPERATION_TOOLS = ['tools/backup-data.mjs', 'tools/restore-data.mjs', 'tools/migrate-state.mjs'];
const FORBIDDEN_PATTERNS = [
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)(data|secrets)(\/|$)/i,
  /(^|\/)(secret\.key|session-hmac\.json|users\.json)$/i,
  /(^|\/)server\.lock$/i,
  /(^|\/)tmp(\/|$)/i,
  /(^|\/)(reports|output)(\/|$)/i,
];

await rm(OUT, { recursive: true, force: true });
await rm(ZIP, { force: true });
await mkdir(PUBLIC, { recursive: true });

const copied = [];
for (const item of PUBLIC_ASSETS) {
  if (!await copyIfExists(join(ROOT, item), join(PUBLIC, item))) continue;
  copied.push(item);
}
for (const item of RUNTIME_ASSETS) {
  if (!await copyIfExists(join(ROOT, item), join(OUT, item))) continue;
  if (!copied.includes(item)) copied.push(item);
}
for (const item of OPERATION_TOOLS) {
  if (!await copyIfExists(join(ROOT, item), join(OUT, item))) continue;
  copied.push(item);
}

for (const path of await listFiles(PUBLIC)) {
  if (!isPublicFile(path)) await rm(join(PUBLIC, path), { force: true });
}
const publicFiles = await listFiles(PUBLIC);
const publicManifest = {
  version: 'p12-web-asset-manifest-v1',
  productVersion: PRODUCT_VERSION,
  files: await fileRecords(PUBLIC, publicFiles),
};
await writeFile(join(PUBLIC, 'web-asset-manifest.json'), `${JSON.stringify(publicManifest, null, 2)}\n`);

const beforeManifestFiles = await listFiles(OUT);
const forbidden = beforeManifestFiles.filter((path) => FORBIDDEN_PATTERNS.some((pattern) => pattern.test(path)));
if (forbidden.length) throw new Error(`Release contains forbidden paths: ${forbidden.join(', ')}`);

const manifest = {
  version: PRODUCT_VERSION,
  manifestVersion: 'p12-release-manifest-v1',
  builtAt: new Date().toISOString(),
  layout: { publicRoot: 'public', dataRoot: 'external', secretsRoot: 'external' },
  copied,
  excluded: ['tests', 'reports', 'output', '.git', 'data', 'secrets', 'tmp'],
  forbiddenPathCount: 0,
  files: await fileRecords(OUT, beforeManifestFiles),
};
await writeFile(join(OUT, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const ps = spawnSync('powershell.exe', [
  '-NoProfile',
  '-Command',
  `Compress-Archive -Path '${OUT.replace(/'/g, "''")}\\*' -DestinationPath '${ZIP.replace(/'/g, "''")}' -Force`,
], { encoding: 'utf8' });
if (ps.status !== 0) throw new Error(ps.stderr || ps.stdout || 'Compress-Archive failed.');

const sha256 = await hashFile(ZIP);
await writeFile(`${ZIP}.sha256`, `${sha256}  ${basename(ZIP)}\n`);
console.log(JSON.stringify({
  ok: true, version: PRODUCT_VERSION, out: OUT, zip: ZIP, sha256,
  publicFileCount: publicManifest.files.length, releaseFileCount: manifest.files.length + 1,
}, null, 2));

async function copyIfExists(source, target) {
  try {
    await stat(source);
  } catch {
    return false;
  }
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
  return true;
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

function fileRecords(root, files) {
  return Promise.all(files.map(async (path) => ({
    path,
    bytes: (await stat(join(root, path))).size,
    sha256: await hashFile(join(root, path)),
  })));
}

function hashFile(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    createReadStream(path).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', () => resolveHash(hash.digest('hex')));
  });
}

function isPublicFile(path) {
  if (!path.includes('/')) return /^(index|app|m3|help|manual|guide)\.html$/i.test(path);
  return path.startsWith('src/') && ['.js', '.css', '.wasm'].includes(extname(path).toLowerCase());
}
