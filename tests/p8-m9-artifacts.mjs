import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  NONLINEAR_INTEGRATED_RESULT_VERSION,
  NONLINEAR_INTEGRATION_CAPABILITY_VERSION,
  NONLINEAR_INTEGRATION_GOVERNANCE_VERSION,
  NONLINEAR_SUPPORT_SPRING_VERSION,
  getPhase8VerificationSuite,
  validatePhase8EvidenceArtifact,
  verificationRegistryManifest,
} from '../src/index.js';

const artifact = JSON.parse(await readFile(
  new URL('../reports/validation-evidence/phase8/p8-m9-integration-recovery.json', import.meta.url),
  'utf8',
));
const validation = validatePhase8EvidenceArtifact(artifact);
assert.equal(validation.ok, true, validation.errors.join(', '));
const suite = getPhase8VerificationSuite('P8-M9-INTEGRATION-RECOVERY');
assert.equal(suite.milestone, 'P8-M9');
assert.equal(suite.verificationIds.length, 36);
assert.deepEqual(artifact.verificationIds, suite.verificationIds);
assert.equal(artifact.environment.capabilityMatrix, NONLINEAR_INTEGRATION_CAPABILITY_VERSION);
assert.equal(artifact.environment.supportSpring, NONLINEAR_SUPPORT_SPRING_VERSION);
assert.equal(artifact.environment.integratedResult, NONLINEAR_INTEGRATED_RESULT_VERSION);
assert.equal(artifact.environment.governance, NONLINEAR_INTEGRATION_GOVERNANCE_VERSION);
assert.equal(artifact.environment.externalNumericalDependencies, 0);
assert.equal(artifact.metrics.productionPushoverAdapter, true);
assert.equal(artifact.metrics.productionNlthAdapter, true);
assert.equal(artifact.metrics.dynamicStoryShearEnvelopePeak, 4);
assert.equal(artifact.metrics.historyEnvelopeComplete, true);
assert.equal(artifact.metrics.pushoverRollingIntegrationCompaction, true);
assert.ok(artifact.metrics.stationClosureRelative < 1e-12);
assert.ok(verificationRegistryManifest().suites.some((row) => row.id === suite.id));

const sources = new Map();
for (const row of artifact.results) {
  if (!sources.has(row.test)) {
    sources.set(row.test, await readFile(new URL(`../${row.test}`, import.meta.url), 'utf8'));
  }
  const source = sources.get(row.test);
  assert.ok(source.includes(`'${row.id}'`) || source.includes(`"${row.id}"`), `${row.test} does not declare ${row.id}`);
}

const adr = await readFile(
  new URL('../docs/phase8/adr/ADR-009-MODEL-INTEGRATION-RESULT-ORIGIN-STALE.md', import.meta.url),
  'utf8',
);
assert.match(adr, /active-set/i);
assert.match(adr, /shell stress/i);
assert.match(adr, /stale/i);
const review = await readFile(
  new URL('../reports/validation-evidence/phase8/p8-m9-code-review.md', import.meta.url),
  'utf8',
);
assert.match(review, /P8-M9-INTEGRATION-RECOVERY/);
assert.match(review, /candidate/);

console.log(JSON.stringify({
  ok: true,
  suiteId: suite.id,
  verificationCount: suite.verificationIds.length,
  sourceCount: sources.size,
  adapterCount: artifact.metrics.canonicalAdapterCount,
  qualification: artifact.qualificationImpact,
}, null, 2));
