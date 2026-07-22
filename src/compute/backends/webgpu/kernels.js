import { stableHash } from '../../../core/stableHash.js';
import { gpuBufferUsage, gpuMapMode } from './constants.js';
import { planWebGpuSegments } from './segmentedBuffer.js';
import { webGpuShader } from './shaders.js';

export const WEBGPU_KERNEL_RUNTIME_VERSION = 'p9-m4-webgpu-kernel-runtime-v1';
export const WEBGPU_KERNEL_OPERATIONS = Object.freeze([
  'vectorScale', 'vectorAxpy', 'deterministicReduction', 'csrSpmv',
  'jacobiPrecondition', 'fiberSampleBatch', 'frameMatrixBatch',
  'shellTangentBatch', 'shellDeterministicGather', 'shellStressRecovery',
]);

export async function executeWebGpuKernel(platform, operation, payload = {}, context = {}) {
  const startedAt = now();
  platform.assertReady(context.signal);
  let result;
  if (operation === 'vectorScale') result = await vectorScale(platform, payload, context);
  else if (operation === 'vectorAxpy') result = await vectorAxpy(platform, payload, context);
  else if (operation === 'deterministicReduction') result = await deterministicReduction(platform, payload, context);
  else if (operation === 'csrSpmv') result = await csrSpmv(platform, payload, context);
  else if (operation === 'jacobiPrecondition') result = await jacobiPrecondition(platform, payload, context);
  else if (operation === 'fiberSampleBatch') result = await fiberSampleBatch(platform, payload, context);
  else if (operation === 'frameMatrixBatch') result = await frameMatrixBatch(platform, payload, context);
  else if (operation === 'shellTangentBatch') result = await shellTangentBatch(platform, payload, context);
  else if (operation === 'shellDeterministicGather') result = await shellDeterministicGather(platform, payload, context);
  else if (operation === 'shellStressRecovery') result = await shellStressRecovery(platform, payload, context);
  else throw kernelError('WEBGPU_KERNEL_UNSUPPORTED', `Unsupported WebGPU kernel operation: ${operation}.`);
  const core = {
    version: WEBGPU_KERNEL_RUNTIME_VERSION,
    ok: true,
    operation,
    precision: 'f32',
    rawKernelResult: true,
    designTransferAllowed: false,
    durationMs: now() - startedAt,
    ...result,
  };
  return Object.freeze({ ...core, resultHash: stableHash(hashableResult(core)) });
}

async function vectorScale(platform, payload, context) {
  const values = finiteF32(payload.values, 'values');
  const scale = finite(payload.scale, 'scale');
  const output = new Float32Array(values.length);
  const ranges = itemSegments(platform, values.length, 4);
  for (const row of ranges) {
    const chunk = values.subarray(row.start, row.end);
    const result = await dispatchKernel(platform, {
      shader: 'vectorScale', inputs: [chunk, Float32Array.of(chunk.length, scale)],
      outputLength: chunk.length, dispatchCount: workgroups(chunk.length, 64),
      outputBinding: 1, bindingOrder: [0, 2], signal: context.signal,
    });
    output.set(result, row.start);
  }
  return { values: output, segmentCount: ranges.length };
}

async function vectorAxpy(platform, payload, context) {
  const x = finiteF32(payload.x, 'x');
  const y = finiteF32(payload.y, 'y');
  if (x.length !== y.length) throw kernelError('WEBGPU_VECTOR_SHAPE_INVALID', 'x and y must have equal length.');
  const alpha = finite(payload.alpha, 'alpha');
  const output = new Float32Array(x.length);
  const ranges = itemSegments(platform, x.length, 4);
  for (const row of ranges) {
    const cx = x.subarray(row.start, row.end);
    const cy = y.subarray(row.start, row.end);
    const result = await dispatchKernel(platform, {
      shader: 'vectorAxpy', inputs: [cx, cy, Float32Array.of(cx.length, alpha)],
      outputLength: cx.length, dispatchCount: workgroups(cx.length, 64),
      outputBinding: 2, bindingOrder: [0, 1, 3], signal: context.signal,
    });
    output.set(result, row.start);
  }
  return { values: output, segmentCount: ranges.length };
}

