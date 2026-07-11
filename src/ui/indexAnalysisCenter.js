import {
  ANALYSIS_CASE_KINDS,
} from '../core/analysisCase.js';
import { buildAnalysisCaseResultView } from './indexResultViews.js';
import {
  buildCapacityChart,
  buildModalParticipationChart,
  buildSpectrumChart,
  buildTimeHistoryChart,
} from './resultCharts.js';
import { installFloatingPanel } from './floatingPanel.js';
import { createResultSelectionStore } from './resultSelectionStore.js';

export const INDEX_ANALYSIS_CENTER_VERSION = 'p7-m11-elastic-analysis-center-v2';

export const ANALYSIS_CASE_KIND_LABELS = {
  static: '정적 / P-Delta',
  modal: '모달',
  responseSpectrum: '응답스펙트럼 (RSA)',
  buckling: '탄성 고유치 좌굴',
  linearTha: '선형 시간이력 (예비)',
  pushover: 'Pushover',
  nlth: '비선형 시간이력 (예비)',
};

export function installIndexAnalysisCenter(target = globalThis, options = {}) {
  const doc = target?.document;
  const bridge = options.bridge || target?.SStructuresEngine;
  if (!doc?.createElement || !doc?.querySelector || !bridge) return null;
  if (target.SStructuresAnalysisCenter) return target.SStructuresAnalysisCenter;

  injectAnalysisCenterStyle(doc);
  const selectionStore = options.resultSelectionStore
    || bridge.getResultSelectionStore?.()
    || target.SStructuresResultSelection
    || createResultSelectionStore();
  target.SStructuresResultSelection ||= selectionStore;
  target.SStructuresResultSelectionStore ||= selectionStore;
  const initialSelection = selectionStore.getState?.() || {};

  const state = {
    selectedCaseId: initialSelection.activeCaseId || null,
    resultViewIndex: Math.max(0, Math.trunc(Number(initialSelection.modeOrStep) || 0)),
    open: false,
  };

  const root = ensureAnalysisCenterRoot(doc);
  const toggle = ensureAnalysisCenterToggle(target, doc, state);
  ensureRatioToggle(target, doc);
  const api = {
    version: INDEX_ANALYSIS_CENTER_VERSION,
    state,
    root,
    toggle,
    getState() {
      return buildAnalysisCenterState(target, state);
    },
    refresh() {
      renderAnalysisCenter(target, bridge, state, root);
      return api.getState();
    },
    select(caseId) {
      state.selectedCaseId = caseId || null;
      state.resultViewIndex = 0;
      const selectedResult = target.__SStructuresAnalysisResults?.[state.selectedCaseId] || null;
      selectionStore.set?.({
        activeCaseId: state.selectedCaseId,
        activeResultId: selectedResult?.runRecordId || null,
        modeOrStep: 0,
      }, 'analysis-center');
      renderAnalysisCenter(target, bridge, state, root);
      return api.getState();
    },
    open() {
      state.open = true;
      renderAnalysisCenter(target, bridge, state, root);
      syncAnalysisCenterToggle(toggle, state);
      target.SStructuresFloatingPanels?.recordVisibility?.('analysis-center', true);
      return api.getState();
    },
    close() {
      state.open = false;
      renderAnalysisCenter(target, bridge, state, root);
      syncAnalysisCenterToggle(toggle, state);
      target.SStructuresFloatingPanels?.recordVisibility?.('analysis-center', false);
      return api.getState();
    },
    toggleOpen() {
      state.open = !state.open;
      renderAnalysisCenter(target, bridge, state, root);
      syncAnalysisCenterToggle(toggle, state);
      target.SStructuresFloatingPanels?.recordVisibility?.('analysis-center', state.open);
      return api.getState();
    },
    add(kind = null) {
      const selectedKind = kind || root.querySelector?.('#ssAcKind')?.value || 'static';
      const analysisCase = bridge.addAnalysisCase?.({
        kind: selectedKind,
        settings: defaultSettingsForKind(selectedKind, currentModel(target)),
      });
      state.selectedCaseId = analysisCase?.id || state.selectedCaseId;
      renderAnalysisCenter(target, bridge, state, root);
      return api.getState();
    },
    save(caseId = state.selectedCaseId) {
      if (!caseId) return api.getState();
      applyCaseSettingsFromPanel(root, bridge, caseId);
      target.SStructuresElasticAnalysisRibbon?.refresh?.();
      return api.getState();
    },
    delete(caseId = state.selectedCaseId) {
      bridge.deleteAnalysisCase?.(caseId);
      if (state.selectedCaseId === caseId) state.selectedCaseId = null;
      renderAnalysisCenter(target, bridge, state, root);
      return api.getState();
    },
    run(caseId = state.selectedCaseId) {
      if (!caseId) return api.getState();
      applyCaseSettingsFromPanel(root, bridge, caseId);
      setCaseStatus(target, caseId, 'running');
      renderAnalysisCenter(target, bridge, state, root);
      const result = bridge.runAnalysisCase?.({ id: caseId });
      state.selectedCaseId = result?.caseId || caseId;
      state.resultViewIndex = 0;
      selectionStore.set?.({
        activeCaseId: state.selectedCaseId,
        activeResultId: result?.status === 'failed'
          ? selectionStore.getState?.().activeResultId || null
          : result?.runRecordId || null,
        modeOrStep: 0,
      }, 'analysis-center');
      renderAnalysisCenter(target, bridge, state, root);
      return api.getState();
    },
    runAll() {
      const cases = bridge.getAnalysisCases?.() || [];
      cases.forEach((item) => setCaseStatus(target, item.id, 'running'));
      renderAnalysisCenter(target, bridge, state, root);
      bridge.runAnalysisCases?.();
      const selected = selectionStore.getState?.() || {};
      state.selectedCaseId = selected.activeCaseId || state.selectedCaseId;
      state.resultViewIndex = Math.max(0, Math.trunc(Number(selected.modeOrStep) || 0));
      renderAnalysisCenter(target, bridge, state, root);
      return api.getState();
    },
    markStale(reason = 'model-changed') {
      markAnalysisCenterCasesStale(target, bridge, reason);
      renderAnalysisCenter(target, bridge, state, root);
      return api.getState();
    },
  };

  target.SStructuresAnalysisCenter = api;
  api.unsubscribeResultSelection = selectionStore.subscribe?.((next, _previous, source) => {
    if (source === 'analysis-center') return;
    state.selectedCaseId = next.activeCaseId || state.selectedCaseId;
    state.resultViewIndex = Math.max(0, Math.trunc(Number(next.modeOrStep) || 0));
    renderAnalysisCenter(target, bridge, state, root);
  }) || (() => {});
  bindAnalysisCenter(root, api);
  bindAnalysisCenterToggle(toggle, api);
  renderAnalysisCenter(target, bridge, state, root);
  syncAnalysisCenterToggle(toggle, state);
  return api;
}

export function buildAnalysisCenterState(target = globalThis, state = {}) {
  const model = target?.SStructuresEngine?.getCurrentModel?.() || (typeof target?.model === 'function' ? target.model() : null);
  const cases = model?.analysisCases || [];
  const results = target?.__SStructuresAnalysisResults || {};
  const latestAttempts = target?.__SStructuresAnalysisLatestAttempts || {};
  const selectionStore = target?.SStructuresResultSelection;
  const selection = selectionStore?.getState?.() || {};
  const selectedCaseId = selection.activeCaseId || state.selectedCaseId;
  const selectedIndex = Math.max(0, Math.trunc(Number(selection.modeOrStep ?? state.resultViewIndex) || 0));
  const selected = cases.find((item) => item.id === selectedCaseId) || cases[0] || null;
  const selectedResult = selected ? results[selected.id] || null : null;
  const latestAttempt = selected ? latestAttempts[selected.id] || selectedResult : null;
  const resultView = selected ? buildAnalysisCaseResultView(model || {}, selectedResult, { index: selectedIndex, selectionStore }) : null;
  const runStore = target?.__SStructuresAnalysisRunStore || { attempts: {} };
  return {
    version: INDEX_ANALYSIS_CENTER_VERSION,
    available: !!target?.document,
    open: state.open !== false,
    selectedCaseId: selected?.id || null,
    caseCount: cases.length,
    resultCount: Object.keys(results).length,
    attemptCount: Object.values(runStore.attempts || {}).reduce((sum, rows) => sum + rows.length, 0),
    resultSelection: selection,
    cases: cases.map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      status: item.status || 'not-run',
      lastRunStatus: item.lastRun?.status || null,
      hasResult: !!results[item.id],
      latestAttemptStatus: latestAttempts[item.id]?.status || null,
      retainedSuccessfulResult: Boolean(item.lastRun?.retainedSuccessfulResult),
    })),
    latestResult: selected ? summarizeResult(results[selected.id] || null, selected) : null,
    latestAttempt: selected ? summarizeResult(latestAttempt, selected) : null,
    resultView,
  };
}

