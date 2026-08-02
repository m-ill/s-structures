import { readFile, readdir } from 'node:fs/promises';

export async function collectTestInventory() {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const scripts = packageJson.scripts || {};
  const files = (await readdir('tests')).filter((file) => file.endsWith('.mjs')).sort();
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

  const records = files.map((file) => ({
    file,
    classification: covered.has(file) ? 'default' : 'release-long',
    runner: covered.has(file) ? 'npm test' : 'npm run test:uncovered',
    owner: ownerFor(file),
    reason: covered.has(file) ? 'covered by the default runner graph' : 'not in the historical default graph; mandatory in release extended gate',
  }));
  return {
    version: 'p12-test-inventory-v1',
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
  for (const file of files) if (pattern.test(file)) covered.add(file);
}

function ownerFor(file) {
  const phase = /^p(\d+)-/i.exec(file)?.[1];
  if (phase) return `phase${phase}`;
  if (/^m\d+-/i.test(file)) return 'legacy-milestones';
  return 'release-verification';
}