async function deterministicReduction(platform, payload, context) {
  const values = finiteF32(payload.values, 'values');
  if (!values.length) throw kernelError('WEBGPU_REDUCTION_EMPTY', 'Reduction input is empty.');
  assertSingleBindingLimit(platform, values.byteLength, 'reduction input');
  const output = await dispatchKernel(platform, {
    shader: 'deterministicReduction', inputs: [values, Float32Array.of(values.length)],
    outputLength: 5, dispatchCount: 1, outputBinding: 1, bindingOrder: [0, 2], signal: context.signal,
  });
  return { reduction: Object.freeze({
    sum: output[0], min: output[1], max: output[2],
    minIndex: Math.trunc(output[3]), maxIndex: Math.trunc(output[4]),
    policy: 'single-invocation-fixed-input-order',
  }) };
}

async function csrSpmv(platform, payload, context) {
  const rowPtr = uint32(payload.rowPtr, 'rowPtr');
  const colIdx = uint32(payload.colIdx, 'colIdx');
  const values = finiteF32(payload.values, 'values');
  const x = finiteF32(payload.x, 'x');
  const rowCount = rowPtr.length - 1;
  if (rowCount < 0 || colIdx.length !== values.length || rowPtr[rowCount] !== values.length) {
    throw kernelError('WEBGPU_CSR_INVALID', 'CSR arrays are inconsistent.');
  }
  if (colIdx.some((column) => column >= x.length)) throw kernelError('WEBGPU_CSR_COLUMN_INVALID', 'CSR column index is out of range.');
  for (const [name, data] of Object.entries({ rowPtr, colIdx, values, x })) assertSingleBindingLimit(platform, data.byteLength, name);
  const output = await dispatchKernel(platform, {
    shader: 'csrSpmv', inputs: [rowPtr, colIdx, values, x, Float32Array.of(rowCount)],
    outputLength: rowCount, dispatchCount: workgroups(rowCount, 64), outputBinding: 4,
    bindingOrder: [0, 1, 2, 3, 5], signal: context.signal,
  });
  return { values: output, rowCount, nnz: values.length };
}

async function jacobiPrecondition(platform, payload, context) {
  const diagonal = finiteF32(payload.diagonal, 'diagonal');
  const rhs = finiteF32(payload.rhs, 'rhs');
  if (diagonal.length !== rhs.length) throw kernelError('WEBGPU_JACOBI_SHAPE_INVALID', 'Diagonal and RHS must have equal length.');
  const invalid = diagonal.findIndex((value) => !(value > 0));
  if (invalid >= 0) throw kernelError('WEBGPU_JACOBI_DIAGONAL_INVALID', `Jacobi diagonal ${invalid} is not positive.`);
  const output = await dispatchKernel(platform, {
    shader: 'jacobi', inputs: [diagonal, rhs, Float32Array.of(rhs.length)],
    outputLength: rhs.length, dispatchCount: workgroups(rhs.length, 64), outputBinding: 2,
    bindingOrder: [0, 1, 3], signal: context.signal,
  });
  return { values: output };
}

async function fiberSampleBatch(platform, payload, context) {
  const positions = finiteF32(payload.positions, 'positions');
  const areas = finiteF32(payload.areas, 'areas');
  const moduli = finiteF32(payload.moduli, 'moduli');
  const yieldStress = finiteF32(payload.yieldStress, 'yieldStress');
  const axialStrains = finiteF32(payload.axialStrains, 'axialStrains');
  const curvatures = finiteF32(payload.curvatures, 'curvatures');
  if (positions.length !== areas.length || positions.length !== moduli.length || positions.length !== yieldStress.length) {
    throw kernelError('WEBGPU_FIBER_SHAPE_INVALID', 'Fiber arrays must have equal length.');
  }
  if (axialStrains.length !== curvatures.length) throw kernelError('WEBGPU_FIBER_SAMPLE_SHAPE_INVALID', 'Fiber sample arrays must have equal length.');
  const inputs = [positions, areas, moduli, yieldStress, axialStrains, curvatures, Float32Array.of(axialStrains.length, positions.length)];
  for (const data of inputs) assertSingleBindingLimit(platform, data.byteLength, 'fiber input');
  const output = await dispatchKernel(platform, {
    shader: 'fiberSampleBatch', inputs, outputLength: axialStrains.length * 4,
    dispatchCount: workgroups(axialStrains.length, 64), outputBinding: 6,
    bindingOrder: [0, 1, 2, 3, 4, 5, 7], signal: context.signal,
  });
  return { values: output, sampleCount: axialStrains.length, fiberCount: positions.length };
}

