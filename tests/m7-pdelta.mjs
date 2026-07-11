import assert from 'node:assert/strict';
import {
  analyzeModel,
  analyzePDelta,
  createModel,
  makePDeltaLoads,
} from '../src/index.js';
import { createM3State, pDeltaSeries, setPDeltaEnabled } from '../src/ui/m3State.js';

const model = createPDeltaColumnModel();
const linearOnly = analyzeModel(model);
assert.equal(linearOnly.pDelta, undefined, 'P-Delta should be opt-in');

model.analysisSettings.includeGeometricStiffness = true;
model.analysisSettings.pDeltaMaxIterations = 20;
model.analysisSettings.pDeltaTolerance = 1e-6;
const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));
assert.ok(analysis.pDelta, 'analysis should include P-Delta block when enabled');

const linear = analysis.byCombo.CO1;
const pdelta = analysis.pDelta.byCombo.CO1;
assert.equal(pdelta.converged, true, 'P-Delta should converge for benchmark column');
assert.ok(pdelta.iterations.length > 2, 'P-Delta should report iteration history');
assert.ok(pdelta.iterations[1].memberRows.find((row) => row.memberId === 'M1'), 'P-Delta should report selected member iteration rows');
assert.ok(pdelta.iterations[1].memberRows[0].force > 0, 'P-Delta member row should include secondary force');
assert.ok(pdelta.result.summary.maxDisplacement > linear.summary.maxDisplacement, 'P-Delta should amplify displacement');
assert.ok(pdelta.amplification > 1.2, 'P-Delta amplification should be materially above 1');
assert.equal(pdelta.curve.version, 'pdelta-load-step-curves-v1');
assert.equal(pdelta.curve.global.title, 'Global P-Delta Response Curve');
assert.ok(pdelta.curve.global.points.length > 2, 'global P-Delta response should be recorded by load step');
assert.equal(pdelta.curve.global.points.at(-1).loadFactor, 1);
assert.ok(pdelta.curve.global.points.at(-1).secondOrder.roofDisplacement > pdelta.curve.global.points.at(-1).firstOrder.roofDisplacement);
assert.ok(pdelta.curve.stories[0].points.at(-1).stabilityIndex > 0, 'story stability index should be recorded');
assert.ok(pdelta.curve.members.find((item) => item.memberId === 'M1').points.at(-1).pDeltaShear > 0, 'member contribution curve should include N-delta/L');
assert.equal(analysis.pDelta.envelope.summary.maxDisplacement, pdelta.result.summary.maxDisplacement);
assert.equal(analysis.pDelta.summary.governing.comboId, 'CO1');
assert.ok(analysis.pDelta.summary.maxStoryStabilityIndex > 0);
assert.equal(analysis.pDelta.design.version, 'pdelta-design-summary-v1');
assert.equal(analysis.pDelta.design.summary.governing.comboId, 'CO1');
assert.equal(analysis.pDelta.design.summary.governing.direction, 'X');
assert.ok(analysis.pDelta.design.summary.maxTheta > 0, 'design summary should expose final story theta');
assert.ok(analysis.pDelta.design.summary.maxBDelta > 1, 'design summary should expose B-delta amplification');
assert.ok(analysis.pDelta.design.storyRows[0].pDeltaMoment > 0, 'story design rows should expose P-Delta moment');
assert.ok(analysis.pDelta.design.memberForceRows[0].secondOrder.Mz > analysis.pDelta.design.memberForceRows[0].firstOrder.Mz, 'member force design rows should compare first and second order forces');
assert.equal(analysis.design.analysisSource, 'blocked-legacy-pdelta-comparison-only', 'legacy P-Delta must remain comparison-only');
assert.equal(analysis.design.pDeltaTransfer.eligible, false, 'legacy P-Delta must not transfer to design');
assert.equal(analysis.design.pDeltaTransfer.reason, 'LEGACY_PDELTA_DESIGN_BLOCKED');

const pLoads = makePDeltaLoads(model, linear, { iteration: 1 });
assert.equal(pLoads.loads.length, 1, 'benchmark column should produce one secondary sway load');
assert.equal(pLoads.memberRows.length, 1, 'benchmark column should produce one member row');
assert.equal(pLoads.memberRows[0].memberId, 'M1');
assert.equal(pLoads.memberRows[0].topNodeId, 'N2');
assert.ok(pLoads.total > 0, 'secondary load should be positive');

const direct = analyzePDelta(model, { D: 1, L: 1 }, model.analysisSettings);
assert.equal(direct.converged, true);
assert.ok(Math.abs(direct.amplification - pdelta.amplification) < 1e-9);

const state = createM3State(createPDeltaColumnModel());
setPDeltaEnabled(state, true);
const series = pDeltaSeries(state);
assert.equal(series.length, 1, 'UI chart should expose one combo series');
assert.equal(series[0].kind, 'global-pdelta-response');
assert.equal(series[0].points.at(-1).loadFactor, 1, 'chart series should use load factor, not iteration number');
assert.ok(series[0].points.at(-1).amplification > 1.2, 'global curve should include amplified result');
assert.equal(state.activeResultId, 'PDELTA_ENVELOPE');

console.log(JSON.stringify({
  ok: true,
  linearDisplacement: linear.summary.maxDisplacement,
  pDeltaDisplacement: pdelta.result.summary.maxDisplacement,
  amplification: pdelta.amplification,
  iterations: pdelta.iterations.length,
}, null, 2));

function createPDeltaColumnModel() {
  const model = createModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4, support: null },
  ];
  model.members = [{
    id: 'M1',
    type: 'frame',
    n1: 'N1',
    n2: 'N2',
    matId: 'steel',
    secId: 'h300',
    localAxis: { roll: 0, strongAxis: 'z' },
    releases: { i: 'rigid', j: 'rigid' },
  }];
  model.loadCases = [
    { id: 'D', name: 'Dead', type: 'dead' },
    { id: 'L', name: 'Lateral', type: 'wind' },
  ];
  model.loadCombinations = [
    { id: 'CO1', name: 'D + L', type: 'strength', factors: { D: 1, L: 1 } },
  ];
  model.loads = [
    { id: 'P1', type: 'nodal', node: 'N2', P: 800, dir: '-z', case: 'D' },
    { id: 'H1', type: 'nodal', node: 'N2', P: 20, dir: '+x', case: 'L' },
  ];
  return model;
}
