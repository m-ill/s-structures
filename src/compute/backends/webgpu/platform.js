import { stableHash } from '../../../core/stableHash.js';
import { createWebGpuBufferPool } from './bufferPool.js';
import {
  inspectWebGpuAdapter,
  requestWebGpuCapability,
  serializableWebGpuCapability,
} from './capability.js';

export const WEBGPU_PLATFORM_VERSION = 'p9-m4-webgpu-platform-v1';

export async function createWebGpuPlatform(options = {}) {
  const requested = options.adapter
    ? inspectWebGpuAdapter(options.adapter, options)
    : await requestWebGpuCapability(options);
  if (!requested.ok) throw platformError(requested.reason || 'WEBGPU_UNAVAILABLE', 'WebGPU capability preflight failed.', requested);
  const adapter = requested.adapter;
  let device;
  try {
    device = options.device || await adapter.requestDevice({
      requiredFeatures: requested.requiredFeatures,
      requiredLimits: requested.requiredLimits,
      label: options.label || 'S-Structures Phase 9 WebGPU device',
    });
  } catch (error) {
    throw platformError('WEBGPU_DEVICE_REQUEST_FAILED', error?.message || 'WebGPU device request failed.', requested);
  }
  if (!device?.queue) throw platformError('WEBGPU_DEVICE_INVALID', 'WebGPU device has no queue.', requested);
  const capability = serializableWebGpuCapability(requested);
  const pool = createWebGpuBufferPool(device, {
    alignment: 4,
    maxCachedBytes: options.maxCachedBytes,
    maxBuffersPerKey: options.maxBuffersPerKey,
  });
  const pipelines = new Map();
  let state = 'ready';
  let disposed = false;
  let loss = null;
  let submissionCount = 0;
  let completedSubmissionCount = 0;
  const lossPromise = Promise.resolve(device.lost).then((info) => {
    if (disposed) return null;
    state = 'lost';
    loss = Object.freeze({
      reason: String(info?.reason || 'unknown'),
      message: String(info?.message || 'WebGPU device was lost.'),
    });
    options.onDeviceLost?.(loss);
    return loss;
  });

  return Object.freeze({
    version: WEBGPU_PLATFORM_VERSION,
    capability,
    adapter,
    device,
    queue: device.queue,
    pool,
    lossPromise,
    get state() { return state; },
    assertReady,
    withErrorScopes,
    submit,
    getPipeline,
    snapshot,
    dispose,
  });

  function assertReady(signal) {
    if (disposed) throw platformError('WEBGPU_PLATFORM_DISPOSED', 'WebGPU platform is disposed.');
    if (signal?.aborted) throw platformError('WEBGPU_OPERATION_CANCELLED', 'WebGPU operation was cancelled.');
    if (state === 'lost') throw platformError('WEBGPU_DEVICE_LOST', loss?.message || 'WebGPU device was lost.', loss);
    if (state !== 'ready') throw platformError('WEBGPU_PLATFORM_STATE_INVALID', `WebGPU platform state ${state} is invalid.`);
  }

  async function withErrorScopes(work, signal) {
    assertReady(signal);
    const supportsScopes = typeof device.pushErrorScope === 'function' && typeof device.popErrorScope === 'function';
    if (supportsScopes) {
      device.pushErrorScope('internal');
      device.pushErrorScope('out-of-memory');
      device.pushErrorScope('validation');
    }
    let value;
    let primary = null;
    try {
      value = await work();
    } catch (error) {
      primary = error;
    }
    const scopeErrors = [];
    if (supportsScopes) {
      for (const filter of ['validation', 'out-of-memory', 'internal']) {
        try {
          const error = await device.popErrorScope();
          if (error) scopeErrors.push({ filter, message: String(error.message || error) });
        } catch (error) {
          scopeErrors.push({ filter, message: String(error?.message || error) });
        }
      }
    }
    if (primary) {
      primary.gpuErrors = scopeErrors;
      throw primary;
    }
    if (scopeErrors.length) throw platformError('WEBGPU_ERROR_SCOPE_FAILED', 'WebGPU validation or execution error.', scopeErrors);
    assertReady(signal);
    return value;
  }

  async function submit(commandBuffers, options = {}) {
    assertReady(options.signal);
    const rows = Array.isArray(commandBuffers) ? commandBuffers : [commandBuffers];
    try {
      device.queue.submit(rows);
      submissionCount += 1;
      await device.queue.onSubmittedWorkDone?.();
      completedSubmissionCount += 1;
    } catch (error) {
      if (state === 'lost') throw platformError('WEBGPU_DEVICE_LOST', loss?.message || error?.message || 'WebGPU device was lost.', loss);
      throw platformError('WEBGPU_QUEUE_SUBMISSION_FAILED', error?.message || 'WebGPU queue submission failed.', {
        submissionCount,
        completedSubmissionCount,
      });
    }
    assertReady(options.signal);
    return Object.freeze({ submissionCount, completedSubmissionCount });
  }

  async function getPipeline(key, create) {
    assertReady();
    if (!pipelines.has(key)) pipelines.set(key, Promise.resolve().then(create));
    try {
      return await pipelines.get(key);
    } catch (error) {
      pipelines.delete(key);
      throw error;
    }
  }

  function snapshot() {
    const core = {
      version: WEBGPU_PLATFORM_VERSION,
      state,
      disposed,
      capability,
      loss,
      submissionCount,
      completedSubmissionCount,
      pipelineCount: pipelines.size,
      pool: pool.snapshot(),
      designTransferAllowed: false,
    };
    return Object.freeze({ ...core, platformHash: stableHash(core) });
  }

  async function dispose() {
    if (disposed) return snapshot();
    state = 'disposing';
    pool.dispose();
    pipelines.clear();
    try { device.destroy?.(); } finally {
      disposed = true;
      state = 'disposed';
    }
    return snapshot();
  }
}

function platformError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}