async function frameMatrixBatch(platform, payload, context) {
  const properties = finiteF32(payload.properties, 'properties');
  const responseTransforms = finiteF32(payload.responseTransforms, 'responseTransforms');
  const propertyStride = framePropertyStride(payload.propertyStride, properties.length);
  if (properties.length % propertyStride !== 0) throw kernelError('WEBGPU_FRAME_PROPERTY_SHAPE_INVALID', 'Frame properties require seven EB values or nine values including phiY and phiZ per element.');
  const count = properties.length / propertyStride;
  if (responseTransforms.length !== count * 144) throw kernelError('WEBGPU_FRAME_TRANSFORM_SHAPE_INVALID', 'Frame transforms require 144 values per element.');
  for (let element = 0; element < count; element += 1) {
    const base = element * propertyStride;
    if (properties.subarray(base, base + 7).some((value) => !(value > 0))) throw kernelError('WEBGPU_FRAME_PROPERTY_INVALID', 'The seven base frame properties must be positive.');
    if (propertyStride === 9 && properties.subarray(base + 7, base + 9).some((value) => value < 0)) throw kernelError('WEBGPU_FRAME_PHI_INVALID', 'Frame phiY and phiZ must be nonnegative.');
  }
  assertSingleBindingLimit(platform, properties.byteLength, 'frame properties');
  assertSingleBindingLimit(platform, responseTransforms.byteLength, 'frame transforms');
  assertSingleBindingLimit(platform, count * 144 * 4, 'frame output');
  const output = await dispatchKernel(platform, {
    shader: 'frameMatrixBatch', inputs: [properties, responseTransforms, Float32Array.of(count, propertyStride)],
    outputLength: count * 144, dispatchCount: count, outputBinding: 2,
    bindingOrder: [0, 1, 3], signal: context.signal,
  });
  return { values: output, elementCount: count, propertyStride, responseTransformApplied: true };
}

async function shellTangentBatch(platform, payload, context) {
  const normalizedValues = finiteF32(payload.normalizedValues, 'normalizedValues');
  const elementScales = finiteF32(payload.elementScales, 'elementScales');
  const matrixStride = positiveInteger(payload.matrixStride, 'matrixStride');
  if (normalizedValues.length !== elementScales.length * matrixStride) throw kernelError('WEBGPU_SHELL_TANGENT_SHAPE_INVALID', 'Shell tangent values must match elementScales × matrixStride.');
  const inputs = [normalizedValues, elementScales, Float32Array.of(normalizedValues.length, matrixStride)];
  for (const data of inputs) assertSingleBindingLimit(platform, data.byteLength, 'shell tangent input');
  const output = await dispatchKernel(platform, {
    shader: 'shellTangentBatch', inputs, outputLength: normalizedValues.length,
    dispatchCount: workgroups(normalizedValues.length, 64), outputBinding: 2,
    bindingOrder: [0, 1, 3], signal: context.signal,
  });
  return { values: output, elementCount: elementScales.length, matrixStride };
}

async function shellDeterministicGather(platform, payload, context) {
  const gatherOffsets = uint32(payload.gatherOffsets, 'gatherOffsets');
  const gatherEntries = uint32(payload.gatherEntries, 'gatherEntries');
  const elementValues = finiteF32(payload.elementValues, 'elementValues');
  const slotCount = gatherOffsets.length - 1;
  if (slotCount < 0 || gatherOffsets[slotCount] !== gatherEntries.length) throw kernelError('WEBGPU_SHELL_GATHER_SHAPE_INVALID', 'Shell gather offsets and entries are inconsistent.');
  if (gatherEntries.some((entry) => entry >= elementValues.length)) throw kernelError('WEBGPU_SHELL_GATHER_ENTRY_INVALID', 'Shell gather entry is outside element values.');
  const inputs = [gatherOffsets, gatherEntries, elementValues, Float32Array.of(slotCount)];
  for (const data of inputs) assertSingleBindingLimit(platform, data.byteLength, 'shell gather input');
  const output = await dispatchKernel(platform, {
    shader: 'shellDeterministicGather', inputs, outputLength: slotCount,
    dispatchCount: workgroups(slotCount, 64), outputBinding: 3,
    bindingOrder: [0, 1, 2, 4], signal: context.signal,
  });
  return { values: output, slotCount, contributionCount: gatherEntries.length, policy: 'one-invocation-per-slot-fixed-entry-order' };
}

