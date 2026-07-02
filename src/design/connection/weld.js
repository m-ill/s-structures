export const WELD_CONNECTION_VERSION = 'p3-m18-weld-connection';

export function designFilletWeld(row = {}, options = {}) {
  const demand = Number(row.equivalentDemand) || 0;
  const throatCapacity = Number(options.weldCapacityPerMm || 0.9);
  const length = Math.max(100, Math.ceil(demand / Math.max(0.1, throatCapacity)));
  const ratio = demand / Math.max(1, length * throatCapacity);
  return { version: WELD_CONNECTION_VERSION, memberId: row.memberId, size: options.weldSize || 6, requiredLength: length, ratio, status: ratio > 1 ? 'NG' : ratio > 0.8 ? 'WARN' : 'OK', formulaId: 'KDS-CONN-WELD-V1' };
}
