import { buildDesignWorkflow, renderDesignWorkflowMarkup } from './indexDesignWorkflow.js';
import { equivalentShellBadge } from '../solver/shell/equivalentScope.js';

export const INDEX_RESULTS_PANEL_VERSION = 'm10-index-results-panel';

const TABS = ['summary', 'pdelta', 'modal', 'design'];

export function buildIndexResultViewModel(model, analysis, uiState = {}) {
  const activeTab = TABS.includes(uiState.activeTab) ? uiState.activeTab : 'summary';
  const activeResult = pickActiveResult(analysis);
  const pDelta = buildPDeltaView(analysis, uiState);
  const modal = buildModalView(analysis);
  const design = buildDesignView(model, analysis);
  const memberForces = buildMemberForceRows(activeResult);

  return {
    version: INDEX_RESULTS_PANEL_VERSION,
    activeTab,
    ok: !!analysis?.ok,
    status: analysisStatus(analysis),
    summary: {
      metrics: [
        metric('Status', analysisStatus(analysis)),
        metric('Combos', analysis?.combos?.length ?? 0),
        metric('Max disp.', formatLength((analysis?.envelope?.dmax ?? activeResult?.dmax) || 0)),
        metric('Max util.', formatRatio(analysis?.design?.summary?.maxUtilization ?? activeResult?.maxRatio)),
        metric('Governing', governingText(analysis)),
        metric('Warnings', analysis?.validation?.warnings?.length ?? 0),
      ],
      memberForces,
      equivalentShellBadge: equivalentShellBadge(model),
    },
    pDelta,
    modal,
    design,
    tabs: TABS.map((id) => ({ id, label: tabLabel(id), active: id === activeTab })),
    model: {
      nodes: model?.nodes?.length || 0,
      members: model?.members?.length || 0,
      loads: model?.loads?.length || 0,
    },
  };
}

export function renderIndexResultsMarkup(view) {
  return `
    <div class="sse-head">
      <div>
        <strong>Engine Results</strong>
        <span>${escapeHtml(view.model.nodes)}N / ${escapeHtml(view.model.members)}M / ${escapeHtml(view.model.loads)}L</span>
      </div>
      <div class="sse-head-actions">
        <b class="${view.ok ? 'ok' : 'check'}">${escapeHtml(view.status)}</b>
        <button type="button" class="sse-close" data-close-results data-agent-id="engine-results-close" aria-label="Close results">x</button>
      </div>
    </div>
    <div class="sse-tabs">
      ${view.tabs.map((tab) => `<button data-tab="${escapeHtml(tab.id)}" class="${tab.active ? 'active' : ''}" data-agent-id="engine-tab-${escapeHtml(tab.id)}">${escapeHtml(tab.label)}</button>`).join('')}
    </div>
    ${renderTab(view)}
  `;
}

