import { factorText } from '../core/combinations.js';

export const REPORT_EXPORT_VERSION = 'm14-report-export';

export function buildReportData(model, analysis, options = {}) {
  const activeResult = pickResult(analysis, options.resultId);
  const bounds = modelBounds(model);
  const designRows = collectDesignRows(analysis);
  return {
    version: REPORT_EXPORT_VERSION,
    generatedAt: options.generatedAt || new Date().toISOString(),
    title: options.title || model?.meta?.name || 'S-Structures Report',
    scope: {
      status: analysisStatus(analysis),
      limitations: defaultLimitations(options.limitations),
    },
    model: {
      schemaVersion: model?.schemaVersion || null,
      units: model?.units || {},
      nodeCount: model?.nodes?.length || 0,
      memberCount: model?.members?.length || 0,
      loadCount: model?.loads?.length || 0,
      loadCaseCount: model?.loadCases?.length || 0,
      combinationCount: model?.loadCombinations?.length || 0,
      bounds,
    },
    loadCases: (model?.loadCases || []).map((loadCase) => ({
      id: loadCase.id,
      name: loadCase.name || loadCase.id,
      type: loadCase.type || 'other',
      loadCount: (model?.loads || []).filter((load) => (load.case || model.loadCases?.[0]?.id) === loadCase.id).length,
    })),
    combinations: (model?.loadCombinations || []).map((combo) => ({
      id: combo.id,
      name: combo.name || combo.id,
      type: combo.type || 'strength',
      factors: { ...(combo.factors || {}) },
      factorsText: factorText(combo.factors || {}),
    })),
    analysis: {
      ok: !!analysis?.ok,
      status: analysisStatus(analysis),
      resultId: activeResult.id,
      comboCount: analysis?.combos?.length || 0,
      errorCount: analysis?.validation?.errors?.length || 0,
      warningCount: analysis?.validation?.warnings?.length || 0,
      maxDisplacement: activeResult.result?.dmax ?? analysis?.envelope?.dmax ?? null,
      maxUtilization: analysis?.design?.summary?.maxUtilization ?? activeResult.result?.maxRatio ?? null,
      governing: governingSummary(analysis),
      pDelta: pDeltaSummary(analysis),
      modal: modalSummary(analysis),
    },
    memberForces: collectMemberForceRows(activeResult.result),
    design: {
      ok: !!analysis?.design?.ok,
      summary: analysis?.design?.summary || null,
      rows: designRows,
    },
    messages: collectMessages(analysis),
  };
}

