import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

// Resolve relative to this file (server/config.mjs), not process.cwd(),
// so the static root stays correct regardless of the shell's working
// directory when the server is launched.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(overrides = {}) {
  const env = overrides.env || process.env;
  const configPath = overrides.configPath || env.S_STRUCTURES_CONFIG || defaultConfigPath();
  const fileConfig = loadConfigFile(configPath);
  const stateRoot = resolve(overrides.stateRoot || env.S_STRUCTURES_STATE_DIR || fileConfig.stateRoot || defaultStateRoot(env));
  const dataDir = resolve(overrides.dataDir || env.S_STRUCTURES_DATA_DIR || fileConfig.dataDir || join(stateRoot, 'data'));
  const secretsDir = resolve(
    overrides.secretsDir
      || env.S_STRUCTURES_SECRETS_DIR
      || fileConfig.secretsDir
      || (overrides.dataDir || env.S_STRUCTURES_DATA_DIR || fileConfig.dataDir
        ? `${dataDir}-secrets`
        : join(stateRoot, 'secrets')),
  );
  const staticRoot = resolve(
    overrides.staticRoot
      || env.S_STRUCTURES_STATIC_ROOT
      || fileConfig.staticRoot
      || (existsSync(join(root, 'public')) ? join(root, 'public') : root),
  );
  return {
    port: Number(env.PORT || overrides.port || fileConfig.port || 5180),
    host: env.HOST || overrides.host || fileConfig.host || '127.0.0.1',
    stateRoot,
    dataDir,
    secretsDir,
    staticRoot,
    maxJsonBytes: Number(overrides.maxJsonBytes || fileConfig.maxJsonBytes || 20 * 1024 * 1024),
    maxUploadBytes: Number(overrides.maxUploadBytes || fileConfig.maxUploadBytes || 500 * 1024 * 1024),
    authJsonBytes: Number(overrides.authJsonBytes || fileConfig.authJsonBytes || 64 * 1024),
    tokenTtlSeconds: Number(overrides.tokenTtlSeconds || fileConfig.tokenTtlSeconds || 12 * 60 * 60),
    loginFailLimit: Number(overrides.loginFailLimit || fileConfig.loginFailLimit || 10),
    loginLockSeconds: Number(overrides.loginLockSeconds || fileConfig.loginLockSeconds || 15 * 60),
    allowRegistration: overrides.allowRegistration
      ?? parseBoolean(env.S_STRUCTURES_ALLOW_REGISTRATION)
      ?? fileConfig.allowRegistration
      ?? false,
    allowNetworkBind: overrides.allowNetworkBind
      ?? parseBoolean(env.S_STRUCTURES_ALLOW_NETWORK_BIND)
      ?? fileConfig.allowNetworkBind
      ?? false,
    allowedOrigins: overrides.allowedOrigins || fileConfig.allowedOrigins || [],
    authRateLimit: Number(overrides.authRateLimit || fileConfig.authRateLimit || 60),
    apiRateLimit: Number(overrides.apiRateLimit || fileConfig.apiRateLimit || 300),
    rateLimitWindowSeconds: Number(overrides.rateLimitWindowSeconds || fileConfig.rateLimitWindowSeconds || 60),
    requestTimeoutMs: Number(overrides.requestTimeoutMs || fileConfig.requestTimeoutMs || 30_000),
    maxProjectStorageBytes: Number(overrides.maxProjectStorageBytes || fileConfig.maxProjectStorageBytes || 1024 * 1024 * 1024),
    maxFilesPerProject: Number(overrides.maxFilesPerProject || fileConfig.maxFilesPerProject || 1000),
    maxConcurrentUploads: Number(overrides.maxConcurrentUploads || fileConfig.maxConcurrentUploads || 1),
    maxAuditLogBytes: Number(overrides.maxAuditLogBytes || fileConfig.maxAuditLogBytes || 5 * 1024 * 1024),
    minFreeSpaceBytes: Number(overrides.minFreeSpaceBytes || fileConfig.minFreeSpaceBytes || 100 * 1024 * 1024),
    allowedUploadExtensions: overrides.allowedUploadExtensions || fileConfig.allowedUploadExtensions || [
      '.dxf', '.dwg', '.ply', '.xyz', '.txt', '.pcd', '.las', '.json',
    ],
  };
}

export function validatePathLayout(config) {
  const roots = [
    ['staticRoot', config.staticRoot],
    ['dataDir', config.dataDir],
    ['secretsDir', config.secretsDir],
  ];
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      const [leftName, leftPath] = roots[left];
      const [rightName, rightPath] = roots[right];
      if (pathsOverlap(leftPath, rightPath)) {
        throw new Error(`Unsafe path layout: ${leftName} and ${rightName} must not overlap.`);
      }
    }
  }
  return true;
}

export function validateNetworkPolicy(config) {
  if (!isLoopbackHost(config.host) && !config.allowNetworkBind) {
    throw new Error('Non-loopback bind requires allowNetworkBind=true and an explicit security profile.');
  }
  return true;
}

function loadConfigFile(configPath) {
  if (!configPath) return {};
  const path = resolve(configPath);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
}

function defaultConfigPath() {
  const path = join(root, 'config.json');
  return existsSync(path) ? path : undefined;
}

function defaultStateRoot(env) {
  if (process.platform === 'win32') {
    return join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'S-Structures');
  }
  return join(env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 's-structures');
}

function parseBoolean(value) {
  if (value == null || value === '') return undefined;
  if (value === true || String(value).toLowerCase() === 'true') return true;
  if (value === false || String(value).toLowerCase() === 'false') return false;
  return undefined;
}

function pathsOverlap(left, right) {
  const a = normalizeForCompare(left);
  const b = normalizeForCompare(right);
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function normalizeForCompare(value) {
  const normalized = resolve(value).replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isLoopbackHost(host) {
  return ['127.0.0.1', 'localhost', '::1'].includes(String(host || '').toLowerCase());
}
