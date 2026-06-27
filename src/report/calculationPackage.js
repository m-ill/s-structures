import { buildDetailedReportData } from './detailedReport.js';

export const CALCULATION_PACKAGE_VERSION = 'm42-calculation-package';

export function buildCalculationPackageData(model, analysis, options = {}) {
  const detailed = buildDetailedReportData(model, analysis, options);
  const sections = [
    { id: 'cover', title: 'Cover' },
    { id: 'toc', title: 'Table of Contents' },
    { id: 'basis', title: 'Design Basis And Loads' },
    { id: 'analysis', title: 'Elastic Analysis Summary' },
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
    qualityAudit: auditPackage(detailed),
  };
}

export function renderCalculationPackageHtml(pkg) {
  const d = pkg.detailed;
  return `<!doctype html>
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
  </section>

  <section id="members" class="page-break">
    <h2>Member Design Summary</h2>
    ${table(['Member', 'Role', 'Status', 'Util.', 'Governing', 'Combo'], d.memberChecks.map((row) => [
      row.memberId,
      row.role,
      row.status,
      ratio(row.utilization),
      row.governingCheck || '-',
      row.comboId || '-',
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
    <h3>Remaining Design Scope</h3>
    <div class="note"><ul>${d.scope.missingScopes.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
    <h3>Package Limitations</h3>
    <div class="note"><ul>${pkg.qualityAudit.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
  </section>
</main>
</body>
</html>`;
}

export function createCalculationPackageHtml(model, analysis, options = {}) {
  const data = buildCalculationPackageData(model, analysis, options);
  return {
    data,
    html: renderCalculationPackageHtml(data),
  };
}

function auditPackage(detailed) {
  const items = [
    { name: 'Load derivation attached', status: detailed.loadDerivation ? 'OK' : 'Missing' },
    { name: 'Combination results available', status: detailed.combinationResults.length ? 'OK' : 'Missing' },
    { name: 'Member checks available', status: detailed.memberChecks.length ? 'OK' : 'Missing' },
    { name: 'RC schedule available', status: detailed.rcDetailing.rows.length ? 'OK' : 'Not applicable' },
    { name: 'Steel schedule available', status: detailed.steelDetailing.rows.length ? 'OK' : 'Not applicable' },
    { name: 'Foundation review available', status: detailed.connectionFoundation.foundationRows.length ? 'OK' : 'Missing' },
  ];
  return {
    items,
    ok: items.every((item) => item.status === 'OK' || item.status === 'Not applicable'),
    limitations: [
      'Print-ready HTML is intended for browser PDF output.',
      'Final sealed calculation packages require project-specific engineering review.',
      'Unsupported checks remain listed in the appendix rather than hidden.',
    ],
  };
}

function metricGrid(items) {
  return `<div class="grid">${items.map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>`;
}

function table(headers, rows) {
  if (!rows?.length) return '<div class="note">No data available.</div>';
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => (
    `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
  )).join('')}</tbody></table>`;
}

function force(value) {
  return value == null ? '-' : `${fmt(value)} kN`;
}

function length(value) {
  return value == null ? '-' : `${fmt(value * 1000)} mm`;
}

function ratio(value) {
  return value == null ? '-' : fmt(value);
}

function fmt(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  if (Math.abs(number) >= 1000) return number.toFixed(0);
  if (Math.abs(number) >= 10) return number.toFixed(2);
  return number.toFixed(3);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
