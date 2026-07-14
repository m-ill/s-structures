import { stableHash, stableStringify } from '../../core/stableHash.js';
import { getNonlinearResultSlice } from './resultAccess.js';

export const NONLINEAR_PRODUCT_REPORT_VERSION = 'p8-m10-product-report-v1';

export function buildNonlinearCalculationReport(input = {}) {
  const job = input.job || {};
  const result = input.result || job.result || {};
  const payload = result.payload || result;
  const analysisCase = input.analysisCase || job.analysisCase || {};
  const preflight = input.preflight || job.preflight || {};
  const model = input.model || {};
  const overview = getNonlinearResultSlice(result, { slice: 'overview' }).data;
  const convergence = getNonlinearResultSlice(result, { slice: 'convergence' }).data;
  const provenance = getNonlinearResultSlice(result, { slice: 'provenance' }).data;
  const warnings = [
    ...(preflight.warnings || []),
    ...(payload.warnings || []).map((row) => ({
      code: row.code || 'SOLVER_WARNING',
      message: row.message || String(row),
      stage: 'results',
    })),
  ];
  if (job.stale === true || result.stale === true) {
    warnings.unshift({
      code: 'NONLINEAR_RESULT_STALE',
      message: 'Current model differs from the execution snapshot. This result is retained for history only.',
      stage: 'results',
    });
  }
  const reportSettings = analysisCase.settings || result.settings || {};
  const reportSettingsBytes = stableStringify(reportSettings);
  const reportSettingsHash = stableHash(reportSettings).slice(0, 24);
  const core = {
    version: NONLINEAR_PRODUCT_REPORT_VERSION,
    generatedAt: input.generatedAt || new Date().toISOString(),
    title: analysisCase.name || 'Nonlinear analysis calculation report',
    case: {
      id: analysisCase.id || result.caseId || null,
      kind: analysisCase.kind || result.kind || null,
      engineId: analysisCase.engineId || result.engine?.id || payload.engine?.id || null,
      settings: clone(reportSettings),
      settingsHash: preflight.settingsHash || result.settingsHash || null,
      settingsByteEquivalent: Boolean(
        preflight.settingsBytes
        && preflight.settingsBytes === reportSettingsBytes
        && preflight.settingsHash === reportSettingsHash
      ),
    },
    input: {
      modelHash: preflight.modelHash || job.modelHash || null,
      stale: job.stale === true || result.stale === true,
      domain: clone(preflight.domain || null),
      modelCounts: {
        nodes: model.nodes?.length || preflight.domain?.nodeCount || 0,
        members: model.members?.length || preflight.domain?.elementCount || 0,
        nonlinearMembers: preflight.assignment?.nonlinearMemberCount || 0,
        loadCases: model.loadCases?.length || 0,
        loadCombinations: model.loadCombinations?.length || 0,
        massSources: model.massSources?.length || 0,
      },
      gravity: clone(preflight.gravity || payload.gravity || null),
      mass: clone(preflight.mass || payload.mass?.sourceSnapshot || null),
      groundMotion: clone(preflight.groundMotion || payload.groundMotion || null),
    },
    algorithm: {
      formulation: clone(preflight.capability?.formulation || payload.engine?.formulation || null),
      control: analysisCase.settings?.control || (analysisCase.kind === 'nonlinearTimeHistory' ? 'time-step' : null),
      newton: clone(analysisCase.settings?.newton || analysisCase.settings?.newmark || null),
      damping: clone(analysisCase.settings?.damping || null),
      backend: clone(preflight.runtime?.backend || provenance.routing || null),
      thread: clone(preflight.runtime?.thread || job.runtime || null),
      fallbackPolicy: 'forbidden',
    },
    tolerances: clone(
      analysisCase.settings?.newton?.convergence
        || analysisCase.settings?.newmark?.convergence
        || null,
    ),
    convergence: {
      available: convergence.available,
      selected: clone(convergence.selected),
      rejectedStepCount: convergence.rejectedSteps?.length || overview.summary?.rejectedStepCount || 0,
      status: overview.status,
      termination: clone(overview.termination),
    },
    result: {
      summary: clone(overview.summary),
      runRecordId: provenance.runRecordId,
      provenance: clone(provenance.provenance),
      dependencies: clone(provenance.dependencies),
    },
    warnings,
    qualification: {
      value: overview.qualification || preflight.qualification || 'candidate',
      designBlocked: overview.designBlocked !== false,
      designBlockReason: overview.designBlockReason || preflight.designBlockReason || 'P8_M11_INDEPENDENT_QUALIFICATION_PENDING',
      stale: job.stale === true || result.stale === true,
      statement: '해석 완료는 독립 검증 완료 또는 설계값 사용 가능을 의미하지 않습니다.',
    },
    limitations: clone(payload.limitations || preflight.capability?.limitations || []),
  };
  return deepFreeze({ ...core, reportHash: stableHash(core).slice(0, 24) });
}

