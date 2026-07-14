import { installFloatingPanel } from './floatingPanel.js';

export const NONLINEAR_RESULT_POPUP_VERSION = 'p8-m10-nonlinear-result-popup-v1';

const PANEL_STORAGE_KEY = 's-structures:nonlinear-result-popup:p8-m10';
const MANUAL_SIZE_STORAGE_KEY = 's-structures:nonlinear-result-popup:user-sized';
const TABS = Object.freeze([
  Object.freeze({ id: 'overview', label: '요약' }),
  Object.freeze({ id: 'response', label: '응답곡선' }),
  Object.freeze({ id: 'spatial', label: '층·부재·힌지' }),
  Object.freeze({ id: 'convergence', label: '수렴' }),
  Object.freeze({ id: 'record', label: '실행기록' }),
]);
const HISTORY_PATHS = Object.freeze([
  Object.freeze({ value: 'q[0]', label: '일반화 변위 q[0]' }),
  Object.freeze({ value: 'baseReactionForce[0]', label: '밑면반력 X' }),
  Object.freeze({ value: 'baseReactionForce[1]', label: '밑면반력 Y' }),
  Object.freeze({ value: 'energies.input', label: '입력 에너지' }),
  Object.freeze({ value: 'energies.kinetic', label: '운동 에너지' }),
  Object.freeze({ value: 'energies.strain', label: '변형 에너지' }),
  Object.freeze({ value: 'energies.damping', label: '감쇠 에너지' }),
]);

export function installNonlinearResultPopup(target = globalThis, options = {}) {
  const doc = target?.document;
  const bridge = options.bridge || target?.SStructuresEngine;
  if (!doc?.createElement || !bridge?.getNonlinearRunStatus) return null;
  if (target.SStructuresNonlinearResultPopup) return target.SStructuresNonlinearResultPopup;

  injectStyles(doc);
  const host = doc.getElementById?.(options.hostId || 'canvasWrap') || doc.getElementById?.('main') || doc.body;
  const root = ensureRoot(doc, host);
  const selectionStore = options.resultSelectionStore
    || bridge.getResultSelectionStore?.()
    || target.SStructuresResultSelection;
  const selection = selectionStore?.getState?.() || {};
  const state = {
    open: false,
    jobId: null,
    tab: 'overview',
    step: Math.max(0, Math.trunc(Number(selection.modeOrStep) || 0)),
    historyPath: normalizeInitialHistoryPath(selection.response),
    historyPage: 1,
    historyPageSize: 80,
    maxChartPoints: 700,
    selectedEntity: selection.selectedEntity || null,
    userSized: readUserSized(target),
    latestJob: null,
    latestSlice: null,
  };

  const api = {
    version: NONLINEAR_RESULT_POPUP_VERSION,
    root,
    state,
    open(input = {}) {
      if (typeof input === 'string') input = { jobId: input };
      if (input.jobId) state.jobId = String(input.jobId);
      if (input.tab) state.tab = normalizeTab(input.tab);
      if (input.step != null) state.step = positiveInteger(input.step, 0);
      state.open = true;
      render(target, bridge, selectionStore, state, root, api);
      target.SStructuresFloatingPanels?.recordVisibility?.('nonlinear-results', true);
      return api.getState();
    },
    openJob(jobId, input = {}) {
      return api.open({ ...input, jobId });
    },
    close() {
      state.open = false;
      render(target, bridge, selectionStore, state, root, api);
      target.SStructuresFloatingPanels?.recordVisibility?.('nonlinear-results', false);
      return api.getState();
    },
    toggle(input = {}) {
      return state.open ? api.close() : api.open(input);
    },
    refresh() {
      render(target, bridge, selectionStore, state, root, api);
      return api.getState();
    },
    setTab(tab) {
      state.tab = normalizeTab(tab);
      render(target, bridge, selectionStore, state, root, api);
      return api.getState();
    },
    setStep(step) {
      state.step = positiveInteger(step, 0);
      selectionStore?.set?.({ modeOrStep: state.step }, 'nonlinear-result-popup');
      render(target, bridge, selectionStore, state, root, api);
      return api.getState();
    },
    setHistoryPath(path) {
      state.historyPath = String(path || 'q[0]');
      state.historyPage = 1;
      selectionStore?.set?.({ response: state.historyPath }, 'nonlinear-result-popup');
      render(target, bridge, selectionStore, state, root, api);
      return api.getState();
    },
    setHistoryPage(page) {
      state.historyPage = Math.max(1, positiveInteger(page, 1));
      render(target, bridge, selectionStore, state, root, api);
      return api.getState();
    },
    selectEntity(type, id) {
      const entity = type && id ? { type: String(type), id: String(id) } : null;
      state.selectedEntity = entity;
      selectionStore?.selectEntity?.(entity?.type, entity?.id, 'nonlinear-result-popup');
      target.draw?.();
      render(target, bridge, selectionStore, state, root, api);
      return api.getState();
    },
    exportRaw(format = 'csv', input = {}) {
      if (!state.jobId) return null;
      const artifact = bridge.exportNonlinearHistory(state.jobId, {
        format,
        path: state.historyPath,
      });
      if (input.download !== false) downloadArtifact(target, artifact);
      return artifact;
    },
    resetSize() {
      state.userSized = false;
      writeUserSized(target, false);
      root.__SStructuresFloatingPanel?.reset?.();
      applyAdaptiveSize(target, root, state);
      root.__SStructuresFloatingPanel?.clamp?.();
      return api.getState();
    },
    getState() {
      return {
        version: NONLINEAR_RESULT_POPUP_VERSION,
        open: state.open,
        jobId: state.jobId,
        tab: state.tab,
        kind: state.latestJob?.mode || null,
        status: state.latestJob?.status || null,
        step: state.step,
        historyPath: state.historyPath,
        selectedEntity: clone(state.selectedEntity),
        stale: state.latestJob?.stale === true,
        designBlocked: state.latestJob?.designBlocked !== false,
      };
    },
  };

  target.SStructuresNonlinearResultPopup = api;
  api.unsubscribeSelection = selectionStore?.subscribe?.((next, _previous, source) => {
    if (source === 'nonlinear-result-popup') return;
    state.selectedEntity = next.selectedEntity || null;
    if (next.modeOrStep != null) state.step = positiveInteger(next.modeOrStep, state.step);
    if (state.open) queueRender(target, () => render(target, bridge, selectionStore, state, root, api), state);
  });
  const service = bridge.getNonlinearProductService?.();
  api.unsubscribeJobs = service?.subscribe?.((job, event) => {
    if (job.id !== state.jobId) return;
    state.latestJob = job;
    if (event === 'completed') state.open = true;
    if (state.open) queueRender(target, () => render(target, bridge, selectionStore, state, root, api), state);
  });
  render(target, bridge, selectionStore, state, root, api);
  return api;
}

