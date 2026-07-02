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
assert.ok(manifest.readApis.includes('getPhase3DesignMilestoneReview'));
assert.ok(manifest.readApis.includes('getPhase3DrawingImportValidationReview'));
assert.ok(manifest.readApis.includes('getPhase3EngineeringValidationReview'));
assert.ok(manifest.readApis.includes('getPhase3ElasticMilestoneReview'));
assert.ok(manifest.readApis.includes('getPhase3ImportMilestoneReview'));
assert.ok(manifest.readApis.includes('getPhase3NonlinearMilestoneReview'));
assert.ok(manifest.readApis.includes('getPhase3PointCloudValidationReview'));
assert.ok(manifest.readApis.includes('getPhase3PracticeValidationReview'));
assert.ok(manifest.readApis.includes('getPhase3ProductizationMilestoneReview'));
assert.ok(manifest.readApis.includes('getPhase3OwnerSignoffReview'));
assert.ok(manifest.dataContracts.includes('phase3LoadsV2Trace'));
assert.ok(manifest.dataContracts.includes('phase3NonlinearAnalysisTrace'));
assert.ok(manifest.dataContracts.includes('phase3DesignMilestoneReview'));
assert.ok(manifest.dataContracts.includes('phase3DrawingImportValidationReview'));
assert.ok(manifest.dataContracts.includes('phase3EngineeringValidationReview'));
assert.ok(manifest.dataContracts.includes('phase3ElasticMilestoneReview'));
assert.ok(manifest.dataContracts.includes('phase3ImportMilestoneReview'));
assert.ok(manifest.dataContracts.includes('phase3NonlinearMilestoneReview'));
assert.ok(manifest.dataContracts.includes('phase3PointCloudValidationReview'));
assert.ok(manifest.dataContracts.includes('phase3PracticeValidationReview'));
assert.ok(manifest.dataContracts.includes('phase3ProductizationMilestoneReview'));
assert.ok(manifest.dataContracts.includes('phase3OwnerSignoffReview'));
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
const importMilestoneReview = agent.getPhase3ImportMilestoneReview();
assert.equal(importMilestoneReview.summary.milestoneCount, 4);
assert.equal(importMilestoneReview.rows[0].milestone, 'P3-M6');
assert.equal(importMilestoneReview.summary.agentDecision, 'import-pipeline-review-required');
assert.ok(importMilestoneReview.agentUse.importApis.includes('confirmImport'));
const elasticMilestoneReview = agent.getPhase3ElasticMilestoneReview();
assert.deepEqual(elasticMilestoneReview.rows.map((row) => row.milestone), ['P3-M10', 'P3-M11', 'P3-M12', 'P3-M13']);
assert.equal(elasticMilestoneReview.summary.productionReady, false);
assert.ok(elasticMilestoneReview.agentUse.primaryReviewApis.includes('getLoadsV2Trace'));
const nonlinearMilestoneReview = agent.getPhase3NonlinearMilestoneReview();
assert.deepEqual(nonlinearMilestoneReview.rows.map((row) => row.milestone), ['P3-M14', 'P3-M15', 'P3-M16']);
assert.deepEqual(nonlinearMilestoneReview.summary.benchmarkCases, ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8']);
assert.equal(nonlinearMilestoneReview.summary.agentDecision, 'nonlinear-engine-review-required');
const designMilestoneReview = agent.getPhase3DesignMilestoneReview();
assert.deepEqual(designMilestoneReview.rows.map((row) => row.milestone), ['P3-M17', 'P3-M18']);
assert.ok(designMilestoneReview.summary.designScopes.includes('foundation'));
assert.equal(designMilestoneReview.summary.agentDecision, 'detailed-design-engineer-review-required');
const drawingImportValidationReview = agent.getPhase3DrawingImportValidationReview();
assert.ok(drawingImportValidationReview.summary.missing.includes('real-office-dxf-fixtures'));
assert.equal(drawingImportValidationReview.summary.agentDecision, 'collect-drawing-import-validation-evidence');
const engineeringValidationReview = agent.getPhase3EngineeringValidationReview();
assert.ok(engineeringValidationReview.summary.missing.includes('design-code-clause-review'));
assert.equal(engineeringValidationReview.summary.agentDecision, 'collect-engineering-validation-evidence');
const pointCloudValidationReview = agent.getPhase3PointCloudValidationReview();
assert.ok(pointCloudValidationReview.summary.missing.includes('real-scan-validation'));
assert.equal(pointCloudValidationReview.summary.agentDecision, 'collect-pointcloud-validation-evidence');
const productizationMilestoneReview = agent.getPhase3ProductizationMilestoneReview();
assert.deepEqual(productizationMilestoneReview.rows.map((row) => row.milestone), ['P3-M19', 'P3-M20']);
assert.ok(productizationMilestoneReview.summary.productizationScopes.includes('beta-pilot-scenarios'));
assert.equal(productizationMilestoneReview.summary.agentDecision, 'productization-owner-review-required');
const ownerSignoffReview = agent.getPhase3OwnerSignoffReview();
assert.ok(ownerSignoffReview.summary.missing.includes('security-signoff'));
assert.equal(ownerSignoffReview.summary.agentDecision, 'collect-owner-signoff-evidence');
const practiceValidationReview = agent.getPhase3PracticeValidationReview();
assert.ok(practiceValidationReview.summary.affectedMilestones.includes('P3-M20'));
assert.equal(practiceValidationReview.summary.agentDecision, 'collect-practice-validation-evidence-before-production-use');

console.log(JSON.stringify({
  ok: true,
  manifestVersion: manifest.version,
  actionCount: manifest.executeActions.length,
  readApiCount: manifest.readApis.length,
}, null, 2));
