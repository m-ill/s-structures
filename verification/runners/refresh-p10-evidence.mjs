import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

// Explicit maintenance tool for deterministic Phase 10 evidence after a
// model-schema migration. It never changes external qualification status.
const artifacts = [
  ['p10-m2-evidence-contract.mjs', 'p10-m2-timoshenko.json'],
  ['p10-m3-evidence-contract.mjs', 'p10-m3-partial-fixity.json'],
  ['p10-m4-evidence-contract.mjs', 'p10-m4-offsets-panelzone.json'],
  ['p10-m5-evidence-contract.mjs', 'p10-m5-mpc-rigidlink.json'],
  ['p10-m6-evidence-contract.mjs', 'p10-m6-tapered.json'],
  ['p10-m7-evidence-contract.mjs', 'p10-m7-dynamics-extension.json'],
  ['p10-m8-evidence-contract.mjs', 'p10-m8-warping-ltb.json'],
  ['p10-m9-evidence-contract.mjs', 'p10-m9-shell-fem.json'],
  ['p10-m10-evidence-contract.mjs', 'p10-m10-load-generation.json'],
];

const selected = new Set(process.argv.slice(2));
for (const [testFile, outputFile] of artifacts) {
  const milestone = testFile.match(/p10-m\d+/)?.[0];
  if (selected.size && !selected.has(milestone) && !selected.has(testFile)) continue;
  const stdout = execFileSync(process.execPath, [path.join('tests', testFile), '--print'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const artifact = parseLastJson(stdout);
  const target = path.join('verification', 'evidence', 'validation', 'phase10', outputFile);
  await writeFile(target, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ milestone, target, artifactHash: artifact.artifactHash }));
}

function parseLastJson(stdout) {
  const starts = [0, ...Array.from(stdout.matchAll(/\n(?=\{)/g), (match) => match.index + 1)];
  for (const start of starts.reverse()) {
    try { return JSON.parse(stdout.slice(start).trim()); } catch { /* preceding test output */ }
  }
  throw new Error('No JSON evidence object found in child output.');
}
