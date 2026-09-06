import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import { createNonlinearElementContract } from '../src/nonlinear/core/elementContract.js';
import { createEquilibriumAssembler } from '../src/nonlinear/equilibrium/assembler.js';
import { assembleReducedTangent, buildReducedSparsePattern } from '../src/compute/sparse/reducedAssembly.js';
import {
  assembleNonlinearBatchTangent,
  createCpuNonlinearBatchEvaluator,
  createNonlinearBatchStateArena,
  createNonlinearElementBatch,
  executeNonlinearGpuCandidate,
  partitionNonlinearBatchCapability,
  validateNonlinearElementBatch,
} from '../src/compute/nonlinear/index.js';
import { referenceFiberSampleBatch, referenceFrameMatrixBatch } from '../src/compute/backends/webgpu/cpuReference.js';

const domain = twoDofDomain();
const entries = [
  manufacturedEntry('E1', [6], 'manufactured-smooth', 'S1', ([x], state) => ({
    force: [10 * x], tangent: [[10]], state: { x, memory: Number(state.memory || 0) + x }, energy: 5 * x * x,
  })),
  manufacturedEntry('E2', [7], 'manufactured-smooth', 'S1', ([y], state) => ({
    force: [20 * y], tangent: [[20]], state: { y, memory: Number(state.memory || 0) + y }, energy: 10 * y * y,
  })),
  manufacturedEntry('E3', [6, 7], 'manufactured-coupled', 'S2', ([x, y], state) => ({
    force: [4 * x + y, x + 6 * y], tangent: [[4, 1], [1, 6]],
    state: { x, y, branch: state.branch || 'elastic' }, energy: 2 * x * x + x * y + 3 * y * y,
  }), 'general'),
];
const committedElementStates = { E1: { memory: 1 }, E2: { memory: 2 }, E3: { branch: 'elastic' } };
const q = Float64Array.of(0.25, -0.1);
const u = Float64Array.of(0, 0, 0, 0, 0, 0, ...q, 0, 0, 0, 0);

const batch = createNonlinearElementBatch(entries, { owner: 'p9-m7-test' });
assert.equal(validateNonlinearElementBatch(batch).ok, true, 'P9-GPU-NL-01 SoA batch contract');
assert.equal(batch.groups.length, 2, 'same type/property elements share a batch group');
assert.deepEqual(Array.from(batch.dofOffsets), [0, 1, 2, 4]);
assert.deepEqual(Array.from(batch.matrixOffsets), [0, 1, 2, 6]);
const tamperedBatch = createNonlinearElementBatch([entries[0]], { owner: 'integrity-test' });
tamperedBatch.dofIndices[0] += 1;
assert.equal(validateNonlinearElementBatch(tamperedBatch).ok, false, 'bounded layout mutation is rejected');
const evaluator = createCpuNonlinearBatchEvaluator(batch);
const batched = await evaluator.evaluate({
  fullDisplacement: u,
  fullDofCount: 12,
  reducedDisplacement: q,
  lambda: 1,
  committedElementStates,
});
assert.equal(batched.ok, true, batched.reason);
const objectReference = await evaluateObjectReference(entries, u, q, committedElementStates);
vectorClose(batched.resistingForces, objectReference.forces, 0);
vectorClose(batched.tangents, objectReference.tangents, 0);
assert.deepEqual(batched.trialStates, objectReference.states, 'P9-GPU-NL-02 trial state parity');
assert.deepEqual(batched.energyRows, objectReference.energies, 'P9-GPU-NL-02 energy parity');
assert.equal(evaluator.telemetry.perElementCommittedStateCloneCount, 0, 'P9-REF-08 no hot-loop committed clone');
const mutationState = { nested: { value: 1 } };
const mutatingEntry = manufacturedEntry('MUTATE', [0], 'mutating-contract-test', 'M', ([x], state) => {
  state.nested.value = 2;
  return { force: [x], tangent: [[1]], state, energy: 0 };
});
const mutationResult = await createCpuNonlinearBatchEvaluator(createNonlinearElementBatch([mutatingEntry])).evaluate({
  fullDisplacement: [0], fullDofCount: 1, reducedDisplacement: [0], committedElementStates: { MUTATE: mutationState },
});
assert.equal(mutationResult.ok, false);
assert.equal(mutationState.nested.value, 1, 'unfrozen caller state cannot be contaminated by a kernel');

