import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ANALYSIS_RUNNER_VERSION,
  DYNAMIC_SPARSE_MATRIX_VERSION,
  MDOF_DAMPING_VERSION,
  MDOF_DYNAMIC_HISTORY_VERSION,
  MDOF_GROUND_MOTION_VERSION,
  MDOF_MASS_DOMAIN_VERSION,
  MDOF_NEWMARK_VERSION,
  NONLINEAR_ENGINE_IDS,
  PRODUCTION_NLTH_ENGINE_VERSION,
  PRODUCTION_NLTH_VERSION,
  VERIFICATION_REGISTRY_VERSION,
  WORKER_PROTOCOL_VERSION,
  buildMdofMassDomain,
  getNonlinearCapability,
  runMdofNewmark,
  runProductionNlth,
} from '../src/index.js';
import {
  getPhase8VerificationSuite,
  validatePhase8EvidenceArtifact,
} from '../src/verification/registry.js';
import { buildAgentManifest } from '../src/ui/agentManifest.js';

const artifact = JSON.parse(readFileSync(new URL('../reports/validation-evidence/phase8/p8-m8-mdof-nlth.json', import.meta.url)));
const suite = getPhase8VerificationSuite('P8-M8-MDOF-NLTH');
assert.equal(suite?.verificationIds.length, 16);
assert.deepEqual(validatePhase8EvidenceArtifact(artifact), { ok: true, errors: [] });

for (const version of [
  DYNAMIC_SPARSE_MATRIX_VERSION,
  MDOF_MASS_DOMAIN_VERSION,
  MDOF_GROUND_MOTION_VERSION,
  MDOF_DAMPING_VERSION,
  MDOF_DYNAMIC_HISTORY_VERSION,
  MDOF_NEWMARK_VERSION,
  PRODUCTION_NLTH_VERSION,
  PRODUCTION_NLTH_ENGINE_VERSION,
]) assert.match(version, /^p8-m8-/);
assert.match(ANALYSIS_RUNNER_VERSION, /^p8-m8-/);
assert.match(VERIFICATION_REGISTRY_VERSION, /^p8-m\d+-verification-registry-v\d+$/);
assert.match(WORKER_PROTOCOL_VERSION, /^p8-m8-/);
assert.equal(typeof buildMdofMassDomain, 'function');
assert.equal(typeof runMdofNewmark, 'function');
assert.equal(typeof runProductionNlth, 'function');

const capability = getNonlinearCapability(NONLINEAR_ENGINE_IDS.productionNlth);
assert.equal(capability.available, true);
assert.equal(capability.qualification, 'candidate');
assert.equal(capability.designBlocked, true);
assert.equal(capability.modelBound, true);
assert.equal(capability.executionMode, 'async');

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase8MdofMassDomain, MDOF_MASS_DOMAIN_VERSION);
assert.equal(manifest.modules.phase8MdofGroundMotion, MDOF_GROUND_MOTION_VERSION);
assert.equal(manifest.modules.phase8MdofDamping, MDOF_DAMPING_VERSION);
assert.equal(manifest.modules.phase8MdofDynamicHistory, MDOF_DYNAMIC_HISTORY_VERSION);
assert.equal(manifest.modules.phase8MdofNewmark, MDOF_NEWMARK_VERSION);
assert.equal(manifest.modules.phase8ProductionNlth, PRODUCTION_NLTH_VERSION);
assert.equal(manifest.modules.phase8ProductionNlthEngine, PRODUCTION_NLTH_ENGINE_VERSION);
assert.equal(manifest.milestones.find((row) => row.id === 'P8-M8')?.status, 'candidate');

const status = readFileSync(new URL('../docs/phase8/IMPLEMENTATION_STATUS.md', import.meta.url), 'utf8');
const hub = readFileSync(new URL('../docs/phase8/README.md', import.meta.url), 'utf8');
const plan = readFileSync(new URL('../docs/phase8/MILESTONE_EXECUTION_PLAN.md', import.meta.url), 'utf8');
assert.match(status, /completed_milestones: .*P8-M8/);
assert.match(status, /\| P8-M8 MDOF NLTH \| complete \|/);
assert.match(hub, /P8-M0~P8-M\d+.*완료/);
assert.match(plan, /^## P8-M8 - /m);
for (const path of [
  '../docs/phase8/adr/ADR-008-NEWMARK-DAMPING-SUBSTEP-POLICY.md',
  '../reports/validation-evidence/phase8/p8-m8-code-review.md',
]) assert.ok(readFileSync(new URL(path, import.meta.url), 'utf8').length > 500, path);

console.log(JSON.stringify({
  ok: true,
  suiteId: suite.id,
  verificationCount: suite.verificationIds.length,
  publicModuleCount: 8,
  productionEngineId: NONLINEAR_ENGINE_IDS.productionNlth,
  qualification: capability.qualification,
  nextMilestone: 'P8-M9',
}, null, 2));