export function renderHtmlReport(report) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(report.title)}</title>
  <style>
    body{font:13px/1.5 Arial,sans-serif;color:#1e2c38;margin:0;background:#f5f7fa}
    main{max-width:980px;margin:0 auto;background:white;min-height:100vh;padding:28px 34px}
    h1{font-size:24px;margin:0 0 4px;color:#003f73} h2{font-size:16px;margin:24px 0 8px;color:#003f73}
    .meta{color:#647484;margin-bottom:16px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
    .card{border:1px solid #dfe7ef;border-radius:6px;padding:9px;background:#fafcff}.card span{display:block;color:#647484;font-size:11px}.card b{font-size:15px}
    table{width:100%;border-collapse:collapse;margin:8px 0 14px}th,td{border-bottom:1px solid #e4ebf2;padding:6px 7px;text-align:right}th:first-child,td:first-child{text-align:left}th{background:#f6f9fc;color:#526579}
    .ok{color:#167647}.warn{color:#9a6500}.ng{color:#b42323}.note{border:1px solid #e4ebf2;background:#fbfdff;border-radius:6px;padding:10px;margin:8px 0}
    ul{margin:8px 0 0 18px;padding:0}@media print{body{background:white}main{padding:0;max-width:none}.card{break-inside:avoid}}
  </style>
</head>
<body>
<main>
  <h1>${escapeHtml(report.title)}</h1>
  <div class="meta">Generated ${escapeHtml(report.generatedAt)} · ${escapeHtml(report.version)}</div>
  ${renderMetricGrid([
    ['Status', report.analysis.status],
    ['Nodes', report.model.nodeCount],
    ['Members', report.model.memberCount],
    ['Loads', report.model.loadCount],
    ['Combos', report.analysis.comboCount],
    ['Max disp.', formatLength(report.analysis.maxDisplacement)],
    ['Max util.', formatRatio(report.analysis.maxUtilization)],
    ['Warnings', report.analysis.warningCount],
  ])}
  <h2>Model Summary</h2>
  ${renderTable(['Item', 'Value'], [
    ['Schema', report.model.schemaVersion],
    ['Units', Object.entries(report.model.units).map(([key, value]) => `${key}:${value}`).join(', ')],
    ['Bounds X/Y/Z', `${format(report.model.bounds.size.x)} / ${format(report.model.bounds.size.y)} / ${format(report.model.bounds.size.z)}`],
  ])}
  <h2>Load Cases</h2>
  ${renderTable(['Case', 'Name', 'Type', 'Loads'], report.loadCases.map((item) => [item.id, item.name, item.type, item.loadCount]))}
  <h2>Load Combinations</h2>
  ${renderTable(['Combo', 'Name', 'Type', 'Factors'], report.combinations.map((item) => [item.id, item.name, item.type, item.factorsText]))}
  <h2>Analysis Summary</h2>
  ${renderTable(['Item', 'Value'], [
    ['Result', report.analysis.resultId || '-'],
    ['Governing', report.analysis.governing || '-'],
    ['P-Delta', report.analysis.pDelta.enabled ? `${formatRatio(report.analysis.pDelta.maxAmplification)} max amp.` : 'Disabled'],
    ['Modal', report.analysis.modal.ok ? `${report.analysis.modal.modeCount} modes, T1=${format(report.analysis.modal.firstPeriod)}s` : report.analysis.modal.reason || 'Not available'],
  ])}
  <h2>Member Force Envelope</h2>
  ${renderTable(['Member', 'Ratio', 'N', 'Vy', 'Vz', 'My', 'Mz'], report.memberForces.map((row) => [
    row.memberId,
    formatRatio(row.ratio),
    formatForce(row.n),
    formatForce(row.vy),
    formatForce(row.vz),
    formatMoment(row.my),
    formatMoment(row.mz),
  ]))}
  <h2>Design Summary</h2>
  ${renderTable(['Member', 'Type', 'Status', 'Ratio', 'Check', 'Combo'], report.design.rows.map((row) => [
    row.memberId,
    row.type,
    row.status,
    formatRatio(row.utilization),
    row.governingCheck || '-',
    row.comboId || '-',
  ]))}
  <h2>Messages</h2>
  ${renderMessages(report.messages)}
  <h2>Limitations</h2>
  <div class="note"><ul>${report.scope.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
</main>
</body>
</html>`;
}

export function createHtmlReport(model, analysis, options = {}) {
  const data = buildReportData(model, analysis, options);
  return {
    data,
    html: renderHtmlReport(data),
  };
}

function collectMemberForceRows(result) {
  return Object.values(result?.memberResults || {})
    .map((item) => ({
      memberId: item.memberId || item.id || '-',
      ratio: number(item.check?.ratio),
      n: number(item.Nmax),
      vy: number(item.Vymax),
      vz: number(item.Vzmax),
      my: number(item.Mymax),
      mz: number(item.Mzmax),
    }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 30);
}

function collectDesignRows(analysis) {
  return Object.values({
    ...(analysis?.design?.steel?.memberResults || {}),
    ...(analysis?.design?.concrete?.memberResults || {}),
  })
    .map((item) => ({
      memberId: item.memberId,
      type: item.type,
      status: item.status,
      utilization: number(item.utilization),
      governingCheck: item.governingCheck || null,
      comboId: item.comboId || null,
    }))
    .sort((a, b) => b.utilization - a.utilization)
    .slice(0, 50);
}

function collectMessages(analysis) {
  const messages = [];
  for (const item of analysis?.validation?.errors || []) messages.push({ level: 'error', code: item.code, message: item.message });
  for (const item of analysis?.validation?.warnings || []) messages.push({ level: 'warning', code: item.code, message: item.message });
  for (const result of Object.values(analysis?.pDelta?.byCombo || {})) {
    for (const item of result.warnings || []) messages.push({ level: 'warning', code: item.code, message: item.message });
  }
  return messages;
}

function pickResult(analysis, resultId) {
  if (!analysis) return { id: null, result: null };
  if (resultId === 'PDELTA_ENVELOPE') return { id: resultId, result: analysis.pDelta?.envelope || analysis.envelope || null };
  if (resultId?.startsWith?.('PDELTA:')) {
    const comboId = resultId.slice('PDELTA:'.length);
    return { id: resultId, result: analysis.pDelta?.byCombo?.[comboId]?.result || analysis.pDelta?.envelope || analysis.envelope || null };
  }
  if (resultId && resultId !== 'ENVELOPE') return { id: resultId, result: analysis.byCombo?.[resultId] || analysis.envelope || null };
  if (analysis.pDelta?.envelope) return { id: 'PDELTA_ENVELOPE', result: analysis.pDelta.envelope };
  if (analysis.envelope) return { id: 'ENVELOPE', result: analysis.envelope };
  const firstId = Object.keys(analysis.byCombo || {})[0] || null;
  return { id: firstId, result: firstId ? analysis.byCombo[firstId] : null };
}

function governingSummary(analysis) {
  const governing = analysis?.design?.summary?.governing || analysis?.envelope?.governing?.maxUtilization;
  if (!governing) return null;
  return [governing.memberId, governing.checkId || governing.comboId, formatRatio(governing.ratio || governing.value)]
    .filter(Boolean)
    .join(' / ');
}

function pDeltaSummary(analysis) {
  const summary = analysis?.pDelta?.summary || {};
  return {
    enabled: !!analysis?.pDelta,
    ok: !!analysis?.pDelta?.ok,
    maxAmplification: number(summary.maxAmplification, 1),
    governingCombo: summary.governing?.comboId || null,
    convergedCount: summary.convergedCount || 0,
    comboCount: summary.comboCount || 0,
  };
}

function modalSummary(analysis) {
  const modes = analysis?.dynamics?.modes || [];
  return {
    ok: !!analysis?.dynamics?.ok,
    reason: analysis?.dynamics?.reason || null,
    modeCount: modes.length,
    firstPeriod: modes[0]?.period ?? null,
    firstFrequencyHz: modes[0]?.frequencyHz ?? null,
  };
}

function modelBounds(model) {
  const nodes = model?.nodes || [];
  if (!nodes.length) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } };
  const min = {
    x: Math.min(...nodes.map((node) => number(node.x))),
    y: Math.min(...nodes.map((node) => number(node.y))),
    z: Math.min(...nodes.map((node) => number(node.z))),
  };
  const max = {
    x: Math.max(...nodes.map((node) => number(node.x))),
    y: Math.max(...nodes.map((node) => number(node.y))),
    z: Math.max(...nodes.map((node) => number(node.z))),
  };
  return { min, max, size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z } };
}

function analysisStatus(analysis) {
  if (!analysis) return 'Idle';
  if (analysis.empty) return 'No model';
  return analysis.ok ? 'OK' : 'Check';
}

function defaultLimitations(extra = []) {
  return [
    'This report is a preliminary engineering aid and is not a certified final structural calculation package.',
    'Design checks are limited to the implemented preliminary steel and RC checks.',
    'Unsupported checks must be reviewed separately by a qualified engineer.',
    ...extra,
  ];
}

function renderMetricGrid(items) {
  return `<div class="grid">${items.map(([label, value]) => `<div class="card"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>`;
}

function renderTable(headers, rows) {
  if (!rows.length) return '<div class="note">No rows.</div>';
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderMessages(messages) {
  if (!messages.length) return '<div class="note">No warnings or errors.</div>';
  return `<table><thead><tr><th>Level</th><th>Code</th><th>Message</th></tr></thead><tbody>${messages.map((item) => `<tr><td>${escapeHtml(item.level)}</td><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.message)}</td></tr>`).join('')}</tbody></table>`;
}

function format(value, digits = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  const abs = Math.abs(parsed);
  if (abs !== 0 && (abs < 0.001 || abs >= 100000)) return parsed.toExponential(2);
  return parsed.toFixed(digits).replace(/\.?0+$/, '');
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

function number(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