async function shellStressRecovery(platform, payload, context) {
  const operators = finiteF32(payload.operators, 'operators');
  const displacements = finiteF32(payload.displacements, 'displacements');
  const elementCount = positiveInteger(payload.elementCount, 'elementCount');
  const responseStride = positiveInteger(payload.responseStride, 'responseStride');
  const dofStride = positiveInteger(payload.dofStride, 'dofStride');
  if (operators.length !== elementCount * responseStride * dofStride || displacements.length !== elementCount * dofStride) throw kernelError('WEBGPU_SHELL_RECOVERY_SHAPE_INVALID', 'Shell recovery operator or displacement shape is inconsistent.');
  const inputs = [operators, displacements, Float32Array.of(elementCount, responseStride, dofStride)];
  for (const data of inputs) assertSingleBindingLimit(platform, data.byteLength, 'shell recovery input');
  const outputLength = elementCount * responseStride;
  const output = await dispatchKernel(platform, {
    shader: 'shellStressRecovery', inputs, outputLength,
    dispatchCount: workgroups(outputLength, 64), outputBinding: 2,
    bindingOrder: [0, 1, 3], signal: context.signal,
  });
  return { values: output, elementCount, responseStride, dofStride };
}

function framePropertyStride(value, length) {
  if (value != null) {
    const stride = Number(value);
    if (stride === 7 || stride === 9) return stride;
    throw kernelError('WEBGPU_FRAME_PROPERTY_STRIDE_INVALID', 'Frame propertyStride must be 7 or 9.');
  }
  if (length % 7 === 0) return 7;
  if (length % 9 === 0) return 9;
  return 7;
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw kernelError('WEBGPU_SHELL_SHAPE_INVALID', `${field} must be a positive integer.`);
  return number;
}

async function dispatchKernel(platform, spec) {
  if (spec.outputLength === 0) return new Float32Array();
  platform.assertReady(spec.signal);
  const device = platform.device;
  const shader = webGpuShader(spec.shader);
  const maxDispatch = Number(platform.capability.limits.maxComputeWorkgroupsPerDimension || 65535);
  if (spec.dispatchCount > maxDispatch) throw kernelError('WEBGPU_DISPATCH_LIMIT_EXCEEDED', 'Dispatch count exceeds device limits.');
  const storageRead = gpuBufferUsage('STORAGE') | gpuBufferUsage('COPY_DST');
  const storageOutput = gpuBufferUsage('STORAGE') | gpuBufferUsage('COPY_SRC');
  const readbackUsage = gpuBufferUsage('MAP_READ') | gpuBufferUsage('COPY_DST');
  const leases = [];
  return platform.withErrorScopes(async () => {
    try {
      const pipeline = await platform.getPipeline(shader.shaderHash, async () => {
        const module = device.createShaderModule({ code: shader.source, label: `${shader.name}:${shader.shaderHash.slice(0, 12)}` });
        if (typeof module.getCompilationInfo === 'function') {
          const info = await module.getCompilationInfo();
          const errors = (info.messages || []).filter((row) => row.type === 'error');
          if (errors.length) throw kernelError('WEBGPU_SHADER_COMPILATION_FAILED', errors.map((row) => row.message).join('\n'));
        }
        const descriptor = { layout: 'auto', compute: { module, entryPoint: shader.entryPoint }, label: `${shader.name}:pipeline` };
        return typeof device.createComputePipelineAsync === 'function'
          ? device.createComputePipelineAsync(descriptor) : device.createComputePipeline(descriptor);
      });
      const entries = [];
      for (let index = 0; index < spec.inputs.length; index += 1) {
        const data = spec.inputs[index];
        const lease = platform.pool.acquire({ size: data.byteLength, usage: storageRead, label: `${spec.shader}:input:${index}` });
        leases.push(lease);
        device.queue.writeBuffer(lease.buffer, 0, data.buffer, data.byteOffset, data.byteLength);
        entries.push({ binding: spec.bindingOrder[index], resource: { buffer: lease.buffer, size: lease.size } });
      }
      const outputBytes = spec.outputLength * Float32Array.BYTES_PER_ELEMENT;
      assertSingleBindingLimit(platform, outputBytes, 'kernel output');
      const outputLease = platform.pool.acquire({ size: outputBytes, usage: storageOutput, label: `${spec.shader}:output` });
      const readbackLease = platform.pool.acquire({ size: outputBytes, usage: readbackUsage, label: `${spec.shader}:readback` });
      leases.push(outputLease, readbackLease);
      entries.push({ binding: spec.outputBinding, resource: { buffer: outputLease.buffer, size: outputLease.size } });
      entries.sort((left, right) => left.binding - right.binding);
      const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries, label: `${spec.shader}:bind-group` });
      const encoder = device.createCommandEncoder({ label: `${spec.shader}:commands` });
      const pass = encoder.beginComputePass({ label: `${spec.shader}:pass` });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(spec.dispatchCount);
      pass.end();
      encoder.copyBufferToBuffer(outputLease.buffer, 0, readbackLease.buffer, 0, outputBytes);
      await platform.submit(encoder.finish(), { signal: spec.signal });
      await readbackLease.buffer.mapAsync(gpuMapMode('READ'), 0, outputBytes);
      const copy = readbackLease.buffer.getMappedRange(0, outputBytes).slice(0);
      readbackLease.buffer.unmap();
      return new Float32Array(copy);
    } finally {
      for (let index = leases.length - 1; index >= 0; index -= 1) {
        try { leases[index].buffer.unmap?.(); } catch {}
        leases[index].release();
      }
    }
  }, spec.signal);
}

