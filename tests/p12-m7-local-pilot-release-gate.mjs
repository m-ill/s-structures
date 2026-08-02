import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import {
  mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { hashPassword } from '../server/auth/password.mjs';
import { issueToken } from '../server/auth/token.mjs';
import { createProjectStore } from '../server/store/projectStore.mjs';
import { migrateLegacyState } from '../server/store/stateMigration.mjs';
import { createTwoStoryElasticFrameModel } from '../src/index.js';

const sourceRoot = process.cwd();
const build = spawnSync(process.execPath, ['tools/build-release.mjs'], {
  cwd: sourceRoot, encoding: 'utf8', timeout: 180_000,
});
assert.equal(build.status, 0, build.stderr || build.stdout);
const release = JSON.parse(build.stdout);
const root = await mkdtemp(join(tmpdir(), 's-structures-p12-m7-'));
const unpackRoot = join(root, 'install');
const cleanRuns = [];
const migrationRuns = [];

try {
  await expandArchive(release.zip, unpackRoot);
  await verifyPackage(unpackRoot, release);
  await verifyHttpBoundary(sourceRoot, join(root, 'source-http'));
  await verifyHttpBoundary(unpackRoot, join(root, 'release-http'));

  for (let run = 1; run <= 3; run += 1) {
    cleanRuns.push(await runLocalPilot(unpackRoot, join(root, `local-${run}`), run));
  }
  assert.deepEqual(cleanRuns.map(parityShape), cleanRuns.map(() => parityShape(cleanRuns[0])));

  for (let run = 1; run <= 3; run += 1) {
    migrationRuns.push(await runLegacyMigration(unpackRoot, join(root, `legacy-${run}`), run));
  }
  assert.deepEqual(migrationRuns.map(parityShape), migrationRuns.map(() => parityShape(migrationRuns[0])));

  const failures = await runFailureMatrix(unpackRoot, join(root, 'failures'));
  assert.deepEqual(failures, {
    duplicateLockBlocked: true,
    storageQuotaBlocked: true,
    orphanUploadCount: 0,
    partialMigrationPublished: false,
    invalidTargetPublished: false,
    liveLegacyMigrationBlocked: true,
  });

  await verifyGovernance(release);

  console.log(JSON.stringify({
    ok: true,
    version: 'p12-m7-local-pilot-release-gate-v1',
    releaseSha256: release.sha256,
    releaseBytes: (await stat(release.zip)).size,
    publicFileCount: release.publicFileCount,
    releaseFileCount: release.releaseFileCount,
    localPilotRuns: cleanRuns.length,
    legacyMigrationRuns: migrationRuns.length,
    localParity: parityShape(cleanRuns[0]),
    migrationParity: parityShape(migrationRuns[0]),
    failures,
  }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}

async function runLocalPilot(installRoot, runRoot, run) {
  const dataDir = join(runRoot, 'state', 'data');
  const secretsDir = join(runRoot, 'state', 'secrets');
  const restoredData = join(runRoot, 'restored', 'data');
  const backupDir = join(runRoot, 'backup');
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const ownerEmail = `local-owner-${run}@example.invalid`;
  const reviewerEmail = `local-reviewer-${run}@example.invalid`;
  const password = 'synthetic-local-password';
  let server = await startServer(installRoot, dataDir, secretsDir, port, { allowRegistration: true });
  let projectId;
  let fileId;
  try {
    const owner = await registerAndLogin(baseUrl, ownerEmail, password);
    const reviewer = await registerAndLogin(baseUrl, reviewerEmail, password);
    const project = await api(baseUrl, 'POST', '/api/projects', { name: `Local Pilot ${run}` }, owner.token);
    assert.equal(project.status, 200);
    projectId = project.body.data.project.id;
    assert.equal((await api(baseUrl, 'PUT', `/api/projects/${projectId}/members/${reviewer.user.id}`, {
      role: 'reviewer',
    }, owner.token)).status, 200);

    const upload = await api(baseUrl, 'POST', `/api/projects/${projectId}/files`, Buffer.from('LINE\n0\n'), owner.token, {
      'content-type': 'application/dxf', 'x-file-name': `local-${run}.dxf`,
    });
    assert.equal(upload.status, 200);
    fileId = upload.body.data.file.id;

    const model = createTwoStoryElasticFrameModel();
    assert.equal((await api(baseUrl, 'POST', `/api/projects/${projectId}/revisions`, { model }, owner.token)).status, 200);
    const approved = await api(baseUrl, 'POST', `/api/projects/${projectId}/approval`, {
      state: 'approved', rev: 1, expectedVersion: 0,
    }, reviewer.token);
    assert.equal(approved.status, 200);
    const released = await api(baseUrl, 'POST', `/api/projects/${projectId}/approval`, {
      state: 'released', rev: 1, expectedVersion: 1,
    }, owner.token);
    assert.equal(released.status, 200);
    assert.equal(released.body.data.approval.current, true);
    assert.equal(released.body.data.approval.history.length, 2);
    await scanSensitiveUrls(baseUrl);
  } finally {
    await stopServer(server);
  }

  server = await startServer(installRoot, dataDir, secretsDir, port, { allowRegistration: false });
  try {
    const owner = await login(baseUrl, ownerEmail, password);
    const projects = await api(baseUrl, 'GET', '/api/projects', undefined, owner.token);
    assert.equal(projects.body.data.projects.length, 1);
    const approval = await api(baseUrl, 'GET', `/api/projects/${projectId}/approval`, undefined, owner.token);
    assert.equal(approval.body.data.approval.state, 'released');
    const download = await api(baseUrl, 'GET', `/api/projects/${projectId}/files/${fileId}`, undefined, owner.token);
    assert.equal(download.status, 200);
    assert.equal(Buffer.from(download.body).toString('utf8'), 'LINE\n0\n');
    assert.equal((await api(baseUrl, 'POST', `/api/projects/${projectId}/revisions`, {
      model: { ...createTwoStoryElasticFrameModel(), p12PilotRevision: 2 }, parentRev: 1,
    }, owner.token)).status, 200);
    const stale = await api(baseUrl, 'GET', `/api/projects/${projectId}/approval`, undefined, owner.token);
    assert.equal(stale.body.data.approval.state, 'stale');
    assert.equal(stale.body.data.approval.current, false);
    assert.ok(stale.body.data.approval.history.some((row) => row.state === 'released'));
  } finally {
    await stopServer(server);
  }

  const beforeBackup = await treeManifest(dataDir);
  const backup = spawnSync(process.execPath, [
    join(installRoot, 'tools', 'backup-data.mjs'), `--dataDir=${dataDir}`, `--out=${backupDir}`, '--verify',
  ], { cwd: installRoot, encoding: 'utf8', timeout: 120_000 });
  assert.equal(backup.status, 0, backup.stderr || backup.stdout);
  assert.equal(JSON.parse(backup.stdout).verified, true);
  const restore = spawnSync(process.execPath, [
    join(installRoot, 'tools', 'restore-data.mjs'), `--backup=${backupDir}`, `--dataDir=${restoredData}`,
  ], { cwd: installRoot, encoding: 'utf8', timeout: 120_000 });
  assert.equal(restore.status, 0, restore.stderr || restore.stdout);
  assert.deepEqual(await treeManifest(restoredData), beforeBackup);

  server = await startServer(installRoot, restoredData, secretsDir, port, { allowRegistration: false });
  try {
    const owner = await login(baseUrl, ownerEmail, password);
    const projects = await api(baseUrl, 'GET', '/api/projects', undefined, owner.token);
    const revisions = await api(baseUrl, 'GET', `/api/projects/${projectId}/revisions`, undefined, owner.token);
    const files = await api(baseUrl, 'GET', `/api/projects/${projectId}/files`, undefined, owner.token);
    const approval = await api(baseUrl, 'GET', `/api/projects/${projectId}/approval`, undefined, owner.token);
    assert.equal(projects.body.data.projects.length, 1);
    assert.equal(revisions.body.data.revisions.length, 2);
    assert.equal(files.body.data.files.length, 1);
    assert.equal(approval.body.data.approval.state, 'stale');
    assert.ok(approval.body.data.approval.history.some((row) => row.state === 'released'));
    return {
      userCount: 2, projectCount: 1, revisionCount: 2, uploadCount: 1,
      approvalState: approval.body.data.approval.state,
      releasedHistoryCount: approval.body.data.approval.history.filter((row) => row.state === 'released').length,
      backupHash: beforeBackup.sha256,
    };
  } finally {
    await stopServer(server);
  }
}

async function runLegacyMigration(installRoot, runRoot, run) {
  const legacy = join(runRoot, 'legacy-data');
  const targetData = join(runRoot, 'state', 'data');
  const targetSecrets = join(runRoot, 'state', 'secrets');
  const failedData = join(runRoot, 'failed', 'data');
  const failedSecrets = join(runRoot, 'failed', 'secrets');
  const password = 'synthetic-legacy-password';
  const oldSecret = String(run).repeat(96);
  const credential = await hashPassword(password);
  const user = {
    id: `00000000-0000-4000-8000-${String(run).padStart(12, '0')}`,
    email: `legacy-${run}@example.invalid`, name: 'Synthetic Legacy', role: 'admin',
    createdAt: '2026-08-03T00:00:00.000Z', locked: false, failedLogins: 0,
    lockedUntil: null, tokenVersion: 1, ...credential,
  };
  await mkdir(legacy, { recursive: true });
  await writeFile(join(legacy, 'users.json'), `${JSON.stringify([user], null, 2)}\n`);
  await writeFile(join(legacy, 'secret.key'), `${JSON.stringify({ secret: oldSecret })}\n`);
  const store = createProjectStore(legacy);
  const project = await store.create(user.id, { name: `Legacy ${run}`, description: '' });
  const file = await store.saveFile(project.id, {
    originalName: `legacy-${run}.dxf`, contentType: 'application/dxf', buffer: Buffer.from('LINE\n0\n'),
  }, ['.dxf'], { maxFiles: 10, maxBytes: 1024 });
  assert.equal(file.ok, true);
  await store.saveRevision(project.id, { model: createTwoStoryElasticFrameModel(), author: user.id });
  assert.equal((await store.transitionApproval(project.id, {
    state: 'approved', rev: 1, actorId: user.id, expectedVersion: 0,
  })).ok, true);
  assert.equal((await store.transitionApproval(project.id, {
    state: 'released', rev: 1, actorId: user.id, expectedVersion: 1,
  })).ok, true);
  const sourceBefore = await treeManifest(legacy);
  const oldToken = issueToken(oldSecret, { uid: user.id, ver: 1 }, 3600).token;

  await assert.rejects(() => migrateLegacyState({
    sourceDataDir: legacy, targetDataDir: failedData, targetSecretsDir: failedSecrets,
    rotateSecret: true, failAt: 'after-verify',
  }), /Injected migration failure/);
  assert.equal(existsSync(failedData), false);
  assert.equal(existsSync(failedSecrets), false);

  const migrated = await migrateLegacyState({
    sourceDataDir: legacy, targetDataDir: targetData, targetSecretsDir: targetSecrets, rotateSecret: true,
  });
  assert.equal(migrated.status, 'migrated');
  assert.deepEqual(await treeManifest(legacy), sourceBefore);
  assert.equal((await migrateLegacyState({
    sourceDataDir: legacy, targetDataDir: targetData, targetSecretsDir: targetSecrets, rotateSecret: true,
  })).status, 'already-migrated');

  const secretRecord = JSON.parse(await readFile(join(targetSecrets, 'session-hmac.json'), 'utf8'));
  assert.notEqual(secretRecord.secret, oldSecret);
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let server = await startServer(installRoot, targetData, targetSecrets, port, { allowRegistration: false });
  try {
    assert.equal((await api(baseUrl, 'GET', '/api/auth/me', undefined, oldToken)).status, 401);
    const current = await login(baseUrl, user.email, password);
    const projects = await api(baseUrl, 'GET', '/api/projects', undefined, current.token);
    const revisions = await api(baseUrl, 'GET', `/api/projects/${project.id}/revisions`, undefined, current.token);
    const files = await api(baseUrl, 'GET', `/api/projects/${project.id}/files`, undefined, current.token);
    const approval = await api(baseUrl, 'GET', `/api/projects/${project.id}/approval`, undefined, current.token);
    assert.equal(projects.body.data.projects.length, 1);
    assert.equal(revisions.body.data.revisions.length, 1);
    assert.equal(files.body.data.files.length, 1);
    assert.equal(approval.body.data.approval.state, 'released');
    assert.equal((await api(baseUrl, 'POST', `/api/projects/${project.id}/revisions`, {
      model: { ...createTwoStoryElasticFrameModel(), migratedRevision: 2 }, parentRev: 1,
    }, current.token)).status, 200);
    const stale = await api(baseUrl, 'GET', `/api/projects/${project.id}/approval`, undefined, current.token);
    assert.equal(stale.body.data.approval.state, 'stale');
    return {
      userCount: 1, projectCount: 1, revisionCount: 2, uploadCount: 1,
      approvalState: stale.body.data.approval.state,
      releasedHistoryCount: stale.body.data.approval.history.filter((row) => row.state === 'released').length,
      sourceFileCount: sourceBefore.files.length,
    };
  } finally {
    await stopServer(server);
  }
}

async function runFailureMatrix(installRoot, failureRoot) {
  await mkdir(failureRoot, { recursive: true });
  const lockData = join(failureRoot, 'lock', 'data');
  const lockSecrets = join(failureRoot, 'lock', 'secrets');
  const firstPort = await freePort();
  const first = await startServer(installRoot, lockData, lockSecrets, firstPort, { allowRegistration: true });
  let duplicateLockBlocked = false;
  try {
    const secondPort = await freePort();
    const second = spawnServer(installRoot, lockData, lockSecrets, secondPort, { allowRegistration: true });
    const [exitCode] = await Promise.race([
      once(second, 'exit'),
      delay(5000).then(async () => { await stopServer(second); return [null]; }),
    ]);
    duplicateLockBlocked = exitCode === 1;
  } finally {
    await stopServer(first);
  }

  const quotaRoot = join(failureRoot, 'quota');
  const quotaConfig = join(quotaRoot, 'config.json');
  await mkdir(quotaRoot, { recursive: true });
  await writeFile(quotaConfig, `${JSON.stringify({ maxProjectStorageBytes: 8, maxUploadBytes: 64 })}\n`);
  const quotaData = join(quotaRoot, 'data');
  const quotaSecrets = join(quotaRoot, 'secrets');
  const quotaPort = await freePort();
  const quotaUrl = `http://127.0.0.1:${quotaPort}`;
  const quotaServer = await startServer(installRoot, quotaData, quotaSecrets, quotaPort, {
    allowRegistration: true, configPath: quotaConfig,
  });
  let storageQuotaBlocked = false;
  let orphanUploadCount = -1;
  try {
    const owner = await registerAndLogin(quotaUrl, 'quota@example.invalid', 'synthetic-quota-password');
    const project = await api(quotaUrl, 'POST', '/api/projects', { name: 'Quota' }, owner.token);
    const projectId = project.body.data.project.id;
    const blocked = await api(quotaUrl, 'POST', `/api/projects/${projectId}/files`, Buffer.from('123456789'), owner.token, {
      'content-type': 'application/dxf', 'x-file-name': 'quota.dxf',
    });
    storageQuotaBlocked = blocked.status === 413 && blocked.body.error.code === 'STORAGE_QUOTA';
    const files = await api(quotaUrl, 'GET', `/api/projects/${projectId}/files`, undefined, owner.token);
    orphanUploadCount = files.body.data.files.length;
  } finally {
    await stopServer(quotaServer);
  }

  const legacy = join(failureRoot, 'migration-source');
  await mkdir(legacy, { recursive: true });
  await writeFile(join(legacy, 'users.json'), '[]\n');
  await writeFile(join(legacy, 'secret.key'), `${JSON.stringify({ secret: 'x'.repeat(96) })}\n`);
  const partialData = join(failureRoot, 'partial', 'data');
  const partialSecrets = join(failureRoot, 'partial', 'secrets');
  await assert.rejects(() => migrateLegacyState({
    sourceDataDir: legacy, targetDataDir: partialData, targetSecretsDir: partialSecrets,
    rotateSecret: true, failAt: 'before-publish',
  }), /Injected migration failure/);
  const partialMigrationPublished = existsSync(partialData) || existsSync(partialSecrets);

  const targetBlocker = join(failureRoot, 'not-a-directory');
  await writeFile(targetBlocker, 'blocked');
  const invalidData = join(targetBlocker, 'data');
  const invalidSecrets = join(failureRoot, 'invalid-secrets');
  await assert.rejects(() => migrateLegacyState({
    sourceDataDir: legacy, targetDataDir: invalidData, targetSecretsDir: invalidSecrets, rotateSecret: true,
  }));
  const invalidTargetPublished = existsSync(invalidSecrets);

  await writeFile(join(legacy, 'server.lock'), '{}\n');
  await assert.rejects(() => migrateLegacyState({
    sourceDataDir: legacy,
    targetDataDir: join(failureRoot, 'locked-source', 'data'),
    targetSecretsDir: join(failureRoot, 'locked-source', 'secrets'),
    rotateSecret: true,
  }), /stop the server before migration/);

  return {
    duplicateLockBlocked,
    storageQuotaBlocked,
    orphanUploadCount,
    partialMigrationPublished,
    invalidTargetPublished,
    liveLegacyMigrationBlocked: true,
  };
}

async function verifyPackage(installRoot, release) {
  const manifest = JSON.parse(await readFile(join(installRoot, 'release-manifest.json'), 'utf8'));
  assert.equal(manifest.forbiddenPathCount, 0);
  assert.equal(manifest.files.length + 1, release.releaseFileCount, 'release manifest does not self-hash');
  const paths = await listFiles(installRoot);
  assert.equal(paths.length, release.releaseFileCount);
  assert.deepEqual(paths.filter((path) => /(^|\/)(\.git|data|secrets|reports|output|tmp)(\/|$)/i.test(path)), []);
  for (const file of manifest.files) {
    const buffer = await readFile(join(installRoot, file.path));
    assert.equal(buffer.length, file.bytes, file.path);
    assert.equal(hashBuffer(buffer), file.sha256, file.path);
  }
  const publicManifest = JSON.parse(await readFile(join(installRoot, 'public', 'web-asset-manifest.json'), 'utf8'));
  assert.equal(publicManifest.files.length, release.publicFileCount);
  for (const file of publicManifest.files) {
    const buffer = await readFile(join(installRoot, 'public', file.path));
    assert.equal(buffer.length, file.bytes, file.path);
    assert.equal(hashBuffer(buffer), file.sha256, file.path);
  }
  const syntheticMarkers = ['local-owner-1@example.invalid', 'synthetic-local-password', 'synthetic-legacy-password'];
  for (const path of paths.filter((value) => /\.(?:json|mjs|js|html|css|md|txt)$/i.test(value))) {
    const text = await readFile(join(installRoot, path), 'utf8');
    for (const marker of syntheticMarkers) assert.equal(text.includes(marker), false, `${path}: ${marker}`);
  }
}

async function verifyHttpBoundary(serverRoot, stateRoot) {
  const dataDir = join(stateRoot, 'data');
  const secretsDir = join(stateRoot, 'secrets');
  const port = await freePort();
  const child = await startServer(serverRoot, dataDir, secretsDir, port, { allowRegistration: true });
  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${baseUrl}/api/readiness`)).status, 200);
    await scanSensitiveUrls(baseUrl);
  } finally {
    await stopServer(child);
  }
}

async function scanSensitiveUrls(baseUrl) {
  for (const path of [
    '/.git/HEAD', '/%2e%2e/package.json', '/package.json', '/server/main.mjs',
    '/config.sample.json', '/data/users.json', '/data/server.lock', '/data/secret.key',
    '/secrets/session-hmac.json', '/release-manifest.json', '/reports/', '/output/', '/tmp/',
  ]) {
    assert.equal((await fetch(`${baseUrl}${path}`)).status, 404, path);
  }
}

async function verifyGovernance(release) {
  for (let milestone = 0; milestone <= 6; milestone += 1) {
    const names = (await readdir(join('reports', 'validation-evidence', 'phase12')))
      .filter((name) => name.startsWith(`p12-m${milestone}-`) && name.endsWith('.json'));
    assert.equal(names.length, 1, `P12-M${milestone} evidence count`);
    const evidence = JSON.parse(await readFile(join('reports', 'validation-evidence', 'phase12', names[0]), 'utf8'));
    assert.equal(evidence.status, 'PASS', names[0]);
    assert.match(evidence.sourceRevision, /^[0-9a-f]{40}$/);
    const review = await readFile(join('docs', 'phase12', 'reviews', `P12-M${milestone}-CODE-REVIEW.md`), 'utf8');
    assert.match(review, /verdict:\s*PASS/);
    assert.match(review, /critical_findings_open:\s*0/);
    assert.match(review, /high_findings_open:\s*0/);
  }
  const finalReview = await readFile(join('docs', 'phase12', 'reviews', 'P12-M7-CODE-REVIEW.md'), 'utf8');
  assert.match(finalReview, /verdict:\s*PASS/);
  assert.match(finalReview, /critical_findings_open:\s*0/);
  assert.match(finalReview, /high_findings_open:\s*0/);

  const docManifest = JSON.parse(await readFile(join('docs', 'verification', 'phase12', 'release-manifest.json'), 'utf8'));
  const evidenceManifest = JSON.parse(await readFile(join('reports', 'validation-evidence', 'phase12', 'p12-release-manifest.json'), 'utf8'));
  assert.deepEqual(docManifest, evidenceManifest);
  assert.equal(docManifest.status, 'release-qualified');
  assert.equal(docManifest.releaseQualified, true);
  assert.equal(docManifest.localPilotAllowed, true);
  assert.equal(docManifest.productReleaseAllowed, false);
  assert.equal(docManifest.lanAllowed, false);
  assert.equal(docManifest.publicInternetAllowed, false);
  assert.equal(docManifest.designTransferAllowed, false);
  assert.deepEqual(docManifest.completedMilestones, docManifest.requiredMilestones);
  assert.deepEqual(docManifest.blockers, []);
  assert.equal(docManifest.artifact.sha256, release.sha256);
  assert.equal(docManifest.artifact.publicFileCount, release.publicFileCount);
  assert.equal(docManifest.artifact.releaseFileCount, release.releaseFileCount);
  for (const row of docManifest.evidence) {
    const buffer = await readFile(row.path);
    assert.equal(hashBuffer(buffer), row.sha256, row.path);
  }
  const inventory = JSON.parse(await readFile('docs/verification/phase12/test-inventory.json', 'utf8'));
  assert.equal(inventory.total, 351);
  assert.equal(inventory.defaultCount, 312);
  assert.equal(inventory.releaseLongCount, 39);
  assert.equal(inventory.unclassifiedCount, 0);
}

async function registerAndLogin(baseUrl, email, password) {
  const registered = await api(baseUrl, 'POST', '/api/auth/register', { email, password, name: 'Synthetic User' });
  assert.equal(registered.status, 200, JSON.stringify(registered.body));
  return login(baseUrl, email, password);
}

async function login(baseUrl, email, password) {
  const response = await api(baseUrl, 'POST', '/api/auth/login', { email, password });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data;
}

async function api(baseUrl, method, path, body, token, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  const options = { method, headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (Buffer.isBuffer(body) || typeof body === 'string') options.body = body;
  else if (body !== undefined) {
    headers['Content-Type'] ||= 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${path}`, options);
  const contentType = response.headers.get('content-type') || '';
  const responseBody = contentType.includes('application/json')
    ? await response.json()
    : await response.arrayBuffer();
  return { status: response.status, body: responseBody, headers: response.headers };
}

async function expandArchive(zip, destination) {
  const expanded = spawnSync('powershell.exe', [
    '-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`,
  ], { encoding: 'utf8', timeout: 120_000 });
  assert.equal(expanded.status, 0, expanded.stderr || expanded.stdout);
}

async function startServer(serverRoot, dataDir, secretsDir, port, options = {}) {
  const child = spawnServer(serverRoot, dataDir, secretsDir, port, options);
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const url = `http://127.0.0.1:${port}/api/health`;
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    if (child.exitCode !== null) throw new Error(`Server exited ${child.exitCode}: ${stderr}`);
    try {
      if ((await fetch(url)).ok) return child;
    } catch {}
    await delay(50);
  }
  await stopServer(child);
  throw new Error(`Server startup timed out: ${stderr}`);
}

function spawnServer(serverRoot, dataDir, secretsDir, port, options = {}) {
  return spawn(process.execPath, [join(serverRoot, 'server', 'main.mjs'), String(port)], {
    cwd: serverRoot,
    env: {
      ...process.env,
      S_STRUCTURES_DATA_DIR: dataDir,
      S_STRUCTURES_SECRETS_DIR: secretsDir,
      S_STRUCTURES_ALLOW_REGISTRATION: options.allowRegistration ? 'true' : 'false',
      ...(options.configPath ? { S_STRUCTURES_CONFIG: options.configPath } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), delay(2000).then(() => child.kill('SIGKILL'))]);
}

async function treeManifest(directory) {
  const files = await listFiles(directory);
  const records = await Promise.all(files
    .filter((path) => path !== 'server.lock')
    .map(async (path) => {
      const buffer = await readFile(join(directory, path));
      return { path, bytes: buffer.length, sha256: hashBuffer(buffer) };
    }));
  return { files: records, sha256: hashBuffer(Buffer.from(JSON.stringify(records))) };
}

async function listFiles(directory, prefix = '') {
  const rows = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) rows.push(...await listFiles(directory, relative));
    else rows.push(relative.replaceAll('\\', '/'));
  }
  return rows.sort();
}

function parityShape(run) {
  return {
    userCount: run.userCount,
    projectCount: run.projectCount,
    revisionCount: run.revisionCount,
    uploadCount: run.uploadCount,
    approvalState: run.approvalState,
    releasedHistoryCount: run.releasedHistoryCount,
    ...(run.sourceFileCount != null ? { sourceFileCount: run.sourceFileCount } : {}),
  };
}

function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  server.close();
  await once(server, 'close');
  return port;
}
