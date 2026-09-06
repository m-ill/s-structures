import { installFloatingPanel } from './floatingPanel.js';
import {
  buildElasticResultViewModel,
  ELASTIC_RESULT_KINDS,
  ELASTIC_RESULT_VISUALIZATION_VERSION,
  isElasticResultKind,
} from './elasticResultVisualization.js';

export const ELASTIC_RESULT_POPUP_VERSION = 'p7-m11-elastic-result-popup-v2';

const PANEL_STORAGE_KEY = 's-structures:elastic-result-popup:v2';
const MANUAL_SIZE_STORAGE_KEY = 's-structures:elastic-result-popup:user-sized';
const STATIC_RESULT_MODES = new Set(['def', 'defl', 'M', 'Q', 'N', 'T', 'react', 'chk']);

export function installElasticResultPopup(target = globalThis, options = {}) {
  const doc = target?.document;
  const bridge = options.bridge || target?.SStructuresEngine;
  if (!doc?.createElement || !bridge) return null;
  if (target.SStructuresElasticResultPopup) return target.SStructuresElasticResultPopup;

  injectStyles(doc);
  const host = doc.getElementById?.(options.hostId || 'canvasWrap') || doc.getElementById?.('main') || doc.body || doc.documentElement;
  const root = ensureRoot(doc, host);
  const selectionStore = options.resultSelectionStore
    || bridge.getResultSelectionStore?.()
    || target.SStructuresResultSelection;
  const initialSelection = selectionStore?.getState?.() || {};
  const state = {
    open: false,
    selectedCaseId: initialSelection.activeCaseId || null,
    selectedMemberId: initialSelection.selectedEntity?.type === 'member' ? initialSelection.selectedEntity.id : null,
    selectedComboId: null,
    direction: initialSelection.response || null,
    component: initialSelection.component || 'Mz',
    staticResponse: 'def',
    modeOrStep: Math.max(0, Math.trunc(Number(initialSelection.modeOrStep) || 0)),
    viewByKind: {},
    userSized: readUserSized(target),
    latestView: null,
  };

  const api = {
    version: ELASTIC_RESULT_POPUP_VERSION,
    visualizationVersion: ELASTIC_RESULT_VISUALIZATION_VERSION,
    root,
    state,
    open(input = {}) {
      if (typeof input === 'string') input = { caseId: input };
      if (input.caseId) selectCase(target, selectionStore, state, input.caseId);
      if (input.view) state.viewByKind[currentViewKey(target, bridge, state)] = input.view;
      state.open = true;
      renderPopup(target, bridge, selectionStore, state, root, api);
      target.SStructuresFloatingPanels?.recordVisibility?.('elastic-results', true);
      return api.getState();
    },
    close() {
      state.open = false;
      renderPopup(target, bridge, selectionStore, state, root, api);
      target.SStructuresFloatingPanels?.recordVisibility?.('elastic-results', false);
      return api.getState();
    },
    toggle() {
      return state.open ? api.close() : api.open();
    },
    refresh() {
      renderPopup(target, bridge, selectionStore, state, root, api);
      return api.getState();
    },
    openForCase(caseId, view = null) {
      return api.open({ caseId, view });
    },
    openPDelta() {
      const pDeltaCase = findPDeltaCase(target, bridge, state);
      if (pDeltaCase) selectCase(target, selectionStore, state, pDeltaCase.id);
      state.viewByKind.pdelta = state.selectedMemberId ? 'member' : 'global';
      state.open = true;
      renderPopup(target, bridge, selectionStore, state, root, api);
      return api.getState();
    },
    setView(view) {
      state.viewByKind[currentViewKey(target, bridge, state)] = String(view || '');
      renderPopup(target, bridge, selectionStore, state, root, api);
      return api.getState();
    },
    setModeOrStep(value) {
      state.modeOrStep = Math.max(0, Math.trunc(Number(value) || 0));
      selectionStore?.set?.({ modeOrStep: state.modeOrStep }, 'elastic-result-popup');
      renderPopup(target, bridge, selectionStore, state, root, api);
      return api.getState();
    },
    selectMember(memberId, input = {}) {
      state.selectedMemberId = String(memberId || '').trim() || null;
      if (input.syncSelection !== false) {
        selectionStore?.selectEntity?.('member', state.selectedMemberId, 'elastic-result-popup');
      }
      if (currentViewKey(target, bridge, state) === 'pdelta') state.viewByKind.pdelta = 'member';
      if (input.open !== false) state.open = true;
      renderPopup(target, bridge, selectionStore, state, root, api);
      return api.getState();
    },
    resetSize() {
      state.userSized = false;
      writeUserSized(target, false);
      root.__SStructuresFloatingPanel?.reset?.();
      applyAdaptiveSize(root, state, state.latestView);
      return api.getState();
    },
    getState() {
      const context = currentContext(target, bridge, state);
      return {
        version: ELASTIC_RESULT_POPUP_VERSION,
        visualizationVersion: ELASTIC_RESULT_VISUALIZATION_VERSION,
        open: state.open,
        selectedCaseId: context.analysisCase?.id || null,
        selectedResultId: context.result?.runRecordId || null,
        selectedMemberId: state.selectedMemberId,
        selectedComboId: state.selectedComboId,
        direction: state.direction,
        component: state.component,
        staticResponse: state.staticResponse,
        modeOrStep: state.modeOrStep,
        activeView: state.latestView?.activeTab || null,
        resultKind: state.latestView?.kind || null,
        visualizationKind: resultViewKey(context.analysisCase, context.result),
        method: state.latestView?.method || null,
        resultAvailable: state.latestView?.resultAvailable === true,
        sizeProfile: state.latestView?.sizeProfile || 'compact',
        userSized: state.userSized,
      };
    },
  };

  target.SStructuresElasticResultPopup = api;
  api.unsubscribeResultSelection = selectionStore?.subscribe?.((next, _previous, source) => {
    if (source === 'elastic-result-popup') return;
    if (next.activeCaseId) state.selectedCaseId = next.activeCaseId;
    if (next.modeOrStep != null) state.modeOrStep = Math.max(0, Math.trunc(Number(next.modeOrStep) || 0));
    if (next.response) state.direction = next.response;
    if (next.component) state.component = next.component;
    if (next.selectedEntity?.type === 'member') {
      state.selectedMemberId = next.selectedEntity.id;
      if (currentViewKey(target, bridge, state) === 'pdelta') {
        state.viewByKind.pdelta = 'member';
        if (['native-modeler', 'native-member-selection'].includes(source)) state.open = true;
      }
    }
    if (['analysis-run', 'analysis-run-failed'].includes(source)) {
      const selectedCase = bridge.getAnalysisCases?.().find((item) => item.id === next.activeCaseId);
      if (isElasticResultKind(selectedCase?.kind)) state.open = true;
    }
    renderPopup(target, bridge, selectionStore, state, root, api);
  }) || (() => {});

  renderPopup(target, bridge, selectionStore, state, root, api);
  return api;
}

