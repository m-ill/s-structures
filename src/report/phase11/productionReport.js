import { stableHash } from '../../core/stableHash.js';
import { escapeHtml } from '../reportFormat.js';
import { P11_KOREAN_FONT_STACK, P11_REPORT_LOCALES, createReportTranslator, formatReportNumber } from './i18n.js';
import { renderBilingualReportPair } from './bilingualReport.js';
import { validateReportSnapshot } from './reportSnapshot.js';
import { assertFigureManifestComplete } from './sceneEvidence.js';

export const P11_PRODUCTION_REPORT_VERSION = 'p11-production-report-v1';

export function renderProductionReportPair(snapshot, options = {}) {
  const basePair = renderBilingualReportPair(snapshot, { ...options, requireFigures: options.requireFigures !== false });
  const reports = Object.fromEntries(P11_REPORT_LOCALES.map((locale) => {
    const base = basePair.reports[locale];
    const rendered = renderProductionReport(snapshot, locale, options);
    return [locale, Object.freeze({ ...base, ...rendered })];
  }));
  const ko = reports['ko-KR'];
  const en = reports['en-US'];
  if (ko.pageCount !== en.pageCount
    || JSON.stringify(ko.sectionOrder) !== JSON.stringify(en.sectionOrder)
    || JSON.stringify(ko.figureAssets) !== JSON.stringify(en.figureAssets)) {
    throw reportError('P11_PRODUCTION_REPORT_PARITY_FAILED', 'Production report structure differs by locale.');
  }
  const core = {
    ...basePair.manifest,
    version: P11_PRODUCTION_REPORT_VERSION,
    layoutVersion: P11_PRODUCTION_REPORT_VERSION,
    pageCount: ko.pageCount,
    sectionOrder: ko.sectionOrder,
    firstPageMarkers: ko.firstPageMarkers,
  };
  return Object.freeze({
    reports,
    manifest: Object.freeze({ ...core, pairHash: stableHash(core) }),
  });
}

