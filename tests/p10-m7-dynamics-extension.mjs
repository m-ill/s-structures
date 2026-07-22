import assert from 'node:assert/strict';
import { analyzeDynamics } from '../src/dynamics/modal.js';
import { solveGeneralizedBucklingModes } from '../src/dynamics/globalBuckling.js';
import { runLinearSdofTha } from '../src/dynamics/elasticCompleteness.js';
import { runLinearDirectTha } from '../src/dynamics/linearDirectIntegration.js';
import { runAnalysisCase } from '../src/ui/analysisRunners.js';
import { stableHash } from '../src/core/stableHash.js';

const model = columnModel();
const elastic = analyzeDynamics(model, { modalModeCount: 1, responseSpectrum: { enabled: false } });
assert.equal(elastic.ok, true);
assert.equal(elastic.provenance.stiffnessBasis, 'elastic-Ke');

const system = elastic.dynamicSystem;
const zeroPrestress = analyzeDynamics(model, {
  modalModeCount: 1,
  responseSpectrum: { enabled: false },
  prestressed: true,
  stiffnessBasis: 'gravity-tangent-Kt',
  gravityCombinationId: 'G',
  tangentStiffness: fullStiffness(elastic),
});
assert.equal(zeroPrestress.ok, true);
relativeClose(zeroPrestress.modes[0].period, elastic.modes[0].period, 1e-10, 'DY-01 zero prestress parity');
assert.equal(zeroPrestress.provenance.stiffnessBasis, 'gravity-tangent-Kt');
assert.equal(zeroPrestress.modes[0].provenance.stiffnessBasis, 'gravity-tangent-Kt');

const compressedMatrix = fullStiffness(elastic).map((row) => row.slice());
const lateralDof = 6;
compressedMatrix[lateralDof][lateralDof] *= 0.9;
const compressed = analyzeDynamics(model, {
  modalModeCount: 1,
  responseSpectrum: { enabled: false },
  prestressed: true,
  stiffnessBasis: 'gravity-tangent-Kt',
  gravityCombinationId: 'G',
  tangentStiffness: compressedMatrix,
});
assert.equal(compressed.ok, true);
assert.ok(compressed.modes[0].period > elastic.modes[0].period, 'DY-02 compression must increase period');

const missingBasis = analyzeDynamics(model, { prestressed: true, tangentStiffness: fullStiffness(elastic) });
assert.equal(missingBasis.designBlocked, true);
assert.equal(missingBasis.reason, 'PRESTRESSED_STIFFNESS_BASIS_REQUIRED');

const routedModel = columnModel();
routedModel.loads = [{ id: 'P', type: 'nodal', node: 'N1', P: 50, dir: '-z', case: 'G' }];
const routedPrestress = runAnalysisCase(routedModel, {
  id: 'PRESTRESSED-MODAL',
  kind: 'modal',
  settings: { modalModeCount: 1, prestressed: true, gravityCombinationId: 'G' },
});
assert.equal(routedPrestress.status, 'ok');
assert.equal(routedPrestress.payload.provenance.stiffnessBasis, 'gravity-tangent-Kt');
assert.deepEqual(routedPrestress.payload.provenance.staticCaseReferences, ['G']);
assert.equal(routedPrestress.payload.prestress.direct.converged, true);

const buckling = solveGeneralizedBucklingModes(
  [[4, 0, 0], [0, 9, 0], [0, 0, 16]],
  [[2, 0, 0], [0, 3, 0], [0, 0, 4]],
  { modeCount: 3, residualTolerance: 1e-10 },
);
assert.equal(buckling.ok, true);
assert.deepEqual(buckling.modes.map((mode) => rounded(mode.loadFactor)), [2, 3, 4]);
relativeClose(buckling.modes[0].loadFactor, 2, 1e-8, 'DY-04 legacy lowest mode');
const eulerReference = Math.PI ** 2 * 200000000 * 5e-6 / 4 ** 2;
const eulerBuckling = solveGeneralizedBucklingModes([[eulerReference]], [[1]], { modeCount: 1 });
const eulerRelativeError = relativeError(eulerBuckling.modes[0].loadFactor, eulerReference);
assert.ok(eulerRelativeError < 1e-6, `DY-03 Euler error ${eulerRelativeError}`);

