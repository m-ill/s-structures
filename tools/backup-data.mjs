import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.replace(/^--/, '').split('=');
  return [key, rest.join('=') || true];
}));
const dataDir = resolve(String(args.dataDir || 'data'));
const outDir = resolve(String(args.out || join('output', 'backups', `backup-${stamp()}`)));
const verify = args.verify === true || args.verify === 'true';
const includeSecrets = args['include-secrets'] === true || args['include-secrets'] === 'true';

await mkdir(outDir, { recursive: true });
const sourceFiles = await listFiles(dataDir);
const files = sourceFiles.filter((file) => includeSecrets || !isSecretPath(file));
for (const file of files) {
  const target = join(outDir, 'data', file);
  await mkdir(join(target, '..'), { recursive: true });
  await copyFile(join(dataDir, file), target);
}
const manifest = {
  version: 'p12-backup-data-v1',
  dataDir,
  outDir,
  createdAt: new Date().toISOString(),
  secretsIncluded: includeSecrets,
  excluded: sourceFiles.filter((file) => !files.includes(file)),
  files: await Promise.all(files.map(async (file) => ({ path: file, sha256: await hashFile(join(outDir, 'data', file)) }))),
};
await writeFile(join(outDir, 'backup-manifest.json'), JSON.stringify(manifest, null, 2));
if (verify) {
  for (const file of manifest.files) {
    const actual = await hashFile(join(outDir, 'data', file.path));
    if (actual !== file.sha256) throw new Error(`Backup verification failed: ${file.path}`);
  }
}

function isSecretPath(path) {
  return /(^|\/)(secret\.key|session-hmac\.json)$/i.test(path.replace(/\\/g, '/'));
}
console.log(JSON.stringify({ ok: true, version: manifest.version, outDir, fileCount: manifest.files.length, verified: verify }, null, 2));

async function listFiles(root, prefix = '') {
  const rows = [];
  for (const item of await readdir(join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) rows.push(...await listFiles(root, rel));
    else rows.push(rel);
  }
  return rows.sort();
}

function hashFile(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    createReadStream(path).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', () => resolveHash(hash.digest('hex')));
  });
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
