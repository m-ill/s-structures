import { buildAnalysisDomainHashes } from '../../core/analysisDomainHashes.js';
import { stableHash } from '../../core/stableHash.js';

export const REPORT_SNAPSHOT_VERSION = 'p11-report-snapshot-v1';
export const REPORT_VERDICT_VERSION = 'p11-report-verdict-v1';
export const REPORT_VERDICT_STATES = Object.freeze(['PASS', 'CONDITIONAL_PASS', 'REVIEW', 'FAIL']);

export function createReportSnapshot(model, analysis, input = {}) {
  const domainHashes = buildAnalysisDomainHashes(model);
  const analysisRecord = analysisRecordOf(analysis, input.detailed);
  const sourceBinding = {
    modelDomainHash: domainHashes.domainHash,
    resultHash: stableHash(analysisRecord),
  };
  const core = {
    schemaVersion: REPORT_SNAPSHOT_VERSION,
    project: {
      id: model?.meta?.id || input.projectId || null,
      modelSchemaVersion: model?.schemaVersion ?? null,
    },
    sourceBinding,
    model: {
      nodeCount: model?.nodes?.length || 0,
      memberCount: model?.members?.length || 0,
      shellCount: model?.shells?.length || 0,
      loadCount: model?.loads?.length || 0,
      loadCaseCount: model?.loadCases?.length || 0,
      combinationCount: model?.loadCombinations?.length || 0,
      storyCount: model?.stories?.length || model?.storyModel?.count || 0,
      domainHashes,
    },
    analysis: analysisRecord,
    report: {
      calculationPackageVersion: input.calculationPackageVersion || null,
      detailedReportVersion: input.detailed?.version || null,
      qualityAudit: auditRecordOf(input.qualityAudit),
      analysisRunCount: input.analysisRuns?.rows?.length || 0,
    },
    provenance: {
      sourceRevision: input.sourceRevision || null,
      buildId: input.buildId || null,
      analysisRunIds: (input.analysisRuns?.rows || []).map((row) => row.id).filter(Boolean).sort(),
    },
    validation: {
      independentReference: referenceRecordOf(input.externalValidation),
      phase10Eligibility: eligibilityRecordOf(input.phase10Eligibility),
    },
    limitationCodes: limitationCodesOf(analysis, input),
  };
  const reportSnapshotHash = stableHash(core);
  const verdict = buildReportVerdict({ snapshot: core, analysis, stale: input.stale === true });
  return deepFreeze({ ...core, reportSnapshotHash, verdict });
}

export function buildReportVerdict({ snapshot, analysis = {}, stale = false }) {
  const reasons = new Set();
  const validationErrors = analysis?.validation?.errors || [];
  const failedCombinations = analysis?.failedCombinations
    || analysis?.combinationCompleteness?.rows?.filter((row) => row.complete === false)
    || [];
  const operationalPass = analysis?.ok === true && validationErrors.length === 0;
  if (!operationalPass) reasons.add('ANALYSIS_FAILED');
  if (stale) reasons.add('STALE_SNAPSHOT');

  const audit = snapshot?.report?.qualityAudit;
  const residual = snapshot?.analysis?.maxEquilibriumResidual;
  const numericalPass = operationalPass
    && audit?.ok === true
    && failedCombinations.length === 0
    && (residual == null || Number.isFinite(residual));
  if (audit?.ok === false) reasons.add('AUDIT_FAILED');
  if (failedCombinations.length) reasons.add('REQUIRED_EVIDENCE_MISSING');

  const independentVerified = snapshot?.validation?.independentReference?.status === 'verified';
  if (!independentVerified) reasons.add('INDEPENDENT_REFERENCE_NOT_AVAILABLE');
  const phase10 = snapshot?.validation?.phase10Eligibility;
  const engineeringPass = independentVerified && phase10?.eligible === true;
  if (!engineeringPass) reasons.add('ENGINEERING_VALIDATION_INCOMPLETE');

  const designEligibility = analysis?.designEligibility || analysis?.design?.eligibility || {};
  const issuePass = designEligibility.eligible === true || designEligibility.allowed === true;
  if (!issuePass) reasons.add('ISSUE_SCOPE_LIMITED');
  for (const code of snapshot?.limitationCodes || []) reasons.add(code);
  if (operationalPass) reasons.add('OPERATIONAL_CHECKS_PASSED');

  const axes = {
    operational: axis(stale ? 'FAIL' : operationalPass ? 'PASS' : 'FAIL'),
    numericalIntegrity: axis(stale ? 'FAIL' : numericalPass ? 'PASS' : operationalPass ? 'REVIEW' : 'FAIL'),
    engineeringValidation: axis(engineeringPass ? 'PASS' : 'NOT_VERIFIED'),
    issueSuitability: axis(issuePass ? 'PASS' : operationalPass ? 'REVIEW' : 'FAIL'),
  };
  let overall = 'PASS';
  if (Object.values(axes).some((row) => row.status === 'FAIL')) overall = 'FAIL';
  else if (axes.operational.status !== 'PASS' || axes.numericalIntegrity.status !== 'PASS') overall = 'REVIEW';
  else if (!engineeringPass || !issuePass) overall = 'CONDITIONAL_PASS';
  return deepFreeze({
    version: REPORT_VERDICT_VERSION,
    overall,
    axes,
    reasonCodes: [...reasons].sort(),
  });
}

