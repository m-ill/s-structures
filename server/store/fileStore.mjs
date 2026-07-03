import { mkdir, readFile, rename, writeFile, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const locks = new Map();

export function isValidId(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

export function newId() {
  return randomUUID();
}

export async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

export async function readJson(path, fallback = null) {
  try {
    const text = await readFile(path, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function writeJsonAtomic(path, value) {
  await withLock(path, async () => {
    await writeJsonAtomicUnlocked(path, value);
  });
}

export async function writeJsonAtomicUnlocked(path, value) {
  await ensureDir(dirname(path));
  const tmp = `${path}.tmp-${randomUUID()}`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await rename(tmp, path);
}

export async function writeBufferAtomic(path, buffer) {
  await withLock(path, async () => {
    await ensureDir(dirname(path));
    const tmp = `${path}.tmp-${randomUUID()}`;
    await writeFile(tmp, buffer);
    await rename(tmp, path);
  });
}

export async function readBuffer(path) {
  return readFile(path);
}

export async function listDir(path) {
  try {
    return await readdir(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export async function removeDir(path) {
  await rm(path, { recursive: true, force: true });
}

/**
 * Serializes concurrent writers to the same path within this process.
 * Cross-process concurrency is out of scope for the v1 file store
 * (PERSISTENCE_PLAN.md D5 — SQLite is the v2 escalation path).
 */
export function withLock(key, fn) {
  const previous = locks.get(key) || Promise.resolve();
  const next = previous.then(fn, fn).finally(() => {
    if (locks.get(key) === next) locks.delete(key);
  });
  locks.set(key, next);
  return next;
}

export function joinSafe(base, ...segments) {
  for (const segment of segments) {
    if (typeof segment !== 'string' || segment.includes('..') || segment.includes('/') || segment.includes('\\')) {
      throw new Error(`Unsafe path segment: ${segment}`);
    }
  }
  return join(base, ...segments);
}
