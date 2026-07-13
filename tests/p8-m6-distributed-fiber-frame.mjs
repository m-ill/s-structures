import assert from 'node:assert/strict';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import { createEquilibriumAssembler } from '../src/nonlinear/equilibrium/assembler.js';
import { createDistributedFiberFrame3dKernel } from '../src/nonlinear/elements/distributedFiberFrame3d.js';
import { buildHingedFrame3dEntries } from '../src/nonlinear/elements/hingedFrame3d.js';
import { createSteelBilinearMaterial } from '../src/nonlinear/fiber/materialModels.js';
import { classifyPushoverEvents } from '../src/nonlinear/pushover/results.js';

const E = 200000;
const A = 0.01;
const I = 0.000025;
const model = {
  schemaVersion: 5,
  nodes: [{ id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 4, y: 0, z: 0 }],
  members: [{
    id: 'M1', type: 'frame', behavior: 'frame', n1: 'N1', n2: 'N2', matId: 'MAT', secId: 'SEC',
    localAxis: { refVector: [0, 0, 1], roll: 0, strongAxis: 'z' },
    nonlinear: { formulation: 'distributed-plasticity', hinges: [] },
  }],
  materials: [{ id: 'MAT', version: 1, E, G: 77000, Fy: 250 }],
  sections: [{ id: 'SEC', version: 1, shape: 'CUSTOM', A, Iy: I, Iz: I, J: 2 * I }],
  hingeProperties: [], nonlinearMaterials: [], nonlinearSections: [], linkProperties: [],
  timeHistoryFunctions: [], analysisStates: [], loads: [], loadCases: [], loadCombinations: [],
};
const domain = buildCanonicalAnalysisDomain(model);
assert.equal(domain.ok, true, domain.reason);
const descriptor = domain.elements[0];
const material = createSteelBilinearMaterial({ id: 'steel', E: E * 1e6, Fy: 250 * 1e6, hardeningRatio: 0.01 });
const fiberSection = {
  id: 'FIBER:M1',
  contentHash: 'test-fiber-section',
  mesh: {
    id: 'SEC-FIBER',
    fibers: [
      { id: 'F1', area: A / 4, y: -0.05, z: -0.05, materialId: 'steel' },
      { id: 'F2', area: A / 4, y: 0.05, z: -0.05, materialId: 'steel' },
      { id: 'F3', area: A / 4, y: -0.05, z: 0.05, materialId: 'steel' },
      { id: 'F4', area: A / 4, y: 0.05, z: 0.05, materialId: 'steel' },
    ],
  },
  materials: { steel: material },
};

const kernel = createDistributedFiberFrame3dKernel(descriptor, fiberSection, { integrationPoints: 5 });
const zero = evaluate(kernel, new Array(12).fill(0));
assert.equal(zero.version, 'p8-m6-distributed-fiber-frame-3d-v1');
assert.equal(zero.trialState.integrationPointCount, 5);
assert.equal(zero.localResponse.distributedFiber.points.length, 5);

// NL-FIB-14: the fiber element reproduces elastic EA/EI and exposes a
// consistent element tangent before yielding.
const elasticU = new Array(12).fill(0);
elasticU[6] = 1e-4;
elasticU[11] = 1e-4;
const elastic = evaluate(kernel, elasticU);
assert.ok(maxAbs(elastic.diagnostics.localCorrectionNorm) <= 1e-10, `elastic correction ${elastic.diagnostics.localCorrectionNorm}`);
const h = 1e-7;
for (const column of [6, 11]) {
  const plus = elasticU.slice();
  const minus = elasticU.slice();
  plus[column] += h;
  minus[column] -= h;
  const fp = evaluate(kernel, plus).resistingForceGlobal;
  const fm = evaluate(kernel, minus).resistingForceGlobal;
  const finiteDifference = fp.map((value, row) => (value - fm[row]) / (2 * h));
  const error = maxAbs(finiteDifference.map((value, row) => value - elastic.tangentGlobal[row][column]));
  assert.ok(error <= 2e-4 * Math.max(1, maxAbs(finiteDifference)), `column ${column} tangent error ${error}`);
}