const pattern = buildReducedSparsePattern(domain.constraint, entries.map((entry) => entry.dofs));
const objectAssembly = assembleReducedTangent(pattern, objectReference.matrices);
const batchAssembly = assembleNonlinearBatchTangent(pattern, batch, batched.tangents);
vectorClose(batchAssembly.values, objectAssembly.values, 0);
assert.match(batchAssembly.reductionHash, /^[a-f0-9]{64}$/);
assert.equal(
  assembleNonlinearBatchTangent(pattern, batch, batched.tangents).reductionHash,
  batchAssembly.reductionHash,
  'P9-GPU-NL-07~08 fixed reduction hash',
);

const assembler = createEquilibriumAssembler({
  domain,
  elements: entries,
  loadPattern: loadPattern(domain, [3.5, -3]),
});
const assembled = await assembler.evaluate({ q, lambda: 1, committedElementStates });
assert.equal(assembled.ok, true, assembled.reason);
vectorClose(assembled.tangentReduced.values, objectAssembly.values, 0);
assert.equal(assembled.diagnostics.perElementCommittedStateCloneCount, 0);
assert.equal(assembled.diagnostics.elementBatchHash, assembler.elementBatch.batchHash);
assert.equal(assembled.elementStates.E1.memory, 1.25);

const arena = createNonlinearBatchStateArena({
  runId: 'm7-state',
  elementIds: batch.elementIds,
  initialStates: committedElementStates,
  numericWidths: [2, 1, 3],
});
const initial = arena.snapshot();
arena.beginTrial();
arena.writeTrial('E1', { memory: 99, yielded: true });
arena.writeTrialNumeric('E1', [1.5, 2.5]);
const trial = arena.snapshot();
assert.equal(trial.committedHash, initial.committedHash, 'P9-GPU-NL-03 trial cannot mutate committed bytes');
assert.notEqual(trial.trialHash, initial.trialHash);
const rolledBack = arena.rollback();
assert.equal(rolledBack.committedHash, initial.committedHash);
assert.equal(rolledBack.trialHash, initial.trialHash, 'P9-GPU-NL-04 rejected trial byte parity');
assert.deepEqual(arena.readCommitted('E1'), committedElementStates.E1);
assert.deepEqual(Array.from(arena.readCommittedNumeric('E1')), [0, 0]);
arena.beginTrial();
arena.writeTrial('E2', { memory: 7 });
arena.commit();
assert.deepEqual(arena.readCommitted('E2'), { memory: 7 });
assert.throws(() => arena.beginTrial('other'), { code: 'NONLINEAR_STATE_OWNER_MISMATCH' });

const productionGpu = partitionNonlinearBatchCapability(batch, { target: 'gpu', production: true });
assert.equal(productionGpu.ok, false, 'P9-GPU-NL-09 production GPU is fail closed');
assert.equal(productionGpu.unsupported.length, entries.length);
assert.ok(productionGpu.unsupported.every((row) => row.reason === 'GPU_NONLINEAR_NOT_DESIGN_QUALIFIED'));
const cpuPartition = partitionNonlinearBatchCapability(batch, { target: 'cpu', production: true });
assert.equal(cpuPartition.ok, true);
assert.equal(cpuPartition.supported.at(-1).matrixClass, 'general', 'P9-GPU-NL-10 general matrix stays on CPU');

