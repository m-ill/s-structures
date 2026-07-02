import assert from 'node:assert/strict';
import {
  DYNAMIC_COMPLETENESS_VERSION,
  LOADS_V2_VERSION,
  MASS_SOURCE_TRACE_VERSION,
  analyzeDynamics,
  buildAdvancedElasticTrace,
  buildStoryMassSummary,
  buildCqcCombinationReport,
  buildDynamicCompletenessReview,
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
assert.deepEqual(trace.contract.tickets, ['P3-T76', 'P3-T77', 'P3-T78', 'P3-T82']);
assert.equal(trace.contract.featureTicketMap.windV2, 'P3-T76');
assert.ok(trace.contract.reviewFields.includes('summary.ticketCoverage'));
assert.ok(trace.summary.storyCount > 0);
assert.ok(trace.summary.windForce > 0);
assert.ok(trace.summary.seismicForce > 0);
assert.deepEqual(trace.summary.ticketCoverage.map((row) => row.ticket), ['P3-T76', 'P3-T77', 'P3-T78', 'P3-T82']);
assert.ok(trace.summary.ticketCoverage.every((row) => row.covered));
assert.equal(trace.review.status, 'available');
assert.equal(trace.review.loadsTraceReady, true);
assert.equal(trace.review.windTraceReady, true);
assert.equal(trace.review.seismicTraceReady, true);
assert.equal(trace.review.environmentalTraceReady, true);
assert.equal(trace.review.massSourceReady, true);
assert.equal(trace.review.engineerReviewRequired, true);
assert.equal(trace.review.productionReady, false);
assert.equal(trace.review.preliminaryCodeAutomation, true);
assert.deepEqual(trace.review.uncoveredTickets, []);
assert.deepEqual(trace.review.blockers, []);
assert.deepEqual(trace.review.missingBasis, []);
assert.deepEqual(trace.review.requiredBasis.map((row) => row.status), ['available', 'available', 'available', 'available']);
assert.equal(trace.review.agentDecision, 'loads-v2-ready-for-engineering-review');
assert.equal(trace.basisInputs.windPressureProvided, true);
assert.equal(trace.basisInputs.seismicBaseShearProvided, true);
assert.equal(trace.basisInputs.environmentalBasisProvided, true);
assert.equal(trace.basisInputs.requiredInputs.find((row) => row.ticket === 'P3-T76').standard, 'KDS 41 12 preliminary');
assert.equal(trace.contract.standardBasis.seismic, 'KDS 41 17 preliminary trace inputs');
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

const missingBasisTrace = buildLoadsV2Trace(model, {
  massSource: { combos: [{ case: 'D', factor: 1 }], includeNodeMass: true },
});
assert.equal(missingBasisTrace.review.status, 'review-required');
assert.ok(missingBasisTrace.review.missingBasis.includes('wind-basis-missing-or-empty'));
assert.ok(missingBasisTrace.review.missingBasis.includes('seismic-basis-missing-or-empty'));
assert.ok(missingBasisTrace.review.missingBasis.includes('environmental-basis-missing-or-empty'));
assert.equal(missingBasisTrace.review.requiredBasis.find((row) => row.ticket === 'P3-T76').status, 'missing-or-empty');
assert.equal(missingBasisTrace.review.requiredBasis.find((row) => row.ticket === 'P3-T82').status, 'available');
assert.equal(missingBasisTrace.summary.ticketCoverage.find((row) => row.ticket === 'P3-T76').covered, false);
assert.equal(missingBasisTrace.summary.ticketCoverage.find((row) => row.ticket === 'P3-T77').covered, false);

const responses = [{ period: 1, displacement: 2 }, { period: 1.1, displacement: 1 }];
assert.ok(combineModalCqc(responses, 0.05) >= Math.sqrt(5));
const cqcReport = buildCqcCombinationReport([{ mode: 'M1', period: 1, displacement: 2 }, { mode: 'M2', period: 1.05, displacement: 1 }]);
assert.equal(cqcReport.version, DYNAMIC_COMPLETENESS_VERSION);
assert.deepEqual(cqcReport.contract.tickets, ['P3-T79']);
assert.equal(cqcReport.review.status, 'available');
assert.equal(cqcReport.review.agentDecision, 'cqc-trace-ready-for-review');
assert.ok(cqcReport.closeModes.length === 1);
const sparseCqcReview = buildDynamicCompletenessReview({ type: 'cqc', responseCount: 1 });
assert.equal(sparseCqcReview.status, 'review-required');
assert.ok(sparseCqcReview.missing.includes('modal-response-count'));
const invalidCqcReport = buildCqcCombinationReport([
  { mode: 'M1', period: 1, displacement: 2 },
  { mode: 'M-BAD', period: 0, displacement: 1 },
  { mode: 'M-NAN', period: 1.1, displacement: Number.NaN },
]);
assert.equal(invalidCqcReport.review.status, 'review-required');
assert.ok(invalidCqcReport.review.missing.includes('modal-response-count'));
assert.ok(invalidCqcReport.review.missing.includes('modal-response-values'));
assert.equal(invalidCqcReport.inputReview.invalidResponseCount, 2);
assert.equal(invalidCqcReport.inputReview.validResponseCount, 1);

const rsa = runResponseSpectrum([
  { id: 'M1', period: 1, omega: 2 * Math.PI, participation: { x: { gamma: 1, massRatio: 0.6 } } },
  { id: 'M2', period: 1.1, omega: 2 * Math.PI / 1.1, participation: { x: { gamma: 0.5, massRatio: 0.2 } } },
], [0], [1], [1, 0, 0], { method: 'CQC', directions: ['x'], points: [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }] });
assert.equal(rsa.method, 'CQC');
assert.deepEqual(rsa.contract.tickets, ['P3-T77', 'P3-T79']);
assert.equal(rsa.review.status, 'available');
assert.equal(rsa.review.agentDecision, 'response-spectrum-trace-ready-for-review');
assert.ok(rsa.combined.x.cqcDisplacement > 0);
const rsaAdvancedTrace = buildAdvancedElasticTrace({}, { dynamics: { rsa } });
assert.deepEqual(rsaAdvancedTrace.responseSpectrum.contract.tickets, ['P3-T77', 'P3-T79']);
assert.equal(rsaAdvancedTrace.responseSpectrum.review.status, 'available');
const sparseRsa = runResponseSpectrum([
  { id: 'M1', period: 1, omega: 2 * Math.PI, participation: { x: { gamma: 1, massRatio: 1 } } },
], [0], [1], [1, 0, 0], { method: 'CQC', directions: ['x'] });
assert.equal(sparseRsa.review.status, 'review-required');
assert.ok(sparseRsa.review.missing.includes('cqc-modal-response-count'));
assert.equal(sparseRsa.review.agentDecision, 'review-response-spectrum-inputs');

