export const INDEX_PUSHOVER_PANEL_VERSION = 'm20-pushover-panel';

export const DEFAULT_PUSHOVER_OPTIONS = {
  direction: '+x',
  pattern: 'triangular',
  steps: 8,
  referenceBaseShear: 20,
  maxLoadFactor: 3,
  plasticMomentScale: 1,
};

export function createDefaultPushoverOptions(overrides = {}) {
  return {
    ...DEFAULT_PUSHOVER_OPTIONS,
    ...overrides,
  };
}

export function buildPushoverView(model, pushover, options = {}) {
  const curve = pushover?.curve || [];
  const last = curve.at(-1) || null;
  return {
    version: INDEX_PUSHOVER_PANEL_VERSION,
    available: !!pushover,
    ok: !!pushover?.ok,
    status: pushover ? (pushover.ok ? 'OK' : 'Check') : 'Ready',
    options: createDefaultPushoverOptions(options),
    model: {
      nodes: model?.nodes?.length || 0,
      members: model?.members?.length || 0,
    },
    summary: {
      controlNodeId: pushover?.controlNodeId || null,
      direction: pushover?.direction || options.direction || '+x',
      stepCount: pushover?.summary?.stepCount || curve.length || 0,
      maxBaseShear: pushover?.summary?.maxBaseShear || 0,
      maxControlDisplacement: pushover?.summary?.maxControlDisplacement || 0,
      plasticMemberCount: pushover?.summary?.plasticMemberCount || 0,
      yieldedMemberCount: pushover?.summary?.yieldedMemberCount || 0,
      ultimateMemberCount: pushover?.summary?.ultimateMemberCount || 0,
      firstYieldStep: pushover?.firstYield?.step ?? null,
    },
    curve: curve.map((point) => ({
      step: point.step,
      loadFactor: point.loadFactor,
      baseShear: point.baseShear,
      controlDisplacement: point.controlDisplacement,
      plasticMemberCount: point.plasticMemberCount,
      yieldedMemberCount: point.yieldedMemberCount,
      ultimateMemberCount: point.ultimateMemberCount,
      ok: !!point.ok,
    })),
    hingeRows: Object.entries(pushover?.memberStates || {})
      .map(([memberId, state]) => ({
        memberId,
        state: state.overall || 'unknown',
        iRatio: Number(state.i?.ratio) || 0,
        jRatio: Number(state.j?.ratio) || 0,
      }))
      .sort((a, b) => Math.max(b.iRatio, b.jRatio) - Math.max(a.iRatio, a.jRatio))
      .slice(0, 12),
    warnings: pushover?.warnings || [],
    last,
  };
}

export function renderPushoverMarkup(view) {
  return `
    <div class="sse-push-head">
      <div>
        <strong>Pushover</strong>
        <span>${escapeHtml(view.model.nodes)}N / ${escapeHtml(view.model.members)}M</span>
      </div>
      <div class="sse-push-head-actions">
        <b class="${view.ok ? 'ok' : 'check'}">${escapeHtml(view.status)}</b>
        <button type="button" class="sse-push-close" data-close-pushover data-agent-id="engine-pushover-close" aria-label="Close pushover">x</button>
      </div>
    </div>
    <div class="sse-push-body">
      ${renderMetricGrid([
        ['Direction', view.summary.direction],
        ['Control', view.summary.controlNodeId || '-'],
        ['Base shear', formatForce(view.summary.maxBaseShear)],
        ['Ctrl disp.', formatLength(view.summary.maxControlDisplacement)],
        ['Plastic', view.summary.plasticMemberCount],
        ['First yield', view.summary.firstYieldStep == null ? '-' : `Step ${view.summary.firstYieldStep}`],
      ])}
      ${renderCurveSvg(view.curve)}
      <div class="sse-push-actions">
        <button type="button" data-run-pushover data-agent-id="engine-run-pushover">Run pushover</button>
      </div>
      ${renderTable(['Member', 'State', 'I', 'J'], view.hingeRows.map((row) => [
        row.memberId,
        statusPill(row.state),
        formatRatio(row.iRatio),
        formatRatio(row.jRatio),
      ]), { rawColumns: new Set([1]) })}
      ${renderWarnings(view.warnings)}
    </div>
  `;
}

