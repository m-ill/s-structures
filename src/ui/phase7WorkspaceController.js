import {
  clampFloatingRect,
  dockFloatingRect,
  installFloatingPanel,
  snapFloatingRect,
  snapFloatingRectToPeers,
} from './floatingPanel.js';
import {
  createWorkspaceState,
  loadWorkspaceState,
  resetWorkspaceState,
  saveWorkspaceState,
  switchWorkspacePreset,
  updateWorkspacePanel,
} from './workspaceState.js';

export const PHASE7_WORKSPACE_CONTROLLER_VERSION = 'p7-m3-workspace-controller-v1';

export const PHASE7_DEFAULT_PANEL_DEFINITIONS = Object.freeze([
  panelDefinition('properties', 'propPanel', 'h3', { defaultWidth: 280, defaultHeight: 320, minWidth: 220, minHeight: 150, maxWidth: 480, maxHeight: 720 }),
  panelDefinition('analysis-center', 'ssAnalysisCenter', '.ss-ac-header', { defaultWidth: 380, defaultHeight: 520, minWidth: 300, minHeight: 240, maxWidth: 620, maxHeight: 720, allowPanelHandle: false }),
  panelDefinition('results', 'engineResultsDock', '.sse-head', { defaultWidth: 400, defaultHeight: 520, minWidth: 300, minHeight: 220, maxWidth: 720, maxHeight: 760 }),
  panelDefinition('pushover', 'enginePushoverPanel', '.sse-head', { defaultWidth: 400, defaultHeight: 520, minWidth: 300, minHeight: 220, maxWidth: 720, maxHeight: 760 }),
]);

const PRESET_LAYOUTS = Object.freeze({
  modeling: Object.freeze({ properties: Object.freeze({ mode: 'docked', dock: 'right', dockRatio: 0.28 }) }),
  loads: Object.freeze({ properties: Object.freeze({ mode: 'docked', dock: 'right', dockRatio: 0.3 }) }),
  analysis: Object.freeze({
    'analysis-center': Object.freeze({ mode: 'docked', dock: 'left', dockRatio: 0.44 }),
    results: Object.freeze({ mode: 'docked', dock: 'right', dockRatio: 0.44 }),
  }),
});

