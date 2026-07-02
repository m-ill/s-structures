import assert from 'node:assert/strict';
import {
  AGENT_MANIFEST_VERSION,
  buildAgentManifest,
  createPortalFrameSample,
} from '../src/index.js';
import { createIndexAgentApi, INDEX_BRIDGE_VERSION } from '../src/ui/indexBridge.js';

const direct = buildAgentManifest({
  bridgeVersion: INDEX_BRIDGE_VERSION,
  availableActions: ['runAnalysis', 'runPushover'],
  controls: [{ id: 'engine-results-dock', label: 'Engine Results' }],
});
assert.equal(direct.version, AGENT_MANIFEST_VERSION);
assert.equal(direct.bridgeVersion, INDEX_BRIDGE_VERSION);
assert.ok(direct.readApis.includes('getResultVisuals'));
assert.ok(direct.readApis.includes('getReport'));
assert.ok(direct.readApis.includes('runPushover'));
assert.ok(direct.executeActions.includes('runPushover'));
assert.equal(direct.uiContract.stableAttribute, 'data-agent-id');
assert.equal(direct.uiContract.controlCount, 1);
assert.equal(direct.qaCommands.phase3Full, 'npm.cmd run test:p3');
assert.equal(direct.qaCommands.phase3M6ToM20, 'node tools/run-milestone-tests.mjs --phase3 --from=P3-M6 --to=P3-M20');
assert.equal(direct.reviewGates.integratedResults.path, 'integratedGate.integratedReview');
assert.equal(direct.reviewGates.launchReadiness.finalApprovalField, 'productionDeploymentApproved');
assert.ok(direct.milestones.some((item) => item.id === 'M15' && item.status === 'preliminary'));
assert.ok(direct.limitations.some((item) => item.includes('preliminary')));
assert.ok(direct.limitations.some((item) => item.includes('previous-step hinge secant stiffness degradation')));
assert.equal(direct.limitations.some((item) => item.includes('does not yet rebuild tangent stiffness')), false);

const model = createPortalFrameSample();
const target = {
  model: () => model,
  reanalyze: () => {},
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => null,
});
const manifest = agent.getCapabilities();
assert.equal(manifest.version, AGENT_MANIFEST_VERSION);
assert.equal(manifest.modules.nativeRibbon, 'm22-native-index-ribbon');
assert.equal(manifest.modules.runtimeAdapter, 'm23-original-index-runtime-adapter');
assert.ok(manifest.executeActions.includes('createGridFrame'));
assert.ok(manifest.executeActions.includes('runPushover'));
assert.ok(manifest.executeActions.includes('setNativeMode'));
assert.ok(manifest.readApis.includes('getCapabilities'));
assert.ok(manifest.readApis.includes('getRuntimeDiagnostics'));
assert.ok(manifest.readApis.includes('getMaterialSectionRegistry'));
assert.ok(manifest.readApis.includes('getElasticExpansionTrace'));
assert.ok(manifest.readApis.includes('getWallSlabEquivalentTrace'));
assert.ok(manifest.readApis.includes('getLoadsV2Trace'));
assert.ok(manifest.readApis.includes('getDynamicCompletenessTrace'));
assert.ok(manifest.readApis.includes('getNonlinearAnalysisTrace'));
assert.ok(manifest.dataContracts.includes('phase3LoadsV2Trace'));
assert.ok(manifest.dataContracts.includes('phase3NonlinearAnalysisTrace'));
assert.equal(manifest.qaCommands.phase3Full, 'npm.cmd run test:p3');
assert.equal(manifest.qaCommands.phase3RunnerContract, 'node tests/p3-runner-contract.mjs');
assert.equal(manifest.reviewGates.nonlinearFiberNlth.readyDecision, 'm16-ready-for-integrated-results-review');
assert.equal(manifest.reviewGates.rcDetailedDesign.finalApprovalField, 'finalPermitDesign');
assert.ok(manifest.milestones.some((item) => item.id === 'P3-M15'));
assert.ok(manifest.milestones.some((item) => item.id === 'P3-M16'));
assert.equal(manifest.uiContract.controlCount, 0);

const snapshot = agent.getSnapshot();
assert.deepEqual(snapshot.availableActions, manifest.executeActions);
assert.ok(manifest.milestones.some((item) => item.id === 'M23'));

console.log(JSON.stringify({
  ok: true,
  manifestVersion: manifest.version,
  actionCount: manifest.executeActions.length,
  readApiCount: manifest.readApis.length,
}, null, 2));