export function markAnalysisCenterCasesStale(target = globalThis, bridge = target?.SStructuresEngine, reason = 'model-changed') {
  const model = bridge?.getCurrentModel?.() || (typeof target?.model === 'function' ? target.model() : null);
  if (!model?.analysisCases?.length) return [];
  const changed = [];
  for (const item of model.analysisCases) {
    if (['ok', 'failed', 'review-required', 'preliminary', 'designBlocked'].includes(item.status)) {
      item.status = 'stale';
      item.staleReason = reason;
      changed.push(item.id);
    }
  }
  return changed;
}

function ensureAnalysisCenterRoot(doc) {
  let root = doc.getElementById?.('ssAnalysisCenter');
  if (root) return root;
  root = doc.createElement('section');
  root.id = 'ssAnalysisCenter';
  root.setAttribute('id', 'ssAnalysisCenter');
  root.setAttribute('data-agent-id', 'ssAnalysisCenter');
  root.className = 'ss-analysis-center';
  const host = doc.querySelector?.('#main') || doc.body || doc.documentElement;
  host?.appendChild?.(root);
  return root;
}

function ensureAnalysisCenterToggle(target, doc, state) {
  let button = doc.getElementById?.('ssAnalysisCenterToggle');
  if (button) return button;
  button = doc.createElement('button');
  button.type = 'button';
  button.id = 'ssAnalysisCenterToggle';
  button.setAttribute('id', 'ssAnalysisCenterToggle');
  button.setAttribute('data-agent-id', 'ssAnalysisCenterToggle');
  button.className = 'res-toggle ss-ac-toggle';
  button.textContent = '해석 케이스';
  button.setAttribute('aria-controls', 'ssAnalysisCenter');
  button.setAttribute('aria-expanded', state.open === false ? 'false' : 'true');
  const host = doc.getElementById?.('subbar') || doc.querySelector?.('#topbar') || doc.body || doc.documentElement;
  const ratio = doc.querySelector?.('[data-res="ratio"]');
  if (ratio?.parentNode) ratio.parentNode.insertBefore(button, ratio);
  else host?.appendChild?.(button);
  target.SStructuresAnalysisCenterVisible = state.open !== false;
  return button;
}

function bindAnalysisCenterToggle(toggle, api) {
  if (!toggle || toggle.getAttribute?.('data-ss-analysis-toggle-bound') === '1') return;
  toggle.setAttribute?.('data-ss-analysis-toggle-bound', '1');
  toggle.addEventListener?.('click', () => api.toggleOpen());
}

function syncAnalysisCenterToggle(toggle, state) {
  if (!toggle) return;
  const open = state.open !== false;
  toggle.classList?.toggle?.('on', open);
  toggle.setAttribute?.('aria-expanded', open ? 'true' : 'false');
}

function bindAnalysisCenter(root, api) {
  if (root.getAttribute?.('data-ss-analysis-bound') === '1') return;
  root.setAttribute?.('data-ss-analysis-bound', '1');
  root.addEventListener?.('click', (event) => {
    const target = event.target;
    const close = target?.closest?.('#ssAcClose');
    if (close) return api.close();
    const add = target?.closest?.('#ssAcAdd');
    if (add) return api.add();
    const runAll = target?.closest?.('#ssAcRunAll');
    if (runAll) return api.runAll();
    const remove = target?.closest?.('#ssAcDelete');
    if (remove) return api.delete();
    const save = target?.closest?.('#ssAcSave');
    if (save) return api.save();
    const run = target?.closest?.('.ss-ac-run');
    if (run) return api.run(run.getAttribute?.('data-case-id'));
    const slider = target?.closest?.('#ssPoStepSlider');
    if (slider) return updatePushoverStepView(root, Number(slider.value || 0));
    const resultSlider = target?.closest?.('#ssResModeSlider');
    if (resultSlider) return updateResultCaseView(root, api, Number(resultSlider.value || 0));
    const item = target?.closest?.('.ss-ac-item');
    if (item) return api.select(item.getAttribute?.('data-case-id'));
    return null;
  });
  root.addEventListener?.('input', (event) => {
    const slider = event.target?.closest?.('#ssPoStepSlider');
    if (slider) updatePushoverStepView(root, Number(slider.value || 0));
    const resultSlider = event.target?.closest?.('#ssResModeSlider');
    if (resultSlider) updateResultCaseView(root, api, Number(resultSlider.value || 0));
  });
  root.addEventListener?.('change', (event) => {
    const caseSelect = event.target?.closest?.('#ssResultCaseSel');
    if (caseSelect) api.select(caseSelect.value);
    const setting = event.target?.closest?.('[data-ss-analysis-input]');
    if (setting) api.save();
  });
}

function renderAnalysisCenter(target, bridge, state, root) {
  if (!root?.ownerDocument) return;
  const doc = root.ownerDocument;
  clearChildren(root);
  root.classList?.toggle?.('is-open', state.open !== false);
  root.classList?.toggle?.('is-closed', state.open === false);
  root.setAttribute?.('aria-hidden', state.open === false ? 'true' : 'false');
  target.SStructuresAnalysisCenterVisible = state.open !== false;
  const cases = bridge.getAnalysisCases?.() || [];
  if (!state.selectedCaseId && cases[0]) state.selectedCaseId = cases[0].id;
  const selected = cases.find((item) => item.id === state.selectedCaseId) || cases[0] || null;
  state.selectedCaseId = selected?.id || null;

  root.appendChild(header(doc));
  root.appendChild(toolbar(doc));
  root.appendChild(caseList(doc, cases, selected));
  root.appendChild(resultSwitchPane(doc, target, state, cases, selected));
  root.appendChild(settingsPane(doc, selected, currentModel(target)));
  root.appendChild(resultPane(doc, target, selected));
  installFloatingPanel(target, root, {
    allowPanelHandle: false,
    defaultHeight: 520,
    defaultWidth: 380,
    handleSelector: '.ss-ac-header',
    maxHeight: 720,
    maxWidth: 620,
    minHeight: 240,
    minWidth: 300,
    position: 'fixed',
    snapThreshold: 18,
    storageKey: 's-structures:analysis-center-panel',
    viewportPadding: 8,
  });
  target.SStructuresElasticAnalysisRibbon?.refresh?.();
  target.SStructuresElasticSetupWorkflow?.refresh?.();
}

function header(doc) {
  const wrap = doc.createElement('div');
  wrap.className = 'ss-ac-header';
  const title = doc.createElement('h2');
  title.textContent = '해석 케이스';
  wrap.appendChild(title);
  const status = doc.createElement('span');
  status.className = 'ss-ac-caption';
  status.textContent = 'Phase 7';
  wrap.appendChild(status);
  const close = doc.createElement('button');
  close.type = 'button';
  close.id = 'ssAcClose';
  close.setAttribute('id', 'ssAcClose');
  close.setAttribute('data-agent-id', 'ssAcClose');
  close.className = 'ss-ac-close';
  close.textContent = '닫기';
  wrap.appendChild(close);
  return wrap;
}

function toolbar(doc) {
  const wrap = doc.createElement('div');
  wrap.className = 'ss-ac-toolbar';
  const select = doc.createElement('select');
  select.id = 'ssAcKind';
  select.setAttribute('id', 'ssAcKind');
  for (const kind of ANALYSIS_CASE_KINDS) {
    const option = doc.createElement('option');
    option.value = kind;
    option.textContent = ANALYSIS_CASE_KIND_LABELS[kind] || kind;
    select.appendChild(option);
  }
  wrap.appendChild(select);
  wrap.appendChild(button(doc, 'ssAcAdd', '추가'));
  wrap.appendChild(button(doc, 'ssAcRunAll', '전체 실행'));
  wrap.appendChild(button(doc, 'ssAcSave', '설정 저장'));
  wrap.appendChild(button(doc, 'ssAcDelete', '삭제'));
  return wrap;
}

function caseList(doc, cases, selected) {
  const list = doc.createElement('ul');
  list.id = 'ssAcList';
  list.setAttribute('id', 'ssAcList');
  list.className = 'ss-ac-list';
  for (const item of cases) {
    const li = doc.createElement('li');
    li.className = `ss-ac-item${item.id === selected?.id ? ' active' : ''}`;
    li.setAttribute('data-case-id', item.id);
    const name = doc.createElement('span');
    name.className = 'ss-ac-name';
    name.textContent = `${item.name || item.id} (${ANALYSIS_CASE_KIND_LABELS[item.kind] || item.kind})`;
    li.appendChild(name);
    const status = doc.createElement('span');
    status.className = `ss-ac-status status-${item.status || 'not-run'}`;
    status.setAttribute('data-case-id', item.id);
    status.textContent = analysisStatusLabel(item.status || 'not-run');
    li.appendChild(status);
    const run = doc.createElement('button');
    run.type = 'button';
    run.className = 'ss-ac-run';
    run.setAttribute('data-case-id', item.id);
    run.textContent = '실행';
    li.appendChild(run);
    list.appendChild(li);
  }
  if (!cases.length) {
    const empty = doc.createElement('li');
    empty.className = 'ss-ac-empty';
    empty.textContent = '해석 케이스가 없습니다';
    list.appendChild(empty);
  }
  return list;
}

