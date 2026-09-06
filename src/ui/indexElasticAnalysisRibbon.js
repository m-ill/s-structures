import { createRibbonGroup } from './indexNativeRibbonDom.js';

export const ELASTIC_ANALYSIS_RIBBON_VERSION = 'p9-m9-elastic-analysis-ribbon-v4';

export const ELASTIC_ANALYSIS_COMMANDS = [
  {
    key: 'static',
    caseId: 'EL-STATIC',
    kind: 'static',
    name: '1차 정적해석',
    label: '1차 정적',
    resultLabel: '1차',
    icon: 'K',
    settings: { pDeltaMethod: 'off' },
  },
  {
    key: 'direct-pdelta',
    caseId: 'EL-PDELTA',
    kind: 'static',
    name: 'Direct P-Delta',
    label: 'Direct P-Delta',
    resultLabel: 'P-Delta',
    icon: 'PΔ',
    settings: { pDeltaMethod: 'direct' },
  },
  {
    key: 'modal',
    caseId: 'EL-MODAL',
    kind: 'modal',
    name: '모달해석',
    label: '모달',
    resultLabel: '모달',
    icon: 'T',
    settings: { modalModeCount: 12 },
  },
  {
    key: 'rsa',
    caseId: 'EL-RSA',
    kind: 'responseSpectrum',
    name: '응답스펙트럼해석',
    label: 'RSA',
    resultLabel: 'RSA',
    icon: 'S',
    settings: {
      modalModeCount: 12,
      spectrum: {
        method: 'SRSS',
        directions: ['x', 'y'],
        dampingRatio: 0.05,
        scale: 9.80665,
        points: [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }],
      },
    },
  },
  {
    key: 'buckling',
    caseId: 'EL-BUCKLING',
    kind: 'buckling',
    name: '탄성 고유치 좌굴',
    label: '탄성좌굴',
    resultLabel: '좌굴',
    icon: 'λ',
    settings: { modeCount: 3, maxIterations: 30 },
  },
  {
    key: 'linear-tha',
    caseId: 'EL-LTHA',
    kind: 'linearTha',
    name: '선형 시간이력 (예비)',
    label: '선형 THA',
    resultLabel: 'THA',
    icon: 't',
    preliminary: true,
    settings: {
      modalModeCount: 12,
      direction: 'x',
      dampingRatio: 0.05,
      dt: 0.02,
      accelerationUnit: 'g',
      accelerationScale: 1,
      recordId: 'sample-a',
      accelerations: [0, 0.05, -0.05, 0.08, -0.04, 0],
    },
  },
];

const ELASTIC_KINDS = new Set(ELASTIC_ANALYSIS_COMMANDS.map((item) => item.kind));

