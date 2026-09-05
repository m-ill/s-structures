import assert from 'node:assert/strict';
import {
  estimateGlobalBucklingTrace,
  solveGeneralizedBucklingModes,
} from '../src/dynamics/globalBuckling.js';
import {
  buildCqcCombinationReport,
  estimateMemberEulerBuckling,
  runLinearSdofTha,
  runModalSuperpositionTha,
} from '../src/dynamics/elasticCompleteness.js';
import { runAnalysisCase } from '../src/ui/analysisRunners.js';
import { analyzeModel } from '../src/solver/linear3d.js';

const scalarEigen = solveGeneralizedBucklingModes([[4]], [[2]], { modeCount: 1 });
assert.equal(scalarEigen.ok, true);
close(scalarEigen.modes[0].loadFactor, 2, 1e-12, 'scalar generalized eigenvalue');
assert.ok(scalarEigen.modes[0].residual <= 1e-12);

const euler = estimateMemberEulerBuckling({ id: 'C1' }, {
  L: 3,
  effectiveLengthFactor: 1,
  material: { E: 205000000 },
  section: { Iy: 508e-8, Iz: 2130e-8 },
});
const eulerReference = Math.PI ** 2 * 205000000 * 508e-8 / 3 ** 2;
close(euler.pcr, eulerReference, 1e-10, 'member Euler Pcr');
assert.equal(euler.status, 'available-preliminary');

const model = createPinnedColumnModel();
const memberResults = Object.fromEntries(model.members.map((member) => [member.id, { N: [-1, -1] }]));
const buckling = estimateGlobalBucklingTrace(model, {
  modeCount: 3,
  preloadCombinationId: 'PRELOAD',
  preloadResult: qualifiedPreload(memberResults),
});
assert.equal(buckling.status, 'available', buckling.reason || JSON.stringify(buckling.guidance));
assert.equal(buckling.preload.source, 'preload-result');
assert.equal(buckling.preload.combinationId, 'PRELOAD');
assert.equal(buckling.preload.resultVersion, 'linear-static-result-v1');
assert.equal(buckling.modes.length, 3);
assert.ok(Math.abs(buckling.criticalLoadFactor - eulerReference) / eulerReference < 0.02);
assert.ok(buckling.modes.every((mode) => mode.residual <= buckling.residualTolerance));
assert.ok(buckling.modes.every((mode) => Math.abs(Math.max(...mode.modeShape.map(Math.abs)) - 1) <= 1e-12));
assert.ok(buckling.modes.every((mode, index) => index === 0 || mode.loadFactor >= buckling.modes[index - 1].loadFactor));

const missingPreload = estimateGlobalBucklingTrace(model, { modeCount: 1 });
assert.equal(missingPreload.status, 'blocked');
assert.equal(missingPreload.reasonCode, 'PRELOAD_REQUIRED');
assert.match(missingPreload.reason, /^PRELOAD_REQUIRED:/);
assert.equal(missingPreload.guidance.code, 'SELECT_OR_RUN_PRELOAD_COMBINATION');

const ambiguousPreload = estimateGlobalBucklingTrace(model, {
  modeCount: 1,
  preloadResult: {
    status: 'ok',
    byCombo: {
      P1: { ok: true, memberResults },
      P2: { ok: true, memberResults },
    },
  },
});
assert.equal(ambiguousPreload.status, 'blocked');
assert.equal(ambiguousPreload.reason, 'PRELOAD_COMBINATION_REQUIRED');
assert.deepEqual(ambiguousPreload.preload.availableCombinationIds, ['P1', 'P2']);

const partialPreload = estimateGlobalBucklingTrace(model, {
  modeCount: 1,
  referenceAxialForces: { C1: 1 },
});
assert.equal(partialPreload.status, 'blocked');
assert.equal(partialPreload.reasonCode, 'PRELOAD_QUALIFICATION_REQUIRED');
assert.equal(partialPreload.preload.qualification.ok, false);

