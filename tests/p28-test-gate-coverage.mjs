import assert from 'node:assert/strict';
import { report } from '../verification/harnesses/check-test-gate-coverage.mjs';

// Every test file must be executed by something. Nine were not, and one of them
// had been failing unnoticed because no runner reached it: the phase runners
// discover by filename pattern and the milestone runner works from package
// scripts, so a file named outside those conventions had no home. The unphased
// runner is that home, and this keeps the set empty.

const list = (names) => names.map((name) => `  tests/${name}`).join('\n');

assert.ok(report.testFiles > 0);
assert.equal(report.orphans.length, 0, `test files no runner executes:\n${list(report.orphans)}`);
assert.equal(report.reached, report.testFiles);

// The unphased runner is a home, not a habit. A file lands there only when its
// name follows no runner convention, so the set is kept small and visible
// rather than becoming the place everything quietly accumulates.
assert.ok(report.unphased.length <= 9, `too many checks reach no runner by convention:\n${list(report.unphased)}`);

console.log(JSON.stringify({
  ok: true,
  testFiles: report.testFiles,
  reached: report.reached,
  orphans: report.orphans.length,
  unphased: report.unphased.length,
  byRunner: report.byRunner,
}, null, 2));