export function installElasticAnalysisRibbon(target = globalThis, panel = null) {
  const doc = target?.document;
  if (!doc?.createElement || !panel) return null;
  if (target.SStructuresElasticAnalysisRibbon) return target.SStructuresElasticAnalysisRibbon;

  const runGroup = createRibbonGroup(doc, 'elastic-analysis-run', '해석');
  runGroup.setAttribute('data-ss-elastic-analysis-ribbon', '1');
  const runItems = runGroup.querySelector('[data-ss-ribbon-items]');
  const runButton = createRunAllButton(target);
  const batchStatus = createBatchStatus(doc);
  runItems.appendChild(runButton);
  runItems.appendChild(createCenterButton(target));
  runItems.appendChild(batchStatus);

  const resultGroup = createRibbonGroup(doc, 'elastic-analysis-results', '결과');
  resultGroup.setAttribute('data-ss-elastic-analysis-results', '1');
  const resultItems = resultGroup.querySelector('[data-ss-ribbon-items]');
  const commandButtons = new Map();

  for (const command of ELASTIC_ANALYSIS_COMMANDS) {
    const button = createResultShortcutButton(target, command);
    commandButtons.set(command.key, button);
    resultItems.appendChild(button);
  }

  panel.insertBefore?.(resultGroup, panel.firstChild || null);
  panel.insertBefore?.(runGroup, resultGroup);

  const api = {
    version: ELASTIC_ANALYSIS_RIBBON_VERSION,
    commands: ELASTIC_ANALYSIS_COMMANDS.map((item) => ({ ...item, settings: clone(item.settings) })),
    select(commandKey) {
      const command = ELASTIC_ANALYSIS_COMMANDS.find((item) => item.key === commandKey);
      if (!command) return api.getState();
      const analysisCase = ensureAnalysisCase(target, command);
      if (analysisCase) {
        target.SStructuresAnalysisCenter?.select?.(analysisCase.id);
        target.SStructuresAnalysisCenter?.open?.();
      }
      api.refresh();
      return api.getState();
    },
    async runSelected() {
      const selected = selectedAnalysisCase(target);
      if (!selected || !ELASTIC_KINDS.has(selected.kind)) return api.getState();
      await target.SStructuresAnalysisCenter?.run?.(selected.id);
      target.SStructuresAnalysisCenter?.close?.();
      target.SStructuresElasticResultPopup?.openForCase?.(selected.id);
      api.refresh();
      return api.getState();
    },
    runAll(options = {}) {
      const bridge = target?.SStructuresEngine;
      const batch = target.__SStructuresElasticBatchState || {};
      if (!bridge?.getCurrentModel?.() || batch.running) return api.getState();
      target.SStructuresAnalysisCenter?.save?.();
      const cases = ensureElasticAnalysisCases(target);
      const previousStatuses = new Map(cases.map((item) => [item.id, item.status || 'not-run']));
      for (const item of cases) item.status = 'running';
      target.__SStructuresElasticBatchState = {
        running: true,
        status: 'running',
        total: cases.length,
        okCount: 0,
        reviewCount: 0,
        failedCount: 0,
        caseIds: cases.map((item) => item.id),
        startedAt: new Date().toISOString(),
      };
      target.SStructuresAnalysisCenter?.close?.();
      api.refresh();

      const execute = async () => {
        let results = [];
        try {
          const computeTarget = target.SStructuresAnalysisCenter?.getState?.().computeTarget || 'auto';
          results = await bridge.runAnalysisCasesAsync?.({ cases, computeTarget }) || [];
        } catch (error) {
          for (const item of cases) {
            if (item.status === 'running') item.status = previousStatuses.get(item.id) || 'not-run';
          }
          target.__SStructuresElasticBatchState = {
            ...target.__SStructuresElasticBatchState,
            running: false,
            status: 'failed',
            failedCount: cases.length,
            error: error?.message || String(error),
            completedAt: new Date().toISOString(),
          };
          api.refresh();
          return api.getState();
        }

        target.__SStructuresElasticBatchState = summarizeBatchResults(cases, results, target.__SStructuresElasticBatchState);
        const preferred = preferredResultCase(cases, results);
        if (preferred) {
          target.SStructuresAnalysisCenter?.select?.(preferred.id);
          target.SStructuresAnalysisCenter?.close?.();
          target.SStructuresElasticResultPopup?.openForCase?.(preferred.id);
        }
        target.SStructuresElasticSetupWorkflow?.refresh?.();
        api.refresh();
        return api.getState();
      };

      if (options.defer === true && typeof target.requestAnimationFrame === 'function') {
        target.requestAnimationFrame(() => {
          if (typeof target.setTimeout === 'function') target.setTimeout(execute, 0);
          else execute();
        });
        return api.getState();
      }
      return execute();
    },
    runAllElastic(options = {}) {
      return api.runAll(options);
    },
    openResult(commandKey) {
      const command = ELASTIC_ANALYSIS_COMMANDS.find((item) => item.key === commandKey);
      const analysisCase = command ? findCommandCase(target.SStructuresEngine?.getAnalysisCases?.() || [], command) : null;
      const result = analysisCase ? target.SStructuresEngine?.getAnalysisCaseResult?.(analysisCase.id) : null;
      if (!analysisCase || !result) return api.getState();
      target.SStructuresAnalysisCenter?.select?.(analysisCase.id);
      target.SStructuresAnalysisCenter?.close?.();
      target.SStructuresElasticResultPopup?.openForCase?.(analysisCase.id);
      api.refresh();
      return api.getState();
    },
    openResults(commandKey = null) {
      if (commandKey) return api.openResult(commandKey);
      const selected = selectedAnalysisCase(target);
      const selectedCommand = ELASTIC_ANALYSIS_COMMANDS.find((command) => findCommandCase([selected].filter(Boolean), command));
      if (selectedCommand) return api.openResult(selectedCommand.key);
      const firstAvailable = api.getState().commands.find((command) => command.hasResult);
      return firstAvailable ? api.openResult(firstAvailable.key) : api.getState();
    },
    openCenter() {
      const cases = ensureElasticAnalysisCases(target);
      const selected = selectedAnalysisCase(target);
      if (!selected || !ELASTIC_KINDS.has(selected.kind)) target.SStructuresAnalysisCenter?.select?.(cases[0]?.id || null);
      target.SStructuresAnalysisCenter?.open?.();
      api.refresh();
      return api.getState();
    },
    refresh() {
      refreshAnalysisRibbon(target, commandButtons, { runButton, batchStatus });
      return api.getState();
    },
    getState() {
      return summarizeElasticAnalysisRibbon(target);
    },
  };

  target.SStructuresElasticAnalysisRibbon = api;
  api.refresh();
  return api;
}