// A yielded trial carries section history only through the returned trial
// state. Re-evaluating from the original committed state is deterministic.
const plasticU = new Array(12).fill(0);
plasticU[11] = 0.2;
const plasticA = evaluate(kernel, plasticU);
const plasticB = evaluate(kernel, plasticU);
assert.deepEqual(plasticA.trialState.fiberSections, plasticB.trialState.fiberSections);
assert.ok(plasticA.diagnostics.distributedFiberYieldedPointCount > 0);
const acceptedUnload = evaluate(kernel, new Array(12).fill(0), plasticA.trialState);
assert.ok(Object.values(acceptedUnload.trialState.fiberSections).every((state) => state.step === 2));
assert.ok(acceptedUnload.energies.fiberDissipated >= 0);
const plasticPlus = plasticU.slice();
const plasticMinus = plasticU.slice();
plasticPlus[11] += 1e-6;
plasticMinus[11] -= 1e-6;
const plasticFp = evaluate(kernel, plasticPlus).resistingForceGlobal;
const plasticFm = evaluate(kernel, plasticMinus).resistingForceGlobal;
const plasticFiniteDifference = plasticFp.map((value, row) => (value - plasticFm[row]) / 2e-6);
const plasticTangentError = maxAbs(plasticFiniteDifference.map((value, row) => value - plasticA.tangentGlobal[row][11]));
assert.ok(plasticTangentError <= 2e-3 * Math.max(1, maxAbs(plasticFiniteDifference)), `plastic tangent error ${plasticTangentError}`);

// Production element routing selects the distributed formulation and blocks
// missing fiber data rather than falling back to an elastic frame.
assert.throws(
  () => buildHingedFrame3dEntries(domain),
  (error) => error?.code === 'DISTRIBUTED_FIBER_SECTION_REQUIRED',
);
const entry = buildHingedFrame3dEntries(domain, { fiberSections: { M1: fiberSection }, integrationPoints: 4 })[0];
assert.equal(entry.usesDistributedFiber, true);
assert.equal(entry.handlesMechanicalMemberLoads, true);
assert.equal(entry.requiredMatrixClass, 'general');
assert.equal(evaluate(entry.kernel, elasticU).trialState.integrationPointCount, 4);
const distributedYieldEvents = classifyPushoverEvents([{
  step: 1,
  baseShear: 10,
  controlDisplacement: 0.01,
  hinges: [],
  memberStates: { M1: { overall: 'yielded', distributed: { yielded: true } } },
}], { mechanismHingeCount: 1 });
assert.deepEqual(distributedYieldEvents.find((event) => event.type === 'first-yield').hingeIds, ['M1:distributed']);
assert.ok(distributedYieldEvents.some((event) => event.type === 'mechanism'));

// Mechanical fixed-end actions enter each section even when all joint DOFs
// are restrained, so member loads can trigger fiber yielding.
const loadedModel = structuredClone(model);
loadedModel.nodes[0].support = 'fixed';
loadedModel.nodes[1].support = 'fixed';
loadedModel.loads = [{ id: 'W', type: 'udl', member: 'M1', w: 500, dir: '-z', case: 'D' }];
loadedModel.loadCases = [{ id: 'D', type: 'dead' }];
const loadedDomain = buildCanonicalAnalysisDomain(loadedModel, { factors: { D: 1 } });
assert.equal(loadedDomain.ok, true, loadedDomain.reason);
const loadedEntry = buildHingedFrame3dEntries(loadedDomain, { fiberSections: { M1: fiberSection }, integrationPoints: 5 })[0];
const loadedAssembler = createEquilibriumAssembler({ domain: loadedDomain, elements: [loadedEntry] });
const loaded = await loadedAssembler.evaluate({ q: [], lambda: 1, mode: 'static' });
assert.equal(loaded.ok, true, JSON.stringify(loaded));
const loadedFiber = loaded.elementResponses.M1.localResponse.distributedFiber;
assert.ok(loadedFiber.points.some((point) => Math.hypot(point.force.My, point.force.Mz) > 1));
assert.ok(loadedFiber.points.some((point) => point.yieldedFiberCount > 0));

// Integration-point refinement is exact in the elastic range and remains
// stable for the same member/section contract.
const refinement = [2, 3, 4, 5].map((integrationPoints) => {
  const candidate = createDistributedFiberFrame3dKernel(descriptor, fiberSection, { integrationPoints });
  return { integrationPoints, force: evaluate(candidate, elasticU).resistingForceGlobal };
});
for (let index = 1; index < refinement.length; index += 1) {
  assert.ok(maxAbs(refinement[index].force.map((value, row) => value - refinement[0].force[row])) <= 1e-10);
}

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-FIB-14'],
  integrationPoints: refinement.map((row) => row.integrationPoints),
  yieldedPointCount: plasticA.diagnostics.distributedFiberYieldedPointCount,
  plasticCorrectionNorm: plasticA.diagnostics.localCorrectionNorm,
  plasticTangentError,
  fixedEndLoadYielded: true,
  productionRoute: entry.kernel.type,
  rollbackDeterministic: true,
}, null, 2));

function evaluate(candidate, uGlobal, committedState = null) {
  return candidate.evaluate({
    trialKinematics: { uGlobal, lambda: 0 },
    committedState,
    mode: 'static',
  });
}

function maxAbs(values) {
  if (typeof values === 'number') return Math.abs(values);
  return Math.max(0, ...values.map((value) => Math.abs(Number(value))));
}
