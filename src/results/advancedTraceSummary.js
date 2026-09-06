export function advancedTraceSummary(pDelta, modal, responseSpectrum, unilateral = null) {
  return {
    pDeltaStatus: pDelta.status,
    pDeltaComboCount: pDelta.combos.length,
    pDeltaDesignStatus: pDelta.design?.summary?.statusLegacy || pDelta.design?.summary?.status || 'N/A',
    pDeltaDesignTier: pDelta.design?.summary?.status || 'N/A',
    pDeltaMaxTheta: pDelta.design?.summary?.maxTheta || 0,
    modeCount: modal.summary.modeCount,
    firstPeriod: modal.summary.firstPeriod,
    rsaDirectionCount: responseSpectrum.directions.length,
    unilateralComboCount: unilateral?.comboCount || 0,
    unilateralInactiveMemberCount: unilateral?.inactiveMemberIds?.length || 0,
    limitations: [
      'P-Delta solver currently uses secondary lateral-load iteration; displayed curves are load-step response curves, not iteration-history curves.',
      'Geometric-stiffness direct P-Delta is available as a separate phase6 direct trace and is not mixed with the legacy equivalent-load path.',
      'Modal analysis uses lumped translational mass from model mass and member self mass.',
      'RSA supports SRSS, CQC, ABS, and NRC10 modal combination with nodal, inertia-force, base-shear, and member-force trace.',
      'Tension-only/compression-only member states are combination-specific and must be reviewed with envelope results.',
    ],
  };
}
