import {
  WEBGPU_KERNEL_OPERATIONS,
  WEBGPU_SHADER_CATALOG_HASH,
  createWebGpuKernelBackend,
  createWebGpuPlatform,
  referenceCsrSpmv,
  referenceDeterministicReduction,
  referenceFiberSampleBatch,
  referenceFrameMatrixBatch,
  referenceJacobi,
  referenceVectorAxpy,
  referenceVectorScale,
  requestWebGpuCapability,
} from '../../src/compute/backends/webgpu/index.js';

const output = document.querySelector('#result');
window.__P9_M4_RESULT__ = null;

try {
  window.__P9_M4_RESULT__ = await qualify();
} catch (error) {
  window.__P9_M4_RESULT__ = failure(error);
}
output.textContent = JSON.stringify(window.__P9_M4_RESULT__, null, 2);
document.body.dataset.status = window.__P9_M4_RESULT__.status;

async function qualify() {
  const capabilityRequest = await requestWebGpuCapability();
  if (!capabilityRequest.ok) {
    return {
      version: 'p9-m4-browser-raw-v1',
      status: 'BLOCKED',
      available: false,
      reason: capabilityRequest.reason,
      capability: serializable(capabilityRequest),
      browser: browserInfo(),
      generatedAt: new Date().toISOString(),
    };
  }

  const platform = await createWebGpuPlatform({
    adapter: capabilityRequest.adapter,
    maxCachedBytes: 64 * 1024 * 1024,
    maxBuffersPerKey: 4,
  });
  const backend = createWebGpuKernelBackend(platform, { ownsPlatform: false });
  const cases = fixtures();
  const checks = [];
  const performance = {};
  let beforeDispose;
  let afterDispose;
  try {
    for (const row of cases) {
      const run = await backend.execute(row.operation, row.payload);
      const comparison = compare(row.expected(), resultValues(run), row.absoluteTolerance, row.relativeTolerance);
      checks.push({
        operation: row.operation,
        status: comparison.ok ? 'PASS' : 'FAIL',
        resultHash: run.resultHash,
        ...comparison,
      });
    }

    const reductionHashes = [];
    for (let index = 0; index < 5; index += 1) {
      const run = await backend.execute('deterministicReduction', cases[2].payload);
      reductionHashes.push(run.resultHash);
    }
    checks.push({
      operation: 'deterministicReduction-repeat',
      status: new Set(reductionHashes).size === 1 ? 'PASS' : 'FAIL',
      uniqueResultHashes: new Set(reductionHashes).size,
      samples: reductionHashes.length,
    });

    const vectorFixture = largeVectorFixture();
    const csrFixture = largeCsrFixture();
    performance.vectorScale = await benchmarkPair(
      backend, 'vectorScale', vectorFixture,
      () => referenceVectorScale(vectorFixture.values, vectorFixture.scale),
    );
    performance.csrSpmv = await benchmarkPair(
      backend, 'csrSpmv', csrFixture,
      () => referenceCsrSpmv(csrFixture, csrFixture.x),
    );
    beforeDispose = backend.snapshot();
  } finally {
    await backend.dispose();
    afterDispose = await platform.dispose();
  }

  const allPassed = checks.every((row) => row.status === 'PASS');
  return {
    version: 'p9-m4-browser-raw-v1',
    status: allPassed && afterDispose.pool.allocationBalanced ? 'PASS' : 'FAIL',
    available: true,
    generatedAt: new Date().toISOString(),
    browser: browserInfo(),
    capability: platform.capability,
    backend: {
      id: backend.id,
      buildHash: backend.buildHash,
      qualification: backend.qualification,
      precision: backend.numericPrecision,
      shaderCatalogHash: WEBGPU_SHADER_CATALOG_HASH,
      operations: WEBGPU_KERNEL_OPERATIONS,
      designTransferAllowed: false,
    },
    checks,
    performance,
    lifecycle: {
      beforeDispose: beforeDispose.platform,
      afterDispose,
      allocationBalanced: afterDispose.pool.allocationBalanced,
    },
  };
}

function fixtures() {
  const identity = identity12();
  const framePayload = {
    properties: Float32Array.of(200000000, 76923076.923, 0.02, 8e-5, 4e-5, 1e-5, 3),
    responseTransforms: identity,
  };
  const fiberPayload = {
    positions: [-0.1, 0.1], areas: [0.01, 0.01],
    moduli: [200000000, 200000000], yieldStress: [250000, 250000],
    axialStrains: [0, 0.002], curvatures: [0.001, 0],
  };
  const csrPayload = {
    rowPtr: [0, 2, 5, 7], colIdx: [0, 1, 0, 1, 2, 1, 2],
    values: [4, 1, 1, 3, 1, 1, 2], x: [1, 2, 3],
  };
  return [
    { operation: 'vectorScale', payload: { values: [1, -2, 3], scale: 2.5 }, expected: () => referenceVectorScale([1, -2, 3], 2.5) },
    { operation: 'vectorAxpy', payload: { x: [1, 2], y: [3, 4], alpha: -0.5 }, expected: () => referenceVectorAxpy([1, 2], [3, 4], -0.5) },
    { operation: 'deterministicReduction', payload: { values: [3, -2, 5, -2, 5] }, expected: () => Object.values(referenceDeterministicReduction([3, -2, 5, -2, 5])) },
    { operation: 'csrSpmv', payload: csrPayload, expected: () => referenceCsrSpmv(csrPayload, csrPayload.x) },
    { operation: 'jacobiPrecondition', payload: { diagonal: [2, 4, 8], rhs: [4, 8, 16] }, expected: () => referenceJacobi([2, 4, 8], [4, 8, 16]) },
    { operation: 'fiberSampleBatch', payload: fiberPayload, expected: () => referenceFiberSampleBatch(fiberPayload), absoluteTolerance: 0.125, relativeTolerance: 2e-6 },
    { operation: 'frameMatrixBatch', payload: framePayload, expected: () => referenceFrameMatrixBatch(framePayload), absoluteTolerance: 0.125, relativeTolerance: 4e-6 },
  ];
}

