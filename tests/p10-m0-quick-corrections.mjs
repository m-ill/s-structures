import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  analyzeModel,
  analyzePDeltaCombinations,
  analyzeDynamics,
  applyBaseShearScaling,
  buildPhase6M4ResultTrace,
  buildPDeltaDesignSummary,
  buildStoryDriftTrace,
  buildStoryOverturningTrace,
  buildStoryShearTrace,
  listAnalysisCriteriaKeys,
  pDeltaDesignStatus,
  resolveCriterion,
} from '../src/index.js';
import { modelHash } from '../verification/index.js';
import { executeProductionElastic } from '../src/compute/index.js';

const THETA_CASES = [
  [0.049999, 'OK', 'OK'],
  [0.05, 'CAUTION', 'WARN'],
  [0.099999, 'CAUTION', 'WARN'],
  [0.1, 'REQUIRE-2ND', 'WARN'],
  [0.199999, 'REQUIRE-2ND', 'WARN'],
  [0.2, 'NG', 'NG'],
];

for (const [theta, expected, legacy] of THETA_CASES) {
  assert.equal(pDeltaDesignStatus(theta, 0.05, 0.1, 0.2), expected, `theta=${theta}`);
  const design = thetaSummary(theta, 'legacy');
  assert.equal(design.storyRows[0].status, expected);
  assert.equal(design.storyRows[0].statusLegacy, legacy);
  assert.equal(design.rows[0].status, expected);
  assert.equal(design.rows[0].statusLegacy, legacy);
  assert.equal(design.summary.status, expected);
  assert.equal(design.summary.statusLegacy, legacy);
}

const requireLegacy = thetaSummary(0.1, 'legacy');
assert.equal(requireLegacy.correctnessVersion, 'p10-m0-pdelta-design-summary-v1');
assert.equal(requireLegacy.designEligibility.eligible, false);
assert.equal(requireLegacy.designEligibility.reason, 'PDELTA_SECOND_ORDER_REQUIRED');
const requireOff = thetaSummary(0.1, 'off');
assert.equal(requireOff.designEligibility.eligible, false);
assert.equal(requireOff.designEligibility.reason, 'PDELTA_SECOND_ORDER_REQUIRED');
const requireDirect = thetaSummary(0.1, 'direct');
assert.equal(requireDirect.designEligibility.eligible, true);
assert.equal(requireDirect.designEligibility.reason, null);
const ngDirect = thetaSummary(0.2, 'direct');
assert.equal(ngDirect.designEligibility.eligible, false);
assert.equal(ngDirect.designEligibility.reason, 'PDELTA_THETA_LIMIT_EXCEEDED');

const legacyRoutingModel = routingModel();
legacyRoutingModel.analysisSettings.pDeltaMethod = 'direct';
legacyRoutingModel.analysisCriteria = thetaCriteria(0, 0, 1);
const legacyRouting = analyzePDeltaCombinations(
  legacyRoutingModel,
  [legacyRoutingModel.loadCombinations[0]],
  { pDeltaMethod: 'legacy' },
);
assert.equal(legacyRouting.method, 'legacy');
assert.equal(legacyRouting.designEligibility.eligible, false);
assert.equal(legacyRouting.designEligibility.reason, 'PDELTA_SECOND_ORDER_REQUIRED');

const directNgModel = routingModel();
directNgModel.analysisSettings.pDeltaMethod = 'direct';
directNgModel.analysisSettings.pDeltaLoadSteps = 2;
directNgModel.analysisCriteria = thetaCriteria(0, 0, 1e-8);
const directNgAnalysis = analyzeModel(directNgModel);
assert.equal(directNgAnalysis.ok, true);
assert.equal(directNgAnalysis.analysisEligibility.eligible, true);
assert.equal(directNgAnalysis.pDelta.ok, true);
assert.equal(directNgAnalysis.designEligibility.eligible, false);
assert.equal(directNgAnalysis.designEligibility.reason, 'PDELTA_THETA_LIMIT_EXCEEDED');
assert.equal(directNgAnalysis.design.analysisSource, 'blocked-direct-pdelta-design-gate');

