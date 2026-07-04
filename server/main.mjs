import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { loadConfig } from './config.mjs';
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

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const BOOT_TIME = Date.now();

export function createApp(overrides = {}) {
  const config = loadConfig(overrides);
  const userStore = createUserStore(config.dataDir);
  const projectStore = createProjectStore(config.dataDir);
  const auditLog = createAuditLog(config.dataDir);
  const ctx = { config, userStore, projectStore, auditLog };
  const router = createRouter();

  router.get('/api/health', async () => ok({ status: 'ok', uptimeSeconds: (Date.now() - BOOT_TIME) / 1000 }));
  router.get('/api/meta', async () => ok({
    version: SERVER_API_VERSION,
    limits: { maxJsonBytes: config.maxJsonBytes, maxUploadBytes: config.maxUploadBytes },
    allowRegistration: config.allowRegistration,
  }));

  registerAuthRoutes(router, ctx);
  registerProjectRoutes(router, ctx);
  registerRevisionRoutes(router, ctx);
  registerFileRoutes(router, ctx);
  registerImportRoutes(router, ctx);
  registerApprovalRoutes(router, ctx);
  registerLibraryRoutes(router, ctx);
  registerEvidenceRoutes(router, ctx);

  const server = http.createServer((req, res) => handleRequest(req, res, router, config));
  return { server, config, ctx, router };
}

export async function startServer(overrides = {}) {
  const app = createApp(overrides);
  const lock = await acquireDataDirLock(app.config.dataDir);
  let released = false;

  async function releaseLock() {
    if (released) return;
    released = true;
    await lock.release();
  }

  app.server.once('close', () => {
    releaseLock().catch(() => {});
  });
  app.server.once('error', () => {
    releaseLock().catch(() => {});
  });

  return { ...app, dataDirLock: lock, releaseDataDirLock: releaseLock };
}

async function handleRequest(req, res, router, config) {
  const url = new URL(req.url || '/', 'http://internal');
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    await handleApi(req, res, router, pathname, config);
    return;
  }
  serveStatic(req, res, pathname, config);
}

async function handleApi(req, res, router, pathname, config) {
  try {
    const matched = router.match(req.method, pathname);
    if (!matched) {
      sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'No such API route.' } });
      return;
    }
    const needsBody = ['POST', 'PATCH', 'PUT'].includes(req.method) && matched.bodyType === 'json';
    const body = needsBody ? await readJsonBody(req, config.maxJsonBytes) : undefined;
    const result = await withProjectStoreRequestCache(() => matched.handler(req, res, matched.params, body));
    if (result?.handled) return;
    sendJson(res, 200, result);
  } catch (error) {
    const { status, body: errorBody } = errorEnvelope(error);
    if (!res.headersSent) sendJson(res, status, errorBody);
  }
}

function serveStatic(req, res, pathname, config) {
  try {
    const decodedPathname = decodeStaticPath(pathname);
    const safePath = normalize(decodedPathname).replace(/^(\.\.[/\\])+/, '');
    let filePath = resolve(join(config.staticRoot, safePath));
    if (!filePath.startsWith(config.staticRoot)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (decodedPathname === '/') filePath = join(config.staticRoot, 'index.html');
    const stat = statSync(filePath);
    if (stat.isDirectory()) filePath = join(filePath, 'index.html');
    res.writeHead(200, { 'Content-Type': STATIC_TYPES[extname(filePath)] || 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    if (error instanceof ApiError) {
      res.writeHead(error.status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.message);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

function decodeStaticPath(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    throw new ApiError(400, 'BAD_URI', 'Static path contains invalid percent encoding.');
  }
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
  };
}
