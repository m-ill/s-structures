import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createCpuSparseBackend,
  createCscFromTriplets,
  createSparseFactorRuntime,
  createWasmSparseBackend,
  cscMatVec,
  cscToCsr,
  csrToCsc,
  resolveCpuWasmSparseBackend,
  validateCommonSparseMatrix,
} from '../src/compute/index.js';

const spd = createCscFromTriplets(3, 3, [
  [0, 0, 4], [0, 1, 1],
  [1, 0, 1], [1, 1, 3], [1, 2, 1],
  [2, 1, 1], [2, 2, 2],
]);
assert.equal(validateCommonSparseMatrix(spd), true, 'P9-CPU-01 typed CSC validation');
assert.equal(spd.version, 'p9-m2-common-sparse-matrix-v1');
const csr = cscToCsr(spd);
assert.equal(validateCommonSparseMatrix(csr), true, 'P9-CPU-01 typed CSR validation');
assert.deepEqual(Array.from(cscMatVec(spd, [1, 2, 3])), [6, 10, 8], 'P9-CPU-02 CSC matvec');
assert.deepEqual(Array.from(cscMatVec(csrToCsc(csr), [1, 2, 3])), [6, 10, 8], 'P9-CPU-02 CSR/CSC parity');

const runtime = createSparseFactorRuntime({ maxBytes: 2 * 1024 * 1024 });
const first = runtime.prepare(spd, { matrixClass: 'spd' });
assert.equal(first.ok, true, 'P9-CPU-03 SPD factor');
const rhsList = [[1, 2, 3], [3, 2, 1]];
const multi = runtime.solveMultiple(first.handle, rhsList);
assert.equal(multi.ok, true, 'P9-CPU-04 SPD multi solve');
assert.ok(multi.results.every((row) => row.diagnostics.relativeResidual < 1e-12));

const second = runtime.prepare(spd, { matrixClass: 'spd' });
assert.equal(second.handle.symbolicReused, true, 'P9-CPU-07 symbolic reuse');
assert.equal(second.handle.numericReused, true, 'P9-CPU-07 numeric reuse');
const changed = createCscFromTriplets(3, 3, [
  [0, 0, 5], [0, 1, 1],
  [1, 0, 1], [1, 1, 3], [1, 2, 1],
  [2, 1, 1], [2, 2, 2],
]);
const changedFactor = runtime.prepare(changed, { matrixClass: 'spd' });
assert.equal(changedFactor.handle.symbolicReused, true, 'P9-CPU-08 pattern reuse after value change');
assert.equal(changedFactor.handle.numericReused, false, 'P9-CPU-08 numeric invalidation after value change');

for (let index = 0; index < rhsList.length; index += 1) {
  const single = runtime.solve(first.handle, rhsList[index]);
  closeVector(multi.results[index].x, single.x, 1e-13, `P9-CPU-09 channel ${index}`);
}
assert.deepEqual(multi.diagnostics.eventOrder, [0, 1], 'P9-CPU-10 deterministic channel order');

const general = createCscFromTriplets(3, 3, [
  [0, 0, 0], [0, 1, 2], [0, 2, -1],
  [1, 0, 2], [1, 1, -2], [1, 2, 4],
  [2, 0, -1], [2, 1, 0.5], [2, 2, -1],
]);
const generalFactor = runtime.prepare(general, { matrixClass: 'general' });
assert.equal(generalFactor.ok, true, 'P9-CPU-05 sparse partial-pivot LU');
const generalResult = runtime.solve(generalFactor.handle, [-2, -2, 0]);
assert.equal(generalResult.ok, true);
assert.ok(generalResult.diagnostics.relativeResidual < 1e-12, 'P9-CPU-05 backward error');

const singular = createCscFromTriplets(2, 2, [
  [0, 0, 1], [0, 1, 2], [1, 0, 2], [1, 1, 4],
]);
const singularResult = runtime.prepare(singular, { matrixClass: 'general' });
assert.equal(singularResult.ok, false, 'P9-CPU-06 singular fixture');
assert.equal(singularResult.reason, 'SINGULAR_PIVOT');
assert.equal(singularResult.diagnostics.denseFallbackAllocated, false);
const asymmetric = createCscFromTriplets(2, 2, [[0, 0, 2], [0, 1, 1], [1, 1, 2]]);
assert.equal(runtime.prepare(asymmetric, { matrixClass: 'spd' }).reason, 'MATRIX_NOT_SYMMETRIC');
assert.equal(runtime.solve(first.handle, [1]).reason, 'INVALID_RHS');
const mutable = createCscFromTriplets(2, 2, [[0, 0, 2], [1, 1, 2]]);
const mutableFactor = runtime.prepare(mutable, { matrixClass: 'spd' });
mutable.values[0] = 3;
assert.equal(runtime.solve(mutableFactor.handle, [1, 1]).reason, 'FACTOR_VALUES_CHANGED');

