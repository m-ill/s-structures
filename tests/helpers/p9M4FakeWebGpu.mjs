export function createFakeWebGpu(options = {}) {
  let resolveLost;
  const lost = new Promise((resolve) => { resolveLost = resolve; });
  const buffers = [];
  const scopes = [];
  const limits = {
    maxBufferSize: options.maxBufferSize || 16 * 1024 * 1024,
    maxStorageBufferBindingSize: options.maxStorageBufferBindingSize || 8 * 1024 * 1024,
    maxStorageBuffersPerShaderStage: 8,
    maxComputeWorkgroupsPerDimension: 65535,
    maxComputeInvocationsPerWorkgroup: 256,
    maxComputeWorkgroupSizeX: 256,
    maxComputeWorkgroupStorageSize: 16384,
    minStorageBufferOffsetAlignment: 256,
  };
  const queue = {
    submitted: 0,
    writeBuffer(buffer, offset, source, sourceOffset = 0, size) {
      const bytes = source instanceof ArrayBuffer
        ? new Uint8Array(source, sourceOffset, size)
        : new Uint8Array(source.buffer, source.byteOffset + sourceOffset, size);
      new Uint8Array(buffer.data, offset, bytes.byteLength).set(bytes);
    },
    submit() {
      if (options.submitError) throw options.submitError;
      this.submitted += 1;
    },
    async onSubmittedWorkDone() {
      if (options.completionError) throw options.completionError;
    },
  };
  const device = {
    queue,
    lost,
    destroyed: false,
    createBuffer(descriptor) {
      const buffer = {
        descriptor,
        data: new ArrayBuffer(descriptor.size),
        destroyed: false,
        destroy() { this.destroyed = true; },
        unmap() {},
      };
      buffers.push(buffer);
      return buffer;
    },
    pushErrorScope(filter) { scopes.push(filter); },
    async popErrorScope() { scopes.pop(); return options.scopeError || null; },
    destroy() { this.destroyed = true; },
  };
  const adapter = {
    features: new Set(options.features || []),
    limits,
    info: {
      vendor: 'fake-vendor',
      architecture: 'fake-architecture',
      device: 'fake-device',
      description: 'P9-M4 deterministic fake WebGPU adapter',
    },
    async requestDevice() { return device; },
  };
  return {
    adapter,
    device,
    buffers,
    lose(reason = 'unknown', message = 'test device loss') { resolveLost({ reason, message }); },
  };
}
