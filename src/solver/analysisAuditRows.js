export function buildAuditRows(byCombo = {}) {
  return Object.entries(byCombo).map(([comboId, result]) => ({
    comboId,
    ok: !!result?.ok && !!result?.anyOk,
    equilibriumResidual: finite(result?.summary?.equilibriumResidual),
    solverResidualNorm: finite(result?.summary?.solverResidualNorm),
    unilateralConverged: result?.unilateral?.enabled ? !!result.unilateral.converged : null,
    unilateralInactiveMemberCount: result?.unilateral?.inactiveMemberIds?.length ?? 0,
  }));
}

export function maxFinite(values) {
  const finiteValues = values.filter((value) => value != null);
  return finiteValues.length ? Math.max(...finiteValues) : null;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
