import assert from 'node:assert/strict';
import {
  analyzeDynamics,
  analyzeModel,
  createModel,
} from '../src/index.js';
import { materialOf, sectionOf } from '../src/core/catalogs.js';
import { createM3State, modalSeries } from '../src/ui/m3State.js';

const EPS = 1e-6;

const model = createModalColumnModel();
const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));
assert.equal(analysis.dynamics.ok, true, 'modal analysis should be available from analyzeModel');
assert.ok(analysis.dynamics.modes.length >= 3, 'benchmark should return translational modes');

const material = materialOf(model, 'steel');
const section = sectionOf(model, 'h300');
const L = 4;
const topMass = 10 + material.density * section.A * L / 2;
const weakAxisK = (3 * material.E * section.Iy) / L ** 3;
const expectedWeakPeriod = 2 * Math.PI * Math.sqrt(topMass / weakAxisK);
close(analysis.dynamics.modes[0].period, expectedWeakPeriod, EPS, 'weak-axis cantilever period');
assert.ok(analysis.dynamics.modes[0].participation.y.massRatio > 0.99, 'first mode should govern Y mass');

const rsa = analysis.dynamics.rsa;
assert.ok(rsa.combined.y.participatingMassRatio > 0.99, 'Y RSA mass participation should be near 100%');
assert.ok(rsa.combined.y.srssDisplacement > rsa.combined.x.srssDisplacement, 'weak-axis RSA displacement should be larger than strong-axis');

const direct = analyzeDynamics(model);
close(direct.modes[0].period, analysis.dynamics.modes[0].period, EPS, 'direct modal facade should match analyzeModel');

const state = createM3State(model);
const chartSeries = modalSeries(state);
assert.equal(chartSeries[0].index, 1);
assert.ok(chartSeries[0].period > 0, 'UI modal chart series should expose periods');
assert.ok(chartSeries.some((mode) => mode.massY > 0.99), 'UI modal series should expose mass participation');

console.log(JSON.stringify({
  ok: true,
  firstPeriod: analysis.dynamics.modes[0].period,
  firstFrequency: analysis.dynamics.modes[0].frequencyHz,
  yMassRatio: analysis.dynamics.modes[0].participation.y.massRatio,
  rsaYDisplacement: rsa.combined.y.srssDisplacement,
}, null, 2));

function createModalColumnModel() {
  const model = createModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4, support: null, mass: [10, 10, 10] },
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
  model.loads = [];
  model.analysisSettings.modalModeCount = 4;
  model.analysisSettings.responseSpectrum = {
    enabled: true,
    dampingRatio: 0.05,
    scale: 9.80665,
    directions: ['x', 'y'],
    points: [
      { period: 0, sa: 0.4 },
      { period: 5, sa: 0.4 },
    ],
  };
  return model;
}

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`,
  );
}
