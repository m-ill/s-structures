import { buildDetailedReportData, DETAILED_REPORT_VERSION } from '../compute/product/detailedReportData.js';
import { escapeHtml, formatDriftRatio, formatForce, formatLength, formatMoment, formatNumber as format, formatRatio, formatTraceInputs, formatTraceValue, formatVector, renderList, renderMetricGrid, renderMessageTable, renderTable, statusLabel } from './reportFormat.js';

export { buildDetailedReportData, DETAILED_REPORT_VERSION };



























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
  ${renderEquivalentShellScope(report.equivalentShellTrace)}

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

  <h2>4D. Analysis Case Governance</h2>
  ${renderTable(['Case', 'Kind', 'Status', 'Engine', 'Qualification', 'Model bound', 'Design blocked', 'Summary'], (report.analysisCases?.rows || []).map((row) => [
    row.id,
    row.kind,
    row.lastRunStatus || row.status,
    row.engineId || '-',
    row.qualification || '-',
    row.modelBound == null ? '-' : row.modelBound ? 'yes' : 'no',
    row.designBlocked ? 'yes' : 'no',
    row.summaryText,
  ]))}

  <h2>4E. Distributed Foundation Response</h2>
  ${renderFoundationResponse(report.foundationResponse)}

  <h2>4F. Linear Time-History Trace</h2>
  ${renderLinearTha(report.linearTha)}

  <h2>4G. Membrane Mesh and Stress Trace</h2>
  ${renderMembraneWorkflow(report.membraneWorkflow)}

  <h2>4H. Plate Bending and Transverse-Shear Trace</h2>
  ${renderPlateWorkflow(report.plateWorkflow)}

  <h2>4I. Shell Stabilization Qualification Trace</h2>
  ${renderShellStabilization(report.shellStabilization)}

  <h2>4J. Production Pushover Qualification Trace</h2>
  ${renderPushoverQualification(report.pushoverQualification)}

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

  <h2>6B. Phase 3 Integrated Design And Nonlinear Trace</h2>
  ${renderPhase3Integrated(report.phase3IntegratedResults)}

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

function renderFoundationResponse(report) {
  if (!report?.assignedMemberCount) return '<div class="note">No distributed foundation properties are assigned.</div>';
  return `${renderMetricGrid([
    ['Assigned members', report.assignedMemberCount],
    ['Solved members', report.solvedMemberCount],
    ['Foundation energy', format(report.totalStrainEnergy)],
    ['Global force', formatVector(report.totalGlobalForce, formatForce)],
  ])}${renderTable(
    ['Member', 'Property', 'Status', 'k local-y', 'k local-z', 'Ry', 'Rz', 'Centroid y', 'Centroid z', 'Energy'],
    report.rows.map((row) => [
      row.memberId,
      row.propertyId,
      row.status,
      format(row.lineStiffness.localY),
      format(row.lineStiffness.localZ),
      formatForce(row.resultant?.localY),
      formatForce(row.resultant?.localZ),
      formatLength(row.centroid?.localY),
      formatLength(row.centroid?.localZ),
      format(row.strainEnergy),
    ]),
  )}${renderList(report.limitations || [])}`;
}

function renderLinearTha(report) {
  if (!report?.caseCount) return '<div class="note">No linear time-history result is attached to this report.</div>';
  return `${renderTable(['Case', 'Status', 'Integration', 'Damping', 'Samples', 'dt', 'Max displacement', 'Energy error', 'Energy', 'Run hash'], report.rows.map((row) => [
    row.caseId,
    row.status,
    row.integration || '-',
    row.dampingType || '-',
    row.sampleCount,
    format(row.dt),
    formatLength(row.maxDisplacement),
    formatRatio(row.energyError),
    row.energyQualified == null ? '-' : row.energyQualified ? 'PASS' : 'FAIL',
    row.runHash || '-',
  ]))}${renderList(report.limitations || [])}`;
}