function itemSegments(platform, itemCount, bytesPerItem) {
  if (!itemCount) return [];
  const maxBufferSize = Math.min(
    Number(platform.capability.limits.maxBufferSize || Number.MAX_SAFE_INTEGER),
    Number(platform.capability.limits.maxStorageBufferBindingSize || Number.MAX_SAFE_INTEGER),
  );
  const plan = planWebGpuSegments(itemCount * bytesPerItem, { maxBufferSize, alignment: bytesPerItem });
  return plan.segments.map((row) => ({ start: row.logicalOffset / bytesPerItem, end: (row.logicalOffset + row.logicalByteLength) / bytesPerItem }));
}

function assertSingleBindingLimit(platform, byteLength, label) {
  const max = Math.min(Number(platform.capability.limits.maxBufferSize || 0), Number(platform.capability.limits.maxStorageBufferBindingSize || 0));
  if (!(max > 0) || byteLength > max) throw kernelError('WEBGPU_BUFFER_LIMIT_EXCEEDED', `${label} exceeds the WebGPU binding limit.`);
}

function workgroups(count, size) { return Math.max(1, Math.ceil(count / size)); }

function finiteF32(value, field) {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) throw kernelError('WEBGPU_KERNEL_INPUT_REQUIRED', `${field} is required.`);
  const output = Float32Array.from(value, Number);
  if (output.some((item) => !Number.isFinite(item))) throw kernelError('WEBGPU_KERNEL_NONFINITE', `${field} must be finite.`);
  return output;
}

function uint32(value, field) {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) throw kernelError('WEBGPU_KERNEL_INPUT_REQUIRED', `${field} is required.`);
  const numbers = Array.from(value, Number);
  if (numbers.some((item) => !Number.isInteger(item) || item < 0 || item > 0xffffffff)) throw kernelError('WEBGPU_KERNEL_INDEX_INVALID', `${field} must contain u32 values.`);
  return Uint32Array.from(numbers);
}

function finite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw kernelError('WEBGPU_KERNEL_NONFINITE', `${field} must be finite.`);
  return number;
}

function hashableResult(value) {
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (Array.isArray(value)) return value.map(hashableResult);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'durationMs').map(([key, item]) => [key, hashableResult(item)]));
}

function kernelError(code, message) { return Object.assign(new Error(message), { code }); }
function now() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }
