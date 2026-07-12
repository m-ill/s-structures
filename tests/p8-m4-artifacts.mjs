import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  HINGED_FRAME_3D_VERSION,
  HINGE_ASSIGNMENT_CONTRACT_VERSION,
  HINGE_BACKBONE_VERSION,
  HINGE_CYCLIC_STATE_VERSION,
  HINGE_CYCLIC_VERSION,
  HINGE_PROPERTY_REGISTRY_VERSION,
  MDOF_EQUILIBRIUM_ASSEMBLER_VERSION,
  getPhase8VerificationSuite,
  validatePhase8EvidenceArtifact,
  verificationRegistryManifest,
} from '../src/index.js';

const artifact = JSON.parse(await readFile(
  new URL('../reports/validation-evidence/phase8/p8-m4-concentrated-hinge.json', import.meta.url),
  'utf8',
));
const validation = validatePhase8EvidenceArtifact(artifact);
assert.equal(validation.ok, true, validation.errors.join(', '));
const suite = getPhase8VerificationSuite('P8-M4-CONCENTRATED-HINGE');
assert.equal(suite.milestone, 'P8-M4');
assert.equal(suite.verificationIds.length, 12);
assert.deepEqual(artifact.verificationIds, suite.verificationIds);
assert.equal(artifact.environment.hingeBackbone, HINGE_BACKBONE_VERSION);
assert.equal(artifact.environment.hingeCyclic, HINGE_CYCLIC_VERSION);
assert.equal(artifact.environment.hingeCyclicState, HINGE_CYCLIC_STATE_VERSION);
assert.equal(artifact.environment.hingePropertyRegistry, HINGE_PROPERTY_REGISTRY_VERSION);
assert.equal(artifact.environment.hingeAssignment, HINGE_ASSIGNMENT_CONTRACT_VERSION);
assert.equal(artifact.environment.hingedFrame, HINGED_FRAME_3D_VERSION);
assert.equal(artifact.environment.equilibriumAssembler, MDOF_EQUILIBRIUM_ASSEMBLER_VERSION);
assert.equal(artifact.environment.externalNumericalDependencies, 0);
assert.ok(artifact.metrics.envelopeTangentRelativeError < 1e-8);
assert.ok(artifact.metrics.seriesTangentRelativeError < 1e-6);
assert.ok(artifact.metrics.seriesCompatibilityError < 1e-10);
assert.equal(artifact.metrics.rollbackEquivalent, true);
assert.equal(artifact.metrics.transactionUndoRestored, true);
assert.equal(artifact.metrics.rcMissingSnapshotBlocked, true);
assert.ok(verificationRegistryManifest().suites.some((row) => row.id === suite.id));
for (const result of artifact.results) {
  const source = await readFile(new URL(`../${result.test}`, import.meta.url), 'utf8');
  assert.ok(
    source.includes(`'${result.id}'`) || source.includes(`"${result.id}"`),
    `${result.test} does not emit or declare ${result.id}`,
  );
}
const adr = await readFile(
  new URL('../docs/phase8/adr/ADR-003-CONCENTRATED-HINGE-SERIES-COMPATIBILITY.md', import.meta.url),
  'utf8',
);
assert.ok(adr.includes('M_member - M_hinge'));
assert.ok(adr.includes('diagnostic-only'));
assert.ok(adr.includes('Rejected Alternatives'));
const review = await readFile(
  new URL('../reports/validation-evidence/phase8/p8-m4-code-review.md', import.meta.url),
  'utf8',
);
assert.ok(review.includes('status: PASS'));
assert.ok(review.includes('critical_findings_open: 0'));
assert.ok(review.includes('high_findings_open: 0'));
assert.ok(review.includes('external_numerical_dependencies_added: 0'));

console.log(JSON.stringify({
  ok: true,
  suite: suite.id,
  verificationIdCount: suite.verificationIds.length,
  evidence: 'reports/validation-evidence/phase8/p8-m4-concentrated-hinge.json',
  review: 'reports/validation-evidence/phase8/p8-m4-code-review.md',
}, null, 2));
