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

export const NATIVE_RIBBON_PANELS = [
  { id: 'common', label: '공통', mode: 'common' },
  { id: 'modeling', label: '모델링', mode: 'modeling' },
  { id: 'elastic', label: '탄성해석', mode: 'elastic' },
  { id: 'nonlinear', label: '비선형해석', mode: 'nonlinear' },
  { id: 'memo', label: '태블릿메모', mode: 'memo' },
];

export const MODELING_RIBBON_GROUPS = [
  {
    id: 'model-select',
    label: '선택',
    tools: [
      { tool: 'smove', icon: '✥', label: '선택' },
      { tool: 'boxsel', icon: '▭', label: '다중' },
      { tool: 'sdelete', icon: '✕', label: '삭제' },
    ],
  },
  {
    id: 'model-geometry',
    label: '형상',
    tools: [
      { tool: 'member', icon: '╱', label: '부재' },
      { tool: 'column', icon: '┃', label: '기둥' },
      { tool: 'addnode', icon: '⊕', label: '절점' },
    ],
  },
  {
    id: 'model-supports',
    label: '지점',
    tools: [
      { tool: 'pin', icon: '▲', label: '핀' },
      { tool: 'roller', icon: '◬', label: '롤러' },
      { tool: 'fixed', icon: '▮', label: '고정' },
    ],
  },
  {
    id: 'model-loads',
    label: '하중',
    tools: [
      { tool: 'pload', icon: '↓', label: '집중' },
      { tool: 'udl', icon: '⇊', label: '분포' },
      { tool: 'mload', icon: '↻', label: '모멘트' },
    ],
  },
];