const offRequireModel = routingModel();
offRequireModel.analysisSettings.pDeltaMethod = 'off';
offRequireModel.analysisCriteria = thetaCriteria(0, 1e-8, 1);
const offRequireAnalysis = analyzeModel(offRequireModel);
assert.equal(offRequireAnalysis.ok, true);
assert.equal(offRequireAnalysis.analysisEligibility.eligible, true);
assert.equal(offRequireAnalysis.designEligibility.eligible, false);
assert.equal(offRequireAnalysis.designEligibility.reason, 'PDELTA_SECOND_ORDER_REQUIRED');
assert.equal(offRequireAnalysis.design.analysisSource, 'blocked-first-order-pdelta-screening');

const boundedModel = boundedScreeningModel();
const detailedScreening = await executeProductionElastic({
  model: boundedModel,
  retainDetailedCombinations: true,
}, noOpContext());
const boundedScreening = await executeProductionElastic({
  model: boundedModel,
  retainDetailedCombinations: false,
}, noOpContext());
const boundedScreeningRepeat = await executeProductionElastic({
  model: boundedModel,
  retainDetailedCombinations: false,
}, noOpContext());
assert.equal(
  boundedScreeningRepeat.resultHash,
  boundedScreening.resultHash,
  'same-build bounded screening result hash must be deterministic',
);
assert.equal(
  boundedScreeningRepeat.result.pDeltaDesignScreening.summary.maxTheta,
  boundedScreening.result.pDeltaDesignScreening.summary.maxTheta,
  'same-build bounded screening theta must be bit-identical',
);
for (const result of [detailedScreening.result, boundedScreening.result]) {
  assert.equal(result.pDeltaDesignScreening.summary.status, 'REQUIRE-2ND');
  assert.equal(result.designEligibility.eligible, false);
  assert.equal(result.designEligibility.reason, 'PDELTA_SECOND_ORDER_REQUIRED');
}
assert.equal(
  boundedScreening.result.combinationStorage.pDeltaScreeningVersion,
  'p10-m0-bounded-pdelta-screening-v1',
);
closeRatio(
  boundedScreening.result.pDeltaDesignScreening.summary.maxTheta,
  detailedScreening.result.pDeltaDesignScreening.summary.maxTheta,
  1,
  'bounded/detail theta parity',
);

assert.ok(listAnalysisCriteriaKeys().includes('criteria.rsa.applyBaseShearScaling'));
assert.equal(resolveCriterion({}, 'rsa.applyBaseShearScaling'), true);
assert.equal(resolveCriterion({
  analysisCriteria: {
    preset: 'custom',
    criteria: { rsa: { applyBaseShearScaling: false } },
  },
}, 'rsa.applyBaseShearScaling'), false);
const unavailableScaling = applyBaseShearScaling({ combined: { x: {} } }, {
  directionMinima: { x: 1 },
});
assert.equal(unavailableScaling.trace.rows[0].scaleFactor, null);
assert.equal(unavailableScaling.trace.rows[0].appliedBaseShear, null);

const rawModel = singleColumnModel();
const raw = analyzeDynamics(rawModel);
assert.equal(raw.ok, true);
assert.ok(raw.rsa?.combined?.x);
const analyticalBaseShear = 10;
const analyticalDisplacement = analyticalBaseShear
  / (3 * (200000 * 1000) * 8e-6 / (4 ** 3));
closeRatio(raw.rsa.combined.x.baseShear, analyticalBaseShear, 1, 'analytical base shear');
closeRatio(raw.rsa.combined.x.displacement, analyticalDisplacement, 1, 'analytical displacement');
const noMinimum = analyzeDynamics(structuredClone(rawModel));
assertCombinedNumericallyEqual(noMinimum.rsa.combined.x, raw.rsa.combined.x, 1e-15);
assert.equal(noMinimum.rsa.baseShearScaling.rows[0].scaleFactor, 1);
assert.equal(noMinimum.rsa.baseShearScaling.rows[0].appliedScaleFactor, 1);

const rawBaseShear = raw.rsa.combined.x.baseShear;
const scaleFactor = 2;
const scaledModel = structuredClone(rawModel);
scaledModel.analysisSettings.rsa = {
  minimumBaseShear: { x: rawBaseShear * scaleFactor },
};
const scaled = analyzeDynamics(scaledModel);
const rawX = raw.rsa.combined.x;
const scaledX = scaled.rsa.combined.x;
const scaleRow = scaled.rsa.baseShearScaling.rows.find((row) => row.direction === 'x');
assert.equal(scaleRow.scaleFactor, scaleFactor);
assert.equal(scaleRow.appliedScaleFactor, scaleFactor);
assertScalingRecord(scaleRow.provenance.scaling, rawBaseShear, scaleFactor, 'base-shear trace');