export function installIndexResultsPanel(target, bridge, options = {}) {
  const doc = target?.document;
  if (!doc || target.__SStructuresIndexResultsInstalled) return null;

  injectIndexResultsStyles(doc);
  const dock = createDock(doc, options);
  const toggle = createResultsToggle(doc, options);
  const state = {
    activeTab: 'summary',
    pDeltaStep: 0,
    open: false,
  };

  const panel = {
    version: INDEX_RESULTS_PANEL_VERSION,
    dock,
    toggle,
    state,
    render(analysis = bridge?.getLastResult?.(), model = bridge?.getCurrentModel?.()) {
      const view = buildIndexResultViewModel(model, analysis, state);
      dock.innerHTML = renderIndexResultsMarkup(view);
      bindPanelEvents(dock, panel, target);
      updatePanelOpen(dock, toggle, state.open);
      target.SStructuresAgentResultView = view;
      return view;
    },
    setOpen(open) {
      state.open = !!open;
      if (state.open) return panel.render();
      updatePanelOpen(dock, toggle, state.open);
      return panel.getPanelState();
    },
    open() {
      state.open = true;
      return panel.render();
    },
    close() {
      state.open = false;
      updatePanelOpen(dock, toggle, state.open);
      return panel.getPanelState();
    },
    toggleOpen() {
      state.open = !state.open;
      return state.open ? panel.render() : panel.close();
    },
    getPanelState() {
      return { open: state.open };
    },
    setTab(tab) {
      if (TABS.includes(tab)) state.activeTab = tab;
      state.open = true;
      return panel.render();
    },
    setPDeltaStep(step) {
      state.pDeltaStep = Math.max(0, Number(step) || 0);
      state.open = true;
      return panel.render();
    },
  };

  toggle.addEventListener('click', () => panel.toggleOpen());
  const originalAnalyze = bridge.analyzeModel.bind(bridge);
  bridge.analyzeModel = (model, analysisOptions) => {
    const result = originalAnalyze(model, analysisOptions);
    panel.render(result, model);
    return result;
  };
  bridge.getResultView = () => buildIndexResultViewModel(bridge.getCurrentModel?.(), bridge.getLastResult?.(), state);
  bridge.renderResultsPanel = () => panel.render();
  target.analyzeModel = bridge.analyzeModel;
  target.SStructuresResultsPanel = panel;
  target.__SStructuresIndexResultsInstalled = true;

  queueMicrotask(() => panel.render());
  return panel;
}

function createDock(doc, options) {
  let dock = doc.getElementById('engineResultsDock');
  if (dock) return dock;

  dock = doc.createElement('section');
  dock.id = 'engineResultsDock';
  dock.className = 'sse-dock';
  dock.setAttribute('data-agent-id', 'engine-results-dock');
  dock.setAttribute('aria-label', 'Engine results panel');

  const host = doc.getElementById(options.hostId || 'canvasWrap') || doc.body;
  host.appendChild(dock);
  return dock;
}

function createResultsToggle(doc, options) {
  let toggle = doc.getElementById('engineResultsToggle');
  if (toggle) return toggle;

  toggle = doc.createElement('button');
  toggle.id = 'engineResultsToggle';
  toggle.type = 'button';
  toggle.className = 'sse-panel-toggle sse-results-toggle';
  toggle.textContent = 'Results';
  toggle.setAttribute('data-agent-id', 'engine-results-toggle');
  toggle.setAttribute('aria-label', 'Open results panel');
  toggle.setAttribute('aria-pressed', 'false');

  const host = doc.getElementById(options.hostId || 'canvasWrap') || doc.body;
  host.appendChild(toggle);
  return toggle;
}

function updatePanelOpen(dock, toggle, open) {
  dock.classList.toggle('is-hidden', !open);
  dock.setAttribute('aria-hidden', open ? 'false' : 'true');
  toggle.classList.toggle('active', open);
  toggle.setAttribute('aria-pressed', open ? 'true' : 'false');
}

function bindPanelEvents(dock, panel, target) {
  const close = dock.querySelector('[data-close-results]');
  if (close) close.addEventListener('click', () => panel.close());
  for (const button of dock.querySelectorAll('[data-tab]')) {
    button.addEventListener('click', () => panel.setTab(button.getAttribute('data-tab')));
  }
  const slider = dock.querySelector('[data-pdelta-step]');
  if (slider) {
    slider.addEventListener('input', () => panel.setPDeltaStep(slider.value));
  }
  const run = dock.querySelector('[data-run-analysis]');
  if (run) {
    run.addEventListener('click', () => target.SStructuresAgent?.runAnalysis?.());
  }
  const enablePDelta = dock.querySelector('[data-enable-pdelta]');
  if (enablePDelta) {
    enablePDelta.addEventListener('click', () => {
      target.SStructuresAgent?.execute?.('setAnalysisSetting', {
        key: 'includeGeometricStiffness',
        value: true,
      });
    });
  }
}

function renderTab(view) {
  if (view.activeTab === 'pdelta') return renderPDelta(view.pDelta);
  if (view.activeTab === 'modal') return renderModal(view.modal);
  if (view.activeTab === 'design') return renderDesign(view.design);
  return renderSummary(view.summary);
}

