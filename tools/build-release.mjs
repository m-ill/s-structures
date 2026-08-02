import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { PRODUCT_VERSION } from '../src/platform/platformVersion.js';

const ROOT = resolve('.');
const OUT = resolve('output', 'release', `s-structures-${PRODUCT_VERSION}`);
const PUBLIC = join(OUT, 'public');
const ZIP = `${OUT}.zip`;
const REPRODUCIBLE_TIMESTAMP = '2000-01-01T00:00:00.000Z';
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
const CRC32_TABLE = Object.freeze(Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  return crc >>> 0;
}));

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
  builtAt: REPRODUCIBLE_TIMESTAMP,
  timestampPolicy: 'fixed-for-reproducible-archive',
  layout: { publicRoot: 'public', dataRoot: 'external', secretsRoot: 'external' },
  copied,
  excluded: ['tests', 'reports', 'output', '.git', 'data', 'secrets', 'tmp'],
  forbiddenPathCount: 0,
  files: await fileRecords(OUT, beforeManifestFiles),
};
await writeFile(join(OUT, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const archiveFiles = await listFiles(OUT);
await writeFile(ZIP, await createDeterministicZip(OUT, archiveFiles));

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

async function createDeterministicZip(root, files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const path of files) {
    const name = Buffer.from(path.replaceAll('\\', '/'), 'utf8');
    const data = await readFile(join(root, path));
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x2821, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x2821, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0x81a40000, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
