import { realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const TOP_LEVEL_ASSETS = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/app.html', 'app.html'],
  ['/m3.html', 'm3.html'],
  ['/help.html', 'help.html'],
  ['/manual.html', 'manual.html'],
  ['/guide.html', 'guide.html'],
]);

const SOURCE_EXTENSIONS = new Set(['.js', '.css', '.wasm']);

export const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
};

export function resolvePublicAsset(staticRoot, rawPathname) {
  const pathname = decodePublicPath(rawPathname);
  let relativeAsset = TOP_LEVEL_ASSETS.get(pathname) || null;
  if (!relativeAsset && pathname.startsWith('/src/')) {
    if (!SOURCE_EXTENSIONS.has(extname(pathname).toLowerCase())) return null;
    relativeAsset = pathname.slice(1);
  }
  if (!relativeAsset) return null;

  const root = realpathOrResolved(staticRoot);
  const requested = resolve(staticRoot, relativeAsset);
  let realFile;
  try {
    realFile = realpathSync(requested);
  } catch {
    return null;
  }
  if (!isContained(root, realFile)) return null;
  const stat = statSync(realFile);
  if (!stat.isFile()) return null;
  return {
    filePath: realFile,
    contentType: STATIC_TYPES[extname(realFile).toLowerCase()] || 'application/octet-stream',
    cacheControl: extname(realFile).toLowerCase() === '.html' ? 'no-store' : 'no-cache',
  };
}

export function decodePublicPath(value) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(value || '/'));
  } catch {
    return '/__not-found__';
  }
  if (!decoded.startsWith('/') || decoded.includes('\0') || decoded.includes('\\')) return '/__not-found__';
  if (/%[0-9a-f]{2}/i.test(decoded)) return '/__not-found__';
  const segments = decoded.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.includes(':'))) {
    return '/__not-found__';
  }
  return decoded;
}

function realpathOrResolved(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function isContained(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

