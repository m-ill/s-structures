import { selectLongitudinalBars, selectStirrups } from '../rcDetailing.js';
import { developmentLength, lapSpliceLength, spacingCheck } from './rebar.js';

export const RC_BEAM_DETAIL_VERSION = 'p3-m17-rc-beam-detail';

export function detailRcBeam(check = {}, options = {}) {
  const req = check.requiredRebar || {};
  const section = check.section || {};
  const material = check.material || {};
  const governingAs = Math.max(req.AsZ || 0, req.AsY || 0);
  const top = selectLongitudinalBars(governingAs, { minBars: 2, preferredBar: options.beamBar || 'D19' });
  const bottom = selectLongitudinalBars(governingAs, { minBars: 2, preferredBar: options.beamBar || 'D19' });
  const stirrup = selectStirrups(Math.max(req.AvsZ || 0, req.AvsY || 0), options);
  const serviceRatio = serviceabilityRatio(check, options);
  const torsion = torsionCheck(check, options);
  const widthMm = Math.round((section.bz || section.b || 0.3) * 1000);
  const status = worstStatus([check.status, serviceRatio.status, torsion.status, spacingCheck(bottom, widthMm).status]);
  return {
    version: RC_BEAM_DETAIL_VERSION,
    contract: {
      milestone: 'P3-M17',
      tickets: ['P3-T87'],
      role: 'beam',
      scope: 'RC beam flexure, shear, torsion warning, serviceability, anchorage, splice, and bar schedule trace.',
    },
    memberId: check.memberId,
    role: 'beam',
    status,
    utilization: check.utilization || 0,
    summary: {
      flexureStatus: check.status || 'OK',
      shearStatus: stirrup.status || 'OK',
      torsionStatus: torsion.status,
      serviceabilityStatus: serviceRatio.status,
      bottomBarLabel: bottom.label,
      stirrupLabel: stirrup.label,
    },
    flexure: { requiredAs: governingAs, requiredAsY: req.AsY || 0, requiredAsZ: req.AsZ || 0, top, bottom, formulaId: 'KDS-RC-BEAM-FLEXURE-V1' },
    shear: { requiredAvs: Math.max(req.AvsZ || 0, req.AvsY || 0), stirrup, formulaId: 'KDS-RC-BEAM-SHEAR-V1' },
    torsion,
    serviceability: serviceRatio,
    anchorage: { development: developmentLength(bottom.bar, material), splice: lapSpliceLength(bottom.bar, material) },
    spacing: spacingCheck(bottom, widthMm),
  };
}

function serviceabilityRatio(check, options) {
  const ratio = Math.min(1.5, Math.max(0, (check.utilization || 0) * (options.serviceFactor || 0.7)));
  return { ratio, status: ratio > 1 ? 'NG' : ratio > 0.8 ? 'WARN' : 'OK', formulaId: 'KDS-RC-BEAM-SERVICE-V1' };
}

function torsionCheck(check, options) {
  const torsion = Math.abs(Number(check.demands?.T || options.torsionDemand) || 0);
  return { demand: torsion, status: torsion > 0 ? 'WARN' : 'OK', formulaId: 'KDS-RC-BEAM-TORSION-V1' };
}

function worstStatus(values) {
  if (values.includes('NG')) return 'NG';
  if (values.includes('WARN')) return 'WARN';
  return 'OK';
}