export const ELASTIC_RIBBON_GROUPS = [
  {
    id: 'elastic-combo',
    label: '조합',
    selectors: ['#comboSel'],
  },
  {
    id: 'elastic-results',
    label: '결과',
    selectors: ['[data-res]', '#reactMode'],
  },
  {
    id: 'elastic-reports',
    label: '보고',
    actions: [
      { id: 'mLoadCombos', icon: '☷', label: '하중조합' },
      { id: 'mDesignReport', icon: '▤', label: '설계요약' },
      { id: 'mValidate', icon: '✓', label: '검증' },
    ],
  },
  {
    id: 'elastic-status',
    label: '상태',
    selectors: ['#statusTxt'],
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
  const ribbonRoot = ensureRibbonRoot(target);
  const api = {
    version: NATIVE_RIBBON_VERSION,
    modes: NATIVE_MAIN_MODES.map((mode) => ({ ...mode })),
    ribbonPanels: NATIVE_RIBBON_PANELS.map((panel) => ({ ...panel })),
    ribbonRoot,
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
  syncModelingToolButtons(doc);
  doc.addEventListener?.('click', (event) => {
    if (event.target?.closest?.('[data-tool]')) queueMicrotask(() => syncModelingToolButtons(doc));
  });
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
  const panels = [...target?.document?.querySelectorAll?.('[data-ss-ribbon-panel]') || []].map((panel) => ({
    id: panel.getAttribute('data-ss-ribbon-panel'),
    active: panel.classList?.contains('active') || false,
    itemCount: countRibbonItems(panel),
  }));
  return {
    version: api?.version || NATIVE_RIBBON_VERSION,
    activeMode,
    modes: NATIVE_MAIN_MODES.map((mode) => ({
      id: mode.id,
      label: mode.label,
      active: mode.id === activeMode,
    })),
    ribbon: {
      available: !!api?.ribbonRoot,
      panels,
    },
  };
}

function countRibbonItems(panel) {
  if (!panel?.querySelectorAll) return 0;
  const items = new Set();
  for (const selector of ['[data-ss-ribbon-item]', 'button', 'select', 'input']) {
    for (const item of panel.querySelectorAll(selector)) items.add(item);
  }
  return items.size;
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

function ensureRibbonRoot(target) {
  const doc = target?.document;
  const subbar = doc.querySelector('#subbar');
  if (!subbar?.appendChild) return null;
  const existing = doc.getElementById?.('ssNativeRibbon');
  if (existing) return existing;

  const originalNodes = Array.from(subbar.childNodes || subbar.children || []);
  const root = doc.createElement('div');
  root.id = 'ssNativeRibbon';
  root.className = 'ss-native-ribbon';
  root.setAttribute('data-agent-id', 'native-ribbon');

  const commonPanel = createRibbonPanel(doc, NATIVE_RIBBON_PANELS[0]);
  const commonGroup = createRibbonGroup(doc, 'common-existing', '기본');
  const commonItems = commonGroup.querySelector('[data-ss-ribbon-items]');
  for (const node of originalNodes) {
    if (node === root) continue;
    commonItems.appendChild(node);
  }
  commonPanel.appendChild(commonGroup);
  root.appendChild(commonPanel);

  for (const panel of NATIVE_RIBBON_PANELS.slice(1)) {
    root.appendChild(createRibbonPanel(doc, panel));
  }

  subbar.appendChild(root);
  populateModelingRibbon(target);
  populateElasticRibbon(target);
  return root;
}

function populateModelingRibbon(target) {
  const doc = target?.document;
  const panel = doc?.querySelector?.('[data-ss-ribbon-panel="modeling"]');
  if (!panel || panel.querySelector?.('[data-ss-modeling-ribbon="1"]')) return;

  const marker = doc.createElement('span');
  marker.setAttribute('data-ss-modeling-ribbon', '1');
  marker.style.display = 'none';
  panel.appendChild(marker);

  for (const group of MODELING_RIBBON_GROUPS) {
    const ribbonGroup = createRibbonGroup(doc, group.id, group.label);
    const items = ribbonGroup.querySelector('[data-ss-ribbon-items]');
    for (const tool of group.tools) items.appendChild(createToolProxyButton(target, tool));
    panel.appendChild(ribbonGroup);
  }
}

function createToolProxyButton(target, tool) {
  const doc = target.document;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'ss-ribbon-command';
  button.setAttribute('data-ss-tool-proxy', tool.tool);
  button.setAttribute('data-ss-ribbon-item', `tool-${tool.tool}`);
  button.setAttribute('data-agent-id', `native-tool-${tool.tool}`);
  button.setAttribute('aria-label', tool.label);
  button.innerHTML = `<span class="ss-ribbon-icon">${tool.icon}</span><span>${tool.label}</span>`;
  if (!findLegacyTool(doc, tool.tool)) button.disabled = true;
  button.addEventListener?.('click', () => {
    const legacy = findLegacyTool(doc, tool.tool);
    if (!legacy) return;
    legacy.click?.();
    syncModelingToolButtons(doc);
  });
  return button;
}

function populateElasticRibbon(target) {
  const doc = target?.document;
  const panel = doc?.querySelector?.('[data-ss-ribbon-panel="elastic"]');
  if (!panel || panel.querySelector?.('[data-ss-elastic-ribbon="1"]')) return;

  const marker = doc.createElement('span');
  marker.setAttribute('data-ss-elastic-ribbon', '1');
  marker.style.display = 'none';
  panel.appendChild(marker);

  for (const group of ELASTIC_RIBBON_GROUPS) {
    const ribbonGroup = createRibbonGroup(doc, group.id, group.label);
    const items = ribbonGroup.querySelector('[data-ss-ribbon-items]');
    moveExistingElements(doc, group.selectors || [], items);
    for (const action of group.actions || []) items.appendChild(createActionProxyButton(target, action));
    if (items.childNodes?.length || items.children?.length) panel.appendChild(ribbonGroup);
  }
}

function moveExistingElements(doc, selectors, target) {
  if (!target) return;
  const moved = new Set();
  for (const selector of selectors) {
    for (const element of doc.querySelectorAll?.(selector) || []) {
      if (!element || element.id === 'ssNativeRibbon' || moved.has(element)) continue;
      element.setAttribute?.('data-ss-ribbon-item', element.id || element.getAttribute?.('data-res') || selector);
      target.appendChild(element);
      moved.add(element);
    }
  }
}

function createActionProxyButton(target, action) {
  const doc = target.document;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'ss-ribbon-command';
  button.setAttribute('data-ss-action-proxy', action.id);
  button.setAttribute('data-ss-ribbon-item', `action-${action.id}`);
  button.setAttribute('data-agent-id', `native-action-${action.id}`);
  button.setAttribute('aria-label', action.label);
  button.innerHTML = `<span class="ss-ribbon-icon">${action.icon}</span><span>${action.label}</span>`;
  if (!doc.getElementById?.(action.id)) button.disabled = true;
  button.addEventListener?.('click', () => {
    doc.getElementById?.(action.id)?.click?.();
  });
  return button;
}

function createRibbonPanel(doc, panel) {
  const element = doc.createElement('div');
  element.className = 'ss-ribbon-panel';
  element.setAttribute('data-ss-ribbon-panel', panel.id);
  element.setAttribute('data-ss-mode-owner', panel.mode);
  element.setAttribute('data-agent-id', `native-ribbon-${panel.id}`);
  return element;
}

function createRibbonGroup(doc, id, label) {
  const group = doc.createElement('div');
  group.className = 'ss-ribbon-group';
  group.setAttribute('data-ss-ribbon-group', id);
  group.setAttribute('data-agent-id', `native-ribbon-group-${id}`);

  const title = doc.createElement('span');
  title.className = 'ss-ribbon-title';
  title.textContent = label;
  group.appendChild(title);

  const items = doc.createElement('div');
  items.className = 'ss-ribbon-items';
  items.setAttribute('data-ss-ribbon-items', id);
  group.appendChild(items);

  return group;
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

  for (const panel of doc?.querySelectorAll?.('[data-ss-ribbon-panel]') || []) {
    const owner = panel.getAttribute('data-ss-mode-owner');
    panel.classList?.toggle('active', owner === 'common' || owner === activeMode);
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

function syncModelingToolButtons(doc) {
  if (!doc?.querySelectorAll) return;
  for (const proxy of doc.querySelectorAll('[data-ss-tool-proxy]')) {
    const tool = proxy.getAttribute('data-ss-tool-proxy');
    const legacy = findLegacyTool(doc, tool);
    proxy.disabled = !!legacy?.disabled || !legacy;
    proxy.classList?.toggle('active', !!legacy?.classList?.contains?.('active'));
  }
}

function findLegacyTool(doc, tool) {
  return doc?.querySelector?.(`[data-tool="${tool}"]`) || null;
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
.ss-native-ui #subbar{align-items:stretch;gap:0;padding:0 8px;min-height:44px;}
.ss-mode-tabs{display:flex;align-items:center;gap:4px;flex:none;min-width:max-content;}
.ss-mode-tab{height:32px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#d7e5f2;border-radius:6px;padding:0 12px;font-size:13px;font-weight:600;white-space:nowrap;}
.ss-mode-tab:hover{background:var(--dku2);}
.ss-mode-tab.active{background:var(--gold);border-color:var(--gold);color:#1d2b3a;}
.ss-mode-sep{flex:none;}
.ss-native-ribbon{display:flex;align-items:stretch;gap:8px;width:100%;min-width:max-content;}
.ss-ribbon-panel{display:none;align-items:center;gap:8px;min-height:42px;}
.ss-ribbon-panel.active{display:flex;}
.ss-ribbon-group{display:flex;align-items:center;gap:6px;padding:4px 8px;border-right:1px solid var(--line);min-height:42px;}
.ss-ribbon-title{font-size:11px;color:#5b7c9c;font-weight:700;white-space:nowrap;}
.ss-ribbon-items{display:flex;align-items:center;gap:4px;white-space:nowrap;}
.ss-ribbon-command{height:30px;border:1px solid var(--line);background:#fff;border-radius:6px;padding:0 8px;color:#345;font-size:12px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;}
.ss-ribbon-command:hover{background:#e9f1f8;}
.ss-ribbon-command.active{background:var(--dku);border-color:var(--dku);color:#fff;}
.ss-ribbon-command:disabled{opacity:.45;cursor:not-allowed;}
.ss-ribbon-icon{font-size:13px;line-height:1;}
.ss-ribbon-items #comboSel{max-width:150px;}
.ss-ribbon-items #reactMode{max-width:150px;}
.ss-ribbon-items #statusTxt{margin-left:0;max-width:260px;overflow:hidden;text-overflow:ellipsis;}
@media (max-width:720px){
  .ss-mode-tab{height:36px;padding:0 10px;font-size:13px;}
  .ss-native-ui #subbar{padding:4px 8px;}
  .ss-native-ribbon{gap:4px;}
  .ss-ribbon-group{padding:3px 6px;}
}
`;
  (doc.head || doc.documentElement || doc.body)?.appendChild?.(style);
}