function renderSummary(summary) {
  return `
    <div class="sse-panel">
      ${summary.equivalentShellBadge?.active ? `<div class="sse-scope-badge" data-agent-id="equivalent-shell-scope-badge"><b>${escapeHtml(summary.equivalentShellBadge.label)}</b><span>${escapeHtml(summary.equivalentShellBadge.warning)}</span></div>` : ''}
      <div class="sse-grid">
        ${summary.metrics.map(renderMetric).join('')}
      </div>
      <h4>Member Force Envelope</h4>
      ${renderTable(['Member', 'Ratio', 'N', 'My', 'Mz'], summary.memberForces.map((row) => [
        row.memberId,
        formatRatio(row.ratio),
        formatForce(row.n),
        formatMoment(row.my),
        formatMoment(row.mz),
      ]))}
      <button type="button" class="sse-run" data-run-analysis data-agent-id="engine-run-analysis">Run analysis</button>
    </div>
  `;
}

function renderPDelta(pDelta) {
  if (!pDelta.enabled) {
    return `
      <div class="sse-panel">
        <div class="sse-empty">P-Delta is disabled. Enable geometric stiffness in analysis settings.</div>
        <button type="button" class="sse-run" data-enable-pdelta data-agent-id="engine-enable-pdelta">Enable P-Delta</button>
      </div>
    `;
  }
  return `
    <div class="sse-panel">
      <div class="sse-grid">
        ${[
          metric('Status', pDelta.ok ? 'OK' : 'Check'),
          metric('Max amp.', formatRatio(pDelta.maxAmplification)),
          metric('Max theta', formatRatio(pDelta.design.summary?.maxTheta)),
          metric('Max BΔ', formatRatio(pDelta.design.summary?.maxBDelta)),
          metric('Governing', pDelta.governingCombo || '-'),
          metric('Converged', `${pDelta.convergedCount}/${pDelta.comboCount}`),
        ].map(renderMetric).join('')}
      </div>
      ${renderPDeltaSvg(pDelta.series)}
      <h4>Design P-Delta Summary</h4>
      ${renderTable(['Combo', 'Dir', 'Story', 'theta', 'BΔ', 'PΔ shear', 'PΔ moment', 'Status'], pDelta.design.rows.map((row) => [
        row.comboId,
        row.direction,
        row.governingStory,
        formatRatio(row.maxTheta),
        formatRatio(row.maxBDelta),
        formatForce(row.maxPDeltaShear),
        formatMoment(row.maxPDeltaMoment),
        statusPill(row.status),
      ]), { rawColumns: new Set([7]) })}
      <h4>Story Stability Table</h4>
      ${renderTable(['Combo', 'Dir', 'Story', 'P', 'Drift', 'V', 'PΔ shear', 'theta', 'BΔ'], pDelta.design.storyRows.slice(0, 12).map((row) => [
        row.comboId,
        row.direction,
        row.storyId,
        formatForce(row.gravityLoad),
        formatLength(row.storyDrift),
        formatForce(row.storyShear),
        formatForce(row.pDeltaShear),
        formatRatio(row.theta),
        row.bDelta == null ? '-' : formatRatio(row.bDelta),
      ]))}
      <label class="sse-slider">Load step
        <input type="range" min="0" max="${Math.max(0, pDelta.maxStep)}" value="${Math.min(pDelta.step, pDelta.maxStep)}" data-pdelta-step data-agent-id="engine-pdelta-step">
      </label>
      ${renderTable(['Combo', 'lambda', 'Roof d', 'Vbase', 'Amp.'], pDelta.rows.map((row) => [
        row.comboId,
        format(row.loadFactor, 2),
        formatLength(row.roofDisplacement),
        formatForce(row.baseShear),
        formatRatio(row.amplification),
      ]))}
    </div>
  `;
}

