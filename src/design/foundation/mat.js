export const MAT_FOUNDATION_VERSION = 'p3-m18-mat-foundation';

export function designMatFoundation(rows = [], options = {}) {
  const area = Math.max(Number(options.area) || rows.reduce((sum, row) => sum + (Number(row.requiredArea) || 0), 0), 1);
  const vertical = rows.reduce((sum, row) => sum + (Number(row.reaction?.vertical) || 0), 0);
  const pressure = vertical / area;
  const allowable = Number(options.allowableBearing || rows[0]?.allowableBearing || 150);
  return { version: MAT_FOUNDATION_VERSION, supportCount: rows.length, area, pressure, ratio: pressure / Math.max(1, allowable), status: pressure > allowable ? 'NG' : pressure > allowable * 0.8 ? 'WARN' : 'OK', formulaId: 'KDS-FOUND-MAT-V1' };
}