export function renderProductionReport(snapshot, locale, options = {}) {
  const snapshotValidation = validateReportSnapshot(snapshot);
  if (!snapshotValidation.ok) {
    throw reportError('P11_REPORT_SNAPSHOT_INVALID', snapshotValidation.errors.join(', '));
  }
  if (options.figureManifest) {
    assertFigureManifestComplete(options.figureManifest, snapshot);
  } else if (options.requireFigures !== false) {
    throw reportError('P11_REPORT_FIGURES_REQUIRED', 'Production reports require a complete figure manifest.');
  }
  const t = createReportTranslator(locale);
  const n = (value, digits = 6) => formatReportNumber(value, locale, { maximumFractionDigits: digits });
  const figures = options.figureManifest?.figures || [];
  const g = snapshot.analysis.governing || {};
  const projectName = escapeHtml(options.projectName || snapshot.project.id || t('label.notAvailable'));
  const modelRows = [
    ['metric.nodes', snapshot.model.nodeCount],
    ['metric.members', snapshot.model.memberCount],
    ['metric.loads', snapshot.model.loadCount],
    ['metric.loadCases', snapshot.model.loadCaseCount],
    ['metric.combinations', snapshot.model.combinationCount],
    ['metric.stories', snapshot.model.storyCount],
  ];
  const analysisRows = [
    ['metric.maxDisplacement', snapshot.analysis.maxDisplacement == null ? null : snapshot.analysis.maxDisplacement * 1000, 'label.unit.mm'],
    ['metric.maxUtilization', snapshot.analysis.maxUtilization, 'label.unit.ratio'],
    ['metric.maxResidual', snapshot.analysis.maxEquilibriumResidual, 'label.unit.ratio'],
  ];
  const pages = [];
  pages.push(pageSpec('executive', t('report.conclusion'), executiveContent()));
  pages.push(pageSpec('toc', t('report.toc'), ''));
  pages.push(pageSpec('model-summary', t('section.model'), summaryTable(modelRows)));
  for (const figure of figures.filter((row) => row.placement === 'model')) pages.push(figurePage(figure));
  for (const figure of figures.filter((row) => row.placement === 'loads')) pages.push(figurePage(figure));
  pages.push(pageSpec('analysis-summary', t('section.analysis'), analysisContent()));
  for (const figure of figures.filter((row) => row.placement === 'analysis')) pages.push(figurePage(figure));
  pages.push(pageSpec('qualification', t('section.limitations'), qualificationContent()));
  for (const [index, rows] of chunks(snapshot.analysis.combinations, 18).entries()) {
    pages.push(pageSpec(`appendix-${index + 1}`, t('section.appendix'), combinationTable(rows)));
  }
  pages[1].content = tocContent(pages);
  const total = pages.length;
  const pageHtml = pages.map((page, index) => renderPage(page, index + 1, total)).join('');
  const semanticHash = stableHash({
    version: P11_PRODUCTION_REPORT_VERSION,
    reportSnapshotHash: snapshot.reportSnapshotHash,
    figureManifestHash: options.figureManifest?.figureManifestHash || null,
    sectionOrder: pages.map((row) => row.kind),
  });
  const html = `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="report-snapshot-hash" content="${snapshot.reportSnapshotHash}">
  <meta name="report-layout-version" content="${P11_PRODUCTION_REPORT_VERSION}">
  <title>${t('report.title')} - ${projectName}</title>
  <style>${productionCss()}</style>
</head>
<body data-report-version="${P11_PRODUCTION_REPORT_VERSION}" data-semantic-hash="${semanticHash}">
<main>${pageHtml}</main><div class="probe">${t('glyph.probe')}</div>
</body></html>`;
  return {
    html,
    layoutVersion: P11_PRODUCTION_REPORT_VERSION,
    pageCount: total,
    sectionOrder: pages.map((row) => row.kind),
    firstPageMarkers: Object.freeze([
      'overall-verdict',
      'four-axis-verdict',
      'key-metrics',
      'governing-result',
      'audit-status',
      'scope-notice',
      'independent-reference-status',
    ]),
  };

  function executiveContent() {
    const verdict = snapshot.verdict;
    const metrics = [
      ['metric.nodes', snapshot.model.nodeCount, ''],
      ['metric.members', snapshot.model.memberCount, ''],
      ['metric.stories', snapshot.model.storyCount, ''],
      ['metric.maxDisplacement', snapshot.analysis.maxDisplacement == null ? null : snapshot.analysis.maxDisplacement * 1000, 'label.unit.mm'],
      ['metric.maxUtilization', snapshot.analysis.maxUtilization, 'label.unit.ratio'],
      ['metric.maxResidual', snapshot.analysis.maxEquilibriumResidual, 'label.unit.ratio'],
    ];
    return `<div class="report-identity"><div><span>${t('report.project')}</span><strong>${projectName}</strong></div>
      <div><span>${t('report.snapshot')}</span><code>${snapshot.reportSnapshotHash.slice(0, 16)}</code></div></div>
      <section class="verdict-panel" data-marker="overall-verdict" data-status="${verdict.overall}">
        <div><span>${t('report.conclusion')}</span><strong>${verdict.overall}</strong></div>
        <p>${t('report.scopeNotice')}</p>
      </section>
      <section data-marker="four-axis-verdict"><h2>${t('section.verdict')}</h2><div class="axis-grid">
        ${Object.entries(verdict.axes).map(([key, row]) => statusCard(t(`axis.${key}`), row.status)).join('')}
      </div></section>
      <section data-marker="key-metrics"><h2>${t('section.analysis')}</h2><div class="metric-grid">
        ${metrics.map(([key, value, unit]) => `<div class="metric-card"><span>${t(key)}</span><strong data-value="${value ?? ''}">${n(value)}${unit ? ` <small>${t(unit)}</small>` : ''}</strong></div>`).join('')}
      </div></section>
      <div class="executive-grid">
        <section class="summary-card" data-marker="governing-result"><h2>${t('section.governing')}</h2>
          <dl><dt>${t('metric.memberId')}</dt><dd><code>${escapeHtml(g.memberId || t('label.notAvailable'))}</code></dd>
          <dt>${t('metric.comboId')}</dt><dd><code>${escapeHtml(g.comboId || t('label.notAvailable'))}</code></dd>
          <dt>${t('metric.ratio')}</dt><dd>${n(g.ratio)}</dd></dl></section>
        <section class="summary-card" data-marker="scope-notice"><h2>${t('section.scope')}</h2>
          <dl><dt>${t('label.audit')}</dt><dd data-marker="audit-status">${snapshot.report.qualityAudit.ok ? 'PASS' : 'REVIEW'}</dd>
          <dt>${t('label.independentReference')}</dt><dd data-marker="independent-reference-status">${snapshot.validation.independentReference.status}</dd>
          <dt>${t('label.phase10Eligibility')}</dt><dd>${escapeHtml(snapshot.validation.phase10Eligibility.status)}</dd></dl></section>
      </div>`;
  }

  function summaryTable(rows) {
    return `<table><thead><tr><th>${t('report.project')}</th><th>${t('label.status')}</th></tr></thead><tbody>
      ${rows.map(([key, value]) => `<tr><th>${t(key)}</th><td data-value="${value}">${n(value, 0)}</td></tr>`).join('')}
      </tbody></table><div class="hash-box"><span>${t('label.modelHash')}</span><code>${snapshot.sourceBinding.modelDomainHash}</code></div>`;
  }

  function analysisContent() {
    return `<table><thead><tr><th>${t('section.analysis')}</th><th>${t('label.status')}</th></tr></thead><tbody>
      ${analysisRows.map(([key, value, unit]) => `<tr><th>${t(key)}</th><td data-value="${value ?? ''}">${n(value)} ${t(unit)}</td></tr>`).join('')}
      </tbody></table><div class="hash-box"><span>${t('label.resultHash')}</span><code>${snapshot.sourceBinding.resultHash}</code></div>`;
  }

  function qualificationContent() {
    return `<div class="executive-grid"><section class="summary-card"><h2>${t('section.audit')}</h2>
      ${statusCard(t('label.audit'), snapshot.report.qualityAudit.ok ? 'PASS' : 'REVIEW')}
      <p>${snapshot.report.qualityAudit.itemStatuses.map(escapeHtml).join(' · ') || t('label.notAvailable')}</p></section>
      <section class="summary-card"><h2>${t('section.scope')}</h2>
      ${statusCard(t('label.independentReference'), snapshot.validation.independentReference.status)}
      ${statusCard(t('label.phase10Eligibility'), snapshot.validation.phase10Eligibility.status)}</section></div>
      <table><thead><tr><th>${t('label.reasonCodes')}</th><th>${t('label.status')}</th></tr></thead><tbody>
      ${snapshot.verdict.reasonCodes.map((code) => `<tr><td><code>${code}</code></td><td>${t(`reason.${code}`)}</td></tr>`).join('')}
      </tbody></table>`;
  }

  function combinationTable(rows) {
    return `<h2>${t('section.combinations')}</h2><table><thead><tr><th>${t('metric.comboId')}</th>
      <th>${t('label.status')}</th><th>${t('metric.maxDisplacement')}</th><th>${t('metric.ratio')}</th></tr></thead><tbody>
      ${rows.map((row) => `<tr><td><code>${escapeHtml(row.id)}</code></td><td>${row.ok ? 'PASS' : 'FAIL'}</td>
      <td data-value="${row.dmax ?? ''}">${n(row.dmax == null ? null : row.dmax * 1000)} ${t('label.unit.mm')}</td>
      <td data-value="${row.maxRatio ?? ''}">${n(row.maxRatio)}</td></tr>`).join('')}</tbody></table>`;
  }

  function figurePage(figure) {
    const caption = t(figure.captionKey);
    const metadata = [
      figure.comboId ? `${t('label.combo')}: ${escapeHtml(figure.comboId)}` : null,
      figure.sourceIds?.length ? `${t('label.cases')}: ${figure.sourceIds.map(escapeHtml).join(', ')}` : null,
      figure.deformScale !== 1 ? `${t('label.scale')}: ${n(figure.deformScale, 3)}` : null,
      `${t('label.assetHash')}: ${figure.sha256}`,
    ].filter(Boolean).join(' · ');
    return pageSpec(`figure-${figure.number}`, caption, `<figure id="${figure.figureId}" data-scene-kind="${figure.sceneKind}" data-asset-sha256="${figure.sha256}">
      <img src="${escapeHtml(figure.assetPath)}" alt="${caption}" width="${figure.width}" height="${figure.height}">
      <figcaption><strong>${t('label.figure')} ${figure.number}.</strong> ${caption}<span>${metadata}</span></figcaption>
      </figure>`);
  }

  function tocContent(rows) {
    return `<nav aria-label="${t('report.toc')}"><ol class="toc">${rows.slice(2).map((row, index) =>
      `<li><span>${escapeHtml(row.title)}</span><b>${index + 3}</b></li>`).join('')}</ol></nav>`;
  }

  function renderPage(page, number, total) {
    return `<section class="report-page" data-page="${number}" data-page-kind="${page.kind}">
      <header><span>${t('report.subtitle')}</span><code>${snapshot.reportSnapshotHash.slice(0, 12)}</code></header>
      <div class="page-content"><h1>${escapeHtml(page.title)}</h1>${page.content}</div>
      <footer><span>${projectName}</span><span>${t('label.page')} ${number} ${t('label.of')} ${total}</span>
      <code>${snapshot.reportSnapshotHash.slice(0, 12)}</code></footer></section>`;
  }
}

