import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  COROTATIONAL_FRAME_3D_VERSION,
  COROTATIONAL_TRUSS_3D_VERSION,
  FIXED_END_TEMPERATURE_VERSION,
  ROTATION_COORDINATE_VERSION,
  getPhase8VerificationSuite,
  validatePhase8EvidenceArtifact,
  verificationRegistryManifest,
} from '../src/index.js';

const artifact = JSON.parse(await readFile(
  new URL('../reports/validation-evidence/phase8/p8-m3-corotational.json', import.meta.url),
  'utf8',
));
const fixture = JSON.parse(await readFile(
  new URL('./fixtures/phase8/corotational-skew-reference-v1.json', import.meta.url),
  'utf8',
));
const validation = validatePhase8EvidenceArtifact(artifact);
assert.equal(validation.ok, true, validation.errors.join(', '));
const suite = getPhase8VerificationSuite('P8-M3-COROTATIONAL');
assert.equal(suite.milestone, 'P8-M3');
assert.equal(suite.verificationIds.length, 12);
assert.deepEqual(artifact.verificationIds, suite.verificationIds);
assert.equal(artifact.environment.frameKernel, COROTATIONAL_FRAME_3D_VERSION);
assert.equal(artifact.environment.trussKernel, COROTATIONAL_TRUSS_3D_VERSION);
assert.equal(artifact.environment.rotationCoordinates, ROTATION_COORDINATE_VERSION);
assert.equal(artifact.environment.fixedEndTemperature, FIXED_END_TEMPERATURE_VERSION);
assert.equal(artifact.environment.externalNumericalDependencies, 0);
assert.ok(artifact.metrics.unreleasedTangentRelativeError < 1e-5);
assert.ok(artifact.metrics.releasedTangentRelativeError < 1e-5);
assert.ok(artifact.metrics.releasedWeakRestraintRotationError < 1e-12);
assert.ok(artifact.metrics.offsetReleaseGaugeAxialError < 1e-12);
assert.equal(fixture.verificationId, 'NL-COR-10');
assert.ok(verificationRegistryManifest().suites.some((row) => row.id === suite.id));
for (const result of artifact.results) {
  const source = await readFile(new URL(`../${result.test}`, import.meta.url), 'utf8');
  assert.ok(
    source.includes(`'${result.id}'`) || source.includes(`"${result.id}"`),
    `${result.test} does not emit or declare ${result.id}`,
  );
}

console.log(JSON.stringify({
  ok: true,
  suite: suite.id,
  verificationIdCount: suite.verificationIds.length,
  evidence: 'reports/validation-evidence/phase8/p8-m3-corotational.json',
}, null, 2));