export function installIndexPushoverPanel(target, bridge, options = {}) {
  const doc = target?.document;
  if (!doc || target.__SStructuresPushoverPanelInstalled) return null;

  injectPushoverStyles(doc);
  const dock = createPanel(doc, options);
  const toggle = createPushoverToggle(doc, options);
  const state = createDefaultPushoverOptions(options.state || {});
  const panelState = { open: false };
  const runPushover = typeof options.runPushover === 'function'
    ? options.runPushover
    : (_model, runOptions) => bridge.runPushover(runOptions);
  let lastResult = null;

  const panel = {
    version: INDEX_PUSHOVER_PANEL_VERSION,
    dock,
    toggle,
    state,
    panelState,
    getLastResult() {
      return lastResult;
    },
    setOpen(open) {
      panelState.open = !!open;
      if (panelState.open) return panel.render();
      updatePanelOpen(dock, toggle, panelState.open);
      return panel.getPanelState();
    },
    open() {
      panelState.open = true;
      return panel.render();
    },
    close() {
      panelState.open = false;
      updatePanelOpen(dock, toggle, panelState.open);
      return panel.getPanelState();
    },
    toggleOpen() {
      panelState.open = !panelState.open;
      return panelState.open ? panel.render() : panel.close();
    },
    getPanelState() {
      return { open: panelState.open };
    },
    setOption(key, value) {
      if (!Object.prototype.hasOwnProperty.call(state, key)) throw new Error(`Unsupported pushover option: ${key}`);
      state[key] = normalizeOptionValue(key, value);
      panel.render();
      return panel.getView();
    },
    run(runOptions = {}) {
      const model = bridge?.getCurrentModel?.();
      if (!model) throw new Error('Current UI model is not available.');
      lastResult = runPushover(model, { ...state, ...runOptions });
      panelState.open = true;
      panel.render(lastResult);
      return lastResult;
    },
    getView() {
      return buildPushoverView(bridge?.getCurrentModel?.(), lastResult, state);
    },
    render(result = lastResult) {
      const view = buildPushoverView(bridge?.getCurrentModel?.(), result, state);
      dock.innerHTML = renderPushoverMarkup(view);
      bindPanelEvents(dock, panel);
      updatePanelOpen(dock, toggle, panelState.open);
      target.SStructuresPushoverView = view;
      return view;
    },
  };

  toggle.addEventListener('click', () => panel.toggleOpen());
  target.SStructuresPushoverPanel = panel;
  target.__SStructuresPushoverPanelInstalled = true;
  queueMicrotask(() => panel.render());
  return panel;
}

function createPanel(doc, options) {
  let dock = doc.getElementById('enginePushoverPanel');
  if (dock) return dock;
  dock = doc.createElement('section');
  dock.id = 'enginePushoverPanel';
  dock.className = 'sse-push-dock';
  dock.setAttribute('data-agent-id', 'engine-pushover-panel');
  dock.setAttribute('aria-label', 'Pushover panel');
  const host = doc.getElementById(options.hostId || 'canvasWrap') || doc.body;
  host.appendChild(dock);
  return dock;
}

