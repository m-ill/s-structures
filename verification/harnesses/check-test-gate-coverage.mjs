// Which test files does the canonical gate actually execute?
//
// A test nobody runs rots silently; that is how phase 16~25 accumulated
// failures. The gate reaches tests three ways: the milestone runner through
// package scripts, the phase runners by filename pattern, and the phase 16~25
// runner. Anything else is an orphan.
//
//   node verification/harnesses/check-test-gate-coverage.mjs [--json]

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve('.');
const files = (await readdir(path.join(ROOT, 'tests')))
  .filter((name) => name.endsWith('.mjs'))
  .sort();

const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const scriptText = Object.values(packageJson.scripts || {}).join('\n');

// Milestone runner: reads its list from package scripts, so a file counts as
// reached when some script names it.
const namedByScript = new Set(files.filter((name) => scriptText.includes(`tests/${name}`)));

// Phase runners discover by filename pattern.
const patternRunners = [
  { runner: 'run-phase7-tests', test: (n) => /^p7-/.test(n) },
  { runner: 'run-phase8-tests', test: (n) => /^p8-/.test(n) },
  { runner: 'run-phase9-tests', test: (n) => /^p9-/.test(n) },
  { runner: 'run-phase10-tests', test: (n) => /^p10-m\d+/.test(n) },
  { runner: 'run-phase12-tests', test: (n) => /^p12-/.test(n) },
  { runner: 'run-phase13-tests', test: (n) => /^p13-/.test(n) },
  { runner: 'run-phase14-tests', test: (n) => /^p14-/.test(n) },
  { runner: 'run-phase15-tests', test: (n) => /^p15-m\d+/.test(n) },
  { runner: 'run-phase16-25-tests', test: (n) => /^p(1[6-9]|2[0-5])-/.test(n) },
];

// Anything the conventions above miss is run by the unphased runner, which
// takes its list from this report, so the orphan set stays empty by design.
const unphasedRunner = 'run-unphased-tests';

const reached = new Map();
for (const name of files) {
  if (namedByScript.has(name)) reached.set(name, 'package-script');
  else {
    const runner = patternRunners.find((row) => row.test(name));
    if (runner) reached.set(name, runner.runner);
  }
}

const unreached = files.filter((name) => !reached.has(name));
for (const name of unreached) reached.set(name, unphasedRunner);
// Only a file the unphased runner cannot reach either is a true orphan, and it
// reaches every remaining file, so this is empty unless a convention changes.
const orphans = files.filter((name) => !reached.has(name));
const byRunner = {};
for (const [, runner] of reached) byRunner[runner] = (byRunner[runner] || 0) + 1;

const report = {
  version: 'p28-test-gate-coverage-v1',
  testFiles: files.length,
  reached: reached.size,
  orphans,
  unphased: unreached,
  byRunner,
};

const runDirectly = argv[1] && path.resolve(argv[1]) === fileURLToPath(import.meta.url);
if (runDirectly && argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else if (runDirectly) {
  console.log(`testFiles=${report.testFiles} reached=${report.reached} orphans=${orphans.length}`);
  for (const [runner, count] of Object.entries(byRunner).sort()) console.log(`  ${runner}: ${count}`);
  for (const name of unreached) console.log(`  unphased: tests/${name}`);
  for (const name of orphans) console.log(`  orphan: tests/${name}`);
}

export { report };