export function summarizeElasticAnalysisRibbon(target = globalThis) {
  const cases = target?.SStructuresEngine?.getAnalysisCases?.() || [];
  const results = target?.SStructuresEngine?.getAnalysisResults?.() || {};
  const selected = selectedAnalysisCase(target);
  const batch = target.__SStructuresElasticBatchState || null;
  const commands = ELASTIC_ANALYSIS_COMMANDS.map((command) => {
    const item = findCommandCase(cases, command);
    const result = item ? results[item.id] || null : null;
    return {
      key: command.key,
      caseId: item?.id || null,
      kind: command.kind,
      label: command.resultLabel || command.label,
      status: item?.status || 'not-run',
      resultStatus: result?.status || null,
      hasResult: !!result,
      selected: !!item && item.id === selected?.id,
      preliminary: command.preliminary === true,
    };
  });
  const hasStaleResult = commands.some((command) => command.hasResult && command.status === 'stale');
  const batchStatus = batch?.running
    ? 'running'
    : hasStaleResult
      ? 'stale'
      : batch?.status || (commands.some((command) => command.hasResult) ? 'partial-results' : 'not-run');
  return {
    version: ELASTIC_ANALYSIS_RIBBON_VERSION,
    selectedCaseId: selected?.id || null,
    canRunSelected: !!selected && ELASTIC_KINDS.has(selected.kind),
    canRunAll: !!target?.SStructuresEngine?.getCurrentModel?.(),
    running: batch?.running === true,
    batchStatus,
    lastBatch: batch ? clone(batch) : null,
    resultCount: commands.filter((command) => command.hasResult).length,
    allResultsAvailable: commands.every((command) => command.hasResult),
    commands,
  };
}

function createResultShortcutButton(target, command) {
  const doc = target.document;
  const button = doc.createElement('button');
  button.type = 'button';
  button.id = `ssElasticAnalysis-${command.key}`;
  button.setAttribute('id', button.id);
  button.className = 'ss-ribbon-command ss-elastic-analysis-command ss-elastic-result-shortcut';
  button.setAttribute('data-ss-elastic-analysis', command.key);
  button.setAttribute('data-ss-ribbon-item', `elastic-analysis-${command.key}`);
  button.setAttribute('data-agent-id', `elastic-analysis-result-${command.key}`);
  button.setAttribute('aria-label', `${command.name} 결과 열기`);
  button.innerHTML = [
    `<span class="ss-ribbon-icon">${command.icon}</span>`,
    `<span class="ss-elastic-command-label">${command.resultLabel || command.label}</span>`,
    '<span class="ss-elastic-command-status" aria-hidden="true"></span>',
  ].join('');
  button.addEventListener?.('click', () => target.SStructuresElasticAnalysisRibbon?.openResult?.(command.key));
  return button;
}