for (const key of [
  'displacement',
  'combinedDisplacement',
  'maxModalDisplacement',
  'srssDisplacement',
  'cqcDisplacement',
  'baseShear',
  'rsaBaseShear',
  'srssBaseShear',
  'cqcBaseShear',
]) closeRatio(scaledX[key], rawX[key], scaleFactor, `combined.${key}`);
assertArrayScaled(scaledX.displacementVector, rawX.displacementVector, scaleFactor, 'displacementVector');
assertArrayScaled(scaledX.inertiaForceVector, rawX.inertiaForceVector, scaleFactor, 'inertiaForceVector');
assertVectorRowScaled(scaledX.nodalDisplacements[1], rawX.nodalDisplacements[1], scaleFactor, 'nodal displacement');
assertVectorRowScaled(scaledX.nodalInertiaForces[1], rawX.nodalInertiaForces[1], scaleFactor, 'nodal inertia force');
closeRatio(scaledX.baseShearComponents.x, rawX.baseShearComponents.x, scaleFactor, 'base shear component');
assertScalingRecord(
  scaledX.provenance.scaling.values.baseShear,
  rawX.baseShear,
  scaleFactor,
  'combined base shear',
);

const rawMember = rawX.memberForces.byMember.C1;
const scaledMember = scaledX.memberForces.byMember.C1;
assertArrayScaled(scaledMember.endForces, rawMember.endForces, scaleFactor, 'member end forces');
assertArrayScaled(scaledMember.Vy, rawMember.Vy, scaleFactor, 'member station shear array');
assertArrayScaled(scaledMember.Mz, rawMember.Mz, scaleFactor, 'member station moment array');
closeRatio(scaledMember.peaks.Vy, rawMember.peaks.Vy, scaleFactor, 'member peak shear');
closeRatio(scaledMember.stations[0].Mz, rawMember.stations[0].Mz, scaleFactor, 'member station moment');
assertScalingRecord(
  scaledMember.provenance.scaling,
  scaledMember.provenance.scaling.beforeValue,
  scaleFactor,
  'member result',
  false,
);
assert.deepEqual(
  scaled.rsa.modal[0].responses[0].displacementVector,
  raw.rsa.modal[0].responses[0].displacementVector,
  'raw modal contributors must remain unscaled diagnostics',
);

const rawAnalysis = { dynamics: raw };
const scaledAnalysis = { dynamics: scaled };
const rawDrift = buildStoryDriftTrace(rawModel, rawAnalysis).rows[0];
const scaledDrift = buildStoryDriftTrace(scaledModel, scaledAnalysis).rows[0];
const rawShear = buildStoryShearTrace(rawModel, rawAnalysis).rows[0];
const scaledShear = buildStoryShearTrace(scaledModel, scaledAnalysis).rows[0];
const rawOverturning = buildStoryOverturningTrace(rawModel, rawAnalysis).rows[0];
const scaledOverturning = buildStoryOverturningTrace(scaledModel, scaledAnalysis).rows[0];
closeRatio(scaledDrift.drift, rawDrift.drift, scaleFactor, 'story drift');
closeRatio(scaledShear.storyShear, rawShear.storyShear, scaleFactor, 'story shear');
closeRatio(scaledShear.storyTorsionMz, rawShear.storyTorsionMz, scaleFactor, 'story torsion');
closeRatio(scaledOverturning.overturning, rawOverturning.overturning, scaleFactor, 'story overturning');
assertScalingRecord(
  scaledShear.provenance.scaling.values.storyShearX,
  rawShear.storyShearX,
  scaleFactor,
  'story shear provenance',
);
assertScalingRecord(
  scaledShear.provenance.scaling.values.storyShear,
  rawShear.storyShear,
  scaleFactor,
  'derived story shear provenance',
);
assertScalingRecord(
  scaledShear.provenance.scaling.values.torsionMz,
  rawShear.torsionMz,
  scaleFactor,
  'story torsion alias provenance',
);
assertScalingRecord(
  scaledOverturning.provenance.scaling.values.overturning,
  rawOverturning.overturning,
  scaleFactor,
  'derived overturning provenance',
);
assertScalingRecord(
  scaledDrift.provenance.scaling.values.demandToLimit,
  rawDrift.demandToLimit,
  scaleFactor,
  'derived drift demand provenance',
);