const partialResultPreload = estimateGlobalBucklingTrace(model, {
  modeCount: 1,
  preloadCombinationId: 'PRELOAD',
  preloadResult: qualifiedPreload({ C1: { N: [-1, -1] } }),
});
assert.equal(partialResultPreload.status, 'blocked');
assert.equal(partialResultPreload.reasonCode, 'PRELOAD_MEMBER_FORCE_MAP_INCOMPLETE');

const missingQualification = estimateGlobalBucklingTrace(model, {
  modeCount: 1,
  preloadCombinationId: 'PRELOAD',
  preloadResult: { ok: true, byCombo: { PRELOAD: { ok: true, memberResults } } },
});
assert.equal(missingQualification.status, 'blocked');
assert.equal(missingQualification.reasonCode, 'PRELOAD_RESULT_NOT_QUALIFIED');
assert.ok(missingQualification.preload.qualification.failures.includes('equilibrium'));
assert.ok(missingQualification.preload.qualification.failures.includes('audit'));

const failedEquilibriumPreload = qualifiedPreload(memberResults);
failedEquilibriumPreload.byCombo.PRELOAD.summary.equilibriumStatus = 'FAIL';
failedEquilibriumPreload.byCombo.PRELOAD.summary.equilibriumOk = false;
failedEquilibriumPreload.byCombo.PRELOAD.summary.designBlocked = true;
const failedEquilibriumBuckling = estimateGlobalBucklingTrace(model, {
  modeCount: 1,
  preloadCombinationId: 'PRELOAD',
  preloadResult: failedEquilibriumPreload,
});
assert.equal(failedEquilibriumBuckling.status, 'blocked');
assert.equal(failedEquilibriumBuckling.reasonCode, 'PRELOAD_RESULT_NOT_QUALIFIED');
assert.ok(failedEquilibriumBuckling.preload.qualification.failures.includes('equilibrium'));

const diaphragmBlocked = estimateGlobalBucklingTrace({
  ...model,
  diaphragms: [{ id: 'D1', type: 'rigid', nodeIds: ['N1', 'N2'] }],
}, {
  modeCount: 1,
  referenceAxialForces: Object.fromEntries(model.members.map((member) => [member.id, 1])),
});
assert.equal(diaphragmBlocked.status, 'blocked');
assert.equal(diaphragmBlocked.reasonCode, 'BUCKLING_RIGID_DIAPHRAGM_UNSUPPORTED');
assert.equal(diaphragmBlocked.domain.type, 'unavailable-rigid-diaphragm-domain');

const releasedModel = {
  ...model,
  members: model.members.map((member, index) => ({
    ...member,
    releases: {
      i: index === 0 ? 'pin' : 'rigid',
      j: index === model.members.length - 1 ? 'pin' : 'rigid',
    },
  })),
};
const releasedBuckling = estimateGlobalBucklingTrace(releasedModel, {
  modeCount: 1,
  preloadCombinationId: 'PRELOAD',
  preloadResult: qualifiedPreload(Object.fromEntries(releasedModel.members.map((member) => [member.id, { N: [-1, -1] }]))),
});
assert.equal(releasedBuckling.status, 'available', releasedBuckling.reason || JSON.stringify(releasedBuckling.guidance));
assert.equal(releasedBuckling.domain.elasticMatrixSize, releasedBuckling.domain.geometricMatrixSize);
assert.equal(releasedBuckling.domain.releaseCompatibility.ok, true);
assert.equal(releasedBuckling.domain.releaseCompatibility.releasedMemberCount, 2);
assert.ok(Math.abs(releasedBuckling.criticalLoadFactor - eulerReference) / eulerReference < 0.02);

