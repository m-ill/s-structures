import http from 'node:http';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, validateNetworkPolicy, validatePathLayout } from './config.mjs';
import { ApiError, createRouter, errorEnvelope, ok, readJsonBody, sendJson } from './router.mjs';
import { createUserStore } from './store/userStore.mjs';
import { createProjectStore, withProjectStoreRequestCache } from './store/projectStore.mjs';
import { acquireDataDirLock, DataDirLockError } from './store/lockfile.mjs';
import { createAuditLog } from './store/auditLog.mjs';
import { registerAuthRoutes } from './routes/auth.mjs';
import { registerProjectRoutes } from './routes/projects.mjs';
import { registerRevisionRoutes } from './routes/revisions.mjs';
import { registerFileRoutes } from './routes/files.mjs';
import { registerImportRoutes } from './routes/imports.mjs';
import { registerApprovalRoutes } from './routes/approval.mjs';
import { registerLibraryRoutes } from './routes/libraries.mjs';
import { registerEvidenceRoutes } from './routes/evidence.mjs';
import { SERVER_API_VERSION } from '../src/platform/platformVersion.js';
import { resolvePublicAsset } from './staticAssets.mjs';
import {
  applySecurityHeaders, createRateLimiter, isHostAllowed, isOriginAllowed, requestClientKey,
} from './security/httpPolicy.mjs';
import { checkReadiness } from './readiness.mjs';

const BOOT_TIME = Date.now();

export function createApp(overrides = {}) {
  const config = loadConfig(overrides);
  validatePathLayout(config);
  const userStore = createUserStore(config.dataDir, { secretsDir: config.secretsDir });
  const projectStore = createProjectStore(config.dataDir);
  const auditLog = createAuditLog(config.dataDir, { maxBytes: config.maxAuditLogBytes });
  const ctx = {
    config, userStore, projectStore, auditLog,
    rateLimiter: createRateLimiter(),
    runtime: { lockRequired: false, lockOwned: false, migrationComplete: true },
  };
  const router = createRouter();

  router.get('/api/health', async () => ok({ status: 'ok', uptimeSeconds: (Date.now() - BOOT_TIME) / 1000 }));
  router.get('/api/meta', async () => ok({
    version: SERVER_API_VERSION,
    limits: { maxJsonBytes: config.maxJsonBytes, maxUploadBytes: config.maxUploadBytes },
    allowRegistration: config.allowRegistration,
  }));
  router.get('/api/readiness', async () => ok(await checkReadiness(config, ctx.runtime)));

  registerAuthRoutes(router, ctx);
  registerProjectRoutes(router, ctx);
  registerRevisionRoutes(router, ctx);
  registerFileRoutes(router, ctx);
  registerImportRoutes(router, ctx);
  registerApprovalRoutes(router, ctx);
  registerLibraryRoutes(router, ctx);
  registerEvidenceRoutes(router, ctx);

  const server = http.createServer((req, res) => handleRequest(req, res, router, config, ctx));
  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = Math.min(config.requestTimeoutMs, 30_000);
  return { server, config, ctx, router };
}

export async function startServer(overrides = {}) {
  const app = createApp(overrides);
  validateNetworkPolicy(app.config);
  app.ctx.runtime.lockRequired = true;
  const lock = await acquireDataDirLock(app.config.dataDir);
  app.ctx.runtime.lockOwned = true;
  let released = false;

  async function releaseLock() {
    if (released) return;
    released = true;
    await lock.release();
    app.ctx.runtime.lockOwned = false;
  }

  app.server.once('close', () => {
    releaseLock().catch(() => {});
  });
  app.server.once('error', () => {
    releaseLock().catch(() => {});
  });

  return { ...app, dataDirLock: lock, releaseDataDirLock: releaseLock };
}

