import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../server/auth/password.mjs';
import { issueToken, verifyToken, shouldRefresh } from '../server/auth/token.mjs';
import { roleAtLeast } from '../server/store/projectStore.mjs';
import { bootTestApp } from './helpers/serverTestApp.mjs';
import {
  AUTH_CONTRACT_VERSION, PHASE3_BASELINE_VERSION, SERVER_API_VERSION,
} from '../src/platform/platformVersion.js';

// M0 baseline: phase 3 contract versions are declared and stable
assert.equal(typeof PHASE3_BASELINE_VERSION, 'string');
assert.ok(PHASE3_BASELINE_VERSION.startsWith('p3-'));
assert.equal(typeof AUTH_CONTRACT_VERSION, 'string');
assert.ok(AUTH_CONTRACT_VERSION.startsWith('p3-'));
assert.equal(typeof SERVER_API_VERSION, 'string');

// password hashing
const { salt, scrypt } = await hashPassword('correct-horse-battery');
assert.equal(await verifyPassword('correct-horse-battery', salt, scrypt), true);
assert.equal(await verifyPassword('wrong-password', salt, scrypt), false);
assert.equal(validatePasswordStrength('short').ok, false);
assert.equal(validatePasswordStrength('a-long-enough-password').ok, true);

// token issue/verify/expire/forge
const secret = 'test-secret';
const { token } = issueToken(secret, { uid: 'u1', ver: 1 }, 3600);
const verified = verifyToken(secret, token);
assert.equal(verified.ok, true);
assert.equal(verified.claims.uid, 'u1');

const expired = issueToken(secret, { uid: 'u1', ver: 1 }, -10);
assert.equal(verifyToken(secret, expired.token).ok, false);
assert.equal(verifyToken(secret, expired.token).reason, 'EXPIRED');

const forged = `${token}tampered`;
assert.equal(verifyToken(secret, forged).ok, false);

const wrongSecret = verifyToken('other-secret', token);
assert.equal(wrongSecret.ok, false);
assert.equal(wrongSecret.reason, 'BAD_SIGNATURE');

assert.equal(verifyToken(secret, 'not-a-token').ok, false);

const soonToExpire = issueToken(secret, { uid: 'u1', ver: 1 }, 60);
assert.equal(shouldRefresh(verifyToken(secret, soonToExpire.token).claims, 30 * 60), true);
assert.equal(shouldRefresh(verifyToken(secret, token).claims, 30 * 60), false);

// role ranking
assert.equal(roleAtLeast('owner', 'viewer'), true);
assert.equal(roleAtLeast('viewer', 'owner'), false);
assert.equal(roleAtLeast('engineer', 'reviewer'), true);
assert.equal(roleAtLeast('reviewer', 'engineer'), false);
assert.equal(roleAtLeast(null, 'viewer'), false);

// role access matrix against a live server
const app = await bootTestApp();
try {
  const reg = await app.api('POST', '/api/auth/register', { body: { email: 'a@example.com', password: 'super-secret-pw', name: 'A' } });
  const ownerId = reg.data.data.user.id;
  const ownerLogin = await app.api('POST', '/api/auth/login', { body: { email: 'a@example.com', password: 'super-secret-pw' } });
  const ownerToken = ownerLogin.data.data.token;

  const project = await app.api('POST', '/api/projects', { token: ownerToken, body: { name: 'Matrix Project' } });
  const projectId = project.data.data.project.id;

  const roles = ['viewer', 'reviewer', 'engineer'];
  const tokens = {};
  for (const role of roles) {
    const email = `${role}@example.com`;
    await app.api('POST', '/api/auth/register', { body: { email, password: 'super-secret-pw', name: role } });
    const login = await app.api('POST', '/api/auth/login', { body: { email, password: 'super-secret-pw' } });
    tokens[role] = login.data.data.token;
    const userId = login.data.data.user.id;
    await app.api('PUT', `/api/projects/${projectId}/members/${userId}`, { token: ownerToken, body: { role } });
  }

  // viewer can read, cannot write
  const viewerRead = await app.api('GET', `/api/projects/${projectId}`, { token: tokens.viewer });
  assert.equal(viewerRead.status, 200);
  const viewerWrite = await app.api('PATCH', `/api/projects/${projectId}`, { token: tokens.viewer, body: { name: 'x' } });
  assert.equal(viewerWrite.status, 403);

  // reviewer can approve, cannot save revisions
  const reviewerRevision = await app.api('POST', `/api/projects/${projectId}/revisions`, {
    token: tokens.reviewer, body: { model: { schemaVersion: 3, nodes: [] } },
  });
  assert.equal(reviewerRevision.status, 403);

  // engineer can save revisions, cannot manage members
  const engineerRevision = await app.api('POST', `/api/projects/${projectId}/revisions`, {
    token: tokens.engineer, body: { model: { schemaVersion: 3, nodes: [] } },
  });
  assert.equal(engineerRevision.status, 200);
  const engineerMemberEdit = await app.api('PUT', `/api/projects/${projectId}/members/${ownerId}`, {
    token: tokens.engineer, body: { role: 'viewer' },
  });
  assert.equal(engineerMemberEdit.status, 403);

  const reviewerApproval = await app.api('POST', `/api/projects/${projectId}/approval`, {
    token: tokens.reviewer, body: { state: 'approved' },
  });
  assert.equal(reviewerApproval.status, 200, JSON.stringify(reviewerApproval.data));

  // logout invalidates the token (tokenVersion bump)
  const logout = await app.api('POST', '/api/auth/logout', { token: tokens.viewer });
  assert.equal(logout.status, 200);
  const afterLogout = await app.api('GET', `/api/projects/${projectId}`, { token: tokens.viewer });
  assert.equal(afterLogout.status, 401);

  // lockout after repeated failed logins
  const lockedApp = await bootTestApp({ loginFailLimit: 3, loginLockSeconds: 60 });
  try {
    await lockedApp.api('POST', '/api/auth/register', { body: { email: 'lockout@example.com', password: 'super-secret-pw', name: 'L' } });
    for (let i = 0; i < 3; i += 1) {
      await lockedApp.api('POST', '/api/auth/login', { body: { email: 'lockout@example.com', password: 'wrong' } });
    }
    const lockedAttempt = await lockedApp.api('POST', '/api/auth/login', { body: { email: 'lockout@example.com', password: 'super-secret-pw' } });
    assert.equal(lockedAttempt.status, 401);
  } finally {
    await lockedApp.close();
  }

  console.log(JSON.stringify({ ok: true, version: 'p3-auth', projectId }, null, 2));
} finally {
  await app.close();
}
