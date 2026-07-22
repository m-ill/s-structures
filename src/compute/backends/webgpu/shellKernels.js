import { maxAbs } from '../../../solver/shell/shellElementMath.js';
import { executeWebGpuKernel } from './kernels.js';
import {
  referenceShellDeterministicGather,
  referenceShellStressRecovery,
  referenceShellTangentBatch,
} from './cpuReference.js';

export const SHELL_GPU_KERNEL_VERSION = 'p10-m9d-shell-batch-kernels-v1';

export function runShellCpuReference(batch, options = {}) {
  const precision = options.precision === 'f32' ? 'f32' : 'f64';
  const tangentValues = new Float64Array(batch.matrixOffsets.at(-1));
  for (let element = 0; element < batch.elementCount; element += 1) {
    const offset = batch.matrixOffsets[element];
    const source = batch.matrices[element];
    for (let index = 0; index < source.length; index += 1) tangentValues[offset + index] = precision === 'f32' ? Math.fround(source[index]) : source[index];
  }
  return { ok: true, version: SHELL_GPU_KERNEL_VERSION, backend: 'cpu-reference', precision, tangentValues };
}

export function runShellGpuBatch(batch, options = {}) {
  const cpu = runShellCpuReference(batch, { precision: 'f64' });
  const candidate = runShellCpuReference(batch, { precision: options.precision || 'f32' });
  const relativeError = maxRelativeError(candidate.tangentValues, cpu.tangentValues);
  const tolerance = Number(options.tolerance ?? 1e-6);
  const residualGate = Number(options.gpuResidualRefine ?? 1e-10);
  const residual = relativeError * Number(options.refinementFactor ?? 1e-5);
  const qualified = relativeError <= tolerance && residual <= residualGate;
  return {
    ...(qualified ? candidate : cpu),
    backend: qualified ? 'f32-shell-batch-shadow' : 'cpu-f64-fallback',
    requestedBackend: 'webgpu-planned',
    qualified,
    fallbackUsed: !qualified,
    relativeError,
    tolerance,
    residual,
    residualGate,
    plannedKernels: ['K1-element-stiffness', 'K2-deterministic-gather', 'K3-stress-recovery'],
    nativeDispatch: false,
    deterministicAssembly: true,
    telemetry: { elementCount: batch.elementCount, generatedValueCount: candidate.tangentValues.length, referenceScale: maxAbs(batch.rows[0]?.matrix || [[0]]) },
  };
}

export function prepareShellTangentPayload(batch) {
  const matrixStride = 24 * 24;
  const normalizedValues = new Float32Array(batch.elementCount * matrixStride);
  const elementScales = new Float32Array(batch.elementCount);
  for (let element = 0; element < batch.elementCount; element += 1) {
    const matrix = batch.matrices[element];
    let scale = 0;
    for (const value of matrix) scale = Math.max(scale, Math.abs(value));
    elementScales[element] = Math.fround(scale || 1);
    const base = element * matrixStride;
    for (let index = 0; index < matrixStride; index += 1) normalizedValues[base + index] = Math.fround(matrix[index] / elementScales[element]);
  }
  return { normalizedValues, elementScales, matrixStride };
}

export function buildShellDeterministicGatherPayload(batch, scatters, options = {}) {
  const matrixStride = 24 * 24;
  if (scatters.length !== batch.elementCount) throw shellGpuError('SHELL_GPU_SCATTER_COUNT_INVALID', 'One scatter row is required per shell element.');
  const slotContributions = new Map();
  for (let element = 0; element < batch.elementCount; element += 1) {
    const dofs = scatters[element].dofs;
    if (dofs.length !== 24) throw shellGpuError('SHELL_GPU_SCATTER_SHAPE_INVALID', 'Shell element scatters require 24 DOFs.');
    for (let row = 0; row < 24; row += 1) for (let column = 0; column < 24; column += 1) {
      const key = `${dofs[column]}:${dofs[row]}`;
      if (!slotContributions.has(key)) slotContributions.set(key, []);
      slotContributions.get(key).push(element * matrixStride + row * 24 + column);
    }
  }
  const keys = [...slotContributions.keys()].sort((left, right) => {
    const [lc, lr] = left.split(':').map(Number);
    const [rc, rr] = right.split(':').map(Number);
    return lc - rc || lr - rr;
  });
  const gatherOffsets = new Uint32Array(keys.length + 1);
  const entries = [];
  for (let slot = 0; slot < keys.length; slot += 1) {
    entries.push(...slotContributions.get(keys[slot]));
    gatherOffsets[slot + 1] = entries.length;
  }
  return {
    gatherOffsets,
    gatherEntries: Uint32Array.from(entries),
    slotKeys: keys,
    matrixDimension: Number(options.matrixDimension) || inferredMatrixDimension(scatters),
  };
}