const internalMechanismModel = {
  ...model,
  members: model.members.map((member) => ({
    ...member,
    releases: member.id === 'C4' ? { i: 'rigid', j: 'pin' } : { i: 'rigid', j: 'rigid' },
  })),
};
const internalMechanismBuckling = estimateGlobalBucklingTrace(internalMechanismModel, {
  modeCount: 1,
  preloadCombinationId: 'PRELOAD',
  preloadResult: qualifiedPreload(memberResults),
});
assert.equal(internalMechanismBuckling.status, 'blocked');
assert.equal(internalMechanismBuckling.reasonCode, 'SINGULAR_STIFFNESS');

// A pin-pin column plus an internal bending pin is a physical three-hinge
// mechanism. Fix one end for the release-compatibility positive fixture while
// retaining the mechanism case above as a strict fail-closed regression.
const internalReleasedModel = {
  ...internalMechanismModel,
  nodes: internalMechanismModel.nodes.map((node) => (
    node.id === 'N0' ? { ...node, support: 'fixed' } : node
  )),
};
const internalReleasedBuckling = estimateGlobalBucklingTrace(internalReleasedModel, {
  modeCount: 1,
  preloadCombinationId: 'PRELOAD',
  preloadResult: qualifiedPreload(memberResults),
});
assert.equal(internalReleasedBuckling.status, 'available', internalReleasedBuckling.reason || JSON.stringify(internalReleasedBuckling.guidance));
assert.equal(internalReleasedBuckling.domain.releaseCompatibility.releasedMemberCount, 1);
assert.equal(internalReleasedBuckling.domain.releaseCompatibility.method, 'elastic-release-kinematics-applied-to-ke-and-kg');

const customCatalogModel = createCustomCatalogColumnModel();
const customCatalogBuckling = estimateGlobalBucklingTrace(customCatalogModel, {
  modeCount: 1,
  preloadCombinationId: 'PRELOAD',
  preloadResult: qualifiedPreload(memberResults),
});
assert.equal(customCatalogBuckling.status, 'available', customCatalogBuckling.reason || JSON.stringify(customCatalogBuckling.guidance));
assert.ok(Math.abs(customCatalogBuckling.criticalLoadFactor - eulerReference) / eulerReference < 0.02);

const integratedPreloadModel = createIntegratedPreloadModel();
const integratedStaticResult = analyzeModel(integratedPreloadModel);
const integratedBuckling = estimateGlobalBucklingTrace(integratedPreloadModel, {
  modeCount: 1,
  preloadCombinationId: 'PRELOAD',
  preloadResult: integratedStaticResult,
});
assert.equal(integratedStaticResult.ok, true);
assert.equal(integratedBuckling.status, 'available', integratedBuckling.reason || JSON.stringify(integratedBuckling.guidance));
assert.equal(integratedBuckling.preload.qualification.ok, true);
assert.ok(Object.values(integratedBuckling.preload.qualification.checks).every(Boolean));

const invalidCatalogModel = {
  ...customCatalogModel,
  members: customCatalogModel.members.map((member) => ({ ...member, secId: 'missing-section@1' })),
};
const invalidCatalogBuckling = estimateGlobalBucklingTrace(invalidCatalogModel, {
  modeCount: 1,
  preloadCombinationId: 'PRELOAD',
  preloadResult: qualifiedPreload(memberResults),
});
assert.equal(invalidCatalogBuckling.status, 'blocked');
assert.equal(invalidCatalogBuckling.reasonCode, 'BUCKLING_ASSEMBLY_REFERENCE_INVALID');
assert.equal(invalidCatalogBuckling.domain.invalidReference.kind, 'section');

