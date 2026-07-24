import { stableHash } from '../../core/stableHash.js';
import { escapeHtml } from '../reportFormat.js';
import { P11_VERDICT_REASON_CODES } from './governance.js';
import {
  P11_KOREAN_FONT_STACK,
  P11_REPORT_LOCALES,
  createReportTranslator,
  formatReportNumber,
  validateReportCatalogs,
} from './i18n.js';
import { validateReportSnapshot } from './reportSnapshot.js';
import { P11_REQUIRED_SCENES, assertFigureManifestComplete } from './sceneEvidence.js';

export const P11_BILINGUAL_REPORT_VERSION = 'p11-bilingual-html-v1';

export function renderLocalizedReportHtml(snapshot, locale, options = {}) {
  const validation = validateReportSnapshot(snapshot);
  if (!validation.ok) throw reportError('P11_REPORT_SNAPSHOT_INVALID', validation.errors.join(', '));
  const used = new Set();
  const translate = createReportTranslator(locale);
  const t = (key, params) => {
    used.add(key);
    return translate(key, params);
  };
  for (const code of P11_VERDICT_REASON_CODES) used.add(`reason.${code}`);
  used.add('label.notAvailable');
  for (const key of [
    'section.evidence.loads',
    'label.figure',
    'label.combo',
    'label.cases',
    'label.scale',
    'label.assetHash',
    ...P11_REQUIRED_SCENES.map((row) => `figure.caption.${row.kind}`),
  ]) used.add(key);
  const n = (value, digits = 6) => formatReportNumber(value, locale, { maximumFractionDigits: digits });
  const a = snapshot.analysis;
  const g = a.governing || {};
  const projectName = escapeHtml(options.projectName || snapshot.project.id || t('label.notAvailable'));
  const metricRows = [
    ['metric.nodes', snapshot.model.nodeCount, ''],
    ['metric.members', snapshot.model.memberCount, ''],
    ['metric.loads', snapshot.model.loadCount, ''],
    ['metric.loadCases', snapshot.model.loadCaseCount, ''],
    ['metric.combinations', snapshot.model.combinationCount, ''],
    ['metric.stories', snapshot.model.storyCount, ''],
  ];
  const analysisRows = [
    ['metric.maxDisplacement', a.maxDisplacement == null ? null : a.maxDisplacement * 1000, 'label.unit.mm'],
    ['metric.maxUtilization', a.maxUtilization, 'label.unit.ratio'],
    ['metric.maxResidual', a.maxEquilibriumResidual, 'label.unit.ratio'],
  ];
  const axisRows = Object.entries(snapshot.verdict.axes);
  const reasonRows = snapshot.verdict.reasonCodes.map((code) => [code, `reason.${code}`]);
  const figureManifest = options.figureManifest || null;
  if (figureManifest) assertFigureManifestComplete(figureManifest, snapshot);
  else if (options.requireFigures === true) throw reportError('P11_REPORT_FIGURES_REQUIRED', 'Required figure manifest is missing.');
  const figures = figureManifest?.figures || [];
  const semantic = {
    reportSnapshotHash: snapshot.reportSnapshotHash,
    verdict: snapshot.verdict,
    model: snapshot.model,
    analysis: snapshot.analysis,
    figureManifestHash: figureManifest?.figureManifestHash || null,
    figureAssetHashes: figures.map((row) => row.sha256),
  };
  const html = `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="report-snapshot-hash" content="${snapshot.reportSnapshotHash}">
  <title>${t('report.title')}</title>
  <style>
    @page{size:A4;margin:16mm 14mm}
    *{box-sizing:border-box}body{margin:0;background:#eaf0f5;color:#172b3d;font:12px/1.5 ${P11_KOREAN_FONT_STACK}}
    main{max-width:900px;margin:auto;background:#fff;min-height:100vh;padding:28px}.eyebrow{color:#537087}
    h1{margin:4px 0;color:#003f73;font-size:27px}h2{color:#003f73;border-bottom:2px solid #d9e6ef;padding-bottom:5px}
    .verdict{border:2px solid #2c607e;border-radius:7px;padding:14px;margin:18px 0;background:#f5fbff}
    .overall{font-size:22px;font-weight:700}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .card{border:1px solid #dbe5ed;border-radius:5px;padding:9px}.card span{display:block;color:#60778a}.card b{font-size:15px}
    table{width:100%;border-collapse:collapse;margin:8px 0 16px}th,td{padding:6px;border-bottom:1px solid #e1e8ee;text-align:left}
    td:last-child{text-align:right}.code{font-family:Consolas,monospace}.probe{font-size:1px;color:#fff}
    figure{margin:14px 0 20px;break-inside:avoid;border:1px solid #dbe5ed;border-radius:6px;overflow:hidden;background:#fff}
    figure img{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:contain;background:#fff}
    figcaption{padding:8px 10px;color:#294056}.figure-meta{display:block;margin-top:3px;color:#60778a;font-size:10px}
    @media print{body{background:#fff}main{max-width:none;padding:0}}
  </style>
</head>
<body data-report-version="${P11_BILINGUAL_REPORT_VERSION}" data-semantic-hash="${stableHash(semantic)}">
<main>
  <div class="eyebrow">${t('report.subtitle')}</div>
  <h1>${t('report.title')}</h1>
  <table><tr><th>${t('report.project')}</th><td>${projectName}</td></tr>
  <tr><th>${t('report.snapshot')}</th><td class="code">${snapshot.reportSnapshotHash}</td></tr>
  <tr><th>${t('report.schema')}</th><td class="code">${snapshot.schemaVersion}</td></tr></table>
  <div class="verdict"><span>${t('report.conclusion')}</span><div class="overall">${snapshot.verdict.overall}</div>
  <p>${t('report.scopeNotice')}</p></div>
  <h2>${t('section.verdict')}</h2>
  <table>${axisRows.map(([key, row]) => `<tr><th>${t(`axis.${key}`)}</th><td class="code">${row.status}</td></tr>`).join('')}</table>
  <h2>${t('section.model')}</h2><div class="grid">${metricRows.map(([key, value]) => `<div class="card"><span>${t(key)}</span><b data-value="${value}">${n(value, 0)}</b></div>`).join('')}</div>
  ${renderFigures(figures, 'model', t)}
  ${figures.some((row) => row.placement === 'loads') ? `<h2>${t('section.evidence.loads')}</h2>${renderFigures(figures, 'loads', t)}` : ''}
  <h2>${t('section.analysis')}</h2><table>${analysisRows.map(([key, value, unit]) => `<tr><th>${t(key)}</th><td data-value="${value ?? ''}">${n(value)} ${t(unit)}</td></tr>`).join('')}</table>
  ${renderFigures(figures, 'analysis', t)}
  <h2>${t('section.governing')}</h2><table>
    <tr><th>${t('metric.memberId')}</th><td class="code">${escapeHtml(g.memberId || t('label.notAvailable'))}</td></tr>
    <tr><th>${t('metric.comboId')}</th><td class="code">${escapeHtml(g.comboId || t('label.notAvailable'))}</td></tr>
    <tr><th>${t('metric.checkId')}</th><td class="code">${escapeHtml(g.checkId || t('label.notAvailable'))}</td></tr>
    <tr><th>${t('metric.ratio')}</th><td data-value="${g.ratio ?? ''}">${n(g.ratio)}</td></tr></table>
  <h2>${t('section.limitations')}</h2><table><tr><th>${t('label.reasonCodes')}</th><th>${t('label.status')}</th></tr>
  ${reasonRows.map(([code, key]) => `<tr><td class="code">${code}</td><td>${t(key)}</td></tr>`).join('')}</table>
  <footer>${t('footer.generatedFrom', { hash: snapshot.reportSnapshotHash })}</footer>
  <div class="probe">${t('glyph.probe')}</div>
</main></body></html>`;
  const catalogValidation = validateReportCatalogs(used);
  if (!catalogValidation.ok) throw reportError('P11_REPORT_CATALOG_INVALID', catalogValidation.errors.join(', '));
  return Object.freeze({
    locale,
    html,
    reportSnapshotHash: snapshot.reportSnapshotHash,
    semanticHash: stableHash(semantic),
    numericValues: numericValuesOf(snapshot),
    technicalIds: technicalIdsOf(snapshot),
    figureAssets: figures.map((row) => ({ sceneKind: row.sceneKind, sha256: row.sha256, assetPath: row.assetPath })),
    usedMessageKeys: [...used].sort(),
  });
}