function render(target, bridge, selectionStore, state, root, api) {
  clear(root);
  root.style.display = state.open ? 'flex' : 'none';
  root.classList?.toggle?.('is-open', state.open);
  root.setAttribute?.('aria-hidden', state.open ? 'false' : 'true');
  if (!state.jobId) state.jobId = latestCompletedJobId(bridge);
  state.latestJob = safeCall(() => bridge.getNonlinearRunStatus(state.jobId), null);
  const job = state.latestJob;
  if (job?.resultAvailable) syncSelection(selectionStore, job, state);
  root.setAttribute?.('data-kind', job?.mode || 'none');
  root.setAttribute?.('data-tab', state.tab);
  root.appendChild(renderHeader(root.ownerDocument, job, api));
  root.appendChild(renderTabs(root.ownerDocument, state, api));
  const body = root.ownerDocument.createElement('div');
  body.className = 'ss-nl-result-body';
  if (!job) body.appendChild(emptyState(root.ownerDocument, '완료된 Production 비선형해석 실행이 없습니다.'));
  else if (!job.resultAvailable) body.appendChild(renderUnavailable(root.ownerDocument, bridge, job));
  else body.appendChild(renderTab(root.ownerDocument, target, bridge, selectionStore, state, job, api));
  root.appendChild(body);
  root.appendChild(renderFooter(root.ownerDocument, job, state, api));
  applyAdaptiveSize(target, root, state);
  const floating = installFloatingPanel(target, root, {
    allowPanelHandle: false,
    boundsElement: root.parentNode?.id === 'canvasWrap' ? root.parentNode : null,
    defaultWidth: 570,
    defaultHeight: 690,
    minWidth: 390,
    minHeight: 360,
    maxWidth: 980,
    maxHeight: 980,
    handleSelector: '.ss-nl-result-header',
    position: root.parentNode?.id === 'canvasWrap' ? 'absolute' : 'fixed',
    storageKey: PANEL_STORAGE_KEY,
    snapThreshold: 18,
    viewportPadding: 10,
    suspendClamp: (runtime) => Number(runtime?.innerWidth) <= 760,
  });
  const handle = root.querySelector?.('[data-ss-floating-resize]');
  if (handle?.getAttribute?.('data-ss-nl-size-bound') !== '1') {
    handle.setAttribute?.('data-ss-nl-size-bound', '1');
    handle.addEventListener?.('pointerdown', () => {
      state.userSized = true;
      writeUserSized(target, true);
    });
  }
  if (state.open) floating?.clamp?.();
}

function renderHeader(doc, job, api) {
  const header = doc.createElement('header');
  header.className = 'ss-nl-result-header';
  header.setAttribute('data-ss-floating-handle', '1');
  const title = doc.createElement('div');
  const h2 = doc.createElement('h2');
  h2.textContent = job?.mode === 'nlth' ? '비선형 시간이력 결과' : 'Pushover 결과';
  title.appendChild(h2);
  const meta = doc.createElement('span');
  meta.textContent = job ? `${job.caseId} · ${job.id}` : 'Production 비선형해석';
  title.appendChild(meta);
  header.appendChild(title);
  const actions = doc.createElement('div');
  actions.className = 'ss-nl-result-head-actions';
  actions.appendChild(iconButton(doc, 'ssNlResultResetSize', '↙', '결과창 크기 초기화', () => api.resetSize()));
  actions.appendChild(iconButton(doc, 'ssNlResultClose', '×', '비선형 결과 닫기', () => api.close()));
  header.appendChild(actions);
  return header;
}

function renderTabs(doc, state, api) {
  const nav = doc.createElement('nav');
  nav.className = 'ss-nl-result-tabs';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', '비선형 결과 보기');
  for (const tab of TABS) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.id = `ssNlResultTab-${tab.id}`;
    button.setAttribute('id', button.id);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', state.tab === tab.id ? 'true' : 'false');
    button.className = state.tab === tab.id ? 'active' : '';
    button.textContent = tab.label;
    button.addEventListener?.('click', () => api.setTab(tab.id));
    nav.appendChild(button);
  }
  return nav;
}

function renderTab(doc, target, bridge, selectionStore, state, job, api) {
  if (state.tab === 'response') return renderResponse(doc, bridge, state, job, api);
  if (state.tab === 'spatial') return renderSpatial(doc, bridge, state, job, api);
  if (state.tab === 'convergence') return renderConvergence(doc, bridge, state, job);
  if (state.tab === 'record') return renderRecord(doc, bridge, state, job, api);
  return renderOverview(doc, target, bridge, selectionStore, state, job, api);
}

function renderOverview(doc, target, bridge, selectionStore, state, job, api) {
  const section = band(doc, 'ssNlResultOverview');
  const overview = resultSlice(bridge, job.id, { slice: 'overview' });
  state.latestSlice = overview;
  section.appendChild(metricGrid(doc, [
    ['상태', statusLabel(job.status)],
    ['검증등급', overview.data?.qualification || job.qualification || '-'],
    ['설계전달', job.designBlocked ? '차단' : '허용'],
    ['모델 상태', job.stale ? 'stale' : '현재'],
  ]));
  if (job.stale) section.appendChild(note(doc, '현재 모델이 실행 시점과 달라졌습니다. 이 결과는 이력 열람용이며 설계값으로 전달되지 않습니다.', 'warning'));
  if (job.designBlocked) section.appendChild(note(doc, `설계전달 차단: ${overview.data?.designBlockReason || '독립 검증 및 승인 미완료'}`, 'warning'));
  const summary = overview.data?.summary || job.resultSummary || {};
  section.appendChild(keyValueTable(doc, '해석 요약', flattenSummary(summary)));
  if (overview.data?.termination) section.appendChild(keyValueTable(doc, '종료 조건', flattenSummary(overview.data.termination)));
  const warnings = overview.data?.warnings || [];
  if (warnings.length) section.appendChild(stringList(doc, '경고', warnings));
  const actions = doc.createElement('div');
  actions.className = 'ss-nl-result-actions';
  actions.appendChild(actionButton(doc, 'ssNlResultOpenSetup', '설정으로 돌아가기', () => target.SStructuresNonlinearWorkflow?.open?.({ mode: job.mode, step: 5 })));
  actions.appendChild(actionButton(doc, 'ssNlResultPrimaryChart', job.mode === 'nlth' ? '시간이력 보기' : '용량곡선 보기', () => api.setTab('response'), 'primary'));
  section.appendChild(actions);
  return section;
}

