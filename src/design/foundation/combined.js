export const COMBINED_FOOTING_VERSION = 'p3-m18-combined-footing';

export function designCombinedFooting(rows = [], options = {}) {
  const vertical = rows.reduce((sum, row) => sum + (Number(row.reaction?.vertical) || 0), 0);
  const area = rows.reduce((sum, row) => sum + (Number(row.requiredArea) || 0), 0);
  return {
    version: COMBINED_FOOTING_VERSION,
    contract: {
      milestone: 'P3-M18',
      tickets: ['P3-T93'],
      scope: 'Combined footing total reaction and area trace.',
    },
    supportCount: rows.length,
    totalVertical: vertical,
    requiredArea: area,
    status: rows.some((row) => row.status === 'NG') ? 'WARN' : 'OK',
    formulaId: 'KDS-FOUND-COMBINED-V1',
    note: options.note || 'Two-or-more support combined footing v1 trace.',
    summary: { supportCount: rows.length, totalVertical: vertical, requiredArea: area },
  };
}
