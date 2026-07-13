import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getPhase8VerificationSuite,
  validatePhase8EvidenceArtifact,
} from '../src/verification/registry.js';
import {
  FIBER_HINGE_INTERACTION_VERSION,
  DISTRIBUTED_FIBER_FRAME_3D_VERSION,
  FIBER_MATERIAL_MODEL_VERSION,
  FIBER_SECTION_MESH_VERSION,
  MEMBER_FIBER_INTERACTION_VERSION,
  MOMENT_CURVATURE_V2_VERSION,
  PMM_SURFACE_VERSION,
  SECTION_RESPONSE_VERSION,
} from '../src/index.js';
import { buildAgentManifest } from '../src/ui/agentManifest.js';

const artifact = JSON.parse(readFileSync(new URL('../reports/validation-evidence/phase8/p8-m6-fiber-pmm.json', import.meta.url)));
const suite = getPhase8VerificationSuite('P8-M6-FIBER-PMM');
assert.equal(suite?.verificationIds.length, 22);
assert.deepEqual(validatePhase8EvidenceArtifact(artifact), { ok: true, errors: [] });
for (const version of [
  FIBER_SECTION_MESH_VERSION,
  FIBER_MATERIAL_MODEL_VERSION,
  SECTION_RESPONSE_VERSION,
  MOMENT_CURVATURE_V2_VERSION,
  PMM_SURFACE_VERSION,
  MEMBER_FIBER_INTERACTION_VERSION,
  FIBER_HINGE_INTERACTION_VERSION,
  DISTRIBUTED_FIBER_FRAME_3D_VERSION,
]) assert.match(version, /^p8-m6-/);
const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase8PmmSurface, PMM_SURFACE_VERSION);
assert.equal(manifest.modules.phase8FiberHingeInteraction, FIBER_HINGE_INTERACTION_VERSION);
assert.equal(manifest.modules.phase8DistributedFiberFrame3d, DISTRIBUTED_FIBER_FRAME_3D_VERSION);
assert.equal(manifest.milestones.find((row) => row.id === 'P8-M6')?.status, 'candidate');
for (const path of [
  '../docs/phase8/adr/ADR-004-FIBER-PMM-SOURCE-AND-COUPLING.md',
  '../reports/validation-evidence/phase8/p8-m6-code-review.md',
]) {
  assert.ok(readFileSync(new URL(path, import.meta.url), 'utf8').length > 500, path);
}
console.log(JSON.stringify({
  ok: true,
  suiteId: suite.id,
  verificationCount: suite.verificationIds.length,
  publicModuleCount: 8,
}, null, 2));