function renderResponse(doc, bridge, state, job, api) {
  const section = band(doc, 'ssNlResultResponse');
  if (job.mode === 'nlth') {
    const controls = doc.createElement('div');
    controls.className = 'ss-nl-result-controls';
    controls.appendChild(selectControl(doc, 'ssNlHistoryPath', '응답', HISTORY_PATHS, state.historyPath, (value) => api.setHistoryPath(value)));
    const csv = actionButton(doc, 'ssNlHistoryCsv', 'CSV', () => api.exportRaw('csv'), 'compact');
    csv.title = '다운샘플링하지 않은 원시 이력 CSV';
    controls.appendChild(csv);
    const json = actionButton(doc, 'ssNlHistoryJson', 'JSON', () => api.exportRaw('json'), 'compact');
    json.title = '다운샘플링하지 않은 원시 이력 JSON';
    controls.appendChild(json);
    section.appendChild(controls);
    const history = resultSlice(bridge, job.id, {
      slice: 'history', path: state.historyPath, maxPoints: state.maxChartPoints,
      page: 1, pageSize: 5000,
    });
    const historyPage = resultSlice(bridge, job.id, {
      slice: 'history', path: state.historyPath, maxPoints: state.maxChartPoints,
      page: state.historyPage, pageSize: state.historyPageSize,
    });
    state.latestSlice = history;
    section.appendChild(chartFigure(doc, {
      id: 'ssNlTimeHistoryChart',
      title: `${historyPathLabel(state.historyPath)} 시간이력`,
      xLabel: '시간 (s)',
      yLabel: historyPathLabel(state.historyPath),
      points: history.data?.rows || [],
      xKey: 'x',
      yKey: 'y',
      tone: '#007b72',
    }));
    section.appendChild(metricGrid(doc, [
      ['원시 행', history.data?.rawRowCount || 0],
      ['표시 점', history.data?.plottedPointCount || 0],
      ['최솟값', formatPoint(history.data?.extrema?.minimum)],
      ['최댓값', formatPoint(history.data?.extrema?.maximum)],
    ]));
    if (history.data?.downsampled) section.appendChild(note(doc, '차트만 결정론적 min/max bucket으로 축약했습니다. CSV/JSON 내보내기는 원시 이력을 보존합니다.', 'info'));
    section.appendChild(historyTable(doc, historyPage.data, state, api));
    return section;
  }

  const curve = resultSlice(bridge, job.id, { slice: 'capacity', step: state.step });
  state.latestSlice = curve;
  const points = curve.data?.points || [];
  state.step = Math.max(0, Math.min(state.step, Math.max(0, points.length - 1)));
  section.appendChild(chartFigure(doc, {
    id: 'ssNlCapacityCurve',
    title: '밑면전단력-제어변위 용량곡선',
    xLabel: '제어변위 (m)',
    yLabel: '밑면전단력',
    points,
    xKey: 'controlDisplacement',
    yKey: 'baseShear',
    selectedIndex: state.step,
    tone: '#00618f',
  }));
  if (points.length) section.appendChild(stepScrubber(doc, points, state.step, api));
  const selected = points[state.step] || curve.data?.selected;
  section.appendChild(metricGrid(doc, [
    ['Step', selected?.step ?? '-'],
    ['제어변위', formatNumber(selected?.controlDisplacement)],
    ['밑면전단력', formatNumber(selected?.baseShear)],
    ['항복 힌지', selected?.yieldedHingeCount ?? 0],
  ]));
  return section;
}

function renderSpatial(doc, bridge, state, job, api) {
  const section = band(doc, 'ssNlResultSpatial');
  const query = { step: state.step };
  const story = resultSlice(bridge, job.id, { slice: 'story', ...query, storyId: selectedId(state, 'story') });
  const member = resultSlice(bridge, job.id, { slice: 'member', ...query, memberId: selectedId(state, 'member') });
  const node = resultSlice(bridge, job.id, { slice: 'node', ...query, nodeId: selectedId(state, 'node') });
  const hinge = resultSlice(bridge, job.id, { slice: 'hinge', ...query, hingeId: selectedId(state, 'hinge') });
  const selector = doc.createElement('div');
  selector.className = 'ss-nl-result-selector';
  selector.appendChild(entityTable(doc, '층 응답', 'story', story.data?.rows || [], state, api));
  selector.appendChild(entityTable(doc, '부재 응답', 'member', member.data?.rows || [], state, api));
  selector.appendChild(entityTable(doc, '절점 응답', 'node', node.data?.rows || [], state, api));
  section.appendChild(selector);
  section.appendChild(hingeSummary(doc, hinge.data, state, api));
  const selected = state.selectedEntity;
  if (selected) section.appendChild(note(doc, `${entityLabel(selected.type)} ${selected.id} 선택이 모델링 뷰와 양방향 동기화됩니다.`, 'ok'));
  return section;
}

function renderConvergence(doc, bridge, state, job) {
  const section = band(doc, 'ssNlResultConvergence');
  const convergence = resultSlice(bridge, job.id, { slice: 'convergence', step: state.step });
  state.latestSlice = convergence;
  const selected = convergence.data?.selected;
  if (!convergence.data?.available) {
    section.appendChild(emptyState(doc, '이 실행 결과에 저장된 수렴 이력이 없습니다.'));
    return section;
  }
  section.appendChild(keyValueTable(doc, '선택 스텝 수렴', flattenSummary(selected || {})));
  const rows = convergence.data?.rows || [];
  section.appendChild(objectTable(doc, '시간스텝 수렴 이력', rows, 120));
  const rejected = convergence.data?.rejectedSteps || [];
  if (rejected.length) section.appendChild(objectTable(doc, '거부·분할 스텝', rejected, 120));
  return section;
}