function resultValues(result) {
  if (result.reduction) return [result.reduction.sum, result.reduction.min, result.reduction.max, result.reduction.minIndex, result.reduction.maxIndex];
  return result.values;
}

function compare(expectedInput, actualInput, absoluteTolerance = 1e-5, relativeTolerance = 2e-6) {
  const expected = Array.from(expectedInput, Number);
  const actual = Array.from(actualInput, Number);
  if (expected.length !== actual.length) return { ok: false, reason: 'length-mismatch', expectedCount: expected.length, actualCount: actual.length };
  let absoluteMax = 0;
  let relativeMax = 0;
  let finite = true;
  for (let index = 0; index < expected.length; index += 1) {
    const delta = Math.abs(actual[index] - expected[index]);
    absoluteMax = Math.max(absoluteMax, delta);
    relativeMax = Math.max(relativeMax, delta / Math.max(1, Math.abs(expected[index])));
    finite = finite && Number.isFinite(actual[index]);
  }
  return {
    ok: finite && (absoluteMax <= absoluteTolerance || relativeMax <= relativeTolerance),
    finite,
    valueCount: expected.length,
    absoluteMax,
    relativeMax,
    absoluteTolerance,
    relativeTolerance,
  };
}

async function benchmark(backend, operation, payload) {
  await backend.execute(operation, payload);
  const samplesMs = [];
  for (let index = 0; index < 5; index += 1) {
    const startedAt = performance.now();
    await backend.execute(operation, payload);
    samplesMs.push(performance.now() - startedAt);
  }
  const sorted = [...samplesMs].sort((left, right) => left - right);
  return {
    measurement: 'host-write-dispatch-queue-wait-map-readback',
    warmupCount: 1,
    sampleCount: samplesMs.length,
    samplesMs: samplesMs.map(round),
    medianMs: round(sorted[Math.floor(sorted.length / 2)]),
    p95Ms: round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
  };
}

async function benchmarkPair(backend, operation, payload, reference) {
  const gpu = await benchmark(backend, operation, payload);
  reference();
  const samplesMs = [];
  for (let index = 0; index < 5; index += 1) {
    const startedAt = performance.now();
    reference();
    samplesMs.push(performance.now() - startedAt);
  }
  const sorted = [...samplesMs].sort((left, right) => left - right);
  const cpu = {
    measurement: 'browser-main-thread-f32-reference',
    warmupCount: 1,
    sampleCount: samplesMs.length,
    samplesMs: samplesMs.map(round),
    medianMs: round(sorted[Math.floor(sorted.length / 2)]),
    p95Ms: round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
  };
  return { gpu, cpu, gpuToCpuMedianRatio: gpu.medianMs / Math.max(cpu.medianMs, 0.0001) };
}

function largeVectorFixture() {
  const values = Float32Array.from({ length: 65536 }, (_item, index) => Math.fround((index % 251) / 251 - 0.5));
  return { values, scale: 1.125 };
}

function largeCsrFixture() {
  const size = 4096;
  const rowPtr = new Uint32Array(size + 1);
  const colIdx = new Uint32Array(size * 3 - 2);
  const values = new Float32Array(size * 3 - 2);
  let pointer = 0;
  for (let row = 0; row < size; row += 1) {
    rowPtr[row] = pointer;
    if (row > 0) { colIdx[pointer] = row - 1; values[pointer] = -1; pointer += 1; }
    colIdx[pointer] = row; values[pointer] = 4; pointer += 1;
    if (row + 1 < size) { colIdx[pointer] = row + 1; values[pointer] = -1; pointer += 1; }
  }
  rowPtr[size] = pointer;
  return { rowPtr, colIdx, values, x: Float32Array.from({ length: size }, () => 1) };
}

function identity12() {
  const output = new Float32Array(144);
  for (let index = 0; index < 12; index += 1) output[index * 12 + index] = 1;
  return output;
}

function serializable(value) {
  const output = { ...value };
  delete output.adapter;
  return output;
}

function browserInfo() {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    crossOriginIsolated: globalThis.crossOriginIsolated,
  };
}

function failure(error) {
  return {
    version: 'p9-m4-browser-raw-v1',
    status: 'FAIL',
    available: Boolean(navigator.gpu),
    generatedAt: new Date().toISOString(),
    browser: browserInfo(),
    error: {
      name: String(error?.name || 'Error'),
      code: String(error?.code || 'UNCLASSIFIED'),
      message: String(error?.message || error),
      gpuErrors: error?.gpuErrors || [],
    },
  };
}

function round(value) { return Math.round(Number(value) * 10000) / 10000; }