function settingsPane(doc, item, model = {}) {
  const pane = doc.createElement('div');
  pane.id = 'ssAcSettings';
  pane.setAttribute('id', 'ssAcSettings');
  pane.className = 'ss-ac-settings';
  const title = doc.createElement('h3');
  title.textContent = '케이스 설정';
  pane.appendChild(title);
  if (!item) {
    pane.appendChild(note(doc, '해석 케이스를 선택하거나 추가하세요.'));
    return pane;
  }
  pane.appendChild(keyValueTable(doc, [
    ['ID', item.id],
    ['종류', ANALYSIS_CASE_KIND_LABELS[item.kind] || item.kind],
    ['상태', analysisStatusLabel(item.status || 'not-run')],
    ['Settings', compactSettings(item.settings || {})],
    ['Stale reason', item.staleReason || '-'],
  ]));
  if (item.kind === 'static') pane.appendChild(staticSettingsForm(doc, item.settings || {}, model));
  if (item.kind === 'modal') pane.appendChild(modalSettingsForm(doc, item.settings || {}, model));
  if (item.kind === 'responseSpectrum') pane.appendChild(responseSpectrumSettingsForm(doc, item.settings || {}, model));
  if (item.kind === 'buckling') pane.appendChild(bucklingSettingsForm(doc, item.settings || {}, model));
  if (item.kind === 'linearTha') pane.appendChild(linearThaSettingsForm(doc, item.settings || {}, model));
  if (item.kind === 'pushover') pane.appendChild(pushoverSettingsForm(doc, item.settings || {}));
  if (item.kind === 'nlth') pane.appendChild(nlthSettingsForm(doc, item.settings || {}));
  return pane;
}

function resultSwitchPane(doc, target, state, cases, selected) {
  const pane = doc.createElement('div');
  pane.id = 'ssResultSwitch';
  pane.setAttribute('id', 'ssResultSwitch');
  pane.className = 'ss-result-switch';
  pane.setAttribute('data-agent-id', 'ssResultSwitch');

  const selectWrap = fieldWrap(doc, 'ssResultCaseSel', '결과 케이스');
  const select = doc.createElement('select');
  select.id = 'ssResultCaseSel';
  select.setAttribute('id', 'ssResultCaseSel');
  select.setAttribute('data-agent-id', 'ssResultCaseSel');
  for (const item of cases) {
    const option = doc.createElement('option');
    option.value = item.id;
    option.textContent = `${item.id} (${ANALYSIS_CASE_KIND_LABELS[item.kind] || item.kind})`;
    select.appendChild(option);
  }
  select.value = selected?.id || '';
  select.addEventListener?.('change', () => {
    target.SStructuresAnalysisCenter?.select?.(select.value);
  });
  selectWrap.appendChild(select);
  pane.appendChild(selectWrap);

  const result = selected ? target.__SStructuresAnalysisResults?.[selected.id] || null : null;
  const selectionStore = target.SStructuresResultSelection;
  const selection = selectionStore?.getState?.() || {};
  const selectedIndex = Math.max(0, Math.trunc(Number(selection.modeOrStep ?? state.resultViewIndex) || 0));
  const view = selected ? buildAnalysisCaseResultView(currentModel(target), result, { index: selectedIndex, selectionStore }) : null;
  const sliderWrap = fieldWrap(doc, 'ssResModeSlider', '모드 / 스텝');
  const slider = doc.createElement('input');
  slider.id = 'ssResModeSlider';
  slider.setAttribute('id', 'ssResModeSlider');
  slider.setAttribute('data-agent-id', 'ssResModeSlider');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(view?.sliderMax || 0);
  slider.step = '1';
  slider.value = String(Math.min(Number(slider.max) || 0, selectedIndex));
  slider.addEventListener?.('input', () => updateResultCaseView(pane, target.SStructuresAnalysisCenter, Number(slider.value || 0)));
  sliderWrap.appendChild(slider);
  pane.appendChild(sliderWrap);

  const summary = doc.createElement('div');
  summary.id = 'ssResultCaseView';
  summary.setAttribute('id', 'ssResultCaseView');
  summary.className = 'ss-result-case-view';
  summary.setAttribute('data-agent-id', 'ssResultCaseView');
  pane.appendChild(summary);
  renderResultCaseSummary(summary, view);
  target.SStructuresResultCaseView = view;
  return pane;
}

function resultPane(doc, target, item) {
  const pane = doc.createElement('div');
  pane.id = 'ssAcResult';
  pane.setAttribute('id', 'ssAcResult');
  pane.className = 'ss-ac-result';
  const title = doc.createElement('h3');
  title.textContent = '결과';
  pane.appendChild(title);
  if (!item) {
    pane.appendChild(note(doc, '결과가 없습니다.'));
    return pane;
  }
  const result = target.__SStructuresAnalysisResults?.[item.id] || null;
  const latestAttempt = target.__SStructuresAnalysisLatestAttempts?.[item.id] || result;
  if (!result) {
    pane.appendChild(note(doc, item.status === 'stale' ? '결과가 오래되었습니다. 케이스를 다시 실행하세요.' : '아직 실행하지 않았습니다.'));
    return pane;
  }
  const retainedAfterFailure = latestAttempt?.status === 'failed' && latestAttempt !== result;
  const transferDecision = target.SStructuresEngine?.canTransferAnalysisResultToDesign?.({ runRecordId: result.runRecordId }) || {
    allowed: result.designTransferAllowed === true,
    code: result.designTransferAllowed === true ? null : 'ANALYSIS_RESULT_NOT_VERIFIED',
  };
  if (retainedAfterFailure) pane.appendChild(note(doc, 'Latest attempt failed. Showing the last successful result.'));
  pane.appendChild(keyValueTable(doc, [
    ['Latest attempt', latestAttempt?.status || result.status],
    ['Displayed result', result.status],
    ['Qualification', result.qualification || 'candidate'],
    ['Design transfer', transferDecision.allowed ? 'Allowed' : `Blocked (${transferDecision.code || 'not-eligible'})`],
    ['Run record', result.runRecordId || '-'],
    ['View', result.view],
    ['Completed', result.completedAt || '-'],
    ['Summary', compactSettings(result.summary || {})],
    ['Message', result.error?.message || result.message || '-'],
  ]));
  if (latestAttempt?.status === 'failed' || latestAttempt?.error?.message) {
    const log = doc.createElement('pre');
    log.className = 'ss-ac-log';
    log.textContent = latestAttempt.error?.message || latestAttempt.message || 'failed';
    pane.appendChild(log);
  }
  const transfer = doc.createElement('button');
  transfer.type = 'button';
  transfer.id = 'ssAcTransferDesign';
  transfer.setAttribute?.('id', 'ssAcTransferDesign');
  transfer.setAttribute?.('data-agent-id', 'ssAcTransferDesign');
  transfer.textContent = 'Transfer to design';
  transfer.disabled = transferDecision.allowed !== true;
  transfer.setAttribute?.('title', transfer.disabled
    ? transferDecision.message || 'A successful verified run matching the current model is required.'
    : 'Transfer verified result to design.');
  transfer.addEventListener?.('click', () => target.SStructuresEngine?.transferAnalysisResultToDesign?.({ runRecordId: result.runRecordId }));
  pane.appendChild(transfer);
  if (result.kind === 'pushover' && result.payload) pane.appendChild(pushoverResultView(doc, result.payload));
  if (result.kind === 'nlth' && result.payload) pane.appendChild(nlthResultView(doc, result.payload, result.settings || {}));
  const charts = resultChartsView(doc, result);
  if (charts) pane.appendChild(charts);
  const legend = memberRatioLegendView(doc, target.SStructuresResultCaseView);
  if (legend) pane.appendChild(legend);
  return pane;
}

function button(doc, id, text) {
  const result = doc.createElement('button');
  result.type = 'button';
  result.id = id;
  result.setAttribute('id', id);
  result.setAttribute('data-agent-id', id);
  result.textContent = text;
  return result;
}

function note(doc, text) {
  const div = doc.createElement('div');
  div.className = 'ss-ac-note';
  div.textContent = text;
  return div;
}

function keyValueTable(doc, rows) {
  const table = doc.createElement('table');
  table.className = 'ss-ac-table';
  for (const [key, value] of rows) {
    const tr = doc.createElement('tr');
    const th = doc.createElement('th');
    th.textContent = key;
    const td = doc.createElement('td');
    td.textContent = String(value ?? '-');
    tr.appendChild(th);
    tr.appendChild(td);
    table.appendChild(tr);
  }
  return table;
}

