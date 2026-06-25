export const NATIVE_RIBBON_VERSION = 'm22-native-index-ribbon';
export const NATIVE_MODE_STORAGE_KEY = 's-structures:index-native-mode';

export const NATIVE_MAIN_MODES = [
  {
    id: 'modeling',
    label: '모델링',
    legacyMode: 'structure',
  },
  {
    id: 'elastic',
    label: '탄성해석',
    legacyMode: 'select',
  },
  {
    id: 'nonlinear',
    label: '비선형해석',
    legacyMode: 'select',
  },
  {
    id: 'memo',
    label: '태블릿메모',
    legacyMode: 'draw',
  },
];

export function installIndexNativeRibbon(target = globalThis, options = {}) {
  const doc = target?.document;
  if (!doc?.querySelector || !doc?.createElement) return null;
  if (target.SStructuresNativeUI) return target.SStructuresNativeUI;

  const topbar = doc.querySelector('#topbar');
  if (!topbar) return null;

  injectNativeRibbonStyle(doc);
  doc.body?.classList?.add('ss-native-ui');

  const initialMode = normalizeNativeMode(options.activeMode || readStoredMode(target) || 'modeling');
  const state = {
    activeMode: initialMode,
  };

  const tabs = ensureModeTabs(doc, topbar);
  const api = {
    version: NATIVE_RIBBON_VERSION,
    modes: NATIVE_MAIN_MODES.map((mode) => ({ ...mode })),
    state,
    setMode(modeId, setOptions = {}) {
      const nextMode = normalizeNativeMode(modeId);
      state.activeMode = nextMode;
      applyModeState(target, tabs, state, setOptions);
      return api.getState();
    },
    getState() {
      return getNativeUiState(target);
    },
    refresh() {
      applyModeState(target, tabs, state, { persist: false, clickLegacy: false });
      return api.getState();
    },
  };

  target.SStructuresNativeUI = api;
  api.setMode(initialMode, { persist: false, clickLegacy: false, emit: false });
  return api;
}

export function normalizeNativeMode(modeId) {
  const id = String(modeId || '').trim();
  return NATIVE_MAIN_MODES.some((mode) => mode.id === id) ? id : 'modeling';
}

export function getNativeUiState(target = globalThis) {
  const api = target?.SStructuresNativeUI;
  const activeMode = normalizeNativeMode(api?.state?.activeMode || target?.document?.body?.dataset?.ssActiveMode);
  return {
    version: api?.version || NATIVE_RIBBON_VERSION,
    activeMode,
    modes: NATIVE_MAIN_MODES.map((mode) => ({
      id: mode.id,
      label: mode.label,
      active: mode.id === activeMode,
    })),
  };
}

function ensureModeTabs(doc, topbar) {
  const existing = doc.getElementById?.('ssModeTabs');
  if (existing) return existing;

  const tabs = doc.createElement('div');
  tabs.id = 'ssModeTabs';
  tabs.className = 'ss-mode-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '작업 탭');
  tabs.setAttribute('data-agent-id', 'native-mode-tabs');

  for (const mode of NATIVE_MAIN_MODES) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'ss-mode-tab';
    button.textContent = mode.label;
    button.setAttribute('role', 'tab');
    button.setAttribute('data-ss-mode', mode.id);
    button.setAttribute('data-agent-id', `native-mode-${mode.id}`);
    button.setAttribute('aria-label', mode.label);
    button.addEventListener?.('click', () => {
      const api = doc.defaultView?.SStructuresNativeUI || globalThis.SStructuresNativeUI;
      api?.setMode?.(mode.id);
    });
    tabs.appendChild(button);
  }

  const separator = doc.createElement('div');
  separator.className = 'tb-sep ss-mode-sep';
  separator.setAttribute('aria-hidden', 'true');
  separator.setAttribute('data-ss-native', 'mode-separator');

  const spacer = topbar.querySelector?.('.spacer') || null;
  topbar.insertBefore(separator, spacer);
  topbar.insertBefore(tabs, spacer);
  return tabs;
}

function applyModeState(target, tabs, state, options = {}) {
  const doc = target?.document;
  const activeMode = normalizeNativeMode(state.activeMode);
  if (doc?.body?.dataset) doc.body.dataset.ssActiveMode = activeMode;

  for (const tab of tabs?.querySelectorAll?.('[data-ss-mode]') || []) {
    const isActive = tab.getAttribute('data-ss-mode') === activeMode;
    tab.classList?.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    tab.setAttribute('tabindex', isActive ? '0' : '-1');
  }

  if (options.persist !== false) writeStoredMode(target, activeMode);
  if (options.clickLegacy !== false) activateLegacyMode(target, activeMode);
  if (options.emit !== false) emitNativeModeChange(target);
}

function activateLegacyMode(target, activeMode) {
  const mode = NATIVE_MAIN_MODES.find((item) => item.id === activeMode);
  const legacyMode = mode?.legacyMode;
  if (!legacyMode) return;
  const button = target?.document?.querySelector?.(`[data-mode="${legacyMode}"]`);
  if (!button || button.classList?.contains?.('active')) return;
  button.click?.();
}

function emitNativeModeChange(target) {
  const EventCtor = target?.CustomEvent || globalThis.CustomEvent;
  if (typeof target?.dispatchEvent !== 'function' || typeof EventCtor !== 'function') return;
  target.dispatchEvent(new EventCtor('sstructures:native-mode-change', {
    detail: getNativeUiState(target),
  }));
}

function readStoredMode(target) {
  try {
    return target?.localStorage?.getItem?.(NATIVE_MODE_STORAGE_KEY) || null;
  } catch (_error) {
    return null;
  }
}

function writeStoredMode(target, modeId) {
  try {
    target?.localStorage?.setItem?.(NATIVE_MODE_STORAGE_KEY, modeId);
  } catch (_error) {
    // Storage can be unavailable in private or test contexts.
  }
}

function injectNativeRibbonStyle(doc) {
  if (doc.getElementById?.('ssNativeRibbonStyle')) return;
  const style = doc.createElement('style');
  style.id = 'ssNativeRibbonStyle';
  style.textContent = `
.ss-native-ui #topbar > .mode{display:none!important;}
.ss-mode-tabs{display:flex;align-items:center;gap:4px;flex:none;min-width:max-content;}
.ss-mode-tab{height:32px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#d7e5f2;border-radius:6px;padding:0 12px;font-size:13px;font-weight:600;white-space:nowrap;}
.ss-mode-tab:hover{background:var(--dku2);}
.ss-mode-tab.active{background:var(--gold);border-color:var(--gold);color:#1d2b3a;}
.ss-mode-sep{flex:none;}
@media (max-width:720px){
  .ss-mode-tab{height:36px;padding:0 10px;font-size:13px;}
}
`;
  (doc.head || doc.documentElement || doc.body)?.appendChild?.(style);
}
