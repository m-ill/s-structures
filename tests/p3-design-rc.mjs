import assert from 'node:assert/strict';
import {
  analyzeModel,
  buildAgentManifest,
  buildP3DetailedDesignReport,
  buildRcDesignGate,
  buildRcDetailedDesignReport,
  buildRcPmCurve,
  createReleasedSimpleBeamUdl,
  createVerticalAxialColumn,
  detailRcBeam,
  detailRcSlab,
  detailRcWall,
  developmentLength,
  lapSpliceLength,
  DESIGN_FORMULA_REGISTRY_VERSION,
  RC_DESIGN_GATE_VERSION,
  RC_DETAILED_DESIGN_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const beam = createReleasedSimpleBeamUdl({ L: 6, w: 12 }).model;
beam.members[0].matId = 'concrete';
beam.members[0].secId = 'rc3060';
beam.designParams.rc.defaultBeamRebarRatio = 0.012;
beam.slabs = [{ id: 'S1', lx: 4, ly: 5.5, thickness: 0.16, factoredLoad: 9, columnReaction: 150 }];
const beamAnalysis = analyzeModel(beam);
assert.equal(beamAnalysis.ok, true);

const beamReport = buildRcDetailedDesignReport(beam, beamAnalysis, {
  walls: [{ id: 'W1', section: { width: 4, thickness: 0.22 }, material: { fc: 27, fy: 400 }, N: 400, V: 900 }],
});
assert.equal(beamReport.version, RC_DETAILED_DESIGN_VERSION);
assert.equal(beamReport.analysisStatus.ok, true);
assert.equal(beamReport.contract.milestone, 'P3-M17');
assert.equal(beamReport.rcDesignGate.version, RC_DESIGN_GATE_VERSION);
assert.deepEqual(beamReport.rcDesignGate.tickets, ['P3-T87', 'P3-T88', 'P3-T89', 'P3-T90']);
assert.equal(beamReport.rcDesignGate.contract.milestone, 'P3-M17');
assert.deepEqual(beamReport.rcDesignGate.contract.tickets, ['P3-T87', 'P3-T88', 'P3-T89', 'P3-T90']);
assert.equal(beamReport.rcDesignGate.contract.featureTicketMap.beamDetail, 'P3-T87');
assert.ok(beamReport.rcDesignGate.contract.reviewFields.includes('summary.ticketCoverage'));
assert.equal(beamReport.rcDesignGate.contract.maturity, 'preliminary-detail-schedule');
assert.equal(beamReport.rcDesignGate.summary.readyForAgentReview, false);
assert.equal(beamReport.rcDesignGate.rcReview.status, 'review-required');
assert.equal(beamReport.rcDesignGate.rcReview.finalPermitDesign, false);
assert.equal(beamReport.rcDesignGate.rcReview.analysisOk, true);
assert.equal(beamReport.rcDesignGate.rcReview.completeRoleCoverage, false);
assert.ok(beamReport.rcDesignGate.rcReview.missing.includes('role-coverage'));
assert.equal(beamReport.rcDesignGate.rcReview.agentDecision, 'resolve-rc-review-items');
assert.deepEqual(beamReport.rcDesignGate.summary.ticketCoverage.map((row) => row.ticket), ['P3-T87', 'P3-T88', 'P3-T89', 'P3-T90']);
assert.equal(beamReport.rcDesignGate.summary.ticketCoverage.find((row) => row.ticket === 'P3-T88').covered, false);
assert.equal(beamReport.schedules.beams.length, 1);
assert.equal(beamReport.schedules.slabs.length, 1);
assert.equal(beamReport.schedules.walls.length, 1);
assert.equal(beamReport.rows.length, 3);
assert.ok(beamReport.issueRows.some((row) => row.moduleId === 'rc' && row.itemId === 'W1'));
assert.ok(beamReport.issueRows.every((row) => row.formulaIds.length > 0));
assert.deepEqual(beamReport.rcDesignGate.missingRoles, ['column']);
assert.equal(beamReport.rcDesignGate.completeRoleCoverage, false);
assert.equal(beamReport.rcDesignGate.summary.completeRoleCoverage, false);
assert.equal(beamReport.rcDesignGate.coverage.find((row) => row.role === 'wall').ticket, 'P3-T89');
assert.equal(beamReport.rcDesignGate.ticketCoverage.find((row) => row.ticket === 'P3-T89').covered, true);
assert.ok(beamReport.formulaTrace.some((item) => item.formulaId === 'KDS-RC-BEAM-FLEXURE-V1'));
assert.ok(beamReport.formulaTrace.every((item) => item.standard && item.clause && item.title));
assert.ok(beamReport.schedules.beams[0].contract.tickets.includes('P3-T87'));
assert.equal(beamReport.schedules.beams[0].summary.serviceabilityStatus, 'OK');
assert.ok(beamReport.schedules.walls[0].contract.tickets.includes('P3-T89'));
assert.ok(beamReport.schedules.slabs[0].contract.tickets.includes('P3-T90'));
assert.match(beamReport.schedules.beams[0].flexure.bottom.label, /^\d+-D/);
assert.equal(beamReport.summary.itemCount, 3);

const failedAnalysisRcReport = buildRcDetailedDesignReport(beam, {
  ...beamAnalysis,
  ok: false,
  reason: 'SOLVER_FAILED',
}, {
  walls: [{ id: 'W1', section: { width: 4, thickness: 0.22 }, material: { fc: 27, fy: 400 }, N: 400, V: 80 }],
});
assert.equal(failedAnalysisRcReport.analysisStatus.ok, false);
assert.equal(failedAnalysisRcReport.rcDesignGate.rcReview.analysisOk, false);
assert.ok(failedAnalysisRcReport.rcDesignGate.rcReview.missing.includes('analysis-status'));
assert.equal(failedAnalysisRcReport.rcDesignGate.summary.readyForAgentReview, false);

const biaxialBeamDetail = detailRcBeam({
  memberId: 'B-BIAX',
  role: 'beam',
  status: 'OK',
  requiredRebar: { AsY: 1800, AsZ: 400 },
  section: { b: 0.3 },
  material: { fc: 27, fy: 400 },
});
assert.equal(biaxialBeamDetail.flexure.requiredAs, 1800);
assert.ok(biaxialBeamDetail.flexure.top.providedArea >= 1800);
assert.ok(biaxialBeamDetail.flexure.bottom.providedArea >= 1800);

const completeIssueGate = buildRcDesignGate({
  schedules: {
    beams: [{ role: 'beam', status: 'OK', flexure: { formulaId: 'KDS-RC-BEAM-FLEXURE-V1' } }],
    columns: [{ role: 'column', status: 'OK', pm: { formulaId: 'KDS-RC-COLUMN-PM-V1' } }],
    walls: [{ role: 'wall', status: 'NG', shear: { formulaId: 'KDS-RC-WALL-SHEAR-V1' } }],
    slabs: [{ role: 'slab', status: 'OK', punching: { formulaId: 'KDS-RC-SLAB-PUNCHING-V1' } }],
  },
});
assert.equal(completeIssueGate.completeRoleCoverage, true);
assert.equal(completeIssueGate.rcReview.status, 'review-required');
assert.ok(completeIssueGate.rcReview.missing.includes('design-issues'));
assert.equal(completeIssueGate.rcReview.issueCount, 1);
assert.equal(completeIssueGate.rcReview.agentDecision, 'resolve-rc-review-items');
assert.equal(completeIssueGate.summary.readyForAgentReview, false);
const issueWithoutFormulaGate = buildRcDesignGate({
  schedules: {
    beams: [{ role: 'beam', status: 'OK', flexure: { formulaId: 'KDS-RC-BEAM-FLEXURE-V1' } }],
    columns: [{ role: 'column', status: 'OK', pm: { formulaId: 'KDS-RC-COLUMN-PM-V1' } }],
    walls: [{ role: 'wall', status: 'NG' }],
    slabs: [{ role: 'slab', status: 'OK', punching: { formulaId: 'KDS-RC-SLAB-PUNCHING-V1' } }],
  },
});
assert.equal(issueWithoutFormulaGate.completeRoleCoverage, true);
assert.equal(issueWithoutFormulaGate.rcReview.issueFormulaMissingCount, 1);
assert.ok(issueWithoutFormulaGate.rcReview.missing.includes('issue-formula-links'));
assert.equal(issueWithoutFormulaGate.summary.readyForAgentReview, false);

const cleanCompleteGate = buildRcDesignGate({
  schedules: {
    beams: [{ role: 'beam', status: 'OK', flexure: { formulaId: 'KDS-RC-BEAM-FLEXURE-V1' } }],
    columns: [{ role: 'column', status: 'OK', pm: { formulaId: 'KDS-RC-COLUMN-PM-V1' } }],
    walls: [{ role: 'wall', status: 'OK', shear: { formulaId: 'KDS-RC-WALL-SHEAR-V1' } }],
    slabs: [{ role: 'slab', status: 'OK', punching: { formulaId: 'KDS-RC-SLAB-PUNCHING-V1' } }],
  },
});
assert.equal(cleanCompleteGate.rcReview.status, 'trace-ready');
assert.equal(cleanCompleteGate.summary.readyForAgentReview, true);

const unknownRoleReport = buildRcDetailedDesignReport({}, {
  design: {
    concrete: {
      memberResults: {
        U1: {
          memberId: 'U1',
          status: 'OK',
          utilization: 0,
          requiredRebar: {},
          section: {},
          material: {},
        },
      },
    },
  },
});
assert.equal(unknownRoleReport.schedules.beams.length, 0);
assert.equal(unknownRoleReport.rows.length, 0);
assert.ok(unknownRoleReport.rcDesignGate.missingRoles.includes('beam'));
assert.equal(unknownRoleReport.rcDesignGate.summary.ticketCoverage.find((row) => row.ticket === 'P3-T87').covered, false);
assert.ok(unknownRoleReport.rcDesignGate.rcReview.missing.includes('formula-trace'));

const integrated = buildP3DetailedDesignReport(beam, beamAnalysis, {
  rc: { slabs: beam.slabs, walls: [{ id: 'W1', section: { width: 4, thickness: 0.22 }, material: { fc: 27, fy: 400 }, N: 400, V: 900 }] },
});
assert.ok(integrated.issueRows.some((row) => row.moduleId === 'rc' && row.itemId === 'W1'));

const column = createVerticalAxialColumn({ L: 3, P: 1800 }).model;
column.members[0].matId = 'concrete';
column.members[0].secId = 'rc3060';
column.designParams.rc.defaultColumnRebarRatio = 0.018;
const columnAnalysis = analyzeModel(column);
const columnReport = buildRcDetailedDesignReport(column, columnAnalysis);
assert.equal(columnReport.schedules.columns.length, 1);
assert.ok(columnReport.schedules.columns[0].contract.tickets.includes('P3-T88'));
assert.ok(columnReport.rcDesignGate.missingRoles.includes('beam'));
assert.equal(columnReport.rcDesignGate.rcReview.status, 'review-required');
assert.ok(columnReport.schedules.columns[0].pm.curve.points.length >= 4);
assert.equal(columnReport.schedules.columns[0].summary.pmPointCount, columnReport.schedules.columns[0].pm.curve.points.length);
assert.ok(columnReport.schedules.columns[0].ties.spacing <= 150);

const pm = buildRcPmCurve({ b: 0.3, h: 0.6, Ag: 0.18, AsTotal: 2400 }, { fc: 27, fy: 400 });
assert.equal(pm.points[0].label, 'P0');
assert.ok(pm.points[0].axial > pm.points.at(-1).axial);

const wall = detailRcWall({ id: 'W2', section: { width: 5, thickness: 0.25 }, material: { fc: 30 }, V: 80 });
assert.equal(wall.role, 'wall');
assert.ok(wall.reinforcement.vertical.label);
assert.equal(wall.inputReview.status, 'available');
const invalidWall = detailRcWall({ id: 'W-BAD', section: { width: -5, thickness: 0 }, material: { fc: 0 }, V: 80 });
assert.equal(invalidWall.status, 'NG');
assert.equal(invalidWall.inputReview.status, 'review-required');
assert.ok(invalidWall.inputReview.missing.includes('wall-width'));
assert.ok(invalidWall.inputReview.missing.includes('wall-thickness'));
assert.equal(invalidWall.inputReview.formulaId, 'KDS-RC-INPUT-GEOMETRY-V1');

const slab = detailRcSlab({ id: 'S2', lx: 3.8, ly: 8, factoredLoad: 8, columnReaction: 90 });
assert.equal(slab.mode, 'one-way');
assert.ok(slab.flexure.main.label);
assert.equal(slab.inputReview.status, 'available');
const invalidSlab = detailRcSlab({ id: 'S-BAD', lx: 0, ly: -8, thickness: 0, factoredLoad: 0 });
assert.equal(invalidSlab.status, 'NG');
assert.equal(invalidSlab.inputReview.status, 'review-required');
assert.ok(invalidSlab.inputReview.missing.includes('slab-short-span'));
assert.ok(invalidSlab.inputReview.missing.includes('slab-long-span'));
assert.equal(invalidSlab.inputReview.formulaId, 'KDS-RC-INPUT-GEOMETRY-V1');

assert.ok(developmentLength('D19', { fc: 27, fy: 400 }).length >= 300);
assert.ok(lapSpliceLength('D19', { fc: 27, fy: 400 }).length > developmentLength('D19', { fc: 27, fy: 400 }).length);

const target = { model: () => beam, reanalyze: () => {} };
const agent = createIndexAgentApi(target, { getLastResult: () => beamAnalysis });
const agentReport = agent.getRcDetailedDesignReport({ slabs: beam.slabs });
assert.equal(agentReport.version, RC_DETAILED_DESIGN_VERSION);
assert.equal(agentReport.schedules.beams.length, 1);

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3RcDetailedDesign, RC_DETAILED_DESIGN_VERSION);
assert.equal(manifest.modules.phase3RcDesignGate, RC_DESIGN_GATE_VERSION);
assert.equal(manifest.modules.phase3DesignFormulaRegistry, DESIGN_FORMULA_REGISTRY_VERSION);
assert.ok(manifest.readApis.includes('getRcDetailedDesignReport'));
assert.ok(manifest.dataContracts.includes('phase3RcDetailedDesignReport'));
assert.ok(manifest.dataContracts.includes('phase3RcDesignGate'));
assert.ok(manifest.dataContracts.includes('phase3DesignFormulaTrace'));
assert.ok(manifest.milestones.some((item) => item.id === 'P3-M17'));

console.log(JSON.stringify({
  ok: true,
  version: RC_DETAILED_DESIGN_VERSION,
  beamItems: beamReport.schedules.beams.length,
  columnItems: columnReport.schedules.columns.length,
  formulaRows: beamReport.formulaTrace.length,
}, null, 2));
