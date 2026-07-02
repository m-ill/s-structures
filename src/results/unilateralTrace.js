export const UNILATERAL_MEMBER_TRACE_VERSION = 'p3-m11-unilateral-member-trace';

export function buildUnilateralMemberTrace(analysis = {}) {
  const combos = Object.entries(analysis.byCombo || {})
    .filter(([, result]) => result?.unilateral?.enabled)
    .map(([comboId, result]) => ({
      comboId,
      converged: !!result.unilateral.converged,
      iterationCount: result.unilateral.iterationCount || 0,
      inactiveMemberIds: result.unilateral.inactiveMemberIds || [],
      activeMemberIds: result.unilateral.activeMemberIds || [],
      iterations: result.unilateral.iterations || [],
      warning: result.unilateral.warning || null,
    }));
  return {
    version: UNILATERAL_MEMBER_TRACE_VERSION,
    enabled: combos.length > 0,
    comboCount: combos.length,
    convergedCount: combos.filter((combo) => combo.converged).length,
    inactiveMemberIds: [...new Set(combos.flatMap((combo) => combo.inactiveMemberIds))].sort(),
    combos,
    limitations: [
      'Tension-only and compression-only state is evaluated per load combination.',
      'Envelope results should be read with the combo-specific active/inactive member state.',
    ],
  };
}
