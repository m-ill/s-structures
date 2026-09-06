import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireDataDirLock, DataDirLockError } from '../server/store/lockfile.mjs';
import { startServer } from '../server/main.mjs';

const dataDir = await mkdtemp(join(tmpdir(), 's-structures-lock-'));
try {
  const first = await acquireDataDirLock(dataDir, { heartbeatMs: 1000 });
  const lockFile = JSON.parse(await readFile(join(dataDir, 'server.lock'), 'utf8'));
  assert.equal(lockFile.pid, process.pid);

  await assert.rejects(
    () => acquireDataDirLock(dataDir, { heartbeatMs: 1000 }),
    (error) => error instanceof DataDirLockError && error.code === 'DATA_DIR_LOCKED',
  );
  await first.release();

  await writeFile(join(dataDir, 'server.lock'), JSON.stringify({
    id: 'stale',
    pid: 99999999,
    heartbeatAt: new Date(0).toISOString(),
  }), 'utf8');
  const recovered = await acquireDataDirLock(dataDir, { heartbeatMs: 1000 });
  await recovered.release();

  const app = await startServer({ dataDir, port: 0, allowRegistration: true });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  await assert.rejects(
    () => startServer({ dataDir, port: 0, allowRegistration: true }),
    /already in use/,
  );
  await new Promise((resolve) => app.server.close(resolve));

  console.log(JSON.stringify({ ok: true, version: 'p4-data-dir-lock' }, null, 2));
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
