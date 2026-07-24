import { stableHash } from '../../core/stableHash.js';

export const P11_QUALIFICATION_VERSION = 'p11-report-qualification-v1';
export const P11_QUALIFICATION_BUDGETS = Object.freeze({
  dualExportP95Ms: 30_000,
  peakWorkingSetBytes: 1024 * 1024 * 1024,
  firstProgressMs: 500,
  cancelAcknowledgementMs: 2_000,
  pdfBytes: 25 * 1024 * 1024,
});

export const P11_M8_VERIFICATION_IDS = Object.freeze([
  ...series('P11-VIS', 9, 20),
  ...series('P11-PERF', 1, 10),
  ...series('P11-SEC', 11, 20),
  ...series('P11-FAIL', 9, 16),
]);

export function qualifyPhase11Reports(input = {}) {
  const budgets = Object.freeze({ ...P11_QUALIFICATION_BUDGETS, ...(input.budgets || {}) });
  const timings = [...(input.performance?.dualExportDurationsMs || [])]
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const visual = input.visual || {};
  const security = input.security || {};
  const failures = input.failures || {};
  const environment = input.environment || {};
  const metrics = Object.freeze({
    sampleCount: timings.length,
    dualExportP95Ms: percentile(timings, 0.95),
    peakWorkingSetBytes: Number(input.performance?.peakWorkingSetBytes || 0),
    firstProgressMs: Number(input.performance?.firstProgressMs ?? Infinity),
    cancelAcknowledgementMs: Number(input.performance?.cancelAcknowledgementMs ?? Infinity),
    maximumPdfBytes: Math.max(0, ...(input.performance?.pdfBytes || []).map(Number)),
    rasterPages: Number(visual.rasterPages || 0),
    expectedRasterPages: Number(visual.expectedRasterPages || 0),
    blankPages: Number(visual.blankPages || 0),
    edgeInkPages: Number(visual.edgeInkPages || 0),
    replacementCharacters: Number(visual.replacementCharacters || 0),
    privacyFindings: Number(security.privacyFindings || 0),
    injectionFindings: Number(security.injectionFindings || 0),
    networkRequests: Number(security.networkRequests || 0),
    falseSuccesses: Number(failures.falseSuccesses || 0),
    cleanupFailures: Number(failures.cleanupFailures || 0),
  });
  const checks = [
    check('P11-M8-ENV', environment.platform === 'win32' && !!environment.browser
      && !!environment.pdfInspector && !!environment.rasterizer, 'Windows Chrome/Chromium, PDF inspector and rasterizer profile'),
    check('P11-M8-PERF-SAMPLES', metrics.sampleCount >= 5, 'At least five actual dual-export timing samples'),
    check('P11-M8-PERF-P95', metrics.dualExportP95Ms <= budgets.dualExportP95Ms, 'Dual-export p95 budget'),
    check('P11-M8-PERF-MEMORY', metrics.peakWorkingSetBytes <= budgets.peakWorkingSetBytes, 'Peak working-set budget'),
    check('P11-M8-PERF-PROGRESS', metrics.firstProgressMs <= budgets.firstProgressMs, 'First progress budget'),
    check('P11-M8-PERF-CANCEL', metrics.cancelAcknowledgementMs <= budgets.cancelAcknowledgementMs, 'Cancel acknowledgement budget'),
    check('P11-M8-PERF-SIZE', metrics.maximumPdfBytes <= budgets.pdfBytes, 'Per-PDF size budget'),
    check('P11-M8-VIS-PAGES', metrics.rasterPages === metrics.expectedRasterPages && metrics.rasterPages > 0, 'All pages rasterized'),
    check('P11-M8-VIS-BLANK', metrics.blankPages === 0, 'No blank page'),
    check('P11-M8-VIS-EDGE', metrics.edgeInkPages === 0, 'No edge clipping signal'),
    check('P11-M8-VIS-GLYPH', metrics.replacementCharacters === 0 && visual.koreanSearchable === true, 'Korean searchable text and no replacement glyph'),
    check('P11-M8-VIS-FONT', visual.fontsEmbedded === true && visual.a4 === true && visual.footer === true, 'Embedded fonts, A4 and footer'),
    check('P11-M8-SEC-PRIVACY', metrics.privacyFindings === 0, 'No secret or local-path disclosure'),
    check('P11-M8-SEC-INJECTION', metrics.injectionFindings === 0, 'HTML/script injection escaped'),
    check('P11-M8-SEC-OFFLINE', metrics.networkRequests === 0, 'Offline rendering without network requests'),
    check('P11-M8-FAIL-MATRIX', Number(failures.passed || 0) === Number(failures.total || -1)
      && Number(failures.total || 0) >= 8, 'Failure matrix complete'),
    check('P11-M8-FAIL-CLEANUP', metrics.falseSuccesses === 0 && metrics.cleanupFailures === 0, 'No false success or residual staging artifacts'),
    check('P11-M8-SMOKE', input.smoke?.package === true && input.smoke?.install === true
      && input.smoke?.desktopContract === true && input.smoke?.browserFallback === true, 'Package/install and product adapter smoke'),
  ];
  const blockers = checks.filter((row) => row.status !== 'PASS')
    .map((row) => Object.freeze({ code: row.id, statement: row.statement }));
  const core = {
    version: P11_QUALIFICATION_VERSION,
    status: blockers.length ? 'BLOCKED' : 'PASS',
    qualified: blockers.length === 0,
    profile: 'windows-chromium-poppler-pypdf-v1',
    budgets,
    metrics,
    checks,
    blockers,
    visualGolden: Object.freeze({
      policy: 'source-revision-and-reason-required',
      sourceRevision: input.sourceRevision || null,
      approvalReason: input.visual?.approvalReason || null,
      contactSheets: Object.freeze([...(input.visual?.contactSheets || [])]),
    }),
  };
  return Object.freeze({ ...core, qualificationHash: stableHash(core) });
}

export function validatePhase11Qualification(value) {
  const errors = [];
  if (value?.version !== P11_QUALIFICATION_VERSION) errors.push('version');
  if (!['PASS', 'BLOCKED'].includes(value?.status)) errors.push('status');
  if (value?.qualified !== (value?.status === 'PASS')) errors.push('qualified');
  if (value?.checks?.length !== 18) errors.push('checks');
  if (value?.status === 'PASS' && value?.checks?.some((row) => row.status !== 'PASS')) errors.push('checkStatus');
  const { qualificationHash, ...core } = value || {};
  if (!qualificationHash || stableHash(core) !== qualificationHash) errors.push('qualificationHash');
  return Object.freeze({ ok: errors.length === 0, errors });
}

function check(id, passed, statement) {
  return Object.freeze({ id, status: passed ? 'PASS' : 'BLOCKED', statement });
}

function percentile(sorted, ratio) {
  if (!sorted.length) return Infinity;
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function series(prefix, first, last) {
  return Array.from({ length: last - first + 1 }, (_row, index) => `${prefix}-${String(first + index).padStart(2, '0')}`);
}
