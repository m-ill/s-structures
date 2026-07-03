import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { hashPassword, verifyPassword } from '../auth/password.mjs';
import {
  ensureDir, newId, readJson, withLock, writeJsonAtomic, writeJsonAtomicUnlocked,
} from './fileStore.mjs';

export function createUserStore(dataDir) {
  const usersPath = join(dataDir, 'users.json');
  const secretPath = join(dataDir, 'secret.key');

  async function loadUsers() {
    return (await readJson(usersPath, [])) || [];
  }

  async function saveUsers(users) {
    await writeJsonAtomic(usersPath, users);
  }

  async function saveUsersUnlocked(users) {
    await writeJsonAtomicUnlocked(usersPath, users);
  }

  return {
    async getSecret() {
      await ensureDir(dataDir);
      const existing = await readJson(secretPath, null);
      if (existing?.secret) return existing.secret;
      const secret = randomBytes(48).toString('hex');
      await writeJsonAtomic(secretPath, { secret });
      return secret;
    },

    async findByEmail(email) {
      const normalized = String(email || '').trim().toLowerCase();
      const users = await loadUsers();
      return users.find((user) => user.email === normalized) || null;
    },

    async findById(id) {
      const users = await loadUsers();
      return users.find((user) => user.id === id) || null;
    },

    async create({ email, password, name }) {
      const normalized = String(email || '').trim().toLowerCase();
      const users = await loadUsers();
      if (users.some((user) => user.email === normalized)) {
        return { ok: false, code: 'EMAIL_TAKEN' };
      }
      const { salt, scrypt } = await hashPassword(password);
      const user = {
        id: newId(),
        email: normalized,
        name: String(name || normalized).trim(),
        scrypt,
        salt,
        createdAt: new Date().toISOString(),
        role: users.length === 0 ? 'admin' : 'user',
        locked: false,
        failedLogins: 0,
        lockedUntil: null,
        tokenVersion: 1,
      };
      users.push(user);
      await saveUsers(users);
      return { ok: true, user };
    },

    async verifyCredentials(email, password, { failLimit, lockSeconds }) {
      return withLock(usersPath, async () => {
        const normalized = String(email || '').trim().toLowerCase();
        const users = await loadUsers();
        const index = users.findIndex((user) => user.email === normalized);
        if (index === -1) return { ok: false, code: 'INVALID_CREDENTIALS' };
        const user = users[index];
        const now = Date.now();
        if (user.lockedUntil && new Date(user.lockedUntil).getTime() > now) {
          return { ok: false, code: 'LOCKED' };
        }
        const valid = await verifyPassword(password, user.salt, user.scrypt);
        if (!valid) {
          user.failedLogins = (user.failedLogins || 0) + 1;
          if (user.failedLogins >= failLimit) {
            user.lockedUntil = new Date(now + lockSeconds * 1000).toISOString();
            user.failedLogins = 0;
          }
          users[index] = user;
          await saveUsersUnlocked(users);
          return { ok: false, code: 'INVALID_CREDENTIALS' };
        }
        user.failedLogins = 0;
        user.lockedUntil = null;
        users[index] = user;
        await saveUsersUnlocked(users);
        return { ok: true, user };
      });
    },

    async bumpTokenVersion(userId) {
      const users = await loadUsers();
      const index = users.findIndex((user) => user.id === userId);
      if (index === -1) return null;
      users[index].tokenVersion = (users[index].tokenVersion || 1) + 1;
      await saveUsers(users);
      return users[index];
    },
  };
}

export function publicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt };
}
