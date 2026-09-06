export const VIEWER_STATE_VERSION = 'p3-m4-viewer-state-v1';

export function createViewerState(options = {}) {
  return {
    version: VIEWER_STATE_VERSION,
    camera: options.camera || null,
    slice: normalizeSlice(options.slice || options),
    selection: options.selection || null,
    updatedAt: options.updatedAt || null,
  };
}

export function getViewerState(host = {}) {
  const state = ensureViewerState(host);
  return clone(state);
}

export function setViewerSlice(host = {}, payload = {}) {
  const state = ensureViewerState(host);
  state.slice = normalizeSlice({ ...state.slice, ...payload });
  state.updatedAt = payload.updatedAt || new Date().toISOString();
  return clone(state);
}

function ensureViewerState(host) {
  host.SStructuresViewerState ||= createViewerState(host.viewerState || {});
  return host.SStructuresViewerState;
}

function normalizeSlice(input = {}) {
  const enabled = input.enabled ?? input.active ?? false;
  const zMin = finite(input.zMin, input.minZ, null);
  const zMax = finite(input.zMax, input.maxZ, null);
  const ordered = orderBounds(zMin, zMax);
  return {
    enabled: Boolean(enabled),
    axis: input.axis || 'z',
    zMin: ordered[0],
    zMax: ordered[1],
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

function orderBounds(a, b) {
  if (Number.isFinite(a) && Number.isFinite(b)) return [Math.min(a, b), Math.max(a, b)];
  return [a, b];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
