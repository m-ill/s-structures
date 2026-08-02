import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const required = [
  'docs/phase12/MILESTONE_EXECUTION_PLAN.md',
  'docs/phase12/CURRENT_STATE_AUDIT.md',
  'docs/phase12/THREAT_MODEL.md',
  'docs/phase12/VERIFICATION_MATRIX.md',
  'docs/phase12/RISK_REGISTER.md',
  'docs/phase12/REQUIREMENTS_TRACEABILITY.md',
  'docs/phase12/IMPLEMENTATION_STATUS.md',
  'docs/phase12/adr/ADR-001-PUBLIC-PRIVATE-BOUNDARY.md',
  'docs/verification/phase12/evidence-schema.json',
  'docs/verification/phase12/release-manifest.json',
  'reports/validation-evidence/phase12/p12-m0-baseline-governance.json',
];
for (const path of required) assert.equal(existsSync(path), true, `missing ${path}`);

const plan = readFileSync(required[0], 'utf8');
for (let milestone = 0; milestone <= 7; milestone += 1) {
  assert.match(plan, new RegExp(`P12-M${milestone}`));
}

const evidence = JSON.parse(readFileSync(required.at(-1), 'utf8'));
assert.equal(evidence.milestone, 'P12-M0');
assert.equal(evidence.status, 'PASS');
assert.match(evidence.sourceRevision, /^[0-9a-f]{40}$/);
assert.equal(evidence.backup.bundleVerify, 'PASS');
assert.equal(evidence.backup.completeHistory, true);
assert.equal(evidence.baselineExposure.syntheticOnly, true);
assert.equal(evidence.baselineExposure.rawSensitiveBodiesStored, false);
assert.deepEqual(evidence.verificationRecords.map((row) => row.status), Array(6).fill('PASS'));

const release = JSON.parse(readFileSync('docs/verification/phase12/release-manifest.json', 'utf8'));
const phaseComplete = release.completedMilestones?.includes('P12-M7') === true;
assert.equal(release.releaseQualified, phaseComplete);
assert.equal(release.localPilotAllowed, phaseComplete);
assert.equal(release.productReleaseAllowed, false);
assert.equal(release.lanAllowed, false);
assert.equal(release.publicInternetAllowed, false);
assert.equal(release.designTransferAllowed, false);

console.log(JSON.stringify({ ok: true, version: evidence.version, milestone: evidence.milestone }, null, 2));