export function buildElasticResultPopupState(target = globalThis) {
  return target?.SStructuresElasticResultPopup?.getState?.() || {
    version: ELASTIC_RESULT_POPUP_VERSION,
    open: false,
    resultAvailable: false,
  };
}

function renderPopup(target, bridge, selectionStore, state, root, api) {
  const doc = root.ownerDocument;
  const context = currentContext(target, bridge, state);
  if (context.analysisCase) state.selectedCaseId = context.analysisCase.id;
  const viewKey = resultViewKey(context.analysisCase, context.result);
  const selection = selectionStore?.getState?.() || {};
  const view = buildElasticResultViewModel(context.model, context.analysisCase, context.result, {
    view: state.viewByKind[viewKey],
    selectedMemberId: state.selectedMemberId || (selection.selectedEntity?.type === 'member' ? selection.selectedEntity.id : null),
    selectedComboId: state.selectedComboId,
    direction: state.direction || selection.response,
    component: state.component || selection.component,
    staticResponse: state.staticResponse,
    modeOrStep: state.modeOrStep,
  });
  state.latestView = view;
  clearChildren(root);
  root.classList?.toggle?.('is-open', state.open);
  root.classList?.toggle?.('is-closed', !state.open);
  root.setAttribute?.('aria-hidden', state.open ? 'false' : 'true');
  root.setAttribute?.('data-result-kind', viewKey);
  root.setAttribute?.('data-size-profile', view.sizeProfile || 'compact');
  root.style.display = state.open ? 'flex' : 'none';

  root.appendChild(renderHeader(doc, target, bridge, state, context, view, api));
  if (view.tabs.length) root.appendChild(renderTabs(doc, view, api));
  const body = doc.createElement('div');
  body.className = 'ss-elastic-result-body';
  body.setAttribute('data-agent-id', 'elastic-result-popup-body');
  if (view.metrics.length) body.appendChild(renderMetrics(doc, view.metrics));
  if (view.controls.length) body.appendChild(renderControls(doc, target, state, view.controls, api));
  if (context.latestAttempt?.status === 'failed' && context.latestAttempt !== context.result) {
    body.appendChild(renderNote(doc, '최근 실행은 실패했습니다. 마지막 성공 결과를 표시하고 있습니다.', 'ng'));
  }
  if (view.structuralPreview?.svg) body.appendChild(renderStructuralPreview(doc, view.structuralPreview));
  for (const item of view.charts) body.appendChild(renderChart(doc, item));
  for (const item of view.tables) body.appendChild(renderTable(doc, item, view.charts.length === 0));
  for (const note of view.notes) body.appendChild(renderNote(doc, note, view.method === 'legacy' ? 'warn' : ''));
  if (!view.resultAvailable && view.notes.length === 0) body.appendChild(renderNote(doc, '표시할 실행 결과가 없습니다.'));
  root.appendChild(body);

  installFloatingPanel(target, root, {
    allowPanelHandle: false,
    boundsElement: root.parentNode?.id === 'canvasWrap' ? root.parentNode : null,
    defaultHeight: 420,
    defaultWidth: 460,
    handleSelector: '.ss-elastic-result-header',
    maxHeight: 900,
    maxWidth: 760,
    minHeight: 220,
    minWidth: 320,
    position: root.parentNode?.id === 'canvasWrap' ? 'absolute' : 'fixed',
    snapThreshold: 18,
    storageKey: PANEL_STORAGE_KEY,
    suspendClamp: (runtime) => Number(runtime?.innerWidth) <= 720,
    viewportPadding: 12,
  });
  bindResizePreference(target, root, state, api);
  applyAdaptiveSize(root, state, view);
  target.SStructuresElasticAnalysisRibbon?.refresh?.();
}

