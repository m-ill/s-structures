import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  PHASE13_CAPABILITY_REGISTRY,
  PHASE13_RELEASE_INVARIANTS,
  PHASE13_STATUS_SURFACES,
  auditPhase13RunStateSurfaces,
  buildPhase13Baseline,
  validatePhase13Baseline,
} from '../verification/framework/phase13Baseline.js';

const required = [
  'docs/phase13/README.md',
  'docs/phase13/CURRENT_STATE_AUDIT.md',
  'docs/phase13/PRODUCTION_REQUIREMENTS.md',
  'docs/phase13/TARGET_ARCHITECTURE.md',
  'docs/phase13/ELASTIC_WORKSPACE_UX_SPEC.md',
  'docs/phase13/MILESTONE_EXECUTION_PLAN.md',
  'docs/phase13/VERIFICATION_MATRIX.md',
  'docs/phase13/REQUIREMENTS_TRACEABILITY.md',
  'docs/phase13/RISK_REGISTER.md',
  'docs/phase13/IMPLEMENTATION_STATUS.md',
  'docs/phase13/adr/ADR-001-RUN-STATE-OWNERSHIP.md',
  'verification/specs/phase13/evidence-schema.json',
  'verification/specs/phase13/release-manifest.json',
  'verification/evidence/validation/phase13/p13-m0-baseline-contract.json',
];
for (const path of required) assert.equal(existsSync(path), true, `missing ${path}`);

const plan = readFileSync('docs/phase13/MILESTONE_EXECUTION_PLAN.md', 'utf8');
for (let milestone = 0; milestone <= 9; milestone += 1) assert.match(plan, new RegExp(`P13-M${milestone}`));

const baseline = buildPhase13Baseline({ sourceRevision: 'a'.repeat(40), generatedAt: '2026-08-05T00:00:00.000Z' });
assert.deepEqual(validatePhase13Baseline(baseline), { ok: true, errors: [] });
assert.equal(Object.isFrozen(baseline), true);
assert.equal(PHASE13_CAPABILITY_REGISTRY.length, 9);
assert.deepEqual(PHASE13_RELEASE_INVARIANTS, {
  openSeesRuntimeUsed: false,
  externalSolverRuntimeDependency: false,
  nonlinearInScope: false,
  shellDesignTransferAllowed: false,
});

const expected = { runId: 'run-1', modelHash: 'model-a', caseHash: 'case-a', status: 'current', stale: false };
const consistent = Object.fromEntries(PHASE13_STATUS_SURFACES.map((surface) => [surface, expected]));
assert.equal(auditPhase13RunStateSurfaces(consistent, expected).ok, true);
consistent.report = { ...expected, stale: true };
const inconsistent = auditPhase13RunStateSurfaces(consistent, expected);
assert.equal(inconsistent.ok, false);
assert.deepEqual(inconsistent.records.find((row) => row.surface === 'report').mismatches, ['stale']);

const evidence = JSON.parse(readFileSync('verification/evidence/validation/phase13/p13-m0-baseline-contract.json', 'utf8'));
assert.equal(evidence.milestone, 'P13-M0');
assert.equal(evidence.status, 'PASS');
assert.match(evidence.sourceRevision, /^[0-9a-f]{40}$/);
assert.deepEqual(evidence.releaseInvariants, PHASE13_RELEASE_INVARIANTS);
assert.equal(validatePhase13Baseline(evidence.baseline).ok, true);
assert.deepEqual(evidence.verificationRecords.map((row) => row.status), Array(5).fill('PASS'));

const release = JSON.parse(readFileSync('verification/specs/phase13/release-manifest.json', 'utf8'));
assert.equal(release.releaseQualified, false);
assert.equal(release.frameElasticOfficePilotAllowed, false);
assert.equal(release.finalDesignTransferAllowed, false);
assert.deepEqual(release.releaseInvariants, PHASE13_RELEASE_INVARIANTS);

console.log(JSON.stringify({ ok: true, milestone: evidence.milestone, version: evidence.version }, null, 2));