const tha = runLinearSdofTha({ period: 1, accelerations: [0, 0.1, -0.1, 0] });
assert.equal(tha.version, DYNAMIC_COMPLETENESS_VERSION);
assert.deepEqual(tha.contract.tickets, ['P3-T81']);
assert.equal(tha.method, 'linear-sdof-newmark-average-acceleration');
assert.equal(tha.rows.length, 4);
assert.equal(tha.review.agentDecision, 'time-history-trace-ready-for-review');
const emptyTha = runLinearSdofTha({ period: 1, accelerations: [] });
assert.equal(emptyTha.review.status, 'review-required');
assert.equal(emptyTha.review.agentDecision, 'provide-ground-motion-steps');

const modalTha = runModalSuperpositionTha({
  modes: [
    { id: 'M1', period: 1, participation: { x: { gamma: 1 } } },
    { id: 'M2', period: 0.5, participation: { x: { gamma: 0.4 } } },
  ],
  accelerations: [0, 0.1, -0.1, 0],
});
assert.equal(modalTha.method, 'linear-modal-superposition-newmark');
assert.deepEqual(modalTha.contract.tickets, ['P3-T81']);
assert.equal(modalTha.rows.length, 4);
assert.equal(modalTha.modal.length, 2);
assert.equal(modalTha.review.status, 'available');
const emptyModalTha = runModalSuperpositionTha({ modes: [], accelerations: [0, 0.1] });
assert.equal(emptyModalTha.review.status, 'review-required');
assert.ok(emptyModalTha.review.missing.includes('modal-mode-count'));
assert.equal(emptyModalTha.inputReview.validModeCount, 0);
const invalidModeTha = runModalSuperpositionTha({
  modes: [{ id: 'BAD', period: 0 }, { id: 'M1', period: 1, gamma: 1 }],
  accelerations: [0, 0.1],
});
assert.equal(invalidModeTha.review.status, 'review-required');
assert.ok(invalidModeTha.review.missing.includes('modal-mode-values'));
assert.equal(invalidModeTha.inputReview.invalidModeCount, 1);
assert.equal(invalidModeTha.modal.length, 1);

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
assert.equal(massTrace.review.status, 'available');
assert.equal(massTrace.review.agentDecision, 'mass-source-ready');

const udlMassTrace = buildMassSourceTrace({
  nodes: [{ id: 'A', x: 0, y: 0, z: 0 }, { id: 'B', x: 4, y: 0, z: 0 }],
  members: [{ id: 'BM1', n1: 'A', n2: 'B' }],
  loads: [{ id: 'D-UDL', type: 'udl', member: 'BM1', w: 9.80665, dir: '-z', case: 'D' }],
}, { combos: [{ case: 'D', factor: 1 }], includeNodeMass: false });
assert.equal(udlMassTrace.nodeCount, 2);
assert.ok(Math.abs(udlMassTrace.totalMass - 4) < 1e-9);
assert.ok(udlMassTrace.rows.every((row) => row.sources.includes('member-load:D')));
const lateralIgnoredMassTrace = buildMassSourceTrace({
  nodes: [{ id: 'N1' }],
  loads: [
    { id: 'D-Z', type: 'nodal', node: 'N1', P: 9.80665, dir: '-z', case: 'D' },
    { id: 'D-X', type: 'nodal', node: 'N1', P: 9.80665, dir: '+x', case: 'D' },
  ],
}, { combos: [{ case: 'D', factor: 1 }], includeNodeMass: false });
assert.equal(lateralIgnoredMassTrace.review.ignoredLoadCount, 1);
assert.ok(lateralIgnoredMassTrace.review.ignoredReasons.includes('not-vertical-load'));
assert.equal(lateralIgnoredMassTrace.review.warning, 'mass-source-has-ignored-loads');
assert.equal(lateralIgnoredMassTrace.review.agentDecision, 'mass-source-ready-with-ignored-load-review');