async function handleRequest(req, res, router, config, ctx) {
  const url = new URL(req.url || '/', 'http://internal');
  const pathname = url.pathname;
  applySecurityHeaders(res, { api: pathname.startsWith('/api/'), modelerFrame: pathname === '/index.html' && url.searchParams.get('shell') === '1' });

  if (!isHostAllowed(req, config)) {
    sendJson(res, 400, { ok: false, error: { code: 'BAD_HOST', message: 'Request Host is not allowed.' } });
    return;
  }

  if (pathname.startsWith('/api/')) {
    await handleApi(req, res, router, pathname, config, ctx);
    return;
  }
  serveStatic(req, res, pathname, config);
}

async function handleApi(req, res, router, pathname, config, ctx) {
  try {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !isOriginAllowed(req, config)) {
      throw new ApiError(403, 'ORIGIN_FORBIDDEN', 'Request Origin is not allowed.');
    }
    enforceRateLimit(req, res, pathname, config, ctx);
    const matched = router.match(req.method, pathname);
    if (!matched) {
      const allowed = router.allowedMethods(pathname);
      if (allowed.length) {
        res.setHeader('Allow', allowed.join(', '));
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method is not allowed for this API route.');
      }
      sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'No such API route.' } });
      return;
    }
    const needsBody = ['POST', 'PATCH', 'PUT'].includes(req.method) && matched.bodyType === 'json';
    const bodyLimit = pathname.startsWith('/api/auth/') ? config.authJsonBytes : config.maxJsonBytes;
    const body = needsBody ? await readJsonBody(req, bodyLimit) : undefined;
    const result = await withProjectStoreRequestCache(() => matched.handler(req, res, matched.params, body));
    if (result?.handled) return;
    sendJson(res, 200, result);
  } catch (error) {
    const { status, body: errorBody } = errorEnvelope(error);
    if (!res.headersSent) sendJson(res, status, errorBody);
  }
}

function enforceRateLimit(req, res, pathname, config, ctx) {
  const client = requestClientKey(req);
  const auth = pathname === '/api/auth/login' || pathname === '/api/auth/register';
  const limit = auth ? config.authRateLimit : config.apiRateLimit;
  const bucket = auth ? `auth:${client}:${pathname}` : `api:${client}`;
  const result = ctx.rateLimiter.consume(bucket, limit, config.rateLimitWindowSeconds);
  res.setHeader('RateLimit-Limit', String(result.limit));
  res.setHeader('RateLimit-Remaining', String(result.remaining));
  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfterSeconds));
    throw new ApiError(429, 'RATE_LIMITED', 'Too many requests.');
  }
}

export function serveStatic(req, res, pathname, config) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, staticHeaders({ Allow: 'GET, HEAD', 'Cache-Control': 'no-store' }));
    res.end('Method not allowed');
    return;
  }
  try {
    decodeURIComponent(pathname);
  } catch {
    res.writeHead(400, staticHeaders({ 'Cache-Control': 'no-store' }));
    res.end('Bad request');
    return;
  }
  const asset = resolvePublicAsset(config.staticRoot, pathname);
  if (!asset) {
    res.writeHead(404, staticHeaders({ 'Cache-Control': 'no-store' }));
    res.end('Not found');
    return;
  }
  const headers = staticHeaders({
    'Content-Type': asset.contentType,
    'Cache-Control': asset.cacheControl,
  });
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(asset.filePath).pipe(res);
}

function staticHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    ...extra,
  };
}

export function isMainEntry(entry = process.argv[1] || '') {
  return entry.replace(/\\/g, '/').endsWith('server/main.mjs');
}

if (isMainEntry()) {
  try {
    const app = await startServer(parseCliOverrides(process.argv));
    app.server.listen(app.config.port, app.config.host, () => {
      console.log(`S-Structures server: http://${app.config.host}:${app.config.port}/`);
    });
    app.server.on('error', (error) => {
      throw error;
    });
  } catch (error) {
    if (error instanceof DataDirLockError || error?.code === 'EADDRINUSE') {
      console.error(error.message);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}

function parseCliOverrides(argv) {
  const port = Number(argv[2] || 0);
  const host = argv[3];
  return {
    ...(Number.isFinite(port) && port > 0 ? { port } : {}),
    ...(host ? { host } : {}),
    ...(argv.includes('--allow-network-bind') ? { allowNetworkBind: true } : {}),
  };
}