export function renderBilingualReportPair(snapshot, options = {}) {
  const reports = Object.fromEntries(P11_REPORT_LOCALES.map((locale) => [
    locale,
    renderLocalizedReportHtml(snapshot, locale, options),
  ]));
  const ko = reports['ko-KR'];
  const en = reports['en-US'];
  if (ko.reportSnapshotHash !== en.reportSnapshotHash
    || ko.semanticHash !== en.semanticHash
    || JSON.stringify(ko.numericValues) !== JSON.stringify(en.numericValues)
    || JSON.stringify(ko.technicalIds) !== JSON.stringify(en.technicalIds)
    || JSON.stringify(ko.figureAssets) !== JSON.stringify(en.figureAssets)) {
    throw reportError('P11_REPORT_LOCALE_PARITY_FAILED', 'Bilingual report semantic parity failed.');
  }
  const manifest = {
    version: P11_BILINGUAL_REPORT_VERSION,
    status: 'complete',
    reportSnapshotHash: snapshot.reportSnapshotHash,
    locales: [...P11_REPORT_LOCALES],
    semanticHash: ko.semanticHash,
    numericParity: true,
    technicalIdParity: true,
    figureAssetParity: true,
    figureManifestHash: options.figureManifest?.figureManifestHash || null,
    figureCount: ko.figureAssets.length,
  };
  return Object.freeze({ reports, manifest: Object.freeze({ ...manifest, pairHash: stableHash(manifest) }) });
}