function renderModal(modal) {
  return `
    <div class="sse-panel">
      <div class="sse-grid">
        ${[
          metric('Status', modal.ok ? 'OK' : 'Check'),
          metric('Modes', modal.modes.length),
          metric('T1', modal.modes[0] ? `${format(modal.modes[0].period, 3)} s` : '-'),
          metric('RSA Y', modal.rsaY == null ? '-' : formatLength(modal.rsaY)),
        ].map(renderMetric).join('')}
      </div>
      ${renderModalSvg(modal.modes)}
      ${renderTable(['Mode', 'T', 'Hz', 'Mass X', 'Mass Y'], modal.modes.map((mode) => [
        mode.id,
        format(mode.period, 3),
        format(mode.frequencyHz, 3),
        formatPercent(mode.massX),
        formatPercent(mode.massY),
      ]))}
    </div>
  `;
}

function renderDesign(design) {
  return `
    <div class="sse-panel">
      <div class="sse-grid">
        ${[
          metric('Status', design.ok ? 'OK' : 'Check'),
          metric('Max util.', formatRatio(design.maxUtilization)),
          metric('Governing', design.governing || '-'),
          metric('Checked', design.checkedMembers),
        ].map(renderMetric).join('')}
      </div>
      ${renderDesignWorkflowMarkup(design.workflow)}
      ${renderUtilizationBars(design.rows)}
      ${renderTable(['Member', 'Type', 'Ratio', 'Check', 'Status'], design.rows.map((row) => [
        row.memberId,
        row.type,
        formatRatio(row.utilization),
        row.check,
        statusPill(row.status),
      ]), { rawColumns: new Set([4]) })}
    </div>
  `;
}

function renderMetric(item) {
  return `<div class="sse-metric"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`;
}

function renderTable(headers, rows, options = {}) {
  if (!rows.length) return '<div class="sse-empty">No result rows.</div>';
  const rawColumns = options.rawColumns || new Set();
  return `
    <table class="sse-table">
      <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td>${rawColumns.has(index) ? cell : escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  `;
}

function renderPDeltaSvg(series) {
  const width = 280;
  const height = 120;
  const pad = { left: 28, right: 8, top: 10, bottom: 22 };
  if (!series.length) return '<div class="sse-empty">No P-Delta load-step curve.</div>';
  const points = series.flatMap((item) => item.points);
  const maxDisp = Math.max(1e-9, ...points.flatMap((point) => [
    point.firstOrderRoofDisplacement,
    point.secondOrderRoofDisplacement,
  ]));
  const maxShear = Math.max(1e-9, ...points.flatMap((point) => [
    point.firstOrderBaseShear,
    point.secondOrderBaseShear,
  ]));
  const x = (disp) => pad.left + (disp / maxDisp) * (width - pad.left - pad.right);
  const y = (shear) => height - pad.bottom - (shear / maxShear) * (height - pad.top - pad.bottom);
  const colors = ['#0f5d8f', '#1f8a58', '#b36b00', '#6d5bd0'];
  const lines = series.map((item, index) => {
    const color = colors[index % colors.length];
    const first = item.points.map((point) => `${x(point.firstOrderRoofDisplacement)},${y(point.firstOrderBaseShear)}`).join(' ');
    const second = item.points.map((point) => `${x(point.secondOrderRoofDisplacement)},${y(point.secondOrderBaseShear)}`).join(' ');
    return `<polyline points="${first}" stroke="${color}" fill="none" stroke-width="2" stroke-dasharray="4 3"></polyline><polyline points="${second}" stroke="${color}" fill="none" stroke-width="2"></polyline>`;
  }).join('');
  const legends = series.slice(0, 4).map((item, index) => {
    const color = colors[index % colors.length];
    const tx = pad.left + index * 54;
    return `<rect x="${tx}" y="${height - 13}" width="7" height="7" rx="1.5" fill="${color}"></rect><text x="${tx + 10}" y="${height - 7}">${escapeHtml(item.comboId)}</text>`;
  }).join('');
  return `
    <svg class="sse-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Global P-Delta response curve">
      <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="axis"></line>
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="axis"></line>
      <text x="2" y="${pad.top + 6}">${format(maxShear, 2)}</text>
      <text x="${width - 52}" y="${height - 6}">Roof d</text>
      ${lines}
      ${legends}
      <text x="${width - 86}" y="${pad.top + 7}">dash 1st / solid 2nd</text>
    </svg>
  `;
}