function defaultSettingsForKind(kind, model = {}) {
  const massSource = clonePlain(model.analysisSettings?.massSource || model.massSources?.[0] || null);
  if (kind === 'static') return { pDeltaMethod: 'off' };
  if (kind === 'modal') return { modalModeCount: 12, massSource };
  if (kind === 'responseSpectrum') {
    return {
      modalModeCount: 12,
      massSource,
      spectrum: {
        method: 'SRSS',
        directions: ['x', 'y'],
        dampingRatio: 0.05,
        scale: 9.80665,
        points: [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }],
      },
    };
  }
  if (kind === 'buckling') {
    return {
      preloadCombinationId: model.loadCombinations?.[0]?.id || null,
      modeCount: 3,
      maxIterations: 30,
    };
  }
  if (kind === 'linearTha') {
    return {
      modalModeCount: 12,
      massSource,
      direction: 'x',
      dampingRatio: 0.05,
      dt: 0.02,
      accelerationUnit: 'g',
      accelerationScale: 1,
      recordId: 'sample-a',
      accelerations: [0, 0.05, -0.05, 0.08, -0.04, 0],
    };
  }
  if (kind === 'pushover') return { direction: '+x', pattern: 'triangular', steps: 8, maxLoadFactor: 1, referenceBaseShear: 10 };
  if (kind === 'nlth') return { record: 'sample-a', scale: 1, dt: 0.02, damping: 0.02, accelerations: [0, 0.05, -0.05, 0], mass: 1, stiffness: 100, yieldForce: 0.08, postYieldRatio: 0.02 };
  return {};
}

function staticSettingsForm(doc, settings = {}, model = {}) {
  const form = analysisSettingsForm(doc, 'ssStaticCaseSettings');
  const method = settings.pDeltaMethod || (settings.pDelta ? 'legacy' : 'off');
  form.appendChild(selectField(doc, 'ssStaticCombo', '하중조합', combinationOptions(model, true), settings.comboId || ''));
  form.appendChild(selectField(doc, 'ssStaticPDeltaMethod', '2차효과', [
    { value: 'off', label: '사용 안 함 (1차)' },
    { value: 'direct', label: 'Direct P-Delta (설계용)' },
    { value: 'legacy', label: '등가하중 반복 (비교용)' },
  ], method));
  const message = doc.createElement('div');
  message.className = 'ss-ac-note ss-analysis-method-note';
  message.textContent = method === 'legacy'
    ? '등가하중 반복 결과는 비교 전용이며 설계 전달이 차단됩니다.'
    : 'Direct P-Delta는 접선강성 수렴 및 검증 gate를 통과한 결과만 설계에 전달됩니다.';
  form.appendChild(message);
  return form;
}

function modalSettingsForm(doc, settings = {}, model = {}) {
  const form = analysisSettingsForm(doc, 'ssModalCaseSettings');
  form.appendChild(numberField(doc, 'ssModalModeCount', '모드 수', settings.modalModeCount ?? 12, { min: 1, max: 200, step: 1 }));
  form.appendChild(selectField(doc, 'ssModalMassSource', '질량원', massSourceOptions(model), settings.massSource?.id || ''));
  return form;
}

function responseSpectrumSettingsForm(doc, settings = {}, model = {}) {
  const spectrum = settings.spectrum || {};
  const form = analysisSettingsForm(doc, 'ssRsaCaseSettings');
  form.appendChild(numberField(doc, 'ssRsaModeCount', '모드 수', settings.modalModeCount ?? 12, { min: 1, max: 200, step: 1 }));
  form.appendChild(selectField(doc, 'ssRsaMassSource', '질량원', massSourceOptions(model), settings.massSource?.id || ''));
  form.appendChild(selectField(doc, 'ssRsaMethod', '모드 조합', ['SRSS', 'CQC'], spectrum.method || 'SRSS'));
  form.appendChild(selectField(doc, 'ssRsaDirections', '해석 방향', [
    { value: 'x,y', label: 'X + Y' },
    { value: 'x', label: 'X' },
    { value: 'y', label: 'Y' },
    { value: 'z', label: 'Z' },
  ], (spectrum.directions || ['x', 'y']).join(',')));
  form.appendChild(numberField(doc, 'ssRsaDamping', '감쇠비', spectrum.dampingRatio ?? 0.05, { min: 0, max: 1, step: 0.01 }));
  form.appendChild(numberField(doc, 'ssRsaScale', '가속도 배율', spectrum.scale ?? 9.80665, { min: 0, step: 0.00001 }));
  form.appendChild(textAreaField(doc, 'ssRsaPoints', '스펙트럼 T:Sa', formatSpectrumPoints(spectrum.points), { rows: 3 }));
  return form;
}

function bucklingSettingsForm(doc, settings = {}, model = {}) {
  const form = analysisSettingsForm(doc, 'ssBucklingCaseSettings');
  form.appendChild(selectField(doc, 'ssBucklingCombo', '선행 하중조합', combinationOptions(model, false), settings.preloadCombinationId || model.loadCombinations?.[0]?.id || ''));
  form.appendChild(numberField(doc, 'ssBucklingModeCount', '좌굴 모드 수', settings.modeCount ?? 3, { min: 1, max: 30, step: 1 }));
  form.appendChild(numberField(doc, 'ssBucklingIterations', '최대 반복', settings.maxIterations ?? 30, { min: 5, max: 300, step: 1 }));
  return form;
}

function linearThaSettingsForm(doc, settings = {}, model = {}) {
  const form = analysisSettingsForm(doc, 'ssLinearThaCaseSettings');
  form.appendChild(numberField(doc, 'ssLthaModeCount', '모드 수', settings.modalModeCount ?? 12, { min: 1, max: 200, step: 1 }));
  form.appendChild(selectField(doc, 'ssLthaMassSource', '질량원', massSourceOptions(model), settings.massSource?.id || ''));
  form.appendChild(selectField(doc, 'ssLthaDirection', '방향', ['x', 'y', 'z'], settings.direction || 'x'));
  form.appendChild(numberField(doc, 'ssLthaDamping', '감쇠비', settings.dampingRatio ?? 0.05, { min: 0, max: 1, step: 0.01 }));
  form.appendChild(numberField(doc, 'ssLthaDt', '시간간격 dt', settings.dt ?? 0.02, { min: 0.00001, step: 0.001 }));
  form.appendChild(selectField(doc, 'ssLthaAccelerationUnit', '가속도 단위', ['g', 'm/s2', 'model'], settings.accelerationUnit || 'g'));
  form.appendChild(numberField(doc, 'ssLthaScale', '기록 배율', settings.accelerationScale ?? 1, { min: 0, step: 0.01 }));
  form.appendChild(textField(doc, 'ssLthaRecordId', '기록 ID', settings.recordId || ''));
  form.appendChild(textAreaField(doc, 'ssLthaAccelerations', '가속도 기록', (settings.accelerations || []).join(', '), { rows: 4 }));
  const limitation = doc.createElement('div');
  limitation.className = 'ss-ac-note ss-analysis-method-note';
  limitation.textContent = '선형 THA는 모드중첩 Newmark 예비 기능이며 현재 설계 전달 대상이 아닙니다.';
  form.appendChild(limitation);
  return form;
}

function analysisSettingsForm(doc, id) {
  const form = doc.createElement('div');
  form.id = id;
  form.setAttribute('id', id);
  form.className = 'ss-analysis-settings-form';
  form.setAttribute('data-agent-id', id);
  return form;
}

function pushoverSettingsForm(doc, settings = {}) {
  const form = doc.createElement('div');
  form.id = 'ssPoCaseSettings';
  form.setAttribute('id', 'ssPoCaseSettings');
  form.className = 'ss-po-settings';
  form.appendChild(selectField(doc, 'ssPoDirection', 'Direction', ['+x', '-x', '+y', '-y'], settings.direction || '+x'));
  form.appendChild(selectField(doc, 'ssPoPattern', 'Pattern', ['triangular', 'uniform', 'mass'], settings.pattern || 'triangular'));
  form.appendChild(numberField(doc, 'ssPoSteps', 'Steps', settings.steps ?? 8, { min: 1, max: 80, step: 1 }));
  form.appendChild(numberField(doc, 'ssPoTarget', 'Target', settings.targetDisplacement ?? '', { step: 0.001 }));
  form.appendChild(textField(doc, 'ssPoControlNode', 'Control node', settings.controlNodeId || ''));
  form.appendChild(numberField(doc, 'ssPoMaxLoadFactor', 'Max LF', settings.maxLoadFactor ?? 1, { min: 0, step: 0.1 }));
  form.appendChild(numberField(doc, 'ssPoReferenceBaseShear', 'Ref V', settings.referenceBaseShear ?? 10, { min: 0, step: 1 }));
  form.appendChild(selectField(doc, 'ssPoControl', 'Control', ['load-factor', 'displacement', 'arcLength'], settings.control || 'load-factor'));
  const note = doc.createElement('div');
  note.className = 'ss-ac-note ss-po-note';
  note.textContent = 'Pushover uses the current preliminary load-factor engine; displacement and arc-length are recorded as control intent.';
  form.appendChild(note);
  return form;
}