const lateScaling = buildPhase6M4ResultTrace(rawModel, rawAnalysis, {
  directionMinima: { x: rawBaseShear * 3 },
});
assert.equal(lateScaling.rsa.baseShearScaling.rows[0].appliedScaleFactor, 1);
assert.equal(lateScaling.rsa.baseShearScaling.override.applied, false);
assert.equal(lateScaling.rsa.baseShearScaling.override.reason, 'RSA_SCALING_OVERRIDE_CONFLICT');
closeRatio(lateScaling.story.shear.rows[0].storyShear, rawShear.storyShear, 1, 'canonical no-op wins late override');
const conflictingScaling = buildPhase6M4ResultTrace(scaledModel, scaledAnalysis, {
  directionMinima: { x: rawBaseShear * 3 },
});
assert.equal(conflictingScaling.rsa.baseShearScaling.rows[0].appliedScaleFactor, 2);
assert.equal(conflictingScaling.rsa.baseShearScaling.override.applied, false);
assert.equal(conflictingScaling.rsa.baseShearScaling.override.reason, 'RSA_SCALING_OVERRIDE_CONFLICT');
closeRatio(conflictingScaling.story.shear.rows[0].storyShear, rawShear.storyShear, 2, 'canonical scaling wins conflict');

const disabledModel = structuredClone(scaledModel);
disabledModel.analysisCriteria = {
  preset: 'custom',
  criteria: { rsa: { applyBaseShearScaling: false } },
};
const disabled = analyzeDynamics(disabledModel);
const disabledRow = disabled.rsa.baseShearScaling.rows.find((row) => row.direction === 'x');
assert.equal(disabledRow.scaleFactor, scaleFactor);
assert.equal(disabledRow.appliedScaleFactor, 1);
assert.equal(disabledRow.application.enabled, false);
assertCombinedNumericallyEqual(disabled.rsa.combined.x, rawX, 1e-15);
const disabledShear = buildStoryShearTrace(disabledModel, { dynamics: disabled }).rows[0];
closeRatio(disabledShear.storyShear, rawShear.storyShear, 1, 'disabled story shear');
const disabledLateScaling = buildPhase6M4ResultTrace(disabledModel, { dynamics: disabled }, {
  directionMinima: { x: rawBaseShear * 3 },
});
assert.equal(disabledLateScaling.rsa.baseShearScaling.application.enabled, false);
assert.equal(disabledLateScaling.rsa.baseShearScaling.rows[0].appliedScaleFactor, 1);
assert.equal(disabledLateScaling.rsa.baseShearScaling.override.reason, 'RSA_SCALING_OVERRIDE_CONFLICT');
closeRatio(disabledLateScaling.story.shear.rows[0].storyShear, rawShear.storyShear, 1, 'disabled criterion wins late override');

const zeroResponseModel = structuredClone(rawModel);
zeroResponseModel.analysisSettings.responseSpectrum.points = [
  { period: 0, sa: 0 },
  { period: 10, sa: 0 },
];
zeroResponseModel.analysisSettings.rsa = { minimumBaseShear: { x: 1 } };
const zeroResponse = analyzeDynamics(zeroResponseModel);
assert.equal(zeroResponse.rsa.designBlocked, true);
assert.equal(zeroResponse.rsa.designTransferQualification.eligible, false);
assert.ok(zeroResponse.rsa.designBlockers.includes('ZERO_RSA_BASE_SHEAR_CANNOT_BE_SCALED_TO_POSITIVE_MINIMUM'));

