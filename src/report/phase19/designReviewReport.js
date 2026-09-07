import { stableHash } from '../../core/stableHash.js';
import { createReportSnapshot, validateReportSnapshot } from '../phase11/reportSnapshot.js';
import { escapeHtml } from '../reportFormat.js';

export const DESIGN_REVIEW_REPORT_VERSION = 'p19-m3-design-report-v1';

// Render only a recorded review; no calculation or live model lookup here.
export function createDesignReviewReport(model, record) {
  const review = record.result;
  const byCombo = Object.fromEntries(review.sources.map(source => [source.comboId, {
    ok: true, dmax: source.maxDisplacement, maxRatio: source.maxUtilization,
  }]));
  const base = createReportSnapshot(model, {
    ok: true, byCombo, design: { summary: review.summary },
    validation: { errors: [], warnings: [] },
  }, { analysisRuns: { rows: record.sourceAnalysisRunIds.map(id => ({ id })) },
    limitationCodes: ['ISSUE_SCOPE_LIMITED', 'INDEPENDENT_REFERENCE_NOT_AVAILABLE'] });
  const { reportSnapshotHash: unused, verdict, ...baseCore } = base;
  const core = { ...baseCore, designReview: {
    version: DESIGN_REVIEW_REPORT_VERSION, designRunId: record.designRunId,
    inputIdentity: record.identity, resultHash: record.resultHash,
    sourceAnalysisRunIds: record.sourceAnalysisRunIds, ...structuredClone(review),
  } };
  const snapshot = { ...core, reportSnapshotHash: stableHash(core), verdict: {
    ...verdict, overall: review.summary.status === 'NG' ? 'FAIL' : 'REVIEW',
  } };
  const validation = validateReportSnapshot(snapshot);
  if (!validation.ok) throw new Error(`REPORT_SNAPSHOT_INVALID:${validation.errors.join(',')}`);
  const reports = Object.fromEntries(['ko-KR', 'en-US'].map(locale => [locale, {
    html: render(snapshot, locale), reportSnapshotHash: snapshot.reportSnapshotHash,
  }]));
  const header = ['designRunId','analysisRunId','comboId','memberId','category','checkId','status','ratio','demand','capacity','unit','expression'];
  const csvRows = [header, ...review.checks.map(row => header.map(key => key === 'designRunId' ? record.designRunId : row[key] ?? ''))];
  return { version: DESIGN_REVIEW_REPORT_VERSION, snapshot, reports,
    json: JSON.stringify(snapshot, null, 2), csv: csvRows.map(row => row.map(csvCell).join(',')).join('\r\n'),
    summary: structuredClone(review.summary), designRunId: record.designRunId,
    reportSnapshotHash: snapshot.reportSnapshotHash, designTransferAllowed: false,
  };
}

function csvCell(value) {
  let text = String(value);
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}
function render(snapshot, locale) {
  const ko = locale === 'ko-KR', review = snapshot.designReview, e = value => escapeHtml(String(value ?? '—'));
  const title = ko ? '탄성 설계 검토 기록' : 'Elastic design review record';
  const rows = review.checks.map(row => `<tr><td>${e(row.memberId)}</td><td>${e(row.category)}<br>${e(row.checkId)}</td><td>${e(row.comboId)}<br>${e(row.analysisRunId)}</td><td>${e(row.status)}</td><td>${e(row.ratio)}</td><td>${e(row.demand)} / ${e(row.capacity)} (${e(row.unit)})</td><td>${e(row.expression)}</td></tr>`).join('');
  return `<!doctype html><html lang="${locale}"><meta charset="utf-8"><title>${title}</title><style>body{font:13px Arial,"Malgun Gothic",sans-serif;color:#14283d;margin:32px}h1{font-size:24px}table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{border:1px solid #c6d0dc;padding:6px;overflow-wrap:anywhere;text-align:left}thead{display:table-header-group}tr{break-inside:avoid}.identity{overflow-wrap:anywhere;color:#456} @media print{@page{size:A4 landscape;margin:12mm}body{margin:0;font-size:9px}}</style><h1>${title}</h1><p>${ko ? '예비 검토 · 검토 필요 · 최종 설계전달 불가' : 'Preliminary · Review required · Final design transfer blocked'}</p><p>${e(review.designRunId)} · ${e(review.summary.status)} · ${ko?'최대 검정비':'Maximum utilization'}: ${e(review.summary.maxUtilization)}</p><p class="identity">Snapshot: ${e(snapshot.reportSnapshotHash)}<br>Input: ${e(review.inputIdentity.inputHash)}<br>Analysis runs: ${e(review.sourceAnalysisRunIds.join(', '))}</p><p>${e(JSON.stringify(review.units))} · ${e(review.axes)} · ${e(review.signConvention)}</p><table><thead><tr>${(ko?['부재','검토','조합 / 해석 기록','상태','검정비','수요 / 내력','식']:['Member','Check','Combination / run','Status','Ratio','Demand / capacity','Expression']).map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><h2>${ko?'적용 범위와 미검토 항목':'Scope and unchecked items'}</h2><ul>${review.limitations.map(x=>`<li>${e(x)}</li>`).join('')}</ul><h2>${ko?'구현·규칙 출처':'Implementation and rule sources'}</h2><ul>${review.ruleSources.map(x=>`<li>${e(x.module)} · ${e(x.method)} · ${e(x.status)}</li>`).join('')}</ul></html>`;
}
