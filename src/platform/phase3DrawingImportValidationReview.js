import { validateImportCandidate } from '../import/candidate.js';

export const PHASE3_DRAWING_IMPORT_VALIDATION_REVIEW_VERSION = 'p3-drawing-import-validation-review-v1';

export function buildPhase3DrawingImportValidationReview(input = {}) {
  const dxfRows = buildDxfRows(input.dxfFixtures || []);
  const dwgRows = buildDwgRows(input.dwgConversions || []);
  const overlayRows = buildOverlayRows(input.overlayEvidence || []);
  const reviewRows = buildReviewRows(input.reviewEntries || []);
  const groups = [
    group('real-office-dxf-fixtures', dxfRows, input.requiredDxfFixtureCount || 1),
    group('dwg-conversion-logs', dwgRows, input.requiredDwgLogCount || 1),
    group('visual-overlay-evidence', overlayRows, input.requiredOverlayCount || 1),
    group('import-review-decisions', reviewRows, input.requiredReviewCount || 1),
  ];
  const missing = groups.filter((item) => !item.ok).map((item) => item.id);
  return {
    version: PHASE3_DRAWING_IMPORT_VALIDATION_REVIEW_VERSION,
    milestone: 'P3-M6/P3-M7',
    tickets: ['P3-T26', 'P3-T27', 'P3-T28', 'P3-T29', 'P3-T30', 'P3-T31', 'P3-T32', 'P3-T33', 'P3-T34', 'P3-T35'],
    sourceDocs: [
      'docs/phase3/IMPORT_DXF_DWG_PLAN.md',
      'docs/verification/P3_M6_IMPORT_VERIFICATION.md',
      'docs/verification/P3_M7_IMPORT_REVIEW_VERIFICATION.md',
    ],
    summary: {
      ok: missing.length === 0,
      productionReady: false,
      ownerReviewRequired: true,
      missing,
      dxfFixtureCount: dxfRows.length,
      dwgLogCount: dwgRows.length,
      overlayEvidenceCount: overlayRows.length,
      reviewDecisionCount: reviewRows.length,
      agentDecision: missing.length ? 'collect-drawing-import-validation-evidence' : 'drawing-import-ready-for-owner-review',
    },
    groups,
    dxfRows,
    dwgRows,
    overlayRows,
    reviewRows,
    requiredEvidence: [
      'real office DXF fixture set',
      'external DWG converter path and conversion log',
      'visual overlay evidence for import review',
      'confirmed or rejected import review decision state',
    ],
    agentUse: {
      readApi: 'getPhase3DrawingImportValidationReview',
      relatedApis: ['getPhase3ImportMilestoneReview', 'confirmImport', 'rejectImport'],
      rule: 'Automated fixture success is not enough; production drawing import requires real office files and visual review evidence.',
    },
  };
}

function buildDxfRows(fixtures) {
  return fixtures.map((item) => {
    const validation = validateImportCandidate(item.candidate);
    const audit = item.candidate?.audit || {};
    const counts = audit.counts || {};
    return {
      id: item.id || item.candidate?.source?.fileId || null,
      kind: item.kind || 'dxf',
      status: validation.ok && item.analysisOk === true ? 'validated' : 'review-required',
      validationOk: validation.ok,
      analysisOk: item.analysisOk === true,
      layerAuditPresent: !!audit.layers,
      unitAuditPresent: !!audit.units,
      unsupportedEntityCount: counts.unsupportedEntityCount || 0,
      warnings: [...(validation.warnings || []), ...(audit.warnings || [])],
    };
  });
}

function buildDwgRows(conversions) {
  return conversions.map((item) => {
    const readiness = item.audit?.readiness || item.plan?.audit?.readiness || item.readiness || null;
    return {
      id: item.id || item.inputPath || item.plan?.inputPath || null,
      status: item.ok === false ? 'conversion-review-required' : readiness?.canRun ? 'ready-to-convert' : 'external-converter-required',
      converterConfigured: !!(item.converterPath || item.plan?.converterPath),
      outputPath: item.outputPath || item.plan?.outputPath || null,
      readiness,
      preflight: item.preflight || null,
      logRecorded: !!(item.stderr || item.stdout || item.log || item.plan),
    };
  });
}

function buildOverlayRows(evidence) {
  return evidence.map((item) => ({
    id: item.id || null,
    status: item.status || (item.imagePath || item.reportPath ? 'recorded' : 'missing'),
    sourcePath: item.sourcePath || null,
    imagePath: item.imagePath || null,
    reportPath: item.reportPath || null,
    reviewer: item.reviewer || null,
  }));
}

function buildReviewRows(entries) {
  return entries.map((item) => ({
    id: item.id || null,
    status: item.status || item.decision?.status || 'pending',
    confirmable: item.review?.confirmable !== false,
    accepted: item.decision?.accepted === true || item.status === 'confirmed',
    rejected: item.decision?.rejected === true || item.status === 'rejected',
    reasons: item.review?.reasons || item.decision?.reasons || [],
  }));
}

function group(id, rows, requiredCount) {
  const okRows = rows.filter((row) => row.status === 'validated' || row.status === 'ready-to-convert' || row.status === 'recorded' || row.accepted || row.rejected);
  return {
    id,
    requiredCount,
    actualCount: rows.length,
    okCount: okRows.length,
    ok: okRows.length >= requiredCount,
  };
}
