export const DIAPHRAGM_VERSION = 'p2-t11-rigid-diaphragm';
export const DIAPHRAGM_TYPES = ['rigid'];

export function normalizeDiaphragms(items = []) {
  return Array.isArray(items) ? items.map(normalizeDiaphragm) : [];
}

export function normalizeDiaphragm(item = {}, index = 0) {
  return {
    id: item.id || `DIA${index + 1}`,
    type: item.type || 'rigid',
    storyId: item.storyId || null,
    z: Number.isFinite(Number(item.z)) ? Number(item.z) : null,
    nodeIds: Array.isArray(item.nodeIds) ? item.nodeIds.filter(Boolean) : null,
    center: item.center || null,
  };
}
