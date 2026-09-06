import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC_MODULES = new Set(['src/index.js', 'verification/index.js']);
const findings = [];

for (const file of await listFiles(path.join(ROOT, 'tests'))) {
  if (!file.endsWith('.mjs')) continue;
  const source = await readFile(file, 'utf8');
  const expression = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/gu;
  for (const match of source.matchAll(expression)) {
    const target = path.resolve(path.dirname(file), match[2]);
    const repositoryTarget = normalize(path.relative(ROOT, target));
    if (!PUBLIC_MODULES.has(repositoryTarget)) continue;
    const namespace = await import(pathToFileURL(target).href);
    for (const entry of match[1].split(',')) {
      const imported = entry.trim().split(/\s+as\s+/u)[0]?.trim();
      if (imported && !Object.hasOwn(namespace, imported)) {
        findings.push({
          file: normalize(path.relative(ROOT, file)),
          line: source.slice(0, match.index).split(/\r?\n/u).length,
          module: repositoryTarget,
          imported,
        });
      }
    }
  }
}

const result = { version: 'p16-public-import-contract-check-v1', ok: findings.length === 0, findings };
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

function normalize(value) { return value.replaceAll('\\', '/'); }
