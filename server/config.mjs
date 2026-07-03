import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Resolve relative to this file (server/config.mjs), not process.cwd(),
// so the static root stays correct regardless of the shell's working
// directory when the server is launched.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(overrides = {}) {
  const env = overrides.env || process.env;
  const fileConfig = loadConfigFile(overrides.configPath || env.S_STRUCTURES_CONFIG);
  return {
    port: Number(env.PORT || overrides.port || fileConfig.port || 5180),
    host: env.HOST || overrides.host || fileConfig.host || '127.0.0.1',
    dataDir: resolve(overrides.dataDir || env.S_STRUCTURES_DATA_DIR || fileConfig.dataDir || resolve(root, 'data')),
    staticRoot: resolve(overrides.staticRoot || fileConfig.staticRoot || root),
    maxJsonBytes: Number(overrides.maxJsonBytes || fileConfig.maxJsonBytes || 20 * 1024 * 1024),
    maxUploadBytes: Number(overrides.maxUploadBytes || fileConfig.maxUploadBytes || 500 * 1024 * 1024),
    tokenTtlSeconds: Number(overrides.tokenTtlSeconds || fileConfig.tokenTtlSeconds || 12 * 60 * 60),
    loginFailLimit: Number(overrides.loginFailLimit || fileConfig.loginFailLimit || 10),
    loginLockSeconds: Number(overrides.loginLockSeconds || fileConfig.loginLockSeconds || 15 * 60),
    allowRegistration: overrides.allowRegistration ?? fileConfig.allowRegistration ?? (env.S_STRUCTURES_ALLOW_REGISTRATION !== 'false'),
    allowedUploadExtensions: overrides.allowedUploadExtensions || fileConfig.allowedUploadExtensions || [
      '.dxf', '.dwg', '.ply', '.xyz', '.txt', '.pcd', '.las', '.json',
    ],
  };
}

function loadConfigFile(configPath) {
  if (!configPath) return {};
  const path = resolve(configPath);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
}