const dt = 0.01;
const accelerations = Array.from({ length: 300 }, (_, i) => 0.2 * Math.sin(i * dt * 4));
const omega = 5;
const period = 2 * Math.PI / omega;
const modalTha = runLinearSdofTha({ period, dampingRatio: 0.03, dt, accelerations });
const directTha = runLinearDirectTha({
  mass: [[1]],
  stiffness: [[omega ** 2]],
  modes: [{ omega }],
  dampingRatio: 0.03,
  influence: [1],
  dt,
  accelerations,
});
assert.equal(directTha.factorization.factorizationCount, 1);
assert.equal(directTha.factorization.solveCount, accelerations.length - 1);
assert.equal(directTha.factorization.reusedSolveCount, accelerations.length - 2);
const directModalError = Math.max(...directTha.rows.map((row, index) => Math.abs(row.displacement[0] - modalTha.rows[index].displacement)));
assert.ok(directModalError < 1e-6, `DY-05 direct/modal error ${directModalError}`);

const conservative = runLinearDirectTha({
  mass: [[1]],
  stiffness: [[omega ** 2]],
  damping: [[0]],
  influence: [1],
  initialDisplacement: [0.1],
  dt,
  accelerations: new Array(500).fill(0),
  energyTol: 1e-8,
});
assert.equal(conservative.energy.qualified, true);
assert.ok(conservative.energy.maxRelativeError < 1e-8, `DY-06 energy error ${conservative.energy.maxRelativeError}`);

export const M7_VERIFICATION_SNAPSHOT = Object.freeze({
  ok: true,
  version: 'p10-m7-dynamics-extension-v1',
  solverVersion: 'p10-m7-linear-direct-tha-v1',
  metrics: {
    zeroPrestressRelativeError: relativeError(zeroPrestress.modes[0].period, elastic.modes[0].period),
    compressionPeriodIncrease: compressed.modes[0].period / elastic.modes[0].period - 1,
    eulerRelativeError,
    legacyLowestModeRelativeError: relativeError(buckling.modes[0].loadFactor, 2),
    directModalError,
    energyError: conservative.energy.maxRelativeError,
  },
  tolerances: { zeroPrestress: 1e-10, euler: 1e-6, legacyLowestMode: 1e-8, directModal: 1e-6, energy: 1e-8 },
  modelHash: stableHash(model).slice(0, 24),
  contracts: {
    prestressedModal: zeroPrestress.version,
    globalBuckling: 'p10-m7-global-buckling-v5',
    factorSession: directTha.factorization.version,
    factorizationCount: directTha.factorization.factorizationCount,
  },
});

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['DY-01', 'DY-02', 'DY-03', 'DY-04', 'DY-05', 'DY-06'],
  zeroPrestressRelativeError: relativeError(zeroPrestress.modes[0].period, elastic.modes[0].period),
  compressedPeriodRatio: compressed.modes[0].period / elastic.modes[0].period,
  bucklingFactors: buckling.modes.map((mode) => mode.loadFactor),
  directModalError,
  energyError: conservative.energy.maxRelativeError,
  factorization: directTha.factorization,
}, null, 2));

function columnModel() {
  return {
    units: { length: 'm', force: 'kN', moment: 'kN.m' },
    materials: [{ id: 'MAT', E: 200000000, G: 77000000, density: 0 }],
    sections: [{ id: 'SEC', A: 0.01, Iy: 5e-6, Iz: 8e-6, J: 1e-6 }],
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 0, y: 0, z: 4, mass: [10, 0, 0] },
    ],
    members: [{ id: 'C1', type: 'frame', n1: 'N0', n2: 'N1', matId: 'MAT', secId: 'SEC' }],
    loadCases: [{ id: 'G', type: 'dead' }],
    loadCombinations: [{ id: 'G', factors: { G: 1 } }],
    loads: [],
    analysisSettings: { modalModeCount: 1, responseSpectrum: { enabled: false } },
  };
}

function fullStiffness(result) {
  const full = Array.from({ length: result.dynamicSystem.fullDofCount }, () => new Array(result.dynamicSystem.fullDofCount).fill(0));
  result.dynamicSystem.freeDofs.forEach((rowDof, row) => result.dynamicSystem.freeDofs.forEach((columnDof, column) => {
    full[rowDof][columnDof] = result.dynamicSystem.stiffness[row][column];
  }));
  return full;
}
function rounded(value) { return Math.round(value * 1e12) / 1e12; }
function relativeError(actual, expected) { return Math.abs(actual - expected) / Math.max(1, Math.abs(expected)); }
function relativeClose(actual, expected, tolerance, label) { assert.ok(relativeError(actual, expected) < tolerance, `${label}: ${actual} vs ${expected}`); }