function renderRecord(doc, bridge, state, job, api) {
  const section = band(doc, 'ssNlResultRecord');
  const record = resultSlice(bridge, job.id, { slice: 'record' });
  state.latestSlice = record;
  section.appendChild(metricGrid(doc, [
    ['설정 해시', shortHash(record.data?.settingsHash || job.settingsHash)],
    ['모델 해시', shortHash(job.modelHash)],
    ['실행 모드', job.runtime?.mode || '-'],
    ['Backend', job.runtime?.backend || '-'],
  ]));
  section.appendChild(keyValueTable(doc, '입력 설정', flattenSummary(record.data?.settings || {})));
  section.appendChild(keyValueTable(doc, '라우팅·출처', flattenSummary({
    ...(record.data?.routing || {}),
    runRecordId: record.data?.runRecordId,
    predecessorJobId: job.predecessorJobId,
    resumePolicy: job.resumePolicy,
  })));
  const runs = safeCall(() => bridge.listNonlinearRuns({ caseId: job.caseId }), []);
  section.appendChild(runTable(doc, runs, state, api));
  const graph = safeCall(() => bridge.getNonlinearRunGraph({ caseId: job.caseId }), null);
  if (graph?.edges?.length) section.appendChild(objectTable(doc, '재시작·재실행 계보', graph.edges, 80));
  return section;
}

function renderUnavailable(doc, bridge, job) {
  const section = band(doc, 'ssNlResultUnavailable');
  section.appendChild(note(doc, `${statusLabel(job.status)} · ${job.progressMessage || '결과가 아직 생성되지 않았습니다.'}`, job.status === 'failed' || job.status === 'blocked' ? 'error' : 'info'));
  if (job.status === 'failed' || job.status === 'blocked') {
    const explanation = safeCall(() => bridge.explainNonlinearFailure(job.id), null);
    if (explanation) {
      section.appendChild(keyValueTable(doc, explanation.title, [
        ['코드', explanation.code],
        ['단계', explanation.failedStage],
        ['재시도', explanation.retryable ? '가능' : '입력 수정 후 가능'],
        ['설명', explanation.message],
      ]));
    }
  }
  return section;
}

function renderFooter(doc, job, state, api) {
  const footer = doc.createElement('footer');
  footer.className = 'ss-nl-result-footer';
  const left = doc.createElement('span');
  left.textContent = job ? `${statusLabel(job.status)} · ${job.qualification || '-'}` : '결과 없음';
  footer.appendChild(left);
  const center = doc.createElement('span');
  center.textContent = state.userSized ? '사용자 크기' : '내용 맞춤';
  footer.appendChild(center);
  const right = doc.createElement('span');
  right.className = job?.stale ? 'tone-warning' : '';
  right.textContent = job?.stale ? 'STALE' : job?.designBlocked ? '설계전달 차단' : '현재 결과';
  footer.appendChild(right);
  return footer;
}

function chartFigure(doc, input) {
  const figure = doc.createElement('figure');
  figure.className = 'ss-nl-result-chart';
  figure.id = input.id;
  figure.setAttribute('id', figure.id);
  figure.setAttribute('data-agent-id', input.id);
  const heading = doc.createElement('figcaption');
  heading.textContent = input.title;
  figure.appendChild(heading);
  const chart = doc.createElement('div');
  chart.className = 'ss-nl-result-svg';
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', input.title);
  chart.innerHTML = buildLineChartSvg(input);
  figure.appendChild(chart);
  return figure;
}

