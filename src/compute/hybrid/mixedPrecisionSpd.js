import { stableHash } from '../../core/stableHash.js';
import { cscMatVec, cscRowNorms } from '../sparse/matrix.js';
import {
  prepareHybridSpdSystem,
  scaleHybridRhs,
  unscaleHybridSolution,
} from './spdEligibility.js';

export const MIXED_PRECISION_SPD_VERSION = 'p9-m5-mixed-precision-spd-v1';

export async function createMixedPrecisionSpdSession(matrix, options = {}) {
  const prepared = prepareHybridSpdSystem(matrix, options.eligibility || options);
  if (!prepared.eligible) {
    throw mixedError(
      prepared.reason || 'HYBRID_SPD_INELIGIBLE',
      'Matrix is not eligible for mixed-precision SPD solve.',
      eligibilitySummary(prepared),
    );
  }
  if (typeof options.gpuSessionFactory !== 'function') throw mixedError('HYBRID_SPD_GPU_FACTORY_REQUIRED', 'A qualified GPU SPD session factory is required.');
  const gpu = await options.gpuSessionFactory(prepared.scaledCsr, {
    tolerance: positive(options.gpuTolerance, 1e-5),
    maxIterations: positiveInteger(options.gpuMaxIterations, Math.min(2048, Math.max(64, prepared.matrix.rowCount * 2))),
    curvatureTolerance: positive(options.curvatureTolerance, 1e-12),
    signal: options.signal,
  });
  const f64Tolerance = positive(options.f64Tolerance, 1e-8);
  const loadResidualTolerance = positive(options.loadResidualTolerance, f64Tolerance * 10);
  const maxCorrections = nonnegativeInteger(options.maxCorrections, 3);
  let solveCount = 0;
  let correctionSolveCount = 0;
  let failedSolveCount = 0;
  let disposed = false;

  return Object.freeze({
    version: MIXED_PRECISION_SPD_VERSION,
    prepared,
    solve,
    snapshot,
    dispose,
  });

  async function solve(rhsInput, solveOptions = {}) {
    if (disposed) return failed('HYBRID_SPD_SESSION_DISPOSED');
    const rhs = Float64Array.from(rhsInput || [], Number);
    if (rhs.length !== prepared.matrix.rowCount || rhs.some((value) => !Number.isFinite(value))) return failed('HYBRID_SPD_RHS_INVALID');
    solveCount += 1;
    let gpuResult = await gpu.solve(scaleHybridRhs(prepared, rhs), { signal: solveOptions.signal });
    if (!gpuResult?.ok) return rejectGpu(gpuResult?.reason || 'HYBRID_SPD_GPU_SOLVE_FAILED', gpuResult);
    let x = unscaleHybridSolution(prepared, gpuResult.x);
    let audit = f64ResidualAudit(prepared.matrix, x, rhs, { f64Tolerance, loadResidualTolerance });
    const corrections = [];
    for (let correction = 1; !audit.ok && correction <= maxCorrections; correction += 1) {
      if (solveOptions.signal?.aborted) return rejectGpu('HYBRID_SPD_CANCELLED', gpuResult);
      const corrected = await gpu.solve(scaleHybridRhs(prepared, audit.residual), { signal: solveOptions.signal });
      correctionSolveCount += 1;
      if (!corrected?.ok) return rejectGpu(corrected?.reason || 'HYBRID_SPD_CORRECTION_FAILED', corrected, corrections);
      const delta = unscaleHybridSolution(prepared, corrected.x);
      for (let index = 0; index < x.length; index += 1) x[index] += delta[index];
      const nextAudit = f64ResidualAudit(prepared.matrix, x, rhs, { f64Tolerance, loadResidualTolerance });
      corrections.push({
        correction,
        gpuIterations: corrected.diagnostics?.iterations ?? null,
        beforeBackwardError: audit.backwardError,
        afterBackwardError: nextAudit.backwardError,
        afterLoadRelativeResidual: nextAudit.loadRelativeResidual,
      });
      gpuResult = corrected;
      audit = nextAudit;
    }
    if (!audit.ok) return rejectGpu('HYBRID_SPD_F64_CORRECTION_NOT_CONVERGED', gpuResult, corrections, audit);
    const diagnostics = {
      version: MIXED_PRECISION_SPD_VERSION,
      precisionMode: 'mixed-f32-f64',
      gpuMethod: gpuResult.diagnostics?.method || 'webgpu-spd-pcg-f32',
      gpuIterations: gpuResult.diagnostics?.iterations ?? null,
      correctionCount: corrections.length,
      corrections,
      eligibilityHash: prepared.eligibilityHash,
      originalPatternHash: prepared.patternHash,
      originalValueHash: prepared.valueHash,
      fallback: false,
      route: 'gpu-f32-solve-cpu-f64-residual-correction',
      finalF64BackwardError: audit.backwardError,
      finalF64LoadRelativeResidual: audit.loadRelativeResidual,
    };
    return Object.freeze({
      ok: true,
      x,
      reason: null,
      f64Residual: audit,
      diagnostics,
      designTransferAllowed: true,
      resultHash: stableHash({ x: Array.from(x), diagnostics, f64Residual: serializableAudit(audit) }),
    });
  }

  function rejectGpu(reason, gpuResult, corrections = [], audit = null) {
    failedSolveCount += 1;
    return failed(reason, {
      gpuDiagnostics: gpuResult?.diagnostics || null,
      corrections,
      f64Residual: audit ? serializableAudit(audit) : null,
    });
  }

  function failed(reason, diagnostics = {}) {
    return Object.freeze({ ok: false, x: null, reason, f64Residual: diagnostics.f64Residual || null, diagnostics, designTransferAllowed: false });
  }

  function snapshot() {
    return Object.freeze({
      version: MIXED_PRECISION_SPD_VERSION,
      disposed,
      solveCount,
      correctionSolveCount,
      failedSolveCount,
      eligibilityHash: prepared.eligibilityHash,
      gpu: gpu.snapshot?.() || null,
      designTransferAllowed: false,
    });
  }

  async function dispose() {
    if (disposed) return snapshot();
    disposed = true;
    await gpu.dispose?.();
    return snapshot();
  }
}

