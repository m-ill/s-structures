import { alignWebGpuBytes } from './segmentedBuffer.js';

export const WEBGPU_BUFFER_POOL_VERSION = 'p9-m4-webgpu-buffer-pool-v1';

export function createWebGpuBufferPool(device, options = {}) {
  if (!device?.createBuffer) throw poolError('WEBGPU_DEVICE_REQUIRED', 'A WebGPU device is required.');
  const alignment = positiveInteger(options.alignment ?? 4, 'alignment');
  const maxCachedBytes = nonnegativeInteger(options.maxCachedBytes ?? 64 * 1024 * 1024, 'maxCachedBytes');
  const maxBuffersPerKey = positiveInteger(options.maxBuffersPerKey ?? 4, 'maxBuffersPerKey');
  const cached = new Map();
  const active = new Map();
  let sequence = 0;
  let createdCount = 0;
  let destroyedCount = 0;
  let createdBytes = 0;
  let cachedBytes = 0;
  let activeBytes = 0;
  let peakBytes = 0;
  let disposed = false;

  return Object.freeze({
    version: WEBGPU_BUFFER_POOL_VERSION,
    acquire,
    snapshot,
    dispose,
  });

  function acquire(input = {}) {
    if (disposed) throw poolError('WEBGPU_BUFFER_POOL_DISPOSED', 'WebGPU buffer pool is disposed.');
    const logicalSize = positiveInteger(input.size, 'size');
    const size = alignWebGpuBytes(logicalSize, alignment);
    const usage = nonnegativeInteger(input.usage, 'usage');
    const key = `${size}:${usage}`;
    const rows = cached.get(key) || [];
    let row = rows.pop();
    if (row) cachedBytes -= row.size;
    else {
      const buffer = device.createBuffer({ size, usage, mappedAtCreation: input.mappedAtCreation === true, label: input.label });
      row = { buffer, size, usage, key };
      createdCount += 1;
      createdBytes += size;
    }
    if (rows.length) cached.set(key, rows);
    else cached.delete(key);
    const token = `gpu-buffer-${++sequence}`;
    active.set(token, row);
    activeBytes += row.size;
    peakBytes = Math.max(peakBytes, activeBytes + cachedBytes);
    let released = false;
    return Object.freeze({
      token,
      buffer: row.buffer,
      size: row.size,
      logicalSize,
      usage: row.usage,
      release() {
        if (released) return snapshot();
        released = true;
        releaseRow(token, row);
        return snapshot();
      },
    });
  }

  function releaseRow(token, row) {
    if (!active.delete(token)) return;
    activeBytes -= row.size;
    const rows = cached.get(row.key) || [];
    const canCache = !disposed && rows.length < maxBuffersPerKey && cachedBytes + row.size <= maxCachedBytes;
    if (canCache) {
      rows.push(row);
      cached.set(row.key, rows);
      cachedBytes += row.size;
    } else {
      destroy(row);
    }
  }

  function dispose() {
    if (disposed) return snapshot();
    disposed = true;
    for (const [token, row] of active) {
      active.delete(token);
      activeBytes -= row.size;
      destroy(row);
    }
    for (const rows of cached.values()) for (const row of rows) destroy(row);
    cached.clear();
    cachedBytes = 0;
    return snapshot();
  }

  function destroy(row) {
    try { row.buffer.destroy?.(); } finally { destroyedCount += 1; }
  }

  function snapshot() {
    const core = {
      version: WEBGPU_BUFFER_POOL_VERSION,
      disposed,
      alignment,
      maxCachedBytes,
      maxBuffersPerKey,
      createdCount,
      destroyedCount,
      createdBytes,
      activeCount: active.size,
      activeBytes,
      cachedCount: [...cached.values()].reduce((sum, rows) => sum + rows.length, 0),
      cachedBytes,
      peakBytes,
      allocationBalanced: disposed ? active.size === 0 && cachedBytes === 0 && createdCount === destroyedCount : null,
    };
    return Object.freeze(core);
  }
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw poolError('WEBGPU_BUFFER_POOL_FIELD_INVALID', `${field} must be a positive integer.`);
  return number;
}

function nonnegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw poolError('WEBGPU_BUFFER_POOL_FIELD_INVALID', `${field} must be a nonnegative integer.`);
  return number;
}

function poolError(code, message) {
  return Object.assign(new Error(message), { code });
}