export function createPhase7WorkspaceController(target = globalThis, options = {}) {
  const doc = target?.document;
  if (!doc?.getElementById) return null;
  const storageKey = options.storageKey || 's-structures:phase7-workspace';
  const storage = workspaceStorage(target);
  const registry = new Map();
  let workspace = loadWorkspaceState(storage, storageKey, options.preset || 'modeling');
  let activePanelId = null;
  let applyingOwnerVisibility = false;

  const api = {
    version: PHASE7_WORKSPACE_CONTROLLER_VERSION,
    refresh() {
      for (const definition of options.panelDefinitions || PHASE7_DEFAULT_PANEL_DEFINITIONS) {
        const element = doc.getElementById?.(definition.elementId);
        if (element) api.registerPanel(definition.id, element, definition);
      }
      applyWorkspaceToPanels(false);
      installWorkspaceControls(target, api);
      api.recover();
      return api.getState();
    },
    registerPanel(panelId, elementOrId, panelOptions = {}) {
      const id = String(panelId || '').trim();
      const element = typeof elementOrId === 'string' ? doc.getElementById?.(elementOrId) : elementOrId;
      if (!id || !element?.style) return null;
      const existing = registry.get(id);
      const definition = { ...(existing?.definition || {}), ...panelOptions, id };
      const boundsElement = definition.boundsElement || doc.getElementById?.('main') || null;
      const floating = installFloatingPanel(target, element, {
        allowPanelHandle: definition.allowPanelHandle !== false,
        boundsElement,
        defaultHeight: definition.defaultHeight || 320,
        defaultWidth: definition.defaultWidth || 280,
        handleSelector: definition.handleSelector || '[data-ss-floating-handle]',
        maxHeight: definition.maxHeight,
        maxWidth: definition.maxWidth,
        minHeight: definition.minHeight || 150,
        minWidth: definition.minWidth || 220,
        position: definition.position || 'fixed',
        snapThreshold: definition.snapThreshold || 18,
        storageKey: definition.placementStorageKey || `s-structures:panel:${id}`,
        viewportPadding: definition.viewportPadding || 8,
      });
      element.setAttribute?.('data-ss-workspace-panel', id);
      if (element.getAttribute?.('data-ss-workspace-bound') !== '1') {
        element.setAttribute?.('data-ss-workspace-bound', '1');
        element.addEventListener?.('pointerdown', () => { activePanelId = id; });
      }
      registry.set(id, { id, element, floating, definition: { ...definition, boundsElement } });
      observePanelContent(target, element, floating, definition);
      applyPanelState(id, false);
      return floating;
    },
    unregisterPanel(panelId) {
      return registry.delete(panelId);
    },
    move(panelId, rect, moveOptions = {}) {
      const entry = registry.get(panelId);
      if (!entry) return null;
      const snapped = snapRect(panelId, rect, moveOptions);
      applyRect(entry.element, snapped);
      setElementVisible(entry.element, true);
      workspace = updateWorkspacePanel(workspace, panelId, { mode: 'floating', dock: null, visible: true, rect: snapped });
      persist();
      return snapped;
    },
    resize(panelId, rect, resizeOptions = {}) {
      return api.move(panelId, rect, resizeOptions);
    },
    snap(panelId, rect, snapOptions = {}) {
      return snapRect(panelId, rect, snapOptions);
    },
    dock(panelId, side = 'left', dockOptions = {}) {
      const entry = registry.get(panelId);
      if (!entry) return null;
      const bounds = panelBounds(entry);
      const rect = dockFloatingRect(bounds, side, {
        ...entry.definition,
        ...dockOptions,
        dockRatio: dockOptions.dockRatio || entry.definition.dockRatio,
      });
      applyRect(entry.element, rect);
      setElementVisible(entry.element, true);
      workspace = updateWorkspacePanel(workspace, panelId, { mode: 'docked', dock: side, visible: true, rect });
      persist();
      return rect;
    },
    undock(panelId) {
      const entry = registry.get(panelId);
      if (!entry) return null;
      const rect = clampFloatingRect(readRect(entry.element, entry.definition), panelBounds(entry), entry.definition);
      applyRect(entry.element, rect);
      workspace = updateWorkspacePanel(workspace, panelId, { mode: 'floating', dock: null, visible: true, rect });
      persist();
      return rect;
    },
    minimize(panelId) {
      workspace = updateWorkspacePanel(workspace, panelId, { mode: 'minimized', visible: true });
      const entry = registry.get(panelId);
      if (entry) setElementVisible(entry.element, false);
      persist();
      return api.getState();
    },
    restore(panelId) {
      const current = workspace.panels?.[panelId] || {};
      workspace = updateWorkspacePanel(workspace, panelId, { mode: current.dock ? 'docked' : 'floating', visible: true });
      applyPanelState(panelId, true);
      persist();
      return api.getState();
    },
    setVisible(panelId, visible, visibilityOptions = {}) {
      workspace = updateWorkspacePanel(workspace, panelId, { visible: !!visible, ...(visible ? {} : { mode: workspace.panels?.[panelId]?.mode || 'floating' }) });
      const entry = registry.get(panelId);
      if (entry) setElementVisible(entry.element, !!visible && workspace.panels[panelId].mode !== 'minimized');
      if (visibilityOptions.fromOwner !== true) syncOwnerVisibility(panelId, !!visible);
      persist();
      return api.getState();
    },
    recordVisibility(panelId, visible) {
      return api.setVisible(panelId, visible, { fromOwner: true });
    },
    applyPreset(preset) {
      workspace = switchWorkspacePreset(workspace, preset);
      const layout = PRESET_LAYOUTS[workspace.preset] || {};
      for (const [panelId, entry] of registry) {
        const visible = workspace.visiblePanels.includes(panelId);
        setElementVisible(entry.element, visible);
        if (visible && layout[panelId]?.mode === 'docked') api.dock(panelId, layout[panelId].dock, layout[panelId]);
        else workspace = updateWorkspacePanel(workspace, panelId, { visible });
        syncOwnerVisibility(panelId, visible);
      }
      persist();
      syncWorkspaceControls(doc, workspace);
      return api.getState();
    },
    reset(preset = workspace.preset || 'modeling') {
      for (const entry of registry.values()) entry.floating?.reset?.();
      workspace = resetWorkspaceState(preset);
      api.applyPreset(preset);
      api.recover();
      return api.getState();
    },
    recover() {
      for (const [panelId, entry] of registry) {
        const panel = workspace.panels?.[panelId];
        const visible = panel ? panel.visible !== false : workspace.visiblePanels.includes(panelId);
        if (panel?.mode === 'docked' && panel.dock) {
          const rect = dockFloatingRect(panelBounds(entry), panel.dock, entry.definition);
          applyRect(entry.element, rect);
          workspace = updateWorkspacePanel(workspace, panelId, { rect, visible });
        } else if (panel?.mode !== 'minimized') {
          const rect = entry.floating?.clamp?.() || clampFloatingRect(readRect(entry.element, entry.definition), panelBounds(entry), entry.definition);
          workspace = updateWorkspacePanel(workspace, panelId, { rect, visible });
        }
      }
      persist();
      return api.getState();
    },
    capture() {
      for (const [panelId, entry] of registry) {
        const rect = entry.floating?.getState?.().rect || readRect(entry.element, entry.definition);
        const prior = workspace.panels?.[panelId] || {};
        workspace = updateWorkspacePanel(workspace, panelId, {
          ...prior,
          rect,
          visible: elementVisible(entry.element) && prior.mode !== 'minimized',
        });
      }
      persist();
      return api.getState();
    },
    getWorkspaceState() {
      return clone(workspace);
    },
    getState() {
      const panels = Object.fromEntries([...registry].map(([id, entry]) => [id, {
        available: true,
        floating: entry.element.getAttribute?.('data-ss-floating-panel') === '1',
        visible: elementVisible(entry.element),
        mode: workspace.panels?.[id]?.mode || 'floating',
        dock: workspace.panels?.[id]?.dock || null,
        rect: clone(workspace.panels?.[id]?.rect || entry.floating?.getState?.().rect || null),
      }]));
      return {
        version: PHASE7_WORKSPACE_CONTROLLER_VERSION,
        preset: workspace.preset,
        workspace: clone(workspace),
        panels,
      };
    },
  };

  function applyWorkspaceToPanels(syncOwners) {
    for (const panelId of registry.keys()) applyPanelState(panelId, syncOwners);
    syncWorkspaceControls(doc, workspace);
  }

  function applyPanelState(panelId, syncOwner) {
    const entry = registry.get(panelId);
    if (!entry) return;
    const panel = workspace.panels?.[panelId];
    const visible = panel ? panel.visible !== false : workspace.visiblePanels.includes(panelId);
    if (panel?.mode === 'docked' && panel.dock) {
      const rect = dockFloatingRect(panelBounds(entry), panel.dock, entry.definition);
      applyRect(entry.element, rect);
      workspace = updateWorkspacePanel(workspace, panelId, { ...panel, rect, visible });
    } else if (panel?.rect) applyRect(entry.element, clampFloatingRect(panel.rect, panelBounds(entry), entry.definition));
    setElementVisible(entry.element, visible && panel?.mode !== 'minimized');
    if (syncOwner) syncOwnerVisibility(panelId, visible);
  }

  function snapRect(panelId, rect, snapOptions) {
    const entry = registry.get(panelId);
    if (!entry) return null;
    const bounds = panelBounds(entry);
    const definition = { ...entry.definition, ...snapOptions };
    const edgeSnapped = snapFloatingRect(rect, bounds, definition);
    const peers = [...registry]
      .filter(([id, peer]) => id !== panelId && elementVisible(peer.element))
      .map(([, peer]) => readRect(peer.element, peer.definition));
    return snapFloatingRectToPeers(edgeSnapped, peers, bounds, definition);
  }

  function syncOwnerVisibility(panelId, visible) {
    if (applyingOwnerVisibility) return;
    applyingOwnerVisibility = true;
    try {
      if (panelId === 'analysis-center') target.SStructuresAnalysisCenter?.[visible ? 'open' : 'close']?.();
      if (panelId === 'results') target.SStructuresResultsPanel?.setOpen?.(visible);
      if (panelId === 'pushover') target.SStructuresPushoverPanel?.setOpen?.(visible);
    } finally {
      applyingOwnerVisibility = false;
    }
  }

  function persist() {
    saveWorkspaceState(storage, storageKey, workspace);
  }

  bindWorkspaceEvents(target, doc, () => activePanelId, (value) => { activePanelId = value; }, api);
  return api;
}

