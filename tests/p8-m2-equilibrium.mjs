import assert from 'node:assert/strict';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import { createNonlinearElementContract } from '../src/nonlinear/core/elementContract.js';
import { createNonlinearStateStore } from '../src/nonlinear/core/stateStore.js';
import { createEquilibriumAssembler } from '../src/nonlinear/equilibrium/assembler.js';
import { createDenseReferenceBackend } from '../src/nonlinear/equilibrium/referenceBackends.js';
import { solveMdofNewtonStep } from '../src/nonlinear/equilibrium/newton.js';
import { createWasmSparseBackend } from '../src/nonlinear/equilibrium/backends/wasmSparseBackend.js';

const oneDof = domainWithFreeDofs(1);
const linearEntry = elementEntry('E1', [6], ([u]) => ({
  force: [100 * u],
  tangent: [[100]],
  state: { u },
  energy: 50 * u * u,
}));
const linearAssembler = createEquilibriumAssembler({
  domain: oneDof,
  elements: [linearEntry],
  loadPattern: loadPattern(oneDof, [10]),
});
const linearState = stateFor(oneDof);
const dense = createDenseReferenceBackend();
const linear = await solveMdofNewtonStep({
  assembler: linearAssembler,
  stateStore: linearState,
  targetLambda: 1,
  backend: dense,
  options: strictNewton(),
});
assert.equal(linear.ok, true, linear.reason);
close(linear.q[0], 0.1, 1e-11);
close(linear.evaluation.residualReduced[0], 0, 1e-10);
assert.ok(linear.elementEvaluationCount >= 2, 'element force/tangent must be reevaluated after correction');
assert.ok(linear.tangentAssemblyCount >= 2, 'global tangent must be reassembled after correction');
close(linear.stateStore.committed.elementStates.E1.u, 0.1, 1e-11);

const twoDof = domainWithFreeDofs(2);
const expected = [0.2, -0.1];
const nonlinearResponse = ([x, y]) => ({
  force: [2 * x + y + x ** 3, x + 3 * y + 0.5 * y ** 3],
  tangent: [[2 + 3 * x ** 2, 1], [1, 3 + 1.5 * y ** 2]],
  state: { x, y, branch: 'smooth' },
  energy: x ** 2 + x * y + 1.5 * y ** 2 + 0.25 * x ** 4 + 0.125 * y ** 4,
});
const targetForce = nonlinearResponse(expected).force;
const nonlinearEntry = elementEntry('E2', [6, 7], nonlinearResponse);
const nonlinearAssembler = createEquilibriumAssembler({
  domain: twoDof,
  elements: [nonlinearEntry],
  loadPattern: loadPattern(twoDof, targetForce),
});

const probe = await nonlinearAssembler.evaluate({
  q: [0.13, -0.08], lambda: 1, committedElementStates: {},
});
assert.equal(probe.ok, true);
const analytical = cscToDense(probe.tangentReduced);
const finiteDifference = await finiteDifferenceTangent(nonlinearAssembler, [0.13, -0.08], 1e-6);
matrixClose(analytical, finiteDifference, 5e-8);

const nonlinear = await solveMdofNewtonStep({
  assembler: nonlinearAssembler,
  stateStore: stateFor(twoDof),
  targetLambda: 1,
  backend: dense,
  options: strictNewton(),
});
assert.equal(nonlinear.ok, true, nonlinear.reason);
close(nonlinear.q[0], expected[0], 2e-9);
close(nonlinear.q[1], expected[1], 2e-9);
assert.ok(nonlinear.iterations.every((row, index) => (
  index === 0 || row.cumulativeElementEvaluationCount > nonlinear.iterations[index - 1].cumulativeElementEvaluationCount
)));
assert.deepEqual(nonlinear.stateStore.committed.elementStates.E2.branch, 'smooth');

const wasm = await createWasmSparseBackend();
const nonlinearProduction = await solveMdofNewtonStep({
  assembler: nonlinearAssembler,
  stateStore: stateFor(twoDof),
  targetLambda: 1,
  backend: wasm,
  production: true,
  options: strictNewton(),
});
assert.equal(nonlinearProduction.ok, true, nonlinearProduction.reason);
close(nonlinearProduction.q[0], nonlinear.q[0], 2e-9);
close(nonlinearProduction.q[1], nonlinear.q[1], 2e-9);
assert.equal(nonlinearProduction.backend, 'p8-wasm-sparse-v1');

const invalidTargetStore = stateFor(twoDof);
const invalidTarget = await solveMdofNewtonStep({
  assembler: nonlinearAssembler,
  stateStore: invalidTargetStore,
  targetLambda: Number.NaN,
  backend: dense,
});
assert.equal(invalidTarget.ok, false);
assert.equal(invalidTarget.reason, 'MDOF_TARGET_LAMBDA_NONFINITE');
assert.equal(invalidTarget.stateStore, invalidTargetStore);
assert.equal(invalidTarget.committedPreserved, true);

const invalidStateEntry = elementEntry('E-BAD-STATE', [6], ([u]) => ({
  force: [100 * u],
  tangent: [[100]],
  state: { nonfiniteHistory: Number.NaN },
  energy: 50 * u * u,
}));
const invalidStateAssembler = createEquilibriumAssembler({
  domain: oneDof,
  elements: [invalidStateEntry],
  loadPattern: loadPattern(oneDof, [10]),
});
const invalidStateStore = stateFor(oneDof);
const invalidState = await solveMdofNewtonStep({
  assembler: invalidStateAssembler,
  stateStore: invalidStateStore,
  targetLambda: 1,
  backend: dense,
});
assert.equal(invalidState.ok, false);
assert.equal(invalidState.reason, 'STATE_VALUE_NONFINITE');
assert.equal(invalidState.committedPreserved, true);
assert.equal(invalidState.rollbackError, null);

