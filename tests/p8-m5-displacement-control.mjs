import assert from 'node:assert/strict';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import { createNonlinearStateStore, stateStoreByteSnapshot } from '../src/nonlinear/core/stateStore.js';
import { createNonlinearElementContract } from '../src/nonlinear/core/elementContract.js';
import { createEquilibriumAssembler } from '../src/nonlinear/equilibrium/assembler.js';
import {
  buildAugmentedDisplacementSystem,
  evaluatePhysicalControlCoordinate,
  resolvePhysicalControlCoordinate,
  runMdofDisplacementControl,
  solveMdofDisplacementStep,
} from '../src/nonlinear/equilibrium/displacementControl.js';
import { createDenseReferenceBackend } from '../src/nonlinear/equilibrium/referenceBackends.js';

const backend = createDenseReferenceBackend();
const sdof = await verifySdofClosedForm();
const mdof = await verifyMdofAugmentedReference();
const diaphragm = verifyDiaphragmCoordinate();
const eventCutback = await verifyEventAwareCutback();
const rollback = await verifyRollback();
const inputGuards = await verifyInputGuards();
const unsupportedReference = await verifyUnsupportedReferenceLoads();
const weakScaling = await verifyWeaklyScaledAugmentedSolve();
const gaugeProjection = await verifyGaugeProjectionGuards();

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-CTRL-05', 'NL-CTRL-06', 'NL-CTRL-07', 'NL-CTRL-08'],
  sdofLambdaError: sdof.lambdaError,
  mdofSolutionError: mdof.solutionError,
  diaphragmCoordinateTerms: diaphragm.termCount,
  eventCutbackCount: eventCutback.cutbackCount,
  rollbackEquivalent: rollback,
  inputGuardReasons: inputGuards,
  unsupportedReferenceTypes: unsupportedReference,
  weakScalingLambdaRelativeError: weakScaling.lambdaRelativeError,
  gaugeProjectionReasons: gaugeProjection,
}, null, 2));

async function verifySdofClosedForm() {
  const { domain, assembler, stateStore } = springSystem([[100]], [10]);
  const control = resolvePhysicalControlCoordinate(domain, { nodeId: 'N1', component: 'ux' });
  const result = await solveMdofDisplacementStep({
    assembler,
    stateStore,
    backend,
    control,
    targetDisplacement: 0.2,
    options: strictOptions(),
  });
  assert.equal(result.ok, true, JSON.stringify(result.details));
  close(result.controlValue, 0.2, 1e-10, 'SDOF control displacement');
  const lambdaError = Math.abs(result.lambda - 2);
  assert.ok(lambdaError < 1e-10, `SDOF lambda error ${lambdaError}`);
  return { lambdaError };
}

async function verifyMdofAugmentedReference() {
  const stiffness = [[100, 20], [20, 50]];
  const reference = [10, 5];
  const { domain, assembler, stateStore } = springSystem(stiffness, reference);
  const control = resolvePhysicalControlCoordinate(domain, { nodeId: 'N1', component: 'ux' });
  const target = 0.1;
  const result = await solveMdofDisplacementStep({
    assembler,
    stateStore,
    backend,
    control,
    targetDisplacement: target,
    options: strictOptions(),
  });
  assert.equal(result.ok, true, JSON.stringify(result.details));
  const determinant = stiffness[0][0] * stiffness[1][1] - stiffness[0][1] * stiffness[1][0];
  const influenceX = (stiffness[1][1] * reference[0] - stiffness[0][1] * reference[1]) / determinant;
  const expectedLambda = target / influenceX;
  const expectedY = expectedLambda * (-stiffness[1][0] * reference[0] + stiffness[0][0] * reference[1]) / determinant;
  const solutionError = Math.max(Math.abs(result.lambda - expectedLambda), Math.abs(result.q[1] - expectedY));
  assert.ok(solutionError < 1e-10, `MDOF augmented solution error ${solutionError}`);
  const active = assembler.pattern;
  const augmented = buildAugmentedDisplacementSystem({
    tangent: result.evaluation.tangentReduced,
    residual: result.evaluation.residualReduced,
    reference: assembler.loadPattern.referenceReduced,
    control: control.reducedVector,
    controlResidual: 0,
  });
  assert.equal(augmented.matrix.rowCount, active.rowCount + 1);
  return { solutionError };
}