function renderHeader(doc, target, bridge, state, context, view, api) {
  const header = doc.createElement('header');
  header.className = 'ss-elastic-result-header';
  header.setAttribute('data-ss-floating-handle', '1');
  const titleWrap = doc.createElement('div');
  titleWrap.className = 'ss-elastic-result-title';
  const title = doc.createElement('h2');
  title.textContent = view.title || '탄성해석 결과';
  titleWrap.appendChild(title);
  const meta = doc.createElement('div');
  meta.className = 'ss-elastic-result-meta';
  const method = doc.createElement('span');
  method.textContent = methodLabel(view.method);
  meta.appendChild(method);
  const status = doc.createElement('b');
  status.className = `status-${statusTone(view.status)}`;
  status.textContent = statusLabel(view.status);
  meta.appendChild(status);
  titleWrap.appendChild(meta);
  header.appendChild(titleWrap);

  const actions = doc.createElement('div');
  actions.className = 'ss-elastic-result-head-actions';
  const cases = elasticCases(bridge);
  if (cases.length > 1) {
    const select = doc.createElement('select');
    select.id = 'ssElasticResultCaseSelect';
    select.setAttribute('id', select.id);
    select.setAttribute('aria-label', '표시할 탄성해석 케이스');
    for (const item of cases) {
      const option = doc.createElement('option');
      option.value = item.id;
      option.textContent = item.name || item.id;
      select.appendChild(option);
    }
    select.value = context.analysisCase?.id || '';
    select.addEventListener?.('change', () => {
      selectCase(target, target.SStructuresResultSelection, state, select.value);
      api.refresh();
    });
    actions.appendChild(select);
  }
  const settings = iconButton(doc, 'ssElasticResultSettings', '⚙', '선택한 해석 케이스 설정 열기');
  settings.addEventListener?.('click', () => {
    if (context.analysisCase?.id) target.SStructuresAnalysisCenter?.select?.(context.analysisCase.id);
    target.SStructuresAnalysisCenter?.open?.();
  });
  actions.appendChild(settings);
  const close = iconButton(doc, 'ssElasticResultClose', '×', '결과 창 닫기');
  close.addEventListener?.('click', () => api.close());
  actions.appendChild(close);
  header.appendChild(actions);
  return header;
}

