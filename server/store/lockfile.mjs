import { open, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir } from './fileStore.mjs';

const LOCK_NAME = 'server.lock';
const HEARTBEAT_MS = 5000;

export class DataDirLockError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'DataDirLockError';
    this.code = 'DATA_DIR_LOCKED';
    this.details = details;
  }
}

export async function acquireDataDirLock(dataDir, options = {}) {
  const lockPath = join(dataDir, options.lockName || LOCK_NAME);
  const owner = {
    id: randomUUID(),
    pid: process.pid,
    createdAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
  };
  await ensureDir(dataDir);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeLockFile(lockPath, owner);
      return createLease(lockPath, owner, options.heartbeatMs || HEARTBEAT_MS);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const existing = await readLockOwner(lockPath);
      if (isProcessAlive(existing?.pid)) {
        throw new DataDirLockError('Data directory is already in use by another server process.', {
          lockPath,
          pid: existing.pid,
          heartbeatAt: existing.heartbeatAt || null,
        });
      }
      await rm(lockPath, { force: true });
    }
  }

  throw new DataDirLockError('Data directory lock could not be acquired after stale lock cleanup.', { lockPath });
}

async function writeLockFile(lockPath, owner) {
  const handle = await open(lockPath, 'wx');
  try {
    await handle.writeFile(JSON.stringify(owner, null, 2), 'utf8');
  } finally {
    await handle.close();
  }
}

async function readLockOwner(lockPath) {
  try {
    return JSON.parse(await readFile(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

function createLease(lockPath, owner, heartbeatMs) {
  let released = false;
  const timer = setInterval(async () => {
    owner.heartbeatAt = new Date().toISOString();
    try {
      await writeFile(lockPath, JSON.stringify(owner, null, 2), 'utf8');
    } catch {
      // The next explicit operation will surface a lock problem if needed.
    }
  }, heartbeatMs);
  timer.unref?.();

  return {
    lockPath,
    owner,
    async release() {
      if (released) return;
      released = true;
      clearInterval(timer);
      const current = await readLockOwner(lockPath);
      if (current?.id === owner.id) await rm(lockPath, { force: true });
    },
  };
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}
