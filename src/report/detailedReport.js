import { materialOf, sectionOf } from '../core/catalogs.js';
import { factorText } from '../core/combinations.js';
import { buildConnectionFoundationReport } from '../design/connectionFoundation.js';
import { buildDesignDemandPackage } from '../design/designDemandPackage.js';
import { buildMemberDesignTraceReport } from '../design/memberDesignTrace.js';
import { buildRcDetailingReport } from '../design/rcDetailing.js';
import { buildServiceabilityDriftReport } from '../design/serviceability.js';
import { buildSteelDetailingReport } from '../design/steelDetailing.js';
import { buildAdvancedElasticTrace } from '../results/advancedElasticTrace.js';
import { buildResultPostprocessing } from '../results/resultPostprocessing.js';
import { buildPracticePlatformReadiness } from '../platform/practicePlatformReadiness.js';
import { buildPracticeValidationReport } from '../platform/practiceValidationReport.js';
import {
  buildKdsLoadStandardAudit,
  defaultKdsCombinationLimitations,
  KDS_LOAD_COMBINATION_VERSION,
  KDS_LOAD_STANDARD_REGISTRY_VERSION,
  summarizeKdsLoadCombinationCoverage,
} from '../core/kdsLoadCombinations.js';
import {
  analysisStatus,
  escapeHtml,
  finiteNumber as finite,
  formatDriftRatio,
  formatForce,
  formatLength,
  formatMoment,
  formatNumber as format,
  formatRatio,
  formatTraceInputs,
  formatTraceValue,
  formatVector,
  renderList,
  renderMetricGrid,
  renderMessageTable,
  renderTable,
  statusLabel,
} from './reportFormat.js';

export const DETAILED_REPORT_VERSION = 'm34-detailed-design-report';

export function buildDetailedReportData(model, analysis, options = {}) {
  const activeResult = pickResult(analysis, options.resultId);
  const loadCases = summarizeLoadCases(model);
  const combinations = summarizeCombinations(model);
  const combinationResults = summarizeCombinationResults(model, analysis);
  const memberChecks = summarizeMemberChecks(model, analysis, activeResult.result);
  const governingMembers = memberChecks
    .filter((row) => Number.isFinite(row.utilization))
    .sort((a, b) => b.utilization - a.utilization)
    .slice(0, options.governingLimit || 20);

  return {
    version: DETAILED_REPORT_VERSION,
    generatedAt: options.generatedAt || new Date().toISOString(),
    title: options.title || model?.meta?.name || 'S-Structures Detailed Report',
    scope: {
      status: analysisStatus(analysis),
      phase: 'calculation-trace-scaffold',
      statement: 'This report traces the current elastic analysis and preliminary member checks. It is not a sealed final design package.',
      missingScopes: defaultMissingScopes(options.missingScopes),
    },
    codeBasis: {
      loadCombinationPresetVersion: KDS_LOAD_COMBINATION_VERSION,
      loadStandardRegistryVersion: KDS_LOAD_STANDARD_REGISTRY_VERSION,
      loadCombinationCoverage: summarizeKdsLoadCombinationCoverage(model),
      loadStandardAudit: buildKdsLoadStandardAudit(model),
      limitations: defaultKdsCombinationLimitations(),
    },
    model: summarizeModel(model),
    loadDerivation: summarizeLoadDerivation(model),
    loadCases,
    combinations,
    analysis: {
      ok: !!analysis?.ok,
      status: analysisStatus(analysis),
      resultId: activeResult.id,
      comboCount: analysis?.combos?.length || 0,
      errorCount: analysis?.validation?.errors?.length || 0,
      warningCount: analysis?.validation?.warnings?.length || 0,
      modelHealthScore: analysis?.validation?.modelHealthScore ?? null,
      auditOk: analysis?.audit?.ok ?? null,
      maxEquilibriumResidual: analysis?.audit?.maxEquilibriumResidual ?? null,
      maxDisplacement: activeResult.result?.dmax ?? analysis?.envelope?.dmax ?? null,
      maxUtilization: analysis?.design?.summary?.maxUtilization ?? analysis?.envelope?.maxRatio ?? null,
      governing: analysis?.design?.summary?.governing || analysis?.envelope?.governing?.maxUtilization || null,
    },
    combinationResults,
    advancedElasticTrace: buildAdvancedElasticTrace(model, analysis),
    designDemandPackage: analysis?.design?.demandPackage || buildDesignDemandPackage(model, analysis),
    serviceability: buildServiceabilityDriftReport(model, analysis, options.serviceability || {}),
    resultPostprocessing: buildResultPostprocessing(model, analysis, options.resultPostprocessing || {}),
    practicePlatform: buildPracticePlatformReadiness(model, analysis, options.workflow || {}),
    practiceValidation: buildPracticeValidationReport(model, analysis, options.practiceValidation || {}),
    memberChecks,
    governingMembers,
    memberDesignTrace: buildMemberDesignTraceReport(model, analysis),
    rcDetailing: buildRcDetailingReport(model, analysis),
    steelDetailing: buildSteelDetailingReport(model, analysis),
    connectionFoundation: buildConnectionFoundationReport(model, analysis),
    messages: collectMessages(analysis),
    actionItems: buildActionItems(model, analysis, memberChecks),
  };
}

