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
assert.ok(pdelta.result.summary.maxDisplacement > linear.summary.maxDisplacement, 'P-Delta should amplify displacement');
assert.ok(pdelta.amplification > 1.2, 'P-Delta amplification should be materially above 1');
assert.equal(analysis.pDelta.envelope.summary.maxDisplacement, pdelta.result.summary.maxDisplacement);
assert.equal(analysis.pDelta.summary.governing.comboId, 'CO1');
assert.ok(analysis.design.summary.maxUtilization >= analysis.pDelta.envelope.summary.maxUtilization, 'design should use P-Delta envelope when enabled');

const pLoads = makePDeltaLoads(model, linear, { iteration: 1 });
assert.equal(pLoads.loads.length, 1, 'benchmark column should produce one secondary sway load');
assert.ok(pLoads.total > 0, 'secondary load should be positive');

const direct = analyzePDelta(model, { D: 1, L: 1 }, model.analysisSettings);
assert.equal(direct.converged, true);
assert.ok(Math.abs(direct.amplification - pdelta.amplification) < 1e-9);

const state = createM3State(createPDeltaColumnModel());
setPDeltaEnabled(state, true);
const series = pDeltaSeries(state);
assert.equal(series.length, 1, 'UI chart should expose one combo series');
assert.ok(series[0].points.at(-1).amplification > 1.2, 'chart series should include amplified result');
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