export function createNonlinearCalculationReportHtml(input = {}) {
  const report = input.version === NONLINEAR_PRODUCT_REPORT_VERSION
    ? input
    : buildNonlinearCalculationReport(input);
  const metrics = report.result.summary || {};
  const metricRows = Object.entries(metrics).slice(0, 20);
  const warningRows = report.warnings || [];
  const limitations = report.limitations || [];
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(report.title)}</title>
  <style>
    body{margin:0;background:#fff;color:#24384a;font:12px/1.55 Arial,"Malgun Gothic",sans-serif}
    main{max-width:980px;margin:0 auto;padding:28px}
    h1{margin:0 0 4px;color:#004d7a;font-size:22px;letter-spacing:0}h2{margin:24px 0 8px;padding-bottom:5px;border-bottom:2px solid #277da1;font-size:15px;letter-spacing:0}
    .meta{color:#637789}.status{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #cbd9e3;margin:14px 0}.status div{padding:8px;border-right:1px solid #dce5ec}.status div:last-child{border-right:0}.status b,.status span{display:block;overflow-wrap:anywhere}.status span{color:#6c7f90;font-size:10px}
    table{width:100%;border-collapse:collapse}th,td{padding:6px 7px;border:1px solid #d7e1e8;text-align:left;vertical-align:top}th{background:#eff5f8;color:#405b70}.mono{font-family:Consolas,monospace;overflow-wrap:anywhere}
    .warning{border-left:4px solid #d28b12;background:#fff8e5;padding:7px 9px;margin:5px 0}.blocked{border-left:4px solid #bf3d3d;background:#fff1f1;padding:9px}.note{color:#5c7182}
    @media print{main{max-width:none;padding:0}.status{break-inside:avoid}h2{break-after:avoid}}
  </style>
</head>
<body><main>
  <h1>${escapeHtml(report.title)}</h1>
  <div class="meta">${escapeHtml(report.case.id || '')} · ${escapeHtml(report.generatedAt)} · ${escapeHtml(report.reportHash)}</div>
  <div class="status">
    ${statusCell('엔진', report.case.engineId)}
    ${statusCell('상태', report.convergence.status)}
    ${statusCell('검증등급', report.qualification.value)}
    ${statusCell('설계전달', report.qualification.designBlocked ? '차단' : '허용')}
  </div>
  <div class="blocked"><b>${escapeHtml(report.qualification.statement)}</b><br>${escapeHtml(report.qualification.designBlockReason)}</div>
  <h2>입력 및 실행 설정</h2>
  <table><tbody>
    ${tableRow('Model hash', report.input.modelHash)}
    ${tableRow('Model status', report.input.stale ? 'STALE' : 'CURRENT')}
    ${tableRow('Domain hash', report.input.domain?.identityHash)}
    ${tableRow('Settings hash', report.case.settingsHash)}
    ${tableRow('중력 조합', report.input.gravity?.combinationId || report.input.gravity?.combination?.id)}
    ${tableRow('질량원', report.input.mass?.sourceId)}
    ${tableRow('지진파 성분', report.input.groundMotion?.componentCount)}
    ${tableRow('Backend', report.algorithm.backend?.mode || report.algorithm.backend?.executedEngineId)}
    ${tableRow('Thread', report.algorithm.thread?.mode)}
  </tbody></table>
  <h2>알고리즘과 허용오차</h2>
  <table><tbody>
    ${Object.entries(report.algorithm.formulation || {}).map(([key, value]) => tableRow(key, value)).join('')}
    ${Object.entries(report.tolerances || {}).map(([key, value]) => tableRow(key, value)).join('')}
  </tbody></table>
  <h2>수렴 및 결과 요약</h2>
  <table><tbody>${metricRows.map(([key, value]) => tableRow(key, displayValue(value))).join('')}</tbody></table>
  <h2>경고</h2>
  ${warningRows.length ? warningRows.map((row) => `<div class="warning"><b>${escapeHtml(row.code)}</b> ${escapeHtml(row.message)}</div>`).join('') : '<p class="note">기록된 경고가 없습니다.</p>'}
  <h2>적용 한계</h2>
  ${limitations.length ? `<ul>${limitations.map((row) => `<li>${escapeHtml(row)}</li>`).join('')}</ul>` : '<p class="note">추가 한계가 기록되지 않았습니다.</p>'}
  <h2>실행 추적</h2>
  <table><tbody>
    ${tableRow('Run record', report.result.runRecordId)}
    ${tableRow('Dependency hash', report.result.dependencies?.dependencyHash)}
    ${tableRow('Report hash', report.reportHash)}
  </tbody></table>
</main></body></html>`;
}

function statusCell(label, value) {
  return `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(displayValue(value))}</b></div>`;
}

function tableRow(label, value) {
  return `<tr><th>${escapeHtml(label)}</th><td class="mono">${escapeHtml(displayValue(value))}</td></tr>`;
}

function displayValue(value) {
  if (value == null || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function escapeHtml(value) {
  return displayValue(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