function renderFigures(figures, placement, t) {
  return figures.filter((row) => row.placement === placement).map((row) => {
    const caption = t(row.captionKey);
    const details = [
      row.comboId ? `${t('label.combo')}: ${escapeHtml(row.comboId)}` : null,
      row.sourceIds?.length ? `${t('label.cases')}: ${row.sourceIds.map((id) => escapeHtml(id)).join(', ')}` : null,
      row.deformScale !== 1 ? `${t('label.scale')}: ${escapeHtml(row.deformScale)}` : null,
      `${t('label.assetHash')}: ${row.sha256}`,
    ].filter(Boolean).join(' · ');
    return `<figure id="${row.figureId}" data-scene-kind="${row.sceneKind}" data-asset-sha256="${row.sha256}">
      <img src="${escapeHtml(row.assetPath)}" alt="${caption}" width="${row.width}" height="${row.height}">
      <figcaption><b>${t('label.figure')} ${row.number}.</b> ${caption}<span class="figure-meta">${details}</span></figcaption>
    </figure>`;
  }).join('');
}

function numericValuesOf(snapshot) {
  const values = [];
  const visit = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) values.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.keys(value).sort().forEach((key) => visit(value[key]));
  };
  visit({ model: snapshot.model, analysis: snapshot.analysis });
  return values;
}

function technicalIdsOf(snapshot) {
  return [
    snapshot.analysis.governing?.memberId,
    snapshot.analysis.governing?.comboId,
    snapshot.analysis.governing?.checkId,
    ...snapshot.analysis.combinations.map((row) => row.id),
    ...snapshot.verdict.reasonCodes,
  ].filter(Boolean);
}

function reportError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
