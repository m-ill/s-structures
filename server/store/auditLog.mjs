import { appendFile, rename, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ensureDir } from './fileStore.mjs';

export function createAuditLog(dataDir, options = {}) {
  const path = options.path || join(dataDir, 'audit.log');
  const maxBytes = Number(options.maxBytes || 5 * 1024 * 1024);
  let pending = Promise.resolve();

  return {
    path,
    async append(type, details = {}) {
      pending = pending.then(async () => {
        await ensureDir(dataDir);
        const row = {
          at: new Date().toISOString(),
          type,
          ...sanitize(details),
        };
        const text = `${JSON.stringify(row)}\n`;
        await rotateIfNeeded(path, maxBytes, Buffer.byteLength(text));
        await appendFile(path, text, 'utf8');
      }).catch((error) => {
        console.warn(`Audit log write failed: ${error.message}`);
      });
      await pending;
    },
  };
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (/password|token|secret/i.test(key)) continue;
    if (/email/i.test(key)) {
      out[`${key}Hash`] = createHash('sha256').update(String(item || '').trim().toLowerCase()).digest('hex').slice(0, 16);
      continue;
    }
    out[key] = sanitize(item);
  }
  return out;
}

async function rotateIfNeeded(path, maxBytes, incomingBytes) {
  let size = 0;
  try {
    size = (await stat(path)).size;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (size + incomingBytes <= maxBytes) return;
  const rotated = `${path}.1`;
  await rm(rotated, { force: true });
  try {
    await rename(path, rotated);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
