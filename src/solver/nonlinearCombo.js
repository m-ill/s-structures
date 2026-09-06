export const NONLINEAR_COMBO_GUARD_VERSION = 'p6-m5-nonlinear-combo-guard-v1';

export function nonlinearCombinationFeatures(model = {}, combo = null) {
  const features = [];
  const members = model.members || [];
  if (members.some((member) => ['tensionOnly', 'compressionOnly'].includes(member.behavior || member.type))) {
    features.push('unilateral-members');
  }
  if (model.analysisSettings?.includeGeometricStiffness || model.analysisSettings?.pDeltaMethod === 'direct') {
    features.push('p-delta-second-order');
  }
  if ((model.nodes || []).some((node) => node.support === 'spring' && node.spring?.kz && node.uplift === true)) {
    features.push('uplift-spring-support');
  }
  if ((combo?.factors && Object.values(combo.factors).some((factor) => Number(factor) < 0)) || model.analysisSettings?.signedNonlinearCases) {
    features.push('signed-load-combination');
  }
  return [...new Set(features)];
}

export function guardNonlinearCombinationSuperposition(model = {}, combo = null, options = {}) {
  const features = nonlinearCombinationFeatures(model, combo);
  const requested = options.operation || 'linear-superposition';
  const requiresWholeCombinationIteration = features.length > 0;
  const blocked = requiresWholeCombinationIteration && requested === 'linear-superposition';
  return {
    version: NONLINEAR_COMBO_GUARD_VERSION,
    comboId: combo?.id || null,
    operation: requested,
    features,
    requiresWholeCombinationIteration,
    blocked,
    status: blocked ? 'BLOCKED' : 'OK',
    requiredExecution: requiresWholeCombinationIteration
      ? 'solve full factored combination vector F=sum(factor_i*F_i) inside the nonlinear iteration'
      : 'linear combination superposition allowed',
    warning: blocked
      ? 'Nonlinear load cases cannot be solved separately and linearly superposed after iteration.'
      : null,
  };
}
