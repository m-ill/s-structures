import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const startedAt = performance.now();
const pushover = run('tests/p8-m7-production-arc.mjs');
const pushoverDurationMs = performance.now() - startedAt;
const nlthStartedAt = performance.now();
const nlth = run('tests/p8-m8-production-nlth.mjs');
const nlthDurationMs = performance.now() - nlthStartedAt;

assert.equal(pushover.ok, true, 'P9-GPU-NL-13 Pushover production regression');
assert.equal(pushover.displacementStepCount, 4, 'P9-GPU-NL-14 displacement-control step parity');
assert.equal(pushover.arcStepCount, 3, 'P9-GPU-NL-14 arc-length step parity');
assert.equal(pushover.residentCommitCount, pushover.displacementStepCount + pushover.arcStepCount);
assert.ok(pushover.residentAuditCount >= pushover.residentCommitCount + 1);
assert.match(pushover.residentSessionHash, /^[a-f0-9]{24}$/);
assert.equal(pushover.solveOperation, 'cpu-f64-spd');

assert.equal(nlth.ok, true, 'P9-GPU-NL-17 selected NLTH history regression');
assert.equal(nlth.outputStepCount, 3, 'P9-GPU-NL-18 output history parity');
assert.equal(nlth.residentCommitCount, nlth.internalStepCount, 'NLTH committed state parity');
assert.equal(nlth.residentTransferCount, nlth.chunkCount, 'bounded history transfer parity');
assert.ok(nlth.residentTransferBytes > 0);
assert.ok(nlth.hingeStates.includes('yielded'), 'P9-GPU-NL-15~16 hinge transition parity');
assert.ok(nlth.finalEnergyRelativeResidual < 1e-3, 'P9-GPU-NL-19~20 CPU f64 energy audit');
assert.ok(nlth.residentAuditCount >= nlth.residentCommitCount + 1);
assert.match(nlth.residentSessionHash, /^[a-f0-9]{24}$/);
assert.equal(nlth.solveOperation, 'cpu-f64-general');

console.log(JSON.stringify({
  ok: true,
  verificationIds: [
    'P9-GPU-NL-13', 'P9-GPU-NL-14', 'P9-GPU-NL-15', 'P9-GPU-NL-16',
    'P9-GPU-NL-17', 'P9-GPU-NL-18', 'P9-GPU-NL-19', 'P9-GPU-NL-20',
  ],
  pushover: {
    durationMs: pushoverDurationMs,
    displacementStepCount: pushover.displacementStepCount,
    arcStepCount: pushover.arcStepCount,
    residentCommitCount: pushover.residentCommitCount,
    residentAuditCount: pushover.residentAuditCount,
    sessionHash: pushover.residentSessionHash,
  },
  nlth: {
    durationMs: nlthDurationMs,
    outputStepCount: nlth.outputStepCount,
    internalStepCount: nlth.internalStepCount,
    residentCommitCount: nlth.residentCommitCount,
    residentAuditCount: nlth.residentAuditCount,
    residentTransferCount: nlth.residentTransferCount,
    residentTransferBytes: nlth.residentTransferBytes,
    finalEnergyRelativeResidual: nlth.finalEnergyRelativeResidual,
    hingeStates: nlth.hingeStates,
    sessionHash: nlth.residentSessionHash,
  },
  performanceScope: 'focused-regression-only',
  mTierQualification: 'blocked-not-run-by-user-test-policy',
}, null, 2));

function run(relativePath) {
  const output = execFileSync(process.execPath, [path.join(root, relativePath)], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(output.trim());
}
