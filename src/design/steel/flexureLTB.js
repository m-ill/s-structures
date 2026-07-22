export const STEEL_FLEXURE_LTB_VERSION = 'p10-m8-elastic-mcr-ltb-check-v2';

export function calculateElasticCriticalMoment({ E, G, Iz, J, Cw = 0, Lb, C1 = 1, k = 1, kw = 1 } = {}) {
  const inputs = { E, G, Iz, J, Cw, Lb, C1, k, kw };
  const missing = Object.entries(inputs)
    .filter(([key, value]) => {
      const number = Number(value);
      return !Number.isFinite(number) || (key === 'Cw' ? number < 0 : number <= 0);
    })
    .map(([key]) => key);
  if (missing.length) return { ok: false, reason: 'LTB_INPUT_REQUIRED', missing, Mcr: null };
  const effectiveLength = Number(k) * Number(Lb);
  const warpingTerm = (Number(k) / Number(kw)) ** 2 * Number(Cw) / Number(Iz);
  const torsionTerm = effectiveLength ** 2 * Number(G) * Number(J) / (Math.PI ** 2 * Number(E) * Number(Iz));
  const Mcr = Number(C1) * Math.PI ** 2 * Number(E) * Number(Iz) / effectiveLength ** 2
    * Math.sqrt(warpingTerm + torsionTerm);
  return {
    ok: Number.isFinite(Mcr) && Mcr > 0,
    Mcr,
    terms: { warping: warpingTerm, stVenantTorsion: torsionTerm },
    formula: 'C1*pi^2*E*Iz/(k*Lb)^2*sqrt((k/kw)^2*Cw/Iz+(k*Lb)^2*G*J/(pi^2*E*Iz))',
  };
}

export function checkSteelFlexureLtb(check = {}, options = {}) {
  if (check.ltb?.version === STEEL_FLEXURE_LTB_VERSION) return check.ltb;
  const section = check.section || options.section || {};
  const material = check.material || options.material || {};
  const Iz = positive(options.Iz, check.Iz, section.Iweak, weakAxisInertia(section.Iy, section.Iz));
  const Lb = positive(options.Lb, check.Lb, check.length, 3000);
  const C1 = positive(options.C1, options.Cb, check.C1, check.Cb, 1);
  const solved = calculateElasticCriticalMoment({
    E: positive(options.E, material.E),
    G: positive(options.G, material.G),
    Iz,
    J: positive(options.J, section.J),
    Cw: nonnegative(options.Cw, section.Cw, 0),
    Lb,
    C1,
    k: positive(options.k, check.k, 1),
    kw: positive(options.kw, check.kw, 1),
  });
  const legacyFlexure = Math.max(findCheck(check, 'steel-flexure-z')?.demand || 0, findCheck(check, 'steel-flexure-y')?.demand || 0);
  const Mmax = maxMagnitude(check.demandMoment, check.Mmax, check.demands?.Mz, check.demands?.My, legacyFlexure);
  const ratio = solved.ok ? Mmax / solved.Mcr : 0;
  const warnAt = nonnegative(check.warnAt, options.warnAt, 0.8);
  return {
    version: STEEL_FLEXURE_LTB_VERSION,
    type: 'design-check-not-analysis-result',
    memberId: check.memberId || null,
    status: solved.ok ? ratio > 1 ? 'NG' : ratio >= warnAt ? 'WARN' : 'OK' : 'BLOCKED',
    ok: solved.ok,
    reason: solved.reason || null,
    inputReview: { status: solved.ok ? 'complete' : 'review-required', missing: solved.missing || [] },
    Mcr: solved.Mcr,
    Mmax,
    ratio,
    C1,
    Lb,
    k: positive(options.k, check.k, 1),
    kw: positive(options.kw, check.kw, 1),
    weakAxisInertia: Number.isFinite(Iz) ? Iz : null,
    terms: solved.terms || null,
    formula: solved.formula || null,
    formulaId: 'KDS-ST-FLEXURE-LTB-V1',
    governingCombinationId: check.comboId || null,
    analysisDofChanged: false,
    provenance: {
      source: 'p10-m8-closed-form-elastic-critical-moment',
      sectionCwConsumed: Number(section.Cw ?? options.Cw) >= 0,
      stiffnessBasis: 'design-check-only-no-global-stiffness-change',
    },
    limitations: [
      'This is a member design check, not a global analysis result.',
      'The global frame remains six DOF per node; warping displacement, bimoment, and warping stress are not recovered.',
      'The closed form assumes a prismatic doubly-symmetric member and does not include load-height correction.',
      'C1 and the unbraced length must be reviewed against the actual moment gradient and bracing layout.',
    ],
  };
}

function findCheck(check, id) { return (check.checks || []).find((item) => item.id === id) || null; }
function weakAxisInertia(...values) {
  const candidates = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return candidates.length ? Math.min(...candidates) : null;
}
function maxMagnitude(...values) {
  const candidates = values.map(Number).filter(Number.isFinite).map(Math.abs);
  return candidates.length ? Math.max(...candidates) : 0;
}
function positive(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}
function nonnegative(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return 0;
}
