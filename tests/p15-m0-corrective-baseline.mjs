import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  PHASE15_DISCREPANCY_IDS,
  buildPhase15CorrectiveBaseline,
  validatePhase15CorrectiveBaseline,
} from '../verification/framework/phase15/index.js';
import { phase15BaselineInput } from './helpers/phase15-fixtures.mjs';

const first = buildPhase15CorrectiveBaseline(phase15BaselineInput());
assert.equal(first.status, 'PASS');
assert.equal(first.releaseAllowed, false);
assert.equal(first.finalDesignTransferAllowed, false);
assert.equal(first.discrepancyIds.length, 16);
assert.ok(first.discrepancyIds.includes('P15-D016'));
assert.deepEqual(first.discrepancyIds, [...PHASE15_DISCREPANCY_IDS].sort());
assert.equal(Object.isFrozen(first), true);
assert.deepEqual(validatePhase15CorrectiveBaseline(first), { ok: true, errors: [] });

const later = buildPhase15CorrectiveBaseline(phase15BaselineInput({
  run: { capturedAt: '2026-08-27T01:00:00.000Z', host: 'fixture-host' },
}));
assert.equal(later.baselineHash, first.baselineHash, 'timestamp must not affect baseline calculation hash');
assert.notEqual(later.run.runRecordHash, first.run.runRecordHash, 'timestamp belongs to the run record hash');
assert.notEqual(later.artifactHash, first.artifactHash);

const blocked = buildPhase15CorrectiveBaseline(phase15BaselineInput({ reviewers: {} }));
assert.equal(blocked.status, 'BLOCKED');
assert.equal(blocked.gates.find((row) => row.id === 'P15-GOV-07').status, 'BLOCKED');
assert.equal(validatePhase15CorrectiveBaseline(blocked).ok, true);

const staleStatus = buildPhase15CorrectiveBaseline(phase15BaselineInput({
  phase14StatusAudit: { benchmarkExecutionStarted: false, staleAssertionCount: 1, statusDocumentHash: '2'.repeat(64) },
}));
assert.equal(staleStatus.gates.find((row) => row.id === 'P15-GOV-08').status, 'BLOCKED');

const tampered = structuredClone(first);
tampered.traceCoverage = 0.5;
assert.equal(validatePhase15CorrectiveBaseline(tampered).ok, false);

const phase14Status = readFileSync('docs/phase14/IMPLEMENTATION_STATUS.md', 'utf8');
const phase14M0Test = readFileSync('tests/p14-m0-governance-baseline.mjs', 'utf8');
const baselineSchema = JSON.parse(readFileSync('verification/specs/phase15/corrective-baseline-schema.json', 'utf8'));
assert.equal(baselineSchema.properties.version.const, 'p15-m0-corrective-baseline-v1');
assert.equal(baselineSchema.additionalProperties, false);
assert.match(phase14Status, /benchmark_execution_started:\s*true/);
assert.doesNotMatch(phase14M0Test, /assert\.match\(status, \/benchmark_execution_started:\\s\*false/);

const runner = JSON.parse(execFileSync(process.execPath, ['tools/run-p15-m0-baseline.mjs'], { encoding: 'utf8' }));
assert.equal(runner.status, 'BLOCKED', 'unapproved live baseline must fail closed');
assert.ok(runner.blockers.includes('P15-GOV-03'));
assert.ok(runner.blockers.includes('P15-GOV-06'));
assert.ok(runner.blockers.includes('P15-GOV-07'));

console.log(JSON.stringify({
  ok: true,
  milestone: 'P15-M0',
  baselineHash: first.baselineHash,
  runHashSeparated: true,
  d016Protected: true,
  liveRunnerStatus: runner.status,
}, null, 2));
