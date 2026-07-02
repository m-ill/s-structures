import assert from 'node:assert/strict';
import {
  analyzeModel,
  buildAgentManifest,
  buildConnectionDetailedDesignReport,
  buildFoundationDetailedDesignReport,
  buildP3DetailedDesignReport,
  buildP3DetailedDesignGate,
  buildSteelDetailedDesignReport,
  createCantileverTipLoad,
  createTwoStoryElasticFrameModel,
  designBoltGroup,
  designFilletWeld,
  DESIGN_FORMULA_REGISTRY_VERSION,
  P3_DETAILED_DESIGN_GATE_VERSION,
  P3_DETAILED_DESIGN_REPORT_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const cantilever = createCantileverTipLoad({ L: 4, P: 10 }).model;
cantilever.designParams.global.defaultDeflectionLimitTotal = 20;
const cantileverAnalysis = analyzeModel(cantilever);
assert.equal(cantileverAnalysis.ok, true);

const steel = buildSteelDetailedDesignReport(cantilever, cantileverAnalysis);
assert.equal(steel.contract.milestone, 'P3-M18');
assert.equal(steel.rows.length, 1);
assert.ok(steel.rows[0].contract.tickets.includes('P3-T91'));
assert.ok(steel.rows[0].summary.governingUtilization >= 0);
assert.ok(steel.rows[0].classification.formulaId);
assert.ok(steel.rows[0].compression.formulaId);
assert.ok(steel.rows[0].flexureLtb.formulaId);
assert.ok(steel.formulaTrace.some((row) => row.formulaId === 'KDS-ST-H1-INTERACTION-V1'));
assert.ok(steel.formulaTrace.every((row) => row.standard && row.clause && row.title));

const frame = createTwoStoryElasticFrameModel();
const frameAnalysis = analyzeModel(frame);
assert.equal(frameAnalysis.ok, true);

const connection = buildConnectionDetailedDesignReport(frame, frameAnalysis);
assert.equal(connection.contract.milestone, 'P3-M18');
assert.ok(connection.rows.length > 0);
assert.ok(connection.basePlates.length > 0);
assert.ok(connection.rows[0].contract.tickets.includes('P3-T92'));
assert.ok(connection.rows[0].bolt.contract.tickets.includes('P3-T92'));
assert.ok(connection.basePlates[0].contract.tickets.includes('P3-T92'));
assert.ok(connection.formulaTrace.some((row) => row.formulaId === 'KDS-CONN-BOLT-V1'));
assert.ok(connection.formulaTrace.some((row) => row.formulaId === 'KDS-CONN-BASEPLATE-V1'));

const foundation = buildFoundationDetailedDesignReport(frame, frameAnalysis);
assert.equal(foundation.contract.milestone, 'P3-M18');
assert.ok(foundation.footings.length > 0);
assert.ok(foundation.piles.length > 0);
assert.equal(foundation.rows.length, foundation.summary.itemCount);
assert.ok(foundation.footings[0].contract.tickets.includes('P3-T93'));
assert.ok(foundation.piles[0].contract.tickets.includes('P3-T93'));
assert.ok(foundation.combined.contract.tickets.includes('P3-T93'));
assert.ok(foundation.mat.contract.tickets.includes('P3-T93'));
assert.ok(foundation.formulaTrace.some((row) => row.formulaId === 'KDS-FOUND-SPREAD-V1'));
assert.ok(foundation.formulaTrace.some((row) => row.formulaId === 'KDS-FOUND-MAT-V1'));

const bolt = designBoltGroup({ memberId: 'B1', demands: { shearY: 90, shearZ: 0, axial: 40 } });
const weld = designFilletWeld({ memberId: 'W1', equivalentDemand: 180 });
assert.ok(bolt.requiredCount >= 2);
assert.equal(bolt.contract.milestone, 'P3-M18');
assert.ok(weld.requiredLength >= 100);
assert.equal(weld.contract.milestone, 'P3-M18');

const integrated = buildP3DetailedDesignReport(frame, frameAnalysis);
assert.equal(integrated.version, P3_DETAILED_DESIGN_REPORT_VERSION);
assert.equal(integrated.contract.milestone, 'P3-M18');
assert.equal(integrated.designGate.version, P3_DETAILED_DESIGN_GATE_VERSION);
assert.deepEqual(integrated.designGate.tickets, ['P3-T91', 'P3-T92', 'P3-T93', 'P3-T94', 'P3-T95']);
assert.equal(integrated.designGate.contract.milestone, 'P3-M18');
assert.deepEqual(integrated.designGate.contract.tickets, ['P3-T91', 'P3-T92', 'P3-T93', 'P3-T94', 'P3-T95']);
assert.equal(integrated.designGate.contract.featureTicketMap.steelMember, 'P3-T91');
assert.ok(integrated.designGate.contract.reviewFields.includes('summary.ticketCoverage'));
assert.equal(integrated.designGate.contract.maturity, 'preliminary-integrated-schedule');
assert.equal(integrated.designGate.summary.readyForAgentReview, false);
assert.equal(integrated.designGate.summary.completeCoverage, true);
assert.equal(integrated.designGate.designReview.status, 'review-required');
assert.equal(integrated.designGate.designReview.finalPermitDesign, false);
assert.equal(integrated.designGate.designReview.fabricationReady, false);
assert.equal(integrated.designGate.designReview.geotechnicalCertified, false);
assert.equal(integrated.designGate.designReview.agentDecision, 'resolve-detailed-design-review-items');
assert.deepEqual(integrated.designGate.designReview.missing, ['design-issues']);
assert.ok(integrated.modules.steel.rows.length > 0);
assert.ok(integrated.modules.connection.rows.length > 0);
assert.ok(integrated.modules.foundation.footings.length > 0);
assert.ok(integrated.formulaTrace.length > 0);
assert.equal(integrated.designGate.formulaCount, integrated.formulaTrace.length);
assert.equal(integrated.designGate.issueCount, integrated.issueRows.length);
assert.ok(integrated.designGate.issueCount > 0);
assert.equal(integrated.formulaRegistryVersion, DESIGN_FORMULA_REGISTRY_VERSION);
assert.equal(integrated.designGate.unregisteredFormulaCount, 0);
assert.deepEqual(integrated.designGate.coverage.map((row) => row.ticket), ['P3-T91', 'P3-T92', 'P3-T93', 'P3-T94', 'P3-T95']);
assert.ok(integrated.designGate.coverage.every((row) => row.covered));
assert.deepEqual(integrated.designGate.summary.ticketCoverage.map((row) => row.ticket), ['P3-T91', 'P3-T92', 'P3-T93', 'P3-T94', 'P3-T95']);
assert.ok(integrated.designGate.ticketCoverage.every((row) => row.evidence));
assert.ok(integrated.issueRows.every((row) => Array.isArray(row.formulaIds)));
assert.ok(integrated.issueRows.some((row) => row.formulaIds.length > 0));

const issueGate = buildP3DetailedDesignGate({
  steel: {
    version: 'steel-test',
    rows: [{ memberId: 'S1', status: 'NG', formulaTrace: [{ formulaId: 'KDS-ST-H1-INTERACTION-V1' }] }],
    formulaTrace: [{ formulaId: 'KDS-ST-H1-INTERACTION-V1', standard: 'KDS 14 31' }],
    summary: { itemCount: 1, ngCount: 1 },
  },
  connection: {
    version: 'connection-test',
    rows: [{ memberId: 'C1', status: 'OK', formulaTrace: [{ formulaId: 'KDS-CONN-BOLT-V1' }] }],
    formulaTrace: [{ formulaId: 'KDS-CONN-BOLT-V1', standard: 'KDS 14 31' }],
    summary: { itemCount: 1 },
  },
  foundation: {
    version: 'foundation-test',
    rows: [{ nodeId: 'F1', status: 'OK', formulaTrace: [{ formulaId: 'KDS-FOUND-SPREAD-V1' }] }],
    formulaTrace: [{ formulaId: 'KDS-FOUND-SPREAD-V1', standard: 'KDS 11 50' }],
    summary: { itemCount: 1 },
  },
}, {
  issueRows: [{ moduleId: 'steel', itemId: 'S1', status: 'NG', formulaIds: ['KDS-ST-H1-INTERACTION-V1'] }],
  formulaTrace: [
    { formulaId: 'KDS-ST-H1-INTERACTION-V1', standard: 'KDS 14 31' },
    { formulaId: 'KDS-CONN-BOLT-V1', standard: 'KDS 14 31' },
    { formulaId: 'KDS-FOUND-SPREAD-V1', standard: 'KDS 11 50' },
  ],
});
assert.equal(issueGate.summary.completeCoverage, true);
assert.equal(issueGate.designReview.status, 'review-required');
assert.ok(issueGate.designReview.missing.includes('design-issues'));
assert.equal(issueGate.designReview.issueCount, 1);
assert.equal(issueGate.designReview.agentDecision, 'resolve-detailed-design-review-items');
assert.equal(issueGate.summary.readyForAgentReview, false);

const unlinkedIssueGate = buildP3DetailedDesignGate({
  steel: {
    version: 'steel-test',
    rows: [{ memberId: 'S1', status: 'NG' }],
    formulaTrace: [{ formulaId: 'KDS-ST-H1-INTERACTION-V1', standard: 'KDS 14 31' }],
    summary: { itemCount: 1, ngCount: 1 },
  },
  connection: {
    version: 'connection-test',
    rows: [{ memberId: 'C1', status: 'OK' }],
    formulaTrace: [{ formulaId: 'KDS-CONN-BOLT-V1', standard: 'KDS 14 31' }],
    summary: { itemCount: 1 },
  },
  foundation: {
    version: 'foundation-test',
    rows: [{ nodeId: 'F1', status: 'OK' }],
    formulaTrace: [{ formulaId: 'KDS-FOUND-SPREAD-V1', standard: 'KDS 11 50' }],
    summary: { itemCount: 1 },
  },
}, {
  issueRows: [{ moduleId: 'steel', itemId: 'S1', status: 'NG', formulaIds: [] }],
  formulaTrace: [
    { formulaId: 'KDS-ST-H1-INTERACTION-V1', standard: 'KDS 14 31' },
    { formulaId: 'KDS-CONN-BOLT-V1', standard: 'KDS 14 31' },
    { formulaId: 'KDS-FOUND-SPREAD-V1', standard: 'KDS 11 50' },
  ],
});
assert.equal(unlinkedIssueGate.coverage.find((row) => row.ticket === 'P3-T94').covered, false);
assert.equal(unlinkedIssueGate.designReview.unlinkedIssueCount, 1);
assert.ok(unlinkedIssueGate.designReview.missing.includes('issue-formula-links'));
assert.ok(unlinkedIssueGate.designReview.missing.includes('ticket-coverage'));
assert.equal(unlinkedIssueGate.summary.readyForAgentReview, false);
const cleanIntegratedGate = buildP3DetailedDesignGate({
  steel: {
    version: 'steel-test',
    rows: [{ memberId: 'S1', status: 'OK', formulaTrace: [{ formulaId: 'KDS-ST-H1-INTERACTION-V1' }] }],
    formulaTrace: [{ formulaId: 'KDS-ST-H1-INTERACTION-V1', standard: 'KDS 14 31' }],
    summary: { itemCount: 1 },
  },
  connection: {
    version: 'connection-test',
    rows: [{ memberId: 'C1', status: 'OK', formulaTrace: [{ formulaId: 'KDS-CONN-BOLT-V1' }] }],
    formulaTrace: [{ formulaId: 'KDS-CONN-BOLT-V1', standard: 'KDS 14 31' }],
    summary: { itemCount: 1 },
  },
  foundation: {
    version: 'foundation-test',
    rows: [{ nodeId: 'F1', status: 'OK', formulaTrace: [{ formulaId: 'KDS-FOUND-SPREAD-V1' }] }],
    formulaTrace: [{ formulaId: 'KDS-FOUND-SPREAD-V1', standard: 'KDS 11 50' }],
    summary: { itemCount: 1 },
  },
}, {
  issueRows: [],
  formulaTrace: [
    { formulaId: 'KDS-ST-H1-INTERACTION-V1', standard: 'KDS 14 31' },
    { formulaId: 'KDS-CONN-BOLT-V1', standard: 'KDS 14 31' },
    { formulaId: 'KDS-FOUND-SPREAD-V1', standard: 'KDS 11 50' },
  ],
});
assert.equal(cleanIntegratedGate.designReview.status, 'trace-ready');
assert.equal(cleanIntegratedGate.summary.readyForAgentReview, true);
const mismatchedIssueGate = buildP3DetailedDesignGate({
  steel: {
    version: 'steel-test',
    rows: [{ memberId: 'S1', status: 'NG', interaction: { formulaId: 'KDS-ST-H1-INTERACTION-V1' } }],
    formulaTrace: [{ formulaId: 'KDS-ST-H1-INTERACTION-V1', standard: 'KDS 14 31' }],
    summary: { itemCount: 1, ngCount: 1 },
  },
  connection: {
    version: 'connection-test',
    rows: [{ memberId: 'C1', status: 'OK' }],
    formulaTrace: [{ formulaId: 'KDS-CONN-BOLT-V1', standard: 'KDS 14 31' }],
    summary: { itemCount: 1 },
  },
  foundation: {
    version: 'foundation-test',
    rows: [{ nodeId: 'F1', status: 'OK' }],
    formulaTrace: [{ formulaId: 'KDS-FOUND-SPREAD-V1', standard: 'KDS 11 50' }],
    summary: { itemCount: 1 },
  },
});
assert.equal(mismatchedIssueGate.designReview.unlinkedIssueCount, 0);
const mismatchedExternalIssueGate = buildP3DetailedDesignGate({
  steel: {
    version: 'steel-test',
    rows: [{ memberId: 'S1', status: 'OK', interaction: { formulaId: 'KDS-ST-H1-INTERACTION-V1' } }],
    formulaTrace: [{ formulaId: 'KDS-ST-H1-INTERACTION-V1', standard: 'KDS 14 31' }],
    summary: { itemCount: 1 },
  },
  connection: {
    version: 'connection-test',
    rows: [{ memberId: 'C1', status: 'OK' }],
    formulaTrace: [{ formulaId: 'KDS-CONN-BOLT-V1', standard: 'KDS 14 31' }],
    summary: { itemCount: 1 },
  },
  foundation: {
    version: 'foundation-test',
    rows: [{ nodeId: 'F1', status: 'OK' }],
    formulaTrace: [{ formulaId: 'KDS-FOUND-SPREAD-V1', standard: 'KDS 11 50' }],
    summary: { itemCount: 1 },
  },
}, {
  issueRows: [{ moduleId: 'steel', itemId: 'S9', status: 'NG' }],
  formulaTrace: [
    { formulaId: 'KDS-ST-H1-INTERACTION-V1', standard: 'KDS 14 31' },
    { formulaId: 'KDS-CONN-BOLT-V1', standard: 'KDS 14 31' },
    { formulaId: 'KDS-FOUND-SPREAD-V1', standard: 'KDS 11 50' },
  ],
});
assert.equal(mismatchedExternalIssueGate.designReview.unlinkedIssueCount, 1);
assert.ok(mismatchedExternalIssueGate.designReview.missing.includes('issue-formula-links'));

const target = { model: () => frame, reanalyze: () => {} };
const agent = createIndexAgentApi(target, { getLastResult: () => frameAnalysis });
const agentReport = agent.getP3DetailedDesignReport();
assert.equal(agentReport.version, P3_DETAILED_DESIGN_REPORT_VERSION);
assert.ok(agentReport.modules.connection.rows.length > 0);

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3DetailedDesignIntegration, P3_DETAILED_DESIGN_REPORT_VERSION);
assert.equal(manifest.modules.phase3DetailedDesignGate, P3_DETAILED_DESIGN_GATE_VERSION);
assert.equal(manifest.modules.phase3DesignFormulaRegistry, DESIGN_FORMULA_REGISTRY_VERSION);
assert.ok(manifest.readApis.includes('getP3DetailedDesignReport'));
assert.ok(manifest.dataContracts.includes('phase3DetailedDesignIntegration'));
assert.ok(manifest.dataContracts.includes('phase3DetailedDesignGate'));
assert.ok(manifest.dataContracts.includes('phase3DesignFormulaRegistry'));
assert.ok(manifest.dataContracts.includes('phase3DesignFormulaTrace'));
assert.ok(manifest.milestones.some((item) => item.id === 'P3-M18'));

console.log(JSON.stringify({
  ok: true,
  version: P3_DETAILED_DESIGN_REPORT_VERSION,
  steelRows: steel.rows.length,
  connectionRows: connection.rows.length,
  foundationRows: foundation.summary.itemCount,
  formulaRows: integrated.formulaTrace.length,
}, null, 2));
