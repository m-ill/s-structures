import { analyzeModel as analyzeCoreModel } from '../solver/linear3d.js';
import { runPushover as runCorePushover } from '../nonlinear/pushover.js';

export const INDEX_NATIVE_ADVANCED_ANALYSIS_VERSION = 'm29-native-advanced-analysis';

export const NATIVE_ADVANCED_ACTIONS = [
  'runNativePushoverReport',
  'showNativeModalReport',
];

export function installIndexNativeAdvancedAnalysis(target = globalThis, options = {}) {
  if (!target?.document) return null;
  if (target.SStructuresNativeAdvancedAnalysis) return target.SStructuresNativeAdvancedAnalysis;

  const state = {
    lastView: null,
  };

  const api = {
    version: INDEX_NATIVE_ADVANCED_ANALYSIS_VERSION,
    state,
    getState() {
      return buildNativeAdvancedState(target, state);
    },
    runPushoverReport(runOptions = {}) {
      const model = getCurrentModel(target, options.bridge);
      if (!model) throw new Error('Current UI model is not available.');
      const result = target.SStructuresEngine?.runPushover?.(runOptions) || runCorePushover(model, runOptions);
      const view = buildNativePushoverReportView(result, runOptions);
      state.lastView = view;
      target.SStructuresNativeAdvancedView = view;
      renderNativeReport(target, view);
      target.SStructuresNativePushoverView = {
        available: true,
        ok: !!result?.ok,
        status: view.status,
        options: view.options,
        summary: view.summary,
        result,
      };
      return api.getState();
    },
    showModalReport(reportOptions = {}) {
      const model = getCurrentModel(target, options.bridge);
      if (!model) throw new Error('Current UI model is not available.');
      const analysis = options.bridge?.getLastResult?.() || analyzeCoreModel(model);
      const view = buildNativeModalReportView(analysis, reportOptions);
      state.lastView = view;
      target.SStructuresNativeAdvancedView = view;
      renderNativeReport(target, view);
      return api.getState();
    },
  };

  target.SStructuresNativeAdvancedAnalysis = api;
  bindNativeAdvancedButtons(target, api);
  return api;
}

export function buildNativeAdvancedState(target = globalThis, state = {}) {
  const view = state.lastView || target?.SStructuresNativeAdvancedView || null;
  const reportModal = target?.document?.getElementById?.('reportModal');
  return {
    version: INDEX_NATIVE_ADVANCED_ANALYSIS_VERSION,
    available: !!target?.document,
    lastView: view ? summarizeView(view) : null,
    reportModal: {
      available: !!reportModal,
      open: reportModal?.classList?.contains?.('show') || false,
    },
    experimentalPanelsVisible: isVisible(target?.document?.getElementById?.('enginePushoverPanel'), target)
      || isVisible(target?.document?.getElementById?.('engineResultsDock'), target)
      || isVisible(target?.document?.getElementById?.('engineVisualControls'), target),
  };
}

function bindNativeAdvancedButtons(target, api) {
  const run = target?.document?.getElementById?.('ssRunPushover');
  if (!run || run.getAttribute?.('data-ss-advanced-bound') === '1') return;
  run.setAttribute?.('data-ss-advanced-bound', '1');
  run.addEventListener?.('click', () => {
    const doc = target.document;
    api.runPushoverReport({
      direction: doc.getElementById?.('ssPushoverDirection')?.value || '+x',
      pattern: doc.getElementById?.('ssPushoverPattern')?.value || 'triangular',
      steps: Math.max(1, Math.trunc(Number(doc.getElementById?.('ssPushoverSteps')?.value) || 8)),
    });
  });
}

function buildNativePushoverReportView(result, options) {
  const curve = result?.curve || [];
  const summary = {
    stepCount: result?.summary?.stepCount || curve.length,
    maxBaseShear: result?.summary?.maxBaseShear || 0,
    maxControlDisplacement: result?.summary?.maxControlDisplacement || 0,
    plasticMemberCount: result?.summary?.plasticMemberCount || 0,
  };
  return {
    type: 'pushover',
    title: 'Pushover Report',
    status: `${result?.ok ? 'OK' : 'Preliminary'} · ${summary.stepCount} steps`,
    preliminary: true,
    options: { ...options },
    summary,
    curve,
    html: renderPushoverReportHtml(summary, curve),
  };
}