function renderTabs(doc, view, api) {
  const tabs = doc.createElement('nav');
  tabs.className = 'ss-elastic-result-tabs';
  tabs.setAttribute('role', 'tablist');
  for (const item of view.tabs) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.className = item.active ? 'active' : '';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', item.active ? 'true' : 'false');
    button.setAttribute('data-result-view', item.id);
    button.setAttribute('data-agent-id', `elastic-result-view-${item.id}`);
    button.addEventListener?.('click', () => api.setView(item.id));
    tabs.appendChild(button);
  }
  return tabs;
}

function renderMetrics(doc, metrics) {
  const wrap = doc.createElement('div');
  wrap.className = 'ss-elastic-result-metrics';
  for (const item of metrics) {
    const metric = doc.createElement('div');
    if (item.tone) metric.className = `tone-${item.tone}`;
    const label = doc.createElement('span');
    label.textContent = item.label;
    const value = doc.createElement('strong');
    value.textContent = item.value;
    metric.appendChild(label);
    metric.appendChild(value);
    wrap.appendChild(metric);
  }
  return wrap;
}

function renderControls(doc, target, state, controls, api) {
  const wrap = doc.createElement('div');
  wrap.className = 'ss-elastic-result-controls';
  for (const control of controls) {
    const group = doc.createElement('label');
    group.className = `ss-elastic-result-control control-${control.type}`;
    const label = doc.createElement('span');
    label.textContent = control.label;
    group.appendChild(label);
    if (control.type === 'segmented') {
      const items = doc.createElement('div');
      items.className = 'ss-elastic-result-segments';
      for (const option of control.options) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.textContent = option.label;
        button.className = String(option.value) === String(control.value) ? 'active' : '';
        button.setAttribute('aria-pressed', String(option.value) === String(control.value) ? 'true' : 'false');
        button.setAttribute('data-control-id', control.id);
        button.setAttribute('data-control-value', option.value);
        button.addEventListener?.('click', () => applyControl(target, state, api, control.id, option.value));
        items.appendChild(button);
      }
      group.appendChild(items);
    } else if (control.type === 'range') {
      const row = doc.createElement('div');
      row.className = 'ss-elastic-result-range';
      const input = doc.createElement('input');
      input.type = 'range';
      input.min = String(control.min);
      input.max = String(control.max);
      input.step = String(control.step || 1);
      input.value = String(control.value);
      input.setAttribute('data-control-id', control.id);
      input.setAttribute('aria-label', control.label);
      const output = doc.createElement('output');
      output.textContent = control.valueLabel || String(control.value);
      input.addEventListener?.('input', () => api.setModeOrStep(input.value));
      row.appendChild(input);
      row.appendChild(output);
      group.appendChild(row);
    } else {
      const select = doc.createElement('select');
      select.setAttribute('data-control-id', control.id);
      select.setAttribute('aria-label', control.label);
      for (const option of control.options) {
        const item = doc.createElement('option');
        item.value = option.value;
        item.textContent = option.label;
        select.appendChild(item);
      }
      select.value = control.value;
      select.addEventListener?.('change', () => applyControl(target, state, api, control.id, select.value));
      group.appendChild(select);
    }
    wrap.appendChild(group);
  }
  return wrap;
}

function renderStructuralPreview(doc, preview) {
  const section = doc.createElement('section');
  section.className = 'ss-elastic-result-figure ss-elastic-result-structure';
  section.id = `${preview.id}Wrap`;
  section.setAttribute('id', section.id);
  const heading = doc.createElement('h3');
  heading.textContent = preview.title;
  section.appendChild(heading);
  const figure = doc.createElement('div');
  figure.className = 'ss-elastic-result-svg';
  figure.setAttribute('data-chart-kind', 'structural-shape');
  figure.innerHTML = preview.svg;
  section.appendChild(figure);
  return section;
}

