import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildPhase3DesignMilestoneReview,
  buildPhase3DrawingImportValidationReview,
  buildPhase3EngineeringValidationReview,
  buildPhase3ElasticMilestoneReview,
  buildPhase3ImportMilestoneReview,
  buildPhase3NonlinearMilestoneReview,
  buildPhase3PointCloudValidationReview,
  buildPhase3PracticeValidationReview,
  buildPhase3ProductizationMilestoneReview,
  buildPhase3OwnerSignoffReview,
  buildPhase3CompletionAuditReview,
  buildPhase3EvidenceRegister,
  buildAgentManifest,
  buildPhase3PlanAlignmentReport,
  PHASE3_DESIGN_MILESTONE_REVIEW_VERSION,
  PHASE3_DRAWING_IMPORT_VALIDATION_REVIEW_VERSION,
  PHASE3_ENGINEERING_VALIDATION_REVIEW_VERSION,
  PHASE3_ELASTIC_MILESTONE_REVIEW_VERSION,
  PHASE3_IMPORT_MILESTONE_REVIEW_VERSION,
  PHASE3_NONLINEAR_MILESTONE_REVIEW_VERSION,
  PHASE3_PLAN_ALIGNMENT_VERSION,
  PHASE3_POINT_CLOUD_VALIDATION_REVIEW_VERSION,
  PHASE3_PRACTICE_VALIDATION_REVIEW_VERSION,
  PHASE3_PRODUCTIZATION_MILESTONE_REVIEW_VERSION,
  PHASE3_OWNER_SIGNOFF_REVIEW_VERSION,
  PHASE3_COMPLETION_AUDIT_REVIEW_VERSION,
  PHASE3_EVIDENCE_REGISTER_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';
import { EVIDENCE_CLIENT_VERSION } from '../src/app/evidenceClient.js';

const manifest = buildAgentManifest();
const report = buildPhase3PlanAlignmentReport(manifest);
const sourceDocMarkers = {
  'docs/phase3/PRODUCT_REQUIREMENTS.md': ['# Phase 3 Product Requirements', 'FR-20', 'AI agent'],
  'docs/phase3/ROADMAP.md': ['# Phase 3 Roadmap', 'P3-M6', 'P3-M20'],
  'docs/phase3/IMPLEMENTATION_BACKLOG.md': ['# Phase 3 Implementation Backlog', 'P3-T67', 'P3-T57'],
  'docs/phase3/ARCHITECTURE.md': ['# Phase 3 System Architecture', 'D10', 'ImportCandidate'],
  'docs/phase3/SERVER_API_PLAN.md': ['# Phase 3 Server API Plan', '/api/auth/login', 'UNAUTHORIZED'],
  'docs/phase3/AUTH_ACCOUNT_PLAN.md': ['# Phase 3 Auth And Account Plan', 'scrypt', 'HMAC-SHA256'],
  'docs/phase3/PERSISTENCE_PLAN.md': ['# Phase 3 Persistence Plan', 'autosave', 'modelToJson'],
  'docs/phase3/FRONTEND_PLAN.md': ['# Phase 3 Frontend Plan', '#/p/:id/modeler', 'confirmImport'],
  'docs/phase3/IMPORT_DXF_DWG_PLAN.md': ['# Phase 3 DXF/DWG Import Plan', 'P3-M6 DXF Parser', 'ImportCandidate'],
  'docs/phase3/IMPORT_POINT_CLOUD_PLAN.md': ['# Phase 3 Point Cloud Import Plan', 'P3-M9 Structure Extraction', 'ImportCandidate'],
  'docs/phase3/MATERIAL_SECTION_LIBRARY_PLAN.md': ['# Phase 3 Material And Section Library Plan', 'id@version', 'src/materials/'],
  'docs/phase3/NONLINEAR_ENGINE_PLAN.md': ['# Phase 3 Nonlinear Engine Plan', 'P3-T50', 'B1'],
  'docs/phase3/QA_RELEASE_PLAN.md': ['# Phase 3 QA And Release Plan', 'G1', 'tests/p3-launch-gate.mjs'],
  'docs/phase3/DEVELOPMENT_FILE_MAP.md': ['# Phase 3 Development File Map', 'server/', 'src/nonlinear/'],
};

