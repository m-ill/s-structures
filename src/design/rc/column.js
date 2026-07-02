import { selectLongitudinalBars, selectStirrups } from '../rcDetailing.js';
import { lapSpliceLength, spacingCheck } from './rebar.js';
import { buildRcPmCurve } from './pmCurve.js';

export const RC_COLUMN_DETAIL_VERSION = 'p3-m17-rc-column-detail';

export function detailRcColumn(check = {}, options = {}) {
  const section = check.section || {};
  const material = check.material || {};
  const required = Math.max(check.requiredRebar?.AsTotal || 0, check.providedRebar?.AsTotal || 0);
  const longitudinal = selectLongitudinalBars(required, { minBars: 4, preferredBar: options.columnBar || 'D22' });
  const ties = selectStirrups(0, { ...options, stirrupBar: options.tieBar || 'D10', maxStirrupSpacing: options.tieSpacing || 150 });
  const pmCurve = buildRcPmCurve({ ...section, AsTotal: longitudinal.providedArea }, material, options);
  const slenderness = slendernessCheck(check, options);
  const shear = { ratio: shearRatio(check), ties, formulaId: 'KDS-RC-COLUMN-SHEAR-TIE-V1' };
  const status = worstStatus([check.status, slenderness.status, shear.ratio > 1 ? 'NG' : 'OK']);
  return {
    version: RC_COLUMN_DETAIL_VERSION,
    memberId: check.memberId,
    role: 'column',
    status,
    utilization: check.utilization || 0,
    pm: { curve: pmCurve, governing: check.governingCheck, formulaId: 'KDS-RC-COLUMN-PM-V1' },
    slenderness,
    longitudinal,
    ties,
    shear,
    spacing: spacingCheck(longitudinal, Math.round((section.bz || section.b || 0.4) * 1000)),
    splice: lapSpliceLength(longitudinal.bar, material),
  };
}

function slendernessCheck(check, options) {
  const kLu = Number(options.kLu || check.length || 3000);
  const r = Number(options.radius || 120);
  const ratio = kLu / Math.max(1, r);
  const limit = Number(options.slendernessLimit || 34);
  return { ratio, limit, status: ratio > limit ? 'WARN' : 'OK', formulaId: 'KDS-RC-COLUMN-SLENDERNESS-V1' };
}

function shearRatio(check) {
  return Math.max(...(check.checks || []).filter((item) => String(item.id).includes('shear')).map((item) => item.ratio), 0);
}

function worstStatus(values) {
  if (values.includes('NG')) return 'NG';
  if (values.includes('WARN')) return 'WARN';
  return 'OK';
}
