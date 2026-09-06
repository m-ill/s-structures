import { stableHash } from '../../../core/stableHash.js';
import { executeWebGpuKernel, WEBGPU_KERNEL_OPERATIONS, WEBGPU_KERNEL_RUNTIME_VERSION } from './kernels.js';
import { WEBGPU_SHADER_CATALOG_HASH, WEBGPU_SHADER_CATALOG_VERSION } from './shaders.js';

export const WEBGPU_KERNEL_BACKEND_VERSION = 'p9-m4-webgpu-kernel-backend-v1';
export const WEBGPU_KERNEL_BACKEND_ID = 'p9-webgpu-independent-kernels-v1';

export function createWebGpuKernelBackend(platform, options = {}) {
  if (!platform?.device || !platform?.capability) throw backendError('WEBGPU_PLATFORM_REQUIRED', 'A ready WebGPU platform is required.');
  const memoryBudgetBytes = positiveInteger(options.memoryBudgetBytes ?? Math.min(
    Number(platform.capability.limits.maxBufferSize || 0),
    Number(platform.capability.limits.maxStorageBufferBindingSize || 0),
    256 * 1024 * 1024,
  ), 'memoryBudgetBytes');
  const descriptor = describeWebGpuKernelBackend(platform, { memoryBudgetBytes });
  let disposed = false;
  return Object.freeze({
    ...descriptor,
    descriptor,
    capability: platform.capability,
    preflight,
    execute,
    snapshot() {
      return Object.freeze({
        version: WEBGPU_KERNEL_BACKEND_VERSION,
        disposed,
        descriptor,
        platform: platform.snapshot(),
        memoryBudgetBytes,
        designTransferAllowed: false,
      });
    },
    async dispose() {
      if (disposed) return platform.snapshot();
      disposed = true;
      return options.ownsPlatform === false ? platform.snapshot() : platform.dispose();
    },
  });

  function preflight(request = {}) {
    const operation = String(request.operation || request.kind || '');
    if (disposed) return failed('WEBGPU_BACKEND_DISPOSED');
    if (platform.state === 'lost') return failed('WEBGPU_DEVICE_LOST');
    if (platform.state !== 'ready') return failed('WEBGPU_PLATFORM_NOT_READY');
    if (!WEBGPU_KERNEL_OPERATIONS.includes(operation)) return failed('WEBGPU_KERNEL_UNSUPPORTED');
    if (request.production === true || request.designTransfer === true) return failed('WEBGPU_KERNEL_NOT_DESIGN_QUALIFIED');
    if (request.precision && request.precision !== 'f32') return failed('WEBGPU_PRECISION_UNSUPPORTED');
    const estimatedBytes = nonnegativeInteger(request.estimatedBytes ?? 0, 'estimatedBytes');
    if (estimatedBytes > memoryBudgetBytes) return failed('WEBGPU_MEMORY_BUDGET_EXCEEDED');
    return {
      ok: true,
      code: null,
      backendId: WEBGPU_KERNEL_BACKEND_ID,
      operation,
      precision: 'f32',
      memoryBudgetBytes,
      fallbackUsed: false,
      designTransferAllowed: false,
    };
  }

  async function execute(operation, payload = {}, context = {}) {
    const workingSetBytes = estimateKernelWorkingSet(operation, payload);
    const check = preflight({
      operation,
      precision: payload.options?.precision || 'f32',
      estimatedBytes: Math.max(Number(payload.options?.estimatedBytes || 0), workingSetBytes),
      production: payload.options?.production === true,
      designTransfer: payload.options?.designTransfer === true,
    });
    if (!check.ok) throw backendError(check.code, `WebGPU kernel preflight failed: ${check.code}.`);
    return executeWebGpuKernel(platform, operation, payload, context);
  }
}

