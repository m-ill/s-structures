import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { stableHash } from '../src/core/stableHash.js';
import {
  createAnalysisExecutionPlan,
  createWebGpuKernelBackend,
  describeComputeBackend,
  preflightComputeBackend,
} from '../src/compute/index.js';

const platform = fakePlatform();
const gpu = createWebGpuKernelBackend(platform, { ownsPlatform: false, memoryBudgetBytes: 1024 * 1024 });
const descriptor = describeComputeBackend(gpu);
assert.equal(descriptor.targetFamily, 'gpu');
assert.equal(descriptor.production, false);
assert.equal(descriptor.qualification, 'G2-kernel-candidate-no-design-transfer');
assert.equal(gpu.preflight({ operation: 'vectorScale', production: true }).code, 'WEBGPU_KERNEL_NOT_DESIGN_QUALIFIED');
assert.equal(gpu.preflight({ operation: 'vectorScale', designTransfer: true }).code, 'WEBGPU_KERNEL_NOT_DESIGN_QUALIFIED');
assert.equal(gpu.preflight({ operation: 'vectorScale', estimatedBytes: 2 * 1024 * 1024 }).code, 'WEBGPU_MEMORY_BUDGET_EXCEEDED');
await assert.rejects(
  () => gpu.execute('vectorScale', { values: Array.from({ length: 300000 }, () => 1), scale: 2 }),
  { code: 'WEBGPU_MEMORY_BUDGET_EXCEEDED' },
  'array payload working set cannot bypass memory preflight',
);

const genericPreflight = preflightComputeBackend(gpu, {
  operation: 'vectorScale',
  precision: 'f32',
  computeTarget: 'gpu',
  gpuEnabled: true,
  production: false,
});
assert.equal(genericPreflight.ok, true, 'P9-GPU-PLT-09 explicit GPU preflight');
assert.equal(genericPreflight.fallbackUsed, false);

const gpuPlan = createAnalysisExecutionPlan({
  runId: 'p9-m4-gpu-route',
  caseId: 'independent-kernel',
  domainHash: stableHash({ fixture: 'm4' }),
  workloadClass: 'M',
  userPolicy: 'gpu',
  gpuEnabled: true,
  backends: [gpu],
  operations: [{ id: 'scale', kind: 'vectorScale', precision: 'f32', production: false, estimatedBytes: 1024 }],
});
assert.equal(gpuPlan.operations[0].backendId, gpu.id);
assert.equal(gpuPlan.operations[0].reason, 'explicit-gpu-route');
assert.equal(gpuPlan.operations[0].fallbackUsed, false);

const cpu = cpuKernelBackend();
const autoPlan = createAnalysisExecutionPlan({
  runId: 'p9-m4-auto-route',
  caseId: 'independent-kernel',
  domainHash: stableHash({ fixture: 'm4' }),
  workloadClass: 'S',
  userPolicy: 'auto',
  gpuEnabled: true,
  backends: [gpu, cpu],
  operations: [{ id: 'scale', kind: 'vectorScale', production: false }],
});
assert.equal(autoPlan.operations[0].backendId, cpu.id, 'P9-GPU-PLT-10 auto keeps small workload on CPU');
assert.equal(autoPlan.operations[0].reason, 'highest-qualified-compatible-route');
assert.throws(() => createAnalysisExecutionPlan({
  runId: 'p9-m4-no-fallback',
  caseId: 'independent-kernel',
  domainHash: stableHash({ fixture: 'm4' }),
  userPolicy: 'gpu',
  gpuEnabled: true,
  backends: [cpu],
  operations: [{ id: 'scale', kind: 'vectorScale', production: false }],
}), { code: 'GPU_BACKEND_UNAVAILABLE' }, 'P9-GPU-PLT-10 explicit GPU has no silent fallback');

const sourceFiles = await listJsFiles('src');
const directGpuApi = [];
const webGpuApiPattern = /(?:navigator\??\.gpu|GPUBufferUsage|GPUMapMode|createShaderModule|requestAdapter\s*\()/m;
assert.match('globalThis.navigator?.gpu', webGpuApiPattern, 'ownership scan recognizes optional chaining');
for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8');
  if (webGpuApiPattern.test(source)
      && !file.replaceAll('\\', '/').includes('/compute/backends/webgpu/')) directGpuApi.push(file);
}
assert.deepEqual(directGpuApi, [], 'WebGPU API is owned only by compute backend');
const workerSource = await readFile('src/compute/runtime/analysisWorker.js', 'utf8');
assert.doesNotMatch(workerSource, /webgpu|WEBGPU/i, 'M4 kernels are not connected to analysis results');

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['P9-GPU-PLT-09~10', 'P9-REF-03'],
  gpuBackendId: gpu.id,
  explicitRoute: gpuPlan.operations[0].executionTarget,
  autoRoute: autoPlan.operations[0].executionTarget,
  directGpuApiOutsideOwner: directGpuApi.length,
}, null, 2));

function fakePlatform() {
  const capability = Object.freeze({
    ok: true,
    available: true,
    capabilityHash: stableHash({ adapter: 'fake-routing' }),
    limits: Object.freeze({ maxBufferSize: 8 * 1024 * 1024, maxStorageBufferBindingSize: 4 * 1024 * 1024 }),
  });
  return {
    state: 'ready',
    device: {},
    capability,
    snapshot: () => ({ state: 'ready', capability, designTransferAllowed: false }),
    dispose: async () => ({ state: 'disposed' }),
  };
}

function cpuKernelBackend() {
  return Object.freeze({
    id: 'p9-m4-cpu-kernel-reference',
    version: 'v1',
    buildHash: stableHash({ id: 'p9-m4-cpu-kernel-reference' }),
    family: 'reference',
    executionTarget: 'cpu',
    production: true,
    numericPrecision: 'f64',
    precisionModes: ['f64'],
    deterministic: true,
    matrixClasses: ['none'],
    operations: ['vectorScale'],
    qualification: 'G1-cpu-reference',
    preflight: () => ({ ok: true }),
    execute: () => ({ ok: true }),
  });
}

async function listJsFiles(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = join(root, entry.name);
    if (entry.isDirectory()) output.push(...await listJsFiles(file));
    else if (entry.isFile() && file.endsWith('.js')) output.push(file);
  }
  return output;
}