function createPushoverToggle(doc, options) {
  let toggle = doc.getElementById('enginePushoverToggle');
  if (toggle) return toggle;
  toggle = doc.createElement('button');
  toggle.id = 'enginePushoverToggle';
  toggle.type = 'button';
  toggle.className = 'sse-panel-toggle sse-push-toggle';
  toggle.textContent = 'Pushover';
  toggle.setAttribute('data-agent-id', 'engine-pushover-toggle');
  toggle.setAttribute('aria-label', 'Open pushover panel');
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

function bindPanelEvents(dock, panel) {
  const close = dock.querySelector('[data-close-pushover]');
  if (close) close.addEventListener('click', () => panel.close());
  const run = dock.querySelector('[data-run-pushover]');
  if (run) run.addEventListener('click', () => panel.run());
}

function renderMetricGrid(items) {
  return `<div class="sse-push-grid">${items.map(([label, value]) => `
    <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
  `).join('')}</div>`;
}

function renderCurveSvg(curve) {
  const width = 300;
  const height = 136;
  const pad = { left: 36, right: 10, top: 10, bottom: 26 };
  if (!curve.length) {
    return '<div class="sse-push-empty">No pushover result yet.</div>';
  }
  const maxX = Math.max(1e-9, ...curve.map((point) => Math.abs(point.controlDisplacement)));
  const maxY = Math.max(1e-9, ...curve.map((point) => Math.abs(point.baseShear)));
  const x = (value) => pad.left + (Math.abs(Number(value) || 0) / maxX) * (width - pad.left - pad.right);
  const y = (value) => height - pad.bottom - (Math.abs(Number(value) || 0) / maxY) * (height - pad.top - pad.bottom);
  const points = curve.map((point) => `${x(point.controlDisplacement)},${y(point.baseShear)}`).join(' ');
  const markers = curve.map((point) => `<circle cx="${x(point.controlDisplacement)}" cy="${y(point.baseShear)}" r="${point.plasticMemberCount ? 3.5 : 2.5}" class="${point.ultimateMemberCount ? 'ultimate' : point.yieldedMemberCount ? 'yielded' : ''}"></circle>`).join('');
  return `
    <svg class="sse-push-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Pushover capacity curve">
      <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="axis"></line>
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="axis"></line>
      <polyline points="${points}" fill="none" class="curve"></polyline>
      ${markers}
      <text x="4" y="${pad.top + 7}">${formatForce(maxY)}</text>
      <text x="${width - 84}" y="${height - 8}">${formatLength(maxX)}</text>
    </svg>
  `;
}

function renderTable(headers, rows, options = {}) {
  if (!rows.length) return '<div class="sse-push-empty">No hinge rows.</div>';
  const rawColumns = options.rawColumns || new Set();
  return `<table class="sse-push-table"><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td>${rawColumns.has(index) ? cell : escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderWarnings(warnings) {
  if (!warnings.length) return '';
  return `<div class="sse-push-warnings">${warnings.slice(0, 3).map((item) => `<div>${escapeHtml(item.code || 'WARN')}: ${escapeHtml(item.message || '')}</div>`).join('')}</div>`;
}

function statusPill(status) {
  return `<span class="sse-push-pill ${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

function normalizeOptionValue(key, value) {
  if (['steps'].includes(key)) return Math.max(1, Math.trunc(Number(value) || 1));
  if (['referenceBaseShear', 'maxLoadFactor', 'plasticMomentScale'].includes(key)) return Math.max(0, Number(value) || 0);
  return value;
}

function injectPushoverStyles(doc) {
  if (doc.getElementById('ssePushoverPanelStyles')) return;
  const style = doc.createElement('style');
  style.id = 'ssePushoverPanelStyles';
  style.textContent = `
    .sse-panel-toggle{position:absolute;border:1px solid #cfdbe6;background:rgba(255,255,255,.94);color:#213448;border-radius:7px;padding:6px 10px;box-shadow:0 8px 22px rgba(17,43,70,.12);font:12px/1.2 "Segoe UI",Arial,sans-serif;cursor:pointer;z-index:25}.sse-panel-toggle.active{background:#00467f;border-color:#00467f;color:white}
    .sse-push-toggle{left:12px;bottom:12px}
    .sse-push-dock{position:absolute;left:12px;bottom:48px;width:min(330px,calc(100% - 24px));max-height:46%;overflow:auto;background:rgba(255,255,255,.96);border:1px solid #d8e2ea;border-radius:8px;box-shadow:0 12px 32px rgba(17,43,70,.15);z-index:24;color:#203040;font:12px/1.35 "Segoe UI",Arial,sans-serif}
    .sse-push-dock.is-hidden{display:none}
    .sse-push-head{display:flex;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid #e4ecf3}.sse-push-head-actions{display:flex;align-items:center;gap:6px}.sse-push-close{width:22px;height:22px;border:1px solid #d5e0ea;background:white;color:#5c6d7f;border-radius:6px;font-size:12px;line-height:1;cursor:pointer}.sse-push-head strong{display:block;color:#00467f;font-size:13px}.sse-push-head span{display:block;color:#748294;font-size:11px}.sse-push-head b{border-radius:999px;padding:2px 7px;background:#fff3da;color:#8a5a00;font-size:11px}.sse-push-head b.ok{background:#e6f3ec;color:#17633b}
    .sse-push-body{padding:10px 12px 12px}.sse-push-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:8px}.sse-push-grid div{border:1px solid #e3ebf2;background:#f8fbfd;border-radius:6px;padding:6px}.sse-push-grid span{display:block;color:#6f7f90;font-size:10px}.sse-push-grid strong{display:block;color:#1e3348;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sse-push-chart{width:100%;height:136px;display:block;margin:6px 0 8px;background:#fbfdff;border:1px solid #e4ecf3;border-radius:6px}.sse-push-chart .axis{stroke:#9aaaba;stroke-width:1}.sse-push-chart .curve{stroke:#0f5d8f;stroke-width:2}.sse-push-chart circle{fill:#0f5d8f}.sse-push-chart circle.yielded{fill:#d98a1f}.sse-push-chart circle.ultimate{fill:#c43c3c}.sse-push-chart text{fill:#68788a;font-size:9px}
    .sse-push-actions button{width:100%;border:1px solid #00467f;background:#00467f;color:white;border-radius:6px;padding:7px;cursor:pointer;margin:0 0 8px}
    .sse-push-table{width:100%;border-collapse:collapse;font-size:11px}.sse-push-table th,.sse-push-table td{border-bottom:1px solid #e4ecf3;text-align:right;padding:5px 4px}.sse-push-table th:first-child,.sse-push-table td:first-child{text-align:left}.sse-push-table th{background:#f8fbfd;color:#657589}.sse-push-empty{padding:10px;border:1px dashed #d8e2ea;border-radius:6px;color:#7a8795;background:#fafcfe;margin-bottom:8px}
    .sse-push-pill{display:inline-block;border-radius:999px;padding:2px 6px;background:#eef3f7;color:#506173;font-size:10px}.sse-push-pill.yielded{background:#d98a1f;color:white}.sse-push-pill.ultimate{background:#c43c3c;color:white}.sse-push-pill.elastic{background:#1f8a58;color:white}.sse-push-warnings{color:#8a5a00;background:#fff8e8;border:1px solid #f2dfb8;border-radius:6px;padding:7px;margin-top:8px}
  `;
  doc.head?.appendChild(style);
}

function formatRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  if (Math.abs(number) >= 10000 || (Math.abs(number) > 0 && Math.abs(number) < 0.001)) return number.toExponential(2);
  return number.toFixed(3).replace(/\.?0+$/, '');
}

function formatForce(value) {
  return Number.isFinite(Number(value)) ? `${formatRatio(value)} kN` : '-';
}

function formatLength(value) {
  return Number.isFinite(Number(value)) ? `${formatRatio(Number(value) * 1000)} mm` : '-';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
