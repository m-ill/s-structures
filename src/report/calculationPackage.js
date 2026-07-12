import { buildDetailedReportData } from './detailedReport.js';
import { buildPhase7AnalysisRunSummary } from './phase7AnalysisRuns.js';
import {
  escapeHtml,
  formatDriftRatio as driftRatio,
  formatForce as force,
  formatLength as length,
  formatNumber as fmt,
  formatRatio as ratio,
  formatTraceInputs as traceInputs,
  formatTraceValue as traceValue,
  renderMetricGrid as metricGrid,
  renderTable as table,
  stripTrailingLineWhitespace,
} from './reportFormat.js';

export const CALCULATION_PACKAGE_VERSION = 'm42-calculation-package';

export function buildCalculationPackageData(model, analysis, options = {}) {
  const detailed = buildDetailedReportData(model, analysis, options);
  const analysisRuns = buildPhase7AnalysisRunSummary(options);
  const sections = [
    { id: 'cover', title: 'Cover' },
    { id: 'toc', title: 'Table of Contents' },
    { id: 'basis', title: 'Design Basis And Loads' },
    { id: 'analysis', title: 'Elastic Analysis Summary' },
    { id: 'phase3', title: 'Phase 3 Integrated Results' },
    { id: 'members', title: 'Member Design Summary' },
    { id: 'detailing', title: 'Detailing And Foundation Summary' },
    { id: 'appendix', title: 'Appendix' },
  ];
  return {
    version: CALCULATION_PACKAGE_VERSION,
    generatedAt: options.generatedAt || detailed.generatedAt,
    title: options.title || detailed.title,
    project: {
      name: model?.meta?.name || options.projectName || detailed.title,
      engineer: options.engineer || '',
      reviewer: options.reviewer || '',
      purpose: options.purpose || 'Review issue',
    },
    sections,
    detailed,
    analysisRuns,
    resultSelection: options.resultSelection || null,
    qualityAudit: auditPackage(detailed, analysisRuns),
  };
}

