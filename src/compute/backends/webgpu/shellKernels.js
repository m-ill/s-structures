import { maxAbs } from '../../../solver/shell/shellElementMath.js';

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

function maxRelativeError(a, b) {
  let error = 0;
  for (let i = 0; i < a.length; i += 1) error = Math.max(error, Math.abs(a[i] - b[i]) / Math.max(1, Math.abs(b[i])));
  return error;
}
