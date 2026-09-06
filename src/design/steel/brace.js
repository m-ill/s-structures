export const STEEL_BRACE_VERSION = 'p3-m18-steel-brace';

export function checkSteelBrace(check = {}) {
  const axial = Math.abs(Number(check.demands?.N) || 0);
  const capacity = Number(check.capacities?.Pa) || 1;
  const slenderness = check.slenderness || {};
  const klr = Math.max(Number(slenderness.KLry) || 0, Number(slenderness.KLrz) || 0);
  const ratio = Math.max(axial / capacity, klr / 200);
  return {
    version: STEEL_BRACE_VERSION,
    memberId: check.memberId,
    ratio,
    klr,
    status: ratio > 1 ? 'NG' : ratio > 0.8 ? 'WARN' : 'OK',
    formulaId: 'KDS-ST-BRACE-AXIAL-V1',
  };
}