export function renderCalculationPackageHtml(pkg) {
  const d = pkg.detailed;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pkg.title)}</title>
  <style>
    @page{size:A4;margin:16mm 14mm}
    body{font:12px/1.45 Arial,sans-serif;color:#182736;margin:0;background:#edf2f6}
    main{max-width:980px;margin:0 auto;background:white;min-height:100vh}
    section{padding:24px 28px;border-bottom:1px solid #e1e8ef}
    h1{font-size:26px;color:#003f73;margin:0 0 8px}
    h2{font-size:18px;color:#003f73;margin:0 0 12px;border-bottom:2px solid #dce8f1;padding-bottom:5px}
    h3{font-size:14px;color:#26465f;margin:14px 0 6px}
    .cover{min-height:720px;display:flex;flex-direction:column;justify-content:space-between}
    .meta{color:#63788b}.toc li{margin:5px 0}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
    .metric{border:1px solid #dce8f1;border-radius:5px;padding:8px;background:#fbfdff}
    .metric span{display:block;color:#647484;font-size:10px}.metric b{font-size:14px}
    table{width:100%;border-collapse:collapse;margin:8px 0 14px}
    th,td{border-bottom:1px solid #e4ebf2;padding:5px 6px;text-align:right;vertical-align:top}
    th:first-child,td:first-child{text-align:left}
    th{background:#f6f9fc;color:#526579}
    .note{border:1px solid #dce8f1;background:#f8fbfe;border-radius:5px;padding:9px;margin:8px 0}
    .warn{border-color:#ead49a;background:#fff9e8}
    .page-break{break-before:page}
    @media print{body{background:white}main{max-width:none}.page-break{break-before:page}section{border-bottom:0}.no-print{display:none}}
  </style>
</head>
<body>
<main>
  <section id="cover" class="cover">
    <div>
      <h1>${escapeHtml(pkg.project.name)}</h1>
      <div class="meta">${escapeHtml(pkg.title)}</div>
    </div>
    <table>
      <tr><th>Purpose</th><td>${escapeHtml(pkg.project.purpose)}</td></tr>
      <tr><th>Generated</th><td>${escapeHtml(pkg.generatedAt)}</td></tr>
      <tr><th>Engineer</th><td>${escapeHtml(pkg.project.engineer || '-')}</td></tr>
      <tr><th>Reviewer</th><td>${escapeHtml(pkg.project.reviewer || '-')}</td></tr>
      <tr><th>Package Version</th><td>${escapeHtml(pkg.version)}</td></tr>
    </table>
    <div class="note warn">${escapeHtml(d.scope.statement)}</div>
    ${renderEquivalentShellPackageNote(d.equivalentShellTrace)}
  </section>

  <section id="toc" class="page-break">
    <h2>Table of Contents</h2>
    <ol class="toc">${pkg.sections.filter((item) => item.id !== 'cover').map((item) => `<li>${escapeHtml(item.title)}</li>`).join('')}</ol>
  </section>

  <section id="basis" class="page-break">
    <h2>Design Basis And Loads</h2>
    ${metricGrid([
      ['Nodes', d.model.nodeCount],
      ['Members', d.model.memberCount],
      ['Load cases', d.model.loadCaseCount],
      ['Combos', d.model.combinationCount],
    ])}
    ${table(['Case', 'Type', 'Loads', 'Fx', 'Fy', 'Fz'], d.loadCases.map((row) => [
      row.id,
      row.type,
      row.loadCount,
      force(row.total[0]),
      force(row.total[1]),
      force(row.total[2]),
    ]))}
    ${d.loadDerivation ? table(['Story', 'Area', 'D total', 'L total', 'Wind X', 'Wind Y'], d.loadDerivation.gravity.map((row, index) => [
      row.story,
      `${fmt(row.area)} m2`,
      force(row.deadTotal),
      force(row.liveTotal),
      force(d.loadDerivation.lateral[index]?.windX),
      force(d.loadDerivation.lateral[index]?.windY),
    ])) : '<div class="note">No load derivation attached.</div>'}
    ${d.loadDerivation?.derivationTrace ? `
    <h3>Load Derivation Formula Trace</h3>
    ${table(['ID', 'Case', 'Formula', 'Inputs', 'Result'], d.loadDerivation.derivationTrace.rows.map((row) => [
      row.id,
      row.caseId || '-',
      row.formula,
      traceInputs(row.inputs),
      `${traceValue(row.result)} ${row.unit || ''}`.trim(),
    ]))}` : ''}
    <h3>KDS-Style Load Standard Audit</h3>
    ${table(['Symbol', 'Status', 'Mapped cases', 'Project input'], d.codeBasis.loadStandardAudit.symbols.map((row) => [
      row.symbol,
      row.status,
      row.caseIds.join(', ') || '-',
      row.projectInputRequired ? 'Required' : 'Optional',
    ]))}
  </section>

  <section id="analysis" class="page-break">
    <h2>Elastic Analysis Summary</h2>
    ${metricGrid([
      ['Status', d.analysis.status],
      ['Audit', d.analysis.auditOk == null ? '-' : d.analysis.auditOk ? 'OK' : 'WARN'],
      ['Eq. residual', ratio(d.analysis.maxEquilibriumResidual)],
      ['Max disp.', length(d.analysis.maxDisplacement)],
      ['Max util.', ratio(d.analysis.maxUtilization)],
      ['Warnings', d.analysis.warningCount],
    ])}
    ${table(['Combo', 'OK', 'Max disp.', 'Max util.', 'Residual'], d.combinationResults.map((row) => [
      row.id,
      row.ok ? 'OK' : 'Check',
      length(row.maxDisplacement),
      ratio(row.maxUtilization),
      ratio(row.equilibriumResidual),
    ]))}
    <h3>Advanced Elastic Trace</h3>
    ${d.advancedElasticTrace ? table(['Item', 'Value'], [
      ['P-Delta', d.advancedElasticTrace.summary.pDeltaStatus],
      ['Modes', d.advancedElasticTrace.summary.modeCount],
      ['First period', fmt(d.advancedElasticTrace.summary.firstPeriod)],
      ['RSA directions', d.advancedElasticTrace.summary.rsaDirectionCount],
    ]) : '<div class="note">No advanced elastic trace available.</div>'}
    ${d.advancedElasticTrace?.pDelta?.curves?.combos?.length ? table(['P-Delta combo', 'Load steps', 'Stories', 'Members', 'Max theta'], d.advancedElasticTrace.pDelta.curves.combos.map((row) => [
      row.comboId,
      row.globalPointCount,
      row.storyCount,
      row.memberCount,
      ratio(row.summary?.maxStoryStabilityIndex),
    ])) : ''}
    ${d.advancedElasticTrace?.pDelta?.design?.rows?.length ? table(['Combo', 'Dir', 'Story', 'Theta', 'BΔ', 'PΔ shear', 'Status'], d.advancedElasticTrace.pDelta.design.rows.map((row) => [
      row.comboId,
      row.direction,
      row.governingStory,
      ratio(row.maxTheta),
      ratio(row.maxBDelta),
      force(row.maxPDeltaShear),
      row.status,
    ])) : ''}
    <h3>Phase 5 Analysis Cases</h3>
    ${d.analysisCases?.rows?.length ? table(['Case', 'Kind', 'Status', 'Engine', 'Qualification', 'Blocked', 'Result', 'Summary'], d.analysisCases.rows.map((row) => [
      row.name === row.id ? row.id : `${row.id} - ${row.name}`,
      row.kind,
      row.status,
      row.engineId || '-',
      row.qualification || '-',
      row.designBlocked ? 'Yes' : 'No',
      row.view || '-',
      row.summaryText,
    ])) : '<div class="note">No Phase 5 analysis cases defined.</div>'}
    ${renderAnalysisCaseDetails(d.analysisCases)}
    <h3>Immutable Analysis Run Records</h3>
    ${pkg.analysisRuns.rows.length ? table(['Run', 'Case', 'Kind', 'Status', 'Engine', 'Qualification', 'Model bound', 'Design blocked', 'Current model', 'Design transfer', 'Model hash'], pkg.analysisRuns.rows.map((row) => [
      row.id,
      row.caseId,
      row.kind || '-',
      row.runStatus,
      row.engineId || '-',
      row.qualification,
      row.modelBound == null ? '-' : row.modelBound ? 'Yes' : 'No',
      row.designBlocked ? 'Yes' : 'No',
      row.currentModelMatches ? 'Match' : 'Changed',
      row.designTransferAllowed ? 'Allowed' : 'Blocked',
      row.modelHash || '-',
    ])) : '<div class="note">No Phase 7 analysis run records are attached.</div>'}
    ${pkg.analysisRuns.rows.length ? table(['Run', 'Schema', 'Combination', 'Materials', 'Sections', 'Sources', 'Engine', 'Solver'], pkg.analysisRuns.rows.map((row) => [
      row.id,
      row.provenance.schemaVersion ?? '-',
      row.provenance.combinationId || '-',
      row.provenance.materialRefs.join(', ') || '-',
      row.provenance.sectionRefs.join(', ') || '-',
      row.provenance.sourceIds.join(', ') || '-',
      row.provenance.engineId || row.engineId || '-',
      row.provenance.solver || '-',
    ])) : ''}
    ${pkg.analysisRuns.summary.preliminaryOrCandidateCount ? '<div class="note warn">Preliminary or unverified successful runs are retained for review but blocked from design transfer.</div>' : ''}
    <h3>Serviceability Drift Review</h3>
    ${d.serviceability?.rows?.length ? table(['Combo', 'Story', 'Height', 'Drift', 'Ratio', 'D/L', 'Status'], d.serviceability.rows.map((row) => [
      row.comboId,
      row.story,
      `${fmt(row.height)} m`,
      length(row.drift),
      driftRatio(row.driftRatio),
      ratio(row.demandToLimit),
      row.status,
    ])) : '<div class="note">No story drift data available.</div>'}
    <h3>Result Postprocessing</h3>
    ${d.resultPostprocessing ? table(['Item', 'Value'], [
      ['Story rows', d.resultPostprocessing.summary.storyRowCount],
      ['Member station rows', d.resultPostprocessing.summary.memberRowCount],
      ['Foundation rows', d.resultPostprocessing.summary.foundationRowCount],
      ['Uplift nodes', d.resultPostprocessing.summary.upliftNodeCount],
    ]) : '<div class="note">No result postprocessing data available.</div>'}
  </section>

  <section id="phase3" class="page-break">
    <h2>Phase 3 Integrated Results</h2>
    ${d.phase3IntegratedResults ? table(['Item', 'Value'], [
      ['Version', d.phase3IntegratedResults.version],
      ['Design items', d.phase3IntegratedResults.summary.designItems],
      ['Issue rows', d.phase3IntegratedResults.summary.issueRows],
      ['Not checked count', d.phase3IntegratedResults.summary.notCheckedCount],
      ['Workflow locked', d.phase3IntegratedResults.summary.workflowLocked ? 'Yes' : 'No'],
      ['Ready for reviewer', d.phase3IntegratedResults.summary.readyForReviewer ? 'Yes' : 'No'],
      ['Ticket coverage', d.phase3IntegratedResults.summary.completeTicketCoverage ? 'Complete' : 'Review'],
      ['Nonlinear trace', d.phase3IntegratedResults.summary.nonlinearVersion],
      ['Gate', d.phase3IntegratedResults.integratedGate?.ok ? 'OK' : 'Review'],
      ['Benchmark evidence', d.phase3IntegratedResults.benchmarkEvidence?.ok ? 'OK' : 'Review'],
    ]) : '<div class="note">No Phase 3 integrated result package available.</div>'}
    ${d.phase3IntegratedResults?.integratedGate ? table(['Gate item', 'Value'], [
      ['Version', d.phase3IntegratedResults.integratedGate.version],
      ['Tickets', d.phase3IntegratedResults.integratedGate.tickets.join(', ')],
      ['Capacity points', d.phase3IntegratedResults.integratedGate.coverage.capacityPoints],
      ['Nonlinear steps', d.phase3IntegratedResults.integratedGate.coverage.nonlinearStepRows],
      ['Method limitations', d.phase3IntegratedResults.integratedGate.coverage.methodLimitations],
      ['Approval state', d.phase3IntegratedResults.integratedGate.workflow.approvalState],
      ['Covered tickets', `${d.phase3IntegratedResults.integratedGate.summary.coveredTicketCount}/${d.phase3IntegratedResults.integratedGate.summary.ticketCount}`],
    ]) : ''}
    ${d.phase3IntegratedResults?.integratedGate?.ticketCoverage ? table(['Ticket', 'Scope', 'Covered', 'Evidence'], d.phase3IntegratedResults.integratedGate.ticketCoverage.map((row) => [
      row.ticket,
      row.scope,
      row.covered ? 'Yes' : 'No',
      row.evidence,
    ])) : ''}
    ${d.phase3IntegratedResults ? table(['Module', 'Items', 'WARN', 'NG'], Object.entries(d.phase3IntegratedResults.design.modules || {}).map(([key, module]) => [
      key,
      module.summary?.itemCount || module.summary?.memberCount || 0,
      module.summary?.warnCount || 0,
      module.summary?.ngCount || 0,
    ])) : ''}
  </section>

  <section id="members" class="page-break">
    <h2>Member Design Summary</h2>
    ${d.designDemandPackage ? table(['Demand package', 'Value'], [
      ['Version', d.designDemandPackage.version],
      ['Active result', d.designDemandPackage.source?.activeResultId || '-'],
      ['Member demands', d.designDemandPackage.summary.memberCount],
      ['Foundation demands', d.designDemandPackage.summary.foundationCount],
    ]) : '<div class="note">No design demand package available.</div>'}
    ${table(['Member', 'Role', 'Status', 'Util.', 'Governing', 'Combo'], d.memberChecks.map((row) => [
      row.memberId,
      row.role,
      row.status,
      ratio(row.utilization),
      row.governingCheck || '-',
      row.comboId || '-',
    ]))}
    <h3>Member Design Trace Matrix</h3>
    ${table(['Member', 'Type', 'Status', 'Formula rows', 'Action items'], d.memberDesignTrace.rows.map((row) => [
      row.memberId,
      row.designType,
      row.status,
      row.formulaTrace.length,
      row.actionItems.join('; '),
    ]))}
  </section>

  <section id="detailing" class="page-break">
    <h2>Detailing And Foundation Summary</h2>
    ${table(['Scope', 'Rows', 'Warnings/NG', 'Max ratio'], [
      ['RC reinforcement', d.rcDetailing.summary.memberCount, d.rcDetailing.summary.warnCount + d.rcDetailing.summary.ngCount, ratio(d.rcDetailing.summary.maxUtilization)],
      ['Steel review', d.steelDetailing.summary.memberCount, d.steelDetailing.summary.warnCount + d.steelDetailing.summary.ngCount, ratio(d.steelDetailing.summary.maxUtilization)],
      ['Connection/foundation', d.connectionFoundation.summary.connectionCount + d.connectionFoundation.summary.foundationCount, d.connectionFoundation.summary.warningCount, ratio(Math.max(d.connectionFoundation.summary.maxConnectionUtilization, d.connectionFoundation.summary.maxSlidingRatio))],
    ])}
    ${table(['Audit', 'Status'], pkg.qualityAudit.items.map((item) => [item.name, item.status]))}
  </section>

  <section id="appendix" class="page-break">
    <h2>Appendix</h2>
    <h3>Practice Platform Readiness</h3>
    ${d.practicePlatform ? table(['Item', 'Value'], [
      ['Status', d.practicePlatform.summary.status],
      ['Revision', d.practicePlatform.summary.revision],
      ['Approval', d.practicePlatform.summary.approvalState],
      ['QA OK', d.practicePlatform.summary.qaOk ? 'Yes' : 'No'],
    ]) : '<div class="note">No practice platform state available.</div>'}
    <h3>Practice Validation</h3>
    ${d.practiceValidation ? table(['Item', 'Value'], [
      ['Status', d.practiceValidation.status],
      ['P-Delta', d.practiceValidation.pDelta.status],
      ['Result tables', d.practiceValidation.resultTables.status],
      ['Calculation trace', d.practiceValidation.calculation.status],
      ['Open issues', d.practiceValidation.issues.summary.openCount],
    ]) : '<div class="note">No practice validation report available.</div>'}
    <h3>Remaining Design Scope</h3>
    <div class="note"><ul>${d.scope.missingScopes.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
    <h3>Package Limitations</h3>
    <div class="note"><ul>${pkg.qualityAudit.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
  </section>
</main>
</body>
</html>`;
  return stripTrailingLineWhitespace(html);
}

export function createCalculationPackageHtml(model, analysis, options = {}) {
  const data = buildCalculationPackageData(model, analysis, options);
  return {
    data,
    html: renderCalculationPackageHtml(data),
  };
}

function renderAnalysisCaseDetails(analysisCases) {
  const rows = analysisCases?.rows || [];
  if (!rows.length) return '';
  return `
    <h3>Analysis Case Result Details</h3>
    ${rows.map((row) => {
    const detail = row.detail || { status: 'not-run', headline: 'not run', rows: [['Result', 'not run']], limitations: [] };
    return `
      <div class="note">
        <b>${escapeHtml(row.id)} (${escapeHtml(row.kind)})</b> - ${escapeHtml(detail.status || row.lastRunStatus || row.status || '-')} - ${escapeHtml(detail.headline || '-')}
        ${table(['Item', 'Value'], (detail.rows || []).map((item) => [item[0], item[1]]))}
        ${detail.limitations?.length ? `<ul>${detail.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
      </div>`;
  }).join('')}`;
}

function renderEquivalentShellPackageNote(trace) {
  const scope = trace?.equivalentShellScope;
  if (!scope?.active) return '';
  return `<div class="note warn" data-report-badge="equivalent-shell-scope"><b>${escapeHtml(scope.badge)}</b><br>${escapeHtml(scope.warning)}</div>`;
}

function auditPackage(detailed, analysisRuns) {
  const items = [
    { name: 'Load derivation attached', status: detailed.loadDerivation ? 'OK' : 'Missing' },
    { name: 'Combination results available', status: detailed.combinationResults.length ? 'OK' : 'Missing' },
    { name: 'Member checks available', status: detailed.memberChecks.length ? 'OK' : 'Missing' },
    { name: 'RC schedule available', status: detailed.rcDetailing.rows.length ? 'OK' : 'Not applicable' },
    { name: 'Steel schedule available', status: detailed.steelDetailing.rows.length ? 'OK' : 'Not applicable' },
    { name: 'Foundation review available', status: detailed.connectionFoundation.foundationRows.length ? 'OK' : 'Missing' },
    { name: 'Phase 3 integrated results available', status: detailed.phase3IntegratedResults ? 'OK' : 'Missing' },
    { name: 'Phase 5 analysis cases listed', status: detailed.analysisCases ? 'OK' : 'Missing' },
    { name: 'Analysis run provenance records', status: analysisRuns.rows.length ? 'OK' : 'Not applicable' },
    { name: 'Verified-only design transfer guard', status: analysisRuns.designTransferGuardOk ? 'OK' : 'Review' },
    { name: 'Phase 3 default not-checked cleanup', status: detailed.phase3IntegratedResults?.summary?.notCheckedCount === 0 ? 'OK' : 'Review' },
  ];
  return {
    items,
    ok: items.every((item) => item.status === 'OK' || item.status === 'Not applicable'),
    limitations: [
      'Print-ready HTML is intended for browser PDF output.',
      'Final sealed calculation packages require project-specific engineering review.',
      'Unsupported checks remain listed in the appendix rather than hidden.',
      ...(analysisRuns.summary.preliminaryOrCandidateCount
        ? ['Preliminary and candidate analysis runs are excluded from design transfer.']
        : []),
    ],
  };
}
