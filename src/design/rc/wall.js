import { selectLongitudinalBars, selectStirrups } from '../rcDetailing.js';
import { buildRcPmCurve } from './pmCurve.js';

export const RC_WALL_DETAIL_VERSION = 'p3-m17-rc-wall-detail';

export function detailRcWall(input = {}, options = {}) {
  const id = input.id || input.memberId || 'wall';
  const section = input.section || {};
  const material = input.material || {};
  const width = Number(section.width || section.b || options.width || 3);
  const thickness = Number(section.thickness || section.h || options.thickness || 0.2);
  const area = width * thickness;
  const verticalRatio = Number(input.verticalRatio || options.verticalRatio || 0.0025);
  const horizontalRatio = Number(input.horizontalRatio || options.horizontalRatio || 0.0025);
  const vertical = selectLongitudinalBars(area * 1e6 * verticalRatio, { minBars: 2, preferredBar: options.wallVerticalBar || 'D16' });
  const horizontal = selectStirrups(area * 1e6 * horizontalRatio / 1000, { ...options, stirrupBar: options.wallHorizontalBar || 'D13' });
  const pmCurve = buildRcPmCurve({ b: thickness, h: width, Ag: area, AsTotal: vertical.providedArea }, material, options);
  const shearRatio = Math.abs(Number(input.V || input.shear || 0)) / Math.max(1, 0.17 * Math.sqrt(material.fc || 24) * thickness * 1000 * width * 1000 / 1000);
  const boundary = { required: axialRatio(input, pmCurve) > 0.2 || shearRatio > 0.6, formulaId: 'KDS-RC-WALL-BOUNDARY-V1' };
  return {
    version: RC_WALL_DETAIL_VERSION,
    wallId: id,
    role: 'wall',
    status: shearRatio > 1 ? 'NG' : boundary.required ? 'WARN' : 'OK',
    pm: { curve: pmCurve, formulaId: 'KDS-RC-WALL-PM-V1' },
    shear: { ratio: round(shearRatio), horizontal, formulaId: 'KDS-RC-WALL-SHEAR-V1' },
    reinforcement: { verticalRatio, horizontalRatio, vertical, horizontal },
    boundary,
  };
}

function axialRatio(input, pmCurve) {
  return Math.abs(Number(input.N || input.axial || 0)) / Math.max(1, pmCurve.points[0]?.axial || 1);
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
