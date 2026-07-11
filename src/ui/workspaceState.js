export const WORKSPACE_STATE_VERSION = 'p7-m3-workspace-state-v1';

export const WORKSPACE_PRESETS = Object.freeze({
  modeling: { visiblePanels: ['properties', 'library'], activeTool: 'select' },
  loads: { visiblePanels: ['properties', 'load-basis', 'load-audit'], activeTool: 'load' },
  analysis: { visiblePanels: ['analysis-center', 'results'], activeTool: 'results' },
});

export function createWorkspaceState(input = {}) {
  const preset = WORKSPACE_PRESETS[input.preset] ? input.preset : 'modeling';
  const defaults = WORKSPACE_PRESETS[preset];
  return {
    version: WORKSPACE_STATE_VERSION,
    preset,
    activeTool: input.activeTool || defaults.activeTool,
    visiblePanels: uniqueStrings(input.visiblePanels || defaults.visiblePanels),
    panels: normalizePanels(input.panels),
    activeCaseId: nullable(input.activeCaseId),
    activeResultId: nullable(input.activeResultId),
    modeOrStep: input.modeOrStep ?? null,
    selectedEntity: normalizeSelection(input.selectedEntity),
  };
}

export function switchWorkspacePreset(state, preset) {
  if (!WORKSPACE_PRESETS[preset]) return createWorkspaceState(state);
  return createWorkspaceState({
    ...state,
    preset,
    activeTool: WORKSPACE_PRESETS[preset].activeTool,
    visiblePanels: WORKSPACE_PRESETS[preset].visiblePanels,
  });
}

export function updateWorkspacePanel(state, panelId, patch = {}) {
  const next = createWorkspaceState(state);
  const current = next.panels[panelId] || { mode: 'floating', visible: true, rect: null, dock: null, order: 0 };
  next.panels[panelId] = normalizePanel({ ...current, ...patch });
  if (next.panels[panelId].visible && !next.visiblePanels.includes(panelId)) next.visiblePanels.push(panelId);
  if (!next.panels[panelId].visible) next.visiblePanels = next.visiblePanels.filter((id) => id !== panelId);
  return next;
}

export function resetWorkspaceState(preset = 'modeling') {
  return createWorkspaceState({ preset });
}

export function saveWorkspaceState(storage, key, state) {
  if (!storage?.setItem || !key) return false;
  storage.setItem(key, JSON.stringify(createWorkspaceState(state)));
  return true;
}

export function loadWorkspaceState(storage, key, fallbackPreset = 'modeling') {
  if (!storage?.getItem || !key) return resetWorkspaceState(fallbackPreset);
  try {
    const raw = storage.getItem(key);
    return raw ? createWorkspaceState(JSON.parse(raw)) : resetWorkspaceState(fallbackPreset);
  } catch (_error) {
    return resetWorkspaceState(fallbackPreset);
  }
}

function normalizePanels(panels) {
  return Object.fromEntries(Object.entries(panels && typeof panels === 'object' ? panels : {}).map(([id, value]) => [id, normalizePanel(value)]));
}

function normalizePanel(panel = {}) {
  const mode = ['floating', 'docked', 'minimized'].includes(panel.mode) ? panel.mode : 'floating';
  return {
    mode,
    visible: panel.visible !== false,
    rect: panel.rect ? finiteRect(panel.rect) : null,
    dock: ['left', 'right', 'top', 'bottom', 'fill'].includes(panel.dock) ? panel.dock : null,
    order: Number.isFinite(Number(panel.order)) ? Number(panel.order) : 0,
  };
}

function finiteRect(rect) {
  return Object.fromEntries(['left', 'top', 'width', 'height'].map((key) => [key, Number.isFinite(Number(rect[key])) ? Number(rect[key]) : 0]));
}

function normalizeSelection(selection) {
  return selection?.type && selection?.id ? { type: String(selection.type), id: String(selection.id) } : null;
}

function nullable(value) {
  return value == null || value === '' ? null : String(value);
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => String(item)).filter(Boolean))];
}