const evidence = JSON.parse(await readFile(
  new URL('../verification/evidence/validation/phase10/p10-m0-quick-corrections.json', import.meta.url),
  'utf8',
));
assert.equal(evidence.milestone, 'P10-M0');
assert.equal(evidence.status, 'OK');
assert.ok(evidence.records.length >= 6);
const thetaModelHash = modelHash(thetaScreeningModel());
const rsaRawModelHash = modelHash(rawModel);
const evidenceExpected = {
  'P10-M0-THETA-BOUNDARY': {
    modelHash: thetaModelHash,
    computed: [0, 1, 1, 2, 2, 3],
    solverVersion: 'p10-m0-pdelta-design-summary-v1',
  },
  'P10-M0-LEGACY-STATUS': {
    modelHash: thetaModelHash,
    computed: [0, 1, 1, 1, 1, 2],
    solverVersion: 'p10-m0-pdelta-design-summary-v1',
  },
  'P10-M0-DESIGN-ELIGIBILITY': {
    modelHash: thetaModelHash,
    computed: [0, 0, 1, 0],
    solverVersion: 'p10-m0-pdelta-design-summary-v1',
  },
  'P10-M0-PDELTA-INTEGRATION': {
    modelHash: modelHash({ legacyRoutingModel, directNgModel, offRequireModel }),
    computed: [1, 0, 0],
    solverVersion: 'p10-m0-pdelta-design-summary-v1',
  },
  'P10-M0-PDELTA-BOUNDED-PARITY': {
    modelHash: modelHash(boundedModel),
    computed: boundedScreening.result.pDeltaDesignScreening.summary.maxTheta,
    solverVersion: 'p10-m0-bounded-pdelta-screening-v1',
  },
  'P10-M0-RSA-ALL-RESPONSES': {
    modelHash: modelHash(scaledModel),
    computed: [2, 2, 2, 2, 2],
    solverVersion: 'p10-m0-rsa-base-shear-scale-application-v1',
  },
  'P10-M0-RSA-ANALYTIC-BASELINE': {
    modelHash: rsaRawModelHash,
    computed: [rawX.baseShear, rawX.displacement],
    solverVersion: 'p10-m0-rsa-base-shear-scale-application-v1',
  },
  'P10-M0-RSA-NO-MINIMUM': {
    modelHash: rsaRawModelHash,
    computed: combinedMaxError(noMinimum.rsa.combined.x, rawX),
    solverVersion: 'p10-m0-rsa-base-shear-scale-application-v1',
  },
  'P10-M0-RSA-TOGGLE-OFF': {
    modelHash: modelHash(disabledModel),
    computed: [disabledRow.scaleFactor, disabledRow.appliedScaleFactor, 1],
    solverVersion: 'p10-m0-rsa-base-shear-scale-application-v1',
  },
};
for (const record of evidence.records) {
  for (const key of ['reference', 'computed', 'relError', 'tolerance', 'modelHash', 'solverVersion']) {
    assert.ok(Object.hasOwn(record, key), `${record.caseId}.${key}`);
  }
  assert.equal(record.status, 'OK');
  assert.ok(record.relError <= record.tolerance);
  const expected = evidenceExpected[record.caseId];
  assert.ok(expected, `unexpected evidence case ${record.caseId}`);
  assert.equal(record.modelHash, expected.modelHash, `${record.caseId}.modelHash`);
  assert.equal(record.solverVersion, expected.solverVersion, `${record.caseId}.solverVersion`);
  const computedComparison = compareFrozenEvidence(record, expected.computed);
  assert.equal(
    computedComparison.passed,
    true,
    `${record.caseId}.computed drift ${computedComparison.error} exceeds frozen tolerance ${record.tolerance}`,
  );
}
assert.deepEqual(evidence.records.map((record) => record.caseId).sort(), Object.keys(evidenceExpected).sort());
const boundedEvidenceRecord = evidence.records.find((record) => record.caseId === 'P10-M0-PDELTA-BOUNDED-PARITY');
const beyondTolerance = compareFrozenEvidence(
  boundedEvidenceRecord,
  boundedEvidenceRecord.computed + (2 * boundedEvidenceRecord.tolerance),
);
assert.equal(beyondTolerance.passed, false, 'bounded screening evidence must reject drift beyond its frozen tolerance');

console.log(JSON.stringify({
  ok: true,
  milestone: 'P10-M0',
  thetaCases: THETA_CASES.length,
  rawBaseShear,
  scaleFactor,
  scaledBaseShear: scaledX.baseShear,
  rawDisplacement: rawX.displacement,
  scaledDisplacement: scaledX.displacement,
  rawStoryShear: rawShear.storyShear,
  scaledStoryShear: scaledShear.storyShear,
  noMinimumMaxError: combinedMaxError(noMinimum.rsa.combined.x, rawX),
  boundedTheta: boundedScreening.result.pDeltaDesignScreening.summary.maxTheta,
}, null, 2));

