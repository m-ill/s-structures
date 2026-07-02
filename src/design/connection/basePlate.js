export const BASE_PLATE_VERSION = 'p3-m18-base-plate';

export function designBasePlate(foundationRow = {}, options = {}) {
  const vertical = Number(foundationRow.reaction?.vertical) || 0;
  const bearing = Number(foundationRow.allowableBearing || options.allowableBearing || 150);
  const area = Math.max(Number(foundationRow.requiredArea) || 0, vertical / Math.max(1, bearing));
  const side = Math.max(0.25, Math.sqrt(area));
  const anchors = foundationRow.uplift ? 4 : 2;
  return {
    version: BASE_PLATE_VERSION,
    contract: {
      milestone: 'P3-M18',
      tickets: ['P3-T92'],
      scope: 'Base-plate bearing area, plate sizing, and anchor count trace.',
    },
    nodeId: foundationRow.nodeId,
    plate: { width: round(side), length: round(side), thickness: options.thickness || 25 },
    anchors,
    status: foundationRow.uplift ? 'WARN' : foundationRow.status || 'OK',
    formulaId: 'KDS-CONN-BASEPLATE-V1',
    summary: { vertical, bearing, requiredArea: round(area), uplift: !!foundationRow.uplift },
  };
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
