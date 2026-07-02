export const SLICE_CONTROL_VERSION = 'p3-m4-slice-control-v1';

export function normalizeSliceBox(input = {}) {
  const zMin = finite(input.zMin, input.minZ, null);
  const zMax = finite(input.zMax, input.maxZ, null);
  const bounds = order(zMin, zMax);
  return {
    version: SLICE_CONTROL_VERSION,
    enabled: Boolean(input.enabled ?? input.active ?? false),
    axis: input.axis || 'z',
    zMin: bounds[0],
    zMax: bounds[1],
  };
}

export function isPointInSlice(point = {}, slice = {}) {
  const box = normalizeSliceBox(slice);
  if (!box.enabled) return true;
  const value = Number(point[box.axis] ?? point.z ?? 0);
  if (Number.isFinite(box.zMin) && value < box.zMin) return false;
  if (Number.isFinite(box.zMax) && value > box.zMax) return false;
  return true;
}

export function filterBySlice(rows = [], slice = {}, pointOf = (row) => row) {
  const box = normalizeSliceBox(slice);
  return {
    version: SLICE_CONTROL_VERSION,
    slice: box,
    inputCount: rows.length,
    rows: rows.filter((row) => isPointInSlice(pointOf(row), box)),
  };
}

function finite(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return values.at(-1);
}

function order(a, b) {
  if (Number.isFinite(a) && Number.isFinite(b)) return [Math.min(a, b), Math.max(a, b)];
  return [a, b];
}
