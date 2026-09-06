export const PICKING_VERSION = 'p3-m4-picking-v1';

export function encodePickId(index) {
  const id = Math.max(0, Math.trunc(Number(index) || 0));
  return [(id >> 16) & 255, (id >> 8) & 255, id & 255];
}

export function decodePickColor(color = []) {
  const r = byte(color[0]);
  const g = byte(color[1]);
  const b = byte(color[2]);
  return (r << 16) + (g << 8) + b;
}

export function buildPickingTable(items = []) {
  const table = items.map((item, index) => ({
    index: index + 1,
    color: encodePickId(index + 1),
    type: item.type || item.kind || null,
    id: item.id || null,
  }));
  return {
    version: PICKING_VERSION,
    count: table.length,
    table,
  };
}

export function resolvePick(tableResult, color) {
  const index = decodePickColor(color);
  return (tableResult?.table || []).find((row) => row.index === index) || null;
}

function byte(value) {
  return Math.max(0, Math.min(255, Math.trunc(Number(value) || 0)));
}