const scale = 1e6;
const scaledEntry = elementEntry('E3', [6, 7], (u) => {
  const response = nonlinearResponse(u);
  return {
    ...response,
    force: response.force.map((value) => value * scale),
    tangent: response.tangent.map((row) => row.map((value) => value * scale)),
    energy: response.energy * scale,
  };
});
const scaledAssembler = createEquilibriumAssembler({
  domain: twoDof,
  elements: [scaledEntry],
  loadPattern: loadPattern(twoDof, targetForce.map((value) => value * scale)),
});
const scaled = await solveMdofNewtonStep({
  assembler: scaledAssembler,
  stateStore: stateFor(twoDof),
  targetLambda: 1,
  backend: dense,
  options: strictNewton(),
});
assert.equal(scaled.ok, true, scaled.reason);
close(scaled.q[0], expected[0], 2e-9);
close(scaled.q[1], expected[1], 2e-9);
assert.equal(scaled.iterationCount, nonlinear.iterationCount, 'relative+absolute convergence must be load-scale stable');

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-EQ-01', 'NL-EQ-03', 'NL-EQ-04', 'NL-EQ-05', 'NL-EQ-06', 'NL-CTRL-02', 'NL-CTRL-03'],
  linearDisplacement: linear.q[0],
  nonlinearDisplacement: Array.from(nonlinear.q),
  productionDisplacement: Array.from(nonlinearProduction.q),
  nonlinearIterations: nonlinear.iterationCount,
  elementEvaluations: nonlinear.elementEvaluationCount,
}, null, 2));

function domainWithFreeDofs(count) {
  const domain = buildCanonicalAnalysisDomain({
    schemaVersion: 5,
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 1, y: 0, z: 0, support: 'custom', fix: [false, count < 2, true, true, true, true] },
    ],
    members: [], materials: [], sections: [], loads: [], loadCases: [], loadCombinations: [],
    analysisSettings: { includeSelfWeight: false },
  });
  assert.equal(domain.ok, true, domain.reason);
  assert.equal(domain.constraint.reducedDofCount, count);
  return domain;
}

function elementEntry(id, dofs, evaluator) {
  const kernel = createNonlinearElementContract({
    type: `verification-${id}`,
    dofCount: dofs.length,
    evaluate({ trialKinematics }) {
      const response = evaluator(trialKinematics.uGlobal);
      return {
        resistingForceGlobal: response.force,
        tangentGlobal: response.tangent,
        trialState: response.state,
        energies: { strain: response.energy },
        localResponse: { u: [...trialKinematics.uGlobal] },
        diagnostics: { formulation: 'manufactured-smooth-potential' },
      };
    },
  });
  return { id, dofs, kernel, descriptor: { id } };
}

function loadPattern(domain, reducedValues) {
  const full = new Float64Array(domain.constraint.fullDofCount);
  reducedValues.forEach((value, index) => { full[6 + index] = value; });
  return { ok: true, constantFull: new Float64Array(full.length), referenceFull: full };
}

function stateFor(domain) {
  return createNonlinearStateStore({
    domainHash: domain.identity.domainHash,
    initialState: { q: new Array(domain.constraint.reducedDofCount).fill(0), elementStates: {}, energies: {} },
  });
}

function strictNewton() {
  return {
    maxIterations: 20,
    lineSearch: true,
    convergence: {
      forceAbsolute: 1e-11,
      forceRelative: 1e-10,
      forceScaleFloor: 1e-12,
      momentScaleFloor: 1e-12,
      displacementAbsolute: 1e-12,
      displacementRelative: 1e-10,
      displacementScaleFloor: 1e-12,
      rotationScaleFloor: 1e-12,
      energyAbsolute: 1e-14,
      energyRelative: 1e-11,
      energyScaleFloor: 1e-12,
    },
  };
}

async function finiteDifferenceTangent(assembler, q, step) {
  const out = Array.from({ length: q.length }, () => new Array(q.length).fill(0));
  for (let column = 0; column < q.length; column += 1) {
    const plus = [...q];
    const minus = [...q];
    plus[column] += step;
    minus[column] -= step;
    const p = await assembler.evaluate({ q: plus, lambda: 1, committedElementStates: {} });
    const m = await assembler.evaluate({ q: minus, lambda: 1, committedElementStates: {} });
    for (let row = 0; row < q.length; row += 1) {
      out[row][column] = (p.pInternalReduced[row] - m.pInternalReduced[row]) / (2 * step);
    }
  }
  return out;
}

function cscToDense(matrix) {
  const out = Array.from({ length: matrix.rowCount }, () => new Array(matrix.colCount).fill(0));
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let p = matrix.colPtr[column]; p < matrix.colPtr[column + 1]; p += 1) out[matrix.rowIdx[p]][column] = matrix.values[p];
  }
  return out;
}

function matrixClose(actual, expected, tolerance) {
  actual.forEach((row, i) => row.forEach((value, j) => close(value, expected[i][j], tolerance)));
}

function close(actual, expectedValue, tolerance) {
  assert.ok(Math.abs(actual - expectedValue) <= tolerance * Math.max(1, Math.abs(expectedValue)), `${actual} != ${expectedValue}`);
}
