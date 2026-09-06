import assert from 'node:assert/strict';
import { stableHash } from '../src/core/stableHash.js';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import { createNonlinearStateStore, stateStoreByteSnapshot } from '../src/nonlinear/core/stateStore.js';
import { createEquilibriumAssembler } from '../src/nonlinear/equilibrium/assembler.js';
import { buildNonlinearLoadPattern } from '../src/nonlinear/equilibrium/externalLoads.js';
import { createDenseReferenceBackend } from '../src/nonlinear/equilibrium/referenceBackends.js';
import { solveMdofNewtonStep } from '../src/nonlinear/equilibrium/newton.js';
import { createHingeProperty, hingePropertyRequiresGeneralMatrix } from '../src/nonlinear/properties/hingeRegistry.js';
import { buildHingedFrame3dEntries, createHingedFrame3dKernel } from '../src/nonlinear/elements/hingedFrame3d.js';

const elasticHinge = property('HP-LINEAR', {
  rotations: [0.01, 0.04, 0.08, 0.12],
  moments: [100, 400, 800, 1200],
});
const single = modelWithHinges([
  assignment('M1:j:y', 'j', 'y', elasticHinge.id),
], [elasticHinge]);
const singleDomain = buildCanonicalAnalysisDomain(single);
assert.equal(singleDomain.ok, true, singleDomain.reason);
const singleResolution = buildHingedFrame3dEntries(singleDomain);
const singleKernel = singleResolution[0].kernel;
const imposedRotation = 0.001;
const displacement = new Array(12).fill(0);
displacement[10] = imposedRotation;
const series = singleKernel.evaluate({ trialKinematics: { uGlobal: displacement } });
const descriptor = singleDomain.elements[0];
const memberStiffness = 4
  * descriptor.propertySnapshot.effectiveMaterial.E
  * descriptor.propertySnapshot.effectiveSection.Iy
  / descriptor.geometry.length;
const hingeStiffness = 100 / 0.01;
const expectedSeriesStiffness = memberStiffness * hingeStiffness / (memberStiffness + hingeStiffness);
const expectedMoment = expectedSeriesStiffness * imposedRotation;
const hinge = series.localResponse.hinges[0];
close(series.localResponse.resistingForce[10], expectedMoment, 2e-6, 'series end moment');
close(hinge.moment, expectedMoment, 2e-6, 'hinge equilibrium moment');
close(hinge.rotation, expectedMoment / hingeStiffness, 2e-10, 'hinge rotation share');
close(series.localResponse.deformation[10], expectedMoment / memberStiffness, 2e-10, 'elastic member rotation share');
close(hinge.rotation + series.localResponse.deformation[10], imposedRotation, 2e-10, 'series compatibility');
const seriesTangentError = tangentError(singleKernel, displacement, 10, 1e-7);
assert.ok(seriesTangentError < 2e-5, `series tangent error ${seriesTangentError}`);

const memberLoadModel = modelWithHinges([
  assignment('M1:j:y', 'j', 'y', elasticHinge.id),
], [elasticHinge], {
  loads: [{ id: 'W', type: 'udl', member: 'M1', w: 10, dir: '-z', case: 'D' }],
});
const memberLoadDomain = buildCanonicalAnalysisDomain(memberLoadModel, { factors: { D: 1 } });
const memberLoadPattern = buildNonlinearLoadPattern(memberLoadDomain);
const memberLoadKernel = buildHingedFrame3dEntries(memberLoadDomain)[0].kernel;
const memberLoaded = memberLoadKernel.evaluate({
  trialKinematics: { uGlobal: new Array(12).fill(0), lambda: 1 },
  elementLoads: { trace: memberLoadPattern.trace.filter((row) => row.target?.memberId === 'M1') },
});
const memberLoadHinge = memberLoaded.localResponse.hinges[0];
assert.ok(Math.abs(memberLoadHinge.rotation) > 1e-8, 'member fixed-end action must produce hinge rotation');
close(
  memberLoaded.localResponse.resistingForce[memberLoadHinge.localDof],
  memberLoadHinge.moment,
  2e-8,
  'member-load hinge equilibrium',
);

