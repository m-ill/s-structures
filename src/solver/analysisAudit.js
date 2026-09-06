import { buildAuditRows, maxFinite } from './analysisAuditRows.js';

export const ANALYSIS_AUDIT_VERSION = 'p7-m7-six-resultant-analysis-audit-v1';

export function buildAnalysisAudit(analysis = {}, options = {}) {
  const requestedLimit = Number(options.equilibriumLimit);
  const limit = Number.isFinite(requestedLimit) && requestedLimit >= 0 ? requestedLimit : 1e-8;
  const byCombo = analysis.byCombo || {};
  const rows = buildAuditRows(byCombo).map((row) => {
    const result = byCombo[row.comboId] || {};
    const summary = byCombo[row.comboId]?.summary || {};
    const forceResidualNorm = finite(summary.forceResidualNorm ?? summary.forceEquilibriumResidual);
    const momentResidualNorm = finite(summary.momentResidualNorm ?? summary.momentEquilibriumResidual);
    const reportedResidual = finite(summary.equilibriumResidual);
    const equilibriumResidual = maxFinite([
      reportedResidual,
      forceResidualNorm,
      momentResidualNorm,
    ]);
    const nonfiniteIssues = collectNonfiniteIssues(result, summary);
    const reportedStatus = String(summary.equilibriumStatus || '').toUpperCase();
    const equilibriumStatus = !row.ok || reportedStatus === 'NOT_SOLVED'
      ? 'NOT_SOLVED'
      : reportedStatus === 'NOT_AVAILABLE' || nonfiniteIssues.length || equilibriumResidual == null
        ? 'NOT_AVAILABLE'
        : equilibriumResidual <= limit ? 'PASS' : 'FAIL';
    return {
      ...row,
      equilibriumResidual,
      forceResidualNorm,
      momentResidualNorm,
      forceEquilibriumResidual: forceResidualNorm,
      momentEquilibriumResidual: momentResidualNorm,
      equilibriumStatus,
      equilibriumOk: equilibriumStatus === 'PASS',
      designBlocked: equilibriumStatus !== 'PASS',
      blockingReason: equilibriumStatus === 'NOT_SOLVED'
        ? result.reason || 'COMBINATION_NOT_SOLVED'
        : nonfiniteIssues[0]?.code || summary.equilibriumFailureReason || (equilibriumStatus === 'NOT_AVAILABLE' ? 'EQUILIBRIUM_NOT_AVAILABLE' : null),
      nonfiniteIssues,
      status: equilibriumStatus,
    };
  });
  const maxEq = maxFinite(rows.map((row) => row.equilibriumResidual));
  const maxForce = maxFinite(rows.map((row) => row.forceResidualNorm));
  const maxMoment = maxFinite(rows.map((row) => row.momentResidualNorm));
  const maxSolver = maxFinite(rows.map((row) => row.solverResidualNorm));
  const warnings = maxEq != null && maxEq > limit
    ? [{ code: 'EQUILIBRIUM_RESIDUAL', message: 'Equilibrium residual exceeds limit.' }]
    : [];
  rows
    .filter((row) => row.equilibriumStatus === 'NOT_SOLVED')
    .forEach((row) => warnings.push({
      code: 'COMBINATION_NOT_SOLVED',
      comboId: row.comboId,
      reason: row.blockingReason,
      message: 'The requested combination did not produce solved results.',
    }));
  rows
    .filter((row) => row.equilibriumStatus === 'NOT_AVAILABLE')
    .forEach((row) => warnings.push({
      code: row.nonfiniteIssues.length ? 'NONFINITE_EQUILIBRIUM_RESULTANT' : 'EQUILIBRIUM_NOT_AVAILABLE',
      comboId: row.comboId,
      reason: row.blockingReason,
      issues: row.nonfiniteIssues,
      message: row.nonfiniteIssues.length
        ? 'Equilibrium qualification is unavailable because a reaction or resultant is nonfinite.'
        : 'Equilibrium qualification is unavailable for the requested combination.',
    }));
  rows
    .filter((row) => row.forceResidualNorm != null && row.forceResidualNorm > limit)
    .forEach((row) => warnings.push({
      code: 'FORCE_EQUILIBRIUM_RESIDUAL',
      comboId: row.comboId,
      residual: row.forceResidualNorm,
      message: 'Normalized global force equilibrium residual exceeds limit.',
    }));
  rows
    .filter((row) => row.momentResidualNorm != null && row.momentResidualNorm > limit)
    .forEach((row) => warnings.push({
      code: 'MOMENT_EQUILIBRIUM_RESIDUAL',
      comboId: row.comboId,
      residual: row.momentResidualNorm,
      message: 'Normalized global moment equilibrium residual exceeds limit.',
    }));
  rows
    .filter((row) => row.unilateralConverged === false)
    .forEach((row) => warnings.push({
      code: 'UNILATERAL_NOT_CONVERGED',
      comboId: row.comboId,
      message: 'Tension-only or compression-only member iteration did not converge.',
    }));
  const ok = !!analysis.ok && rows.length > 0 && rows.every((row) => row.equilibriumStatus === 'PASS') && !warnings.length;
  return {
    version: ANALYSIS_AUDIT_VERSION,
    ok,
    status: ok ? 'PASS' : 'FAIL',
    equilibriumLimit: limit,
    comboCount: rows.length,
    solvedComboCount: rows.filter((row) => row.ok).length,
    notSolvedComboCount: rows.filter((row) => row.equilibriumStatus === 'NOT_SOLVED').length,
    unavailableEquilibriumComboCount: rows.filter((row) => row.equilibriumStatus === 'NOT_AVAILABLE').length,
    failedEquilibriumComboCount: rows.filter((row) => row.equilibriumStatus === 'FAIL').length,
    blockedComboCount: rows.filter((row) => row.equilibriumStatus !== 'PASS').length,
    designBlocked: !ok,
    maxEquilibriumResidual: maxEq,
    maxForceResidualNorm: maxForce,
    maxMomentResidualNorm: maxMoment,
    maxForceEquilibriumResidual: maxForce,
    maxMomentEquilibriumResidual: maxMoment,
    maxSolverResidualNorm: maxSolver,
    rows,
    warnings,
  };
}

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function collectNonfiniteIssues(result, summary) {
  const issues = [...(Array.isArray(summary.equilibriumIssues) ? summary.equilibriumIssues : [])]
    .filter((issue) => String(issue?.code || '').includes('NONFINITE'));
  for (const field of ['equilibriumResidual', 'forceResidualNorm', 'forceEquilibriumResidual', 'momentResidualNorm', 'momentEquilibriumResidual']) {
    const value = summary[field];
    if (value != null && finite(value) == null) {
      issues.push({ code: 'NONFINITE_EQUILIBRIUM_METRIC', component: field, value });
    }
  }
  for (const field of ['totalLoadResultant', 'totalReactionResultant', 'residualResultant']) {
    const value = summary[field];
    if (value == null) continue;
    if (!Array.isArray(value) || value.length !== 6) {
      issues.push({ code: 'INVALID_EQUILIBRIUM_RESULTANT', component: field, value });
      continue;
    }
    value.forEach((component, index) => {
      if (finite(component) == null) issues.push({ code: 'NONFINITE_EQUILIBRIUM_RESULTANT', component: `${field}[${index}]`, value: component });
    });
  }
  for (const [nodeId, reaction] of Object.entries(result.reactions || {})) {
    for (const key of ['rx', 'ry', 'rz', 'rmx', 'rmy', 'rmz']) {
      if (finite(reaction?.[key]) == null) {
        issues.push({ code: 'NONFINITE_REACTION_COMPONENT', nodeId, component: key, value: reaction?.[key] });
      }
    }
  }
  return issues;
}