export function f64ResidualAudit(matrix, solutionInput, rhsInput, options = {}) {
  const x = Float64Array.from(solutionInput || [], Number);
  const rhs = Float64Array.from(rhsInput || [], Number);
  if (x.length !== matrix.colCount || rhs.length !== matrix.rowCount || x.some(nonfinite) || rhs.some(nonfinite)) {
    return { ok: false, reason: 'HYBRID_SPD_F64_AUDIT_INPUT_INVALID', residual: new Float64Array(), backwardError: Infinity, loadRelativeResidual: Infinity };
  }
  const product = cscMatVec(matrix, x);
  const residual = Float64Array.from(rhs, (value, index) => value - product[index]);
  const residualNorm = normInf(residual);
  const loadNorm = normInf(rhs);
  const matrixNorm = Math.max(0, ...cscRowNorms(matrix));
  const solutionNorm = normInf(x);
  const backwardError = residualNorm / Math.max(1, loadNorm, matrixNorm * solutionNorm);
  const loadRelativeResidual = residualNorm / Math.max(1, loadNorm);
  const f64Tolerance = positive(options.f64Tolerance, 1e-8);
  const loadResidualTolerance = positive(options.loadResidualTolerance, f64Tolerance * 10);
  const ok = Number.isFinite(backwardError) && Number.isFinite(loadRelativeResidual)
    && backwardError <= f64Tolerance && loadRelativeResidual <= loadResidualTolerance;
  return Object.freeze({
    ok,
    reason: ok ? null : 'HYBRID_SPD_F64_RESIDUAL_EXCEEDED',
    residual,
    residualMax: residualNorm,
    backwardError,
    loadRelativeResidual,
    loadNorm,
    matrixNorm,
    solutionNorm,
    f64Tolerance,
    loadResidualTolerance,
    equation: 'r=b-Ax in original unscaled f64 system',
  });
}

function serializableAudit(audit) {
  const copy = { ...audit, residual: Array.from(audit.residual || []) };
  return copy;
}

function eligibilitySummary(prepared) {
  const {
    matrix: _matrix,
    scales: _scales,
    scaledCsc: _scaledCsc,
    scaledCsr: _scaledCsr,
    ...summary
  } = prepared;
  return summary;
}

function nonfinite(value) { return !Number.isFinite(value); }
function normInf(values) { return Math.max(0, ...values.map((value) => Math.abs(value))); }
function positive(value, fallback) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : fallback; }
function positiveInteger(value, fallback) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback; }
function nonnegativeInteger(value, fallback) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : fallback; }
function mixedError(code, message, details = null) { return Object.assign(new Error(message), { code, details }); }
