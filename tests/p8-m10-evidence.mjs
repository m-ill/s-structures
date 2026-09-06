import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AGENT_MANIFEST_VERSION, buildAgentManifest } from '../src/ui/agentManifest.js';
import { availableAgentActions } from '../src/ui/indexAgentApi.js';
import {
  getPhase8VerificationSuite,
  validatePhase8EvidenceArtifact,
  verificationRegistryManifest,
} from '../verification/framework/registry.js';

const artifactPath = new URL('../verification/evidence/validation/phase8/p8-m10-ui-api.json', import.meta.url);
const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
const suite = getPhase8VerificationSuite('P8-M10-UI-API');
assert.ok(suite);
assert.equal(suite.milestone, 'P8-M10');
assert.equal(suite.required, true);
assert.equal(suite.verificationIds.length, 24);
assert.equal(validatePhase8EvidenceArtifact(artifact).ok, true, validatePhase8EvidenceArtifact(artifact).errors.join(', '));
assert.deepEqual(new Set(artifact.verificationIds), new Set(suite.verificationIds));

const registry = verificationRegistryManifest();
assert.equal(registry.version, 'p8-m11-verification-registry-v12');
assert.ok(registry.suites.some((row) => row.id === suite.id));

const manifest = buildAgentManifest({
  bridgeVersion: 'p8-m10-index-engine-bridge',
  availableActions: availableAgentActions(),
  controls: [],
});
assert.equal(manifest.version, AGENT_MANIFEST_VERSION);
assert.equal(manifest.modules.phase8NonlinearProductService, 'p8-m10-product-service-v1');
assert.equal(manifest.modules.phase8NonlinearWorkflow, 'p9-m9-nonlinear-workflow-ui-v2');
assert.equal(manifest.modules.phase8NonlinearResultPopup, 'p8-m10-nonlinear-result-popup-v1');
for (const action of [
  'validateNonlinearCase',
  'createProductionNonlinearCase',
  'startNonlinearRun',
  'pauseNonlinearRun',
  'cancelNonlinearRun',
  'resumeNonlinearRun',
  'retryNonlinearRun',
  'getNonlinearRunStatus',
  'listNonlinearRuns',
  'getNonlinearRunGraph',
  'getNonlinearResultSlice',
  'explainNonlinearFailure',
  'exportNonlinearHistory',
  'getNonlinearReport',
]) {
  assert.ok(manifest.executeActions.includes(action), action);
}
assert.ok(manifest.milestones.some((row) => row.id === 'P8-M10' && row.status === 'candidate'));

const implementationStatus = await readFile(new URL('../docs/phase8/IMPLEMENTATION_STATUS.md', import.meta.url), 'utf8');
const phaseReadme = await readFile(new URL('../docs/phase8/README.md', import.meta.url), 'utf8');
const adr = await readFile(new URL('../docs/phase8/adr/ADR-011-PRODUCT-WORKFLOW-JOB-RESULT-API.md', import.meta.url), 'utf8');
assert.match(implementationStatus, /implementation_status: p8-m11-complete/);
assert.match(implementationStatus, /active_milestone: none/);
assert.match(implementationStatus, /P8-M10 UI·보고·Agent 계약 \| complete/);
assert.match(implementationStatus, /P8-M11 독립검증·성능·pilot \| implementation complete \/ acceptance blocked/);
assert.match(phaseReadme, /current_milestone: none/);
assert.match(adr, /settings-byte parity|settings bytes/i);
assert.match(adr, /module Worker/);
assert.match(adr, /designBlocked:true/);

console.log(JSON.stringify({
  ok: true,
  verificationIds: suite.verificationIds,
  suiteId: suite.id,
  registryVersion: registry.version,
  manifestVersion: manifest.version,
  actionCount: manifest.executeActions.length,
  evidenceStatus: artifact.status,
  qualificationImpact: artifact.qualificationImpact,
}, null, 2));
