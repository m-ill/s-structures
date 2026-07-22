import {
  createWebGpuKernelBackend,
  createWebGpuPlatform,
  referenceShellDeterministicGather,
  referenceShellStressRecovery,
  referenceShellTangentBatch,
  requestWebGpuCapability,
} from '../../src/compute/backends/webgpu/index.js';

const output = document.querySelector('#result');
window.__P10_M9D_RESULT__ = null;
try { window.__P10_M9D_RESULT__ = await qualify(); } catch (error) { window.__P10_M9D_RESULT__ = failure(error); }
output.textContent = JSON.stringify(window.__P10_M9D_RESULT__, null, 2);
document.body.dataset.status = window.__P10_M9D_RESULT__.status;

async function qualify() {
  const capabilityRequest = await requestWebGpuCapability();
  if (!capabilityRequest.ok) return {
    version: 'p10-m9d-browser-webgpu-v1', status: 'BLOCKED', available: false,
    reason: capabilityRequest.reason, generatedAt: new Date().toISOString(),
  };
  const platform = await createWebGpuPlatform({ adapter: capabilityRequest.adapter, maxCachedBytes: 64 * 1024 * 1024, maxBuffersPerKey: 4 });
  const backend = createWebGpuKernelBackend(platform, { ownsPlatform: false });
  const tangentPayload = tangentFixture(6);
  const tangentExpected = referenceShellTangentBatch(tangentPayload);
  const gatherPayload = gatherFixture(tangentExpected);
  const recoveryPayload = recoveryFixture(6);
  const checks = [];
  let lifecycle;
  try {
    checks.push(await check(backend, 'shellTangentBatch', tangentPayload, tangentExpected));
    checks.push(await check(backend, 'shellDeterministicGather', gatherPayload, referenceShellDeterministicGather(gatherPayload)));
    checks.push(await check(backend, 'shellStressRecovery', recoveryPayload, referenceShellStressRecovery(recoveryPayload)));
    const hashes = [];
    for (let run = 0; run < 5; run += 1) hashes.push((await backend.execute('shellDeterministicGather', gatherPayload)).resultHash);
    checks.push({ operation: 'shellDeterministicGather-repeat', status: new Set(hashes).size === 1 ? 'PASS' : 'FAIL', uniqueResultHashes: new Set(hashes).size });
    const performance = await benchmark(backend, tangentFixture(128));
    lifecycle = backend.snapshot();
    const allPassed = checks.every((row) => row.status === 'PASS');
    return {
      version: 'p10-m9d-browser-webgpu-v1', status: allPassed ? 'PASS' : 'FAIL', available: true,
      generatedAt: new Date().toISOString(), capability: platform.capability,
      checks, performance, lifecycle: lifecycle.platform,
    };
  } finally {
    await backend.dispose();
    await platform.dispose();
  }
}

function tangentFixture(elementCount) {
  const matrixStride = 576;
  const elementScales = Float32Array.from({ length: elementCount }, (_, element) => 1e5 * (element + 1));
  const normalizedValues = Float32Array.from({ length: elementCount * matrixStride }, (_, index) => Math.sin(index * 0.013) * 0.75);
  return { normalizedValues, elementScales, matrixStride };
}
function gatherFixture(elementValues) {
  const slotCount = 576;
  const elementCount = elementValues.length / slotCount;
  const gatherOffsets = new Uint32Array(slotCount + 1);
  const gatherEntries = new Uint32Array(slotCount * elementCount);
  for (let slot = 0; slot < slotCount; slot += 1) {
    for (let element = 0; element < elementCount; element += 1) gatherEntries[slot * elementCount + element] = element * slotCount + slot;
    gatherOffsets[slot + 1] = (slot + 1) * elementCount;
  }
  return { gatherOffsets, gatherEntries, elementValues };
}
function recoveryFixture(elementCount) {
  const responseStride = 8;
  const dofStride = 24;
  return {
    operators: Float32Array.from({ length: elementCount * responseStride * dofStride }, (_, index) => Math.cos(index * 0.017) * 10),
    displacements: Float32Array.from({ length: elementCount * dofStride }, (_, index) => Math.sin(index * 0.031) * 1e-3),
    elementCount, responseStride, dofStride,
  };
}
async function check(backend, operation, payload, expected) {
  const run = await backend.execute(operation, payload);
  const comparison = compare(expected, run.values);
  return { operation, status: comparison.ok ? 'PASS' : 'FAIL', resultHash: run.resultHash, ...comparison };
}
async function benchmark(backend, payload) {
  await backend.execute('shellTangentBatch', payload);
  const samplesMs = [];
  for (let run = 0; run < 5; run += 1) {
    const startedAt = performance.now();
    await backend.execute('shellTangentBatch', payload);
    samplesMs.push(performance.now() - startedAt);
  }
  samplesMs.sort((a, b) => a - b);
  return { elementCount: payload.elementScales.length, valueCount: payload.normalizedValues.length, medianMs: samplesMs[2], samplesMs };
}
function compare(expectedInput, actualInput) {
  const expected = Array.from(expectedInput, Number);
  const actual = Array.from(actualInput, Number);
  if (expected.length !== actual.length) return { ok: false, reason: 'length-mismatch' };
  let absoluteMax = 0;
  let relativeMax = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const delta = Math.abs(actual[index] - expected[index]);
    absoluteMax = Math.max(absoluteMax, delta);
    relativeMax = Math.max(relativeMax, delta / Math.max(1, Math.abs(expected[index])));
  }
  return { ok: relativeMax <= 1e-6 || absoluteMax <= 1e-5, valueCount: expected.length, absoluteMax, relativeMax };
}
function failure(error) {
  return { version: 'p10-m9d-browser-webgpu-v1', status: 'FAIL', available: true, reason: error.code || error.message, stack: error.stack };
}