function pageSpec(kind, title, content) {
  return { kind, title, content };
}

function statusCard(label, status) {
  return `<div class="status-card" data-status="${escapeHtml(status)}"><span class="status-symbol" aria-hidden="true"></span>
    <div><small>${label}</small><strong>${escapeHtml(status)}</strong></div></div>`;
}

function chunks(rows = [], size) {
  if (!rows.length) return [[]];
  return Array.from({ length: Math.ceil(rows.length / size) }, (_item, index) => rows.slice(index * size, (index + 1) * size));
}

function productionCss() {
  return `
    @page{size:A4;margin:0}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#dfe7ee;color:#172b3d;font:11px/1.45 ${P11_KOREAN_FONT_STACK};print-color-adjust:exact;-webkit-print-color-adjust:exact}
    main{display:flex;flex-direction:column;align-items:center;gap:16px;padding:16px 0}
    .report-page{position:relative;width:210mm;height:297mm;padding:15mm 14mm 17mm;background:#fff;overflow:hidden;break-after:page;page-break-after:always;box-shadow:0 4px 18px rgba(20,42,62,.12)}
    .report-page:last-child{break-after:auto;page-break-after:auto}
    header{height:8mm;display:flex;justify-content:space-between;color:#60778a;border-bottom:1px solid #d9e5ee}
    .page-content{padding-top:7mm}h1{margin:0 0 6mm;color:#003f73;font-size:24px;line-height:1.2}
    h2{margin:5mm 0 2mm;color:#244b68;font-size:14px}p{margin:2mm 0}
    footer{position:absolute;left:14mm;right:14mm;bottom:6mm;display:flex;justify-content:space-between;border-top:1px solid #d9e5ee;padding-top:2mm;color:#60778a;font-size:9px}
    code{font:9.5px/1.4 Consolas,"Courier New",monospace;overflow-wrap:anywhere}
    table{width:100%;border-collapse:collapse;margin:3mm 0 5mm;break-inside:auto}
    thead{display:table-header-group}tr{break-inside:avoid}th,td{padding:2.2mm;border-bottom:1px solid #e1e8ee;text-align:left;vertical-align:top}
    td:last-child{text-align:right}
    .report-identity{display:grid;grid-template-columns:2fr 1fr;gap:3mm;margin-bottom:4mm}.report-identity div{padding:3mm;background:#f4f8fb;border-radius:2mm}
    .report-identity span,.metric-card span,.hash-box span{display:block;color:#60778a;font-size:9px}.report-identity strong{font-size:14px}
    .verdict-panel{display:grid;grid-template-columns:1fr 2fr;gap:5mm;padding:4mm;border:1.5px solid #2c607e;border-left-width:5px;border-radius:2mm;background:#f5fbff}
    .verdict-panel span{display:block;color:#60778a}.verdict-panel strong{font-size:22px;color:#003f73}
    .axis-grid,.metric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2.5mm}.axis-grid{grid-template-columns:repeat(4,1fr)}
    .status-card,.metric-card,.summary-card{border:1px solid #dbe5ed;border-radius:2mm;padding:3mm;background:#fff;break-inside:avoid}
    .status-card{display:flex;gap:2mm;align-items:center}.status-card small{display:block;color:#60778a}.status-card strong{font-size:11px}
    .status-symbol{width:9px;height:9px;border:2px solid #2c607e;border-radius:50%;flex:none}
    [data-status="FAIL"] .status-symbol{border-radius:1px;border-color:#a72d2d;background:#a72d2d}
    [data-status="REVIEW"] .status-symbol,[data-status="NOT_VERIFIED"] .status-symbol,[data-status="not-available"] .status-symbol{border-color:#a86c00;background:#fff3cf}
    [data-status="PASS"] .status-symbol{border-color:#147548;background:#dff5e9}
    .metric-card strong{font-size:15px;color:#003f73}.metric-card small{font-size:9px;font-weight:400}
    .executive-grid{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-top:4mm}.summary-card h2{margin-top:0}
    dl{display:grid;grid-template-columns:1fr 1.3fr;gap:1.5mm;margin:0}dt{color:#60778a}dd{margin:0;text-align:right}
    .hash-box{padding:3mm;border:1px solid #dbe5ed;border-radius:2mm}.hash-box code{display:block;margin-top:1mm}
    .toc{list-style:none;padding:0;margin:0}.toc li{display:flex;gap:4mm;align-items:end;margin:0 0 3mm}.toc li:after{content:"";border-bottom:1px dotted #9babb8;flex:1;order:2}.toc span{order:1}.toc b{order:3;color:#003f73}
    figure{margin:0;border:1px solid #dbe5ed;border-radius:2mm;overflow:hidden;break-inside:avoid;background:#fff}
    figure img{display:block;width:100%;height:auto;max-height:190mm;aspect-ratio:16/9;object-fit:contain;background:#fff}
    figcaption{padding:3mm;color:#294056}figcaption span{display:block;margin-top:1mm;color:#60778a;font-size:8.5px;overflow-wrap:anywhere}
    .probe{position:fixed;left:-9999px;font-size:1px}
    p,li{orphans:3;widows:3}
    @media print{html,body{background:#fff}main{display:block;padding:0}.report-page{box-shadow:none;margin:0}}
  `;
}

function reportError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
