import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { remapLegacyVerificationPath } from '../verification/workspace-paths.mjs';

const roots = ['docs/phase3', 'docs/phase9', 'verification/specs', 'docs/user-manual'];
const docs = roots.flatMap((root) => listFiles(root).filter((file) => /\.(md|json)$/.test(file)));
const refs = docs.flatMap((file) => extractRefs(file, readFileSync(file, 'utf8')));
const missing = refs.filter((item) => !referenceExists(item.ref));

assert.deepEqual(missing, []);

console.log(JSON.stringify({
  ok: true,
  scannedDocs: docs.length,
  checkedRefs: refs.length,
}, null, 2));

function extractRefs(file, text) {
  const refs = [];
  const patterns = [
    /`([^`]+)`/g,
    /\b((?:docs|tests|src|server|tools|reports|output|verification)\/[A-Za-z0-9_./*:-]+\.(?:md|mjs|js|json|html|txt|dxf|py|pdf))\b/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      const raw = match[1];
      if (!raw) continue;
      for (const token of raw.split(/\s+/)) {
        const ref = token.replace(/[,:;)]+$/, '');
        if (isLocalFileRef(ref)) refs.push({ from: file, ref: ref.replaceAll('/', sep) });
      }
    }
  }
  return dedupeRefs(refs);
}

function isLocalFileRef(value) {
  return /^(docs|tests|src|server|tools|reports|output|verification)\//.test(value) &&
    /\.(md|mjs|js|json|html|txt|dxf|py|pdf)$/.test(value);
}

function referenceExists(ref) {
  const canonical = remapLegacyVerificationPath(ref.replaceAll(sep, '/')).replaceAll('/', sep);
  if (!canonical.includes('*')) return existsSync(canonical);
  const dir = dirname(canonical);
  if (!existsSync(dir)) return false;
  const pattern = new RegExp(`^${canonical.slice(dir.length + 1).split('*').map(escapeRegex).join('.*')}$`);
  return readdirSync(dir).some((name) => pattern.test(name));
}

function dedupeRefs(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.from}\0${item.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function listFiles(dir) {
  return readdirSync(dir)
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? listFiles(path) : [path];
    });
}

function escapeRegex(value) {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}
