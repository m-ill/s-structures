export const STEEL_INTERACTION_VERSION = 'p3-m18-steel-interaction';

export function checkSteelInteraction(check = {}) {
  const interaction = (check.checks || []).find((item) => item.id === 'steel-interaction');
  const axial = (check.checks || []).find((item) => item.id === 'steel-axial');
  const flexureZ = (check.checks || []).find((item) => item.id === 'steel-flexure-z');
  const flexureY = (check.checks || []).find((item) => item.id === 'steel-flexure-y');
  const ratio = Number(interaction?.ratio ?? ((axial?.ratio || 0) + (flexureZ?.ratio || 0) + (flexureY?.ratio || 0)));
  return {
    version: STEEL_INTERACTION_VERSION,
    memberId: check.memberId,
    ratio,
    components: { axial: axial?.ratio || 0, flexureZ: flexureZ?.ratio || 0, flexureY: flexureY?.ratio || 0 },
    status: ratio > 1 ? 'NG' : ratio > 0.8 ? 'WARN' : 'OK',
    formulaId: 'KDS-ST-H1-INTERACTION-V1',
  };
}