const shadowEntry = manufacturedEntry('GPU-FIBER', [0], 'monotonic-epp-fiber-shadow', 'SHADOW', ([x]) => ({
  force: [x], tangent: [[1]], state: {}, energy: 0,
}));
const shadowFrameEntry = manufacturedEntry('GPU-FRAME', [0], 'elastic-frame-matrix-shadow', 'SHADOW', ([x]) => ({
  force: [x], tangent: [[1]], state: {}, energy: 0,
}));
const shadowBatch = createNonlinearElementBatch([shadowEntry, shadowFrameEntry]);
assert.equal(partitionNonlinearBatchCapability(shadowBatch, { target: 'gpu', production: false }).ok, true);
const shadowGeneralBatch = createNonlinearElementBatch([{ ...shadowFrameEntry, requiredMatrixClass: 'general' }]);
const shadowGeneralPartition = partitionNonlinearBatchCapability(shadowGeneralBatch, { target: 'gpu', production: false });
assert.equal(shadowGeneralPartition.ok, false);
assert.equal(shadowGeneralPartition.unsupported[0].reason, 'GPU_MATRIX_CLASS_UNSUPPORTED');
const shadowArena = createNonlinearBatchStateArena({
  runId: 'gpu-shadow', elementIds: ['GPU-FIBER'], numericWidths: [4],
});
const fiberPayload = {
  positions: [-0.1, 0.1], areas: [0.02, 0.02], moduli: [200000, 200000], yieldStress: [250, 250],
  axialStrains: [0.0005], curvatures: [0.001],
};
const fakeGpu = {
  async execute(operation, payload) {
    if (operation === 'fiberSampleBatch') return { values: referenceFiberSampleBatch(payload) };
    if (operation === 'frameMatrixBatch') return { values: referenceFrameMatrixBatch(payload) };
    throw new Error(`Unexpected operation ${operation}`);
  },
};
const gpuCandidate = await executeNonlinearGpuCandidate({
  operation: 'fiberSampleBatch', payload: fiberPayload, backend: fakeGpu,
  stateArena: shadowArena, stateElementId: 'GPU-FIBER', runId: 'gpu-shadow',
});
assert.equal(gpuCandidate.ok, true, gpuCandidate.reason);
assert.equal(gpuCandidate.parity.ok, true, 'P9-GPU-NL-05 GPU shadow numeric parity');
assert.equal(gpuCandidate.state.committedUnchanged, true, 'P9-GPU-NL-06 committed arena isolation');
assert.equal(gpuCandidate.energies.physicalEnergy, false, 'shadow diagnostic is not mislabeled as physical energy');
shadowArena.rollback();
const frameArena = createNonlinearBatchStateArena({ runId: 'gpu-frame-shadow', elementIds: ['GPU-FRAME'], numericWidths: [144] });
const framePayload = {
  properties: [200000, 80000, 0.02, 0.00008, 0.00012, 0.00002, 3],
  responseTransforms: identityMatrixFlat(12),
};
const frameCandidate = await executeNonlinearGpuCandidate({
  operation: 'frameMatrixBatch', payload: framePayload, backend: fakeGpu,
  stateArena: frameArena, stateElementId: 'GPU-FRAME', runId: 'gpu-frame-shadow',
});
assert.equal(frameCandidate.ok, true, frameCandidate.reason);
assert.equal(frameCandidate.parity.ok, true, 'P9-GPU-NL-05 frame matrix shadow parity');
assert.equal(frameCandidate.state.committedUnchanged, true, 'P9-GPU-NL-06 frame state isolation');
frameArena.rollback();
const beforeMismatch = shadowArena.snapshot();
const mismatch = await executeNonlinearGpuCandidate({
  operation: 'fiberSampleBatch', payload: fiberPayload,
  backend: { async execute() { return { values: new Float32Array(4) }; } },
  stateArena: shadowArena, stateElementId: 'GPU-FIBER', runId: 'gpu-shadow',
});
assert.equal(mismatch.ok, false);
assert.equal(mismatch.reason, 'NONLINEAR_GPU_PARITY_FAILED');
assert.equal(shadowArena.snapshot().committedHash, beforeMismatch.committedHash);
assert.equal(shadowArena.snapshot().trialHash, beforeMismatch.trialHash);

const perfEntries = Array.from({ length: 128 }, (_item, index) => manufacturedEntry(
  `P${index}`, [0], 'perf-linear', 'P', ([x]) => ({ force: [3 * x], tangent: [[3]], state: { x }, energy: 1.5 * x * x }),
));
const perfBatch = createNonlinearElementBatch(perfEntries);
const perfEvaluator = createCpuNonlinearBatchEvaluator(perfBatch);
const elementStarted = performance.now();
const perfResult = await perfEvaluator.evaluate({ fullDisplacement: [0.2], fullDofCount: 1, reducedDisplacement: [0.2], committedElementStates: {} });
const elementDurationMs = performance.now() - elementStarted;
assert.equal(perfResult.ok, true);
const perfPattern = fakeIdentityPattern(perfEntries.length);
const assemblyStarted = performance.now();
assembleNonlinearBatchTangent(perfPattern, perfBatch, perfResult.tangents);
const assemblyDurationMs = performance.now() - assemblyStarted;
const stateStarted = performance.now();
const perfArena = createNonlinearBatchStateArena({ runId: 'perf', elementIds: perfBatch.elementIds });
perfArena.beginTrial(); perfArena.rollback();
const stateDurationMs = performance.now() - stateStarted;

