import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Resolve relative to this file (server/config.mjs), not process.cwd(),
// so the static root stays correct regardless of the shell's working
// directory when the server is launched.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(overrides = {}) {
  const env = overrides.env || process.env;
  return {
    port: Number(env.PORT || overrides.port || 5180),
    host: env.HOST || overrides.host || '127.0.0.1',
    dataDir: resolve(overrides.dataDir || env.S_STRUCTURES_DATA_DIR || resolve(root, 'data')),
    staticRoot: resolve(overrides.staticRoot || root),
    maxJsonBytes: Number(overrides.maxJsonBytes || 20 * 1024 * 1024),
    maxUploadBytes: Number(overrides.maxUploadBytes || 500 * 1024 * 1024),
    tokenTtlSeconds: Number(overrides.tokenTtlSeconds || 12 * 60 * 60),
    loginFailLimit: Number(overrides.loginFailLimit || 10),
    loginLockSeconds: Number(overrides.loginLockSeconds || 15 * 60),
    allowRegistration: overrides.allowRegistration ?? (env.S_STRUCTURES_ALLOW_REGISTRATION !== 'false'),
    allowedUploadExtensions: overrides.allowedUploadExtensions || [
      '.dxf', '.dwg', '.ply', '.xyz', '.txt', '.pcd', '.las', '.json',
    ],
  };
}
