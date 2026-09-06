import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tests = [
  'tests/m0-smoke.mjs',
  'tests/m4-combinations.mjs',
  'tests/p5-analysis-center.mjs',
  'tests/p9-m3-worker-product.mjs',
  'tests/p9-m6-worker-product.mjs',
  'tests/p9-m9-product-workflow.mjs',
  'tests/p8-m10-product-ui.mjs',
  'tests/p8-m10-job-agent-api.mjs',
];
for (const test of tests) {
  const output = execFileSync(process.execPath, [path.join(ROOT, test)], { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  assert.ok(output.trim(), `${test} did not emit a result`);
}
console.log(JSON.stringify({
  ok: true,
  requirements: ['P9-REL-03', 'P9-PERF-19~20'],
  policy: 'focused-cpu-and-product-regression-full-nonlinear-excluded',
  tests,
}, null, 2));
