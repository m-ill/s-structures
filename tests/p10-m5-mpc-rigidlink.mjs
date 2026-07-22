import assert from 'node:assert/strict';
import { analyzeDynamics, analyzeModel, createCantileverTipLoad, createModel, validateModel } from '../src/index.js';
import { runSecondOrderPDelta } from '../src/solver/pdelta/secondOrder.js';
import { estimateGlobalBucklingTrace } from '../src/dynamics/globalBuckling.js';
import { GENERAL_CONSTRAINT_VERSION } from '../src/core/constraintDefinitions.js';
import { stableHash } from '../src/core/stableHash.js';

const tolerance = 1e-10;

const linked = createCantileverTipLoad().model;
linked.nodes.push({ id: 'S', x: 4, y: 1, z: 0 });
linked.constraints = [{ id: 'RL1', type: 'rigidLink', master: { node: 'N2' }, slave: { node: 'S' } }];
linked.loads[0].node = 'S';
const linkedResult = analyzeModel(linked);
assert.equal(linkedResult.ok, true, JSON.stringify(linkedResult.validation?.errors));

const equivalent = createCantileverTipLoad().model;
equivalent.loads.push({ id: 'M1', type: 'nmoment', node: 'N2', M: -12, axis: 'x', case: 'D' });
const equivalentResult = analyzeModel(equivalent);
assert.equal(equivalentResult.ok, true);
const linkedCombo = linkedResult.byCombo.D_ONLY;
const equivalentCombo = equivalentResult.byCombo.D_ONLY;
const rigidLinkError = maxRelativeError([
  [linkedCombo.disp.N2, equivalentCombo.disp.N2],
  [Object.values(linkedCombo.reactions.N1), Object.values(equivalentCombo.reactions.N1)],
  [linkedCombo.memberResults.M1.end, equivalentCombo.memberResults.M1.end],
]);
assert.ok(rigidLinkError < tolerance, `CN-M01 rigid-link error ${rigidLinkError}`);
assert.equal(linkedCombo.solver.generalConstraintCount, 1);
assert.equal(linkedCombo.solver.generalConstraintEquationCount, 6);
const direct = runSecondOrderPDelta(linked, { D: 1 }, { loadSteps: 2 });
assert.equal(direct.ok, true, direct.reason);
assert.ok(direct.result.solver.forceResidualNorm < tolerance);
assert.ok(direct.result.recovery.elementNodeClosure.forceResidualNorm < tolerance);

const mpc = createCantileverTipLoad().model;
mpc.nodes.push({ id: 'S', x: 4, y: 0, z: 0 });
mpc.constraints = [{
  id: 'MPC1',
  type: 'mpc',
  slave: { node: 'S', dof: 'uz' },
  terms: [{ node: 'N2', dof: 'uz', c: 1 }],
  d: 0,
}];
mpc.loads[0].node = 'S';
const mpcResult = analyzeModel(mpc);
assert.equal(mpcResult.ok, true);
const mpcCombo = mpcResult.byCombo.D_ONLY;
assert.ok(Math.abs(mpcCombo.disp.S[2] - mpcCombo.disp.N2[2]) < tolerance);
assert.ok(mpcCombo.summary.equilibriumResidual < tolerance, `CN-M02 equilibrium ${mpcCombo.summary.equilibriumResidual}`);

const diaphragmModel = createCantileverTipLoad().model;
diaphragmModel.nodes.push({ id: 'N3', x: 4, y: 1, z: 0 });
diaphragmModel.diaphragms = [{ id: 'D1', type: 'rigid', nodeIds: ['N2', 'N3'] }];
const withEmptyConstraints = analyzeModel({ ...structuredClone(diaphragmModel), constraints: [] });
const withOmittedConstraints = analyzeModel(Object.fromEntries(
  Object.entries(structuredClone(diaphragmModel)).filter(([key]) => key !== 'constraints'),
));
assert.equal(withEmptyConstraints.ok, true);
assert.equal(withOmittedConstraints.ok, true);
const diaphragmError = maxRelativeError([
  [withEmptyConstraints.byCombo.D_ONLY.disp.N2, withOmittedConstraints.byCombo.D_ONLY.disp.N2],
  [withEmptyConstraints.byCombo.D_ONLY.disp.N3, withOmittedConstraints.byCombo.D_ONLY.disp.N3],
]);
assert.ok(diaphragmError < tolerance, `CN-M03 diaphragm regression ${diaphragmError}`);

const modalBase = modalColumn(15);
const modalLinked = modalColumn(10);
modalLinked.nodes.push({ id: 'S', x: 0, y: 0, z: 4, mass: [5, 5, 5] });
modalLinked.constraints = [{ id: 'MRL', type: 'rigidLink', master: { node: 'N2' }, slave: { node: 'S' } }];
const baseModes = analyzeDynamics(modalBase);
const linkedModes = analyzeDynamics(modalLinked);
assert.equal(baseModes.ok, true);
assert.equal(linkedModes.ok, true);
const modalError = maxRelativeError([[linkedModes.modes.map((row) => row.period), baseModes.modes.map((row) => row.period)]]);
assert.ok(modalError < tolerance, `modal K/M transform error ${modalError}`);
assert.equal(linkedModes.diaphragmAssembly.generalConstraintEquationCount, 6);