function createRunAllButton(target) {
  const doc = target.document;
  const button = doc.createElement('button');
  button.type = 'button';
  button.id = 'ssElasticRunAll';
  button.setAttribute('id', button.id);
  button.className = 'ss-ribbon-command ss-elastic-run-all';
  button.setAttribute('data-agent-id', 'elastic-analysis-run-all');
  button.setAttribute('aria-label', '전체 탄성해석 실행');
  button.setAttribute('title', '1차, P-Delta, 모달, RSA, 좌굴, THA를 연속 실행');
  button.innerHTML = '<span class="ss-ribbon-icon">▶</span><span class="ss-elastic-run-label">전체 탄성해석</span>';
  button.addEventListener?.('click', () => target.SStructuresElasticAnalysisRibbon?.runAll?.({ defer: true }));
  return button;
}

function createBatchStatus(doc) {
  const status = doc.createElement('span');
  status.id = 'ssElasticBatchStatus';
  status.setAttribute('id', status.id);
  status.className = 'ss-elastic-batch-status';
  status.setAttribute('data-agent-id', 'elastic-analysis-batch-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  return status;
}

function createCenterButton(target) {
  const doc = target.document;
  const button = doc.createElement('button');
  button.type = 'button';
  button.id = 'ssElasticAnalysisSettings';
  button.setAttribute('id', button.id);
  button.className = 'ss-ribbon-command ss-elastic-center-open';
  button.setAttribute('data-agent-id', 'elastic-analysis-settings');
  button.setAttribute('aria-label', '해석 케이스 설정 열기');
  button.setAttribute('title', '해석 케이스 설정 열기');
  button.innerHTML = '<span class="ss-ribbon-icon">⚙</span>';
  button.addEventListener?.('click', () => target.SStructuresElasticAnalysisRibbon?.openCenter?.());
  return button;
}

function refreshAnalysisRibbon(target, commandButtons, controls) {
  const state = summarizeElasticAnalysisRibbon(target);
  for (const command of state.commands) {
    const button = commandButtons.get(command.key);
    if (!button) continue;
    button.classList?.toggle('active', command.selected);
    button.setAttribute('aria-pressed', command.selected ? 'true' : 'false');
    button.setAttribute('data-status', command.status);
    button.disabled = !command.hasResult;
    button.setAttribute('title', command.hasResult
      ? `${command.label} 결과 열기 · ${statusLabel(command.status)}${command.preliminary ? ' (예비 기능)' : ''}`
      : `${command.label} 결과 없음 · 전체 탄성해석을 먼저 실행하세요.`);
    const status = button.querySelector?.('.ss-elastic-command-status');
    if (status) status.textContent = statusShortLabel(command.status);
  }
  const run = controls?.runButton;
  if (run) {
    run.disabled = !state.canRunAll || state.running;
    run.setAttribute('aria-busy', state.running ? 'true' : 'false');
    run.setAttribute('data-status', state.batchStatus);
    const label = run.querySelector?.('.ss-elastic-run-label');
    if (label) label.textContent = state.running ? '해석 중' : '전체 탄성해석';
  }
  const batchStatus = controls?.batchStatus;
  if (batchStatus) {
    const text = batchStatusText(state);
    batchStatus.textContent = text;
    batchStatus.hidden = !text;
    batchStatus.setAttribute('data-status', state.batchStatus);
  }
}

export function ensureElasticAnalysisCases(target) {
  return ELASTIC_ANALYSIS_COMMANDS.map((command) => ensureAnalysisCase(target, command)).filter(Boolean);
}

function summarizeBatchResults(cases, results, previous = {}) {
  const failedCount = cases.filter((item) => item.status === 'failed' || item.status === 'running').length;
  const reviewCount = cases.filter((item) => ['review-required', 'preliminary', 'designBlocked'].includes(item.status)).length;
  const okCount = cases.filter((item) => item.status === 'ok').length;
  const status = failedCount === cases.length
    ? 'failed'
    : failedCount > 0
      ? 'partial'
      : reviewCount > 0
        ? 'review'
        : 'ok';
  return {
    ...previous,
    running: false,
    status,
    total: cases.length,
    okCount,
    reviewCount,
    failedCount,
    caseIds: cases.map((item) => item.id),
    resultIds: results.map((result) => result?.runRecordId).filter(Boolean),
    completedAt: new Date().toISOString(),
  };
}

function preferredResultCase(cases, results) {
  const resultIds = new Set(results.map((result) => result?.caseId).filter(Boolean));
  const firstOrder = cases.find((item) => item.settings?._elasticCommand === 'static' || item.id === 'EL-STATIC');
  if (firstOrder && resultIds.has(firstOrder.id)) return firstOrder;
  return cases.find((item) => resultIds.has(item.id)) || null;
}

function batchStatusText(state) {
  if (state.running) return '실행 중';
  if (state.batchStatus === 'stale') return '재실행 필요';
  const batch = state.lastBatch;
  if (!batch) return state.resultCount ? `결과 ${state.resultCount}/${ELASTIC_ANALYSIS_COMMANDS.length}` : '';
  if (batch.error) return '실행 실패';
  const parts = [];
  if (batch.okCount) parts.push(`완료 ${batch.okCount}`);
  if (batch.reviewCount) parts.push(`검토 ${batch.reviewCount}`);
  if (batch.failedCount) parts.push(`실패 ${batch.failedCount}`);
  return parts.join(' · ') || '결과 없음';
}

function ensureAnalysisCase(target, command) {
  const bridge = target?.SStructuresEngine;
  if (!bridge) return null;
  const cases = bridge.getAnalysisCases?.() || [];
  const existing = findCommandCase(cases, command);
  if (existing) return existing;

  const model = bridge.getCurrentModel?.() || {};
  const settings = {
    ...clone(command.settings),
    _elasticCommand: command.key,
  };
  if (command.kind === 'buckling' && !settings.preloadCombinationId) {
    settings.preloadCombinationId = model.loadCombinations?.[0]?.id || null;
  }
  if (['modal', 'responseSpectrum', 'linearTha'].includes(command.kind) && !settings.massSource) {
    settings.massSource = clone(model.analysisSettings?.massSource || model.massSources?.[0] || null);
  }
  const idAvailable = !cases.some((item) => item.id === command.caseId);
  return bridge.addAnalysisCase?.({
    ...(idAvailable ? { id: command.caseId } : {}),
    kind: command.kind,
    name: command.name,
    settings,
  }) || null;
}

function findCommandCase(cases, command) {
  const tagged = cases.find((item) => item.settings?._elasticCommand === command.key);
  if (tagged) return tagged;
  const byId = cases.find((item) => item.id === command.caseId && matchesCommand(item, command));
  if (byId) return byId;
  return null;
}

function matchesCommand(item, command) {
  if (item?.kind !== command.kind) return false;
  if (command.kind !== 'static') return true;
  const method = item.settings?.pDeltaMethod || (item.settings?.pDelta ? 'legacy' : 'off');
  return method === command.settings.pDeltaMethod;
}

function selectedAnalysisCase(target) {
  const cases = target?.SStructuresEngine?.getAnalysisCases?.() || [];
  const selectedId = target?.SStructuresResultSelection?.getState?.().activeCaseId
    || target?.SStructuresAnalysisCenter?.state?.selectedCaseId
    || null;
  return cases.find((item) => item.id === selectedId) || null;
}

function statusLabel(status) {
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

function statusShortLabel(status) {
  if (status === 'ok') return '완료';
  if (status === 'running') return '실행중';
  if (status === 'stale') return '갱신';
  if (status === 'failed') return '실패';
  if (['review-required', 'preliminary', 'designBlocked'].includes(status)) return '검토';
  return '';
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