function renderMembraneWorkflow(report) {
  if (!report?.available) return '<div class="note">No membrane workflow result is attached to this report.</div>';
  return `${renderMetricGrid([
    ['Mesh', report.mesh.id || '-'],
    ['Elements', report.mesh.elementCount],
    ['Integration points', report.result.integrationPointCount],
    ['Converged', report.comparison?.converged == null ? '-' : report.comparison.converged ? 'PASS' : 'REVIEW'],
  ])}${renderTable(['Probe', 'Element', 'xi', 'eta', 'Sx', 'Sy', 'Txy', 'Hash'], report.probes.map((row) => [
    row.id || '-', row.elementId, format(row.xi), format(row.eta), format(row.sx), format(row.sy), format(row.txy), row.probeHash,
  ]))}${renderTable(['Edge', 'Resultant', 'Moment', 'Residual', 'Hash'], report.loads.map((row) => [
    row.edge, formatVector(row.resultant, formatForce), formatVector(row.momentAboutOrigin, formatMoment), format(row.equilibriumResidual), row.loadHash,
  ]))}${renderList(report.limitations || [])}`;
}

function renderPlateWorkflow(report) {
  if (!report?.available) return '<div class="note">No plate workflow result is attached to this report.</div>';
  return `${renderMetricGrid([
    ['Mesh', report.mesh.id || '-'],
    ['Elements', report.mesh.elementCount],
    ['Support', report.analysis.support],
    ['Center w', formatLength(report.analysis.center?.w)],
    ['Coefficient', format(report.analysis.dimensionlessCoefficient)],
    ['Energy closure', report.analysis.energy?.passed ? 'PASS' : 'REVIEW'],
    ['Qualification', report.qualification?.status || 'not-run'],
    ['Shear energy ratio', formatRatio(report.qualification?.energy?.transverseShearFraction)],
  ])}${renderList(report.limitations || [])}`;
}

function renderShellStabilization(report) {
  if (!report?.available) return '<div class="note">No shell stabilization qualification is attached to this report.</div>';
  return `${renderMetricGrid([
    ['Status', report.status],
    ['Claim', report.claim?.id || '-'],
    ['Cross-solver identical', report.claim?.crossSolverEquivalent ? 'yes' : 'no'],
    ['Physical modes', report.modes?.filter((row) => row.classification === 'physical').length || 0],
  ])}${renderTable(['Mode', 'MAC', 'Physical energy', 'Stabilization energy', 'Ratio', 'Class'], (report.modes || []).map((row) => [
    row.id, format(row.mac), format(row.physicalEnergy), format(row.stabilizationEnergy), formatRatio(row.stabilizationEnergyRatio), row.classification,
  ]))}${renderList(report.limitations || [])}`;
}

