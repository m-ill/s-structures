import assert from 'node:assert/strict';
import {
  buildShellDeterministicGatherPayload,
  buildShellElementScatters,
  buildShellSoaBatch,
  executeNativeShellGpuBatch,
  packDomainBinary,
  prepareShellTangentPayload,
  runShellCpuReference,
  runShellGpuBatch,
  validateDomainBinary,
} from '../src/index.js';
import {
  WEBGPU_KERNEL_OPERATIONS,
  referenceShellDeterministicGather,
  referenceShellStressRecovery,
  referenceShellTangentBatch,
  webGpuShader,
} from '../src/compute/backends/webgpu/index.js';

const nodes = [{ id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 2, y: 0, z: 0 }, { id: 'N3', x: 2, y: 2, z: 0 }, { id: 'N4', x: 0, y: 2, z: 0 }];
const map = new Map(nodes.map((node, index) => [node.id, index]));
const base = { nodes, nodeIds: nodes.map((node) => node.id), material: { E: 30e9, nu: 0.2 }, t: 0.2 };
const batch = buildShellSoaBatch([{ ...base, id: 'M', formulation: 'membrane' }, { ...base, id: 'P', formulation: 'plate' }, { ...base, id: 'S', formulation: 'shell' }], map);
assert.equal(batch.ok, true);
assert.equal(batch.elementCount, 3);
assert.ok(batch.typeCodes instanceof Uint8Array);
assert.ok(batch.nodeIndices instanceof Int32Array);
assert.ok(batch.properties instanceof Float64Array);
const scatters = buildShellElementScatters(batch);
assert.equal(scatters.length, 3);
assert.equal(scatters[0].dofs.length, 24);
assert.ok(WEBGPU_KERNEL_OPERATIONS.includes('shellTangentBatch'));
assert.ok(WEBGPU_KERNEL_OPERATIONS.includes('shellDeterministicGather'));
assert.ok(WEBGPU_KERNEL_OPERATIONS.includes('shellStressRecovery'));
const tangentPayload = prepareShellTangentPayload(batch);
const nativeReference = referenceShellTangentBatch(tangentPayload);
assert.equal(nativeReference.length, batch.elementCount * 576);
const gatherPayload = buildShellDeterministicGatherPayload(batch, scatters);
const gatheredA = referenceShellDeterministicGather({ ...gatherPayload, elementValues: nativeReference });
const gatheredB = referenceShellDeterministicGather({ ...gatherPayload, elementValues: nativeReference });
assert.deepEqual(gatheredA, gatheredB);
const recoveryPayload = {
  operators: Float32Array.from({ length: batch.elementCount * 3 * 24 }, (_, index) => (index % 25 === 0 ? 1 : 0)),
  displacements: Float32Array.from({ length: batch.elementCount * 24 }, (_, index) => index / 1000),
  elementCount: batch.elementCount,
  responseStride: 3,
  dofStride: 24,
};
const recovered = referenceShellStressRecovery(recoveryPayload);
assert.equal(recovered.length, batch.elementCount * 3);
for (const shaderName of ['shellTangentBatch', 'shellDeterministicGather', 'shellStressRecovery']) {
  const shader = webGpuShader(shaderName);
  assert.match(shader.source, /@compute/);
  assert.doesNotMatch(shader.source, /atomic/i);
}
const nativeFallback = await executeNativeShellGpuBatch({
  assertReady() { throw Object.assign(new Error('injected unavailable device'), { code: 'WEBGPU_DEVICE_UNAVAILABLE' }); },
}, batch, { scatters, recovery: recoveryPayload });
assert.equal(nativeFallback.fallbackUsed, true);
assert.equal(nativeFallback.backend, 'cpu-f64-fallback');
assert.equal(nativeFallback.fallbackReason, 'WEBGPU_DEVICE_UNAVAILABLE');
const domain = packDomainBinary({
  schemaVersion: 5,
  nodes,
  members: [],
  materials: [{ id: 'MAT', E: 30e9, nu: 0.2, density: 2400 }],
  sections: [],
  shells: [{ id: 'S', nodeIds: nodes.map((node) => node.id), matId: 'MAT', thickness: 0.2, formulation: 'shell' }],
  loads: [], loadCases: [], loadCombinations: [],
});
assert.deepEqual(validateDomainBinary(domain), { ok: true, errors: [] });
assert.equal(domain.metadata.counts.shells, 1);
assert.equal(domain.buffers.shellConnectivity.length, 4);
assert.equal(domain.buffers.shellProperties.length, 4);

const cpu = runShellCpuReference(batch);
const gpu = runShellGpuBatch(batch, { tolerance: 1e-6, gpuResidualRefine: 1e-10 });
assert.equal(cpu.ok, true);
assert.equal(gpu.qualified, true);
assert.equal(gpu.fallbackUsed, false);
assert.equal(gpu.backend, 'f32-shell-batch-shadow');
assert.equal(gpu.nativeDispatch, false);
assert.ok(gpu.relativeError < 1e-6);
const fallback = runShellGpuBatch(batch, { tolerance: 1e-14, gpuResidualRefine: 1e-20 });
assert.equal(fallback.qualified, false);
assert.equal(fallback.fallbackUsed, true);
assert.equal(fallback.backend, 'cpu-f64-fallback');

export const M9D_SNAPSHOT = Object.freeze({ version: 'p10-m9d-verification-v2', elementCount: batch.elementCount, valueCount: cpu.tangentValues.length, gpuRelativeError: gpu.relativeError, gpuResidual: gpu.residual, fallbackBackend: fallback.backend, deterministicAssembly: gpu.deterministicAssembly, nativeKernelOperations: 3, nativeReferenceAssemblySlots: gatheredA.length, nativeStressValueCount: recovered.length, nativeFallbackReason: nativeFallback.fallbackReason, domainShellCount: domain.metadata.counts.shells, domainHash: domain.domainHash.slice(0, 24) });
console.log(JSON.stringify({ ok: true, ...M9D_SNAPSHOT }, null, 2));
