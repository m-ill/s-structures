import {
  referenceFiberSampleBatch,
  referenceFrameMatrixBatch,
} from '../backends/webgpu/cpuReference.js';

export const NONLINEAR_GPU_CANDIDATE_VERSION = 'p9-m7-nonlinear-gpu-shadow-candidate-v1';

export async function executeNonlinearGpuCandidate(input = {}) {
  const operation = String(input.operation || '');
  if (!['fiberSampleBatch', 'frameMatrixBatch'].includes(operation)) {
    return failed('NONLINEAR_GPU_OPERATION_UNSUPPORTED');
  }
  if (input.production === true || input.designTransfer === true) return failed('NONLINEAR_GPU_NOT_DESIGN_QUALIFIED');
  if (typeof input.backend?.execute !== 'function') return failed('NONLINEAR_GPU_BACKEND_REQUIRED');
  const reference = operation === 'fiberSampleBatch'
    ? referenceFiberSampleBatch(input.payload)
    : referenceFrameMatrixBatch(input.payload);
  const arena = input.stateArena || null;
  const initialArena = arena?.snapshot?.() || null;
  try {
    arena?.beginTrial?.(input.runId);
    const gpu = await input.backend.execute(operation, input.payload, { signal: input.signal });
    const values = gpu?.values;
    const parity = compareF32(reference, values, input.tolerance);
    if (!parity.ok) {
      const rolledBack = arena?.rollback?.(input.runId) || null;
      return failed('NONLINEAR_GPU_PARITY_FAILED', { parity, initialArena, rolledBack });
    }
    if (arena && input.stateElementId != null) {
      const numeric = input.numericStateSelector ? input.numericStateSelector(values) : values;
      arena.writeTrialNumeric(input.stateElementId, numeric, input.runId);
    }
    const trialArena = arena?.snapshot?.() || null;
    return Object.freeze({
      version: NONLINEAR_GPU_CANDIDATE_VERSION,
      ok: true,
      operation,
      qualification: 'G2-shadow-candidate-no-design-transfer',
      designTransferAllowed: false,
      values: Float32Array.from(values),
      parity,
      state: Object.freeze({ initial: initialArena, trial: trialArena, committedUnchanged: initialArena == null || initialArena.committedHash === trialArena.committedHash }),
      energies: Object.freeze(deriveShadowEnergies(operation, values)),
      diagnostics: Object.freeze({ precision: 'f32', reference: 'cpu-f32-fixed-order', rawKernelOnly: true }),
    });
  } catch (error) {
    let rolledBack = null;
    try { rolledBack = arena?.rollback?.(input.runId) || null; } catch {}
    return failed(error.code || 'NONLINEAR_GPU_EXECUTION_FAILED', { message: error.message, initialArena, rolledBack });
  }
}

function compareF32(expected, actual, tolerance = {}) {
  if (!ArrayBuffer.isView(actual) && !Array.isArray(actual)) return Object.freeze({ ok: false, reason: 'GPU_RESULT_VECTOR_REQUIRED' });
  if (expected.length !== actual.length) return Object.freeze({ ok: false, reason: 'GPU_RESULT_SHAPE_MISMATCH' });
  const absolute = positive(tolerance.absolute, 2e-5);
  const relative = positive(tolerance.relative, 2e-5);
  let maxAbsoluteError = 0;
  let maxRelativeError = 0;
  let failingIndex = -1;
  for (let index = 0; index < expected.length; index += 1) {
    const e = Number(expected[index]);
    const a = Number(actual[index]);
    const absoluteError = Math.abs(a - e);
    const relativeError = absoluteError / Math.max(1, Math.abs(e));
    if (!Number.isFinite(a) || (absoluteError > absolute && relativeError > relative)) { failingIndex = index; break; }
    maxAbsoluteError = Math.max(maxAbsoluteError, absoluteError);
    maxRelativeError = Math.max(maxRelativeError, relativeError);
  }
  return Object.freeze({ ok: failingIndex < 0, failingIndex, maxAbsoluteError, maxRelativeError, absoluteTolerance: absolute, relativeTolerance: relative });
}

function deriveShadowEnergies(operation, values) {
  let normSquared = 0;
  for (const value of values || []) normSquared += Number(value) ** 2;
  return { channel: `${operation}:output-l2`, value: Math.sqrt(normSquared), physicalEnergy: false };
}

function failed(reason, details = null) {
  return Object.freeze({ version: NONLINEAR_GPU_CANDIDATE_VERSION, ok: false, reason, details, designTransferAllowed: false });
}
function positive(value, fallback) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : fallback; }
