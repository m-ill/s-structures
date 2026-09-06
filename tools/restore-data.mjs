import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.replace(/^--/, '').split('=');
  return [key, rest.join('=') || true];
}));
const backupRoot = resolveRequired(args.backup, 'backup');
const targetDataDir = resolveRequired(args.dataDir, 'dataDir');
const manifest = JSON.parse(await readFile(join(backupRoot, 'backup-manifest.json'), 'utf8'));
const sourceData = join(backupRoot, 'data');
await assertMissingOrEmpty(targetDataDir);
const staged = `${targetDataDir}.restoring-${randomUUID()}`;

try {
  await mkdir(staged, { recursive: true });
  for (const file of manifest.files || []) {
    const source = join(sourceData, file.path);
    const target = join(staged, file.path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    if (await hashFile(target) !== file.sha256) throw new Error(`Restore verification failed: ${file.path}`);
  }
  await mkdir(dirname(targetDataDir), { recursive: true });
  await rename(staged, targetDataDir);
  console.log(JSON.stringify({
    ok: true, version: 'p12-restore-data-v1', targetDataDir,
    fileCount: (manifest.files || []).length, secretsRestored: manifest.secretsIncluded === true,
  }, null, 2));
} finally {
  await rm(staged, { recursive: true, force: true });
}

async function assertMissingOrEmpty(path) {
  try {
    const entries = await readdir(path);
    if (entries.length) throw new Error('Restore target must be missing or empty.');
    await rm(path, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function hashFile(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    createReadStream(path).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', () => resolveHash(hash.digest('hex')));
  });
}

function resolveRequired(value, name) {
  if (!value || value === true) throw new Error(`--${name} is required.`);
  return resolve(String(value));
}