function pushoverResultView(doc, pushover = {}) {
  const view = doc.createElement('div');
  view.id = 'ssPoResultView';
  view.setAttribute('id', 'ssPoResultView');
  view.className = 'ss-po-result';

  const curve = doc.createElement('div');
  curve.id = 'ssPoCurve';
  curve.setAttribute('id', 'ssPoCurve');
  curve.className = 'ss-po-curve';
  curve.setAttribute('data-agent-id', 'ssPoCurve');
  curve.innerHTML = renderCapacityCurveSvg(pushover.curve || [], pushover.firstYield);
  view.appendChild(curve);

  const slider = doc.createElement('input');
  slider.id = 'ssPoStepSlider';
  slider.setAttribute('id', 'ssPoStepSlider');
  slider.setAttribute('data-agent-id', 'ssPoStepSlider');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(Math.max(0, (pushover.curve || []).length - 1));
  slider.step = '1';
  slider.value = slider.max;
  slider.addEventListener?.('input', () => updatePushoverStepView(view, Number(slider.value || 0)));
  view.appendChild(slider);

  const status = doc.createElement('div');
  status.id = 'ssPoStepStatus';
  status.setAttribute('id', 'ssPoStepStatus');
  status.className = 'ss-po-step-status';
  view.appendChild(status);

  const states = doc.createElement('div');
  states.id = 'ssPoHingeStates';
  states.setAttribute('id', 'ssPoHingeStates');
  states.className = 'ss-po-hinge-states';
  view.appendChild(states);

  view.__SStructuresPushoverPayload = pushover;
  updatePushoverStepView(view, Number(slider.value || 0));
  view.appendChild(performanceReviewView(doc, pushover));
  return view;
}

function performanceReviewView(doc, pushover = {}) {
  const review = buildPerformanceReview(pushover);
  const wrap = doc.createElement('div');
  wrap.id = 'ssPerfPoint';
  wrap.setAttribute('id', 'ssPerfPoint');
  wrap.className = 'ss-perf-point';
  wrap.setAttribute('data-agent-id', 'ssPerfPoint');

  const badge = doc.createElement('span');
  badge.id = 'ssPerfLevel';
  badge.setAttribute('id', 'ssPerfLevel');
  badge.className = `ss-perf-level level-${review.level.toLowerCase()}`;
  badge.setAttribute('data-agent-id', 'ssPerfLevel');
  badge.textContent = review.level;
  wrap.appendChild(badge);

  wrap.appendChild(keyValueTable(doc, [
    ['Demand', formatNumber(review.demand)],
    ['Capacity', formatNumber(review.capacity)],
    ['Usage', formatNumber(review.usageRatio)],
    ['Basis', review.basis],
  ]));

  const table = doc.createElement('table');
  table.id = 'ssPerfHingeTable';
  table.setAttribute('id', 'ssPerfHingeTable');
  table.className = 'ss-ac-table ss-perf-hinge-table';
  table.setAttribute('data-agent-id', 'ssPerfHingeTable');
  table.appendChild(tableRow(doc, ['Member', 'State', 'Ratio', 'Level'], 'th'));
  for (const row of review.hingeRows) {
    table.appendChild(tableRow(doc, [row.memberId, row.state, formatNumber(row.ratio), row.level]));
  }
  wrap.appendChild(table);
  wrap.__SStructuresPerformanceReview = review;
  return wrap;
}

function nlthSettingsForm(doc, settings = {}) {
  const form = doc.createElement('div');
  form.id = 'ssNlthCaseSettings';
  form.setAttribute('id', 'ssNlthCaseSettings');
  form.className = 'ss-nlth-settings ss-po-settings';
  form.appendChild(selectField(doc, 'ssNlthRecord', 'Record', ['sample-a', 'sample-b', 'custom'], settings.record || 'sample-a'));
  form.appendChild(numberField(doc, 'ssNlthScale', 'Scale', settings.scale ?? 1, { min: 0, step: 0.1 }));
  form.appendChild(numberField(doc, 'ssNlthDamping', 'Damping', settings.damping ?? 0.02, { min: 0, step: 0.01 }));
  form.appendChild(numberField(doc, 'ssNlthDt', 'dt', settings.dt ?? 0.02, { min: 0.001, step: 0.001 }));
  form.appendChild(numberField(doc, 'ssNlthMass', 'Mass', settings.mass ?? 1, { min: 0.001, step: 0.1 }));
  form.appendChild(numberField(doc, 'ssNlthStiffness', 'Stiffness', settings.stiffness ?? 100, { min: 0.001, step: 1 }));
  form.appendChild(numberField(doc, 'ssNlthYieldForce', 'Yield force', settings.yieldForce ?? 0.08, { min: 0, step: 0.01 }));
  const note = doc.createElement('div');
  note.className = 'ss-ac-note ss-nlth-note';
  note.textContent = 'NLTH is a preliminary SDOF bilinear Newmark trace, not a full frame nonlinear time-history solver.';
  form.appendChild(note);
  return form;
}

function nlthResultView(doc, nlth = {}, settings = {}) {
  const view = doc.createElement('div');
  view.id = 'ssNlthResultView';
  view.setAttribute('id', 'ssNlthResultView');
  view.className = 'ss-nlth-result';

  const chart = doc.createElement('div');
  chart.id = 'ssNlthTimeHistory';
  chart.setAttribute('id', 'ssNlthTimeHistory');
  chart.className = 'ss-nlth-chart';
  chart.setAttribute('data-agent-id', 'ssNlthTimeHistory');
  chart.innerHTML = renderTimeHistorySvg(nlth.rows || []);
  view.appendChild(chart);

  const summary = doc.createElement('div');
  summary.id = 'ssNlthSummary';
  summary.setAttribute('id', 'ssNlthSummary');
  summary.className = 'ss-nlth-summary';
  summary.setAttribute('data-agent-id', 'ssNlthSummary');
  const caption = doc.createElement('div');
  caption.className = 'ss-nlth-caption';
  caption.textContent = `Record ${settings.record || '-'} | scale ${formatNumber(settings.scale ?? 1)}`;
  summary.appendChild(caption);
  summary.appendChild(keyValueTable(doc, [
    ['Record', settings.record || '-'],
    ['Scale', formatNumber(settings.scale ?? 1)],
    ['dt', formatNumber(nlth.dt)],
    ['Rows', nlth.summary?.stepCount || 0],
    ['Max d', formatNumber(nlth.summary?.maxAbsDisplacement || nlth.maxDisplacement)],
    ['Converged', nlth.converged ? 'yes' : 'review'],
  ]));
  view.appendChild(summary);

  const limitation = doc.createElement('div');
  limitation.id = 'ssNlthLimitation';
  limitation.setAttribute('id', 'ssNlthLimitation');
  limitation.className = 'ss-ac-note ss-nlth-limitation';
  limitation.textContent = 'Preliminary: SDOF/bilinear Newmark response with scaling trace; frame-wide NLTH qualification remains a review item.';
  view.appendChild(limitation);
  return view;
}

function resultChartsView(doc, result = {}) {
  const payload = result.payload || {};
  const chart = chartForResult(result.kind, payload);
  if (!chart) return null;
  const wrap = doc.createElement('div');
  wrap.id = chart.id;
  wrap.setAttribute('id', chart.id);
  wrap.className = 'ss-result-chart';
  wrap.setAttribute('data-agent-id', chart.id);
  wrap.setAttribute('data-chart-version', chart.version);
  wrap.innerHTML = chart.svg;
  return wrap;
}

function chartForResult(kind, payload = {}) {
  if (kind === 'pushover') {
    const chart = buildCapacityChart(payload.curve || [], { firstYield: payload.firstYield });
    return { id: 'ssChartCapacity', version: chart.version, svg: chart.svg };
  }
  if (kind === 'nlth' || kind === 'linearTha') {
    const chart = buildTimeHistoryChart(payload.rows || []);
    return { id: 'ssChartTimeHistory', version: chart.version, svg: chart.svg };
  }
  if (kind === 'responseSpectrum') {
    const chart = buildSpectrumChart(payload);
    return { id: 'ssChartSpectrum', version: chart.version, svg: chart.svg };
  }
  if (kind === 'modal') {
    const chart = buildModalParticipationChart(payload.modes || []);
    return { id: 'ssChartModal', version: chart.version, svg: chart.svg };
  }
  return null;
}

