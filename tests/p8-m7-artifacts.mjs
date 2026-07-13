import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ARC_LENGTH_RESTART_VERSION,
  ARC_LENGTH_SCALING_VERSION,
  CYCLIC_STATIC_PROTOCOL_VERSION,
  MDOF_ARC_LENGTH_VERSION,
  MDOF_CYCLIC_STATIC_VERSION,
  NONLINEAR_COMPUTE_BACKEND_POLICY_VERSION,
  PRODUCTION_PUSHOVER_RESULT_VERSION,
  PRODUCTION_PUSHOVER_VERSION,
  PUSHOVER_ARC_LENGTH_HANDOFF_VERSION,
  runMdofArcLength,
  runMdofCyclicStatic,
} from '../src/index.js';
import {
  getPhase8VerificationSuite,
  validatePhase8EvidenceArtifact,
} from '../src/verification/registry.js';
import { buildAgentManifest } from '../src/ui/agentManifest.js';

const artifact = JSON.parse(readFileSync(new URL('../reports/validation-evidence/phase8/p8-m7-arc-cyclic.json', import.meta.url)));
const suite = getPhase8VerificationSuite('P8-M7-ARC-CYCLIC');
assert.equal(suite?.verificationIds.length, 16);
assert.deepEqual(validatePhase8EvidenceArtifact(artifact), { ok: true, errors: [] });
for (const version of [
  MDOF_ARC_LENGTH_VERSION,
  ARC_LENGTH_SCALING_VERSION,
  ARC_LENGTH_RESTART_VERSION,
  MDOF_CYCLIC_STATIC_VERSION,
  CYCLIC_STATIC_PROTOCOL_VERSION,
  NONLINEAR_COMPUTE_BACKEND_POLICY_VERSION,
  PRODUCTION_PUSHOVER_RESULT_VERSION,
  PRODUCTION_PUSHOVER_VERSION,
  PUSHOVER_ARC_LENGTH_HANDOFF_VERSION,
]) assert.match(version, /^p8-m7-/);
assert.equal(typeof runMdofArcLength, 'function');
assert.equal(typeof runMdofCyclicStatic, 'function');
const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase8MdofArcLength, MDOF_ARC_LENGTH_VERSION);
assert.equal(manifest.modules.phase8MdofCyclicStatic, MDOF_CYCLIC_STATIC_VERSION);
assert.equal(manifest.modules.phase8ComputeBackendPolicy, NONLINEAR_COMPUTE_BACKEND_POLICY_VERSION);
assert.equal(manifest.milestones.find((row) => row.id === 'P8-M7')?.status, 'candidate');
for (const path of [
  '../docs/phase8/adr/ADR-007-DISPLACEMENT-ARC-LENGTH-BRANCH-POLICY.md',
  '../reports/validation-evidence/phase8/p8-m7-code-review.md',
]) assert.ok(readFileSync(new URL(path, import.meta.url), 'utf8').length > 500, path);

console.log(JSON.stringify({
  ok: true,
  suiteId: suite.id,
  verificationCount: suite.verificationIds.length,
  publicModuleCount: 9,
  gpuPolicyVersion: NONLINEAR_COMPUTE_BACKEND_POLICY_VERSION,
}, null, 2));
