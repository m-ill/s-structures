import assert from 'node:assert/strict';
import {
  referenceCsrSpmv,
  referenceDeterministicReduction,
  referenceFiberSampleBatch,
  referenceFrameMatrixBatch,
  referenceJacobi,
  referenceVectorAxpy,
  referenceVectorScale,
  webGpuShaderCatalog,
} from '../src/compute/index.js';
import { localK12 } from '../src/solver/linear3dElement.js';

assert.deepEqual([...referenceVectorScale([1, -2, 3], 2.5)], [2.5, -5, 7.5], 'P9-GPU-NUM-01 vector scale');
assert.deepEqual([...referenceVectorAxpy([1, 2], [3, 4], -0.5)], [2.5, 3], 'P9-GPU-NUM-02 AXPY');
const reduction = referenceDeterministicReduction([3, -2, 5, -2, 5]);
assert.deepEqual(reduction, { sum: 9, min: -2, max: 5, minIndex: 1, maxIndex: 2 }, 'P9-GPU-NUM-03 stable extrema tie');
assert.deepEqual(referenceDeterministicReduction([3, -2, 5, -2, 5]), reduction, 'P9-GPU-NUM-04 repeat determinism');

const matrix = {
  rowPtr: [0, 2, 5, 7],
  colIdx: [0, 1, 0, 1, 2, 1, 2],
  values: [4, 1, 1, 3, 1, 1, 2],
};
assert.deepEqual([...referenceCsrSpmv(matrix, [1, 2, 3])], [6, 10, 8], 'P9-GPU-NUM-05 CSR SpMV');
const random = deterministicCsr(40, 0x4d34);
const randomResult = referenceCsrSpmv(random.matrix, random.x);
assert.ok(randomResult.every(Number.isFinite), 'P9-GPU-NUM-06 structural/random CSR finite');
assert.deepEqual([...referenceJacobi([2, 4, 8], [4, 8, 16])], [2, 2, 2], 'P9-GPU-NUM-07 Jacobi');
assert.throws(() => referenceJacobi([2, 0], [1, 1]), { code: 'WEBGPU_JACOBI_DIAGONAL_INVALID' }, 'P9-GPU-NUM-08 zero diagonal fail closed');
assert.throws(() => referenceJacobi([2, -1], [1, 1]), { code: 'WEBGPU_JACOBI_DIAGONAL_INVALID' });

const fiber = referenceFiberSampleBatch({
  positions: [-0.1, 0.1],
  areas: [0.01, 0.01],
  moduli: [200000000, 200000000],
  yieldStress: [250000, 250000],
  axialStrains: [0, 0.002],
  curvatures: [0.001, 0],
});
assert.ok(Math.abs(fiber[0]) < 1e-3, 'P9-GPU-NUM-09 symmetric fiber axial force');
assert.ok(fiber[1] > 0, 'P9-GPU-NUM-09 fiber moment sign');
assert.ok(fiber[4] > 0 && fiber[6] === 0, 'P9-GPU-NUM-10 yielded fiber state/tangent');

const identity = identity12();
const properties = Float32Array.of(200000000, 76923076.923, 0.02, 8e-5, 4e-5, 1e-5, 3);
const frame = referenceFrameMatrixBatch({ properties, responseTransforms: identity });
const expectedLocal = localK12(...properties).flat();
assertRelativeArray(frame, expectedLocal, 2e-6, 'P9-GPU-NUM-11 local frame matrix');
const transformed = Float32Array.from(identity);
for (let row = 0; row < 12; row += 1) transformed[row * 12 + 11] = 0;
const released = referenceFrameMatrixBatch({ properties, responseTransforms: transformed });
for (let index = 0; index < 12; index += 1) {
  assert.equal(released[11 * 12 + index], 0, 'P9-GPU-NUM-12 release projection row');
  assert.equal(released[index * 12 + 11], 0, 'P9-GPU-NUM-12 release projection column');
}

const shaders = webGpuShaderCatalog();
assert.equal(shaders.length, 7);
assert.equal(new Set(shaders.map((row) => row.shaderHash)).size, shaders.length, 'single shader owner with unique hashes');
assert.ok(shaders.every((row) => !/atomic/i.test(row.source)), 'M4 kernels do not use nondeterministic float atomics');
assert.ok(shaders.find((row) => row.name === 'deterministicReduction').source.includes('@workgroup_size(1)'));

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['P9-GPU-NUM-01~12'],
  shaderCount: shaders.length,
  randomCsrRows: randomResult.length,
  frameValueCount: frame.length,
}, null, 2));

function identity12() {
  const output = new Float32Array(144);
  for (let index = 0; index < 12; index += 1) output[index * 12 + index] = 1;
  return output;
}

function deterministicCsr(size, seed) {
  let state = seed >>> 0;
  const next = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x100000000; };
  const rowPtr = [0];
  const colIdx = [];
  const values = [];
  for (let row = 0; row < size; row += 1) {
    const columns = [...new Set([row, Math.max(0, row - 1), Math.min(size - 1, row + 1), Math.trunc(next() * size)])].sort((a, b) => a - b);
    for (const column of columns) { colIdx.push(column); values.push(Math.fround(0.25 + next())); }
    rowPtr.push(values.length);
  }
  return { matrix: { rowPtr, colIdx, values }, x: Float32Array.from({ length: size }, () => Math.fround(next() - 0.5)) };
}

function assertRelativeArray(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label} length`);
  for (let index = 0; index < actual.length; index += 1) {
    const scale = Math.max(1, Math.abs(expected[index]));
    assert.ok(Math.abs(actual[index] - expected[index]) <= tolerance * scale, `${label}[${index}]`);
  }
}
