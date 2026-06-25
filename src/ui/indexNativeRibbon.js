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
    id: 'model-panel',
    label: '도구',
    actions: [
      { id: 'togglePalette', icon: '▦', label: '도구' },
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

export const PUSHOVER_DIRECTIONS = ['+x', '-x', '+y', '-y'];
export const PUSHOVER_PATTERNS = ['triangular', 'uniform', 'mass'];

export const MEMO_RIBBON_MODES = [
  { mode: 'draw', icon: '✎', label: '펜' },
  { mode: 'erase', icon: '⌫', label: '지우개' },
  { mode: 'image', icon: '▣', label: '이미지' },
  { mode: 'select', icon: '⬚', label: '선택' },
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
  syncPaletteToggleButtons(doc);
  syncMemoModeButtons(doc);
  doc.addEventListener?.('click', (event) => {
    if (event.target?.closest?.('#paletteToggle,[data-ss-palette-toggle]')) {
      queueMicrotask(() => syncPaletteToggleButtons(doc));
    }
    if (event.target?.closest?.('[data-mode]')) queueMicrotask(() => syncMemoModeButtons(doc));
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
    nonlinear: summarizeNativePushover(target),
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
  populateNonlinearRibbon(target);
  populateMemoRibbon(target);
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
    for (const action of group.actions || []) {
      if (action.id === 'togglePalette') items.appendChild(createPaletteToggleButton(target, action));
    }
    if (items.childNodes?.length || items.children?.length) panel.appendChild(ribbonGroup);
  }
  syncPaletteToggleButtons(doc);
}

function createPaletteToggleButton(target, action = {}) {
  const doc = target.document;
  const button = doc.createElement('button');
  const icon = action.icon || '▦';
  const label = action.label || '도구';
  button.type = 'button';
  button.className = 'ss-ribbon-command';
  button.setAttribute('data-ss-palette-toggle', '1');
  button.setAttribute('data-ss-ribbon-item', 'toggle-palette');
  button.setAttribute('data-agent-id', 'native-toggle-palette');
  button.setAttribute('aria-label', `${label} 패널`);
  button.innerHTML = `<span class="ss-ribbon-icon">${icon}</span><span>${label}</span>`;
  if (!doc.getElementById?.('palette')) button.disabled = true;
  button.addEventListener?.('click', () => {
    togglePalettePanel(doc);
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

function populateMemoRibbon(target) {
  const doc = target?.document;
  const panel = doc?.querySelector?.('[data-ss-ribbon-panel="memo"]');
  if (!panel || panel.querySelector?.('[data-ss-memo-ribbon="1"]')) return;

  const marker = doc.createElement('span');
  marker.setAttribute('data-ss-memo-ribbon', '1');
  marker.style.display = 'none';
  panel.appendChild(marker);

  const modeGroup = createRibbonGroup(doc, 'memo-mode', '도구');
  const modeItems = modeGroup.querySelector('[data-ss-ribbon-items]');
  for (const mode of MEMO_RIBBON_MODES) modeItems.appendChild(createModeProxyButton(target, mode));
  panel.appendChild(modeGroup);

  const penGroup = createRibbonGroup(doc, 'memo-pen', '펜 옵션');
  const penItems = penGroup.querySelector('[data-ss-ribbon-items]');
  moveExistingElements(doc, ['#penOpts'], penItems);
  panel.appendChild(penGroup);
}

function createModeProxyButton(target, mode) {
  const doc = target.document;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'ss-ribbon-command';
  button.setAttribute('data-ss-mode-proxy', mode.mode);
  button.setAttribute('data-ss-ribbon-item', `mode-${mode.mode}`);
  button.setAttribute('data-agent-id', `native-mode-command-${mode.mode}`);
  button.setAttribute('aria-label', mode.label);
  button.innerHTML = `<span class="ss-ribbon-icon">${mode.icon}</span><span>${mode.label}</span>`;
  if (!findLegacyMode(doc, mode.mode)) button.disabled = true;
  button.addEventListener?.('click', () => {
    const legacy = findLegacyMode(doc, mode.mode);
    if (!legacy) return;
    legacy.click?.();
    syncMemoModeButtons(doc);
  });
  return button;
}

function populateNonlinearRibbon(target) {
  const doc = target?.document;
  const panel = doc?.querySelector?.('[data-ss-ribbon-panel="nonlinear"]');
  if (!panel || panel.querySelector?.('[data-ss-nonlinear-ribbon="1"]')) return;

  const marker = doc.createElement('span');
  marker.setAttribute('data-ss-nonlinear-ribbon', '1');
  marker.style.display = 'none';
  panel.appendChild(marker);

  const setup = createRibbonGroup(doc, 'nonlinear-setup', '설정');
  const setupItems = setup.querySelector('[data-ss-ribbon-items]');
  setupItems.appendChild(createSelectControl(doc, {
    id: 'ssPushoverDirection',
    label: '방향',
    values: PUSHOVER_DIRECTIONS,
  }));
  setupItems.appendChild(createSelectControl(doc, {
    id: 'ssPushoverPattern',
    label: '패턴',
    values: PUSHOVER_PATTERNS,
  }));
  setupItems.appendChild(createNumberControl(doc, {
    id: 'ssPushoverSteps',
    label: '스텝',
    value: 8,
    min: 1,
    max: 80,
  }));
  panel.appendChild(setup);

  const runGroup = createRibbonGroup(doc, 'nonlinear-run', '실행');
  const runItems = runGroup.querySelector('[data-ss-ribbon-items]');
  const runButton = doc.createElement('button');
  runButton.type = 'button';
  runButton.className = 'ss-ribbon-command';
  runButton.id = 'ssRunPushover';
  runButton.setAttribute('data-ss-ribbon-item', 'run-pushover');
  runButton.setAttribute('data-agent-id', 'native-run-pushover');
  runButton.innerHTML = '<span class="ss-ribbon-icon">▶</span><span>Pushover</span>';
  runButton.addEventListener?.('click', () => runNativePushover(target));
  runItems.appendChild(runButton);

  const status = doc.createElement('span');
  status.id = 'ssPushoverStatus';
  status.className = 'ss-ribbon-status';
  status.textContent = '대기';
  status.setAttribute('data-ss-ribbon-item', 'pushover-status');
  status.setAttribute('data-agent-id', 'native-pushover-status');
  runItems.appendChild(status);
  panel.appendChild(runGroup);

  const curveGroup = createRibbonGroup(doc, 'nonlinear-curve', '곡선');
  const curveItems = curveGroup.querySelector('[data-ss-ribbon-items]');
  const curve = doc.createElement('div');
  curve.id = 'ssPushoverCurve';
  curve.className = 'ss-pushover-sparkline';
  curve.setAttribute('data-ss-ribbon-item', 'pushover-curve');
  curve.setAttribute('data-agent-id', 'native-pushover-curve');
  curveItems.appendChild(curve);
  panel.appendChild(curveGroup);
}

function createSelectControl(doc, options) {
  const wrap = doc.createElement('label');
  wrap.className = 'ss-ribbon-field';
  wrap.setAttribute('data-ss-ribbon-item', options.id);
  const title = doc.createElement('span');
  title.textContent = options.label;
  wrap.appendChild(title);
  const select = doc.createElement('select');
  select.id = options.id;
  for (const value of options.values) {
    const option = doc.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  wrap.appendChild(select);
  return wrap;
}

function createNumberControl(doc, options) {
  const wrap = doc.createElement('label');
  wrap.className = 'ss-ribbon-field';
  wrap.setAttribute('data-ss-ribbon-item', options.id);
  const title = doc.createElement('span');
  title.textContent = options.label;
  wrap.appendChild(title);
  const input = doc.createElement('input');
  input.id = options.id;
  input.type = 'number';
  input.value = String(options.value);
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = '1';
  wrap.appendChild(input);
  return wrap;
}

function runNativePushover(target) {
  const doc = target?.document;
  const status = doc?.getElementById?.('ssPushoverStatus');
  const curve = doc?.getElementById?.('ssPushoverCurve');
  const options = {
    direction: doc?.getElementById?.('ssPushoverDirection')?.value || '+x',
    pattern: doc?.getElementById?.('ssPushoverPattern')?.value || 'triangular',
    steps: Math.max(1, Math.trunc(Number(doc?.getElementById?.('ssPushoverSteps')?.value) || 8)),
  };

  try {
    const result = target?.SStructuresEngine?.runPushover?.(options)
      || target?.SStructuresAgent?.runPushover?.(options)
      || null;
    target.SStructuresNativePushoverView = buildNativePushoverView(result, options);
    if (status) status.textContent = target.SStructuresNativePushoverView.status;
    renderPushoverSparkline(curve, result);
    return target.SStructuresNativePushoverView;
  } catch (error) {
    target.SStructuresNativePushoverView = {
      available: false,
      status: error?.message || '실행 실패',
      options,
    };
    if (status) status.textContent = target.SStructuresNativePushoverView.status;
    if (curve) curve.innerHTML = '';
    return target.SStructuresNativePushoverView;
  }
}

function buildNativePushoverView(result, options) {
  if (!result) {
    return {
      available: false,
      status: '모델 없음',
      options,
    };
  }
  const stepCount = result.summary?.stepCount || result.curve?.length || 0;
  const baseShear = result.summary?.maxBaseShear || 0;
  const displacement = result.summary?.maxControlDisplacement || 0;
  return {
    available: true,
    ok: !!result.ok,
    status: `${result.ok ? 'OK' : 'WARN'} · ${stepCount} step · V=${formatNumber(baseShear)} · Δ=${formatNumber(displacement)}`,
    options,
    summary: {
      stepCount,
      maxBaseShear: baseShear,
      maxControlDisplacement: displacement,
      plasticMemberCount: result.summary?.plasticMemberCount || 0,
    },
    result,
  };
}

function renderPushoverSparkline(container, result) {
  if (!container) return;
  const curve = result?.curve || [];
  if (curve.length < 2) {
    container.innerHTML = '';
    return;
  }
  const width = 132;
  const height = 34;
  const maxX = Math.max(1e-9, ...curve.map((point) => Math.abs(Number(point.controlDisplacement) || 0)));
  const maxY = Math.max(1e-9, ...curve.map((point) => Math.abs(Number(point.baseShear) || 0)));
  const points = curve.map((point) => {
    const x = (Math.abs(Number(point.controlDisplacement) || 0) / maxX) * (width - 8) + 4;
    const y = height - 4 - (Math.abs(Number(point.baseShear) || 0) / maxY) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
}

function summarizeNativePushover(target) {
  const view = target?.SStructuresNativePushoverView;
  if (!view) return { available: false, status: 'Not run' };
  return {
    available: !!view.available,
    ok: !!view.ok,
    status: view.status || null,
    summary: view.summary || null,
    options: view.options || null,
  };
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  if (Math.abs(number) >= 100) return number.toFixed(0);
  if (Math.abs(number) >= 10) return number.toFixed(1);
  return number.toFixed(3);
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
  syncPaletteToggleButtons(doc);
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

function syncPaletteToggleButtons(doc) {
  if (!doc?.querySelectorAll) return;
  const palette = doc.getElementById?.('palette');
  const open = isPaletteOpen(doc);
  for (const button of doc.querySelectorAll('[data-ss-palette-toggle]')) {
    button.disabled = !palette;
    button.classList?.toggle('active', open);
    button.setAttribute?.('aria-pressed', open ? 'true' : 'false');
    button.setAttribute?.('title', open ? '도구 패널 닫기' : '도구 패널 열기');
  }
}

function isPaletteOpen(doc) {
  const palette = doc?.getElementById?.('palette');
  return !!palette?.classList?.contains?.('show') && !palette.classList.contains('collapsed');
}

function setPaletteOpen(doc, open) {
  const palette = doc?.getElementById?.('palette');
  if (!palette?.classList) return false;
  palette.classList.toggle('show', !!open);
  palette.classList.toggle('collapsed', !open);
  syncPaletteToggleButtons(doc);
  return true;
}

function togglePalettePanel(doc) {
  return setPaletteOpen(doc, !isPaletteOpen(doc));
}

function syncMemoModeButtons(doc) {
  if (!doc?.querySelectorAll) return;
  for (const proxy of doc.querySelectorAll('[data-ss-mode-proxy]')) {
    const mode = proxy.getAttribute('data-ss-mode-proxy');
    const legacy = findLegacyMode(doc, mode);
    proxy.disabled = !!legacy?.disabled || !legacy;
    proxy.classList?.toggle('active', !!legacy?.classList?.contains?.('active'));
  }
}

function findLegacyMode(doc, mode) {
  return doc?.querySelector?.(`[data-mode="${mode}"]`) || null;
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
.ss-native-ui #subbar{align-items:stretch;gap:0;padding:4px 8px;min-height:44px;overflow-x:visible;overflow-y:visible;flex-wrap:wrap;}
.ss-mode-tabs{display:flex;align-items:center;gap:4px;flex:none;min-width:max-content;}
.ss-mode-tab{height:32px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#d7e5f2;border-radius:6px;padding:0 12px;font-size:13px;font-weight:600;white-space:nowrap;}
.ss-mode-tab:hover{background:var(--dku2);}
.ss-mode-tab.active{background:var(--gold);border-color:var(--gold);color:#1d2b3a;}
.ss-mode-sep{flex:none;}
.ss-native-ribbon{display:flex;align-items:stretch;gap:6px;width:100%;min-width:0;flex-wrap:wrap;}
.ss-ribbon-panel{display:none;align-items:center;gap:6px;min-height:42px;min-width:0;flex:1 1 100%;flex-wrap:wrap;}
.ss-ribbon-panel.active{display:flex;}
.ss-ribbon-group{display:flex;align-items:center;gap:5px;padding:3px 6px;border-right:1px solid var(--line);min-height:36px;min-width:0;flex:0 1 auto;}
.ss-ribbon-title{font-size:11px;color:#5b7c9c;font-weight:700;white-space:nowrap;}
.ss-ribbon-items{display:flex;align-items:center;gap:3px;white-space:normal;flex-wrap:wrap;min-width:0;}
.ss-ribbon-command{height:28px;border:1px solid var(--line);background:#fff;border-radius:6px;padding:0 6px;color:#345;font-size:11.5px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;}
.ss-ribbon-command:hover{background:#e9f1f8;}
.ss-ribbon-command.active{background:var(--dku);border-color:var(--dku);color:#fff;}
.ss-ribbon-command:disabled{opacity:.45;cursor:not-allowed;}
.ss-ribbon-icon{font-size:13px;line-height:1;}
.ss-ribbon-items #comboSel{max-width:132px;}
.ss-ribbon-items #reactMode{max-width:132px;}
.ss-ribbon-items #statusTxt{margin-left:0;max-width:260px;overflow:hidden;text-overflow:ellipsis;}
.ss-ribbon-items #penOpts{display:flex;align-items:center;gap:5px;}
.ss-ribbon-field{height:28px;display:inline-flex;align-items:center;gap:4px;border:1px solid var(--line);border-radius:6px;background:#fff;padding:0 6px;font-size:11px;color:#5b7c9c;font-weight:700;white-space:nowrap;}
.ss-ribbon-field select,.ss-ribbon-field input{height:22px;border:1px solid var(--line);border-radius:5px;background:#fff;font-size:12px;color:#345;max-width:92px;padding:0 4px;}
.ss-ribbon-field input{width:54px;}
.ss-ribbon-status{font-size:11px;color:#5b7c9c;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ss-pushover-sparkline{width:118px;height:30px;color:var(--dku);display:flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:6px;background:#fff;}
@media (max-width:720px){
  .ss-mode-tab{height:36px;padding:0 10px;font-size:13px;}
  .ss-native-ribbon{gap:3px;}
  .ss-ribbon-group{padding:3px 5px;}
  .ss-ribbon-title{flex-basis:100%;}
}
`;
  (doc.head || doc.documentElement || doc.body)?.appendChild?.(style);
}