export function describeWebGpuKernelBackend(platform, options = {}) {
  const limits = {
    ...platform.capability.limits,
    memoryBudgetBytes: Number(options.memoryBudgetBytes || 0),
    designTransferAllowed: false,
    executionScope: 'independent-raw-kernels-only',
  };
  return Object.freeze({
    version: WEBGPU_KERNEL_BACKEND_VERSION,
    id: WEBGPU_KERNEL_BACKEND_ID,
    buildHash: stableHash({
      version: WEBGPU_KERNEL_BACKEND_VERSION,
      kernelRuntime: WEBGPU_KERNEL_RUNTIME_VERSION,
      platform: platform.version,
      shaders: WEBGPU_SHADER_CATALOG_HASH,
      capability: platform.capability.capabilityHash,
    }),
    family: 'webgpu-hybrid',
    executionTarget: 'gpu',
    production: false,
    numericPrecision: 'f32',
    precisionModes: Object.freeze(['f32']),
    deterministic: true,
    deterministicScope: 'same-adapter-driver-build-fixed-dispatch-and-reduction-order',
    matrixClasses: Object.freeze(['none', 'csr']),
    operations: WEBGPU_KERNEL_OPERATIONS,
    limits: Object.freeze(limits),
    qualification: 'G2-kernel-candidate-no-design-transfer',
    kernelRuntimeVersion: WEBGPU_KERNEL_RUNTIME_VERSION,
    platformVersion: platform.version,
    shaderCatalogVersion: WEBGPU_SHADER_CATALOG_VERSION,
    shaderCatalogHash: WEBGPU_SHADER_CATALOG_HASH,
  });
}

function estimateKernelWorkingSet(operation, payload) {
  const bytes = (field) => numericArrayBytes(payload[field]);
  if (operation === 'vectorScale') return bytes('values') * 3 + 8;
  if (operation === 'vectorAxpy') return bytes('x') + bytes('y') + Math.max(bytes('x'), bytes('y')) * 2 + 8;
  if (operation === 'deterministicReduction') return bytes('values') + 44;
  if (operation === 'csrSpmv') return bytes('rowPtr') + bytes('colIdx') + bytes('values') + bytes('x') + Math.max(0, (payload.rowPtr?.length || 0) - 1) * 8 + 4;
  if (operation === 'jacobiPrecondition') return bytes('diagonal') + bytes('rhs') * 3 + 4;
  if (operation === 'fiberSampleBatch') {
    const input = ['positions', 'areas', 'moduli', 'yieldStress', 'axialStrains', 'curvatures'].reduce((sum, field) => sum + bytes(field), 0);
    return input + (payload.axialStrains?.length || 0) * 32 + 8;
  }
  if (operation === 'frameMatrixBatch') return bytes('properties') + bytes('responseTransforms') * 3 + 4;
  if (operation === 'shellTangentBatch') return bytes('normalizedValues') * 2 + bytes('elementScales') + 8;
  if (operation === 'shellDeterministicGather') return bytes('gatherOffsets') + bytes('gatherEntries') + bytes('elementValues') + Math.max(0, (payload.gatherOffsets?.length || 1) - 1) * 4 + 4;
  if (operation === 'shellStressRecovery') return bytes('operators') + bytes('displacements') + (Number(payload.elementCount) || 0) * (Number(payload.responseStride) || 0) * 4 + 12;
  return Object.values(payload || {}).reduce((sum, value) => sum + numericArrayBytes(value), 0);
}
function numericArrayBytes(value) {
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (Array.isArray(value)) return value.length * Float32Array.BYTES_PER_ELEMENT;
  return 0;
}
function failed(code) { return { ok: false, code, reason: code, fallbackUsed: false, designTransferAllowed: false }; }
function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw backendError('WEBGPU_BACKEND_FIELD_INVALID', `${field} must be a positive integer.`);
  return number;
}
function nonnegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw backendError('WEBGPU_BACKEND_FIELD_INVALID', `${field} must be a nonnegative integer.`);
  return number;
}
function backendError(code, message) { return Object.assign(new Error(message), { code }); }
