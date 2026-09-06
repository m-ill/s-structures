import assert from 'node:assert/strict';
import {
  analyzeModel,
  buildRcDetailingReport,
  createDetailedHtmlReport,
  createReleasedSimpleBeamUdl,
  createVerticalAxialColumn,
  RC_DETAILING_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const beam = createReleasedSimpleBeamUdl({ L: 6, w: 10 }).model;
beam.members[0].matId = 'concrete';
beam.members[0].secId = 'rc3060';
beam.designParams.rc.defaultBeamRebarRatio = 0.01;
const beamAnalysis = analyzeModel(beam);
assert.equal(beamAnalysis.ok, true, JSON.stringify(beamAnalysis.validation.errors, null, 2));

const beamDetail = buildRcDetailingReport(beam, beamAnalysis);
assert.equal(beamDetail.version, RC_DETAILING_VERSION);
assert.equal(beamDetail.summary.memberCount, 1);
assert.equal(beamDetail.rows[0].memberId, 'M1');
assert.equal(beamDetail.rows[0].role, 'beam');
assert.match(beamDetail.rows[0].longitudinal.strongAxis.label, /^\d+-D/);
assert.match(beamDetail.rows[0].transverse.zDirection.label, /^2-D10@/);

const beamReport = createDetailedHtmlReport(beam, beamAnalysis);
assert.equal(beamReport.data.rcDetailing.version, RC_DETAILING_VERSION);
assert.match(beamReport.html, /RC Reinforcement Schedule/);
assert.match(beamReport.html, /Longitudinal strong/);

const column = createVerticalAxialColumn({ L: 3, P: 4000 }).model;
column.members[0].matId = 'concrete';
column.members[0].secId = 'rc3060';
column.designParams.rc.defaultColumnRebarRatio = 0.015;
const columnAnalysis = analyzeModel(column);
const columnDetail = buildRcDetailingReport(column, columnAnalysis);
assert.equal(columnDetail.rows[0].role, 'column');
assert.ok(columnDetail.rows[0].longitudinal.total.count >= 4);

const target = {
  model: () => beam,
  reanalyze: () => {},
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => beamAnalysis,
});
const agentDetail = agent.getRcDetailingReport();
assert.equal(agentDetail.version, RC_DETAILING_VERSION);
assert.equal(agentDetail.rows.length, 1);

console.log(JSON.stringify({
  ok: true,
  version: RC_DETAILING_VERSION,
  beamBars: beamDetail.rows[0].longitudinal.strongAxis.label,
  beamStirrups: beamDetail.rows[0].transverse.zDirection.label,
  columnBars: columnDetail.rows[0].longitudinal.total.label,
}, null, 2));