const cancelled = runtime.prepare(spd, { matrixClass: 'spd', signal: { aborted: true } });
assert.equal(cancelled.reason, 'CANCELLED', 'P9-CPU-11 cooperative cancellation');
const bounded = createSparseFactorRuntime({ maxBytes: 64 });
assert.equal(bounded.prepare(spd, { matrixClass: 'spd' }).reason, 'MEMORY_BUDGET_EXCEEDED', 'P9-CPU-11 OOM preflight');
assert.deepEqual(resolveCpuWasmSparseBackend({ preference: 'wasm' }), {
  ok: false,
  backend: null,
  reason: 'WASM_BACKEND_UNAVAILABLE',
  fallbackUsed: false,
}, 'P9-CPU-12 missing backend fail closed');

for (const handle of [first.handle, second.handle, changedFactor.handle, generalFactor.handle, mutableFactor.handle]) runtime.release(handle);
const disposed = runtime.dispose();
assert.equal(disposed.allocatedBytes, 0, 'P9-CMP-11 allocation/free balance');
assert.equal(disposed.allocationBalanced, true, 'P9-CMP-12 disposed runtime balance');
bounded.dispose();

const cpu = createCpuSparseBackend();
const cpuCapabilities = cpu.preflight({ matrixClass: 'spd' }).capabilities;
assert.equal(cpuCapabilities.simd.enabled, false, 'P9-CPU-13 explicit SIMD capability');
assert.equal(cpuCapabilities.threads.enabled, false, 'P9-CPU-14 explicit thread capability');
const cpuMulti = cpu.solveMultiple(spd, rhsList, { matrixClass: 'spd' });
assert.equal(cpuMulti.ok, true);
assert.deepEqual(cpuMulti.diagnostics.eventOrder, [0, 1]);
assert.equal(cpuMulti.diagnostics.denseConversionCount, 0);

const wasmBytes = await readFile(new URL('../src/nonlinear/equilibrium/backends/phase8_solver.wasm', import.meta.url));
const module = new WebAssembly.Module(wasmBytes);
const exports = WebAssembly.Module.exports(module).map((row) => row.name);
for (const name of ['p9_solver_abi_version', 'p9_solver_capabilities', 'p9_solve_csr_multi']) {
  assert.ok(exports.includes(name), `P9-CPU-09 missing native export ${name}`);
}
const wasm = await createWasmSparseBackend({ wasmBytes });
assert.equal(wasm.p9Preflight().wasmAbiVersion, 2);
const wasmMulti = wasm.solveMultiple(spd, rhsList, { matrixClass: 'spd', relativeTolerance: 1e-12 });
assert.equal(wasmMulti.ok, true, JSON.stringify(wasmMulti.diagnostics));
assert.equal(wasmMulti.diagnostics.nativeMultiRhs, true);
for (let index = 0; index < rhsList.length; index += 1) {
  closeVector(wasmMulti.results[index].x, cpuMulti.results[index].x, 1e-11, `P9-CPU-10 WASM channel ${index}`);
}
assert.equal(wasm.snapshot().balanced, true, 'P9-CPU-12 WASM allocation/free balance');
assert.equal(wasm.snapshot().outstandingBytes, 0);
cpu.dispose();

const mediumDimension = 1200;
const mediumTriplets = [];
for (let index = 0; index < mediumDimension; index += 1) {
  mediumTriplets.push([index, index, 4]);
  if (index > 0) mediumTriplets.push([index, index - 1, -1], [index - 1, index, -1]);
}
const medium = createCscFromTriplets(mediumDimension, mediumDimension, mediumTriplets);
const mediumCpu = createCpuSparseBackend({ maxBytes: 64 * 1024 * 1024 });
const mediumResult = mediumCpu.solve(medium, new Float64Array(mediumDimension).fill(1), { matrixClass: 'spd' });
assert.equal(mediumResult.ok, true, 'P9-CPU-11 M-tier sparse-kernel memory proxy');
assert.ok(mediumCpu.snapshot().peakBytes < 64 * 1024 * 1024);
assert.equal(mediumResult.diagnostics.denseMatrixAllocated, false);
assert.equal(mediumCpu.dispose().allocationBalanced, true);

console.log(JSON.stringify({
  ok: true,
  requirements: ['P9-CPU-01~14', 'P9-CMP-11~12'],
  cpuResidualMax: Math.max(...cpuMulti.results.map((row) => row.diagnostics.relativeResidual)),
  wasmResidualMax: Math.max(...wasmMulti.results.map((row) => row.diagnostics.relativeResidual)),
  wasmMemory: wasm.snapshot(),
  mediumKernelDofs: mediumDimension,
}, null, 2));

function closeVector(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label} length`);
  for (let index = 0; index < expected.length; index += 1) {
    assert.ok(Math.abs(actual[index] - expected[index]) <= tolerance, `${label}[${index}]`);
  }
}