function verifyDiaphragmCoordinate() {
  const model = baseModel([
    { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N1', x: 0, y: 0, z: 3 },
    { id: 'N2', x: 4, y: 0, z: 3 },
  ]);
  model.diaphragms = [{ id: 'D1', type: 'rigid', nodeIds: ['N1', 'N2'] }];
  const domain = buildCanonicalAnalysisDomain(model);
  assert.equal(domain.ok, true, domain.reason);
  const control = resolvePhysicalControlCoordinate(domain, { nodeId: 'N2', component: 'ux' });
  const termCount = control.reducedVector.filter((value) => Math.abs(value) > 0).length;
  assert.ok(termCount >= 1);
  const q = new Array(domain.constraint.reducedDofCount).fill(0);
  control.reducedVector.forEach((value, index) => { q[index] = value * 0.01; });
  const direct = control.prescribedOffset + control.reducedVector.reduce((sum, value, index) => sum + value * q[index], 0);
  close(control.value(q), direct, 1e-14, 'diaphragm physical coordinate');
  const serialized = structuredClone(control);
  close(evaluatePhysicalControlCoordinate(serialized, q), direct, 1e-14, 'serialized diaphragm physical coordinate');
  return { termCount };
}

async function verifyEventAwareCutback() {
  const { domain, assembler, stateStore } = springSystem([[100]], [10], { yieldAt: 0.05 });
  const control = resolvePhysicalControlCoordinate(domain, { nodeId: 'N1', component: 'ux' });
  const result = await runMdofDisplacementControl({
    assembler,
    stateStore,
    backend,
    control,
    targetDisplacement: 0.1,
    options: {
      targetDisplacement: 0.1,
      steps: 1,
      minIncrement: 0.00625,
      maxIncrement: 0.1,
      eventLocalizationTolerance: 0.025,
      eventAware: true,
      newton: strictOptions(),
    },
  });
  assert.equal(result.ok, true, result.reason);
  assert.ok(result.rejectedSteps.some((row) => row.reason === 'HINGE_EVENT_CUTBACK'));
  assert.ok(result.acceptedSteps.every((row) => row.controlDisplacement <= row.targetDisplacement + 1e-10));
  return { cutbackCount: result.rejectedStepCount };
}

async function verifyRollback() {
  const { assembler, stateStore } = springSystem([[100]], [0]);
  const before = stateStoreByteSnapshot(stateStore);
  const result = await solveMdofDisplacementStep({
    assembler,
    stateStore,
    backend,
    control: { nodeId: 'N1', component: 'ux' },
    targetDisplacement: 0.1,
    options: strictOptions(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'AUGMENTED_REFERENCE_VECTOR_ZERO');
  assert.equal(result.rollbackEquivalent, true);
  return stateStoreByteSnapshot(result.stateStore) === before;
}

async function verifyInputGuards() {
  const { domain, assembler, stateStore } = springSystem([[100]], [10]);
  const before = stateStoreByteSnapshot(stateStore);
  const missingTarget = await solveMdofDisplacementStep({
    assembler,
    stateStore,
    backend,
    control: { nodeId: 'N1', component: 'ux' },
    options: strictOptions(),
  });
  assert.equal(missingTarget.ok, false);
  assert.equal(missingTarget.status, 'blocked');
  assert.equal(missingTarget.reason, 'CONTROL_TARGET_REQUIRED');
  assert.equal(missingTarget.iterationCount, 0);
  assert.equal(missingTarget.rollbackEquivalent, true);
  assert.equal(stateStoreByteSnapshot(missingTarget.stateStore), before);

  assert.throws(
    () => resolvePhysicalControlCoordinate(domain, { nodeId: 'N1', direction: [1, 0] }),
    (error) => error?.code === 'CONTROL_DIRECTION_INVALID'
      && /exactly 3 values/.test(error.message),
  );
  return [missingTarget.reason, 'CONTROL_DIRECTION_INVALID'];
}

async function verifyUnsupportedReferenceLoads() {
  const cases = [
    {
      type: 'nmoment',
      componentIndex: 4,
      trace: {
        id: 'REF-MOMENT', role: 'reference', dofs: [10], values: [10],
        source: { id: 'REF-MOMENT', type: 'nmoment', node: 'N1', M: 10, axis: 'y' },
      },
    },
    {
      type: 'udl',
      componentIndex: 0,
      trace: {
        id: 'REF-MEMBER', role: 'reference', dofs: [6], values: [10],
        target: { memberId: 'S1' },
        source: { id: 'REF-MEMBER', type: 'udl', member: 'S1', w: 10, dir: '-z' },
      },
    },
  ];
  const blockedTypes = [];
  for (const item of cases) {
    const { assembler, stateStore } = singleDofSystem({
      componentIndex: item.componentIndex,
      stiffness: 100,
      reference: 10,
      trace: [item.trace],
    });
    const before = stateStoreByteSnapshot(stateStore);
    assert.equal(assembler.referenceLoadDerivative.ok, false);
    assert.equal(assembler.referenceLoadDerivative.reason, 'REFERENCE_LOAD_DERIVATIVE_UNSUPPORTED');
    assert.deepEqual(assembler.referenceLoadDerivative.unsupported, [{ id: item.trace.id, type: item.type }]);
    const result = await solveMdofDisplacementStep({
      assembler,
      stateStore,
      backend,
      control: { nodeId: 'N1', component: 'ux' },
      targetDisplacement: 0.1,
      options: strictOptions(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'REFERENCE_LOAD_DERIVATIVE_UNSUPPORTED');
    assert.deepEqual(result.details.unsupported, [{ id: item.trace.id, type: item.type }]);
    assert.equal(result.rollbackEquivalent, true);
    assert.equal(stateStoreByteSnapshot(result.stateStore), before);
    blockedTypes.push(item.type);
  }
  return blockedTypes;
}

async function verifyWeaklyScaledAugmentedSolve() {
  const stiffness = 1e12;
  const reference = 1e-8;
  const target = 1e-6;
  const expectedLambda = stiffness * target / reference;
  const { assembler, stateStore } = springSystem([[stiffness]], [reference]);
  const result = await solveMdofDisplacementStep({
    assembler,
    stateStore,
    backend,
    control: { nodeId: 'N1', component: 'ux' },
    targetDisplacement: target,
    options: { ...strictOptions(), pivotTolerance: 1e-12 },
  });
  assert.equal(result.ok, true, JSON.stringify(result.details));
  close(result.controlValue, target, 1e-14, 'weakly-scaled control displacement');
  const lambdaRelativeError = Math.abs(result.lambda - expectedLambda) / expectedLambda;
  assert.ok(lambdaRelativeError < 1e-12, `weakly-scaled lambda relative error ${lambdaRelativeError}`);
  assert.ok(result.iterations.length >= 1, 'weakly-scaled solve must execute an augmented linear solve');
  assert.ok(result.iterations.every((row) => row.backend?.matrixClass === 'general'));
  return { lambdaRelativeError };
}

async function verifyGaugeProjectionGuards() {
  const cases = [
    {
      reason: 'CONTROL_GAUGE_MODE_EXCITATION',
      stiffness: [[0, 0], [0, 100]],
      reference: [10, 0],
      inactiveModesGlobal: [[1, 0]],
    },
    {
      reason: 'REFERENCE_GAUGE_MODE_EXCITATION',
      stiffness: [[100, 0], [0, 0]],
      reference: [0, 10],
      inactiveModesGlobal: [[0, 1]],
    },
  ];
  const reasons = [];
  for (const item of cases) {
    const { assembler, stateStore } = springSystem(item.stiffness, item.reference, {
      inactiveModesGlobal: item.inactiveModesGlobal,
    });
    const before = stateStoreByteSnapshot(stateStore);
    const result = await solveMdofDisplacementStep({
      assembler,
      stateStore,
      backend,
      control: { nodeId: 'N1', component: 'ux' },
      targetDisplacement: 0.1,
      options: strictOptions(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, item.reason);
    assert.equal(result.rollbackEquivalent, true);
    assert.equal(stateStoreByteSnapshot(result.stateStore), before);
    reasons.push(result.reason);
  }
  return reasons;
}

function springSystem(stiffness, reference, options = {}) {
  const dofCount = stiffness.length;
  const free = [false, false, true, true, true, true];
  if (dofCount === 1) free[1] = true;
  const model = baseModel([
    { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N1', x: 1, y: 0, z: 0, support: 'custom', fix: free },
  ]);
  const domain = buildCanonicalAnalysisDomain(model);
  assert.equal(domain.ok, true, domain.reason);
  assert.equal(domain.constraint.reducedDofCount, dofCount);
  const kernel = createNonlinearElementContract({
    type: 'p8-m5-test-spring',
    dofCount,
    evaluate({ trialKinematics, committedState }) {
      const q = Array.from(trialKinematics.uGlobal, Number);
      const resisting = stiffness.map((row) => row.reduce((sum, value, index) => sum + value * q[index], 0));
      const yielded = committedState.yielded === true || (options.yieldAt != null && q[0] >= options.yieldAt - 1e-12);
      const newYield = yielded && committedState.yielded !== true;
      return {
        resistingForceGlobal: resisting,
        tangentGlobal: stiffness.map((row) => row.slice()),
        inactiveModesGlobal: options.inactiveModesGlobal || [],
        trialState: { yielded, q },
        energies: { strain: 0.5 * q.reduce((sum, value, index) => sum + value * resisting[index], 0) },
        localResponse: options.yieldAt == null ? null : {
          hinges: [{
            id: 'H1', propertyId: 'HP1', end: 'i', axis: 'y',
            rotation: q[0], moment: resisting[0], tangent: stiffness[0][0],
            state: yielded ? 'yielded' : 'elastic', point: yielded ? 'B' : 'A', branch: 'envelope',
            events: newYield ? [{ type: 'yield' }] : [], energies: {},
          }],
        },
      };
    },
  });
  const full = new Float64Array(domain.constraint.fullDofCount);
  full[6] = reference[0];
  if (dofCount > 1) full[7] = reference[1];
  const assembler = createEquilibriumAssembler({
    domain,
    elements: [{ id: 'S1', dofs: Array.from({ length: dofCount }, (_value, index) => 6 + index), kernel, descriptor: { id: 'S1' } }],
    loadPattern: {
      ok: true,
      constantFull: new Float64Array(full.length),
      referenceFull: full,
    },
  });
  const stateStore = createNonlinearStateStore({
    domainHash: domain.identity.domainHash,
    initialState: { q: new Array(dofCount).fill(0), elementStates: {} },
  });
  return { domain, assembler, stateStore };
}

function singleDofSystem({ componentIndex, stiffness, reference, trace }) {
  const fix = new Array(6).fill(true);
  fix[componentIndex] = false;
  const model = baseModel([
    { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N1', x: 1, y: 0, z: 0, support: 'custom', fix },
  ]);
  const domain = buildCanonicalAnalysisDomain(model);
  assert.equal(domain.ok, true, domain.reason);
  assert.equal(domain.constraint.reducedDofCount, 1);
  const kernel = createNonlinearElementContract({
    type: 'p8-m5-reference-guard-spring',
    dofCount: 1,
    evaluate({ trialKinematics }) {
      const q = Number(trialKinematics.uGlobal[0]);
      return {
        resistingForceGlobal: [stiffness * q],
        tangentGlobal: [[stiffness]],
        trialState: { q },
        energies: { strain: 0.5 * stiffness * q * q },
      };
    },
  });
  const fullDof = 6 + componentIndex;
  const referenceFull = new Float64Array(domain.constraint.fullDofCount);
  referenceFull[fullDof] = reference;
  const assembler = createEquilibriumAssembler({
    domain,
    elements: [{ id: 'S1', dofs: [fullDof], kernel, descriptor: { id: 'S1' } }],
    loadPattern: {
      ok: true,
      constantFull: new Float64Array(referenceFull.length),
      referenceFull,
      trace,
    },
  });
  const stateStore = createNonlinearStateStore({
    domainHash: domain.identity.domainHash,
    initialState: { q: [0], elementStates: {} },
  });
  return { domain, assembler, stateStore };
}

function baseModel(nodes) {
  return {
    schemaVersion: 5,
    nodes,
    members: [],
    materials: [],
    sections: [],
    loads: [],
    loadCases: [],
    loadCombinations: [],
    hingeProperties: [],
    nonlinearMaterials: [],
    nonlinearSections: [],
    linkProperties: [],
    timeHistoryFunctions: [],
    analysisStates: [],
    analysisSettings: { includeSelfWeight: false },
  };
}

function strictOptions() {
  return {
    maxIterations: 12,
    lineSearch: true,
    pivotTolerance: 1e-14,
    convergence: {
      forceAbsolute: 1e-11,
      forceRelative: 1e-10,
      momentAbsolute: 1e-11,
      momentRelative: 1e-10,
      displacementAbsolute: 1e-12,
      displacementRelative: 1e-10,
      energyAbsolute: 1e-14,
      energyRelative: 1e-10,
    },
    controlAbsolute: 1e-12,
    controlRelative: 1e-10,
  };
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} +/- ${tolerance}, got ${actual}`);
}
