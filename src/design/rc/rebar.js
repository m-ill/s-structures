import { STANDARD_REBARS } from '../rcDetailing.js';

export const RC_REBAR_DETAIL_VERSION = 'p3-m17-rc-rebar-detail';

export function rebarById(id = 'D19') {
  return STANDARD_REBARS.find((bar) => bar.id === id) || STANDARD_REBARS[3];
}

export function developmentLength(barId, material = {}, options = {}) {
  const bar = rebarById(barId);
  const fy = finite(options.fy, material.fy, material.Fy, 400);
  const fc = Math.max(18, finite(options.fc, material.fc, material.fck, 24));
  const factor = finite(options.locationFactor, 1);
  const ld = Math.max(300, factor * 0.043 * fy * bar.diameter / Math.sqrt(fc) * 1000);
  return {
    version: RC_REBAR_DETAIL_VERSION,
    bar: bar.id,
    length: Math.round(ld),
    unit: 'mm',
    formulaId: 'KDS-RC-DEVELOPMENT-V1',
  };
}

export function lapSpliceLength(barId, material = {}, options = {}) {
  const ld = developmentLength(barId, material, options);
  const classFactor = options.spliceClass === 'A' ? 1 : 1.3;
  return {
    version: RC_REBAR_DETAIL_VERSION,
    bar: ld.bar,
    length: Math.round(ld.length * classFactor),
    unit: 'mm',
    spliceClass: options.spliceClass || 'B',
    formulaId: 'KDS-RC-SPLICE-V1',
  };
}

export function spacingCheck(schedule = {}, widthMm = 300, options = {}) {
  const bar = rebarById(schedule.bar);
  const count = Math.max(1, Number(schedule.count) || 1);
  const cover = finite(options.coverMm, 40);
  const clear = count > 1 ? (widthMm - cover * 2 - count * bar.diameter) / (count - 1) : widthMm - cover * 2 - bar.diameter;
  const minClear = Math.max(25, bar.diameter);
  return {
    version: RC_REBAR_DETAIL_VERSION,
    clearSpacing: Math.round(clear),
    minClearSpacing: Math.round(minClear),
    status: clear >= minClear ? 'OK' : 'WARN',
    formulaId: 'KDS-RC-BAR-SPACING-V1',
  };
}

function finite(...values) {
  for (const value of values) if (Number.isFinite(Number(value))) return Number(value);
  return 0;
}
