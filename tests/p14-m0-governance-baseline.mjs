import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  PHASE14_CAPABILITIES,
  PHASE14_RELEASE_INVARIANTS,
  auditPhase14QualificationSet,
  buildPhase14Baseline,
  buildPhase14ReleaseManifest,
  createPhase14QualificationRecord,
  createPhase14ReferenceRecord,
  createPhase14ToleranceManifest,
  invalidatePhase14Qualifications,
  listImpactedPhase14Capabilities,
  validatePhase14Baseline,
  validatePhase14ReleaseManifest,
} from '../verification/framework/phase14/index.js';

for (const path of [
  'docs/phase14/README.md',
  'docs/phase14/PRODUCTION_REQUIREMENTS.md',
  'docs/phase14/TARGET_ARCHITECTURE.md',
  'docs/phase14/WINKLER_FOUNDATION_DESIGN.md',
  'docs/phase14/QUALIFICATION_POLICY.md',
  'docs/phase14/REFERENCE_BASIS.md',
  'docs/phase14/MILESTONE_EXECUTION_PLAN.md',
  'docs/phase14/VERIFICATION_MATRIX.md',
  'docs/phase14/REQUIREMENTS_TRACEABILITY.md',
  'docs/phase14/RISK_REGISTER.md',
  'docs/phase14/IMPLEMENTATION_STATUS.md',
  'verification/specs/phase14/evidence-schema.json',
  'verification/specs/phase14/release-manifest.json',
  'verification/evidence/validation/phase14/p14-m0-governance-baseline.json',
]) assert.equal(existsSync(path), true, `missing ${path}`);

assert.equal(PHASE14_CAPABILITIES.length, 10);
assert.deepEqual(listImpactedPhase14Capabilities(['foundation']), ['SB7']);
assert.deepEqual(listImpactedPhase14Capabilities(['modalCombination']), ['SR2', 'SR2B']);
assert.equal(PHASE14_RELEASE_INVARIANTS.benchmarkExecutionStarted, false);
assert.equal(PHASE14_RELEASE_INVARIANTS.externalSolverRuntimeDependency, false);

const baseline = buildPhase14Baseline({
  sourceRevision: 'a'.repeat(40),
  createdAt: '2026-08-27T00:00:00.000Z',
  dirtySummary: { modified: 7, untracked: 31 },
  phase13BaselineVersion: 'p13-m0-baseline-contract-v1',
});
assert.deepEqual(validatePhase14Baseline(baseline), { ok: true, errors: [] });
assert.equal(Object.isFrozen(baseline), true);
assert.deepEqual(new Set(baseline.qualifications.map((row) => row.state)), new Set(['planned']));

const reference = createPhase14ReferenceRecord({
  id: 'SB7-R1-HERMITE',
  capabilityId: 'SB7',
  level: 'R1',
  title: 'Uniform Winkler Hermite matrix',
  locator: 'tests/references/phase14/sb7-hermite.json',
  sourceHash: 'b'.repeat(64),
  independentFromProduction: true,
});
assert.match(reference.referenceHash, /^[0-9a-f]{64}$/);
assert.throws(() => createPhase14ReferenceRecord({ ...reference, id: 'BAD', independentFromProduction: false }), /independent/);

const tolerance = createPhase14ToleranceManifest({
  id: 'SB7-TOL-V1',
  capabilityId: 'SB7',
  referenceIds: [reference.id],
  frozenBeforeRun: true,
  metrics: [
    { id: 'moment', response: 'My', unit: 'kip-in', relative: 0.001 },
    { id: 'deflection', response: 'Uz', unit: 'in', relative: 0.001 },
  ],
});
const reordered = createPhase14ToleranceManifest({
  id: 'SB7-TOL-V1', capabilityId: 'SB7', referenceIds: [reference.id], frozenBeforeRun: true,
  metrics: [...tolerance.metrics].reverse(),
});
assert.equal(tolerance.toleranceHash, reordered.toleranceHash);

assert.throws(() => createPhase14QualificationRecord('SB7', { internallyVerified: true }), /requires implemented/);
const implemented = createPhase14QualificationRecord('SB7', { implemented: true, hashes: { buildHash: 'c'.repeat(64) } });
assert.equal(implemented.state, 'implementation-complete');
const initial = PHASE14_CAPABILITIES.map((row) => createPhase14QualificationRecord(row.id));
const invalidated = invalidatePhase14Qualifications(initial, { areas: ['foundation'], reason: 'FOUNDATION_SCHEMA_CHANGED' });
assert.equal(invalidated.find((row) => row.capabilityId === 'SB7').invalidated, true);
assert.equal(invalidated.find((row) => row.capabilityId === 'TH1').invalidated, false);
assert.equal(auditPhase14QualificationSet(invalidated).ok, true);

const release = buildPhase14ReleaseManifest({ qualifications: initial, externalSolverRuntimeDependency: false, openCriticalHighCount: 0 });
assert.equal(validatePhase14ReleaseManifest(release).ok, true);
assert.equal(release.phaseReleaseAllowed, false);
assert.equal(release.finalDesignTransferAllowed, false);

const storedEvidence = JSON.parse(readFileSync('verification/evidence/validation/phase14/p14-m0-governance-baseline.json', 'utf8'));
assert.equal(storedEvidence.status, 'PASS');
assert.equal(storedEvidence.benchmarkExecutionStarted, false);
assert.equal(validatePhase14Baseline(storedEvidence.baseline).ok, true);
const storedManifest = JSON.parse(readFileSync('verification/specs/phase14/release-manifest.json', 'utf8'));
assert.equal(validatePhase14ReleaseManifest(storedManifest).ok, true);
assert.equal(storedManifest.phaseReleaseAllowed, false);

const status = readFileSync('docs/phase14/IMPLEMENTATION_STATUS.md', 'utf8');
assert.match(status, /benchmark_execution_started:\s*true/);
assert.doesNotMatch(status, /benchmark_execution_started:\s*false/);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P14-M0',
  capabilities: PHASE14_CAPABILITIES.length,
  baselineHash: baseline.baselineHash,
  benchmarkExecutionStarted: false,
}, null, 2));
