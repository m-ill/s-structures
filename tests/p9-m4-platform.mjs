import assert from 'node:assert/strict';
import {
  createWebGpuPlatform,
  inspectWebGpuAdapter,
  joinWebGpuSegments,
  planWebGpuSegments,
  requestWebGpuCapability,
  segmentWebGpuBytes,
} from '../src/compute/index.js';
import { createFakeWebGpu } from './helpers/p9M4FakeWebGpu.mjs';

const unavailable = await requestWebGpuCapability({ gpu: {} });
assert.equal(unavailable.ok, false, 'P9-GPU-PLT-01 unavailable API');
assert.equal(unavailable.reason, 'WEBGPU_API_UNAVAILABLE');
assert.equal(unavailable.fallbackUsed, false);

const fake = createFakeWebGpu({ features: ['shader-f16'] });
const capability = inspectWebGpuAdapter(fake.adapter, {
  requiredFeatures: ['shader-f16'],
  requiredLimits: { maxStorageBufferBindingSize: 1024 },
});
assert.equal(capability.ok, true, 'P9-GPU-PLT-02 feature and limit preflight');
assert.equal(capability.adapterInfo.vendor, 'fake-vendor');
const missingFeature = inspectWebGpuAdapter(fake.adapter, { requiredFeatures: ['timestamp-query'] });
assert.equal(missingFeature.reason, 'WEBGPU_FEATURE_UNAVAILABLE');
const missingLimit = inspectWebGpuAdapter(fake.adapter, { requiredLimits: { maxBufferSize: 32 * 1024 * 1024 } });
assert.equal(missingLimit.reason, 'WEBGPU_LIMIT_UNAVAILABLE');

assert.equal(planWebGpuSegments(17, { maxBufferSize: 8, alignment: 4 }).segmentCount, 3, 'P9-GPU-PLT-03 segmentation');
const source = Uint8Array.from({ length: 37 }, (_value, index) => index * 7 % 256);
const segmented = segmentWebGpuBytes(source, { maxBufferSize: 12, alignment: 4 });
assert.deepEqual(joinWebGpuSegments(segmented), source, 'P9-GPU-PLT-04 segmented hash parity');
assert.ok(segmented.segments.every((row) => row.allocatedByteLength % 4 === 0));

const platform = await createWebGpuPlatform({
  adapter: fake.adapter,
  device: fake.device,
  maxCachedBytes: 1024,
  maxBuffersPerKey: 2,
});
assert.equal(platform.state, 'ready');
const first = platform.pool.acquire({ size: 13, usage: 128 });
const firstBuffer = first.buffer;
assert.equal(first.size, 16);
first.release();
const reused = platform.pool.acquire({ size: 13, usage: 128 });
assert.equal(reused.buffer, firstBuffer, 'P9-GPU-PLT-05 pooled buffer reuse');
reused.release();
assert.equal(await platform.withErrorScopes(async () => 42), 42, 'P9-GPU-PLT-07 scoped execution');
assert.throws(() => platform.assertReady({ aborted: true }), { code: 'WEBGPU_OPERATION_CANCELLED' }, 'P9-GPU-PLT-06 cancellation');
const disposed = await platform.dispose();
assert.equal(disposed.pool.allocationBalanced, true, 'P9-GPU-PLT-05 normal disposal balance');
assert.equal(fake.device.destroyed, true);

const lostFake = createFakeWebGpu();
const lostPlatform = await createWebGpuPlatform({ adapter: lostFake.adapter, device: lostFake.device });
const model = Object.freeze({ id: 'immutable-model', nodes: Object.freeze([{ id: 'N1' }]) });
const before = JSON.stringify(model);
lostFake.lose('unknown', 'injected loss');
await lostPlatform.lossPromise;
assert.equal(lostPlatform.state, 'lost', 'P9-GPU-PLT-08 device loss state');
assert.throws(() => lostPlatform.assertReady(), { code: 'WEBGPU_DEVICE_LOST' });
assert.equal(JSON.stringify(model), before, 'P9-GPU-PLT-08 model remains immutable');
assert.equal((await lostPlatform.dispose()).pool.allocationBalanced, true);

const failureFake = createFakeWebGpu();
const failurePlatform = await createWebGpuPlatform({ adapter: failureFake.adapter, device: failureFake.device });
failurePlatform.pool.acquire({ size: 64, usage: 128 });
assert.equal((await failurePlatform.dispose()).pool.allocationBalanced, true, 'P9-GPU-PLT-06 failure cleanup');

const scopeFake = createFakeWebGpu({ scopeError: { message: 'injected validation failure' } });
const scopePlatform = await createWebGpuPlatform({ adapter: scopeFake.adapter, device: scopeFake.device });
await assert.rejects(() => scopePlatform.withErrorScopes(async () => 1), { code: 'WEBGPU_ERROR_SCOPE_FAILED' }, 'P9-GPU-PLT-07 error scope failure');
assert.equal((await scopePlatform.dispose()).pool.allocationBalanced, true);

const queueFake = createFakeWebGpu({ completionError: new Error('injected queue failure') });
const queuePlatform = await createWebGpuPlatform({ adapter: queueFake.adapter, device: queueFake.device });
await assert.rejects(() => queuePlatform.submit({}), { code: 'WEBGPU_QUEUE_SUBMISSION_FAILED' }, 'P9-GPU-PLT-07 queue completion failure');
assert.equal((await queuePlatform.dispose()).pool.allocationBalanced, true);

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['P9-GPU-PLT-01~08'],
  capabilityHash: capability.capabilityHash,
  segmentCount: segmented.segmentCount,
  createdBuffers: fake.buffers.length,
  disposalBalanced: disposed.pool.allocationBalanced,
}, null, 2));