function memberRatioLegendView(doc, view = {}) {
  const ratioMap = view?.overlayData?.memberRatioMap;
  if (!ratioMap?.rows?.length) return null;
  const wrap = doc.createElement('div');
  wrap.id = 'ssRatioLegend';
  wrap.setAttribute('id', 'ssRatioLegend');
  wrap.className = 'ss-ratio-legend';
  wrap.setAttribute('data-agent-id', 'ssRatioLegend');
  wrap.setAttribute('data-version', ratioMap.version);
  wrap.setAttribute('data-member-count', String(ratioMap.rows.length));
  wrap.setAttribute('data-max-ratio', formatNumber(ratioMap.maxRatio));

  const title = doc.createElement('div');
  title.className = 'ss-ratio-title';
  title.textContent = `Member ratio max ${formatNumber(ratioMap.maxRatio)} (${ratioMap.rows.length})`;
  wrap.appendChild(title);

  const items = doc.createElement('div');
  items.className = 'ss-ratio-items';
  for (const item of ratioMap.legend || []) {
    const chip = doc.createElement('span');
    chip.className = `ss-ratio-chip ratio-${item.status}`;
    chip.setAttribute('data-status', item.status);
    chip.setAttribute('data-color', item.color);
    chip.textContent = item.label;
    items.appendChild(chip);
  }
  wrap.appendChild(items);
  return wrap;
}

function ensureRatioToggle(target, doc) {
  if (doc.querySelector?.('[data-res="ratio"]')) return;
  const subbar = doc.getElementById?.('subbar') || doc.body || doc.documentElement;
  const button = doc.createElement('button');
  button.type = 'button';
  button.id = 'ssRatioToggle';
  button.setAttribute('id', 'ssRatioToggle');
  button.className = 'res-toggle';
  button.setAttribute('data-res', 'ratio');
  button.setAttribute('data-agent-id', 'ssRatioToggle');
  button.textContent = 'ratio';
  button.addEventListener?.('click', () => {
    const enabled = button.classList.toggle('on');
    target.SStructuresRatioVisible = enabled;
    target.draw?.();
  });
  subbar?.appendChild?.(button);
}

function updatePushoverStepView(root, stepIndex) {
  const view = root?.closest?.('#ssPoResultView') || root?.querySelector?.('#ssPoResultView') || root;
  const payload = view?.__SStructuresPushoverPayload;
  if (!payload) return null;
  const curve = payload.curve || [];
  const index = Math.max(0, Math.min(curve.length - 1, Math.trunc(Number(stepIndex) || 0)));
  const point = curve[index] || {};
  const status = view.querySelector?.('#ssPoStepStatus');
  if (status) {
    status.textContent = `Step ${point.step ?? index} | LF ${formatNumber(point.loadFactor)} | V ${formatNumber(point.baseShear)} | d ${formatNumber(point.controlDisplacement)}`;
  }
  const states = view.querySelector?.('#ssPoHingeStates');
  if (states) {
    clearChildren(states);
    const doc = states.ownerDocument;
    const rows = Object.entries(payload.memberStates || {});
    if (!rows.length) {
      states.appendChild(note(doc, 'No hinge state rows are available for this result.'));
    } else {
      for (const [memberId, state] of rows) {
        const row = doc.createElement('span');
        row.className = `ss-po-hinge-state state-${state.overall || 'unknown'}`;
        row.setAttribute('data-member-id', memberId);
        row.textContent = `${memberId}: ${state.overall || 'unknown'}`;
        states.appendChild(row);
      }
    }
  }
  return { step: index, point };
}

function renderCapacityCurveSvg(curve = [], firstYield = null) {
  return buildCapacityChart(curve, { id: 'ssPoCurveSvg', firstYield }).svg;
}

function applyCaseSettingsFromPanel(root, bridge, caseId) {
  const cases = bridge.getAnalysisCases?.() || [];
  const item = cases.find((row) => row.id === caseId);
  if (!item) return null;
  const previous = item.settings || {};
  const model = bridge.getCurrentModel?.() || {};
  const readers = {
    static: () => readStaticSettings(root, previous),
    modal: () => readModalSettings(root, previous, model),
    responseSpectrum: () => readResponseSpectrumSettings(root, previous, model),
    buckling: () => readBucklingSettings(root, previous),
    linearTha: () => readLinearThaSettings(root, previous, model),
    pushover: () => readPushoverSettings(root, previous),
    nlth: () => readNlthSettings(root, previous),
  };
  const settings = readers[item.kind]?.();
  if (!settings) return null;
  bridge.updateAnalysisCase?.(caseId, { settings });
  return settings;
}

function readStaticSettings(root, previous = {}) {
  return {
    ...previous,
    comboId: cleanOptionalString(root.querySelector?.('#ssStaticCombo')?.value, null),
    pDeltaMethod: root.querySelector?.('#ssStaticPDeltaMethod')?.value || previous.pDeltaMethod || 'off',
  };
}

function readModalSettings(root, previous = {}, model = {}) {
  return {
    ...previous,
    modalModeCount: positiveInt(root.querySelector?.('#ssModalModeCount')?.value, previous.modalModeCount || 12),
    massSource: readMassSource(root.querySelector?.('#ssModalMassSource')?.value, model, previous.massSource),
  };
}

function readResponseSpectrumSettings(root, previous = {}, model = {}) {
  const spectrum = previous.spectrum || {};
  return {
    ...previous,
    modalModeCount: positiveInt(root.querySelector?.('#ssRsaModeCount')?.value, previous.modalModeCount || 12),
    massSource: readMassSource(root.querySelector?.('#ssRsaMassSource')?.value, model, previous.massSource),
    spectrum: {
      ...spectrum,
      method: root.querySelector?.('#ssRsaMethod')?.value || spectrum.method || 'SRSS',
      directions: String(root.querySelector?.('#ssRsaDirections')?.value || 'x,y').split(',').filter(Boolean),
      dampingRatio: nonNegativeNumber(root.querySelector?.('#ssRsaDamping')?.value, spectrum.dampingRatio ?? 0.05),
      scale: nonNegativeNumber(root.querySelector?.('#ssRsaScale')?.value, spectrum.scale ?? 9.80665),
      points: parseSpectrumPoints(root.querySelector?.('#ssRsaPoints')?.value, spectrum.points),
    },
  };
}

function readBucklingSettings(root, previous = {}) {
  return {
    ...previous,
    preloadCombinationId: cleanOptionalString(root.querySelector?.('#ssBucklingCombo')?.value, previous.preloadCombinationId),
    modeCount: positiveInt(root.querySelector?.('#ssBucklingModeCount')?.value, previous.modeCount || 3),
    maxIterations: positiveInt(root.querySelector?.('#ssBucklingIterations')?.value, previous.maxIterations || 30),
  };
}

function readLinearThaSettings(root, previous = {}, model = {}) {
  return {
    ...previous,
    modalModeCount: positiveInt(root.querySelector?.('#ssLthaModeCount')?.value, previous.modalModeCount || 12),
    massSource: readMassSource(root.querySelector?.('#ssLthaMassSource')?.value, model, previous.massSource),
    direction: root.querySelector?.('#ssLthaDirection')?.value || previous.direction || 'x',
    dampingRatio: nonNegativeNumber(root.querySelector?.('#ssLthaDamping')?.value, previous.dampingRatio ?? 0.05),
    dt: positiveNumber(root.querySelector?.('#ssLthaDt')?.value, previous.dt ?? 0.02),
    accelerationUnit: root.querySelector?.('#ssLthaAccelerationUnit')?.value || previous.accelerationUnit || 'g',
    accelerationScale: nonNegativeNumber(root.querySelector?.('#ssLthaScale')?.value, previous.accelerationScale ?? 1),
    recordId: cleanOptionalString(root.querySelector?.('#ssLthaRecordId')?.value, previous.recordId),
    accelerations: parseNumberSeries(root.querySelector?.('#ssLthaAccelerations')?.value, previous.accelerations),
  };
}

function readPushoverSettings(root, previous = {}) {
  const control = root.querySelector?.('#ssPoControl')?.value || previous.control || 'load-factor';
  return {
    ...previous,
    direction: root.querySelector?.('#ssPoDirection')?.value || previous.direction || '+x',
    pattern: root.querySelector?.('#ssPoPattern')?.value || previous.pattern || 'triangular',
    steps: positiveInt(root.querySelector?.('#ssPoSteps')?.value, previous.steps || 8),
    targetDisplacement: optionalNumber(root.querySelector?.('#ssPoTarget')?.value, previous.targetDisplacement),
    controlNodeId: cleanOptionalString(root.querySelector?.('#ssPoControlNode')?.value, previous.controlNodeId),
    maxLoadFactor: nonNegativeNumber(root.querySelector?.('#ssPoMaxLoadFactor')?.value, previous.maxLoadFactor ?? 1),
    referenceBaseShear: nonNegativeNumber(root.querySelector?.('#ssPoReferenceBaseShear')?.value, previous.referenceBaseShear ?? 10),
    control,
  };
}