function thetaSummary(theta, pDeltaMethod) {
  const model = thetaScreeningModel();
  const result = {
    ok: true,
    anyOk: true,
    disp: { B: [0, 0, 0], T: [theta, 0, 0] },
    memberResults: {
      C1: {
        N: [-10, -10],
        Nmax: -10,
        Vymax: 0,
        Vzmax: 0,
        Mymax: 0,
        Mzmax: 0,
        ax: { x: [0, 0, 1], y: [1, 0, 0], z: [0, 1, 0], L: 1 },
      },
    },
  };
  return buildPDeltaDesignSummary(
    model,
    [{ id: 'C', factors: { E: 1 } }],
    { C: { result, linear: result, converged: true, iterations: [] } },
    { pDeltaMethod },
  );
}

function thetaScreeningModel() {
  return {
    nodes: [
      { id: 'B', x: 0, y: 0, z: 0 },
      { id: 'T', x: 0, y: 0, z: 1 },
    ],
    members: [{ id: 'C1', n1: 'B', n2: 'T' }],
    loads: [{ id: 'EX', type: 'nodal', node: 'T', case: 'E', P: 10, direction: [1, 0, 0] }],
  };
}

function singleColumnModel() {
  const length = 4;
  return {
    units: { length: 'm', force: 'kN', moment: 'kN.m' },
    materials: [{ id: 'TEST', name: 'Test', E: 200000, G: 77000, density: 0 }],
    sections: [{ id: 'FRAME', name: 'Frame', A: 0.01, Iy: 5e-6, Iz: 8e-6, J: 1e-6 }],
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 0, y: 0, z: length, mass: [10, 0, 0] },
    ],
    members: [{
      id: 'C1',
      type: 'frame',
      n1: 'N0',
      n2: 'N1',
      matId: 'TEST',
      secId: 'FRAME',
      releases: { i: 'rigid', j: 'rigid' },
    }],
    diaphragms: [],
    analysisSettings: {
      modalModeCount: 1,
      memberStations: 21,
      responseSpectrum: {
        enabled: true,
        method: 'SRSS',
        directions: ['x'],
        dampingRatio: 0.05,
        scale: 1,
        points: [{ period: 0, sa: 1 }, { period: 10, sa: 1 }],
      },
    },
  };
}

