import assert from 'node:assert/strict';
import {
  DYNAMIC_COMPLETENESS_VERSION,
  LOADS_V2_VERSION,
  MASS_SOURCE_TRACE_VERSION,
  analyzeDynamics,
  buildStoryMassSummary,
  buildCqcCombinationReport,
  buildLoadsV2Trace,
  buildMassSourceTrace,
  combineModalCqc,
  computeTorsionAmplificationAx,
  createTwoStoryElasticFrameModel,
  estimateGlobalBucklingTrace,
  estimateModelBucklingTrace,
  generateEnvironmentalLoadsV2,
  runLinearSdofTha,
  runModalSuperpositionTha,
  runResponseSpectrum,
  scaleRsaBaseShear,
} from '../src/index.js';

const model = createTwoStoryElasticFrameModel();
const trace = buildLoadsV2Trace(model, {
  windPressure: 0.9,
  seismicBaseShear: 120,
  dynamicBaseShear: 60,
  minDynamicRatio: 0.85,
  snowLoad: 0.5,
  uplift: 0.2,
  massSource: { combos: [{ case: 'D', factor: 1 }, { case: 'L', factor: 0.25 }], includeNodeMass: true },
  torsion: { maxDrift: 1.4, avgDrift: 1 },
});
assert.equal(trace.version, LOADS_V2_VERSION);
assert.equal(trace.contract.milestone, 'P3-M13');
assert.ok(trace.contract.tickets.includes('P3-T76'));
assert.ok(trace.contract.tickets.includes('P3-T82'));
assert.ok(trace.summary.storyCount > 0);
assert.ok(trace.summary.windForce > 0);
assert.ok(trace.summary.seismicForce > 0);
assert.ok(trace.wind.length > 0 && trace.seismic.length > 0);
assert.equal(trace.wind[1].pressure, 0.9);
assert.equal(trace.wind[1].importance, 1);
assert.equal(trace.wind[1].tributaryWidth, 1);
assert.equal(trace.seismic[1].baseShear, 120);
assert.ok(trace.seismic[1].sumWh > 0);
assert.equal(trace.other.snow, 0.5);
assert.ok(trace.rsaScaling.scaleFactor > 1);
assert.ok(trace.torsionAx.Ax >= 1);
assert.ok(trace.environmental.loads.some((load) => load.case === 'S'));
assert.ok(trace.environmental.loads.some((load) => load.case === 'U'));
assert.equal(trace.massSource.version, MASS_SOURCE_TRACE_VERSION);
assert.ok(trace.massSource.contract.acceptedLoads.includes('vertical member uniform load'));

const weightedTrace = buildLoadsV2Trace({
  stories: [
    { id: 'BASE', z: 0, weight: 100 },
    { id: 'L2', z: 3, weight: 100 },
    { id: 'L3', z: 6, weight: 200 },
  ],
}, { seismicBaseShear: 150 });
assert.equal(weightedTrace.seismic[0].force, 0);
assert.ok(weightedTrace.seismic[2].force > weightedTrace.seismic[1].force);
assert.equal(Math.round(weightedTrace.seismic.reduce((sum, row) => sum + row.force, 0)), 150);

const responses = [{ period: 1, displacement: 2 }, { period: 1.1, displacement: 1 }];
assert.ok(combineModalCqc(responses, 0.05) >= Math.sqrt(5));
const cqcReport = buildCqcCombinationReport([{ mode: 'M1', period: 1, displacement: 2 }, { mode: 'M2', period: 1.05, displacement: 1 }]);
assert.equal(cqcReport.version, DYNAMIC_COMPLETENESS_VERSION);
assert.ok(cqcReport.closeModes.length === 1);

const rsa = runResponseSpectrum([
  { id: 'M1', period: 1, omega: 2 * Math.PI, participation: { x: { gamma: 1, massRatio: 0.6 } } },
  { id: 'M2', period: 1.1, omega: 2 * Math.PI / 1.1, participation: { x: { gamma: 0.5, massRatio: 0.2 } } },
], [0], [1], [1, 0, 0], { method: 'CQC', directions: ['x'], points: [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }] });
assert.equal(rsa.method, 'CQC');
assert.ok(rsa.combined.x.cqcDisplacement > 0);

const tha = runLinearSdofTha({ period: 1, accelerations: [0, 0.1, -0.1, 0] });
assert.equal(tha.version, DYNAMIC_COMPLETENESS_VERSION);
assert.equal(tha.method, 'linear-sdof-newmark-average-acceleration');
assert.equal(tha.rows.length, 4);

const modalTha = runModalSuperpositionTha({
  modes: [
    { id: 'M1', period: 1, participation: { x: { gamma: 1 } } },
    { id: 'M2', period: 0.5, participation: { x: { gamma: 0.4 } } },
  ],
  accelerations: [0, 0.1, -0.1, 0],
});
assert.equal(modalTha.method, 'linear-modal-superposition-newmark');
assert.equal(modalTha.rows.length, 4);
assert.equal(modalTha.modal.length, 2);

