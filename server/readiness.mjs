import { access, mkdir, statfs } from 'node:fs/promises';
import { constants } from 'node:fs';

export async function checkReadiness(config, runtime = {}) {
  const checks = {
    dataWritable: false,
    freeSpace: false,
    migrationComplete: runtime.migrationComplete !== false,
    lockOwned: runtime.lockRequired ? runtime.lockOwned === true : true,
  };
  let freeBytes = null;
  try {
    await mkdir(config.dataDir, { recursive: true });
    await access(config.dataDir, constants.R_OK | constants.W_OK);
    checks.dataWritable = true;
    const fs = await statfs(config.dataDir, { bigint: true });
    freeBytes = fs.bavail * fs.bsize;
    checks.freeSpace = freeBytes >= BigInt(config.minFreeSpaceBytes);
  } catch {
    checks.dataWritable = false;
  }
  const ok = Object.values(checks).every(Boolean);
  return {
    status: ok ? 'ready' : 'not-ready',
    checks,
    freeBytes: freeBytes == null ? null : freeBytes.toString(),
    minFreeSpaceBytes: config.minFreeSpaceBytes,
  };
}