function readNlthSettings(root, previous = {}) {
  const record = root.querySelector?.('#ssNlthRecord')?.value || previous.record || 'sample-a';
  const scale = nonNegativeNumber(root.querySelector?.('#ssNlthScale')?.value, previous.scale ?? 1);
  return {
    ...previous,
    record,
    scale,
    damping: nonNegativeNumber(root.querySelector?.('#ssNlthDamping')?.value, previous.damping ?? 0.02),
    dt: positiveNumber(root.querySelector?.('#ssNlthDt')?.value, previous.dt ?? 0.02),
    mass: positiveNumber(root.querySelector?.('#ssNlthMass')?.value, previous.mass ?? 1),
    stiffness: positiveNumber(root.querySelector?.('#ssNlthStiffness')?.value, previous.stiffness ?? 100),
    yieldForce: nonNegativeNumber(root.querySelector?.('#ssNlthYieldForce')?.value, previous.yieldForce ?? 0.08),
    postYieldRatio: nonNegativeNumber(previous.postYieldRatio, 0.02),
    accelerations: sampleNlthRecord(record),
  };
}

function selectField(doc, id, label, values, selected) {
  const wrap = fieldWrap(doc, id, label);
  const select = doc.createElement('select');
  select.id = id;
  select.setAttribute('id', id);
  select.setAttribute('data-ss-analysis-input', '1');
  for (const entry of values) {
    const value = typeof entry === 'object' ? entry.value : entry;
    const labelText = typeof entry === 'object' ? entry.label : entry;
    const option = doc.createElement('option');
    option.value = value;
    option.textContent = labelText;
    select.appendChild(option);
  }
  select.value = selected;
  wrap.appendChild(select);
  return wrap;
}

function numberField(doc, id, label, value, options = {}) {
  const wrap = fieldWrap(doc, id, label);
  const input = doc.createElement('input');
  input.id = id;
  input.setAttribute('id', id);
  input.setAttribute('data-ss-analysis-input', '1');
  input.type = 'number';
  input.value = value == null ? '' : String(value);
  if (options.min != null) input.min = String(options.min);
  if (options.max != null) input.max = String(options.max);
  if (options.step != null) input.step = String(options.step);
  wrap.appendChild(input);
  return wrap;
}

function textField(doc, id, label, value) {
  const wrap = fieldWrap(doc, id, label);
  const input = doc.createElement('input');
  input.id = id;
  input.setAttribute('id', id);
  input.setAttribute('data-ss-analysis-input', '1');
  input.type = 'text';
  input.value = value || '';
  wrap.appendChild(input);
  return wrap;
}

function textAreaField(doc, id, label, value, options = {}) {
  const wrap = fieldWrap(doc, id, label);
  const textarea = doc.createElement('textarea');
  textarea.id = id;
  textarea.setAttribute('id', id);
  textarea.setAttribute('data-ss-analysis-input', '1');
  textarea.rows = options.rows || 3;
  textarea.value = value || '';
  wrap.appendChild(textarea);
  return wrap;
}

function fieldWrap(doc, id, label) {
  const wrap = doc.createElement('label');
  wrap.className = 'ss-ac-field';
  wrap.setAttribute('data-ss-analysis-field', id);
  const title = doc.createElement('span');
  title.textContent = label;
  wrap.appendChild(title);
  return wrap;
}

function buildPerformanceReview(pushover = {}) {
  const curve = pushover.curve || [];
  const capacity = Math.max(1e-9, pushover.summary?.maxControlDisplacement || maxAbs(curve.map((point) => point.controlDisplacement)));
  const demand = Math.max(0, pushover.firstYield?.controlDisplacement || capacity * 0.75);
  const usageRatio = demand / capacity;
  const hingeRows = Object.entries(pushover.memberStates || {}).map(([memberId, state]) => {
    const ratio = Math.max(Number(state?.i?.ratio) || 0, Number(state?.j?.ratio) || 0);
    return {
      memberId,
      state: state?.overall || 'unknown',
      ratio,
      level: performanceLevel({ usageRatio: ratio, state: state?.overall }),
    };
  });
  const worst = worstPerformanceLevel([
    performanceLevel({ usageRatio, state: pushover.summary?.ultimateMemberCount ? 'ultimate' : pushover.summary?.yieldedMemberCount ? 'yielded' : 'elastic' }),
    ...hingeRows.map((row) => row.level),
  ]);
  return {
    version: 'p5-m8-performance-review',
    demand,
    capacity,
    usageRatio,
    level: worst,
    basis: pushover.firstYield ? 'first-yield demand over maximum capacity curve displacement' : 'estimated demand from capacity curve',
    hingeRows,
  };
}

function updateResultCaseView(root, api, index) {
  if (!api?.state) return null;
  api.state.resultViewIndex = Math.max(0, Math.trunc(Number(index) || 0));
  root?.ownerDocument?.defaultView?.SStructuresResultSelection?.set?.(
    { modeOrStep: api.state.resultViewIndex },
    'analysis-center',
  );
  api.refresh?.();
  return api.getState?.().resultView || null;
}

function renderResultCaseSummary(container, view) {
  if (!container) return;
  clearChildren(container);
  const doc = container.ownerDocument;
  if (!view?.available) {
    container.appendChild(note(doc, 'No case result selected.'));
    return;
  }
  container.appendChild(keyValueTable(doc, [
    ['Case', view.caseId],
    ['Kind', view.kind],
    ['View', view.overlayData?.visualKind || view.view || '-'],
    ['Index', `${view.selectedIndex} / ${view.sliderMax}`],
  ]));
  if (view.kind === 'modal' && view.overlayData?.mode) {
    container.appendChild(note(doc, `Mode ${view.overlayData.mode.index ?? view.selectedIndex}: T=${formatNumber(view.overlayData.mode.period)} s`));
  }
  if (view.kind === 'buckling') {
    container.appendChild(note(doc, `Critical load factor: ${formatNumber(view.overlayData?.criticalLoadFactor)}`));
  }
  if (view.kind === 'pushover') {
    container.appendChild(hingeStateSummary(doc, view.overlayData?.stateCounts || {}));
  }
  if (view.limitations?.length) {
    const limit = doc.createElement('div');
    limit.className = 'ss-ac-note ss-result-limit';
    limit.textContent = view.limitations.join(', ');
    container.appendChild(limit);
  }
}

function hingeStateSummary(doc, stateCounts) {
  const wrap = doc.createElement('div');
  wrap.className = 'ss-result-hinge-summary';
  for (const [state, count] of Object.entries(stateCounts)) {
    const item = doc.createElement('span');
    item.className = `ss-po-hinge-state state-${state}`;
    item.textContent = `${state}: ${count}`;
    wrap.appendChild(item);
  }
  return wrap;
}

function performanceLevel({ usageRatio = 0, state = 'elastic' } = {}) {
  if (state === 'ultimate' || usageRatio >= 1) return 'CP';
  if (state === 'yielded' || usageRatio >= 0.75) return 'LS';
  return 'IO';
}

function worstPerformanceLevel(levels = []) {
  const rank = { IO: 0, LS: 1, CP: 2 };
  return levels.reduce((worst, level) => (rank[level] > rank[worst] ? level : worst), 'IO');
}

function renderTimeHistorySvg(rows = []) {
  return buildTimeHistoryChart(rows, { id: 'ssNlthTimeHistorySvg' }).svg;
}

function tableRow(doc, cells, cellTag = 'td') {
  const tr = doc.createElement('tr');
  for (const value of cells) {
    const cell = doc.createElement(cellTag);
    cell.textContent = String(value ?? '-');
    tr.appendChild(cell);
  }
  return tr;
}

function sampleNlthRecord(record) {
  if (record === 'sample-b') return [0, 0.03, 0.09, -0.04, -0.08, 0.02, 0];
  if (record === 'custom') return [0, 0.05, -0.05, 0];
  return [0, 0.05, -0.05, 0.08, -0.04, 0];
}

function setCaseStatus(target, caseId, status) {
  const model = target?.SStructuresEngine?.getCurrentModel?.() || (typeof target?.model === 'function' ? target.model() : null);
  const item = (model?.analysisCases || []).find((row) => row.id === caseId);
  if (item) item.status = status;
}

function summarizeResult(result, item) {
  if (!result) return {
    caseId: item.id,
    kind: item.kind,
    status: item.status || 'not-run',
    summary: item.lastRun?.summary || null,
  };
  return {
    caseId: result.caseId,
    kind: result.kind,
    status: result.status,
    view: result.view,
    summary: result.summary,
    message: result.error?.message || result.message || null,
    qualification: result.qualification || null,
    designBlocked: result.designBlocked === true,
    designTransferAllowed: result.designTransferAllowed === true,
    runRecordId: result.runRecordId || null,
  };
}