const unsupportedDomains = [
  [{ loads: [{ id: 'FL1', type: 'follower' }] }, 'BUCKLING_FOLLOWER_LOAD_UNSUPPORTED'],
  [{ constructionStages: [{ id: 'ST1' }] }, 'BUCKLING_CONSTRUCTION_SEQUENCE_UNSUPPORTED'],
  [{ analysisSettings: { materialNonlinearity: true } }, 'BUCKLING_MATERIAL_NONLINEARITY_UNSUPPORTED'],
  [{ shells: [{ id: 'SH1' }] }, 'BUCKLING_SHELL_DOMAIN_UNSUPPORTED'],
  [{ slabs: [{ id: 'SL1', type: 'shell' }] }, 'BUCKLING_SHELL_DOMAIN_UNSUPPORTED'],
  [{ walls: [{ id: 'W1' }] }, 'BUCKLING_WALL_DOMAIN_UNSUPPORTED'],
  [{ wallEquivalents: [{ id: 'WE1' }] }, 'BUCKLING_WALL_DOMAIN_UNSUPPORTED'],
  [{ diaphragms: [{ id: 'SD1', type: 'semiRigid' }] }, 'BUCKLING_SEMI_RIGID_DIAPHRAGM_UNSUPPORTED'],
];
for (const [extension, reason] of unsupportedDomains) {
  const trace = estimateGlobalBucklingTrace({ ...model, ...extension }, { modeCount: 1 });
  assert.equal(trace.status, 'blocked');
  assert.equal(trace.reasonCode, reason);
}
const unilateralDomain = estimateGlobalBucklingTrace({
  ...model,
  members: model.members.map((member, index) => ({ ...member, behavior: index === 0 ? 'compressionOnly' : 'frame' })),
}, { modeCount: 1 });
assert.equal(unilateralDomain.reasonCode, 'BUCKLING_UNILATERAL_MEMBER_UNSUPPORTED');
const generatedEquivalentDomain = estimateGlobalBucklingTrace({
  ...model,
  members: model.members.map((member, index) => (index === 0
    ? { ...member, generated: true, source: 'semiRigidDiaphragm' }
    : member)),
}, { modeCount: 1 });
assert.equal(generatedEquivalentDomain.reasonCode, 'BUCKLING_GENERATED_EQUIVALENT_MEMBER_UNSUPPORTED');

const tensileResults = Object.fromEntries(model.members.map((member) => [member.id, { N: [1, 1] }]));
const tensileOnly = estimateGlobalBucklingTrace(model, {
  modeCount: 1,
  preloadCombinationId: 'PRELOAD',
  preloadResult: qualifiedPreload(tensileResults),
});
assert.equal(tensileOnly.status, 'not-applicable');
assert.equal(tensileOnly.reason, 'NO_COMPRESSIVE_PRELOAD');

const zeroDampingCqc = buildCqcCombinationReport([
  { mode: 1, period: 1, displacement: 3 },
  { mode: 2, period: 2, displacement: 4 },
], 0);
close(zeroDampingCqc.cqc, 5, 1e-12, 'zero-damping CQC');
close(zeroDampingCqc.srss, 5, 1e-12, 'zero-damping SRSS');

const gravityUnitTha = runLinearSdofTha({
  period: 1,
  dt: 0.1,
  accelerations: [1],
  accelerationUnit: 'g',
  displacementUnit: 'm',
  accelerationScale: 2,
  recordId: 'GM-G',
});
close(gravityUnitTha.rows[0].groundAcceleration, 2 * 9.80665, 1e-12, 'g acceleration conversion');
assert.equal(gravityUnitTha.units.groundAcceleration, 'm/s^2');
assert.equal(gravityUnitTha.record.sourceAccelerationUnit, 'g');
assert.equal(gravityUnitTha.record.accelerationUnitConversionFactor, 9.80665);
assert.equal(gravityUnitTha.record.totalAccelerationScale, 2 * 9.80665);
assert.equal(gravityUnitTha.provenance.qualification.status, 'preliminary');
assert.equal(gravityUnitTha.provenance.qualification.designBlocked, true);

