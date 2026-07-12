import assert from 'node:assert/strict';
import {
  ANALYSIS_RUNNER_VERSION,
  createAnalysisCase,
  createModel,
  runAnalysisCase,
  runAnalysisCases,
} from '../src/index.js';

const model = createColumnModel();

const staticResult = runAnalysisCase(model, createAnalysisCase({ id: 'AC_STATIC', kind: 'static' }));
assert.equal(staticResult.version, ANALYSIS_RUNNER_VERSION);
assert.equal(staticResult.status, 'ok', JSON.stringify(staticResult.error || staticResult.summary));
assert.equal(staticResult.summary.comboCount, 1);
assert.equal(staticResult.view, 'static-results');

const modalResult = runAnalysisCase(model, createAnalysisCase({
  id: 'AC_MODAL',
  kind: 'modal',
  settings: { modeCount: 2 },
}));
assert.equal(modalResult.status, 'ok', JSON.stringify(modalResult.summary));
assert.equal(modalResult.summary.modeCount, 2);
assert.ok(modalResult.payload.modes[0].period > 0);

const rsaResult = runAnalysisCase(model, createAnalysisCase({
  id: 'AC_RSA',
  kind: 'responseSpectrum',
  settings: {
    modalModeCount: 3,
    spectrum: {
      method: 'CQC',
      directions: ['x', 'y'],
      dampingRatio: 0.05,
      points: [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }],
    },
  },
}));
assert.equal(rsaResult.kind, 'responseSpectrum');
assert.equal(rsaResult.summary.method, 'CQC');
assert.ok(rsaResult.summary.directions.includes('y'));
assert.ok(rsaResult.payload.combined.y.srssDisplacement > 0);

const unavailableRsa = runAnalysisCase(createModel(), createAnalysisCase({
  id: 'AC_RSA_UNAVAILABLE',
  kind: 'responseSpectrum',
  settings: {
    spectrum: { method: 'CQC', directions: ['x'], points: [{ period: 0, sa: 0.4 }] },
  },
}));
assert.equal(unavailableRsa.status, 'failed');
assert.equal(unavailableRsa.qualification, 'failed');
assert.equal(unavailableRsa.summary.ok, false);
assert.deepEqual(unavailableRsa.summary.directions, []);
assert.equal(unavailableRsa.payload.status, 'not-available');

const bucklingResult = runAnalysisCase(model, createAnalysisCase({
  id: 'AC_BUCKLING',
  kind: 'buckling',
  settings: { referenceAxialForces: { M1: 100 } },
}));
assert.equal(bucklingResult.kind, 'buckling');
assert.equal(bucklingResult.summary.status, 'available');
assert.ok(bucklingResult.summary.criticalLoadFactor > 0);

const thaResult = runAnalysisCase(model, createAnalysisCase({
  id: 'AC_THA',
  kind: 'linearTha',
  settings: {
    modalModeCount: 2,
    direction: 'y',
    dt: 0.02,
    accelerations: [0, 0.1, -0.1, 0],
  },
}));
assert.equal(thaResult.kind, 'linearTha');
assert.equal(thaResult.payload.rows.length, 4);
assert.equal(thaResult.summary.modeCount, 2);

const pushoverResult = runAnalysisCase(model, createAnalysisCase({
  id: 'AC_PUSH',
  kind: 'pushover',
  settings: {
    controlNodeId: 'N2',
    direction: '+x',
    referenceBaseShear: 20,
    maxLoadFactor: 2,
    steps: 2,
    plasticMomentScale: 0.2,
  },
}));
assert.equal(pushoverResult.kind, 'pushover');
assert.equal(pushoverResult.status, 'preliminary');
assert.equal(pushoverResult.qualification, 'legacy-preliminary');
assert.equal(pushoverResult.engine.id, 'legacy-preliminary-stepwise-secant');
assert.equal(pushoverResult.modelBound, true);
assert.equal(pushoverResult.designBlocked, true);
assert.equal(pushoverResult.payload.curve.length, 3);

const nlthResult = runAnalysisCase(model, createAnalysisCase({
  id: 'AC_NLTH',
  kind: 'nlth',
  settings: {
    accelerations: [0, 0.2, -0.1, 0],
    dt: 0.02,
    mass: 1,
    stiffness: 100,
    yieldForce: 0.001,
  },
}));
assert.equal(nlthResult.kind, 'nlth');
assert.equal(nlthResult.status, 'preliminary');
assert.equal(nlthResult.qualification, 'legacy-preliminary');
assert.equal(nlthResult.engine.id, 'legacy-sdof-bilinear-newmark');
assert.equal(nlthResult.modelBound, false);
assert.equal(nlthResult.designBlocked, true);
assert.equal(nlthResult.payload.rows.length, 4);
assert.equal(nlthResult.summary.rowCount, 4);

const batch = runAnalysisCases(model, [
  createAnalysisCase({ id: 'B1', kind: 'modal', settings: { modalModeCount: 1 } }),
  createAnalysisCase({ id: 'B2', kind: 'nlth', settings: { accelerations: [0], dt: 0.02 } }),
]);
assert.equal(batch.length, 2);
assert.deepEqual(batch.map((item) => item.caseId), ['B1', 'B2']);

console.log(JSON.stringify({
  ok: true,
  staticStatus: staticResult.status,
  modalModes: modalResult.summary.modeCount,
  rsaDirections: rsaResult.summary.directions,
  bucklingFactor: bucklingResult.summary.criticalLoadFactor,
  thaRows: thaResult.summary.rowCount,
  pushoverSteps: pushoverResult.summary.stepCount,
  nlthRows: nlthResult.summary.rowCount,
}, null, 2));

function createColumnModel() {
  const result = createModel();
  result.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4, support: null, mass: [10, 10, 10] },
  ];
  result.members = [{
    id: 'M1',
    type: 'frame',
    n1: 'N1',
    n2: 'N2',
    matId: 'steel',
    secId: 'h300',
    localAxis: { roll: 0, strongAxis: 'z' },
    releases: { i: 'rigid', j: 'rigid' },
    buckling: { referenceCompression: 100 },
  }];
  result.loadCases = [{ id: 'D', name: 'Dead', type: 'dead' }];
  result.loadCombinations = [{ id: 'CO1', name: 'D', type: 'strength', factors: { D: 1 } }];
  result.loads = [
    { id: 'P1', type: 'nodal', node: 'N2', P: 100, dir: '-z', case: 'D' },
  ];
  result.analysisSettings.modalModeCount = 4;
  return result;
}