const highY = property('HP-IY', { rotations: [0.01, 0.04, 0.08, 0.12], moments: [1000, 1200, 300, 300] });
const lowY = property('HP-JY', { rotations: [0.001, 0.004, 0.008, 0.012], moments: [2, 2.4, 0.6, 0.6] });
const highZ = property('HP-JZ', { rotations: [0.01, 0.04, 0.08, 0.12], moments: [800, 1000, 250, 250] });
const independentModel = modelWithHinges([
  assignment('M1:i:y', 'i', 'y', highY.id),
  assignment('M1:j:y', 'j', 'y', lowY.id),
  assignment('M1:j:z', 'j', 'z', highZ.id),
], [highY, lowY, highZ]);
const independentDomain = buildCanonicalAnalysisDomain(independentModel);
const independentEntries = buildHingedFrame3dEntries(independentDomain);
const independentKernel = independentEntries[0].kernel;
const independentQ = new Array(12).fill(0);
independentQ[10] = 0.005;
const independent = independentKernel.evaluate({ trialKinematics: { uGlobal: independentQ } });
const byId = Object.fromEntries(independent.localResponse.hinges.map((row) => [row.id, row]));
assert.notEqual(byId['M1:j:y'].state, 'elastic', 'low-capacity j-y hinge must leave the elastic state');
assert.equal(byId['M1:i:y'].state, 'elastic', 'i-y state must remain independent');
assert.equal(byId['M1:j:z'].state, 'elastic', 'orthogonal j-z state must remain independent');
close(byId['M1:j:z'].moment, 0, 1e-8, 'orthogonal hinge moment');
assert.equal(Object.keys(independent.trialState.hinges).length, 3);

const softening = property('HP-SOFTENING', {
  rotations: [0.01, 0.04, 0.08, 0.12],
  moments: [100, 120, 20, 20],
  regularization: { strategy: 'signed-floor', minimumRatio: 1e-6 },
});
assert.equal(hingePropertyRequiresGeneralMatrix(softening), true);
const softeningModel = modelWithHinges([
  assignment('M1:j:y', 'j', 'y', softening.id),
], [softening]);
const softeningDomain = buildCanonicalAnalysisDomain(softeningModel);
const softeningEntries = buildHingedFrame3dEntries(softeningDomain);
assert.equal(softeningEntries[0].requiredMatrixClass, 'general');
const softeningAssembler = createEquilibriumAssembler({ domain: softeningDomain, elements: softeningEntries });
assert.equal(softeningAssembler.requiredMatrixClass, 'general');
const softQ = new Array(12).fill(0);
softQ[10] = 0.06;
const softened = softeningEntries[0].kernel.evaluate({ trialKinematics: { uGlobal: softQ } });
const softenedHinge = softened.localResponse.hinges[0];
assert.equal(softenedHinge.diagnostics.negativeTangent, true);
assert.equal(softenedHinge.diagnostics.requiresGeneralMatrix, true);

const plateau = property('HP-PLATEAU', {
  rotations: [0.01, 0.04, 0.08, 0.12],
  moments: [100, 120, 20, 20],
  regularization: { strategy: 'signed-floor', minimumRatio: 1e-6 },
});
const plateauDomain = buildCanonicalAnalysisDomain(modelWithHinges([
  assignment('M1:j:y', 'j', 'y', plateau.id),
], [plateau]));
const plateauKernel = buildHingedFrame3dEntries(plateauDomain)[0].kernel;
const plateauQ = new Array(12).fill(0);
plateauQ[10] = 0.2;
const plateauResponse = plateauKernel.evaluate({ trialKinematics: { uGlobal: plateauQ } });
assert.equal(plateauResponse.localResponse.hinges[0].diagnostics.zeroTangent, true);
assert.equal(plateauResponse.localResponse.hinges[0].diagnostics.applied, true);

const loadedModel = modelWithHinges([
  assignment('M1:j:y', 'j', 'y', elasticHinge.id),
], [elasticHinge], {
  support: { support: 'custom', fix: [true, true, true, true, false, true] },
  loads: [{ id: 'M', type: 'nmoment', node: 'N2', M: 5, axis: 'y', coordinate: 'global', case: 'D' }],
});
const loadedDomain = buildCanonicalAnalysisDomain(loadedModel, { factors: { D: 1 } });
const loadedAssembler = createEquilibriumAssembler({
  domain: loadedDomain,
  elements: buildHingedFrame3dEntries(loadedDomain),
});
const initialStore = stateFor(loadedDomain);
const accepted = await solveMdofNewtonStep({
  assembler: loadedAssembler,
  stateStore: initialStore,
  targetLambda: 1,
  backend: createDenseReferenceBackend(),
  options: strictNewton(),
});
assert.equal(accepted.ok, true, JSON.stringify({ reason: accepted.reason, details: accepted.details }));
assert.ok(accepted.stateStore.committed.elementStates.M1.hinges['M1:j:y']);
const committedSnapshot = stateStoreByteSnapshot(accepted.stateStore);
const committedElementHash = stableHash(accepted.stateStore.committed.elementStates.M1.hinges['M1:j:y']);
const cancelled = await solveMdofNewtonStep({
  assembler: loadedAssembler,
  stateStore: accepted.stateStore,
  targetLambda: 2,
  backend: createDenseReferenceBackend(),
  isCancelled: () => true,
  options: strictNewton(),
});
assert.equal(cancelled.ok, false);
assert.equal(cancelled.reason, 'ANALYSIS_CANCELLED');
assert.equal(cancelled.rollbackEquivalent, true);
assert.equal(stateStoreByteSnapshot(cancelled.stateStore), committedSnapshot);
assert.equal(stableHash(cancelled.stateStore.committed.elementStates.M1.hinges['M1:j:y']), committedElementHash);