console.log(JSON.stringify({
  ok: true,
  verificationIds: [
    'P9-GPU-NL-01', 'P9-GPU-NL-02', 'P9-GPU-NL-03', 'P9-GPU-NL-04', 'P9-GPU-NL-05',
    'P9-GPU-NL-06', 'P9-GPU-NL-07', 'P9-GPU-NL-08', 'P9-GPU-NL-09', 'P9-GPU-NL-10',
    'P9-REF-07', 'P9-REF-08', 'P9-REF-09', 'P9-PERF-12',
  ],
  batchHash: batch.batchHash,
  reductionHash: batchAssembly.reductionHash,
  elementCount: entries.length,
  groupCount: batch.groups.length,
  rollbackByteParity: rolledBack.trialHash === initial.trialHash,
  gpuShadowQualified: true,
  productionGpuBlocked: true,
  performance: {
    tier: 'focused-diagnostic', elementCount: perfEntries.length,
    elementDurationMs, stateDurationMs, assemblyDurationMs,
    reusableWorkspaceBytes: perfEvaluator.telemetry.reusableWorkspaceBytes,
    perElementCommittedStateCloneCount: perfEvaluator.telemetry.perElementCommittedStateCloneCount,
  },
}, null, 2));

function twoDofDomain() {
  const result = buildCanonicalAnalysisDomain({
    schemaVersion: 5,
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 1, y: 0, z: 0, support: 'custom', fix: [false, false, true, true, true, true] },
    ],
    members: [], materials: [], sections: [], loads: [], loadCases: [], loadCombinations: [],
    analysisSettings: { includeSelfWeight: false },
  });
  assert.equal(result.ok, true, result.reason);
  return result;
}

function manufacturedEntry(id, dofs, type, sectionId, evaluate, requiredMatrixClass = 'spd') {
  const kernel = createNonlinearElementContract({
    type, stateVersion: `${type}-state-v1`, dofCount: dofs.length,
    evaluate({ trialKinematics, committedState }) {
      const output = evaluate(Array.from(trialKinematics.uGlobal), committedState || {});
      return {
        resistingForceGlobal: output.force,
        tangentGlobal: output.tangent,
        trialState: output.state,
        energies: { strain: output.energy },
        diagnostics: { type },
        localResponse: { u: Array.from(trialKinematics.uGlobal) },
      };
    },
  });
  return Object.freeze({ id, dofs: Int32Array.from(dofs), descriptor: { id, sectionId }, requiredMatrixClass, kernel });
}

async function evaluateObjectReference(items, fullDisplacement, reducedDisplacement, states) {
  const forces = [];
  const tangents = [];
  const matrices = [];
  const trialStates = [];
  const energies = [];
  for (const entry of items) {
    const response = await entry.kernel.evaluate({
      element: entry.descriptor,
      committedState: structuredClone(states[entry.id] || {}),
      trialKinematics: { uGlobal: Array.from(entry.dofs, (dof) => fullDisplacement[dof]), fullDisplacement, reducedDisplacement, lambda: 1 },
      mode: 'static',
    });
    forces.push(...response.resistingForceGlobal);
    tangents.push(...response.tangentGlobal.flat());
    matrices.push(response.tangentGlobal);
    trialStates.push(response.trialState);
    energies.push(response.energies);
  }
  return { forces, tangents, matrices, states: trialStates, energies };
}

function loadPattern(sourceDomain, reduced) {
  const referenceReduced = Float64Array.from(reduced);
  const referenceFull = new Float64Array(sourceDomain.constraint.fullDofCount);
  referenceFull[6] = referenceReduced[0]; referenceFull[7] = referenceReduced[1];
  return {
    ok: true,
    constantFull: new Float64Array(sourceDomain.constraint.fullDofCount),
    referenceFull,
    constantReduced: new Float64Array(sourceDomain.constraint.reducedDofCount),
    referenceReduced,
    trace: [],
  };
}

function fakeIdentityPattern(elementCount) {
  return Object.freeze({
    version: 'p9-m2-typed-reduced-sparse-v1', format: 'csc', rowCount: 1, colCount: 1, nrows: 1, ncols: 1,
    nnz: 1, colPtr: Int32Array.of(0, 1), rowIdx: Int32Array.of(0), values: new Float64Array(1),
    patternHash: 'focused-performance-pattern', elementCount,
    elementScatters: Array.from({ length: elementCount }, (_item, elementIndex) => ({
      elementIndex, dofCount: 1, termCount: 1,
      matrixIndices: Int32Array.of(0), valueIndices: Int32Array.of(0), coefficients: Float64Array.of(1),
    })),
  });
}

function identityMatrixFlat(size) {
  const output = new Float32Array(size * size);
  for (let index = 0; index < size; index += 1) output[index * size + index] = 1;
  return output;
}

function vectorClose(actual, expected, tolerance) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => assert.ok(Math.abs(Number(value) - Number(expected[index])) <= tolerance, `${index}: ${value} vs ${expected[index]}`));
}
