export function advancedTraceSummary(pDelta, modal, responseSpectrum) {
  return {
    pDeltaStatus: pDelta.status,
    pDeltaComboCount: pDelta.combos.length,
    modeCount: modal.summary.modeCount,
    firstPeriod: modal.summary.firstPeriod,
    rsaDirectionCount: responseSpectrum.directions.length,
    limitations: [
      'P-Delta is iterative secondary load amplification, not a full nonlinear tangent-stiffness solve.',
      'Modal analysis uses lumped translational mass from model mass and member self mass.',
      'RSA uses SRSS combination and currently reports displacement trace only.',
    ],
  };
}