const skippedMassTrace = buildMassSourceTrace({
  nodes: [{ id: 'N1' }],
  loads: [
    { id: 'D-ZERO', type: 'nodal', node: 'N1', fz: 0, case: 'D' },
    { id: 'L-OUT', type: 'nodal', node: 'N1', P: 9.80665, dir: '-z', case: 'L' },
  ],
}, { combos: [{ case: 'D', factor: 1 }], includeNodeMass: false });
assert.equal(skippedMassTrace.review.skippedLoadCount, 2);
assert.ok(skippedMassTrace.review.skippedReasons.includes('zero-vertical-load'));
assert.ok(skippedMassTrace.review.skippedReasons.includes('outside-mass-source-combo'));
assert.equal(skippedMassTrace.ignored.length, 0);

const ignoredLoadTopLevelTrace = buildLoadsV2Trace({
  nodes: [{ id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 0, y: 0, z: 3 }],
  loads: [
    { id: 'D-Z', type: 'nodal', node: 'N2', P: 9.80665, dir: '-z', case: 'D' },
    { id: 'D-X', type: 'nodal', node: 'N2', P: 9.80665, dir: '+x', case: 'D' },
  ],
}, {
  windPressure: 0.9,
  seismicBaseShear: 120,
  snowLoad: 0.5,
  massSource: { combos: [{ case: 'D', factor: 1 }], includeNodeMass: false },
});
assert.equal(ignoredLoadTopLevelTrace.massSource.review.warning, 'mass-source-has-ignored-loads');
assert.equal(ignoredLoadTopLevelTrace.review.status, 'review-required');
assert.equal(ignoredLoadTopLevelTrace.review.loadsTraceReady, false);
assert.equal(ignoredLoadTopLevelTrace.review.massSourceReviewWarning, 'mass-source-has-ignored-loads');
assert.equal(ignoredLoadTopLevelTrace.review.massSourceIgnoredLoadCount, 1);
assert.ok(ignoredLoadTopLevelTrace.review.blockers.includes('mass-source-ignored-loads'));
assert.equal(ignoredLoadTopLevelTrace.review.agentDecision, 'review-loads-v2-mass-source-ignored-loads');

const emptyMassTopLevelTrace = buildLoadsV2Trace({
  stories: [{ id: 'L1', z: 3, weight: 0 }],
  nodes: [{ id: 'N1', x: 0, y: 0, z: 3 }],
}, {
  windPressure: 0,
  seismicBaseShear: 0,
  massSource: { combos: [{ case: 'D', factor: 1 }], includeNodeMass: false },
});
assert.equal(emptyMassTopLevelTrace.summary.ticketCoverage.find((row) => row.ticket === 'P3-T76').covered, false);
assert.equal(emptyMassTopLevelTrace.summary.ticketCoverage.find((row) => row.ticket === 'P3-T77').covered, false);
assert.equal(emptyMassTopLevelTrace.summary.ticketCoverage.find((row) => row.ticket === 'P3-T82').covered, false);
assert.equal(emptyMassTopLevelTrace.review.massSourceReady, false);
assert.ok(emptyMassTopLevelTrace.review.blockers.includes('mass-source-empty'));
assert.ok(emptyMassTopLevelTrace.review.blockers.includes('wind-trace-empty'));
assert.ok(emptyMassTopLevelTrace.review.blockers.includes('seismic-trace-empty'));

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
assert.deepEqual(buckling.contract.tickets, ['P3-T80']);
assert.equal(buckling.critical.memberId, 'C2');
assert.equal(buckling.review.status, 'review-required');
assert.ok(buckling.review.missing.includes('global-buckling-trace'));

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
assert.deepEqual(globalBuckling.contract.tickets, ['P3-T80']);
assert.ok(Math.abs(globalBuckling.criticalLoadFactor - eulerReference) / eulerReference < 0.02);
const combinedBuckling = estimateModelBucklingTrace({ nodes: columnNodes, members: columnMembers });
assert.equal(combinedBuckling.method, 'global-eigenvalue-with-member-euler-screening');
assert.equal(combinedBuckling.global.status, 'available');
assert.equal(combinedBuckling.review.status, 'available');
assert.equal(combinedBuckling.review.agentDecision, 'buckling-trace-ready-for-review');

console.log(JSON.stringify({ ok: true, version: 'p3-m13-loads-dynamics' }, null, 2));
