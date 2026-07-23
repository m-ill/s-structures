import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  P11_ARTIFACT_CLASSES,
  P11_CAPTURE_KINDS,
  P11_GAP_ASSIGNMENTS,
  P11_REQUIRED_LOCALES,
  P11_VERDICT_REASON_CODES,
  validateP11M0Evidence,
  validateP11ReleaseManifest,
} from '../src/report/phase11/governance.js';

const evidence = JSON.parse(readFileSync('reports/validation-evidence/phase11/p11-m0-baseline-governance.json', 'utf8'));
const manifest = JSON.parse(readFileSync('docs/verification/phase11/release-manifest.json', 'utf8'));

assert.deepEqual(validateP11M0Evidence(evidence), { ok: true, errors: [] });
assert.deepEqual(validateP11ReleaseManifest(manifest), { ok: true, errors: [] });
assert.deepEqual(P11_REQUIRED_LOCALES, ['ko-KR', 'en-US']);
assert.equal(P11_CAPTURE_KINDS.length, 7);
assert.equal(new Set(P11_CAPTURE_KINDS).size, 7);
assert.ok(P11_VERDICT_REASON_CODES.includes('INDEPENDENT_REFERENCE_NOT_AVAILABLE'));
assert.ok(P11_VERDICT_REASON_CODES.includes('REQUIRED_EVIDENCE_MISSING'));
assert.equal(P11_GAP_ASSIGNMENTS.length, 14);
assert.equal(new Set(P11_GAP_ASSIGNMENTS.map((row) => row.id)).size, 14);
assert.ok(P11_GAP_ASSIGNMENTS.every((row) => row.owner && row.milestones.length && row.releaseImpact));
assert.equal(Object.keys(P11_ARTIFACT_CLASSES).length, 4);
assert.equal(evidence.baseline.artifacts.length, 5);
assert.equal(evidence.baseline.pdf.pageCount, 22);
assert.equal(evidence.baseline.pdf.a4, true);
assert.equal(evidence.releaseQualified, false);
assert.equal(manifest.releaseQualified, false);
assert.equal(manifest.status, 'blocked');
assert.deepEqual(manifest.completedMilestones, ['P11-M0']);
assert.equal(manifest.evidence['P11-M0'], evidence.artifactHash);
assert.equal(manifest.phase10EligibilityPreserved, true);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P11-M0',
  verification: evidence.verification.length,
  gaps: P11_GAP_ASSIGNMENTS.length,
  captureKinds: P11_CAPTURE_KINDS.length,
  evidenceHash: evidence.artifactHash,
  manifestHash: manifest.manifestHash,
  releaseQualified: false,
}, null, 2));