assert.equal(report.version, PHASE3_PLAN_ALIGNMENT_VERSION);
assert.equal(report.sourceDocCount, 14);
assert.equal(report.scenarios.length, 5);
assert.equal(report.stages.length, 6);
assert.equal(report.milestones.length, 21);
assert.equal(report.status, 'OK');
assert.equal(report.productionReadiness.status, 'PRELIMINARY_REVIEW_REQUIRED');
assert.equal(report.productionReadiness.productionReady, false);
assert.equal(report.productionReadiness.rule, 'Plan alignment can be OK while one or more milestones remain preliminary.');
assert.ok(report.productionReadiness.requiredBeforeFinalUse.some((row) => row.id === 'P3-M14'));
assert.ok(report.productionReadiness.requiredBeforeFinalUse.some((row) => row.id === 'P3-M20'));
assert.equal(report.maturity.source, 'getCapabilities().milestones');
assert.equal(report.maturity.milestoneCount, 21);
assert.ok(report.maturity.availableCount > 0);
assert.ok(report.maturity.preliminaryCount > 0);
assert.equal(report.maturity.productionReady, false);
assert.ok(report.maturity.byStatus.preliminary > 0);
assert.ok(report.maturity.preliminaryMilestones.every((row) => row.id.startsWith('P3-M')));
assert.equal(report.requirements.functional.length, 32);
assert.equal(report.requirements.nonFunctional.length, 8);
assert.equal(report.requirements.successCriteria.length, 9);
assert.equal(report.requirements.launchGates.length, 14);
assert.equal(report.requirements.ok, true);
assert.equal(report.architecture.decisions.length, 10);
assert.equal(report.architecture.ok, true);
assert.equal(report.serverApi.ok, true);
assert.equal(report.serverApi.endpoints.length, 31);
assert.deepEqual(report.serverApi.errorEnvelope.codes, ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION', 'CONFLICT', 'PAYLOAD_TOO_LARGE', 'RATE_LIMITED', 'INTERNAL']);
assert.equal(report.serverApi.auth.password.hash, 'node:crypto.scrypt');
assert.equal(report.serverApi.auth.token.signature, 'HMAC-SHA256');
assert.deepEqual(report.serverApi.auth.projectRoles.map((row) => row.id), ['owner', 'engineer', 'reviewer', 'viewer']);
assert.deepEqual(report.serverApi.persistence.layers.map((row) => row.id), ['L1', 'L2', 'L3']);
assert.equal(report.serverApi.persistence.conflictRule, 'last-write-wins-with-lineage-warning');
assert.ok(report.serverApi.endpoints.find((row) => row.method === 'POST' && row.path === '/api/projects/:id/revisions').permission === 'engineer+');
assert.ok(report.serverApi.endpoints.find((row) => row.method === 'POST' && row.path === '/api/projects/:id/approval').permission === 'reviewer+');
assert.ok(report.serverApi.endpoints.find((row) => row.method === 'PUT' && row.path === '/api/projects/:id/library/:kind/:itemId').permission === 'engineer+');
assert.ok(report.serverApi.endpoints.find((row) => row.method === 'POST' && row.path === '/api/projects/:id/evidence').permission === 'engineer+');
assert.equal(report.frontend.ok, true);
assert.equal(report.frontend.routes.length, 7);
assert.ok(report.frontend.routes.includes('#/p/:id/import/:jobId'));
assert.ok(report.frontend.agentApis.includes('confirmImport'));
assert.equal(report.importPipeline.ok, true);
assert.deepEqual(report.importPipeline.drawingPaths.map((row) => row.id), ['3d-wireframe-dxf', '2d-floor-plan-dxf', 'dwg']);
assert.ok(report.importPipeline.dxfEntities.includes('INSERT'));
assert.deepEqual(report.importPipeline.pointCloudFormats.filter((row) => row.status === 'v1').map((row) => row.id), ['XYZ/TXT', 'PLY', 'PCD']);
assert.equal(report.importPipeline.benchmarkTargets.columnRecall, 0.9);
assert.equal(report.materialLibrary.ok, true);
assert.ok(report.materialLibrary.materialFields.includes('nonlinear'));
assert.ok(report.materialLibrary.sectionFields.includes('properties'));
assert.ok(report.materialLibrary.registryRules.includes('id@version-reference'));
assert.ok(report.materialLibrary.registryRules.includes('legacy-unversioned-warning'));
assert.deepEqual(report.materialLibrary.agentActions, ['listLibrary', 'getLibraryItem', 'upsertMaterial', 'upsertSection']);
assert.equal(report.nonlinearEngine.ok, true);
assert.deepEqual(report.nonlinearEngine.scopeLadder.map((row) => row.id), ['N1', 'N2', 'N3', 'N4', 'N5', 'N6']);
assert.deepEqual(report.nonlinearEngine.benchmarks, ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8']);
assert.deepEqual(report.nonlinearEngine.convergenceNorms, ['force', 'displacement', 'energy']);
assert.ok(report.nonlinearEngine.resultFields.includes('capacityCurve'));
assert.equal(report.reviewGates.ok, true);
assert.deepEqual(report.reviewGates.rows.map((row) => row.id), [
  'nonlinearGeometry',
  'nonlinearHingeControl',
  'nonlinearFiberNlth',
  'rcDetailedDesign',
  'detailedDesignIntegration',
  'integratedResults',
  'launchReadiness',
]);
assert.deepEqual(report.reviewGates.missing, []);
assert.equal(report.reviewGates.rows.find((row) => row.id === 'launchReadiness').path, 'releaseGate.releaseReview');
assert.equal(report.reviewGates.rows.find((row) => row.id === 'integratedResults').finalApprovalField, 'finalStructuralSignoff');
assert.deepEqual(report.architecture.decisions.map((row) => row.id), Array.from({ length: 10 }, (_, index) => `D${index + 1}`));
assert.equal(report.architecture.decisions.find((row) => row.id === 'D2').choice, 'node-http-router');
assert.equal(report.architecture.decisions.find((row) => row.id === 'D6').choice, 'webgl2-module');
assert.ok(report.architecture.moduleBoundaries.find((row) => row.id === 'server-to-src').rule.includes('analysis engine stays in browser'));
assert.ok(report.architecture.fileRouting.find((row) => row.path === 'src/import/').role.includes('ImportCandidate'));
assert.ok(report.requirements.functional.every((row) => row.covered));
assert.ok(report.requirements.nonFunctional.every((row) => row.covered));
assert.ok(report.requirements.successCriteria.every((row) => row.covered));
assert.deepEqual(report.requirements.functional.slice(0, 20).map((row) => row.id), Array.from({ length: 20 }, (_, index) => `FR-${String(index + 1).padStart(2, '0')}`));
assert.equal(report.requirements.functional.find((row) => row.id === 'FR-20').milestones[0], 'P3-M0');
assert.ok(report.requirements.functional.find((row) => row.id === 'FR-32').milestones.includes('P3-M18'));
assert.ok(report.requirements.nonFunctional.find((row) => row.id === 'NFR-06').milestones.includes('P3-M20'));
assert.equal(report.agentReadable, true);
assert.equal(report.missing.length, 0);
assert.ok(report.sourceDocs.includes('docs/phase3/ROADMAP.md'));
assert.ok(report.sourceDocs.includes('docs/phase3/IMPLEMENTATION_BACKLOG.md'));
assert.deepEqual([...report.sourceDocs].sort(), Object.keys(sourceDocMarkers).sort());
for (const [file, markers] of Object.entries(sourceDocMarkers)) {
  assert.equal(existsSync(file), true, file);
  const text = readFileSync(file, 'utf8');
  for (const marker of markers) {
    assert.ok(text.includes(marker), `${file} missing ${marker}`);
  }
}
assert.deepEqual(report.milestones.map((row) => row.id), Array.from({ length: 21 }, (_, index) => `P3-M${index}`));
assert.ok(report.milestones.find((row) => row.id === 'P3-M6').tickets.includes('P3-T26'));
assert.ok(report.milestones.find((row) => row.id === 'P3-M13').tickets.includes('P3-T82'));
assert.ok(report.milestones.find((row) => row.id === 'P3-M20').tests.includes('tests/p3-launch-gate.mjs'));
assert.ok(report.milestones.find((row) => row.id === 'P3-M20').tests.includes('tests/p3-runner-contract.mjs'));
assert.ok(report.milestones.find((row) => row.id === 'P3-M20').tests.includes('tests/p3-doc-reference-integrity.mjs'));
assert.ok(report.milestones.find((row) => row.id === 'P3-M20').tests.includes('tests/p3-server-route-contract.mjs'));
assert.equal(report.activeTicketCount, 93);
assert.equal(report.plannedTicketCount, 95);
assert.deepEqual(report.absorbedTickets.map((row) => row.ticket), ['P3-T57', 'P3-T60']);
assert.deepEqual(report.unresolvedTickets, []);
assert.equal(report.ticketSummary.planned, 95);
assert.equal(report.ticketSummary.active, 93);
assert.equal(report.ticketSummary.absorbed, 2);
assert.equal(report.ticketSummary.unresolved, 0);
assert.equal(report.ticketSummary.effectiveCompletion, true);
assert.equal(manifest.modules.phase3PlanAlignment, PHASE3_PLAN_ALIGNMENT_VERSION);
assert.equal(manifest.modules.phase3DesignMilestoneReview, PHASE3_DESIGN_MILESTONE_REVIEW_VERSION);
assert.equal(manifest.modules.phase3DrawingImportValidationReview, PHASE3_DRAWING_IMPORT_VALIDATION_REVIEW_VERSION);
assert.equal(manifest.modules.phase3EngineeringValidationReview, PHASE3_ENGINEERING_VALIDATION_REVIEW_VERSION);
assert.equal(manifest.modules.phase3ElasticMilestoneReview, PHASE3_ELASTIC_MILESTONE_REVIEW_VERSION);
assert.equal(manifest.modules.phase3ImportMilestoneReview, PHASE3_IMPORT_MILESTONE_REVIEW_VERSION);
assert.equal(manifest.modules.phase3NonlinearMilestoneReview, PHASE3_NONLINEAR_MILESTONE_REVIEW_VERSION);
assert.equal(manifest.modules.phase3PointCloudValidationReview, PHASE3_POINT_CLOUD_VALIDATION_REVIEW_VERSION);
assert.equal(manifest.modules.phase3PracticeValidationReview, PHASE3_PRACTICE_VALIDATION_REVIEW_VERSION);
assert.equal(manifest.modules.phase3ProductizationMilestoneReview, PHASE3_PRODUCTIZATION_MILESTONE_REVIEW_VERSION);
assert.equal(manifest.modules.phase3OwnerSignoffReview, PHASE3_OWNER_SIGNOFF_REVIEW_VERSION);
assert.equal(manifest.modules.phase3CompletionAuditReview, PHASE3_COMPLETION_AUDIT_REVIEW_VERSION);
assert.equal(manifest.modules.phase3EvidenceRegister, PHASE3_EVIDENCE_REGISTER_VERSION);
assert.equal(manifest.modules.phase3EvidenceClient, EVIDENCE_CLIENT_VERSION);
assert.ok(manifest.readApis.includes('getPhase3PlanAlignment'));
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
assert.ok(manifest.readApis.includes('getPhase3CompletionAuditReview'));
assert.ok(manifest.readApis.includes('getPhase3EvidenceRegister'));
assert.ok(manifest.readApis.includes('listProjectEvidence'));
assert.ok(manifest.readApis.includes('submitProjectEvidence'));
assert.ok(manifest.dataContracts.includes('phase3PlanAlignment'));
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
assert.ok(manifest.dataContracts.includes('phase3CompletionAuditReview'));
assert.ok(manifest.dataContracts.includes('phase3EvidenceRegister'));
assert.ok(manifest.dataContracts.includes('phase3EvidenceClient'));
assert.equal(manifest.qaCommands.phase3Full, 'npm.cmd run test:p3');
assert.equal(manifest.qaCommands.phase3M6ToM20, 'node tools/run-milestone-tests.mjs --phase3 --from=P3-M6 --to=P3-M20');

const importMilestoneReview = buildPhase3ImportMilestoneReview();
assert.equal(importMilestoneReview.version, PHASE3_IMPORT_MILESTONE_REVIEW_VERSION);
assert.deepEqual(importMilestoneReview.rows.map((row) => row.milestone), ['P3-M6', 'P3-M7', 'P3-M8', 'P3-M9']);
assert.ok(importMilestoneReview.rows.find((row) => row.milestone === 'P3-M6').automatedEvidence.includes('tests/p3-m6-dxf-import.mjs'));
assert.ok(importMilestoneReview.rows.find((row) => row.milestone === 'P3-M9').externalEvidenceRequired.includes('real scan beam/wall validation'));
assert.equal(importMilestoneReview.summary.productionReady, false);
assert.equal(importMilestoneReview.agentUse.readApi, 'getPhase3ImportMilestoneReview');

const elasticMilestoneReview = buildPhase3ElasticMilestoneReview();
assert.equal(elasticMilestoneReview.version, PHASE3_ELASTIC_MILESTONE_REVIEW_VERSION);
assert.deepEqual(elasticMilestoneReview.rows.map((row) => row.milestone), ['P3-M10', 'P3-M11', 'P3-M12', 'P3-M13']);
assert.ok(elasticMilestoneReview.rows.find((row) => row.milestone === 'P3-M10').tickets.includes('P3-T49'));
assert.ok(elasticMilestoneReview.rows.find((row) => row.milestone === 'P3-M13').contracts.readApis.includes('getDynamicCompletenessTrace'));
assert.equal(elasticMilestoneReview.summary.agentDecision, 'elastic-completeness-engineer-review-required');
assert.equal(elasticMilestoneReview.agentUse.readApi, 'getPhase3ElasticMilestoneReview');

const nonlinearMilestoneReview = buildPhase3NonlinearMilestoneReview();
assert.equal(nonlinearMilestoneReview.version, PHASE3_NONLINEAR_MILESTONE_REVIEW_VERSION);
assert.deepEqual(nonlinearMilestoneReview.rows.map((row) => row.milestone), ['P3-M14', 'P3-M15', 'P3-M16']);
assert.deepEqual(nonlinearMilestoneReview.summary.scopeLadder, ['N1', 'N2', 'N3', 'N4', 'N5', 'N6']);
assert.deepEqual(nonlinearMilestoneReview.summary.benchmarkCases, ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8']);
assert.equal(nonlinearMilestoneReview.rows.find((row) => row.milestone === 'P3-M15').contracts.gatePath, 'hingeControlGate.controlReview');
assert.equal(nonlinearMilestoneReview.agentUse.readApi, 'getPhase3NonlinearMilestoneReview');

const designMilestoneReview = buildPhase3DesignMilestoneReview();
assert.equal(designMilestoneReview.version, PHASE3_DESIGN_MILESTONE_REVIEW_VERSION);
assert.deepEqual(designMilestoneReview.rows.map((row) => row.milestone), ['P3-M17', 'P3-M18']);
assert.ok(designMilestoneReview.rows.find((row) => row.milestone === 'P3-M17').tickets.includes('P3-T90'));
assert.equal(designMilestoneReview.rows.find((row) => row.milestone === 'P3-M18').contracts.gatePath, 'designGate.designReview');
assert.ok(designMilestoneReview.summary.designScopes.includes('connection-base-plate'));
assert.equal(designMilestoneReview.agentUse.readApi, 'getPhase3DesignMilestoneReview');

const drawingImportValidationReview = buildPhase3DrawingImportValidationReview();
assert.equal(drawingImportValidationReview.version, PHASE3_DRAWING_IMPORT_VALIDATION_REVIEW_VERSION);
assert.ok(drawingImportValidationReview.requiredEvidence.includes('visual overlay evidence for import review'));
assert.equal(drawingImportValidationReview.summary.ownerReviewRequired, true);
assert.equal(drawingImportValidationReview.agentUse.readApi, 'getPhase3DrawingImportValidationReview');

const engineeringValidationReview = buildPhase3EngineeringValidationReview();
assert.equal(engineeringValidationReview.version, PHASE3_ENGINEERING_VALIDATION_REVIEW_VERSION);
assert.ok(engineeringValidationReview.requiredEvidence.includes('production nonlinear solver certification'));
assert.equal(engineeringValidationReview.summary.engineerReviewRequired, true);
assert.equal(engineeringValidationReview.agentUse.readApi, 'getPhase3EngineeringValidationReview');

const productizationMilestoneReview = buildPhase3ProductizationMilestoneReview();
assert.equal(productizationMilestoneReview.version, PHASE3_PRODUCTIZATION_MILESTONE_REVIEW_VERSION);
assert.deepEqual(productizationMilestoneReview.rows.map((row) => row.milestone), ['P3-M19', 'P3-M20']);
assert.ok(productizationMilestoneReview.rows.find((row) => row.milestone === 'P3-M19').tickets.includes('P3-T62'));
assert.equal(productizationMilestoneReview.rows.find((row) => row.milestone === 'P3-M20').contracts.gatePath, 'releaseGate.releaseReview');
assert.ok(productizationMilestoneReview.summary.productizationScopes.includes('calculation-report-method-limitations'));
assert.equal(productizationMilestoneReview.agentUse.readApi, 'getPhase3ProductizationMilestoneReview');

const ownerSignoffReview = buildPhase3OwnerSignoffReview();
assert.equal(ownerSignoffReview.version, PHASE3_OWNER_SIGNOFF_REVIEW_VERSION);
assert.equal(ownerSignoffReview.summary.requiredCount, 7);
assert.ok(ownerSignoffReview.summary.missing.includes('real-dwg-conversion'));
assert.ok(ownerSignoffReview.summary.missing.includes('security-signoff'));
assert.equal(ownerSignoffReview.summary.productionDeploymentApproved, false);
assert.equal(ownerSignoffReview.agentUse.readApi, 'getPhase3OwnerSignoffReview');

const completionAuditReview = buildPhase3CompletionAuditReview();
assert.equal(completionAuditReview.version, PHASE3_COMPLETION_AUDIT_REVIEW_VERSION);
assert.equal(completionAuditReview.summary.milestoneCount, 21);
assert.equal(completionAuditReview.summary.provenCount, 7);
assert.equal(completionAuditReview.summary.productionReady, false);
assert.ok(completionAuditReview.rows.find((row) => row.milestone === 'P3-M0').readApis.includes('getPhase3PlanAlignment'));
assert.ok(completionAuditReview.rows.find((row) => row.milestone === 'P3-M5').readApis.includes('listImportCandidates'));
assert.ok(completionAuditReview.rows.find((row) => row.milestone === 'P3-M20').readApis.includes('getPhase3OwnerSignoffReview'));
assert.equal(completionAuditReview.agentUse.readApi, 'getPhase3CompletionAuditReview');

const evidenceRegister = buildPhase3EvidenceRegister();
assert.equal(evidenceRegister.version, PHASE3_EVIDENCE_REGISTER_VERSION);
assert.ok(evidenceRegister.summary.missing.includes('real-pointcloud-files'));
assert.ok(evidenceRegister.summary.missing.includes('security-signoff'));
assert.equal(evidenceRegister.agentUse.readApi, 'getPhase3EvidenceRegister');

const practiceValidationReview = buildPhase3PracticeValidationReview();
assert.equal(practiceValidationReview.version, PHASE3_PRACTICE_VALIDATION_REVIEW_VERSION);
assert.ok(practiceValidationReview.rows.find((row) => row.id === 'point-cloud-import').milestones.includes('P3-M9'));
assert.ok(practiceValidationReview.rows.find((row) => row.id === 'point-cloud-import').readApis.includes('getPhase3PointCloudValidationReview'));
assert.ok(practiceValidationReview.rows.find((row) => row.id === 'elastic-core').requiredEvidence.includes('project-specific KDS load exception review'));
assert.equal(practiceValidationReview.summary.ownerReviewRequired, true);
assert.equal(practiceValidationReview.agentUse.readApi, 'getPhase3PracticeValidationReview');

const pointCloudValidationReview = buildPhase3PointCloudValidationReview();
assert.equal(pointCloudValidationReview.version, PHASE3_POINT_CLOUD_VALIDATION_REVIEW_VERSION);
assert.ok(pointCloudValidationReview.requiredEvidence.includes('owner-provided real point-cloud files'));
assert.equal(pointCloudValidationReview.summary.ownerReviewRequired, true);
assert.equal(pointCloudValidationReview.agentUse.readApi, 'getPhase3PointCloudValidationReview');

const agent = createIndexAgentApi({ model: () => null, reanalyze: () => {} });
const apiReport = agent.getPhase3PlanAlignment();
assert.equal(apiReport.version, PHASE3_PLAN_ALIGNMENT_VERSION);
assert.equal(apiReport.status, 'OK');
assert.equal(apiReport.productionReadiness.status, 'PRELIMINARY_REVIEW_REQUIRED');
assert.equal(agent.getPhase3DesignMilestoneReview().version, PHASE3_DESIGN_MILESTONE_REVIEW_VERSION);
assert.equal(agent.getPhase3DrawingImportValidationReview().version, PHASE3_DRAWING_IMPORT_VALIDATION_REVIEW_VERSION);
assert.equal(agent.getPhase3EngineeringValidationReview().version, PHASE3_ENGINEERING_VALIDATION_REVIEW_VERSION);
assert.equal(agent.getPhase3ElasticMilestoneReview().version, PHASE3_ELASTIC_MILESTONE_REVIEW_VERSION);
assert.equal(agent.getPhase3ImportMilestoneReview().version, PHASE3_IMPORT_MILESTONE_REVIEW_VERSION);
assert.equal(agent.getPhase3NonlinearMilestoneReview().version, PHASE3_NONLINEAR_MILESTONE_REVIEW_VERSION);
assert.equal(agent.getPhase3PointCloudValidationReview().version, PHASE3_POINT_CLOUD_VALIDATION_REVIEW_VERSION);
assert.equal(agent.getPhase3PracticeValidationReview().version, PHASE3_PRACTICE_VALIDATION_REVIEW_VERSION);
assert.equal(agent.getPhase3ProductizationMilestoneReview().version, PHASE3_PRODUCTIZATION_MILESTONE_REVIEW_VERSION);
assert.equal(agent.getPhase3OwnerSignoffReview().version, PHASE3_OWNER_SIGNOFF_REVIEW_VERSION);
assert.equal(agent.getPhase3CompletionAuditReview().version, PHASE3_COMPLETION_AUDIT_REVIEW_VERSION);
assert.equal(agent.getPhase3EvidenceRegister().version, PHASE3_EVIDENCE_REGISTER_VERSION);

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
assert.deepEqual(Object.keys(packageJson.dependencies || {}), []);
assert.deepEqual(Object.keys(packageJson.devDependencies || {}), []);

const serverFiles = listFiles('server').filter((file) => file.endsWith('.mjs'));
const forbiddenServerImports = serverFiles.filter((file) => {
  const text = readFileSync(file, 'utf8');
  return /from\s+['"]\.\.\/src\/(solver|design|nonlinear|results|report|dynamics|loads)\//.test(text);
});
assert.deepEqual(forbiddenServerImports, []);
assert.ok(readFileSync('server/router.mjs', 'utf8').includes('ok: false'));
assert.ok(readFileSync('server/auth/password.mjs', 'utf8').includes('timingSafeEqual'));
assert.ok(readFileSync('server/auth/token.mjs', 'utf8').includes('sha256'));
assert.ok(readFileSync('server/store/projectStore.mjs', 'utf8').includes('lineageWarning'));
for (const file of report.frontend.modules) {
  assert.equal(existsSync(file), true, file);
}
for (const file of report.materialLibrary.modules) {
  assert.equal(existsSync(file), true, file);
}
for (const file of report.nonlinearEngine.modules) {
  assert.equal(existsSync(file), true, file);
}
assert.ok(readFileSync('src/import/candidate.js', 'utf8').includes('ImportCandidate'));
assert.ok(readFileSync('src/import/dxf/importDxf.js', 'utf8').includes('ignoredDetails'));
assert.ok(readFileSync('src/import/dwg/adapter.js', 'utf8').includes('IMPORT_DWG_CONVERTER_MISSING'));
assert.ok(readFileSync('src/import/pointcloud/worker.js', 'utf8').includes('processPointCloudText'));
assert.ok(readFileSync('src/import/pointcloud/extract.js', 'utf8').includes('realScanValidation'));
assert.ok(readFileSync('src/app/views/importReview.js', 'utf8').includes('confirm'));
assert.ok(readFileSync('src/materials/registry.js', 'utf8').includes('parseVersionedId'));
assert.ok(readFileSync('src/materials/materialSchema.js', 'utf8').includes('nonlinear.backbone'));
assert.ok(readFileSync('src/materials/libraryEdit.js', 'utf8').includes('upsertMaterial'));
assert.ok(readFileSync('src/materials/db/ksH.js', 'utf8').includes('KS-H-2024'));
assert.ok(readFileSync('src/nonlinear/trace.js', 'utf8').includes('requiredCases'));
assert.ok(readFileSync('src/nonlinear/trace.js', 'utf8').includes('capacityCurve'));
assert.ok(readFileSync('src/nonlinear/control/newtonRaphson.js', 'utf8').includes('lineSearch'));
assert.ok(readFileSync('src/nonlinear/control/arcLength.js', 'utf8').includes('crisfield'));
assert.ok(readFileSync('src/nonlinear/dynamics/newmark.js', 'utf8').includes('NLTH_NEWMARK_VERSION'));

console.log(JSON.stringify({
  ok: true,
  version: PHASE3_PLAN_ALIGNMENT_VERSION,
  milestones: report.milestones.length,
  functionalRequirements: report.requirements.functional.length,
  architectureDecisions: report.architecture.decisions.length,
  endpoints: report.serverApi.endpoints.length,
  frontendRoutes: report.frontend.routes.length,
  importPaths: report.importPipeline.drawingPaths.length,
  materialFields: report.materialLibrary.materialFields.length,
  nonlinearBenchmarks: report.nonlinearEngine.benchmarks.length,
  reviewGates: report.reviewGates.rows.length,
  activeTickets: report.activeTicketCount,
  plannedTickets: report.plannedTicketCount,
  absorbedTickets: report.ticketSummary.absorbed,
  unresolvedTickets: report.ticketSummary.unresolved,
}, null, 2));

function listFiles(dir) {
  return readdirSync(dir)
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? listFiles(path) : [path];
    });
}