function compactSettings(value) {
  const text = JSON.stringify(value || {});
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function combinationOptions(model = {}, includeAll = false) {
  const rows = (model.loadCombinations || []).map((item) => ({
    value: item.id,
    label: item.name ? `${item.id} · ${item.name}` : item.id,
  }));
  if (includeAll) rows.unshift({ value: '', label: '전체 조합' });
  if (!rows.length) rows.push({ value: '', label: '조합 없음' });
  return rows;
}

function massSourceOptions(model = {}) {
  const sources = [...(model.massSources || [])];
  const active = model.analysisSettings?.massSource;
  if (active?.id && !sources.some((item) => item.id === active.id)) sources.unshift(active);
  return [
    { value: '', label: '노드·부재 질량' },
    ...sources.map((item) => ({ value: item.id, label: item.name ? `${item.id} · ${item.name}` : item.id })),
  ];
}

function readMassSource(id, model = {}, previous = null) {
  const key = String(id || '').trim();
  if (!key) return null;
  const source = (model.massSources || []).find((item) => item.id === key)
    || (model.analysisSettings?.massSource?.id === key ? model.analysisSettings.massSource : null)
    || (previous?.id === key ? previous : null);
  return clonePlain(source);
}

function formatSpectrumPoints(points = []) {
  const rows = Array.isArray(points) && points.length
    ? points
    : [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }];
  return rows.map((point) => `${Number(point.period) || 0}:${Number(point.sa) || 0}`).join(', ');
}

function parseSpectrumPoints(value, fallback = []) {
  const rows = String(value || '')
    .split(/[;,\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [period, sa] = entry.split(/[:\s]+/).map(Number);
      return Number.isFinite(period) && Number.isFinite(sa) && period >= 0 ? { period, sa } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.period - b.period);
  return rows.length ? rows : clonePlain(fallback?.length ? fallback : [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }]);
}

function parseNumberSeries(value, fallback = []) {
  const rows = String(value || '')
    .split(/[,;\s]+/)
    .map(Number)
    .filter(Number.isFinite);
  return rows.length ? rows : clonePlain(fallback || []);
}

function analysisStatusLabel(status) {
  const labels = {
    'not-run': '미실행',
    running: '실행 중',
    ok: '완료',
    failed: '실패',
    stale: '재실행 필요',
    'review-required': '검토 필요',
    preliminary: '예비 결과',
    designBlocked: '설계전달 차단',
  };
  return labels[status] || status || '미실행';
}

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function positiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function optionalNumber(value, fallback = undefined) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function cleanOptionalString(value, fallback = null) {
  const text = String(value ?? '').trim();
  return text || fallback || null;
}

function currentModel(target) {
  return target?.SStructuresEngine?.getCurrentModel?.() || (typeof target?.model === 'function' ? target.model() : null);
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  if (Math.abs(number) >= 100) return number.toFixed(0);
  if (Math.abs(number) >= 10) return number.toFixed(1);
  return number.toFixed(3);
}

function maxAbs(values = []) {
  return values.length ? Math.max(0, ...values.map((value) => Math.abs(Number(value) || 0))) : 0;
}

function clearChildren(element) {
  while (element.children?.length) element.removeChild(element.children[0]);
  element.innerHTML = '';
}

function injectAnalysisCenterStyle(doc) {
  if (doc.getElementById?.('ssAnalysisCenterStyle')) return;
  const style = doc.createElement('style');
  style.id = 'ssAnalysisCenterStyle';
  style.setAttribute('id', 'ssAnalysisCenterStyle');
  style.textContent = `
    .ss-ac-toggle{margin-left:6px}
    .ss-analysis-center{position:fixed;right:12px;top:92px;bottom:12px;width:min(380px,calc(100vw - 32px));min-width:300px;min-height:240px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);z-index:35;overflow:auto;border:1px solid #cfdbe6;background:#f8fbfd;padding:10px 10px 18px;box-shadow:0 16px 34px rgba(15,36,54,.18);font:12px/1.4 Arial,sans-serif;color:#172635}
    .ss-analysis-center.is-closed{display:none}
    .ss-ac-header{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px;cursor:move}
    .ss-ac-header h2{font-size:14px;margin:0;color:#173b57}.ss-ac-caption{color:#65798a}
    .ss-ac-close{border:1px solid #cfdbe6;background:white;color:#294a62;border-radius:4px;padding:3px 7px}
    .ss-ac-toolbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0}.ss-ac-toolbar select{min-width:120px;flex:1 1 150px}.ss-ac-toolbar button{white-space:nowrap}
    .ss-ac-list{list-style:none;margin:0;padding:0;display:grid;gap:4px}
    .ss-ac-item{display:grid;grid-template-columns:minmax(0,1fr) 70px 44px;gap:6px;align-items:center;border:1px solid #dfe8f0;background:white;padding:5px}
    .ss-ac-item.active{border-color:#2f6f9f}.ss-ac-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .ss-ac-status{font-size:11px;text-align:center;border-radius:3px;background:#eef3f8;padding:2px 4px}
    .status-ok{background:#e8f6ee;color:#126b3c}.status-failed,.status-designBlocked{background:#fff0f0;color:#a32020}.status-stale,.status-review-required,.status-preliminary{background:#fff7df;color:#7a5400}.status-running{background:#e9f2ff;color:#1c5e9f}
    .ss-ac-settings,.ss-ac-result{min-width:0;margin-top:8px;border-top:1px solid #dfe8f0;padding-top:8px}.ss-ac-settings h3,.ss-ac-result h3{font-size:12px;margin:0 0 5px;color:#294a62}
    .ss-ac-table{width:100%;table-layout:fixed;border-collapse:collapse}.ss-ac-table th,.ss-ac-table td{border-bottom:1px solid #e6edf3;padding:4px;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}.ss-ac-table th{width:72px;color:#607384}
    .ss-ac-note{color:#607384;background:white;border:1px solid #e3ebf2;padding:6px}.ss-ac-log{white-space:pre-wrap;background:#fff7f7;border:1px solid #f0c8c8;padding:6px;margin:6px 0 0}
    .ss-po-settings,.ss-analysis-settings-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px;margin-top:8px}.ss-ac-field{display:grid;gap:2px}.ss-ac-field span{color:#607384}.ss-ac-field input,.ss-ac-field select,.ss-ac-field textarea{box-sizing:border-box;width:100%;min-width:0;border:1px solid #cfdbe6;border-radius:3px;background:#fff;color:#172635;padding:4px 5px;font:12px/1.3 Arial,sans-serif}.ss-ac-field textarea{resize:vertical}.ss-analysis-method-note{grid-column:1/-1}
    .ss-po-result{display:grid;gap:6px;margin-top:8px}.ss-po-curve{color:#2f6f9f;background:white;border:1px solid #e3ebf2;padding:5px}.ss-po-step-status{font-size:11px;color:#294a62}
    .ss-po-hinge-states{display:flex;flex-wrap:wrap;gap:4px}.ss-po-hinge-state{border:1px solid #dfe8f0;background:white;padding:2px 5px;border-radius:3px}.state-yielded{background:#fff7df;color:#7a5400}.state-ultimate{background:#fff0f0;color:#a32020}
    .ss-perf-point,.ss-nlth-result{display:grid;gap:6px;margin-top:8px}.ss-perf-level{display:inline-flex;align-items:center;justify-content:center;width:max-content;min-width:34px;border-radius:3px;padding:2px 6px;background:#e8f6ee;color:#126b3c;font-weight:bold}.level-ls{background:#fff7df;color:#7a5400}.level-cp{background:#fff0f0;color:#a32020}
    .ss-nlth-chart{color:#2f6f9f;background:white;border:1px solid #e3ebf2;padding:5px}
    .ss-result-switch{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;min-width:0;margin-top:8px;border-top:1px solid #dfe8f0;padding-top:8px}.ss-result-case-view{grid-column:1/-1;background:white;border:1px solid #e3ebf2;padding:6px}.ss-result-hinge-summary{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
    .ss-result-chart{color:#2f6f9f;background:white;border:1px solid #e3ebf2;padding:5px;margin-top:6px}
    .ss-ratio-legend{display:grid;gap:5px;background:white;border:1px solid #e3ebf2;padding:6px;margin-top:6px}.ss-ratio-title{font-weight:bold;color:#294a62}.ss-ratio-items{display:flex;gap:5px;flex-wrap:wrap}.ss-ratio-chip{border:1px solid #dfe8f0;border-radius:3px;padding:2px 5px}.ratio-ok{background:#e8f6ee;color:#126b3c}.ratio-warning{background:#fff7df;color:#7a5400}.ratio-ng{background:#fff0f0;color:#a32020}
  `;
  (doc.head || doc.documentElement || doc.body)?.appendChild?.(style);
}
