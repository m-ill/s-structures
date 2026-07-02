import assert from 'node:assert/strict';
import {
  analyzeModel,
  buildAgentManifest,
  buildRcDetailedDesignReport,
  buildRcPmCurve,
  createReleasedSimpleBeamUdl,
  createVerticalAxialColumn,
  detailRcSlab,
  detailRcWall,
  developmentLength,
  lapSpliceLength,
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
  walls: [{ id: 'W1', section: { width: 4, thickness: 0.22 }, material: { fc: 27, fy: 400 }, N: 400, V: 120 }],
});
assert.equal(beamReport.version, RC_DETAILED_DESIGN_VERSION);
assert.equal(beamReport.schedules.beams.length, 1);
assert.equal(beamReport.schedules.slabs.length, 1);
assert.equal(beamReport.schedules.walls.length, 1);
assert.ok(beamReport.formulaTrace.some((item) => item.formulaId === 'KDS-RC-BEAM-FLEXURE-V1'));
assert.match(beamReport.schedules.beams[0].flexure.bottom.label, /^\d+-D/);
assert.equal(beamReport.summary.itemCount, 3);

const column = createVerticalAxialColumn({ L: 3, P: 1800 }).model;
column.members[0].matId = 'concrete';
column.members[0].secId = 'rc3060';
column.designParams.rc.defaultColumnRebarRatio = 0.018;
const columnAnalysis = analyzeModel(column);
const columnReport = buildRcDetailedDesignReport(column, columnAnalysis);
assert.equal(columnReport.schedules.columns.length, 1);
assert.ok(columnReport.schedules.columns[0].pm.curve.points.length >= 4);
assert.ok(columnReport.schedules.columns[0].ties.spacing <= 150);

const pm = buildRcPmCurve({ b: 0.3, h: 0.6, Ag: 0.18, AsTotal: 2400 }, { fc: 27, fy: 400 });
assert.equal(pm.points[0].label, 'P0');
assert.ok(pm.points[0].axial > pm.points.at(-1).axial);

const wall = detailRcWall({ id: 'W2', section: { width: 5, thickness: 0.25 }, material: { fc: 30 }, V: 80 });
assert.equal(wall.role, 'wall');
assert.ok(wall.reinforcement.vertical.label);

const slab = detailRcSlab({ id: 'S2', lx: 3.8, ly: 8, factoredLoad: 8, columnReaction: 90 });
assert.equal(slab.mode, 'one-way');
assert.ok(slab.flexure.main.label);

assert.ok(developmentLength('D19', { fc: 27, fy: 400 }).length >= 300);
assert.ok(lapSpliceLength('D19', { fc: 27, fy: 400 }).length > developmentLength('D19', { fc: 27, fy: 400 }).length);

const target = { model: () => beam, reanalyze: () => {} };
const agent = createIndexAgentApi(target, { getLastResult: () => beamAnalysis });
const agentReport = agent.getRcDetailedDesignReport({ slabs: beam.slabs });
assert.equal(agentReport.version, RC_DETAILED_DESIGN_VERSION);
assert.equal(agentReport.schedules.beams.length, 1);

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3RcDetailedDesign, RC_DETAILED_DESIGN_VERSION);
assert.ok(manifest.readApis.includes('getRcDetailedDesignReport'));
assert.ok(manifest.dataContracts.includes('phase3RcDetailedDesignReport'));
assert.ok(manifest.milestones.some((item) => item.id === 'P3-M17'));

console.log(JSON.stringify({
  ok: true,
  version: RC_DETAILED_DESIGN_VERSION,
  beamItems: beamReport.schedules.beams.length,
  columnItems: columnReport.schedules.columns.length,
  formulaRows: beamReport.formulaTrace.length,
}, null, 2));
