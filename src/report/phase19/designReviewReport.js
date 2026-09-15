import {REPORT_FONT_CSS,REPORT_CONTRACT} from '../reportContract.js';
import {formatPracticalCounts} from '../practicalSummaryFormat.js';
import {formatDesignCodeBasis} from '../designCodeBasisFormat.js';
import { stableHash, sha256 } from '../../core/stableHash.js';
import { createReportSnapshot, validateReportSnapshot } from '../phase11/reportSnapshot.js';
import { escapeHtml } from '../reportFormat.js';

export const DESIGN_REVIEW_REPORT_VERSION = 'p25-design-report-v5-incomplete-summary';

// Render only a recorded review; no calculation or live model lookup here.
export function createDesignReviewReport(model, record, context = {}) {
  const review = record.result;
  const byCombo = Object.fromEntries(review.sources.map(source => [source.comboId, {
    ok: true, dmax: source.maxDisplacement, maxRatio: source.maxUtilization, summary:{equilibriumResidual:source.equilibriumResidual},
  }]));
  const displacementValues = review.sources.map(row=>row.maxDisplacement).filter(Number.isFinite);
  const equilibriumValues = review.sources.map(row=>row.equilibriumResidual).filter(Number.isFinite);
  const maxDisplacement = displacementValues.length ? Math.max(...displacementValues) : null;
  const maxEquilibriumResidual = equilibriumValues.length === review.sources.length ? Math.max(...equilibriumValues) : null;
  const auditOk = review.sources.length > 0 && review.sources.every(row=>row.equilibriumStatus==='PASS');
  const base = createReportSnapshot(model, {
    ok: true, byCombo, envelope:{dmax:maxDisplacement},audit:{maxEquilibriumResidual},design: { summary: review.summary },
    validation: { errors: [], warnings: [] },
  }, { projectId:model.projectId||model.meta?.projectId||null, sourceRevision:context.sourceRevision||null,buildId:record.identity.buildBound?record.identity.buildHash:null,qualityAudit:{ok:auditOk,items:review.sources.map(row=>({status:row.equilibriumStatus}))},analysisRuns: { rows: record.sourceAnalysisRunIds.map(id => ({ id })) },
    limitationCodes: ['ISSUE_SCOPE_LIMITED', 'INDEPENDENT_REFERENCE_NOT_AVAILABLE'] });
  const { reportSnapshotHash: unused, verdict, ...baseCore } = base;
  const core = { ...baseCore, provenance:{...baseCore.provenance,buildIdentity:context.buildIdentity||null,buildBound:record.identity.buildBound,rulePackHash:record.identity.rulePackHash,rulePackBound:record.identity.rulePackBound}, designReview: {
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
  const header = ['designRunId','analysisRunId','comboId','memberId','category','checkId','status','ratio','demand','capacity','unit','expression','checkKey','x','reason','inputHash','reportSnapshotHash','projectId','summaryStatus','summaryCounts','practicalSummaryCounts','practicalIncompleteCheckCount','maxDisplacement','maxEquilibriumResidual','buildHash','rulePackHash','codeBasis'];
  const csvRows = [header, ...review.checks.map(row => header.map(key => key==='codeBasis'?JSON.stringify(row.codeBasis||{status:'NOT_ESTABLISHED',applied:[],reason:'No recorded basis'}):key === 'designRunId' ? record.designRunId : key==='reportSnapshotHash'?snapshot.reportSnapshotHash:key==='inputHash'?record.identity.inputHash:key==='projectId'?snapshot.project.id:key==='summaryStatus'?review.summary.status:key==='summaryCounts'?JSON.stringify(review.summary.counts):key==='practicalSummaryCounts'?JSON.stringify(review.summary.practical?.counts??null):key==='practicalIncompleteCheckCount'?(review.summary.practical?.incompleteCheckCount??''):key==='maxDisplacement'?snapshot.analysis.maxDisplacement:key==='maxEquilibriumResidual'?snapshot.analysis.maxEquilibriumResidual:key==='buildHash'?record.identity.buildHash:key==='rulePackHash'?record.identity.rulePackHash:row[key] ?? ''))];
  const json = JSON.stringify(snapshot,null,2), csv = csvRows.map(row=>row.map(csvCell).join(',')).join('\r\n');
  const artifactManifest = Object.fromEntries(Object.entries({html:reports['ko-KR'].html,json,csv}).map(([format,text])=>[format,{version:'p21-text-artifact-v1',format,encoding:'UTF-8',offsetUnit:'UTF-16-code-unit',totalCharacters:text.length,byteLength:new TextEncoder().encode(text).byteLength,sha256:sha256(text),reportSnapshotHash:snapshot.reportSnapshotHash,completeness:'complete'}]));
  return { version: DESIGN_REVIEW_REPORT_VERSION, reportContract:structuredClone(REPORT_CONTRACT), snapshot, reports, artifactManifest,
    json, csv,
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
  const rows = review.checks.map(row => `<tr><td>${e(row.memberId)}</td><td>${e(row.category)}<br>${e(row.checkId)}</td><td>${e(row.comboId)}<br>${e(row.analysisRunId)}</td><td>${e(row.status)}</td><td>${e(row.ratio)}</td><td>${e(row.demand)} / ${e(row.capacity)} (${e(row.unit)})</td><td>${e(row.expression)}${row.reason?`<br>${e(row.reason)}`:''}</td><td>${e(formatDesignCodeBasis(row.codeBasis,locale)).replaceAll('\n','<br>')}</td></tr>`).join('');
  const practicalSummary=review.summary.practical?`<p>${ko?'RC 실무 검토 집계':'RC practical review counts'}: ${e(formatPracticalCounts(review.summary.practical,locale))} · ${ko?'요구 검토 충족':'Required checks complete'}: ${e(review.summary.practical.complete)} · ${ko?'NG 대상':'NG entities'}: ${e(review.summary.practical.failedEntityCount)} · ${ko?'미검토 대상':'Unchecked entities'}: ${e(review.summary.practical.uncheckedEntityCount)}</p>`:'';
  return `<!doctype html><html lang="${locale}"><meta charset="utf-8"><title>${title}</title><style>${REPORT_FONT_CSS}body{font:13px SStructuresSans,sans-serif;color:#14283d;margin:32px}h1{font-size:24px}table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{border:1px solid #c6d0dc;padding:6px;overflow-wrap:anywhere;text-align:left}thead{display:table-header-group}tr{break-inside:avoid}.identity{overflow-wrap:anywhere;color:#456} @media print{@page{size:A4 landscape;margin:12mm}body{margin:0;font-size:9px}}</style><h1>${title}</h1><p>${ko ? '예비 검토 · 검토 필요 · 최종 설계전달 불가' : 'Preliminary · Review required · Final design transfer blocked'}</p><p>${e(review.designRunId)} · ${e(review.summary.status)} · ${ko?'최대 검정비':'Maximum utilization'}: ${e(review.summary.maxUtilization)}</p><p>${e(snapshot.project.id)} · 최대 변위(m): ${e(snapshot.analysis.maxDisplacement)} · 평형 잔차: ${e(snapshot.analysis.maxEquilibriumResidual)}</p>${practicalSummary}<p>${ko?'전체 기록 집계 (호환 진단 포함)':'All recorded checks (including compatibility diagnostics)'}: ${e(JSON.stringify(review.summary.counts))} · 실패 대상: ${e(review.summary.failedMemberCount)} · 설명: ${e(review.summary.messageCount)}</p><p class="identity">Source: ${e(snapshot.provenance.sourceRevision)} · Build: ${e(snapshot.provenance.buildId)} · Rule: ${e(snapshot.provenance.rulePackHash)}<br>Snapshot: ${e(snapshot.reportSnapshotHash)}<br>Input: ${e(review.inputIdentity.inputHash)}<br>Analysis runs: ${e(review.sourceAnalysisRunIds.join(', '))}</p><p>${e(JSON.stringify(review.units))} · ${e(review.axes)} · ${e(review.signConvention)}</p><table><thead><tr>${(ko?['부재','검토','조합 / 해석 기록','상태','검정비','수요 / 내력','식','KDS 근거']:['Member','Check','Combination / run','Status','Ratio','Demand / capacity','Expression','KDS basis']).map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><h2>${ko?'설명 및 입력 검토 메시지':'Messages'}</h2><ul>${(review.messages||[]).map(row=>`<li>${e(row.memberId)} · ${e(row.comboId)} · ${e(row.code)} · ${e(row.message)}</li>`).join('')}</ul><h2>${ko?'적용 범위와 미검토 항목':'Scope and unchecked items'}</h2><ul>${review.limitations.map(x=>`<li>${e(x)}</li>`).join('')}</ul><h2>${ko?'구현·규칙 출처':'Implementation and rule sources'}</h2><ul>${review.ruleSources.map(x=>`<li>${e(x.module)} · ${e(x.method)} · ${e(x.status)}</li>`).join('')}</ul></html>`;
}