assert.throws(
  () => createHingedFrame3dKernel(
    buildCanonicalAnalysisDomain({
      ...single,
      members: [{ ...single.members[0], releases: { i: 'rigid', j: 'pin' } }],
    }).elements[0],
    buildHingedFrame3dEntries(singleDomain)[0].hingeAssignments,
  ),
  (error) => error?.code === 'HINGE_RELEASE_AXIS_CONFLICT',
);

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-HNG-07', 'NL-HNG-08', 'NL-HNG-09', 'NL-HNG-10', 'NL-HNG-11'],
  seriesMomentError: Math.abs(series.localResponse.resistingForce[10] - expectedMoment),
  seriesCompatibilityError: Math.abs(hinge.rotation + series.localResponse.deformation[10] - imposedRotation),
  seriesTangentError,
  rollbackEquivalent: cancelled.rollbackEquivalent,
  negativeTangent: softenedHinge.constitutiveTangent,
  regularizedPlateauTangent: plateauResponse.localResponse.hinges[0].tangent,
}, null, 2));

function property(id, options = {}) {
  const side = [
    { id: 'A', rotation: 0, moment: 0 },
    ...['B', 'C', 'D', 'E'].map((point, index) => ({
      id: point,
      rotation: options.rotations[index],
      moment: options.moments[index],
    })),
  ];
  return createHingeProperty({
    id,
    qualification: 'candidate',
    units: { rotation: 'rad', moment: 'kN-m', length: 'm' },
    parameters: {
      positive: side,
      negative: side,
      hingeLength: 0.2,
      hysteresis: { rule: 'kinematic-masing' },
      regularization: options.regularization || {},
      integration: { maxSubsteps: 4096 },
    },
    source: { type: 'closed-form-test', reference: 'P8-M4-series-spring-reference' },
  });
}

function assignment(id, end, axis, propertyId) {
  return { id, memberId: 'M1', propertyId, end, axis, source: { mode: 'user' } };
}

function modelWithHinges(hinges, hingeProperties, options = {}) {
  return {
    schemaVersion: 5,
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N2', x: 4, y: 0, z: 0, ...(options.support || {}) },
    ],
    members: [{
      id: 'M1', type: 'frame', behavior: 'frame', n1: 'N1', n2: 'N2', matId: 'MAT', secId: 'SEC',
      localAxis: { refVector: [0, 1, 0], roll: 0, strongAxis: 'z' },
      nonlinear: { formulation: 'concentrated-plasticity', hinges },
    }],
    materials: [{ id: 'MAT', E: 210e6, G: 80e6, density: 0 }],
    sections: [{ id: 'SEC', type: 'direct', A: 0.02, Iy: 8e-5, Iz: 1.2e-4, J: 3e-5 }],
    hingeProperties,
    loads: options.loads || [],
    loadCases: [],
    loadCombinations: [],
    analysisSettings: { includeSelfWeight: false },
  };
}

function stateFor(domain) {
  return createNonlinearStateStore({
    domainHash: domain.identity.domainHash,
    initialState: {
      q: new Array(domain.constraint.reducedDofCount).fill(0),
      elementStates: {},
    },
  });
}

function strictNewton() {
  return {
    maxIterations: 12,
    lineSearch: true,
    convergence: {
      forceRelative: 1e-10,
      forceAbsolute: 1e-9,
      momentRelative: 1e-10,
      momentAbsolute: 1e-9,
      displacementRelative: 1e-10,
      displacementAbsolute: 1e-12,
      rotationRelative: 1e-10,
      rotationAbsolute: 1e-12,
      energyRelative: 1e-10,
      energyAbsolute: 1e-12,
    },
  };
}

function tangentError(kernel, q, dof, step) {
  const base = kernel.evaluate({ trialKinematics: { uGlobal: q } });
  const plus = q.slice();
  const minus = q.slice();
  plus[dof] += step;
  minus[dof] -= step;
  const fp = kernel.evaluate({ trialKinematics: { uGlobal: plus } }).resistingForceGlobal;
  const fm = kernel.evaluate({ trialKinematics: { uGlobal: minus } }).resistingForceGlobal;
  const numerical = (fp[dof] - fm[dof]) / (2 * step);
  return Math.abs(base.tangentGlobal[dof][dof] - numerical) / Math.max(1, Math.abs(numerical));
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} +/- ${tolerance}, got ${actual}`);
}