const modelUnitTha = runLinearSdofTha({
  period: 1,
  dt: 0.1,
  accelerations: [2],
  accelerationUnit: 'model',
  displacementUnit: 'mm',
});
assert.equal(modelUnitTha.rows[0].groundAcceleration, 2);
assert.equal(modelUnitTha.units.groundAcceleration, 'mm/s^2');

const runnerModel = createRunnerColumnModel();
const runnerTha = runAnalysisCase(runnerModel, {
  id: 'THA-RUNNER',
  kind: 'linearTha',
  settings: {
    modalModeCount: 1,
    direction: 'x',
    dt: 0.1,
    accelerations: [0, 0.1, 0],
    accelerationUnit: 'g',
    recordId: 'GM-RUNNER',
  },
});
assert.equal(runnerTha.status, 'preliminary');
assert.equal(runnerTha.qualification, 'preliminary');
assert.equal(runnerTha.designBlocked, true);
assert.equal(runnerTha.summary.status, 'preliminary');
assert.equal(runnerTha.summary.designBlocked, true);
assert.equal(runnerTha.payload.units.groundAcceleration, 'm/s^2');
assert.equal(runnerTha.payload.record.id, 'GM-RUNNER');
assert.equal(runnerTha.payload.record.sourceAccelerationUnit, 'g');
assert.equal(runnerTha.payload.record.accelerationUnitConversionFactor, 9.80665);
close(runnerTha.payload.modal[0].trace.rows[1].groundAcceleration, 0.980665, 1e-12, 'runner g conversion');
assert.equal(runnerTha.provenance.qualification.status, 'preliminary');
assert.equal(runnerTha.provenance.qualification.designBlocked, true);

const initialDisplacement = 0.25;
const initialVelocity = -0.5;
const period = 1;
const omega = 2 * Math.PI / period;
const newmark = runLinearSdofTha({
  period,
  dampingRatio: 0,
  dt: 0.1,
  accelerations: [0, 1, 0],
  initialDisplacement,
  initialVelocity,
  timeUnit: 's',
  accelerationUnit: 'm/s^2',
  displacementUnit: 'm',
  recordId: 'GM-01',
});
assert.equal(newmark.status, 'preliminary');
assert.equal(newmark.designBlocked, true);
assert.equal(newmark.designTransfer.allowed, false);
assert.equal(newmark.rows.length, 3);
assert.equal(newmark.rows[0].step, 0);
assert.equal(newmark.rows[0].time, 0);
assert.equal(newmark.rows[0].displacement, initialDisplacement);
assert.equal(newmark.rows[0].velocity, initialVelocity);
close(newmark.rows[0].acceleration, -(omega ** 2) * initialDisplacement, 1e-12, 'initial equilibrium acceleration');
assert.equal(newmark.rows[1].time, 0.1);
assert.equal(newmark.time.firstSampleIsInitialState, true);
assert.equal(newmark.time.endTime, 0.2);
assert.equal(newmark.units.groundAcceleration, 'm/s^2');
assert.equal(newmark.record.id, 'GM-01');

const nonzeroFirstRecord = runLinearSdofTha({ period: 1, dt: 0.1, accelerations: [1, 0] });
assert.equal(nonzeroFirstRecord.rows[0].displacement, 0);
assert.equal(nonzeroFirstRecord.rows[0].velocity, 0);
assert.equal(nonzeroFirstRecord.rows[0].acceleration, -1);

const modalTha = runModalSuperpositionTha({
  modes: [{ id: 'M1', period: 1, gamma: 1 }],
  dt: 0.1,
  accelerations: [0, 1, 0],
});
assert.equal(modalTha.status, 'preliminary');
assert.equal(modalTha.designBlocked, true);
assert.equal(modalTha.review.status, 'available');
assert.equal(modalTha.review.resultStatus, 'preliminary');
assert.equal(modalTha.rows[0].time, 0);
assert.equal(modalTha.rows[0].displacement, 0);

