import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getPhase8VerificationSuite,
  validatePhase8EvidenceArtifact,
  verificationRegistryManifest,
} from '../src/index.js';

const artifact = JSON.parse(await readFile(
  new URL('../reports/validation-evidence/phase8/p8-m2-equilibrium.json', import.meta.url),
  'utf8',
));
const validation = validatePhase8EvidenceArtifact(artifact);
assert.equal(validation.ok, true, validation.errors.join(', '));
const suite = getPhase8VerificationSuite('P8-M2-EQUILIBRIUM');
assert.equal(suite.milestone, 'P8-M2');
assert.equal(suite.verificationIds.length, 16);
assert.deepEqual(artifact.verificationIds, suite.verificationIds);
assert.ok(artifact.results.every((row) => row.status === 'PASS' && row.test.startsWith('tests/p8-')));
assert.equal(artifact.environment.productionBackend, 'p8-wasm-sparse-v1');
assert.equal(artifact.environment.wasmImports, 0);
assert.equal(artifact.environment.externalNumericalDependencies, 0);
assert.ok(verificationRegistryManifest().suites.some((row) => row.id === suite.id));

console.log(JSON.stringify({
  ok: true,
  suite: suite.id,
  verificationIdCount: suite.verificationIds.length,
  evidence: 'reports/validation-evidence/phase8/p8-m2-equilibrium.json',
}, null, 2));