function routingModel() {
  return {
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N2', x: 0, y: 0, z: 3 },
    ],
    members: [{ id: 'M1', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300', releases: { i: 'rigid', j: 'rigid' } }],
    loads: [
      { id: 'P', type: 'nodal', node: 'N2', P: 200, dir: '-z', case: 'D' },
      { id: 'H', type: 'nodal', node: 'N2', P: 10, dir: '+x', case: 'W' },
    ],
    loadCases: [
      { id: 'D', name: 'Dead', type: 'dead' },
      { id: 'W', name: 'Wind', type: 'wind' },
    ],
    loadCombinations: [
      { id: 'C1', name: 'D + W', factors: { D: 1, W: 1 } },
      { id: 'C2', name: 'D + 2W', factors: { D: 1, W: 2 } },
    ],
    analysisSettings: {
      responseSpectrum: { enabled: false },
      validateBeforeSolve: false,
      pDeltaCurveSteps: 1,
    },
  };
}

function boundedScreeningModel() {
  const model = routingModel();
  model.nodes[1].z = 4;
  model.loads[0].P = 80;
  model.loads[1].P = 20;
  model.loadCombinations = [model.loadCombinations[0]];
  model.analysisSettings.pDeltaMethod = 'off';
  model.analysisCriteria = thetaCriteria(0.01, 0.02, 0.2);
  return model;
}

function thetaCriteria(thetaCaution, thetaRequire, thetaStrong) {
  return {
    preset: 'custom',
    criteria: {
      pdelta: { thetaCaution, thetaRequire, thetaStrong },
    },
  };
}

function noOpContext() {
  return {
    signal: { aborted: false },
    throwIfCancelled() {},
    reportProgress() {},
    commitBoundary() {},
    yieldControl() { return Promise.resolve(); },
  };
}

function assertVectorRowScaled(actual, expected, factor, label) {
  assertArrayScaled(actual.vector, expected.vector, factor, `${label}.vector`);
  for (const key of ['x', 'y', 'z']) closeRatio(actual[key], expected[key], factor, `${label}.${key}`);
  assertScalingRecord(actual.provenance.scaling, actual.provenance.scaling.beforeValue, factor, `${label}.provenance`, false);
}

function assertArrayScaled(actual, expected, factor, label) {
  assert.equal(actual.length, expected.length, `${label}.length`);
  for (let index = 0; index < actual.length; index += 1) {
    closeRatio(actual[index], expected[index], factor, `${label}[${index}]`);
  }
}

function assertScalingRecord(record, beforeValue, factor, label, compareBefore = true) {
  assert.equal(record.scaled, factor !== 1, `${label}.scaled`);
  assert.equal(record.scaleFactor, factor, `${label}.scaleFactor`);
  assert.ok(Object.hasOwn(record, 'beforeValue'), `${label}.beforeValue`);
  if (compareBefore) assert.deepEqual(record.beforeValue, beforeValue, `${label}.beforeValue value`);
}

function closeRatio(actual, before, factor, label) {
  const expected = before * factor;
  const error = Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
  assert.ok(error < 1e-12, `${label}: expected ${expected}, got ${actual}, relError=${error}`);
}

// Phase 10 milestone evidence defines scalar error as absolute difference and
// array error as relative L2 norm. Frozen cross-build values use that approved
// tolerance; same-build determinism is asserted independently above.
function compareFrozenEvidence(record, currentComputed) {
  if (!sameNumericShape(record.computed, currentComputed)) {
    return { passed: false, error: Number.POSITIVE_INFINITY };
  }
  const error = standardEvidenceError(currentComputed, record.computed);
  return {
    passed: Number.isFinite(error) && error <= record.tolerance,
    error,
  };
}

function standardEvidenceError(computed, reference) {
  if (typeof computed === 'number' && typeof reference === 'number') {
    return Math.abs(computed - reference);
  }
  const actual = numericLeaves(computed);
  const expected = numericLeaves(reference);
  let differenceSquared = 0;
  let referenceSquared = 0;
  for (let index = 0; index < actual.length; index += 1) {
    differenceSquared += (actual[index] - expected[index]) ** 2;
    referenceSquared += expected[index] ** 2;
  }
  return Math.sqrt(differenceSquared) / Math.max(1e-12, Math.sqrt(referenceSquared));
}

function sameNumericShape(actual, expected) {
  if (typeof actual === 'number' || typeof expected === 'number') {
    return Number.isFinite(actual) && Number.isFinite(expected);
  }
  return Array.isArray(actual)
    && Array.isArray(expected)
    && actual.length === expected.length
    && actual.every((value, index) => sameNumericShape(value, expected[index]));
}

function numericLeaves(value) {
  return typeof value === 'number' ? [value] : value.flatMap(numericLeaves);
}

function assertCombinedNumericallyEqual(actual, expected, tolerance) {
  const error = combinedMaxError(actual, expected);
  assert.ok(error < tolerance, `no-minimum RSA response changed: ${error}`);
}

function combinedMaxError(actual, expected) {
  const pairs = [];
  for (const key of [
    'displacement',
    'combinedDisplacement',
    'maxModalDisplacement',
    'srssDisplacement',
    'cqcDisplacement',
    'baseShear',
    'rsaBaseShear',
    'srssBaseShear',
    'cqcBaseShear',
  ]) pairs.push([actual[key], expected[key]]);
  for (const key of ['displacementVector', 'inertiaForceVector']) {
    for (let index = 0; index < expected[key].length; index += 1) pairs.push([actual[key][index], expected[key][index]]);
  }
  for (let index = 0; index < expected.nodalDisplacements.length; index += 1) {
    for (let component = 0; component < 3; component += 1) {
      pairs.push([actual.nodalDisplacements[index].vector[component], expected.nodalDisplacements[index].vector[component]]);
      pairs.push([actual.nodalInertiaForces[index].vector[component], expected.nodalInertiaForces[index].vector[component]]);
    }
  }
  const actualMember = actual.memberForces.byMember.C1;
  const expectedMember = expected.memberForces.byMember.C1;
  for (let index = 0; index < expectedMember.endForces.length; index += 1) {
    pairs.push([actualMember.endForces[index], expectedMember.endForces[index]]);
  }
  return Math.max(0, ...pairs.map(([a, b]) => Math.abs(a - b)));
}