console.log(JSON.stringify({
  ok: true,
  eulerRelativeError: Math.abs(buckling.criticalLoadFactor - eulerReference) / eulerReference,
  modeResiduals: buckling.modes.map((mode) => mode.residual),
  newmarkInitialState: newmark.rows[0],
  thaStatus: newmark.status,
  designBlocked: newmark.designBlocked,
  zeroDampingCqc: zeroDampingCqc.cqc,
  gTotalScale: gravityUnitTha.record.totalAccelerationScale,
}, null, 2));

function createPinnedColumnModel() {
  const nodes = Array.from({ length: 9 }, (_item, index) => ({
    id: `N${index}`,
    x: 0,
    y: 0,
    z: (3 * index) / 8,
    support: index === 0 || index === 8 ? 'pin' : undefined,
  }));
  const members = Array.from({ length: 8 }, (_item, index) => ({
    id: `C${index + 1}`,
    n1: `N${index}`,
    n2: `N${index + 1}`,
    matId: 'steel',
    secId: 'h300',
  }));
  return { nodes, members };
}

function createRunnerColumnModel() {
  return {
    unitSystem: { internal: { length: 'm' } },
    nodes: [
      { id: 'R0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'R1', x: 0, y: 0, z: 3, mass: [2, 2, 2] },
    ],
    members: [{ id: 'RM1', n1: 'R0', n2: 'R1', matId: 'steel', secId: 'h300' }],
    diaphragms: [],
  };
}

function qualifiedPreload(qualifiedMemberResults) {
  const result = {
    ok: true,
    anyOk: true,
    combo: { id: 'PRELOAD' },
    memberResults: qualifiedMemberResults,
    failedComponents: [],
    unstableMembers: new Set(),
    summary: {
      equilibriumStatus: 'PASS',
      equilibriumOk: true,
      designBlocked: false,
    },
  };
  return {
    ok: true,
    version: 'linear-static-result-v1',
    analysisEligibility: { eligible: true, status: 'qualified', reason: null },
    combinationCompleteness: {
      allComplete: true,
      rows: [{ comboId: 'PRELOAD', complete: true, status: 'complete', reasons: [] }],
    },
    audit: {
      ok: true,
      status: 'PASS',
      designBlocked: false,
      rows: [{
        comboId: 'PRELOAD',
        ok: true,
        equilibriumStatus: 'PASS',
        designBlocked: false,
      }],
    },
    byCombo: { PRELOAD: result },
  };
}

function createCustomCatalogColumnModel() {
  const base = createPinnedColumnModel();
  return {
    ...base,
    materials: [{
      id: 'CUSTOM-STEEL',
      version: 1,
      kind: 'custom',
      elastic: { E: 205000, G: 79000, rho: 7850 },
      source: { scope: 'project', note: 'P7-M10 custom elastic benchmark material' },
    }],
    sections: [{
      id: 'CUSTOM-H300',
      version: 1,
      kind: 'direct',
      shape: 'GENERAL',
      properties: {
        A: 46.78e-4,
        Iy: 508e-8,
        Iz: 7210e-8,
        J: 9e-8,
        provenance: { source: 'P7-M10 benchmark' },
      },
      source: { scope: 'project' },
    }],
    members: base.members.map((member) => ({
      ...member,
      matId: 'CUSTOM-STEEL@1',
      secId: 'CUSTOM-H300@1',
    })),
  };
}

function createIntegratedPreloadModel() {
  return {
    nodes: [
      { id: 'I0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'I1', x: 0, y: 0, z: 3 },
    ],
    members: [{ id: 'IM1', n1: 'I0', n2: 'I1', matId: 'steel', secId: 'h300' }],
    loads: [{ id: 'IP', type: 'nodal', node: 'I1', case: 'D', P: -1, dir: '+z' }],
    loadCombinations: [{ id: 'PRELOAD', factors: { D: 1 } }],
    analysisSettings: { responseSpectrum: { enabled: false } },
  };
}

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`,
  );
}