function buildLineChartSvg(input = {}) {
  const rows = (input.points || []).map((row, index) => ({
    index,
    x: finite(row?.[input.xKey], null),
    y: finite(row?.[input.yKey], null),
  })).filter((row) => row.x != null && row.y != null);
  const width = 640;
  const height = 260;
  const margin = { left: 62, right: 18, top: 16, bottom: 43 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  if (!rows.length) return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#708594" font-size="13">표시할 결과가 없습니다.</text></svg>`;
  const xValues = rows.map((row) => row.x);
  const yValues = rows.map((row) => row.y);
  const xRange = paddedRange(Math.min(...xValues), Math.max(...xValues));
  const yRange = paddedRange(Math.min(...yValues), Math.max(...yValues));
  const x = (value) => margin.left + ((value - xRange.min) / (xRange.max - xRange.min)) * plotWidth;
  const y = (value) => margin.top + plotHeight - ((value - yRange.min) / (yRange.max - yRange.min)) * plotHeight;
  const path = rows.map((row, index) => `${index ? 'L' : 'M'}${x(row.x).toFixed(2)},${y(row.y).toFixed(2)}`).join(' ');
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const gy = margin.top + plotHeight * ratio;
    const value = yRange.max - (yRange.max - yRange.min) * ratio;
    return `<line x1="${margin.left}" y1="${gy}" x2="${width - margin.right}" y2="${gy}" stroke="#dfe8ed"/><text x="${margin.left - 7}" y="${gy + 4}" text-anchor="end" fill="#667d8c" font-size="10">${escapeXml(formatNumber(value))}</text>`;
  }).join('');
  const selected = rows.find((row) => row.index === input.selectedIndex);
  const marker = selected ? `<line x1="${x(selected.x)}" y1="${margin.top}" x2="${x(selected.x)}" y2="${margin.top + plotHeight}" stroke="#d58b16" stroke-dasharray="4 4"/><circle cx="${x(selected.x)}" cy="${y(selected.y)}" r="5" fill="#d58b16" stroke="#fff" stroke-width="2"/>` : '';
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    <rect x="0" y="0" width="${width}" height="${height}" fill="#fff"/>
    ${grid}
    <line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" stroke="#78909e"/>
    <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="#78909e"/>
    <path d="${path}" fill="none" stroke="${escapeXml(input.tone || '#00618f')}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
    ${marker}
    <text x="${margin.left}" y="${height - 22}" fill="#667d8c" font-size="10">${escapeXml(formatNumber(xRange.min))}</text>
    <text x="${width - margin.right}" y="${height - 22}" text-anchor="end" fill="#667d8c" font-size="10">${escapeXml(formatNumber(xRange.max))}</text>
    <text x="${width / 2}" y="${height - 5}" text-anchor="middle" fill="#405b6d" font-size="11">${escapeXml(input.xLabel || '')}</text>
    <text x="14" y="${height / 2}" text-anchor="middle" fill="#405b6d" font-size="11" transform="rotate(-90 14 ${height / 2})">${escapeXml(input.yLabel || '')}</text>
  </svg>`;
}

function stepScrubber(doc, points, selectedIndex, api) {
  const wrap = doc.createElement('div');
  wrap.className = 'ss-nl-step-scrubber';
  const label = doc.createElement('label');
  label.setAttribute('for', 'ssNlResultStep');
  label.textContent = `Step ${selectedIndex + 1} / ${points.length}`;
  wrap.appendChild(label);
  const input = doc.createElement('input');
  input.id = 'ssNlResultStep';
  input.setAttribute('id', input.id);
  input.type = 'range';
  input.min = '0';
  input.max = String(Math.max(0, points.length - 1));
  input.step = '1';
  input.value = String(selectedIndex);
  input.addEventListener?.('input', () => api.setStep(input.value));
  wrap.appendChild(input);
  return wrap;
}

function historyTable(doc, data = {}, state, api) {
  const wrap = doc.createElement('section');
  wrap.className = 'ss-nl-result-table-section';
  const heading = doc.createElement('div');
  heading.className = 'ss-nl-result-table-heading';
  const title = doc.createElement('h3');
  title.textContent = `차트 점 ${data.totalRows || 0}개`;
  heading.appendChild(title);
  const pager = doc.createElement('div');
  const previous = actionButton(doc, 'ssNlHistoryPrevious', '‹', () => api.setHistoryPage((data.page || 1) - 1), 'icon-small');
  previous.disabled = !data.hasPrevious;
  pager.appendChild(previous);
  const page = doc.createElement('span');
  page.textContent = `${data.page || 1} / ${data.pageCount || 1}`;
  pager.appendChild(page);
  const next = actionButton(doc, 'ssNlHistoryNext', '›', () => api.setHistoryPage((data.page || 1) + 1), 'icon-small');
  next.disabled = !data.hasNext;
  pager.appendChild(next);
  heading.appendChild(pager);
  wrap.appendChild(heading);
  wrap.appendChild(simpleTable(doc, ['Index', '시간', historyPathLabel(state.historyPath)], (data.rows || []).map((row) => [row.index, formatNumber(row.x), formatNumber(row.y)])));
  return wrap;
}

function entityTable(doc, title, type, rows, state, api) {
  const section = doc.createElement('section');
  section.className = 'ss-nl-entity-section';
  const h3 = doc.createElement('h3');
  h3.textContent = `${title} (${rows.length})`;
  section.appendChild(h3);
  if (!rows.length) {
    const empty = doc.createElement('p');
    empty.textContent = '저장된 결과 없음';
    section.appendChild(empty);
    return section;
  }
  const list = doc.createElement('div');
  list.className = 'ss-nl-entity-list';
  for (const row of rows.slice(0, 160)) {
    const id = String(row.id || row[`${type}Id`] || row.memberId || row.nodeId || row.storyId || '');
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = state.selectedEntity?.type === type && state.selectedEntity?.id === id ? 'active' : '';
    button.textContent = `${id || '-'} · ${compactRowSummary(row)}`;
    button.addEventListener?.('click', () => api.selectEntity(type, id));
    list.appendChild(button);
  }
  section.appendChild(list);
  return section;
}

function hingeSummary(doc, data = {}, state, api) {
  const section = doc.createElement('section');
  section.className = 'ss-nl-hinge-section';
  const h3 = doc.createElement('h3');
  h3.textContent = '소성힌지 상태';
  section.appendChild(h3);
  const counts = Object.entries(data.stateCounts || {});
  section.appendChild(metricGrid(doc, counts.length ? counts.slice(0, 6) : [['저장된 힌지', data.rows?.length || 0]]));
  if (data.rows?.length) {
    const list = doc.createElement('div');
    list.className = 'ss-nl-hinge-list';
    for (const row of data.rows.slice(0, 200)) {
      const id = String(row.id || row.hingeId || `${row.memberId || ''}-${row.end || ''}-${row.axis || ''}`);
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = state.selectedEntity?.type === 'hinge' && state.selectedEntity?.id === id ? 'active' : '';
      button.textContent = `${id} · ${row.state || row.branch || 'unknown'}`;
      button.addEventListener?.('click', () => api.selectEntity('hinge', id));
      list.appendChild(button);
    }
    section.appendChild(list);
  }
  return section;
}

function runTable(doc, runs, state, api) {
  const section = doc.createElement('section');
  section.className = 'ss-nl-result-table-section';
  const h3 = doc.createElement('h3');
  h3.textContent = `동일 케이스 실행 이력 (${runs.length})`;
  section.appendChild(h3);
  const table = doc.createElement('table');
  const head = doc.createElement('thead');
  const headRow = doc.createElement('tr');
  for (const label of ['실행', '상태', '완료', '현재']) {
    const th = doc.createElement('th'); th.textContent = label; headRow.appendChild(th);
  }
  head.appendChild(headRow); table.appendChild(head);
  const body = doc.createElement('tbody');
  for (const run of runs.slice(-40).reverse()) {
    const tr = doc.createElement('tr');
    tr.className = run.id === state.jobId ? 'active' : '';
    const idCell = doc.createElement('td');
    const button = doc.createElement('button');
    button.type = 'button'; button.textContent = run.id;
    button.addEventListener?.('click', () => api.openJob(run.id, { tab: 'record' }));
    idCell.appendChild(button); tr.appendChild(idCell);
    for (const value of [run.stale ? 'stale' : run.status, run.completedAt || '-', run.current ? '현재' : '이력']) {
      const td = doc.createElement('td'); td.textContent = String(value); tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  table.appendChild(body); section.appendChild(table);
  return section;
}

function keyValueTable(doc, title, rows) {
  const section = doc.createElement('section');
  section.className = 'ss-nl-result-kv';
  const h3 = doc.createElement('h3'); h3.textContent = title; section.appendChild(h3);
  const dl = doc.createElement('dl');
  for (const [key, value] of rows || []) {
    const dt = doc.createElement('dt'); dt.textContent = String(key); dl.appendChild(dt);
    const dd = doc.createElement('dd'); dd.textContent = value == null || value === '' ? '-' : String(value); dl.appendChild(dd);
  }
  section.appendChild(dl);
  return section;
}

function objectTable(doc, title, rows, limit) {
  const values = Array.isArray(rows) ? rows : [];
  const keys = [...new Set(values.flatMap((row) => Object.keys(row || {})))].slice(0, 8);
  const section = doc.createElement('section');
  section.className = 'ss-nl-result-table-section';
  const h3 = doc.createElement('h3'); h3.textContent = `${title} (${values.length})`; section.appendChild(h3);
  if (!values.length || !keys.length) {
    section.appendChild(emptyState(doc, '저장된 항목이 없습니다.'));
    return section;
  }
  section.appendChild(simpleTable(doc, keys, values.slice(0, limit).map((row) => keys.map((key) => compactValue(row[key])))));
  return section;
}

function simpleTable(doc, headers, rows) {
  const scroll = doc.createElement('div');
  scroll.className = 'ss-nl-result-table-scroll';
  const table = doc.createElement('table');
  const head = doc.createElement('thead');
  const tr = doc.createElement('tr');
  for (const value of headers) { const th = doc.createElement('th'); th.textContent = String(value); tr.appendChild(th); }
  head.appendChild(tr); table.appendChild(head);
  const body = doc.createElement('tbody');
  for (const row of rows) {
    const item = doc.createElement('tr');
    for (const value of row) { const td = doc.createElement('td'); td.textContent = value == null ? '-' : String(value); item.appendChild(td); }
    body.appendChild(item);
  }
  table.appendChild(body); scroll.appendChild(table);
  return scroll;
}

function stringList(doc, title, rows) {
  const section = doc.createElement('section'); section.className = 'ss-nl-result-list';
  const h3 = doc.createElement('h3'); h3.textContent = `${title} (${rows.length})`; section.appendChild(h3);
  const ul = doc.createElement('ul');
  for (const row of rows.slice(0, 120)) { const li = doc.createElement('li'); li.textContent = typeof row === 'string' ? row : compactValue(row); ul.appendChild(li); }
  section.appendChild(ul); return section;
}

function metricGrid(doc, rows) {
  const grid = doc.createElement('div'); grid.className = 'ss-nl-result-metrics';
  for (const [label, value] of rows) {
    const item = doc.createElement('div');
    const span = doc.createElement('span'); span.textContent = String(label); item.appendChild(span);
    const strong = doc.createElement('strong'); strong.textContent = value == null || value === '' ? '-' : String(value); item.appendChild(strong);
    grid.appendChild(item);
  }
  return grid;
}

function selectControl(doc, id, label, options, selected, handler) {
  const wrap = doc.createElement('label'); wrap.className = 'ss-nl-result-field';
  const span = doc.createElement('span'); span.textContent = label; wrap.appendChild(span);
  const select = doc.createElement('select'); select.id = id; select.setAttribute('id', id);
  for (const row of options) { const option = doc.createElement('option'); option.value = row.value; option.textContent = row.label; select.appendChild(option); }
  select.value = selected;
  select.addEventListener?.('change', () => handler(select.value));
  wrap.appendChild(select); return wrap;
}

function band(doc, id) {
  const section = doc.createElement('section'); section.className = 'ss-nl-result-band';
  if (id) { section.id = id; section.setAttribute('id', id); }
  return section;
}

function note(doc, text, tone = 'info') {
  const element = doc.createElement('p'); element.className = `ss-nl-result-note tone-${tone}`; element.textContent = String(text || ''); return element;
}

function emptyState(doc, text) {
  const element = doc.createElement('div'); element.className = 'ss-nl-result-empty'; element.textContent = text; return element;
}

function actionButton(doc, id, text, handler, tone = '') {
  const button = doc.createElement('button'); button.type = 'button';
  if (id) { button.id = id; button.setAttribute('id', id); }
  button.className = `ss-nl-result-button${tone ? ` tone-${tone}` : ''}`;
  button.textContent = text; button.addEventListener?.('click', handler); return button;
}

function iconButton(doc, id, symbol, label, handler) {
  const button = actionButton(doc, id, symbol, handler, 'icon');
  button.setAttribute('aria-label', label); button.setAttribute('title', label); return button;
}

function ensureRoot(doc, host) {
  let root = doc.getElementById?.('ssNonlinearResultPopup');
  if (root) return root;
  root = doc.createElement('section');
  root.id = 'ssNonlinearResultPopup'; root.setAttribute('id', root.id);
  root.className = 'ss-nl-result-popup';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Production 비선형해석 결과');
  root.setAttribute('data-agent-id', 'nonlinear-production-results');
  host.appendChild(root);
  return root;
}

function injectStyles(doc) {
  if (doc.getElementById?.('ssNonlinearResultPopupStyles')) return;
  const style = doc.createElement('style');
  style.id = 'ssNonlinearResultPopupStyles'; style.setAttribute('id', style.id);
  style.textContent = `
    .ss-nl-result-popup{position:absolute;right:12px;top:12px;z-index:47;display:none;flex-direction:column;min-width:390px;min-height:360px;max-width:calc(100% - 20px);max-height:calc(100% - 20px);overflow:hidden;border:1px solid #afc0cc;border-radius:7px;background:#fff;box-shadow:0 14px 38px rgba(22,45,63,.2);color:#263f50;font:12px/1.42 "Segoe UI","Malgun Gothic",Arial,sans-serif}.ss-nl-result-popup.is-open{display:flex}.ss-nl-result-popup *{box-sizing:border-box;letter-spacing:0}
    .ss-nl-result-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;min-height:52px;padding:9px 9px 8px 13px;border-bottom:1px solid #cbd9e2;background:#f5f9fb;flex:none}.ss-nl-result-header h2{margin:0;color:#034f77;font-size:15px;line-height:1.3}.ss-nl-result-header span{display:block;max-width:430px;margin-top:2px;overflow:hidden;color:#647b8a;font-size:10.5px;text-overflow:ellipsis;white-space:nowrap}.ss-nl-result-head-actions{display:flex;gap:3px}
    .ss-nl-result-button{min-height:29px;padding:0 9px;border:1px solid #b7c8d3;border-radius:4px;background:#fff;color:#294c64;font-size:10.5px;font-weight:600;cursor:pointer;white-space:nowrap}.ss-nl-result-button:hover{background:#edf4f8}.ss-nl-result-button:disabled{opacity:.42;cursor:not-allowed}.ss-nl-result-button.tone-primary{border-color:#00618f;background:#00618f;color:#fff}.ss-nl-result-button.tone-icon{width:30px;padding:0;font-size:17px}.ss-nl-result-button.tone-icon-small{width:25px;min-height:25px;padding:0;font-size:16px}.ss-nl-result-button.tone-compact{min-width:46px;padding:0 7px}
    .ss-nl-result-tabs{display:flex;gap:2px;padding:5px 6px;border-bottom:1px solid #d9e3e9;overflow-x:auto;flex:none}.ss-nl-result-tabs button{height:29px;padding:0 9px;border:0;border-bottom:2px solid transparent;background:#fff;color:#526d7f;font-size:10.5px;white-space:nowrap}.ss-nl-result-tabs button.active{border-bottom-color:#00749a;color:#004f73;font-weight:700}
    .ss-nl-result-body{min-height:0;overflow:auto;padding:10px 12px 18px;overscroll-behavior:contain}.ss-nl-result-band{display:grid;gap:9px}.ss-nl-result-band h3,.ss-nl-result-chart figcaption,.ss-nl-result-table-section h3,.ss-nl-entity-section h3,.ss-nl-hinge-section h3,.ss-nl-result-kv h3,.ss-nl-result-list h3{margin:0 0 5px;color:#274f67;font-size:11.5px}.ss-nl-result-actions,.ss-nl-result-controls{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .ss-nl-result-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #d4e0e7}.ss-nl-result-metrics>div{min-width:0;padding:7px;border-right:1px solid #e0e8ed;background:#f9fbfc}.ss-nl-result-metrics>div:last-child{border-right:0}.ss-nl-result-metrics span,.ss-nl-result-metrics strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ss-nl-result-metrics span{color:#718592;font-size:9.5px}.ss-nl-result-metrics strong{margin-top:2px;color:#28495f;font-size:11px}
    .ss-nl-result-note{margin:0;padding:7px 9px;border-left:3px solid #7598ad;background:#f3f7f9;color:#536b7b;font-size:10.5px}.ss-nl-result-note.tone-ok{border-color:#419062;background:#edf8f1;color:#276543}.ss-nl-result-note.tone-warning{border-color:#d39a31;background:#fff8e7;color:#765400}.ss-nl-result-note.tone-error{border-color:#c65151;background:#fff1f1;color:#902d2d}.ss-nl-result-empty{padding:18px 10px;border:1px dashed #bdccd5;color:#6c808d;text-align:center}
    .ss-nl-result-chart{min-width:0;margin:0}.ss-nl-result-svg{width:100%;aspect-ratio:640/260;min-height:190px;max-height:340px;border:1px solid #d5e1e8;background:#fff}.ss-nl-result-svg svg{display:block;width:100%;height:100%}.ss-nl-step-scrubber{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:9px}.ss-nl-step-scrubber label{color:#4c687a;font-size:10.5px;font-weight:700}.ss-nl-step-scrubber input{width:100%;accent-color:#d58b16}
    .ss-nl-result-field{display:flex;align-items:center;gap:6px}.ss-nl-result-field span{color:#526b7c;font-size:10.5px;font-weight:600}.ss-nl-result-field select{height:30px;min-width:190px;max-width:290px;border:1px solid #b9c9d4;border-radius:4px;background:#fff;color:#29495e;font:11px inherit}
    .ss-nl-result-kv dl{display:grid;grid-template-columns:minmax(110px,34%) minmax(0,1fr);margin:0;border-top:1px solid #dce5ea}.ss-nl-result-kv dt,.ss-nl-result-kv dd{min-width:0;margin:0;padding:5px 6px;border-bottom:1px solid #e2e9ed;overflow-wrap:anywhere}.ss-nl-result-kv dt{background:#f5f8fa;color:#617685;font-size:10px}.ss-nl-result-kv dd{color:#314e61;font-size:10.5px}
    .ss-nl-result-table-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.ss-nl-result-table-heading>div{display:flex;align-items:center;gap:5px}.ss-nl-result-table-scroll{max-height:235px;overflow:auto;border:1px solid #d7e1e7}.ss-nl-result-table-section>table,.ss-nl-result-table-scroll table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:10px}.ss-nl-result-table-section th,.ss-nl-result-table-section td,.ss-nl-result-table-scroll th,.ss-nl-result-table-scroll td{padding:5px 6px;border-bottom:1px solid #e3eaef;text-align:left}.ss-nl-result-table-section th,.ss-nl-result-table-scroll th{position:sticky;top:0;background:#eef4f7;color:#50697b}.ss-nl-result-table-section tr.active{background:#eaf4f8}.ss-nl-result-table-section td button{border:0;background:none;color:#00618f;font:inherit;text-decoration:underline;cursor:pointer}
    .ss-nl-result-selector{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.ss-nl-entity-section{min-width:0;border-top:2px solid #8ea9ba;padding-top:5px}.ss-nl-entity-section>p{margin:8px 0;color:#7a8c97;font-size:10px}.ss-nl-entity-list,.ss-nl-hinge-list{display:grid;max-height:185px;overflow:auto;border:1px solid #d8e2e8}.ss-nl-entity-list button,.ss-nl-hinge-list button{min-width:0;padding:5px 6px;border:0;border-bottom:1px solid #e5ebef;background:#fff;color:#405e70;font-size:10px;overflow:hidden;text-align:left;text-overflow:ellipsis;white-space:nowrap}.ss-nl-entity-list button.active,.ss-nl-hinge-list button.active{background:#dff0f5;color:#004e72;font-weight:700}.ss-nl-hinge-section{display:grid;gap:6px}
    .ss-nl-result-list ul{margin:0;padding:6px 6px 6px 24px;border:1px solid #dce5ea;color:#4e6878;font-size:10.5px}.ss-nl-result-footer{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;padding:7px 11px;border-top:1px solid #d7e2e8;background:#f7fafb;color:#6a7f8d;font-size:9.5px;flex:none}.ss-nl-result-footer span:nth-child(2){text-align:center}.ss-nl-result-footer span:last-child{text-align:right}.ss-nl-result-footer .tone-warning{color:#9b6500;font-weight:700}
    @media(max-width:900px){.ss-nl-result-selector{grid-template-columns:1fr}.ss-nl-entity-list{max-height:130px}}
    @media(max-width:760px){.ss-nl-result-popup{position:fixed!important;left:6px!important;right:6px!important;top:6px!important;width:auto!important;height:calc(100% - 12px)!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important}.ss-nl-result-header h2{font-size:13px}.ss-nl-result-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.ss-nl-result-metrics>div:nth-child(2){border-right:0}.ss-nl-result-svg{min-height:170px}.ss-nl-result-field{width:100%}.ss-nl-result-field select{min-width:0;max-width:none;flex:1}.ss-nl-result-kv dl{grid-template-columns:1fr}.ss-nl-result-kv dt{border-bottom:0}.ss-nl-result-footer{grid-template-columns:1fr 1fr}.ss-nl-result-footer span:nth-child(2){display:none}}
  `;
  (doc.head || doc.documentElement || doc.body)?.appendChild(style);
}

function applyAdaptiveSize(target, root, state) {
  if (state.userSized || !state.open) return;
  const viewportWidth = finite(target?.innerWidth, 1366);
  const viewportHeight = finite(target?.innerHeight, 768);
  if (viewportWidth <= 760) return;
  const width = state.tab === 'spatial' ? 720 : state.tab === 'record' ? 640 : 570;
  const height = state.tab === 'response' || state.tab === 'spatial' ? 720 : 620;
  root.style.width = `${Math.min(width, Math.max(390, viewportWidth - 30))}px`;
  root.style.height = `${Math.min(height, Math.max(360, viewportHeight - 30))}px`;
  if (!root.style.left) root.style.left = `${Math.max(10, viewportWidth - width - 18)}px`;
  if (!root.style.top) root.style.top = '10px';
}

function resultSlice(bridge, jobId, query) {
  return safeCall(() => bridge.getNonlinearResultSlice(jobId, query), {
    version: 'p8-m10-result-access-v1', slice: query.slice, data: { available: false, rows: [] },
  });
}

function latestCompletedJobId(bridge) {
  const rows = safeCall(() => bridge.listNonlinearRuns(), []);
  return [...rows].reverse().find((row) => row.resultAvailable)?.id || rows.at(-1)?.id || null;
}

function syncSelection(store, job, state) {
  store?.set?.({ activeCaseId: job.caseId, activeResultId: job.id, modeOrStep: state.step }, 'nonlinear-result-popup');
}

function selectedId(state, type) {
  return state.selectedEntity?.type === type ? state.selectedEntity.id : null;
}

function historyPathLabel(path) {
  return HISTORY_PATHS.find((row) => row.value === path)?.label || path;
}

function normalizeInitialHistoryPath(value) {
  const path = String(value || '');
  return HISTORY_PATHS.some((row) => row.value === path) ? path : 'q[0]';
}

function flattenSummary(value, prefix = '', rows = [], depth = 0) {
  if (rows.length >= 80 || depth > 3) return rows;
  for (const [key, item] of Object.entries(value || {})) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === 'object' && !Array.isArray(item)) flattenSummary(item, name, rows, depth + 1);
    else rows.push([name, compactValue(item)]);
    if (rows.length >= 80) break;
  }
  return rows;
}

function compactRowSummary(row) {
  const entries = Object.entries(row || {}).filter(([key]) => !['id', 'storyId', 'memberId', 'nodeId'].includes(key)).slice(0, 2);
  return entries.map(([key, value]) => `${key}=${compactValue(value)}`).join(' · ') || '결과';
}

function compactValue(value) {
  if (value == null) return '-';
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.length <= 6 ? value.map(compactValue).join(', ') : `[${value.length}]`;
  const text = JSON.stringify(value);
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function formatPoint(point) {
  return point ? `${formatNumber(point.y)} @ ${formatNumber(point.x)}s` : '-';
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  const absolute = Math.abs(number);
  if (absolute > 0 && (absolute >= 1e6 || absolute < 1e-4)) return number.toExponential(3);
  return number.toLocaleString('en-US', { maximumFractionDigits: 5 });
}

function paddedRange(minimum, maximum) {
  if (minimum === maximum) {
    const padding = Math.abs(minimum) > 0 ? Math.abs(minimum) * 0.1 : 1;
    return { min: minimum - padding, max: maximum + padding };
  }
  const padding = (maximum - minimum) * 0.04;
  return { min: minimum - padding, max: maximum + padding };
}

function entityLabel(type) {
  return { story: '층', member: '부재', node: '절점', hinge: '힌지' }[type] || type;
}

function normalizeTab(value) {
  const id = String(value || 'overview');
  return TABS.some((tab) => tab.id === id) ? id : 'overview';
}

function statusLabel(value) {
  return {
    queued: '대기', running: '실행 중', pausing: '일시정지 중', paused: '일시정지',
    cancelling: '취소 중', cancelled: '취소', completed: '완료', failed: '실패', blocked: '차단',
  }[value] || value || '미실행';
}

function shortHash(value) {
  return value ? String(value).slice(0, 12) : '-';
}

function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
}

function downloadArtifact(target, artifact) {
  if (!artifact?.content || !target?.Blob || !target?.URL?.createObjectURL || !target?.document?.createElement) return false;
  const url = target.URL.createObjectURL(new target.Blob([artifact.content], { type: artifact.mimeType }));
  const anchor = target.document.createElement('a');
  anchor.href = url; anchor.download = artifact.fileName; anchor.style.display = 'none';
  target.document.body?.appendChild(anchor); anchor.click?.(); anchor.parentNode?.removeChild?.(anchor);
  target.setTimeout?.(() => target.URL.revokeObjectURL(url), 0);
  return true;
}

function readUserSized(target) {
  try { return target?.localStorage?.getItem?.(MANUAL_SIZE_STORAGE_KEY) === '1'; } catch { return false; }
}

function writeUserSized(target, enabled) {
  try { target?.localStorage?.setItem?.(MANUAL_SIZE_STORAGE_KEY, enabled ? '1' : '0'); } catch { /* Storage is optional. */ }
}

function safeCall(callback, fallback) {
  try { return callback(); } catch { return fallback; }
}

function queueRender(target, callback, state) {
  if (state.renderingQueued) return;
  state.renderingQueued = true;
  const schedule = target.requestAnimationFrame || ((next) => queueMicrotask(next));
  schedule(() => { state.renderingQueued = false; callback(); });
}

function clear(element) {
  while (element.childNodes?.length) element.removeChild(element.childNodes[0]);
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