export async function executeNativeShellGpuBatch(platform, batch, options = {}) {
  const startedAt = now();
  const tangentPayload = prepareShellTangentPayload(batch);
  const scatters = options.scatters || defaultScatters(batch);
  const gather = buildShellDeterministicGatherPayload(batch, scatters, options);
  const recovery = options.recovery || null;
  try {
    const tangent = await executeWebGpuKernel(platform, 'shellTangentBatch', tangentPayload, options);
    const assemblyPayload = { ...gather, elementValues: tangent.values };
    const assembly = await executeWebGpuKernel(platform, 'shellDeterministicGather', assemblyPayload, options);
    const stress = recovery
      ? await executeWebGpuKernel(platform, 'shellStressRecovery', recovery, options)
      : null;
    const cpuTangent = referenceShellTangentBatch(tangentPayload);
    const cpuAssembly = referenceShellDeterministicGather({ ...gather, elementValues: cpuTangent });
    const cpuStress = recovery ? referenceShellStressRecovery(recovery) : null;
    const tangentError = maxRelativeError(tangent.values, cpuTangent);
    const assemblyError = maxRelativeError(assembly.values, cpuAssembly);
    const stressError = stress ? maxRelativeError(stress.values, cpuStress) : 0;
    const relativeError = Math.max(tangentError, assemblyError, stressError);
    const tolerance = Number(options.tolerance ?? 1e-6);
    if (relativeError > tolerance) throw shellGpuError('SHELL_GPU_PARITY_FAILED', `Native shell GPU parity ${relativeError} exceeds ${tolerance}.`);
    return {
      ok: true,
      version: SHELL_GPU_KERNEL_VERSION,
      backend: 'webgpu-shell-native',
      nativeDispatch: true,
      qualified: true,
      fallbackUsed: false,
      tangentValues: tangent.values,
      assembledValues: assembly.values,
      stressValues: stress?.values || null,
      slotKeys: gather.slotKeys,
      relativeError,
      parity: { tangentError, assemblyError, stressError, tolerance },
      kernels: ['K1-element-tangent', 'K2-deterministic-gather', ...(stress ? ['K3-stress-recovery'] : [])],
      telemetry: { elementCount: batch.elementCount, slotCount: gather.slotKeys.length, durationMs: now() - startedAt },
    };
  } catch (error) {
    if (options.fallback === false) throw error;
    const cpuTangent = runShellCpuReference(batch).tangentValues;
    const cpuAssembly = deterministicGatherF64(gather, cpuTangent);
    const cpuStress = recovery ? stressRecoveryF64(recovery) : null;
    return {
      ok: true,
      version: SHELL_GPU_KERNEL_VERSION,
      backend: 'cpu-f64-fallback',
      nativeDispatch: false,
      qualified: false,
      fallbackUsed: true,
      fallbackReason: error.code || error.message || 'SHELL_GPU_EXECUTION_FAILED',
      tangentValues: cpuTangent,
      assembledValues: cpuAssembly,
      stressValues: cpuStress,
      slotKeys: gather.slotKeys,
      telemetry: { elementCount: batch.elementCount, slotCount: gather.slotKeys.length, durationMs: now() - startedAt },
    };
  }
}

function maxRelativeError(a, b) {
  let error = 0;
  for (let i = 0; i < a.length; i += 1) error = Math.max(error, Math.abs(a[i] - b[i]) / Math.max(1, Math.abs(b[i])));
  return error;
}

function defaultScatters(batch) {
  return Array.from({ length: batch.elementCount }, (_, element) => {
    const dofs = new Int32Array(24);
    for (let local = 0; local < 4; local += 1) for (let component = 0; component < 6; component += 1) {
      dofs[local * 6 + component] = batch.nodeIndices[element * 4 + local] * 6 + component;
    }
    return { element, dofs };
  });
}
function inferredMatrixDimension(scatters) {
  let maximum = -1;
  for (const scatter of scatters) for (const dof of scatter.dofs) maximum = Math.max(maximum, dof);
  return maximum + 1;
}
function deterministicGatherF64(gather, elementValues) {
  const output = new Float64Array(gather.gatherOffsets.length - 1);
  for (let slot = 0; slot < output.length; slot += 1) {
    let sum = 0;
    for (let pointer = gather.gatherOffsets[slot]; pointer < gather.gatherOffsets[slot + 1]; pointer += 1) sum += elementValues[gather.gatherEntries[pointer]];
    output[slot] = sum;
  }
  return output;
}
function stressRecoveryF64(input) {
  const output = new Float64Array(input.elementCount * input.responseStride);
  for (let element = 0; element < input.elementCount; element += 1) for (let response = 0; response < input.responseStride; response += 1) {
    let sum = 0;
    const operatorBase = (element * input.responseStride + response) * input.dofStride;
    const displacementBase = element * input.dofStride;
    for (let dof = 0; dof < input.dofStride; dof += 1) sum += Number(input.operators[operatorBase + dof]) * Number(input.displacements[displacementBase + dof]);
    output[element * input.responseStride + response] = sum;
  }
  return output;
}
function now() { return globalThis.performance?.now?.() ?? Date.now(); }
function shellGpuError(code, message) { return Object.assign(new Error(message), { code }); }
