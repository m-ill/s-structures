import { readdir, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMP_TARGETS = [
  'tmp/pdfs/m42-representative-package-plots',
  'tmp/pdfs/representative-building-plots',
  'tmp/pdfs/m50-render-checks',
];

const removed = [];
for (const target of TEMP_TARGETS) {
  const absolute = path.resolve(ROOT, target);
  assertInsideWorkspaceTemp(absolute);
  await rm(absolute, { recursive: true, force: true });
  removed.push(path.relative(ROOT, absolute).replaceAll(path.sep, '/'));
}

await removeIfEmpty(path.resolve(ROOT, 'tmp/pdfs'));
await removeIfEmpty(path.resolve(ROOT, 'tmp'));

console.log(JSON.stringify({
  ok: true,
  removed,
  preserved: ['reports', 'output/pdf'],
}, null, 2));

function assertInsideWorkspaceTemp(absolute) {
  const tmpRoot = path.resolve(ROOT, 'tmp');
  const relative = path.relative(tmpRoot, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clean outside tmp: ${absolute}`);
  }
}

async function removeIfEmpty(directory) {
  try {
    const entries = await readdir(directory);
    if (entries.length === 0) await rmdir(directory);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
