export const PHASE3_POINT_CLOUD_VALIDATION_REVIEW_VERSION = 'p3-pointcloud-validation-review-v2';

export function buildPhase3PointCloudValidationReview(input = {}) {
  const evidenceCoverage = buildEvidenceCoverage(input.evidence || input.projectEvidence || []);
  const loadRows = buildLoadRows(input.importSummaries || []);
  const extractionRows = buildExtractionRows(input.extractionBenchmarks || []);
  const realScanRows = buildRealScanRows(input.realScanEvidence || []);
  const performanceRows = buildPerformanceRows(input.performanceEvidence || []);
  const groups = [
    group('loader-and-worker-fixtures', loadRows, input.requiredLoadCount || 1),
    group('synthetic-extraction-benchmark', extractionRows, input.requiredBenchmarkCount || 1),
    group('real-scan-validation', realScanRows, input.requiredRealScanCount || 1),
    group('large-file-performance', performanceRows, input.requiredPerformanceCount || 1),
  ];
  const missing = groups.filter((item) => !item.ok).map((item) => item.id);
  return {
    version: PHASE3_POINT_CLOUD_VALIDATION_REVIEW_VERSION,
    milestone: 'P3-M8/P3-M9',
    tickets: ['P3-T36', 'P3-T37', 'P3-T38', 'P3-T39', 'P3-T40', 'P3-T41', 'P3-T42', 'P3-T43', 'P3-T44', 'P3-T45'],
    sourceDocs: [
      'docs/phase3/IMPORT_POINT_CLOUD_PLAN.md',
      'docs/verification/P3_M8_POINTCLOUD_LOAD_VERIFICATION.md',
      'docs/verification/P3_M9_POINTCLOUD_EXTRACTION_VERIFICATION.md',
    ],
    summary: {
      ok: missing.length === 0,
      productionReady: false,
      ownerReviewRequired: true,
      missing,
      importSummaryCount: loadRows.length,
      extractionBenchmarkCount: extractionRows.length,
      realScanEvidenceCount: realScanRows.length,
      performanceEvidenceCount: performanceRows.length,
      evidenceCoverage,
      agentDecision: missing.length ? 'collect-pointcloud-validation-evidence' : 'pointcloud-import-ready-for-owner-review',
    },
    groups,
    loadRows,
    extractionRows,
    realScanRows,
    performanceRows,
    evidenceCoverage,
    requiredEvidence: [
      'owner-provided real point-cloud files',
      'large-file performance record',
      'binary/LAS format decision or conversion guidance',
      'beam and wall validation without synthetic ground-truth assistance',
    ],
    agentUse: {
      readApi: 'getPhase3PointCloudValidationReview',
      relatedApis: ['getPhase3ImportMilestoneReview', 'getPhase3PracticeValidationReview'],
      rule: 'Synthetic benchmark pass is useful but does not close real-scan production validation.',
    },
  };
}

function buildEvidenceCoverage(evidence) {
  const requiredIds = ['real-pointcloud-files', 'large-pointcloud-performance', 'real-scan-extraction-validation'];
  const rows = requiredIds.map((id) => {
    const matches = evidence.filter((item) => item.id === id);
    const accepted = matches.some((item) => item.accepted === true || item.status === 'accepted');
    return {
      id,
      accepted,
      evidenceCount: matches.length,
      fileIds: matches.map((item) => item.fileId).filter(Boolean),
      reportPaths: matches.map((item) => item.reportPath || item.reviewReportPath).filter(Boolean),
    };
  });
  return {
    requiredIds,
    acceptedCount: rows.filter((row) => row.accepted).length,
    missing: rows.filter((row) => !row.accepted).map((row) => row.id),
    rows,
  };
}

function buildLoadRows(summaries) {
  return summaries.map((item) => ({
    id: item.id || item.loader?.fileName || null,
    status: item.status === 'ready-for-review' && item.readiness?.workerPipelineReady ? 'validated' : 'review-required',
    detectedFormat: item.readiness?.detectedFormat || item.loader?.format || null,
    workerPipelineReady: item.readiness?.workerPipelineReady === true,
    viewerBufferReady: item.readiness?.viewerBufferReady === true,
    transferableReady: item.readiness?.transferableReady === true,
    outputCount: item.counts?.output || 0,
    warnings: item.warnings || [],
  }));
}

function buildExtractionRows(benchmarks) {
  return benchmarks.map((item) => ({
    id: item.id || null,
    status: item.review?.syntheticGate === 'pass' ? 'synthetic-validated' : 'review-required',
    syntheticGate: item.review?.syntheticGate || null,
    realScanGate: item.review?.realScanGate || item.validationStatus?.realScan || null,
    ownerReviewReady: item.review?.ownerReviewReady === true,
    productionReady: item.review?.productionReady === true,
    storyErrorMax: item.storyErrorMax ?? null,
    columnRecall: item.columnRecall ?? null,
    columnPrecision: item.columnPrecision ?? null,
    beamRecall: item.beamRecall ?? null,
    wallRecall: item.wallRecall ?? null,
    failedTargets: item.review?.failedTargets || [],
  }));
}

function buildRealScanRows(evidence) {
  return evidence.map((item) => {
    const missing = [];
    if (!item.fileId) missing.push('file-id');
    if (item.ownerProvided !== true) missing.push('owner-provided-file');
    if (item.beamWallValidation !== true) missing.push('beam-wall-validation');
    if (!item.reviewReportPath) missing.push('review-report');
    const rawStatus = item.status || (item.validationStatus === 'checked' ? 'checked' : 'pending-owner-review');
    return {
      id: item.id || item.fileId || null,
      status: rawStatus === 'checked' && missing.length === 0 ? 'checked' : 'pending-owner-review',
      rawStatus,
      fileId: item.fileId || null,
      format: item.format || null,
      ownerProvided: item.ownerProvided === true,
      beamWallValidation: item.beamWallValidation === true,
      reviewReportPath: item.reviewReportPath || null,
      missing,
    };
  });
}

function buildPerformanceRows(evidence) {
  return evidence.map((item) => ({
    id: item.id || null,
    status: item.status || (item.recorded === true ? 'recorded' : 'missing'),
    pointCount: item.pointCount || 0,
    parseMs: item.parseMs ?? null,
    preprocessMs: item.preprocessMs ?? null,
    viewerFps: item.viewerFps ?? null,
    budget: item.budget || null,
  }));
}

function group(id, rows, requiredCount) {
  const okRows = rows.filter((row) => (
    row.status === 'validated' ||
    row.status === 'synthetic-validated' ||
    row.status === 'checked' ||
    row.status === 'recorded'
  ));
  return {
    id,
    requiredCount,
    actualCount: rows.length,
    okCount: okRows.length,
    ok: okRows.length >= requiredCount,
  };
}