function renderChart(doc, item) {
  const section = doc.createElement('section');
  section.id = item.id;
  section.setAttribute('id', item.id);
  section.className = 'ss-elastic-result-figure';
  section.setAttribute('data-chart-version', item.chart?.version || '');
  section.setAttribute('data-agent-id', item.id);
  const heading = doc.createElement('h3');
  heading.textContent = item.title;
  section.appendChild(heading);
  const figure = doc.createElement('div');
  figure.className = 'ss-elastic-result-svg';
  figure.innerHTML = item.svg;
  section.appendChild(figure);
  if (item.caption) {
    const caption = doc.createElement('p');
    caption.textContent = item.caption;
    section.appendChild(caption);
  }
  return section;
}

function renderTable(doc, item, expanded) {
  const details = doc.createElement('details');
  details.id = item.id;
  details.setAttribute('id', item.id);
  details.className = 'ss-elastic-result-table-wrap';
  details.open = expanded;
  const summary = doc.createElement('summary');
  summary.textContent = `${item.title} (${item.rows.length})`;
  details.appendChild(summary);
  const scroll = doc.createElement('div');
  scroll.className = 'ss-elastic-result-table-scroll';
  const table = doc.createElement('table');
  const thead = doc.createElement('thead');
  const headerRow = doc.createElement('tr');
  for (const column of item.columns) {
    const th = doc.createElement('th');
    th.textContent = column;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = doc.createElement('tbody');
  for (const row of item.rows.slice(0, 120)) {
    const tr = doc.createElement('tr');
    for (const value of row) {
      const td = doc.createElement('td');
      td.textContent = String(value ?? '-');
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  scroll.appendChild(table);
  details.appendChild(scroll);
  return details;
}

function renderNote(doc, text, tone = '') {
  const note = doc.createElement('p');
  note.className = `ss-elastic-result-note${tone ? ` tone-${tone}` : ''}`;
  note.textContent = String(text || '');
  return note;
}

function applyControl(target, state, api, id, value) {
  if (id === 'combo') state.selectedComboId = value;
  else if (id === 'member') return api.selectMember(value, { open: false });
  else if (id === 'direction') {
    state.direction = value;
    target.SStructuresResultSelection?.set?.({ response: value }, 'elastic-result-popup');
  } else if (id === 'component') {
    state.component = value;
    target.SStructuresResultSelection?.set?.({ component: value }, 'elastic-result-popup');
    activateNativeResultMode(target, nativeResultMode(value));
  } else if (id === 'static-response') {
    state.staticResponse = value;
    activateNativeResultMode(target, value);
  }
  api.refresh();
  return api.getState();
}

function nativeResultMode(component) {
  if (component === 'N') return 'N';
  if (component === 'Vy' || component === 'Vz') return 'Q';
  if (component === 'Tq') return 'T';
  return 'M';
}

function activateNativeResultMode(target, mode) {
  if (!STATIC_RESULT_MODES.has(mode)) return false;
  const buttons = [...target?.document?.querySelectorAll?.('[data-res]') || []]
    .filter((button) => STATIC_RESULT_MODES.has(button.getAttribute?.('data-res')));
  const desired = buttons.find((button) => button.getAttribute?.('data-res') === mode);
  for (const button of buttons) {
    if (button !== desired && button.classList?.contains?.('on')) button.click?.();
  }
  if (desired && !desired.classList?.contains?.('on')) desired.click?.();
  target.draw?.();
  return !!desired;
}

function currentContext(target, bridge, state) {
  const model = bridge.getCurrentModel?.() || (typeof target.model === 'function' ? target.model() : {}) || {};
  const cases = elasticCases(bridge);
  const activeId = target.SStructuresResultSelection?.getState?.().activeCaseId || state.selectedCaseId;
  let analysisCase = cases.find((item) => item.id === activeId)
    || cases.find((item) => item.id === state.selectedCaseId)
    || cases.find((item) => target.__SStructuresAnalysisResults?.[item.id])
    || cases[0]
    || null;
  if (analysisCase && !isElasticResultKind(analysisCase.kind)) analysisCase = null;
  const result = analysisCase ? target.__SStructuresAnalysisResults?.[analysisCase.id] || null : null;
  const latestAttempt = analysisCase ? target.__SStructuresAnalysisLatestAttempts?.[analysisCase.id] || result : null;
  return { model, analysisCase, result, latestAttempt };
}

function currentViewKey(target, bridge, state) {
  const context = currentContext(target, bridge, state);
  return resultViewKey(context.analysisCase, context.result);
}

function resultViewKey(analysisCase, result) {
  const kind = result?.kind || analysisCase?.kind;
  if (kind === 'static' && result?.payload?.pDelta?.enabled) return 'pdelta';
  if (kind === 'responseSpectrum') return 'rsa';
  if (kind === 'linearTha') return 'tha';
  return kind || 'none';
}

function findPDeltaCase(target, bridge, state) {
  const cases = elasticCases(bridge).filter((item) => item.kind === 'static');
  return cases.find((item) => target.__SStructuresAnalysisResults?.[item.id]?.payload?.pDelta?.enabled)
    || cases.find((item) => ['direct', 'legacy'].includes(item.settings?.pDeltaMethod))
    || cases.find((item) => item.id === state.selectedCaseId)
    || null;
}

function elasticCases(bridge) {
  return (bridge.getAnalysisCases?.() || []).filter((item) => ELASTIC_RESULT_KINDS.includes(item.kind));
}

function selectCase(target, selectionStore, state, caseId) {
  state.selectedCaseId = String(caseId || '') || null;
  state.modeOrStep = 0;
  const result = target.__SStructuresAnalysisResults?.[state.selectedCaseId] || null;
  selectionStore?.set?.({
    activeCaseId: state.selectedCaseId,
    activeResultId: result?.runRecordId || null,
    modeOrStep: 0,
  }, 'elastic-result-popup');
  if (target.SStructuresAnalysisCenter?.state) {
    target.SStructuresAnalysisCenter.state.selectedCaseId = state.selectedCaseId;
    target.SStructuresAnalysisCenter.state.resultViewIndex = 0;
  }
}

function ensureRoot(doc, host) {
  let root = doc.getElementById?.('ssElasticResultPopup');
  if (root) return root;
  root = doc.createElement('section');
  root.id = 'ssElasticResultPopup';
  root.setAttribute('id', root.id);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '탄성해석 결과 시각화');
  root.setAttribute('data-agent-id', 'elastic-result-popup');
  root.className = 'ss-elastic-result-popup is-closed';
  host.appendChild(root);
  return root;
}

function iconButton(doc, id, symbol, label) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.id = id;
  button.setAttribute('id', id);
  button.className = 'ss-elastic-result-icon-button';
  button.textContent = symbol;
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  return button;
}

function bindResizePreference(target, root, state, api) {
  const handle = root.querySelector?.('[data-ss-floating-resize]');
  if (!handle || handle.getAttribute?.('data-ss-elastic-size-bound') === '1') return;
  handle.setAttribute?.('data-ss-elastic-size-bound', '1');
  handle.addEventListener?.('pointerdown', () => {
    state.userSized = true;
    writeUserSized(target, true);
  });
  handle.addEventListener?.('dblclick', () => api.resetSize());
}

function applyAdaptiveSize(root, state, view) {
  root.setAttribute?.('data-user-sized', state.userSized ? '1' : '0');
  if (state.userSized) return;
  const widths = { compact: 360, standard: 440, wide: 520 };
  root.style.width = `${widths[view?.sizeProfile] || widths.standard}px`;
  root.style.height = 'auto';
  root.style.maxWidth = 'calc(100% - 24px)';
  root.style.maxHeight = 'calc(100% - 24px)';
}

function readUserSized(target) {
  try {
    return target?.localStorage?.getItem?.(MANUAL_SIZE_STORAGE_KEY) === '1';
  } catch (_error) {
    return false;
  }
}

function writeUserSized(target, value) {
  try {
    if (value) target?.localStorage?.setItem?.(MANUAL_SIZE_STORAGE_KEY, '1');
    else target?.localStorage?.removeItem?.(MANUAL_SIZE_STORAGE_KEY);
  } catch (_error) {
    // Storage can be unavailable in private browsing.
  }
}

function methodLabel(method) {
  if (!method) return '결과 대기';
  if (method === 'direct') return 'Direct P-Delta';
  if (method === 'legacy') return 'Legacy P-Delta';
  if (method === 'first-order-linear-static') return '1차 정적';
  if (method === 'modal_lumped_mass' || method === 'modal-lumped-mass') return '모달';
  return String(method);
}

function statusLabel(status) {
  return {
    ok: '완료',
    preliminary: '예비',
    failed: '실패',
    stale: '재실행 필요',
    'review-required': '검토 필요',
    designBlocked: '설계전달 차단',
    'not-run': '미실행',
  }[status] || status || '미실행';
}

function statusTone(status) {
  if (status === 'ok') return 'ok';
  if (['failed', 'designBlocked'].includes(status)) return 'ng';
  if (['preliminary', 'stale', 'review-required'].includes(status)) return 'warn';
  return 'idle';
}

function clearChildren(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
  while (element.childNodes?.length) element.removeChild(element.childNodes[0]);
}

function injectStyles(doc) {
  if (doc.getElementById?.('ssElasticResultPopupStyles')) return;
  const style = doc.createElement('style');
  style.id = 'ssElasticResultPopupStyles';
  style.setAttribute('id', style.id);
  style.textContent = `
    .ss-elastic-result-popup{position:absolute;right:12px;top:12px;z-index:36;display:none;flex-direction:column;min-width:320px;min-height:220px;max-width:calc(100% - 24px);max-height:calc(100% - 24px);overflow:hidden;background:rgba(255,255,255,.985);border:1px solid #cddbe6;border-radius:8px;box-shadow:0 12px 32px rgba(20,43,66,.19);color:#203448;font:12px/1.4 "Segoe UI",Arial,sans-serif}
    .ss-elastic-result-popup.is-open{display:flex}.ss-elastic-result-popup.is-closed{display:none}
    .ss-elastic-result-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:10px 10px 9px 12px;border-bottom:1px solid #dce6ee;background:#f8fbfd;flex:none}
    .ss-elastic-result-title{min-width:0}.ss-elastic-result-title h2{margin:0;color:#00467f;font-size:14px;line-height:1.25;letter-spacing:0;overflow-wrap:anywhere}.ss-elastic-result-meta{display:flex;align-items:center;gap:6px;margin-top:3px;color:#687b8e;font-size:10.5px}.ss-elastic-result-meta b{padding:1px 6px;border:1px solid #cfdbe5;border-radius:3px;background:#eef3f7;font-weight:600}.ss-elastic-result-meta b.status-ok{border-color:#9bc6ab;background:#edf8f1;color:#17633b}.ss-elastic-result-meta b.status-warn{border-color:#e2c47c;background:#fff9e7;color:#7a5600}.ss-elastic-result-meta b.status-ng{border-color:#e0a1a1;background:#fff2f2;color:#9b2626}
    .ss-elastic-result-head-actions{display:flex;align-items:center;gap:4px}.ss-elastic-result-head-actions select{width:min(150px,24vw);height:28px;border:1px solid #cfdbe5;border-radius:5px;background:white;color:#28465f;font-size:11px}.ss-elastic-result-icon-button{width:28px;height:28px;display:inline-grid;place-items:center;border:1px solid #cfdbe5;border-radius:5px;background:#fff;color:#36566f;font-size:16px;line-height:1;cursor:pointer}.ss-elastic-result-icon-button:hover{background:#eaf2f8}
    .ss-elastic-result-tabs{display:flex;gap:3px;padding:7px 8px;border-bottom:1px solid #e0e8ef;overflow-x:auto;flex:none;background:white}.ss-elastic-result-tabs button{height:27px;min-width:58px;padding:0 9px;border:1px solid #d2dde7;border-radius:5px;background:#f7fafc;color:#36536b;font-size:11px;white-space:nowrap;cursor:pointer}.ss-elastic-result-tabs button.active{border-color:#005a8d;background:#005a8d;color:white}
    .ss-elastic-result-body{min-height:0;padding:9px 10px 16px;overflow:auto;overscroll-behavior:contain}.ss-elastic-result-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #dde7ef;border-radius:6px;overflow:hidden;margin-bottom:8px}.ss-elastic-result-metrics>div{min-width:0;padding:6px 7px;border-right:1px solid #e4ebf1;background:#fbfdff}.ss-elastic-result-metrics>div:last-child{border-right:0}.ss-elastic-result-metrics span,.ss-elastic-result-metrics strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ss-elastic-result-metrics span{color:#728395;font-size:9.5px}.ss-elastic-result-metrics strong{margin-top:2px;color:#203a51;font-size:11px}.ss-elastic-result-metrics .tone-ok strong{color:#17633b}.ss-elastic-result-metrics .tone-warn strong{color:#8a5a00}.ss-elastic-result-metrics .tone-ng strong{color:#a52a2a}
    .ss-elastic-result-controls{display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;padding:7px 0 8px;border-bottom:1px solid #e4ebf1;margin-bottom:8px}.ss-elastic-result-control{display:grid;gap:3px;min-width:0}.ss-elastic-result-control>span{color:#63778a;font-size:10px}.ss-elastic-result-control select{height:28px;min-width:105px;max-width:180px;border:1px solid #cbd8e3;border-radius:5px;background:#fff;color:#24445e;font-size:11px}.ss-elastic-result-segments{display:flex;gap:2px}.ss-elastic-result-segments button{height:28px;min-width:32px;border:1px solid #cbd8e3;border-radius:4px;background:#fff;color:#36536b;font-size:10.5px;cursor:pointer}.ss-elastic-result-segments button.active{border-color:#005a8d;background:#005a8d;color:white}.ss-elastic-result-range{display:flex;align-items:center;gap:7px;min-width:190px}.ss-elastic-result-range input{min-width:130px;accent-color:#005a8d}.ss-elastic-result-range output{min-width:58px;color:#24445e;font-size:10.5px}
    .ss-elastic-result-figure{margin:0 0 9px;padding-bottom:8px;border-bottom:1px solid #e4ebf1}.ss-elastic-result-figure h3{margin:0 0 5px;color:#244b68;font-size:11.5px;letter-spacing:0}.ss-elastic-result-svg{width:100%;min-height:120px;border:1px solid #e0e8ef;border-radius:6px;background:#fbfdff;overflow:hidden;color:#31556f}.ss-elastic-result-svg svg{display:block;width:100%;max-height:250px}.ss-elastic-result-figure p{margin:5px 1px 0;color:#6b7e90;font-size:10px}.ss-elastic-result-structure .ss-elastic-result-svg{min-height:190px}
    .ss-elastic-result-table-wrap{margin:0 0 8px;border-bottom:1px solid #e4ebf1;padding-bottom:7px}.ss-elastic-result-table-wrap summary{color:#31536d;font-size:11px;font-weight:600;cursor:pointer;padding:3px 0}.ss-elastic-result-table-scroll{max-height:220px;overflow:auto;border:1px solid #e0e8ef;border-radius:5px}.ss-elastic-result-table-wrap table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:10.5px}.ss-elastic-result-table-wrap th,.ss-elastic-result-table-wrap td{padding:5px 6px;border-bottom:1px solid #e7edf2;text-align:right}.ss-elastic-result-table-wrap th:first-child,.ss-elastic-result-table-wrap td:first-child{text-align:left}.ss-elastic-result-table-wrap th{position:sticky;top:0;background:#f2f7fa;color:#536a7e;font-weight:600}.ss-elastic-result-note{margin:6px 0 0;padding:6px 8px;border-left:3px solid #87a3b8;background:#f5f8fb;color:#52697d;font-size:10.5px}.ss-elastic-result-note.tone-warn{border-color:#d89a27;background:#fff9e8;color:#765300}.ss-elastic-result-note.tone-ng{border-color:#c34747;background:#fff3f3;color:#8d2828}
    .ss-elastic-result-popup[data-size-profile="compact"] .ss-elastic-result-body{padding-top:8px}.ss-elastic-result-popup[data-user-sized="0"]{height:auto}
    @media (max-width:720px){.ss-elastic-result-popup{position:fixed!important;left:8px!important;right:8px!important;top:8px!important;width:auto!important;height:auto!important;min-height:0!important;max-width:none!important;max-height:calc(100% - 16px)!important}.ss-elastic-result-head-actions select{display:none}.ss-elastic-result-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.ss-elastic-result-metrics>div:nth-child(2){border-right:0}.ss-elastic-result-metrics>div:nth-child(-n+2){border-bottom:1px solid #e4ebf1}.ss-elastic-result-control{width:100%}.ss-elastic-result-segments{overflow-x:auto}.ss-elastic-result-range{width:100%}.ss-elastic-result-range input{flex:1}}
  `;
  (doc.head || doc.documentElement || doc.body)?.appendChild(style);
}
