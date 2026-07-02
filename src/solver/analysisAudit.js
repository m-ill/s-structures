import { buildAuditRows, maxFinite } from './analysisAuditRows.js';

export const ANALYSIS_AUDIT_VERSION = 'p2-t06-analysis-audit';

export function buildAnalysisAudit(analysis = {}, options = {}) {
  const limit = Number(options.equilibriumLimit || 1e-8);
  const rows = buildAuditRows(analysis.byCombo || {});
  const maxEq = maxFinite(rows.map((row) => row.equilibriumResidual));
  const maxSolver = maxFinite(rows.map((row) => row.solverResidualNorm));
  const warnings = maxEq != null && maxEq > limit
    ? [{ code: 'EQUILIBRIUM_RESIDUAL', message: 'Equilibrium residual exceeds limit.' }]
    : [];
  rows
    .filter((row) => row.unilateralConverged === false)
    .forEach((row) => warnings.push({
      code: 'UNILATERAL_NOT_CONVERGED',
      comboId: row.comboId,
      message: 'Tension-only or compression-only member iteration did not converge.',
    }));
  return { version: ANALYSIS_AUDIT_VERSION, ok: !!analysis.ok && !warnings.length, equilibriumLimit: limit, comboCount: rows.length, solvedComboCount: rows.filter((row) => row.ok).length, maxEquilibriumResidual: maxEq, maxSolverResidualNorm: maxSolver, rows, warnings };
}
