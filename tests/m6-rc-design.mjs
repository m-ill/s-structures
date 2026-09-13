import assert from 'node:assert/strict';
import {
  analyzeModel,
  concreteSectionProps,
  createReleasedSimpleBeamUdl,
  createVerticalAxialColumn,
  runConcreteDesign,
} from '../src/index.js';
import { materialOf, sectionOf } from '../src/core/catalogs.js';
import { createM3State } from '../src/ui/m3State.js';

const EPS = 1e-6;

const beam = createReleasedSimpleBeamUdl({ L: 6, w: 10 }).model;
beam.members[0].matId = 'concrete';
beam.members[0].secId = 'rc3060';
beam.designParams.rc.defaultBeamRebarRatio = 0.01;
const beamAnalysis = analyzeModel(beam);
assert.equal(beamAnalysis.ok, true, JSON.stringify(beamAnalysis.validation.errors, null, 2));
assert.ok(beamAnalysis.design?.concrete, 'analysis should include RC design results');

const concrete = beamAnalysis.design.concrete;
const beamCheck = concrete.memberResults.M1;
assert.equal(beamCheck.role, 'beam');
assert.equal(beamCheck.status, 'OK');
assert.equal(concrete.summary.checkedMembers, 1);

const section = sectionOf(beam, 'rc3060');
const material = materialOf(beam, 'concrete');
const props = concreteSectionProps(section, {}, beam.designParams.rc);
const fc = material.Fy / 1000;
const expectedAsZ = (45 * 1e6) / (0.85 * 400 * 0.9 * props.dz * 1000);
const expectedVc = 0.75 * 0.17 * Math.sqrt(fc) * props.bz * 1000 * props.dz * 1000 / 1000;
close(beamCheck.requiredRebar.AsZ, expectedAsZ, EPS, 'required strong-axis rebar');
close(beamCheck.checks.find((item) => item.id === 'rc-shear-y').capacity, expectedVc, EPS, 'Vy uses the same bending plane as Mz');

const direct = runConcreteDesign(beam, beamAnalysis);
close(direct.summary.maxUtilization, concrete.summary.maxUtilization, EPS, 'direct RC facade should match analysis design');

const column = createVerticalAxialColumn({ L: 3, P: 4000 }).model;
column.members[0].matId = 'concrete';
column.members[0].secId = 'rc3060';
column.designParams.rc.defaultColumnRebarRatio = 0.015;
const columnAnalysis = analyzeModel(column);
assert.equal(columnAnalysis.ok, true, JSON.stringify(columnAnalysis.validation.errors, null, 2));
const columnCheck = columnAnalysis.design.concrete.memberResults.M1;
assert.equal(columnCheck.role, 'column');
assert.equal(columnCheck.status, 'NG');
assert.equal(columnCheck.governingCheck, 'rc-axial');
// Since Phase24/25 the overall summary is based on the provided practical RC
// checks and treats the legacy concrete module as diagnostic only, so the NG is
// reported by that module while the summary refuses to call the design done.
assert.equal(columnAnalysis.design.concrete.summary.ngCount, 1, 'legacy RC diagnostics should report the NG member');
assert.equal(columnAnalysis.design.summary.legacyConcreteDiagnosticOnly, true);
assert.equal(columnAnalysis.design.summary.designComplete, false, 'overall design summary must not report a complete design');
assert.ok(columnAnalysis.design.summary.rcUnreviewedMembers >= 1, 'the RC member must stay visible as unreviewed in the overall summary');

const state = createM3State(beam);
assert.ok(state.analysis.design.concrete.memberResults.M1, 'UI state should carry RC design results');

console.log(JSON.stringify({
  ok: true,
  beamRequiredAsZ: Number(beamCheck.requiredRebar.AsZ.toFixed(2)),
  beamGoverning: beamCheck.governingCheck,
  columnStatus: columnCheck.status,
}, null, 2));

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`,
  );
}
