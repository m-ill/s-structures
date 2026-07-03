import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const required = [
  'docs/user-manual/README.md',
  'docs/user-manual/00-install.md',
  'docs/user-manual/01-getting-started.md',
  'docs/user-manual/02-modeling-and-elastic-analysis.md',
  'docs/user-manual/03-loads-design-and-reports.md',
  'docs/user-manual/04-import-drawings.md',
  'docs/user-manual/05-import-pointcloud.md',
  'docs/user-manual/06-materials-library.md',
  'docs/user-manual/07-nonlinear-analysis.md',
  'docs/user-manual/08-collaboration.md',
  'docs/user-manual/STATUS_AND_LIMITS.md',
  'docs/user-manual/AI_AGENT_GUIDE.md',
  'docs/user-manual/agent-contract.json',
  'docs/phase4/DOCUMENTATION_COVERAGE.md',
];

for (const file of required) {
  assert.ok((await stat(file)).isFile(), file);
  assert.ok((await readFile(file, 'utf8')).trim().length > 20, file);
}

const coverage = await readFile('docs/phase4/DOCUMENTATION_COVERAGE.md', 'utf8');
for (const file of required.slice(0, 12)) assert.match(coverage, new RegExp(escapeRegex(file)));
assert.doesNotThrow(() => execFileSync(process.execPath, ['tools/check-agent-contract.mjs'], { encoding: 'utf8' }));

console.log(JSON.stringify({ ok: true, version: 'p4-documentation-coverage', files: required.length }, null, 2));

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