function buildNativeModalReportView(analysis, options) {
  const modes = analysis?.dynamics?.modes || [];
  const rsa = analysis?.dynamics?.rsa || analysis?.responseSpectrum || null;
  const summary = {
    modeCount: modes.length,
    firstPeriod: modes[0]?.period || null,
    firstFrequency: modes[0]?.frequency || null,
    rsaYDisplacement: rsa?.summary?.maxDisplacementY ?? rsa?.maxDisplacementY ?? null,
  };
  return {
    type: 'modal',
    title: 'Modal/RSA Report',
    status: modes.length ? `OK · ${modes.length} modes` : 'No modal result',
    preliminary: false,
    options: { ...options },
    summary,
    modes,
    html: renderModalReportHtml(summary, modes),
  };
}

function renderNativeReport(target, view) {
  const doc = target?.document;
  const report = doc?.getElementById?.('reportModal');
  const body = doc?.getElementById?.('reportBody') || report;
  if (!report || !body) return;
  body.innerHTML = view.html;
  report.classList?.add?.('show');
  report.setAttribute?.('data-agent-id', 'native-advanced-report-modal');
  report.setAttribute?.('data-native-advanced-type', view.type);
}

function renderPushoverReportHtml(summary, curve) {
  const rows = curve.slice(0, 12).map((point, index) => (
    `<tr><td>${index}</td><td>${format(point.controlDisplacement)}</td><td>${format(point.baseShear)}</td><td>${escapeHtml(point.state || '')}</td></tr>`
  )).join('');
  return `
    <h2>Pushover Report</h2>
    <div class="native-report-note">Preliminary nonlinear result. Hinge degradation and hysteresis are not final design behavior.</div>
    <table class="rpt-table"><tr><th>Steps</th><th>Max V</th><th>Max d</th><th>Plastic members</th></tr>
      <tr><td>${summary.stepCount}</td><td>${format(summary.maxBaseShear)}</td><td>${format(summary.maxControlDisplacement)}</td><td>${summary.plasticMemberCount}</td></tr>
    </table>
    <h3>Capacity Curve</h3>
    <table class="rpt-table"><tr><th>Step</th><th>d</th><th>V</th><th>State</th></tr>${rows}</table>
  `;
}

function renderModalReportHtml(summary, modes) {
  const rows = modes.slice(0, 12).map((mode) => (
    `<tr><td>${mode.mode || mode.index || ''}</td><td>${format(mode.period)}</td><td>${format(mode.frequency)}</td><td>${format(mode.massParticipation?.x)}</td><td>${format(mode.massParticipation?.y)}</td></tr>`
  )).join('');
  return `
    <h2>Modal/RSA Report</h2>
    <table class="rpt-table"><tr><th>Modes</th><th>T1</th><th>f1</th><th>RSA Y</th></tr>
      <tr><td>${summary.modeCount}</td><td>${format(summary.firstPeriod)}</td><td>${format(summary.firstFrequency)}</td><td>${format(summary.rsaYDisplacement)}</td></tr>
    </table>
    <h3>Mode Summary</h3>
    <table class="rpt-table"><tr><th>Mode</th><th>T</th><th>Hz</th><th>Mass X</th><th>Mass Y</th></tr>${rows}</table>
  `;
}

function summarizeView(view) {
  return {
    type: view.type,
    title: view.title,
    status: view.status,
    preliminary: !!view.preliminary,
    summary: view.summary || null,
  };
}

function getCurrentModel(target, bridge = target?.SStructuresEngine || null) {
  return bridge?.getCurrentModel?.() || (typeof target?.model === 'function' ? target.model() : null);
}

function isVisible(element, target = globalThis) {
  if (!element) return false;
  const style = typeof target?.getComputedStyle === 'function' ? target.getComputedStyle(element) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  if (element.hidden) return false;
  if (element.classList?.contains?.('show')) return true;
  return !style || style.display !== 'none';
}

function format(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  if (Math.abs(number) >= 100) return number.toFixed(0);
  if (Math.abs(number) >= 10) return number.toFixed(2);
  return number.toFixed(4);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