const bucklingBaseModel = modalColumn(0);
const bucklingLinkedModel = structuredClone(bucklingBaseModel);
bucklingLinkedModel.nodes.push({ id: 'S', x: 0, y: 0, z: 4 });
bucklingLinkedModel.constraints = [{ id: 'BRL', type: 'rigidLink', master: { node: 'N2' }, slave: { node: 'S' } }];
const bucklingOptions = {
  modeCount: 1,
  preloadCombinationId: 'PRELOAD',
  preloadResult: qualifiedBucklingPreload({ M1: { N: [-1, -1] } }),
};
const bucklingBase = estimateGlobalBucklingTrace(bucklingBaseModel, bucklingOptions);
const bucklingLinked = estimateGlobalBucklingTrace(bucklingLinkedModel, bucklingOptions);
assert.equal(bucklingBase.ok, true, bucklingBase.reason);
assert.equal(bucklingLinked.ok, true, bucklingLinked.reason);
assert.ok(
  Math.abs(bucklingLinked.criticalLoadFactor - bucklingBase.criticalLoadFactor)
    / Math.max(1, Math.abs(bucklingBase.criticalLoadFactor)) < tolerance,
  'buckling K/KG constraint transform must preserve the equivalent column eigenvalue',
);
assert.equal(bucklingLinked.domain.constraintTransformation.generalConstraintEquationCount, 6);

assertConstraintCode('CONSTRAINT_SLAVE_REDEFINED', [
  mpc.constraints[0],
  { ...structuredClone(mpc.constraints[0]), id: 'MPC2' },
]);
assertConstraintCode('CONSTRAINT_CYCLE', [
  { id: 'A', type: 'mpc', slave: { node: 'N2', dof: 'ux' }, terms: [{ node: 'S', dof: 'ux', c: 1 }] },
  { id: 'B', type: 'mpc', slave: { node: 'S', dof: 'ux' }, terms: [{ node: 'N2', dof: 'ux', c: 1 }] },
]);
assertConstraintCode('CONSTRAINT_SUPPORT_CONFLICT', [{
  id: 'SUPPORT', type: 'mpc', slave: { node: 'N1', dof: 'ux' }, terms: [{ node: 'N2', dof: 'ux', c: 1 }],
}]);

export const M5_VERIFICATION_SNAPSHOT = Object.freeze({
  ok: true,
  version: 'p10-m5-mpc-rigidlink-v1',
  solverVersion: GENERAL_CONSTRAINT_VERSION,
  metrics: {
    rigidLinkError,
    equilibriumResidual: mpcCombo.summary.equilibriumResidual,
    diaphragmError,
    modalError,
    pDeltaResidual: direct.result.solver.forceResidualNorm,
  },
  tolerances: {
    rigidLink: tolerance,
    equilibrium: tolerance,
    diaphragm: tolerance,
    modal: tolerance,
    pDelta: tolerance,
  },
  modelHashes: {
    rigidLink: stableHash(linked).slice(0, 16),
    mpc: stableHash(mpc).slice(0, 16),
    diaphragm: stableHash(diaphragmModel).slice(0, 16),
    modal: stableHash(modalLinked).slice(0, 16),
  },
  collisionCodes: ['CONSTRAINT_SLAVE_REDEFINED', 'CONSTRAINT_CYCLE', 'CONSTRAINT_SUPPORT_CONFLICT'],
});

console.log(JSON.stringify(M5_VERIFICATION_SNAPSHOT, null, 2));

function assertConstraintCode(code, constraints) {
  const candidate = structuredClone(mpc);
  candidate.constraints = constraints;
  const validation = validateModel(candidate);
  assert.ok(validation.errors.some((row) => row.code === code), `${code} must be returned`);
}

function modalColumn(topMass) {
  const model = createModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4, mass: [topMass, topMass, topMass] },
  ];
  model.members = [{
    id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300', releases: { i: 'rigid', j: 'rigid' },
  }];
  model.loads = [];
  model.analysisSettings.modalModeCount = 3;
  model.analysisSettings.responseSpectrum.enabled = false;
  return model;
}

function qualifiedBucklingPreload(memberResults) {
  const result = {
    ok: true,
    anyOk: true,
    combo: { id: 'PRELOAD' },
    memberResults,
    failedComponents: [],
    unstableMembers: new Set(),
    summary: { equilibriumStatus: 'PASS', equilibriumOk: true, designBlocked: false },
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
      rows: [{ comboId: 'PRELOAD', ok: true, equilibriumStatus: 'PASS', designBlocked: false }],
    },
    byCombo: { PRELOAD: result },
  };
}

function maxRelativeError(pairs) {
  let maximum = 0;
  for (const [actual, expected] of pairs) {
    for (let index = 0; index < actual.length; index += 1) {
      const scale = Math.max(1, Math.abs(expected[index] || 0));
      maximum = Math.max(maximum, Math.abs((actual[index] || 0) - (expected[index] || 0)) / scale);
    }
  }
  return maximum;
}