const environmental = generateEnvironmentalLoadsV2(model, { soilPressure: 3, waterPressure: 2, uplift: 1, snowLoad: 0.5 });
assert.ok(environmental.loadCases.includes('H'));
assert.ok(environmental.loadCases.includes('F'));

const massTrace = buildMassSourceTrace({
  nodes: [{ id: 'N1', mass: [2, 2, 2] }, { id: 'N2' }],
  members: [{ id: 'M1', n1: 'N1', n2: 'N2' }],
  loads: [
    { id: 'D1', type: 'nodal', node: 'N2', P: 9.80665, dir: '-z', case: 'D' },
    { id: 'L1', type: 'point', member: 'M1', P: 19.6133, dir: '-z', case: 'L' },
  ],
}, { combos: [{ case: 'D', factor: 1 }, { case: 'L', factor: 0.25 }], includeNodeMass: true });
assert.equal(massTrace.version, MASS_SOURCE_TRACE_VERSION);
assert.equal(massTrace.contract.scope, 'Convert selected vertical load cases to lumped nodal mass for elastic dynamics.');
assert.equal(massTrace.nodeCount, 2);
assert.ok(massTrace.totalMass > 3);
assert.ok(massTrace.rows.find((row) => row.node === 'N1').sources.includes('node.mass'));

const udlMassTrace = buildMassSourceTrace({
  nodes: [{ id: 'A', x: 0, y: 0, z: 0 }, { id: 'B', x: 4, y: 0, z: 0 }],
  members: [{ id: 'BM1', n1: 'A', n2: 'B' }],
  loads: [{ id: 'D-UDL', type: 'udl', member: 'BM1', w: 9.80665, dir: '-z', case: 'D' }],
}, { combos: [{ case: 'D', factor: 1 }], includeNodeMass: false });
assert.equal(udlMassTrace.nodeCount, 2);
assert.ok(Math.abs(udlMassTrace.totalMass - 4) < 1e-9);
assert.ok(udlMassTrace.rows.every((row) => row.sources.includes('member-load:D')));

const dynamicMassModel = createTwoStoryElasticFrameModel();
dynamicMassModel.analysisSettings.massSource = {
  combos: [{ case: 'D', factor: 1 }, { case: 'L', factor: 0.25 }],
  includeNodeMass: false,
};
dynamicMassModel.loads.push(
  { id: 'D-MASS-1', type: 'nodal', node: 'N222', P: 98.0665, dir: '-z', case: 'D' },
  { id: 'L-MASS-1', type: 'nodal', node: 'N223', P: 39.2266, dir: '-z', case: 'L' },
);
const dynamicMass = analyzeDynamics(dynamicMassModel);
assert.equal(dynamicMass.mass.source, 'analysisSettings.massSource');
assert.equal(dynamicMass.mass.massSource.version, MASS_SOURCE_TRACE_VERSION);
assert.ok(dynamicMass.mass.massSource.rows.some((row) => row.sources.includes('load:D')));
const storyMass = buildStoryMassSummary(dynamicMassModel);
assert.equal(storyMass.source, 'analysisSettings.massSource');
assert.equal(storyMass.massSourceVersion, MASS_SOURCE_TRACE_VERSION);
assert.ok(storyMass.totalMass > 10);

const scaling = scaleRsaBaseShear(50, 100, 0.85);
assert.equal(scaling.scaleFactor, 1.7);
assert.ok(computeTorsionAmplificationAx({ maxDrift: 3, avgDrift: 1 }).Ax > 1);

const buckling = estimateModelBucklingTrace({
  members: [
    { id: 'C1', buckling: { L: 3, material: { E: 200000000 }, section: { Iy: 0.001, Iz: 0.002 } } },
    { id: 'C2', buckling: { L: 4, material: { E: 200000000 }, section: { Iy: 0.001, Iz: 0.002 } } },
  ],
});
assert.equal(buckling.method, 'member-euler-screening-not-global-eigenvalue');
assert.equal(buckling.critical.memberId, 'C2');

const columnNodes = Array.from({ length: 9 }, (_, index) => ({
  id: `N${index}`,
  x: 0,
  y: 0,
  z: (3 * index) / 8,
  support: index === 0 || index === 8 ? 'pin' : undefined,
}));
const columnMembers = Array.from({ length: 8 }, (_, index) => ({
  id: `C${index + 1}`,
  n1: `N${index}`,
  n2: `N${index + 1}`,
  matId: 'steel',
  secId: 'h300',
  buckling: { referenceCompression: 1 },
}));
const globalBuckling = estimateGlobalBucklingTrace({ nodes: columnNodes, members: columnMembers });
const eulerReference = Math.PI ** 2 * 205000000 * 508e-8 / 3 ** 2;
assert.equal(globalBuckling.status, 'available');
assert.ok(Math.abs(globalBuckling.criticalLoadFactor - eulerReference) / eulerReference < 0.02);
const combinedBuckling = estimateModelBucklingTrace({ nodes: columnNodes, members: columnMembers });
assert.equal(combinedBuckling.method, 'global-eigenvalue-with-member-euler-screening');
assert.equal(combinedBuckling.global.status, 'available');

console.log(JSON.stringify({ ok: true, version: 'p3-m13-loads-dynamics' }, null, 2));