function renderModalSvg(modes) {
  const width = 280;
  const height = 120;
  const pad = { left: 28, right: 8, top: 10, bottom: 22 };
  if (!modes.length) return '<div class="sse-empty">No modal result.</div>';
  const maxPeriod = Math.max(0.01, ...modes.map((mode) => mode.period));
  const gap = 7;
  const barWidth = Math.max(10, (width - pad.left - pad.right - gap * (modes.length - 1)) / modes.length);
  const bars = modes.map((mode, index) => {
    const x = pad.left + index * (barWidth + gap);
    const h = (mode.period / maxPeriod) * (height - pad.top - pad.bottom);
    const y = height - pad.bottom - h;
    const strong = Math.max(mode.massX, mode.massY, mode.massZ) >= 0.5;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" class="${strong ? 'strong' : ''}"></rect>
      <text x="${x + barWidth / 2 - 4}" y="${height - 7}">${mode.index}</text>`;
  }).join('');
  return `
    <svg class="sse-chart sse-modal-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Modal period chart">
      <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="axis"></line>
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="axis"></line>
      <text x="2" y="${pad.top + 6}">${format(maxPeriod, 2)}s</text>
      ${bars}
    </svg>
  `;
}

function renderUtilizationBars(rows) {
  if (!rows.length) return '<div class="sse-empty">No design rows.</div>';
  return `<div class="sse-bars">${rows.slice(0, 6).map((row) => {
    const ratio = Math.max(0, Number(row.utilization) || 0);
    const width = Math.min(100, ratio * 100);
    return `<div class="sse-bar ${statusClass(row.status)}">
      <span>${escapeHtml(row.memberId)}</span>
      <i style="width:${width}%"></i>
      <b>${escapeHtml(formatRatio(ratio))}</b>
    </div>`;
  }).join('')}</div>`;
}

function buildPDeltaView(analysis, uiState) {
  const summary = analysis?.pDelta?.summary || {};
  const byCombo = analysis?.pDelta?.byCombo || {};
  const series = Object.entries(byCombo)
    .map(([comboId, result]) => ({
      comboId,
      converged: !!result.converged,
      points: pDeltaResultPoints(result),
    }))
    .filter((item) => item.points.length);
  const maxStep = Math.max(0, ...series.map((item) => item.points.length - 1));
  const step = Math.min(Math.max(0, Number(uiState.pDeltaStep) || 0), maxStep);
  const rows = series.map((item) => {
    const point = item.points[Math.min(step, item.points.length - 1)]
      || item.points[item.points.length - 1]
      || {};
    return {
      comboId: item.comboId,
      loadFactor: point.loadFactor ?? 0,
      roofDisplacement: point.secondOrderRoofDisplacement ?? 0,
      baseShear: point.secondOrderBaseShear ?? 0,
      amplification: point.amplification ?? 1,
    };
  });
  const design = analysis?.pDelta?.design || { summary: {}, rows: [], storyRows: [], memberForceRows: [] };
  return {
    enabled: !!analysis?.pDelta,
    method: analysis?.pDelta?.method || null,
    ok: !!analysis?.pDelta?.ok,
    maxAmplification: summary.maxAmplification || 1,
    governingCombo: summary.governing?.comboId || null,
    convergedCount: summary.convergedCount || 0,
    comboCount: summary.comboCount || 0,
    maxStep,
    step,
    rows,
    series,
    design,
  };
}

function pDeltaResultPoints(result = {}) {
  if (result.curve?.global?.points?.length) {
    return result.curve.global.points.map((item, index) => ({
      index,
      loadFactor: Number(item.loadFactor) || 0,
      amplification: Number(item.amplification) || 1,
      firstOrderRoofDisplacement: Number(item.firstOrder?.roofDisplacement) || 0,
      secondOrderRoofDisplacement: Number(item.secondOrder?.roofDisplacement) || 0,
      firstOrderBaseShear: Number(item.firstOrder?.baseShear) || 0,
      secondOrderBaseShear: Number(item.secondOrder?.baseShear) || 0,
      roofDriftRatio: Number(item.secondOrder?.roofDriftRatio) || 0,
    }));
  }
  const linearDisplacement = Number(result.linear?.summary?.maxDisplacement) || 0;
  return (result.steps || []).map((step, index) => {
    const finalIteration = step.iterations?.[step.iterations.length - 1] || {};
    const loadFactor = Number(step.lambda) || 0;
    const firstOrderRoofDisplacement = linearDisplacement * loadFactor;
    const secondOrderRoofDisplacement = Number(finalIteration.maxDisplacement) || 0;
    return {
      index,
      loadFactor,
      amplification: firstOrderRoofDisplacement > 0
        ? secondOrderRoofDisplacement / firstOrderRoofDisplacement
        : Number(result.amplification) || 1,
      firstOrderRoofDisplacement,
      secondOrderRoofDisplacement,
      firstOrderBaseShear: 0,
      secondOrderBaseShear: 0,
      roofDriftRatio: 0,
      iterationCount: step.iterations?.length || 0,
      status: step.status || null,
    };
  });
}

function buildModalView(analysis) {
  const modes = (analysis?.dynamics?.modes || []).map((mode) => ({
    id: mode.id,
    index: mode.index,
    period: Number(mode.period) || 0,
    frequencyHz: Number(mode.frequencyHz) || 0,
    massX: Number(mode.participation?.x?.massRatio) || 0,
    massY: Number(mode.participation?.y?.massRatio) || 0,
    massZ: Number(mode.participation?.z?.massRatio) || 0,
  }));
  return {
    ok: !!analysis?.dynamics?.ok,
    modes,
    rsaX: analysis?.dynamics?.rsa?.combined?.x?.displacement
      ?? analysis?.dynamics?.rsa?.combined?.x?.srssDisplacement
      ?? null,
    rsaY: analysis?.dynamics?.rsa?.combined?.y?.displacement
      ?? analysis?.dynamics?.rsa?.combined?.y?.srssDisplacement
      ?? null,
  };
}

function buildDesignView(model, analysis) {
  const summary = analysis?.design?.summary || {};
  const rows = [];
  for (const check of Object.values(analysis?.design?.steel?.memberResults || {})) {
    rows.push(designRow(check, 'Steel'));
  }
  for (const check of Object.values(analysis?.design?.concrete?.memberResults || {})) {
    rows.push(designRow(check, 'RC'));
  }
  rows.sort((a, b) => b.utilization - a.utilization);
  return {
    ok: !!analysis?.design?.ok,
    maxUtilization: summary.maxUtilization || 0,
    governing: summary.governing ? `${summary.governing.memberId} / ${summary.governing.checkId}` : null,
    checkedMembers: summary.checkedMembers || 0,
    workflow: buildDesignWorkflow(model, analysis),
    rows: rows.slice(0, 12),
  };
}

function designRow(check, type) {
  return {
    memberId: check.memberId || '-',
    type,
    utilization: Number(check.utilization) || 0,
    check: check.governingCheck || '-',
    status: check.status || (check.ok ? 'OK' : 'Check'),
  };
}

function buildMemberForceRows(result) {
  return Object.values(result?.memberResults || {})
    .map((item) => ({
      memberId: item.memberId || item.id || '-',
      ratio: Number(item.check?.ratio) || 0,
      n: item.Nmax,
      my: item.Mymax,
      mz: item.Mzmax,
    }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 8);
}

function pickActiveResult(analysis) {
  return analysis?.pDelta?.envelope || analysis?.envelope || Object.values(analysis?.byCombo || {}).find((result) => result?.ok) || null;
}

function analysisStatus(analysis) {
  if (!analysis) return 'Idle';
  if (analysis.empty) return 'No model';
  if (!analysis.ok) return 'Check';
  return 'OK';
}

function governingText(analysis) {
  const governing = analysis?.design?.summary?.governing || analysis?.envelope?.governing?.maxUtilization;
  if (!governing) return '-';
  return `${governing.memberId || '-'} / ${governing.comboId || governing.checkId || '-'}`;
}

function tabLabel(id) {
  return {
    summary: 'Summary',
    pdelta: 'P-Delta',
    modal: 'Modal',
    design: 'Design',
  }[id] || id;
}

function metric(label, value) {
  return { label, value };
}

function statusPill(status) {
  return `<span class="sse-pill ${statusClass(status)}">${escapeHtml(status || 'Check')}</span>`;
}

function statusClass(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'ok') return 'ok';
  if (value === 'warn' || value === 'caution' || value === 'require-2nd') return 'warn';
  if (value === 'ng') return 'ng';
  return 'check';
}

function format(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  const abs = Math.abs(number);
  if (abs !== 0 && (abs < 0.001 || abs >= 100000)) return number.toExponential(2);
  return number.toFixed(digits).replace(/\.?0+$/, '');
}

function formatRatio(value) {
  return format(value, 3);
}

function formatForce(value) {
  return Number.isFinite(Number(value)) ? `${format(value, 2)} kN` : '-';
}

function formatMoment(value) {
  return Number.isFinite(Number(value)) ? `${format(value, 2)} kN-m` : '-';
}

function formatLength(value) {
  return Number.isFinite(Number(value)) ? `${format(Number(value) * 1000, 2)} mm` : '-';
}

function formatPercent(value) {
  return Number.isFinite(Number(value)) ? `${format(Number(value) * 100, 1)}%` : '-';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function injectIndexResultsStyles(doc) {
  if (doc.getElementById('sseIndexResultsStyles')) return;
  const style = doc.createElement('style');
  style.id = 'sseIndexResultsStyles';
  style.textContent = `
    .sse-panel-toggle{position:absolute;border:1px solid #cfdbe6;background:rgba(255,255,255,.94);color:#213448;border-radius:7px;padding:6px 10px;box-shadow:0 8px 22px rgba(17,43,70,.12);font:12px/1.2 "Segoe UI",Arial,sans-serif;cursor:pointer;z-index:25}.sse-panel-toggle.active{background:#00467f;border-color:#00467f;color:white}
    .sse-results-toggle{right:12px;top:52px}
    .sse-dock{position:absolute;right:12px;top:88px;width:min(340px,calc(100% - 24px));max-height:calc(100% - 112px);overflow:auto;background:rgba(255,255,255,.96);border:1px solid #d8e2ea;border-radius:8px;box-shadow:0 12px 32px rgba(17,43,70,.16);z-index:24;color:#203040;font:12px/1.35 "Segoe UI",Arial,sans-serif}
    .sse-dock.is-hidden{display:none}
    .sse-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:10px 12px;border-bottom:1px solid #e4ecf3}
    .sse-head-actions{display:flex;align-items:center;gap:6px}
    .sse-close{width:22px;height:22px;border:1px solid #d5e0ea;background:white;color:#5c6d7f;border-radius:6px;font-size:12px;line-height:1;cursor:pointer}
    .sse-head strong{display:block;font-size:13px;color:#00467f}.sse-head span{display:block;color:#748294;font-size:11px;margin-top:2px}.sse-head b{border-radius:999px;padding:2px 7px;font-size:11px;background:#eef3f7}.sse-head b.ok{background:#e6f3ec;color:#17633b}.sse-head b.check{background:#fff3da;color:#8a5a00}
    .sse-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:8px;border-bottom:1px solid #e4ecf3}.sse-tabs button{border:1px solid #d8e2ea;background:#f7fafd;border-radius:6px;padding:5px 3px;font-size:11px;color:#35506a;cursor:pointer}.sse-tabs button.active{background:#00467f;color:white;border-color:#00467f}
    .sse-panel{padding:10px 12px 12px}.sse-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px}.sse-metric{background:#f6f9fc;border:1px solid #e3ebf2;border-radius:6px;padding:7px}.sse-metric span{display:block;color:#6f7f90;font-size:10.5px}.sse-metric strong{display:block;margin-top:2px;color:#1e3348;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sse-panel h4{margin:10px 0 6px;color:#00467f;font-size:12px}.sse-table{width:100%;border-collapse:collapse;font-size:11px}.sse-table th,.sse-table td{border-bottom:1px solid #e4ecf3;text-align:right;padding:5px 4px}.sse-table th:first-child,.sse-table td:first-child{text-align:left}.sse-table th{color:#657589;font-weight:600;background:#f8fbfd}.sse-empty{padding:12px;border:1px dashed #d8e2ea;border-radius:6px;color:#7a8795;background:#fafcfe}
    .sse-chart{width:100%;height:130px;display:block;margin:6px 0 8px;background:#fbfdff;border:1px solid #e4ecf3;border-radius:6px}.sse-chart .axis{stroke:#9aaaba;stroke-width:1}.sse-chart text{fill:#68788a;font-size:9px}.sse-modal-chart rect{fill:#77a8d2}.sse-modal-chart rect.strong{fill:#0f5d8f}
    .sse-slider{display:flex;align-items:center;gap:8px;color:#596a7b;margin:6px 0 8px}.sse-slider input{flex:1}.sse-run{width:100%;margin-top:8px;border:1px solid #00467f;background:#00467f;color:white;border-radius:6px;padding:7px;cursor:pointer}
    .sse-pill{display:inline-block;border-radius:999px;padding:2px 6px;font-size:10px;background:#eef3f7;color:#506173}.sse-pill.ok,.sse-bar.ok i{background:#1f8a58;color:white}.sse-pill.warn,.sse-bar.warn i{background:#d98a1f;color:white}.sse-pill.ng,.sse-bar.ng i{background:#c43c3c;color:white}
    .sse-bars{display:grid;gap:5px;margin:6px 0 9px}.sse-bar{position:relative;display:grid;grid-template-columns:42px 1fr 42px;align-items:center;gap:6px;height:20px}.sse-bar span,.sse-bar b{position:relative;z-index:2;font-size:10.5px;color:#405266}.sse-bar i{display:block;height:8px;border-radius:999px;background:#7fa8cf}
    .sse-scope-badge{border:1px solid #e4c878;background:#fff9e6;color:#684b00;border-radius:6px;padding:7px 8px;margin-bottom:8px}.sse-scope-badge b,.sse-scope-badge span{display:block}.sse-scope-badge span{font-size:10.5px;margin-top:2px}
    .sse-workflow{border:1px solid #e2ebf3;background:#fbfdff;border-radius:7px;padding:8px;margin:0 0 10px}.sse-workflow-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:7px}.sse-workflow-head strong{color:#00467f}.sse-workflow-head span{border-radius:999px;padding:2px 7px;font-size:10px;background:#eef3f7}.sse-workflow-counts{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:7px}.sse-workflow-counts div{background:white;border:1px solid #edf2f7;border-radius:5px;padding:5px}.sse-workflow-counts span{display:block;color:#6f7f90;font-size:9.5px}.sse-workflow-counts b{font-size:12px}.sse-workflow-checks{display:grid;grid-template-columns:1fr 1fr;gap:5px}.sse-workflow-checks div{border-left:3px solid #cfd9e4;background:white;border-radius:5px;padding:5px}.sse-workflow-checks b,.sse-workflow-checks span,.sse-workflow-checks small{display:block}.sse-workflow-checks span{font-size:10px}.sse-workflow-checks small{color:#6f7f90}.sse-workflow .sse-ok{border-color:#1f8a58;color:#17633b}.sse-workflow .sse-warn{border-color:#d98a1f;color:#8a5a00}.sse-workflow .sse-ng{border-color:#c43c3c;color:#9b1c1c}.sse-workflow-actions{margin-top:7px;color:#405266}.sse-workflow-actions b{display:block;color:#00467f;margin-bottom:3px}.sse-workflow-actions div{font-size:10.5px;padding:2px 0}
  `;
  doc.head?.appendChild(style);
}