export function validateReportSnapshot(value) {
  const errors = [];
  if (value?.schemaVersion !== REPORT_SNAPSHOT_VERSION) errors.push('schemaVersion');
  if (!/^[a-f0-9]{64}$/.test(value?.reportSnapshotHash || '')) errors.push('reportSnapshotHash');
  if (!value?.sourceBinding?.modelDomainHash || !value?.sourceBinding?.resultHash) errors.push('sourceBinding');
  if (!REPORT_VERDICT_STATES.includes(value?.verdict?.overall)) errors.push('verdict.overall');
  if (!value?.verdict?.axes || Object.keys(value.verdict.axes).length !== 4) errors.push('verdict.axes');
  const { reportSnapshotHash, verdict, ...core } = value || {};
  if (reportSnapshotHash && stableHash(core) !== reportSnapshotHash) errors.push('hashMismatch');
  if (containsForbiddenKey(value)) errors.push('displayOrPathField');
  return { ok: errors.length === 0, errors };
}

export function assertReportSnapshotCurrent(snapshot, model, analysis) {
  const currentModelHash = buildAnalysisDomainHashes(model).domainHash;
  const currentResultHash = stableHash(analysisRecordOf(analysis));
  if (snapshot?.sourceBinding?.modelDomainHash !== currentModelHash
    || snapshot?.sourceBinding?.resultHash !== currentResultHash) {
    const error = new Error('Report snapshot is stale for the current model or analysis result.');
    error.code = 'P11_REPORT_SNAPSHOT_STALE';
    throw error;
  }
  return true;
}

function analysisRecordOf(analysis = {}, detailed = null) {
  const source = detailed?.analysis || {};
  const comboRows = Object.entries(analysis?.byCombo || {}).map(([id, row]) => ({
    id,
    ok: row?.ok === true,
    dmax: finite(row?.dmax ?? row?.summary?.maxDisplacement),
    maxRatio: finite(row?.maxRatio),
    equilibriumResidual: finite(row?.summary?.equilibriumResidual),
  })).sort((a, b) => a.id.localeCompare(b.id));
  return {
    ok: analysis?.ok === true,
    errorCount: analysis?.validation?.errors?.length || source.errorCount || 0,
    warningCount: analysis?.validation?.warnings?.length || source.warningCount || 0,
    failedCombinationCount: analysis?.combinationCompleteness?.rows?.filter((row) => row.complete === false).length || 0,
    combinationCount: comboRows.length || source.comboCount || 0,
    maxDisplacement: finite(source.maxDisplacement ?? analysis?.envelope?.dmax),
    maxUtilization: finite(source.maxUtilization ?? analysis?.design?.summary?.maxUtilization ?? analysis?.envelope?.maxRatio),
    maxEquilibriumResidual: finite(source.maxEquilibriumResidual ?? analysis?.audit?.maxEquilibriumResidual),
    governing: governingRecord(source.governing ?? analysis?.design?.summary?.governing),
    combinations: comboRows,
  };
}

function auditRecordOf(audit) {
  return {
    ok: audit?.ok === true,
    itemStatuses: (audit?.items || []).map((row) => row.status).sort(),
  };
}

function referenceRecordOf(reference) {
  return {
    status: reference?.verified === true || reference?.status === 'verified' ? 'verified' : 'not-available',
    referenceId: reference?.referenceId || null,
    evidenceHash: reference?.evidenceHash || null,
  };
}

function eligibilityRecordOf(value) {
  return {
    eligible: value?.eligible === true || value?.allowed === true,
    status: value?.status || 'not-verified',
    reasonCodes: [...(value?.reasonCodes || [])].filter(Boolean).sort(),
  };
}

function limitationCodesOf(analysis, input) {
  const values = [
    ...(input.limitationCodes || []),
    ...(analysis?.designEligibility?.limitationCodes || []),
    ...(analysis?.design?.eligibility?.limitationCodes || []),
  ];
  if (analysis?.pDelta?.designEligibility?.status === 'not-requested') values.push('FEATURE_NOT_IN_SCOPE');
  return [...new Set(values.filter((item) => /^[A-Z][A-Z0-9_]+$/.test(item)))].sort();
}

function governingRecord(value) {
  if (!value) return null;
  return {
    memberId: value.memberId || null,
    checkId: value.checkId || value.governingCheck || null,
    comboId: value.comboId || null,
    ratio: finite(value.ratio ?? value.utilization),
    status: value.status || null,
  };
}

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function axis(status) {
  return Object.freeze({ status });
}

function containsForbiddenKey(value) {
  const forbidden = /^(locale|outputPath|displayPath|generatedAt|renderedAt)$/i;
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    for (const [key, child] of Object.entries(current)) {
      if (forbidden.test(key)) return true;
      if (child && typeof child === 'object') stack.push(child);
    }
  }
  return false;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
