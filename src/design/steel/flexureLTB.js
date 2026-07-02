export const STEEL_FLEXURE_LTB_VERSION = 'p3-m18-steel-flexure-ltb';

export function checkSteelFlexureLtb(check = {}, options = {}) {
  const z = findCheck(check, 'steel-flexure-z');
  const y = findCheck(check, 'steel-flexure-y');
  const lb = Number(options.Lb || check.length || 3000);
  const cb = Number(options.Cb || 1);
  const ltbFactor = Math.max(0.55, Math.min(1, cb * 3000 / Math.max(1, lb)));
  const flexureRatio = Math.max(z?.ratio || 0, y?.ratio || 0);
  const ratio = ltbFactor > 0 ? flexureRatio / ltbFactor : flexureRatio;
  return {
    version: STEEL_FLEXURE_LTB_VERSION,
    memberId: check.memberId,
    ratio,
    Lb: lb,
    Cb: cb,
    ltbFactor,
    status: ratio > 1 ? 'NG' : ratio > 0.8 ? 'WARN' : 'OK',
    formulaId: 'KDS-ST-FLEXURE-LTB-V1',
  };
}

function findCheck(check, id) {
  return (check.checks || []).find((item) => item.id === id) || null;
}
