export const FOOTING_DESIGN_VERSION = 'p3-m18-footing-design';

export function designSpreadFooting(row = {}, options = {}) {
  const area = Math.max(Number(row.requiredArea) || 0, 0.6 * 0.6);
  const side = Math.sqrt(area);
  const moment = (Number(row.reaction?.vertical) || 0) * side / 8;
  const rebarArea = moment * 1e6 / Math.max(1, 0.9 * 450 * 400 * 0.85);
  return { version: FOOTING_DESIGN_VERSION, nodeId: row.nodeId, type: 'spread', size: { B: round(side), L: round(side), t: options.thickness || 0.55 }, rebarArea: round(rebarArea), status: row.status || 'OK', formulaId: 'KDS-FOUND-SPREAD-V1' };
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
