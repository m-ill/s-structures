import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { issueToken } from '../server/auth/token.mjs';
import { hashPassword } from '../server/auth/password.mjs';
import { loadConfig, validatePathLayout } from '../server/config.mjs';
import { migrateLegacyState } from '../server/store/stateMigration.mjs';
import { bootTestApp } from './helpers/serverTestApp.mjs';

const root = await mkdtemp(join(tmpdir(), 's-structures-p12-m2-'));
const legacy = join(root, 'legacy-data');
const targetData = join(root, 'state', 'data');
const targetSecrets = join(root, 'state', 'secrets');
const password = 'super-secret-pw';
const oldSecret = 'a'.repeat(96);
try {
  await mkdir(join(legacy, 'projects', 'p1'), { recursive: true });
  const credential = await hashPassword(password);
  const user = {
    id: 'user-1', email: 'synthetic@example.com', name: 'Synthetic', role: 'admin',
    createdAt: '2026-08-03T00:00:00.000Z', locked: false, failedLogins: 0,
    lockedUntil: null, tokenVersion: 1, ...credential,
  };
  await writeFile(join(legacy, 'users.json'), JSON.stringify([user]));
  await writeFile(join(legacy, 'secret.key'), JSON.stringify({ secret: oldSecret }));
  await writeFile(join(legacy, 'projects', 'p1', 'project.json'), JSON.stringify({ id: 'p1' }));

  const dryRun = await migrateLegacyState({
    sourceDataDir: legacy, targetDataDir: targetData, targetSecretsDir: targetSecrets,
    dryRun: true, rotateSecret: true,
  });
  assert.equal(dryRun.status, 'dry-run');
  assert.equal(existsSync(targetData), false);
  assert.equal(existsSync(targetSecrets), false);

  const beforeUsers = await readFile(join(legacy, 'users.json'), 'utf8');
  const migrated = await migrateLegacyState({
    sourceDataDir: legacy, targetDataDir: targetData, targetSecretsDir: targetSecrets,
    rotateSecret: true,
  });
  assert.equal(migrated.status, 'migrated');
  assert.equal(await readFile(join(legacy, 'users.json'), 'utf8'), beforeUsers, 'legacy source changed');
  const targetUsers = JSON.parse(await readFile(join(targetData, 'users.json'), 'utf8'));
  assert.equal(targetUsers[0].tokenVersion, 2);
  const secretRecord = JSON.parse(await readFile(join(targetSecrets, 'session-hmac.json'), 'utf8'));
  assert.notEqual(secretRecord.secret, oldSecret);
  assert.equal(existsSync(join(targetData, 'secret.key')), false);
  assert.equal((await migrateLegacyState({
    sourceDataDir: legacy, targetDataDir: targetData, targetSecretsDir: targetSecrets, rotateSecret: true,
  })).status, 'already-migrated');

  const app = await bootTestApp({ dataDir: targetData, secretsDir: targetSecrets });
  try {
    const oldToken = issueToken(oldSecret, { uid: user.id, ver: 1 }, 3600).token;
    assert.equal((await app.api('GET', '/api/auth/me', { token: oldToken })).status, 401);
    const login = await app.api('POST', '/api/auth/login', { body: { email: user.email, password } });
    assert.equal(login.status, 200);
  } finally {
    await app.close();
  }

  const collisionData = join(root, 'collision-data');
  const collisionSecrets = join(root, 'collision-secrets');
  await mkdir(collisionData, { recursive: true });
  await writeFile(join(collisionData, 'occupied.txt'), 'occupied');
  await assert.rejects(() => migrateLegacyState({
    sourceDataDir: legacy, targetDataDir: collisionData, targetSecretsDir: collisionSecrets,
  }), /missing or empty/);

  const failedData = join(root, 'failed-data');
  const failedSecrets = join(root, 'failed-secrets');
  await assert.rejects(() => migrateLegacyState({
    sourceDataDir: legacy, targetDataDir: failedData, targetSecretsDir: failedSecrets,
    rotateSecret: true, failAt: 'after-verify',
  }), /Injected/);
  assert.equal(existsSync(failedData), false);
  assert.equal(existsSync(failedSecrets), false);

  const config = loadConfig({ env: {}, dataDir: join(root, 'config-data') });
  assert.match(config.secretsDir.replace(/\\/g, '/'), /config-data-secrets$/);
  assert.equal(validatePathLayout(config), true);
  assert.equal(config.allowRegistration, false);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, version: 'p12-m2-config-migration-secret-lifecycle-v1' }, null, 2));