function renderPushoverQualification(report) {
  if (!report?.available) return '<div class="note">No production pushover qualification result is attached to this report.</div>';
  const run = report.productionRun || {};
  return `${renderMetricGrid([
    ['Control', run.controlStrategy || '-'],
    ['Termination', run.termination?.reason || '-'],
    ['Accepted steps', run.stepCount ?? '-'],
    ['Rejected steps', run.rejectedStepCount ?? '-'],
    ['Max base shear', formatForce(run.maximumBaseShear)],
    ['Max control displacement', formatLength(run.maximumControlDisplacement)],
    ['Rollback', report.rollbackAudit?.status || 'not-run'],
    ['Benchmark', report.benchmarkExecutionStarted ? 'started' : 'NOT RUN'],
  ])}${renderList(report.limitations || [])}`;
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

function renderEquivalentShellScope(trace) {
  const scope = trace?.equivalentShellScope;
  if (!scope?.active) return '';
  return `
    <div class="note warn" data-report-badge="equivalent-shell-scope">
      <strong>${escapeHtml(scope.badge)}</strong><br>
      ${escapeHtml(scope.warning)}
      ${renderTable(['Allowed global result', 'Status'], scope.allowedResults.map((item) => [item, 'allowed']))}
      ${renderTable(['Forbidden local/shell result', 'Report status'], scope.forbiddenResults.map((item) => [item, 'not reported']))}
    </div>
  `;
}

function renderPhase3Integrated(integrated) {
  if (!integrated) return '<div class="note">No Phase 3 integrated trace is available.</div>';
  return [
    renderTable(['Item', 'Value'], [
      ['Version', integrated.version],
      ['Design items', integrated.summary.designItems],
      ['Issue rows', integrated.summary.issueRows],
      ['Not checked count', integrated.summary.notCheckedCount],
      ['Workflow locked', integrated.summary.workflowLocked ? 'Yes' : 'No'],
      ['Ready for reviewer', integrated.summary.readyForReviewer ? 'Yes' : 'No'],
      ['Ticket coverage', integrated.summary.completeTicketCoverage ? 'Complete' : 'Review'],
      ['Nonlinear trace', integrated.summary.nonlinearVersion],
      ['Gate', integrated.integratedGate?.ok ? 'OK' : 'Review'],
      ['Benchmark evidence', integrated.benchmarkEvidence?.ok ? 'OK' : 'Review'],
    ]),
    integrated.integratedGate ? renderTable(['Gate item', 'Value'], [
      ['Version', integrated.integratedGate.version],
      ['Tickets', integrated.integratedGate.tickets.join(', ')],
      ['Capacity points', integrated.integratedGate.coverage.capacityPoints],
      ['Nonlinear steps', integrated.integratedGate.coverage.nonlinearStepRows],
      ['Method limitations', integrated.integratedGate.coverage.methodLimitations],
      ['Approval state', integrated.integratedGate.workflow.approvalState],
      ['Covered tickets', `${integrated.integratedGate.summary.coveredTicketCount}/${integrated.integratedGate.summary.ticketCount}`],
    ]) : '',
    integrated.integratedGate?.ticketCoverage ? renderTable(['Ticket', 'Scope', 'Covered', 'Evidence'], integrated.integratedGate.ticketCoverage.map((row) => [
      row.ticket,
      row.scope,
      row.covered ? 'Yes' : 'No',
      row.evidence,
    ])) : '',
    renderTable(['Module', 'Items', 'WARN', 'NG'], Object.entries(integrated.design.modules || {}).map(([key, module]) => [
      key,
      module.summary?.itemCount || module.summary?.memberCount || 0,
      module.summary?.warnCount || 0,
      module.summary?.ngCount || 0,
    ])),
    renderTable(['Issue module', 'Item', 'Status', 'Action'], integrated.design.issueRows.slice(0, 30).map((row) => [
      row.moduleId,
      row.itemId,
      row.status,
      row.action,
    ])),
    renderList(integrated.methodLimitations || []),
  ].join('\n');
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
    renderTable(['Combo', 'Load steps', 'Stories', 'Members', 'Max theta', 'Max N/Pcr'], (trace.pDelta.curves?.combos || []).map((row) => [
      row.comboId,
      row.globalPointCount,
      row.storyCount,
      row.memberCount,
      formatRatio(row.summary?.maxStoryStabilityIndex),
      formatRatio(row.summary?.maxMemberAxialRatio),
    ])),
    renderTable(['Combo', 'Dir', 'Story', 'Theta', 'BΔ', 'PΔ shear', 'PΔ moment', 'Status'], (trace.pDelta.design?.rows || []).map((row) => [
      row.comboId,
      row.direction,
      row.governingStory,
      formatRatio(row.maxTheta),
      formatRatio(row.maxBDelta),
      formatForce(row.maxPDeltaShear),
      formatMoment(row.maxPDeltaMoment),
      statusLabel(row.status),
    ])),
    renderTable(['Combo', 'Dir', 'Story', 'P', 'Drift', 'V', 'PΔ shear', 'Theta', 'BΔ'], (trace.pDelta.design?.storyRows || []).slice(0, 30).map((row) => [
      row.comboId,
      row.direction,
      row.storyId,
      formatForce(row.gravityLoad),
      formatLength(row.storyDrift),
      formatForce(row.storyShear),
      formatForce(row.pDeltaShear),
      formatRatio(row.theta),
      row.bDelta == null ? '-' : formatRatio(row.bDelta),
    ])),
    renderTable(['Mode', 'T', 'Hz', 'Mass X', 'Mass Y'], trace.modal.modes.map((row) => [
      row.id,
      format(row.period),
      format(row.frequencyHz),
      formatRatio(row.massX),
      formatRatio(row.massY),
    ])),
    renderTable(['Dir', 'Method', 'Combined disp.', 'Max |Rz|', 'Max modal disp.', 'Mass ratio'], trace.responseSpectrum.directions.map((row) => [
      row.direction,
      row.method || trace.responseSpectrum.method || '-',
      formatLength(row.displacement ?? selectedModalDisplacement(row, row.method || trace.responseSpectrum.method)),
      format(row.maxRotationRz),
      formatLength(row.maxModalDisplacement),
      formatRatio(row.participatingMassRatio),
    ])),
  ].join('');
}

function selectedModalDisplacement(row = {}, method = 'SRSS') {
  const key = {
    CQC: 'cqcDisplacement',
    ABS: 'absDisplacement',
    NRC10: 'nrc10Displacement',
    SRSS: 'srssDisplacement',
  }[String(method || 'SRSS').toUpperCase()] || 'srssDisplacement';
  return row[key];
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
