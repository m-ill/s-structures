import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  copyFile, lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const EXCLUDED_LEGACY_FILES = new Set(['secret.key', 'server.lock', 'data-layout.json']);

export async function migrateLegacyState(options) {
  const sourceDataDir = resolveRequired(options.sourceDataDir, 'sourceDataDir');
  const targetDataDir = resolveRequired(options.targetDataDir, 'targetDataDir');
  const targetSecretsDir = resolveRequired(options.targetSecretsDir, 'targetSecretsDir');
  const dryRun = options.dryRun === true;
  const rotateSecret = options.rotateSecret === true;
  assertDisjoint(sourceDataDir, targetDataDir, targetSecretsDir);

  const existing = await readLayout(targetDataDir);
  if (existing && await exists(targetSecretsDir)) {
    return { ok: true, status: 'already-migrated', dryRun, layout: existing };
  }
  await assertMissingOrEmpty(targetDataDir, 'targetDataDir');
  await assertMissingOrEmpty(targetSecretsDir, 'targetSecretsDir');
  if (!await exists(sourceDataDir)) throw new Error('Legacy source data directory does not exist.');
  if (await exists(join(sourceDataDir, 'server.lock'))) throw new Error('Legacy server.lock exists; stop the server before migration.');

  const sourceFiles = await listRegularFiles(sourceDataDir);
  const copiedFiles = sourceFiles.filter((file) => !EXCLUDED_LEGACY_FILES.has(file));
  const sourceManifest = await hashManifest(sourceDataDir, copiedFiles);
  const legacySecret = await readJson(join(sourceDataDir, 'secret.key'), null);
  const plan = {
    sourceDataDir,
    targetDataDir,
    targetSecretsDir,
    rotateSecret,
    copiedFileCount: copiedFiles.length,
    excludedFiles: sourceFiles.filter((file) => EXCLUDED_LEGACY_FILES.has(file)),
    sourceManifestSha256: hashJson(sourceManifest),
  };
  if (dryRun) return { ok: true, status: 'dry-run', dryRun: true, plan };

  const suffix = `.migrating-${randomUUID()}`;
  const stagedData = `${targetDataDir}${suffix}`;
  const stagedSecrets = `${targetSecretsDir}${suffix}`;
  let publishedData = false;
  let publishedSecrets = false;
  try {
    await mkdir(stagedData, { recursive: true });
    await mkdir(stagedSecrets, { recursive: true });
    for (const file of copiedFiles) {
      const source = join(sourceDataDir, file);
      const target = join(stagedData, file);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
    }
    if (options.failAt === 'after-copy') throw new Error('Injected migration failure after copy.');
    const copiedManifest = await hashManifest(stagedData, copiedFiles);
    if (JSON.stringify(copiedManifest) !== JSON.stringify(sourceManifest)) {
      throw new Error('Migration copy verification failed.');
    }
    if (options.failAt === 'after-verify') throw new Error('Injected migration failure after verify.');

    let usersUpdated = 0;
    if (rotateSecret) usersUpdated = await bumpUsers(stagedData);
    const secret = rotateSecret || !legacySecret?.secret
      ? randomBytes(48).toString('hex')
      : legacySecret.secret;
    const secretRecord = {
      version: 1,
      secret,
      createdAt: new Date().toISOString(),
      rotatedFromLegacy: rotateSecret && Boolean(legacySecret?.secret),
    };
    await writeJson(join(stagedSecrets, 'session-hmac.json'), secretRecord);
    const layout = {
      version: 'p12-state-layout-v1',
      migratedAt: new Date().toISOString(),
      sourceName: basename(sourceDataDir),
      copiedFileCount: copiedFiles.length,
      usersTokenVersionUpdated: usersUpdated,
      sourceManifestSha256: hashJson(sourceManifest),
      secretFingerprint: createHash('sha256').update(secret).digest('hex').slice(0, 16),
      legacySecretRotated: rotateSecret,
    };
    await writeJson(join(stagedData, 'data-layout.json'), layout);
    if (options.failAt === 'before-publish') throw new Error('Injected migration failure before publish.');

    await mkdir(dirname(targetSecretsDir), { recursive: true });
    await mkdir(dirname(targetDataDir), { recursive: true });
    await rename(stagedSecrets, targetSecretsDir);
    publishedSecrets = true;
    await rename(stagedData, targetDataDir);
    publishedData = true;
    return { ok: true, status: 'migrated', dryRun: false, plan, layout };
  } catch (error) {
    if (publishedData) await rm(targetDataDir, { recursive: true, force: true });
    if (publishedSecrets) await rm(targetSecretsDir, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(stagedData, { recursive: true, force: true });
    await rm(stagedSecrets, { recursive: true, force: true });
  }
}

async function bumpUsers(root) {
  const path = join(root, 'users.json');
  const users = await readJson(path, []);
  if (!Array.isArray(users)) throw new Error('Legacy users.json is invalid.');
  for (const user of users) user.tokenVersion = (user.tokenVersion || 1) + 1;
  await writeFile(path, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
  return users.length;
}

async function listRegularFiles(root, prefix = '') {
  const rows = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const path = join(root, rel);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`Migration source contains a symbolic link: ${rel}`);
    if (entry.isDirectory()) rows.push(...await listRegularFiles(root, rel));
    else if (entry.isFile()) rows.push(rel);
  }
  return rows.sort();
}

async function hashManifest(root, files) {
  return Promise.all(files.map(async (path) => ({ path, bytes: (await stat(join(root, path))).size, sha256: await hashFile(join(root, path)) })));
}

function hashFile(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    createReadStream(path).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', () => resolveHash(hash.digest('hex')));
  });
}

async function readLayout(targetDataDir) {
  return readJson(join(targetDataDir, 'data-layout.json'), null);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

async function assertMissingOrEmpty(path, label) {
  if (!await exists(path)) return;
  const entries = await readdir(path);
  if (entries.length) throw new Error(`${label} must be missing or empty.`);
  await rm(path, { recursive: true, force: true });
}

function assertDisjoint(...paths) {
  for (let left = 0; left < paths.length; left += 1) {
    for (let right = left + 1; right < paths.length; right += 1) {
      const rel = relative(paths[left], paths[right]);
      if (rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))) {
        throw new Error('Migration source and target paths must be disjoint.');
      }
      const reverse = relative(paths[right], paths[left]);
      if (reverse === '' || (!reverse.startsWith(`..${sep}`) && reverse !== '..' && !isAbsolute(reverse))) {
        throw new Error('Migration source and target paths must be disjoint.');
      }
    }
  }
}

function resolveRequired(value, name) {
  if (!value || value === true) throw new Error(`${name} is required.`);
  return resolve(String(value));
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
