import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getPhase8VerificationSuite,
  validatePhase8EvidenceArtifact,
} from '../verification/framework/registry.js';

const artifact = JSON.parse(readFileSync(new URL('../verification/evidence/validation/phase8/p8-m5-formal-pushover.json', import.meta.url)));
const suite = getPhase8VerificationSuite('P8-M5-FORMAL-PUSHOVER');
assert.equal(suite?.verificationIds.length, 25);
assert.deepEqual(validatePhase8EvidenceArtifact(artifact), { ok: true, errors: [] });
for (const path of [
  '../docs/phase8/adr/ADR-007-DISPLACEMENT-ARC-LENGTH-BRANCH-POLICY.md',
  '../verification/evidence/validation/phase8/p8-m5-code-review.md',
]) {
  assert.ok(readFileSync(new URL(path, import.meta.url), 'utf8').length > 500, path);
}
console.log(JSON.stringify({ ok: true, suiteId: suite.id, verificationCount: suite.verificationIds.length }, null, 2));
