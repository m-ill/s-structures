export const RC_PM_CURVE_VERSION = 'p3-m17-rc-pm-curve';

export function buildRcPmCurve(section = {}, material = {}, options = {}) {
  const b = finite(section.b, section.bz, options.b, 0.4);
  const h = finite(section.h, section.hz, options.h, 0.4);
  const ag = finite(section.Ag, b * h);
  const as = finite(section.AsTotal, options.AsTotal, ag * 1e6 * 0.015);
  const fc = finite(material.fc, material.fck, 24);
  const fy = finite(material.fy, material.Fy, 400);
  const phi = finite(options.phi, 0.65);
  const pn0 = phi * (0.85 * fc * Math.max(0, ag * 1e6 - as) + fy * as) / 1000;
  const mn0 = 0.85 * as * fy * Math.max(h * 1000 * 0.4, 1) / 1e6;
  const points = [
    point('P0', pn0, 0, pn0),
    point('balanced', pn0 * 0.45, mn0 * 0.85, pn0),
    point('low-axial', pn0 * 0.15, mn0, pn0),
    point('M0', 0, mn0 * 0.92, pn0),
  ];
  return {
    version: RC_PM_CURVE_VERSION,
    method: 'rectangular-section-pm-v1',
    section: { b, h, Ag: ag, AsTotal: as },
    material: { fc, fy, phi },
    points,
    formulaId: 'KDS-RC-PM-CURVE-V1',
  };
}

function point(label, axial, moment, p0) {
  return {
    label,
    axial: round(axial),
    moment: round(moment),
    axialRatio: round(axial / Math.max(1, p0)),
  };
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function finite(...values) {
  for (const value of values) if (Number.isFinite(Number(value))) return Number(value);
  return 0;
}