function panelDefinition(id, elementId, handleSelector, options) {
  return Object.freeze({ id, elementId, handleSelector, position: 'fixed', snapThreshold: 18, viewportPadding: 8, ...options });
}

function workspaceStorage(target) {
  try {
    return target?.localStorage || null;
  } catch (_error) {
    return null;
  }
}

function bindWorkspaceEvents(target, doc, getActive, setActive, api) {
  if (target.__SStructuresPhase7WorkspaceEventsBound) return;
  target.__SStructuresPhase7WorkspaceEventsBound = true;
  doc.addEventListener?.('pointerup', () => {
    const panelId = getActive();
    if (panelId) {
      const state = api.getState().panels[panelId];
      if (state?.rect) api.move(panelId, state.rect);
    }
    setActive(null);
    api.capture();
  });
  target.addEventListener?.('resize', () => api.recover());
  target.addEventListener?.('beforeunload', () => api.capture());
}

function observePanelContent(target, element, floating, definition) {
  if (!target?.MutationObserver || element.getAttribute?.('data-ss-workspace-observed') === '1') return;
  element.setAttribute?.('data-ss-workspace-observed', '1');
  let queued = false;
  const observer = new target.MutationObserver(() => {
    if (queued) return;
    queued = true;
    const refresh = () => {
      queued = false;
      floating?.refresh?.({
        allowPanelHandle: definition.allowPanelHandle !== false,
        handleSelector: definition.handleSelector,
      });
    };
    if (typeof target.queueMicrotask === 'function') target.queueMicrotask(refresh);
    else setTimeout(refresh, 0);
  });
  observer.observe(element, { childList: true });
}

