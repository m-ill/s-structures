import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export async function collectTestInventory() {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const scripts = packageJson.scripts || {};
  const files = await collectTestFiles();
  const defaultScript = String(scripts.test || '');
  const covered = new Set(directTestFiles(defaultScript));

  if (defaultScript.includes('tools/run-milestone-tests.mjs')) {
    for (const [name, script] of Object.entries(scripts)) {
      if (/^test:m\d+$/.test(name)) directTestFiles(script).forEach((file) => covered.add(file));
    }
  }
  addDynamicCoverage(covered, files, defaultScript, 'tools/run-phase7-tests.mjs', /^p7-m\d+-.+\.mjs$/i);
  addDynamicCoverage(covered, files, defaultScript, 'tools/run-phase8-tests.mjs', /^p8-m\d+-.+\.mjs$/i);
  addDynamicCoverage(covered, files, defaultScript, 'tools/run-phase9-tests.mjs', /^p9-m\d+-.+\.mjs$/i);
  addDynamicCoverage(covered, files, defaultScript, 'tools/run-phase10-tests.mjs', /^p10-m\d+[a-z]?-.+\.mjs$/i);
  addDynamicCoverage(covered, files, defaultScript, 'tools/run-phase12-tests.mjs', /^p12-m\d+-.+\.mjs$/i);
  addDynamicCoverage(covered, files, defaultScript, 'npm run test:p17', /^p17-m\d+-.+\.mjs$/i);

  const records = files.map((file) => ({
    file,
    classification: covered.has(file) ? 'default' : 'release-long',
    runner: covered.has(file) ? 'npm test' : 'npm run test:uncovered',
    owner: ownerFor(file),
    reason: covered.has(file) ? 'covered by the default runner graph' : 'not in the historical default graph; mandatory in release extended gate',
  }));
  return {
    version: 'p12-test-inventory-v1',
    collectionMode: 'recursive-multi-root',
    roots: ['tests', 'verification/tests'],
    generatedAt: new Date().toISOString(),
    total: records.length,
    defaultCount: records.filter((row) => row.classification === 'default').length,
    releaseLongCount: records.filter((row) => row.classification === 'release-long').length,
    unclassifiedCount: records.filter((row) => !row.classification).length,
    records,
  };
}

function directTestFiles(script) {
  return [...String(script || '').matchAll(/node\s+tests[\\/]([^\s&]+\.mjs)/g)].map((match) => match[1].replace(/\\/g, '/'));
}

function addDynamicCoverage(covered, files, script, runner, pattern) {
  if (!script.includes(runner)) return;
  for (const file of files) if (pattern.test(path.posix.basename(file))) covered.add(file);
}

function ownerFor(file) {
  const name = path.posix.basename(file);
  const phase = /^p(\d+)-/i.exec(name)?.[1];
  if (phase) return `phase${phase}`;
  if (/^m\d+-/i.test(name)) return 'legacy-milestones';
  return 'release-verification';
}

async function collectTestFiles() {
  const legacy = await listMjs('tests');
  const verification = await listMjs('verification/tests');
  return [
    ...legacy.map((file) => file.slice('tests/'.length)),
    ...verification,
  ].sort();
}

async function listMjs(root) {
  const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });
  const rows = [];
  for (const entry of entries) {
    const child = `${root}/${entry.name}`;
    if (entry.isDirectory()) rows.push(...await listMjs(child));
    else if (entry.isFile() && entry.name.endsWith('.mjs')) rows.push(child.replaceAll('\\', '/'));
  }
  return rows;
}
