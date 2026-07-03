import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureDir } from './fileStore.mjs';

export function createAuditLog(dataDir, options = {}) {
  const path = options.path || join(dataDir, 'audit.log');

  return {
    path,
    async append(type, details = {}) {
      try {
        await ensureDir(dataDir);
        const row = {
          at: new Date().toISOString(),
          type,
          ...sanitize(details),
        };
        await appendFile(path, `${JSON.stringify(row)}\n`, 'utf8');
      } catch (error) {
        console.warn(`Audit log write failed: ${error.message}`);
      }
    },
  };
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (/password|token|secret/i.test(key)) continue;
    out[key] = sanitize(item);
  }
  return out;
}