function installWorkspaceControls(target, api) {
  const doc = target.document;
  if (doc.getElementById?.('ssWorkspaceControls')) return;
  const host = doc.getElementById?.('menuDrop') || doc.getElementById?.('topbar') || doc.body;
  if (!host?.appendChild) return;
  const wrap = doc.createElement('div');
  wrap.id = 'ssWorkspaceControls';
  wrap.setAttribute?.('id', 'ssWorkspaceControls');
  wrap.className = 'ss-workspace-controls';
  const select = doc.createElement('select');
  select.id = 'ssWorkspacePreset';
  select.setAttribute?.('id', 'ssWorkspacePreset');
  select.setAttribute?.('aria-label', 'Workspace preset');
  for (const [value, label] of [['modeling', 'Modeling workspace'], ['loads', 'Loads workspace'], ['analysis', 'Analysis workspace']]) {
    const option = doc.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
  select.addEventListener?.('change', () => api.applyPreset(select.value));
  const reset = doc.createElement('button');
  reset.type = 'button';
  reset.id = 'ssWorkspaceReset';
  reset.setAttribute?.('id', 'ssWorkspaceReset');
  reset.setAttribute?.('title', 'Reset workspace');
  reset.textContent = 'Reset workspace';
  reset.addEventListener?.('click', () => api.reset(select.value));
  wrap.appendChild(select);
  wrap.appendChild(reset);
  host.appendChild(wrap);
  injectWorkspaceStyles(doc);
  syncWorkspaceControls(doc, api.getWorkspaceState());
}

function syncWorkspaceControls(doc, workspace) {
  const select = doc.getElementById?.('ssWorkspacePreset');
  if (select) select.value = workspace.preset;
}

function injectWorkspaceStyles(doc) {
  if (doc.getElementById?.('ssWorkspaceStyles')) return;
  const style = doc.createElement('style');
  style.id = 'ssWorkspaceStyles';
  style.setAttribute?.('id', 'ssWorkspaceStyles');
  style.textContent = '.ss-workspace-controls{display:grid;grid-template-columns:minmax(140px,1fr) auto;gap:6px;padding:6px}.ss-workspace-controls select,.ss-workspace-controls button{min-height:30px}';
  (doc.head || doc.documentElement || doc.body)?.appendChild?.(style);
}

function panelBounds(entry) {
  const padding = Number(entry.definition.viewportPadding || 8);
  const boundsElement = entry.definition.boundsElement;
  if (boundsElement?.getBoundingClientRect) {
    const rect = boundsElement.getBoundingClientRect();
    return { left: padding, top: padding, width: Math.max(0, Number(rect.width || 0) - padding * 2), height: Math.max(0, Number(rect.height || 0) - padding * 2) };
  }
  const target = entry.element.ownerDocument?.defaultView || globalThis;
  return {
    left: padding,
    top: padding,
    width: Math.max(0, Number(target.innerWidth || entry.element.ownerDocument?.documentElement?.clientWidth || 1024) - padding * 2),
    height: Math.max(0, Number(target.innerHeight || entry.element.ownerDocument?.documentElement?.clientHeight || 768) - padding * 2),
  };
}

function readRect(element, options = {}) {
  const rect = element.getBoundingClientRect?.() || {};
  return {
    left: readLength(element.style.left, Number(rect.left || 0)),
    top: readLength(element.style.top, Number(rect.top || 0)),
    width: readLength(element.style.width, Number(rect.width || options.defaultWidth || options.minWidth || 240)),
    height: readLength(element.style.height, Number(rect.height || options.defaultHeight || options.minHeight || 160)),
  };
}

function applyRect(element, rect) {
  if (!rect) return;
  element.style.position = 'fixed';
  element.style.left = `${Math.round(rect.left)}px`;
  element.style.top = `${Math.round(rect.top)}px`;
  element.style.right = 'auto';
  element.style.bottom = 'auto';
  element.style.width = `${Math.round(rect.width)}px`;
  element.style.height = `${Math.round(rect.height)}px`;
  element.style.maxWidth = 'none';
  element.style.maxHeight = 'none';
}

function setElementVisible(element, visible) {
  element.style.display = visible ? '' : 'none';
  element.setAttribute?.('aria-hidden', visible ? 'false' : 'true');
}

function elementVisible(element) {
  if (!element || element.style?.display === 'none') return false;
  if (element.classList?.contains?.('is-closed')) return false;
  return element.getAttribute?.('aria-hidden') !== 'true';
}

function readLength(value, fallback) {
  const parsed = Number.parseFloat(String(value || ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