export function renderDetailedReportHtml(report) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(report.title)}</title>
  <style>
    body{font:13px/1.5 Arial,sans-serif;color:#172635;margin:0;background:#eef3f7}
    main{max-width:1120px;margin:0 auto;background:white;min-height:100vh;padding:30px 36px}
    h1{font-size:25px;margin:0 0 5px;color:#003f73}
    h2{font-size:17px;margin:24px 0 8px;color:#003f73;border-bottom:2px solid #e3edf5;padding-bottom:4px}
    h3{font-size:14px;margin:16px 0 6px;color:#22445f}
    .meta{color:#66798b;margin-bottom:16px}
    .note{border:1px solid #dce8f1;background:#f8fbfe;border-radius:6px;padding:10px 12px;margin:8px 0}
    .warn{border-color:#ead49a;background:#fff9e8}.bad{border-color:#efb9b9;background:#fff5f5}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 14px}
    .metric{border:1px solid #dce8f1;border-radius:6px;background:#fbfdff;padding:9px}
    .metric span{display:block;color:#647484;font-size:11px}.metric b{font-size:15px;color:#172635}
    table{width:100%;border-collapse:collapse;margin:8px 0 14px}
    th,td{border-bottom:1px solid #e4ebf2;padding:6px 7px;text-align:right;vertical-align:top}
    th:first-child,td:first-child{text-align:left}
    th{background:#f6f9fc;color:#526579}
    .status-ok{color:#167647;font-weight:700}.status-warn{color:#9a6500;font-weight:700}.status-ng{color:#b42323;font-weight:700}
    ul{margin:8px 0 0 18px;padding:0}
    @media print{body{background:white}main{padding:0;max-width:none}.metric,.note{break-inside:avoid}}
  </style>
</head>
<body>
<main>
  <h1>${escapeHtml(report.title)}</h1>
  <div class="meta">Generated ${escapeHtml(report.generatedAt)} | ${escapeHtml(report.version)}</div>
  ${renderMetricGrid([
    ['Status', report.analysis.status],
    ['Nodes', report.model.nodeCount],
    ['Members', report.model.memberCount],
    ['Combos', report.analysis.comboCount],
    ['Max disp.', formatLength(report.analysis.maxDisplacement)],
    ['Max util.', formatRatio(report.analysis.maxUtilization)],
    ['Audit', report.analysis.auditOk == null ? '-' : report.analysis.auditOk ? 'OK' : 'WARN'],
    ['Eq. residual', formatRatio(report.analysis.maxEquilibriumResidual)],
    ['Health', report.analysis.modelHealthScore == null ? '-' : `${report.analysis.modelHealthScore}/100`],
    ['Warnings', report.analysis.warningCount],
    ['Errors', report.analysis.errorCount],
  ])}
  <div class="note warn">${escapeHtml(report.scope.statement)}</div>

  <h2>1. Model Basis</h2>
  ${renderTable(['Item', 'Value'], [
    ['Schema', report.model.schemaVersion],
    ['Units', report.model.unitsText],
    ['Model bounds X/Y/Z', report.model.boundsText],
    ['Load cases', report.model.loadCaseCount],
    ['Load combinations', report.model.combinationCount],
  ])}

  <h2>2. Load Case Trace</h2>
  ${renderTable(['Case', 'Type', 'Loads', 'Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'], report.loadCases.map((row) => [
    row.id,
    row.type,
    row.loadCount,
    formatForce(row.total[0]),
    formatForce(row.total[1]),
    formatForce(row.total[2]),
    formatMoment(row.moment[0]),
    formatMoment(row.moment[1]),
    formatMoment(row.moment[2]),
  ]))}

  <h2>2A. Load Derivation Summary</h2>
  ${renderLoadDerivation(report.loadDerivation)}

  <h2>3. Load Combination Trace</h2>
  ${renderTable(['Combo', 'Type', 'Factors', 'Rule', 'Basis'], report.combinations.map((row) => [
    row.id,
    row.type,
    row.factorsText,
    row.ruleText || '-',
    row.basis || '-',
  ]))}
  <h3>KDS-Style Preset Coverage</h3>
  ${renderTable(['Item', 'Value'], [
    ['Generated preset count', report.codeBasis.loadCombinationCoverage.generatedCount],
    ['Missing common symbols', report.codeBasis.loadCombinationCoverage.missing.join(', ') || '-'],
    ['Preset version', report.codeBasis.loadCombinationPresetVersion],
    ['Standard registry', report.codeBasis.loadStandardRegistryVersion],
  ])}
  <h3>KDS-Style Load Standard Audit</h3>
  ${renderTable(['Symbol', 'Status', 'Mapped cases', 'Project input'], report.codeBasis.loadStandardAudit.symbols.map((row) => [
    row.symbol,
    row.status,
    row.caseIds.join(', ') || '-',
    row.projectInputRequired ? 'Required' : 'Optional',
  ]))}
  ${renderTable(['Preset', 'Status', 'Required', 'Any', 'Generated'], report.codeBasis.loadStandardAudit.presetAudit.map((row) => [
    row.id,
    row.status,
    row.required.join(', ') || '-',
    row.requiredAny.join(', ') || '-',
    row.generatedCount,
  ]))}

  <h2>4. Combination Analysis Results</h2>
  ${renderTable(['Combo', 'OK', 'Max disp.', 'Max util.', 'Total load', 'Total reaction', 'Residual'], report.combinationResults.map((row) => [
    row.id,
    row.ok ? 'OK' : 'Check',
    formatLength(row.maxDisplacement),
    formatRatio(row.maxUtilization),
    formatVector(row.totalLoad, formatForce),
    formatVector(row.totalReaction, formatForce),
    formatRatio(row.equilibriumResidual),
  ]))}

  <h2>4A. Advanced Elastic Trace</h2>
  ${renderAdvancedElasticTrace(report.advancedElasticTrace)}

  <h2>4B. Serviceability Drift Review</h2>
  ${renderServiceability(report.serviceability)}

  <h2>4C. Result Postprocessing Tables</h2>
  ${renderResultPostprocessing(report.resultPostprocessing)}

  <h2>5. Member Check Trace</h2>
  ${renderDesignDemandPackage(report.designDemandPackage)}
  ${renderTable(['Member', 'Role', 'Material', 'Section', 'Status', 'Util.', 'Governing', 'Combo', 'N', 'Vy', 'Vz', 'My', 'Mz'], report.memberChecks.map((row) => [
    row.memberId,
    row.role,
    row.material,
    row.section,
    statusLabel(row.status),
    formatRatio(row.utilization),
    row.governingCheck || '-',
    row.comboId || '-',
    formatForce(row.demands.N),
    formatForce(row.demands.Vy),
    formatForce(row.demands.Vz),
    formatMoment(row.demands.My),
    formatMoment(row.demands.Mz),
  ]))}

  <h2>6. Governing Members</h2>
  ${renderTable(['Rank', 'Member', 'Status', 'Util.', 'Check', 'Combo', 'Station'], report.governingMembers.map((row, index) => [
    index + 1,
    row.memberId,
    statusLabel(row.status),
    formatRatio(row.utilization),
    row.governingCheck || '-',
    row.comboId || '-',
    format(row.station),
  ]))}

  <h2>6A. Member Design Trace Matrix</h2>
  ${renderTable(['Member', 'Type', 'Status', 'Util.', 'Governing', 'Formula rows', 'Action items'], report.memberDesignTrace.rows.map((row) => [
    row.memberId,
    row.designType,
    statusLabel(row.status),
    formatRatio(row.utilization),
    row.governingCheck || '-',
    row.formulaTrace.length,
    row.actionItems.join('; '),
  ]))}

  <h2>7. RC Reinforcement Schedule</h2>
  ${renderRcDetailing(report.rcDetailing)}

  <h2>8. Steel Member Review Schedule</h2>
  ${renderSteelDetailing(report.steelDetailing)}

  <h2>9. Connection And Foundation Preliminary Review</h2>
  ${renderConnectionFoundation(report.connectionFoundation)}

  <h2>10. Messages And Action Items</h2>
  ${renderPracticePlatform(report.practicePlatform)}
  ${renderPracticeValidation(report.practiceValidation)}
  ${renderMessages(report.messages)}
  ${renderList(report.actionItems)}

  <h2>11. Remaining Design Scope</h2>
  ${renderList(report.scope.missingScopes)}
</main>
</body>
</html>`;
}

export function createDetailedHtmlReport(model, analysis, options = {}) {
  const data = buildDetailedReportData(model, analysis, options);
  return {
    data,
    html: renderDetailedReportHtml(data),
  };
}

function summarizeModel(model) {
  const bounds = modelBounds(model);
  return {
    schemaVersion: model?.schemaVersion || null,
    units: model?.units || {},
    unitsText: Object.entries(model?.units || {}).map(([key, value]) => `${key}:${value}`).join(', ') || '-',
    nodeCount: model?.nodes?.length || 0,
    memberCount: model?.members?.length || 0,
    loadCount: model?.loads?.length || 0,
    loadCaseCount: model?.loadCases?.length || 0,
    combinationCount: model?.loadCombinations?.length || 0,
    bounds,
    boundsText: `${format(bounds.size.x)} / ${format(bounds.size.y)} / ${format(bounds.size.z)}`,
  };
}

function summarizeLoadCases(model) {
  return (model?.loadCases || []).map((loadCase) => {
    const loads = (model?.loads || []).filter((load) => (load.case || model.loadCases?.[0]?.id) === loadCase.id);
    const total = [0, 0, 0];
    const moment = [0, 0, 0];
    for (const load of loads) {
      const vector = loadVector(model, load);
      for (let i = 0; i < 3; i += 1) {
        total[i] += vector.force[i];
        moment[i] += vector.moment[i];
      }
    }
    return {
      id: loadCase.id,
      name: loadCase.name || loadCase.id,
      type: loadCase.type || 'other',
      loadCount: loads.length,
      total,
      moment,
    };
  });
}

function summarizeLoadDerivation(model) {
  const estimation = model?.loadEstimation;
  if (!estimation) return null;
  return {
    version: estimation.version || null,
    occupancy: estimation.basis?.occupancy || null,
    occupancyLabel: estimation.basis?.occupancyLabel || null,
    summary: estimation.summary || null,
    gravity: estimation.storyLoads?.gravity || [],
    lateral: estimation.storyLoads?.lateral || [],
    derivationTrace: estimation.derivationTrace || null,
    limitations: estimation.limitations || [],
  };
}

function summarizeCombinations(model) {
  return (model?.loadCombinations || []).map((combo) => ({
    id: combo.id,
    name: combo.name || combo.id,
    type: combo.type || 'strength',
    factors: { ...(combo.factors || {}) },
    factorsText: factorText(combo.factors || {}),
    basis: combo.basis || combo.codeReference || combo.generatedBy || null,
    ruleText: combo.ruleTrace
      ? [combo.ruleTrace.sourcePreset, combo.ruleTrace.lateralCaseId, combo.ruleTrace.sign].filter(Boolean).join(' / ')
      : null,
  }));
}

function summarizeCombinationResults(model, analysis) {
  return (analysis?.combos || model?.loadCombinations || []).map((combo) => {
    const result = analysis?.byCombo?.[combo.id] || null;
    return {
      id: combo.id,
      name: combo.name || combo.id,
      type: combo.type || 'strength',
      ok: !!result?.ok && !!result?.anyOk,
      maxDisplacement: result?.dmax ?? null,
      maxUtilization: result?.maxRatio ?? null,
      totalLoad: result?.summary?.totalLoad || null,
      totalReaction: result?.summary?.totalReaction || null,
      equilibriumResidual: result?.summary?.equilibriumResidual ?? null,
    };
  });
}

function summarizeMemberChecks(model, analysis, resultSet) {
  const demands = resultSet?.memberResults || analysis?.envelope?.memberResults || {};
  const design = {
    ...(analysis?.design?.steel?.memberResults || {}),
    ...(analysis?.design?.concrete?.memberResults || {}),
  };
  return (model?.members || []).map((member) => {
    const demand = demands[member.id] || {};
    const check = design[member.id] || demand;
    const material = materialOf(model, member.matId);
    const section = sectionOf(model, member.secId);
    return {
      memberId: member.id,
      role: check.role || member.type || 'member',
      material: material?.name || member.matId || '-',
      section: section?.name || member.secId || '-',
      status: check.status || demand.check?.status || 'UNCK',
      utilization: finite(check.utilization, demand.check?.ratio, null),
      governingCheck: check.governingCheck || demand.check?.governing || null,
      comboId: check.comboId || demand.check?.comboId || demand.governing?.utilization?.comboId || null,
      station: finite(check.x, demand.governing?.utilization?.x, null),
      demands: {
        N: finite(check.demands?.N, demand.Nmax, null),
        Vy: finite(check.demands?.Vy, demand.Vymax, null),
        Vz: finite(check.demands?.Vz, demand.Vzmax, null),
        My: finite(check.demands?.My, demand.Mymax, null),
        Mz: finite(check.demands?.Mz, demand.Mzmax, null),
      },
      method: check.method || demand.check?.method || null,
      messages: check.messages || [],
    };
  });
}

function buildActionItems(model, analysis, memberChecks) {
  const out = [];
  if (!model?.loadCases?.length) out.push('Define load cases before issuing a calculation report.');
  if (!model?.loadCombinations?.length) out.push('Define load combinations before issuing a calculation report.');
  if (analysis?.validation?.errors?.length) out.push('Resolve model validation errors before relying on analysis results.');
  if (memberChecks.some((row) => row.status === 'NG')) out.push('Review members with NG status and revise size, material, or load path.');
  if (!analysis?.design?.summary?.checkedMembers) out.push('No implemented member design checks were completed for this model.');
  if (!out.length) out.push('Review project-specific design basis, load derivation, detailing, connections, and foundation design.');
  return out;
}

function collectMessages(analysis) {
  const messages = [];
  for (const item of analysis?.validation?.errors || []) messages.push({ level: 'error', code: item.code, message: item.message });
  for (const item of analysis?.validation?.warnings || []) messages.push({ level: 'warning', code: item.code, message: item.message });
  for (const section of [analysis?.design?.steel, analysis?.design?.concrete]) {
    for (const item of section?.warnings || []) {
      messages.push({ level: item.level || 'warning', code: item.code || section.type, message: item.message, target: item.memberId || null });
    }
  }
  return messages;
}

function defaultMissingScopes(extra = []) {
  return [
    'Project design basis: occupancy, importance factor, site class, exposure, wind/seismic procedure, and serviceability criteria.',
    'Load derivation: dead, live, wind, seismic, snow, rain, soil, temperature, and construction load calculation sheets.',
    'Full KDS equation trace for every generated load combination and project-specific exception.',
    'RC member detailing: longitudinal bars, stirrups, development length, lap splice, anchorage, and constructability checks.',
    'Steel member detailing: compactness, lateral torsional buckling, connection forces, base plates, and weld/bolt checks.',
    'Foundation design: soil bearing, pile/footing design, settlement, uplift, sliding, overturning, and reinforcement.',
    'Drawing import and vision-assisted modeling audit trail for future CAD/image/MGT workflows.',
    ...extra,
  ];
}

function pickResult(analysis, resultId) {
  if (!analysis) return { id: null, result: null };
  if (resultId && resultId !== 'ENVELOPE') return { id: resultId, result: analysis.byCombo?.[resultId] || analysis.envelope || null };
  if (analysis.pDelta?.envelope) return { id: 'PDELTA_ENVELOPE', result: analysis.pDelta.envelope };
  if (analysis.envelope) return { id: 'ENVELOPE', result: analysis.envelope };
  const firstId = Object.keys(analysis.byCombo || {})[0] || null;
  return { id: firstId, result: firstId ? analysis.byCombo[firstId] : null };
}

function loadVector(model, load) {
  const dir = directionVector(load.direction || load.dir);
  const force = [0, 0, 0];
  const moment = [0, 0, 0];
  if (load.type === 'moment' || load.M != null) {
    const value = finite(load.M, 0);
    for (let i = 0; i < 3; i += 1) moment[i] += dir[i] * value;
    return { force, moment };
  }
  const magnitude = load.w != null
    ? finite(load.w, 0) * memberLength(model, load.member)
    : finite(load.P, 0);
  for (let i = 0; i < 3; i += 1) force[i] += dir[i] * magnitude;
  return { force, moment };
}

function directionVector(value) {
  if (Array.isArray(value)) return [finite(value[0], 0), finite(value[1], 0), finite(value[2], 0)];
  const dir = String(value || '-z').toLowerCase();
  const sign = dir.startsWith('-') ? -1 : 1;
  const axis = dir.replace(/^[+-]/, '');
  if (axis === 'x') return [sign, 0, 0];
  if (axis === 'y') return [0, sign, 0];
  return [0, 0, sign];
}

function memberLength(model, memberId) {
  const member = (model?.members || []).find((item) => item.id === memberId);
  const n1 = (model?.nodes || []).find((node) => node.id === member?.n1);
  const n2 = (model?.nodes || []).find((node) => node.id === member?.n2);
  if (!n1 || !n2) return 1;
  return Math.hypot(finite(n2.x, 0) - finite(n1.x, 0), finite(n2.y, 0) - finite(n1.y, 0), finite(n2.z, 0) - finite(n1.z, 0));
}

function modelBounds(model) {
  const nodes = model?.nodes || [];
  if (!nodes.length) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } };
  const min = {
    x: Math.min(...nodes.map((node) => finite(node.x, 0))),
    y: Math.min(...nodes.map((node) => finite(node.y, 0))),
    z: Math.min(...nodes.map((node) => finite(node.z, 0))),
  };
  const max = {
    x: Math.max(...nodes.map((node) => finite(node.x, 0))),
    y: Math.max(...nodes.map((node) => finite(node.y, 0))),
    z: Math.max(...nodes.map((node) => finite(node.z, 0))),
  };
  return { min, max, size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z } };
}

function renderMessages(messages) {
  return renderMessageTable(messages, { emptyText: 'No validation or design messages.' });
}

function renderServiceability(serviceability) {
  if (!serviceability?.rows?.length) return '<div class="note">No story drift data available.</div>';
  return [
    renderTable(['Item', 'Value'], [
      ['Version', serviceability.version],
      ['Limit', serviceability.criteria.limitText],
      ['Status', statusLabel(serviceability.summary.status)],
      ['Max drift', formatLength(serviceability.summary.maxDrift)],
      ['Max drift ratio', formatDriftRatio(serviceability.summary.maxDriftRatio)],
      ['Governing', serviceability.summary.governing ? `${serviceability.summary.governing.comboId} / Story ${serviceability.summary.governing.story}` : '-'],
    ]),
    renderTable(['Combo', 'Story', 'Height', 'Drift X', 'Drift Y', 'Drift', 'Ratio', 'D/L', 'Status'], serviceability.rows.map((row) => [
      row.comboId,
      row.story,
      `${format(row.height)} m`,
      formatLength(row.driftX),
      formatLength(row.driftY),
      formatLength(row.drift),
      formatDriftRatio(row.driftRatio),
      formatRatio(row.demandToLimit),
      statusLabel(row.status),
    ])),
  ].join('');
}

function renderAdvancedElasticTrace(trace) {
  if (!trace) return '<div class="note">No advanced elastic trace available.</div>';
  return [
    renderTable(['Item', 'Value'], [
      ['Version', trace.version],
      ['P-Delta', trace.summary.pDeltaStatus],
      ['P-Delta combos', trace.summary.pDeltaComboCount],
      ['Modes', trace.summary.modeCount],
      ['First period', format(trace.summary.firstPeriod)],
      ['RSA directions', trace.summary.rsaDirectionCount],
    ]),
    renderTable(['Combo', 'Converged', 'Amp.', 'Iterations', 'Reason'], trace.pDelta.combos.map((row) => [
      row.comboId,
      row.converged ? 'Yes' : 'No',
      formatRatio(row.amplification),
      row.iterationCount,
      row.reason || '-',
    ])),
    renderTable(['Mode', 'T', 'Hz', 'Mass X', 'Mass Y'], trace.modal.modes.map((row) => [
      row.id,
      format(row.period),
      format(row.frequencyHz),
      formatRatio(row.massX),
      formatRatio(row.massY),
    ])),
    renderTable(['Dir', 'SRSS disp.', 'Max modal disp.', 'Mass ratio'], trace.responseSpectrum.directions.map((row) => [
      row.direction,
      formatLength(row.srssDisplacement),
      formatLength(row.maxModalDisplacement),
      formatRatio(row.participatingMassRatio),
    ])),
  ].join('');
}

function renderResultPostprocessing(post) {
  if (!post) return '<div class="note">No result postprocessing data available.</div>';
  return [
    renderTable(['Item', 'Value'], [
      ['Version', post.version],
      ['Story rows', post.summary.storyRowCount],
      ['Member rows', post.summary.memberRowCount],
      ['Foundation rows', post.summary.foundationRowCount],
      ['Uplift nodes', post.summary.upliftNodeCount],
    ]),
    renderTable(['Combo', 'Story', 'Weight', 'Vx', 'Vy', 'Torsion', 'Drift', 'Status'], post.storyResults.map((row) => [
      row.comboId,
      row.story,
      formatForce(row.weight),
      formatForce(row.cumulativeShearX),
      formatForce(row.cumulativeShearY),
      formatMoment(row.torsionMz),
      formatDriftRatio(row.driftRatio),
      statusLabel(row.driftStatus),
    ])),
    renderTable(['Member', 'Stations', 'Governing', 'Combo', 'Station', 'Value'], post.memberStationForces.map((row) => [
      row.memberId,
      row.stationCount,
      row.governing?.key || '-',
      row.governing?.comboId || '-',
      format(row.governing?.x),
      formatForce(row.governing?.value),
    ])),
    renderTable(['Node', 'Rz min', 'Rz max', 'Combo', 'Uplift'], post.foundationReactions.map((row) => [
      row.nodeId,
      formatForce(row.reactions.rz.min),
      formatForce(row.reactions.rz.max),
      row.governingVerticalCombo || '-',
      row.uplift ? 'Yes' : 'No',
    ])),
  ].join('');
}

function renderDesignDemandPackage(pkg) {
  if (!pkg) return '<div class="note">No design demand package available.</div>';
  return [
    renderTable(['Demand package', 'Value'], [
      ['Version', pkg.version],
      ['Active result', pkg.source?.activeResultId || '-'],
      ['Members', pkg.summary.memberCount],
      ['Foundations', pkg.summary.foundationCount],
      ['Uplift nodes', pkg.summary.upliftNodeCount],
    ]),
  ].join('');
}

function renderPracticePlatform(platform) {
  if (!platform) return '<div class="note">No practice platform state available.</div>';
  return [
    '<h3>Platform Workflow And AI QA</h3>',
    renderTable(['Item', 'Value'], [
      ['Version', platform.version],
      ['Status', platform.summary.status],
      ['Revision', platform.summary.revision],
      ['Approval', platform.summary.approvalState],
      ['Import sources', platform.summary.importSourceCount],
    ]),
    renderTable(['Check', 'Status', 'Note'], platform.qaChecklist.items.map((row) => [
      row.label,
      statusLabel(row.status),
      row.note || '-',
    ])),
  ].join('');
}

function renderPracticeValidation(validation) {
  if (!validation) return '<div class="note">No practice validation report available.</div>';
  return [
    '<h3>Practice Validation Report</h3>',
    renderTable(['Item', 'Value'], [
      ['Version', validation.version],
      ['Status', validation.status],
      ['P-Delta', validation.pDelta.status],
      ['Result tables', validation.resultTables.status],
      ['Calculation trace', validation.calculation.status],
      ['Open issues', validation.issues.summary.openCount],
    ]),
    renderTable(['Issue', 'Severity', 'Status', 'Action'], validation.issues.issues.slice(0, 20).map((row) => [
      row.message,
      statusLabel(row.severity),
      row.status,
      row.action,
    ])),
  ].join('');
}

function renderLoadDerivation(loadDerivation) {
  if (!loadDerivation) return '<div class="note">No design-basis load derivation is attached to this model.</div>';
  return [
    renderTable(['Item', 'Value'], [
      ['Version', loadDerivation.version || '-'],
      ['Occupancy', loadDerivation.occupancyLabel || loadDerivation.occupancy || '-'],
      ['Stories', loadDerivation.summary?.storyCount ?? '-'],
      ['Total dead', formatForce(loadDerivation.summary?.totalDead)],
      ['Total live', formatForce(loadDerivation.summary?.totalLive)],
      ['Total wind X/Y', `${formatForce(loadDerivation.summary?.totalWindX)} / ${formatForce(loadDerivation.summary?.totalWindY)}`],
      ['Total seismic X/Y', `${formatForce(loadDerivation.summary?.totalSeismicX)} / ${formatForce(loadDerivation.summary?.totalSeismicY)}`],
    ]),
    renderTable(['Story', 'Z', 'Area', 'D intensity', 'D total', 'L intensity', 'L total', 'Beam length'], loadDerivation.gravity.map((row) => [
      row.story,
      format(row.z),
      `${format(row.area)} m2`,
      `${format(row.deadIntensity)} kN/m2`,
      formatForce(row.deadTotal),
      `${format(row.liveIntensity)} kN/m2`,
      formatForce(row.liveTotal),
      `${format(row.beamLength)} m`,
    ])),
    renderTable(['Story', 'Z', 'Height', 'Wind X', 'Wind Y', 'Effective seismic weight'], loadDerivation.lateral.map((row) => [
      row.story,
      format(row.z),
      `${format(row.storyHeight)} m`,
      formatForce(row.windX),
      formatForce(row.windY),
      formatForce(row.effectiveWeight),
    ])),
    loadDerivation.derivationTrace ? '<h3>Load Derivation Formula Trace</h3>' : '',
    loadDerivation.derivationTrace ? renderTable(['ID', 'Group', 'Case', 'Formula', 'Inputs', 'Result'], loadDerivation.derivationTrace.rows.map((row) => [
      row.id,
      row.group,
      row.caseId || '-',
      row.formula,
      formatTraceInputs(row.inputs),
      `${formatTraceValue(row.result)} ${row.unit || ''}`.trim(),
    ])) : '',
    renderList(loadDerivation.limitations || []),
  ].join('');
}

function renderRcDetailing(rcDetailing) {
  if (!rcDetailing?.rows?.length) return '<div class="note">No RC member detailing rows are available for this model.</div>';
  return [
    renderTable(['Item', 'Value'], [
      ['Version', rcDetailing.version],
      ['Members', rcDetailing.summary.memberCount],
      ['OK / WARN / NG', `${rcDetailing.summary.okCount} / ${rcDetailing.summary.warnCount} / ${rcDetailing.summary.ngCount}`],
      ['Max utilization', formatRatio(rcDetailing.summary.maxUtilization)],
    ]),
    renderTable(['Member', 'Role', 'Status', 'Util.', 'Longitudinal strong', 'Longitudinal weak', 'Stirrup Z', 'Stirrup Y'], rcDetailing.rows.map((row) => [
      row.memberId,
      row.role,
      row.status,
      formatRatio(row.utilization),
      row.longitudinal.strongAxis.label,
      row.longitudinal.weakAxis.label,
      row.transverse.zDirection.label,
      row.transverse.yDirection.label,
    ])),
    renderList(rcDetailing.limitations || []),
  ].join('');
}

function renderSteelDetailing(steelDetailing) {
  if (!steelDetailing?.rows?.length) return '<div class="note">No steel member review rows are available for this model.</div>';
  return [
    renderTable(['Item', 'Value'], [
      ['Version', steelDetailing.version],
      ['Members', steelDetailing.summary.memberCount],
      ['OK / WARN / NG', `${steelDetailing.summary.okCount} / ${steelDetailing.summary.warnCount} / ${steelDetailing.summary.ngCount}`],
      ['Max utilization', formatRatio(steelDetailing.summary.maxUtilization)],
    ]),
    renderTable(['Member', 'Role', 'Status', 'Util.', 'Governing', 'Combo', 'KL/r', 'Defl. ratio', 'Action'], steelDetailing.rows.map((row) => [
      row.memberId,
      row.role,
      row.status,
      formatRatio(row.utilization),
      row.governingCheck || '-',
      row.comboId || '-',
      formatRatio(row.slenderness.ratio),
      formatRatio(row.deflection.ratio),
      row.reviewActions[0] || '-',
    ])),
    renderList(steelDetailing.limitations || []),
  ].join('');
}

function renderConnectionFoundation(report) {
  if (!report) return '<div class="note">No connection or foundation review is available.</div>';
  return [
    renderTable(['Item', 'Value'], [
      ['Version', report.version],
      ['Connections', report.summary.connectionCount],
      ['Foundations', report.summary.foundationCount],
      ['Max connection util.', formatRatio(report.summary.maxConnectionUtilization)],
      ['Max sliding ratio', formatRatio(report.summary.maxSlidingRatio)],
    ]),
    renderTable(['Member', 'Status', 'Util.', 'Axial', 'Vy', 'Vz', 'My', 'Mz', 'Action'], report.connectionRows.map((row) => [
      row.memberId,
      row.status,
      formatRatio(row.utilization),
      formatForce(row.demands.axial),
      formatForce(row.demands.shearY),
      formatForce(row.demands.shearZ),
      formatMoment(row.demands.momentY),
      formatMoment(row.demands.momentZ),
      row.action,
    ])),
    renderTable(['Node', 'Status', 'Vertical', 'Horizontal', 'Area', 'Square size', 'Sliding', 'Action'], report.foundationRows.map((row) => [
      row.nodeId,
      row.status,
      formatForce(row.reaction.vertical),
      formatForce(row.reaction.horizontal),
      `${format(row.requiredArea)} m2`,
      `${format(row.equivalentSquareSize)} m`,
      formatRatio(row.slidingRatio),
      row.action,
    ])),
    renderList(report.limitations || []),
  ].join('');
}
