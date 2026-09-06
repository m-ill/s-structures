import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { validateManifestDocument } from './manifestValidation.mjs';
import {
  P17_APPEND_ONLY_ASSURANCE_POLICY,
  P17_EXTERNAL_SIGNED_ANCHOR,
  verifyAppendOnlyRun,
} from './appendOnlyRunStore.mjs';
import { verifyExtractedActualValuesArtifact } from './resultExtractor.mjs';
import { prepareReferenceBundle } from './referenceRepository.mjs';
import { evaluateLockedComparison } from './comparisonEvaluator.mjs';

export const P17_CAPTURE_INDEX_VERSION = 'p17-capture-index-v1';
export const P17_EVIDENCE_REPORT_CONTRACT_VERSION = 'p17-m1-evidence-report-contract-v1';
export const P17_CASE_EVIDENCE_VERSION = 'p17-case-evidence-v1';
export const P17_REPORT_MANIFEST_VERSION = 'p17-report-manifest-v1';
export const P17_M1_TERMINAL_PASS_ENABLED = false;

export const P17_CAPTURE_ROLES = Object.freeze([
  'MODEL',
  'SUPPORTS_LOADS_AXES',
  'ANALYSIS_RESULT',
  'COMPARISON',
]);

/** Creates a capture index; M1 uses the explicit no-UI state. */
export function createCaptureIndex(input = {}) {
  const status = String(input.status || 'NOT_RUN_M1_FRAMEWORK_ONLY');
  const captures = Array.isArray(input.captures) ? input.captures.map(normalizeCapture) : [];
  const reasonCodes = uniqueStrings(input.reasonCodes || []);
  const core = {
    schemaVersion: P17_CAPTURE_INDEX_VERSION,
    caseId: String(input.caseId || ''),
    runId: input.runId == null ? null : String(input.runId),
    modelHash: input.modelHash == null ? null : String(input.modelHash),
    status,
    browser: String(input.browser || (status === 'COMPLETE' ? 'CHROME' : 'NOT_RUN_M1')),
    captures,
    reasonCodes,
    parityStatus: String(input.parityStatus || (status === 'BLOCKED_UI' ? 'BLOCKED_UI' : 'NOT_RUN_M1_FRAMEWORK_ONLY')),
  };
  const errors = validateCaptureIndex(core, { requireHash: false });
  if (errors.length) throw reportError('P17_CAPTURE_INDEX_INVALID', errors.join(', '));
  return deepFreeze({ ...core, captureIndexHash: canonicalHash(core) });
}

/** Creates a self-hashed report manifest without rendering or solving. */
export function createReportManifest(input = {}) {
  const status = String(input.status || 'NOT_GENERATED');
  const core = {
    schemaVersion: P17_REPORT_MANIFEST_VERSION,
    caseId: String(input.caseId || ''),
    runId: input.runId == null ? null : String(input.runId),
    status,
    mode: 'IMMUTABLE_EVIDENCE_ONLY',
    evidenceBinding: normalizeNullableBinding(input.evidenceBinding),
    comparisonBinding: normalizeNullableBinding(input.comparisonBinding),
    captureIndexBinding: normalizeNullableBinding(input.captureIndexBinding),
    outputs: {
      markdownPath: input.outputs?.markdownPath == null ? null : normalizeRepositoryPath(input.outputs.markdownPath),
      markdownHash: input.outputs?.markdownHash == null ? null : String(input.outputs.markdownHash),
      pdfPath: input.outputs?.pdfPath == null ? null : normalizeRepositoryPath(input.outputs.pdfPath),
      pdfHash: input.outputs?.pdfHash == null ? null : String(input.outputs.pdfHash),
    },
    reportSnapshotHash: input.reportSnapshotHash == null ? null : String(input.reportSnapshotHash),
    solverExecutionAllowed: false,
    comparisonCalculationAllowed: false,
    reasonCodes: uniqueStrings(input.reasonCodes || []),
  };
  const value = { ...core, reportManifestHash: canonicalHash(core) };
  validateManifestDocument('reportManifest', value, { m1Scaffold: status === 'NOT_GENERATED' });
  return deepFreeze(value);
}

export function validateCaptureIndex(value = {}, options = {}) {
  const errors = [];
  if (!plainRecord(value)) return ['P17_CAPTURE_INDEX_OBJECT_REQUIRED'];
  if (value.schemaVersion !== P17_CAPTURE_INDEX_VERSION) errors.push('P17_CAPTURE_INDEX_VERSION_INVALID');
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,31}$/u.test(String(value.caseId || ''))) errors.push('P17_CAPTURE_CASE_ID_INVALID');
  if (!['NOT_RUN_M1_FRAMEWORK_ONLY', 'BLOCKED_UI', 'COMPLETE'].includes(value.status)) errors.push('P17_CAPTURE_STATUS_INVALID');
  if (!Array.isArray(value.captures)) errors.push('P17_CAPTURES_ARRAY_REQUIRED');
  if (!Array.isArray(value.reasonCodes)) errors.push('P17_CAPTURE_REASON_CODES_ARRAY_REQUIRED');
  if (value.status === 'COMPLETE') {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/u.test(String(value.runId || ''))) errors.push('P17_CAPTURE_RUN_ID_REQUIRED');
    if (!/^[a-f0-9]{64}$/u.test(String(value.modelHash || ''))) errors.push('P17_CAPTURE_MODEL_HASH_REQUIRED');
    if (value.parityStatus !== 'PASS') errors.push('P17_CAPTURE_PARITY_REQUIRED');
    if (value.browser !== 'CHROME') errors.push('P17_CAPTURE_BROWSER_REQUIRED');
    const roles = Array.from(value.captures || [], (row) => row?.kind);
    if (roles.length !== P17_CAPTURE_ROLES.length || new Set(roles).size !== roles.length) errors.push('P17_CAPTURE_ROLE_COUNT_INVALID');
    for (const role of P17_CAPTURE_ROLES) if (!roles.includes(role)) errors.push(`P17_CAPTURE_ROLE_MISSING_${role}`);
    for (const row of value.captures || []) {
      const runFolder = String(row?.path || '').split('/')[1];
      if (runFolder !== value.runId) errors.push('P17_CAPTURE_RUN_FOLDER_MISMATCH');
    }
  } else if (value.status === 'NOT_RUN_M1_FRAMEWORK_ONLY') {
    if ((value.captures || []).length !== 0) errors.push('P17_CAPTURE_NOT_RUN_MUST_BE_EMPTY');
    if ((value.reasonCodes || []).length === 0) errors.push('P17_CAPTURE_REASON_CODE_REQUIRED');
    if (value.browser !== 'NOT_RUN_M1') errors.push('P17_CAPTURE_NOT_RUN_BROWSER_INVALID');
    if (value.parityStatus !== 'NOT_RUN_M1_FRAMEWORK_ONLY') errors.push('P17_CAPTURE_NOT_RUN_PARITY_INVALID');
    if (value.runId !== null) errors.push('P17_CAPTURE_NOT_RUN_RUN_ID_MUST_BE_NULL');
    if (value.modelHash !== null) errors.push('P17_CAPTURE_NOT_RUN_MODEL_HASH_MUST_BE_NULL');
  } else if (value.status === 'BLOCKED_UI') {
    if ((value.captures || []).length !== 0) errors.push('P17_CAPTURE_BLOCKED_UI_MUST_BE_EMPTY');
    if ((value.reasonCodes || []).length === 0) errors.push('P17_CAPTURE_REASON_CODE_REQUIRED');
    if (!['NOT_RUN_M1', 'CHROME'].includes(value.browser)) errors.push('P17_CAPTURE_BLOCKED_UI_BROWSER_INVALID');
    if (value.parityStatus !== 'BLOCKED_UI') errors.push('P17_CAPTURE_BLOCKED_UI_PARITY_INVALID');
    if (value.runId !== null && !/^[A-Za-z0-9][A-Za-z0-9._-]{5,127}$/u.test(String(value.runId))) errors.push('P17_CAPTURE_BLOCKED_UI_RUN_ID_INVALID');
    if (value.modelHash !== null && !/^[a-f0-9]{64}$/u.test(String(value.modelHash))) errors.push('P17_CAPTURE_BLOCKED_UI_MODEL_HASH_INVALID');
  }
  for (const [index, row] of (value.captures || []).entries()) {
    if (!P17_CAPTURE_ROLES.includes(row?.kind)) errors.push(`P17_CAPTURE_ROLE_INVALID_${index}`);
    if (row?.ordinal !== index + 1) errors.push(`P17_CAPTURE_ORDINAL_INVALID_${index}`);
    if (!/^figures\/[A-Za-z0-9._-]+\/0[1-4]-[a-z0-9-]+\.png$/u.test(String(row?.path || ''))) errors.push(`P17_CAPTURE_PATH_INVALID_${index}`);
    if (!/^[a-f0-9]{64}$/u.test(String(row?.sha256 || ''))) errors.push(`P17_CAPTURE_HASH_INVALID_${index}`);
    if (!Number.isInteger(row?.byteLength) || row.byteLength <= 0) errors.push(`P17_CAPTURE_SIZE_INVALID_${index}`);
    if (!Number.isInteger(row?.width) || row.width <= 0) errors.push(`P17_CAPTURE_WIDTH_INVALID_${index}`);
    if (!Number.isInteger(row?.height) || row.height <= 0) errors.push(`P17_CAPTURE_HEIGHT_INVALID_${index}`);
    if (![row?.caseIdVisible, row?.runIdVisible, row?.modelHashVisible, row?.unitsVisible].every((flag) => flag === true)) errors.push(`P17_CAPTURE_REQUIRED_LABEL_NOT_VISIBLE_${index}`);
    if (!['PASS', 'NOT_APPLICABLE_NO_NUMERIC_DISPLAY'].includes(row?.sourceValueParity)) errors.push(`P17_CAPTURE_SOURCE_PARITY_INVALID_${index}`);
  }
  if (options.requireHash !== false) {
    if (!/^[a-f0-9]{64}$/u.test(String(value.captureIndexHash || ''))) errors.push('P17_CAPTURE_INDEX_HASH_REQUIRED');
    else {
      const core = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'captureIndexHash'));
      if (canonicalHash(core) !== value.captureIndexHash) errors.push('P17_CAPTURE_INDEX_HASH_MISMATCH');
    }
  }
  return [...new Set(errors)].sort();
}

/**
 * Builds the only input accepted by a case report renderer. This function does
 * not import or invoke product analysis and does not recompute comparisons.
 */
export function buildEvidenceOnlyReportSnapshot(input = {}) {
  const evidence = assertStrictJson(input.evidence, 'evidence');
  const captureIndex = assertStrictJson(input.captureIndex, 'captureIndex');
  const comparison = input.comparison == null ? null : assertStrictJson(input.comparison, 'comparison');
  const runRecord = input.runRecord == null ? null : assertStrictJson(input.runRecord, 'runRecord');
  validateManifestDocument('caseEvidence', evidence);
  validateManifestDocument('captureIndex', captureIndex);
  if (comparison) validateManifestDocument('comparison', comparison);
  if (runRecord) validateManifestDocument('runRecord', runRecord);
  const captureErrors = validateCaptureIndex(captureIndex, { requireHash: true });
  if (captureErrors.length) throw reportError('P17_CAPTURE_INDEX_INVALID', captureErrors.join(', '));
  const evidenceCore = Object.fromEntries(Object.entries(evidence).filter(([key]) => key !== 'evidenceHash'));
  if (evidence.schemaVersion !== P17_CASE_EVIDENCE_VERSION) throw reportError('P17_REPORT_EVIDENCE_VERSION_INVALID', 'Unsupported case evidence version.');
  if (canonicalHash(evidenceCore) !== evidence.evidenceHash) throw reportError('P17_REPORT_EVIDENCE_HASH_MISMATCH', 'Evidence content does not match evidenceHash.');
  if (!/^[a-f0-9]{64}$/u.test(String(captureIndex.captureIndexHash || ''))) throw reportError('P17_REPORT_CAPTURE_HASH_REQUIRED', 'Immutable captureIndexHash is required.');
  const captureCore = Object.fromEntries(Object.entries(captureIndex).filter(([key]) => key !== 'captureIndexHash'));
  if (canonicalHash(captureCore) !== captureIndex.captureIndexHash) throw reportError('P17_REPORT_CAPTURE_HASH_MISMATCH', 'Capture index content does not match captureIndexHash.');
  if (!clean(evidence.caseId) || evidence.caseId !== captureIndex.caseId) throw reportError('P17_REPORT_CASE_BINDING_MISMATCH', 'Evidence and capture index case IDs differ.');
  if (evidence.runId != null && captureIndex.runId != null && evidence.runId !== captureIndex.runId) {
    throw reportError('P17_REPORT_RUN_BINDING_MISMATCH', 'Evidence and capture index run IDs differ.');
  }
  if (evidence.captures?.captureIndexHash !== captureIndex.captureIndexHash) throw reportError('P17_REPORT_CAPTURE_BINDING_MISMATCH', 'Case evidence does not bind the supplied capture index.');
  if (!/^[a-f0-9]{64}$/u.test(String(evidence.evidenceHash || ''))) throw reportError('P17_REPORT_EVIDENCE_HASH_REQUIRED', 'Immutable evidenceHash is required.');
  if (evidence.comparison.status === 'COMPLETE') {
    if (!comparison) throw reportError('P17_REPORT_COMPARISON_REQUIRED', 'Complete comparison evidence requires the immutable comparison document.');
    if (comparison.caseId !== evidence.caseId || comparison.runId !== evidence.runId) throw reportError('P17_REPORT_COMPARISON_BINDING_MISMATCH', 'Comparison case/run binding differs from case evidence.');
    if (evidence.comparison.sha256 !== comparison.comparisonHash) throw reportError('P17_REPORT_COMPARISON_HASH_MISMATCH', 'Case evidence does not bind the supplied comparison document.');
  } else if (comparison !== null) {
    throw reportError('P17_REPORT_UNDECLARED_COMPARISON', 'A comparison document was supplied although evidence declares no comparison.');
  }
  if (runRecord) {
    if (runRecord.caseId !== evidence.caseId || runRecord.runId !== evidence.runId) throw reportError('P17_REPORT_RUN_RECORD_BINDING_MISMATCH', 'Run-record case/run binding differs from case evidence.');
    if (evidence.runRecordBinding.sha256 !== runRecord.runRecordHash) throw reportError('P17_REPORT_RUN_RECORD_HASH_MISMATCH', 'Case evidence does not bind the supplied run record.');
    const artifactsByRole = new Map((runRecord.artifactHashes || []).map((row) => [row.role, row.sha256]));
    if (evidence.hashChain.some((row) => artifactsByRole.get(row.role) !== row.sha256)) throw reportError('P17_REPORT_HASH_CHAIN_MISMATCH', 'Evidence hash chain differs from run-record artifacts.');
  }
  if (evidence.status === 'QUALIFICATION_CANDIDATE') {
    const requiredRoles = ['SOURCE_MANIFEST', 'CANONICAL_INPUT', 'SSTRUCTURES_INPUT', 'MODEL_EQUIVALENCE', 'REFERENCE_MANIFEST', 'EXPECTED_VALUES', 'TOLERANCE_MANIFEST', 'PROBE_MANIFEST', 'PRODUCT_BUILD', 'ENGINEERING_RESULT'];
    if (!runRecord || runRecord.status !== 'EXECUTED' || comparison?.status !== 'PASS') throw reportError('P17_REPORT_QUALIFICATION_INPUT_INCOMPLETE', 'Qualification-candidate evidence requires an executed run record and PASS comparison.');
    if (!requiredRoles.every((role) => evidence.hashChain.some((row) => row.role === role))) throw reportError('P17_REPORT_HASH_CHAIN_INCOMPLETE', 'Qualified evidence is missing a mandatory artifact role.');
    if (!evidence.qualification.determinismHashes.every((hash) => hash === runRecord.engineeringResultHash)) throw reportError('P17_REPORT_DETERMINISM_BINDING_MISMATCH', 'Determinism hashes do not bind the executed engineering result.');
  }
  const core = {
    version: P17_EVIDENCE_REPORT_CONTRACT_VERSION,
    caseId: evidence.caseId,
    runId: evidence.runId ?? null,
    status: String(evidence.status || 'NOT_RUN'),
    evidenceHash: evidence.evidenceHash,
    comparisonHash: comparison?.comparisonHash ?? null,
    runRecordHash: runRecord?.runRecordHash ?? null,
    captureIndexHash: captureIndex.captureIndexHash,
    sections: {
      purposeAndSources: { hashChain: clone(evidence.hashChain.filter((row) => /SOURCE|REFERENCE|TOLERANCE|PROBE/u.test(row.role))) },
      modelingMethod: { hashChain: clone(evidence.hashChain.filter((row) => /MODEL|MAPPING|INPUT/u.test(row.role))) },
      modelEquivalence: { hashChain: clone(evidence.hashChain.filter((row) => /MAPPING|EQUIVALENCE/u.test(row.role))) },
      solverSettings: runRecord ? clone(runRecord) : { runRecordBinding: clone(evidence.runRecordBinding), status: 'NOT_SUPPLIED_FOR_BLOCKED_EVIDENCE' },
      comparison: comparison ? clone(comparison) : { status: evidence.comparison.status, reasonCodes: clone(evidence.comparison.reasonCodes) },
      physicsQuality: clone(evidence.qualification),
      findingsAndCodeOwners: clone(evidence.reasonCodes),
      reproduction: { runRecordBinding: clone(evidence.runRecordBinding), hashChain: clone(evidence.hashChain) },
      review: { status: 'PENDING_POST_REPORT_SIGNOFF', terminalPassDeclared: false },
    },
    captures: clone(captureIndex.captures),
    captureStatus: captureIndex.status,
    reasonCodes: uniqueStrings([...(evidence.reasonCodes || []), ...(captureIndex.reasonCodes || [])]),
  };
  return deepFreeze({ ...core, reportSnapshotHash: canonicalHash(core) });
}

export function renderEvidenceOnlyMarkdown(snapshot = {}) {
  if (snapshot.version !== P17_EVIDENCE_REPORT_CONTRACT_VERSION) throw reportError('P17_REPORT_SNAPSHOT_VERSION_INVALID', 'Unsupported report snapshot.');
  const json = (value) => value == null ? '_기록 없음_' : `\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
  return [
    `# ${snapshot.caseId} 검증 보고서`,
    '',
    `- 상태: \`${snapshot.status}\``,
    `- Run ID: \`${snapshot.runId || 'NOT_RUN'}\``,
    `- Evidence hash: \`${snapshot.evidenceHash}\``,
    `- Capture status: \`${snapshot.captureStatus}\``,
    '',
    '## 1. 검증 목적과 출전',
    json(snapshot.sections.purposeAndSources),
    '',
    '## 2. 모델링 방법과 사용 도구',
    json(snapshot.sections.modelingMethod),
    '',
    '## 3. 모델 동등성',
    json(snapshot.sections.modelEquivalence),
    '',
    '## 4. 해석 설정',
    json(snapshot.sections.solverSettings),
    '',
    '## 5. 독립 기준·STRIX·S-Structures 비교',
    json(snapshot.sections.comparison),
    '',
    '## 6. 물리·수치 품질',
    json(snapshot.sections.physicsQuality),
    '',
    '## 7. 화면 근거',
    json(snapshot.captures),
    '',
    '## 8. 결함·수정 대상',
    json(snapshot.sections.findingsAndCodeOwners),
    '',
    '## 9. 재현과 검토',
    json({ reproduction: snapshot.sections.reproduction, review: snapshot.sections.review }),
    '',
    `Report snapshot hash: \`${snapshot.reportSnapshotHash}\``,
    '',
  ].join('\n');
}

export function buildReportRenderContract(input = {}) {
  const core = {
    version: P17_EVIDENCE_REPORT_CONTRACT_VERSION,
    mode: 'IMMUTABLE_EVIDENCE_ONLY',
    evidencePath: normalizeRepositoryPath(input.evidencePath),
    comparisonPath: normalizeRepositoryPath(input.comparisonPath),
    captureIndexPath: normalizeRepositoryPath(input.captureIndexPath),
    markdownOutputPath: normalizeRepositoryPath(input.markdownOutputPath),
    pdfOutputPath: normalizeRepositoryPath(input.pdfOutputPath),
    allowedImports: ['node:fs', 'node:path', 'PDF_RENDERER_ONLY'],
    forbiddenImports: ['src/solver/**', 'src/compute/**', 'src/dynamics/**', 'src/nonlinear/**', 'verification/reference/**'],
    solverExecutionAllowed: false,
    comparisonCalculationAllowed: false,
  };
  return deepFreeze({ ...core, contractHash: canonicalHash(core) });
}

/** Creates the post-report terminal record. It never changes pre-report evidence. */
export function createPostReportSignoff(input = {}) {
  const approvedArtifacts = Array.from(input.approvedArtifacts || [], (row) => ({
    role: String(row.role || ''),
    path: normalizeRepositoryPath(row.path),
    sha256: String(row.sha256 || ''),
  })).sort((left, right) => left.role.localeCompare(right.role));
  const core = {
    schemaVersion: 'p17-review-signoff-v1',
    caseId: String(input.caseId || ''),
    status: String(input.status || 'APPROVED'),
    releaseAllowed: input.releaseAllowed === true,
    runId: input.runId == null ? null : String(input.runId),
    terminalStatus: String(input.terminalStatus || 'PASS'),
    reviewerApprovals: clone(input.reviewerApprovals || []),
    approvedArtifactHashes: uniqueStrings(approvedArtifacts.map((row) => row.sha256)),
    approvedArtifacts,
    reasonCodes: uniqueStrings(input.reasonCodes || []),
  };
  const signoff = { ...core, signoffHash: canonicalHash(core) };
  validateManifestDocument('reviewSignoff', signoff);
  return deepFreeze(signoff);
}

/** Verifies every post-report artifact before a terminal PASS can be consumed. */
export async function auditApprovedCasePackage(input = {}) {
  try {
    const repoRoot = await realpath(path.resolve(input.repoRoot));
    const caseRoot = await realpath(path.resolve(input.caseRoot));
    const caseRepositoryPath = repositoryPathForAbsolute(repoRoot, caseRoot, 'P17_CASE_ROOT_PATH_ESCAPE');
    const signoff = assertStrictJson(input.signoff, 'signoff');
    validateManifestDocument('reviewSignoff', signoff);
    if (signoff.status !== 'APPROVED' || signoff.terminalStatus !== 'PASS') throw reportError('P17_SIGNOFF_NOT_TERMINAL_PASS', 'Only an approved terminal PASS signoff can authorize a terminal case PASS.');
    const artifacts = new Map();
    for (const row of signoff.approvedArtifacts) {
      assertPathWithinRepositoryPrefix(row.path, caseRepositoryPath, 'P17_SIGNOFF_ARTIFACT_OUTSIDE_CASE');
      const file = await loadRepositoryFile(repoRoot, row.path);
      if (file.sha256 !== row.sha256) throw reportError('P17_SIGNOFF_ARTIFACT_HASH_MISMATCH', `${row.role} differs from its approved hash.`);
      artifacts.set(row.role, { ...file, value: jsonRole(row.role) ? JSON.parse(file.bytes.toString('utf8')) : null });
    }
    const runRecord = artifacts.get('RUN_RECORD').value;
    const comparison = artifacts.get('COMPARISON').value;
    const evidence = artifacts.get('CASE_EVIDENCE').value;
    const captureIndex = artifacts.get('CAPTURE_INDEX').value;
    const reportManifest = artifacts.get('REPORT_MANIFEST').value;
    validateManifestDocument('runRecord', runRecord);
    validateManifestDocument('comparison', comparison);
    validateManifestDocument('caseEvidence', evidence);
    validateManifestDocument('captureIndex', captureIndex);
    validateManifestDocument('reportManifest', reportManifest);
    for (const value of [runRecord, comparison, evidence, captureIndex, reportManifest]) {
      if (value.caseId !== signoff.caseId || value.runId !== signoff.runId) throw reportError('P17_SIGNOFF_CASE_RUN_MISMATCH', 'Approved JSON artifacts do not share the signoff case/run binding.');
    }
    if (evidence.status !== 'QUALIFICATION_CANDIDATE' || comparison.status !== 'PASS' || captureIndex.status !== 'COMPLETE' || reportManifest.status !== 'GENERATED') throw reportError('P17_SIGNOFF_QUALIFICATION_INCOMPLETE', 'Terminal review requires candidate evidence, PASS comparison, complete captures and a generated report.');
    if (evidence.runRecordBinding.sha256 !== runRecord.runRecordHash
      || evidence.comparison.sha256 !== comparison.comparisonHash
      || evidence.captures.captureIndexHash !== captureIndex.captureIndexHash
      || reportManifest.evidenceBinding.sha256 !== evidence.evidenceHash
      || reportManifest.comparisonBinding.sha256 !== comparison.comparisonHash
      || reportManifest.captureIndexBinding.sha256 !== captureIndex.captureIndexHash
      || reportManifest.outputs.markdownHash !== artifacts.get('REPORT_MARKDOWN').sha256
      || reportManifest.outputs.pdfHash !== artifacts.get('REPORT_PDF').sha256) {
      throw reportError('P17_SIGNOFF_CROSS_BINDING_MISMATCH', 'Approved evidence/report artifacts do not form one immutable hash chain.');
    }
    const rolePaths = Object.fromEntries([...artifacts].map(([role, file]) => [role, file.path]));
    if (rolePaths.RUN_RECORD !== evidence.runRecordBinding.path
      || rolePaths.COMPARISON !== evidence.comparison.path
      || rolePaths.CAPTURE_INDEX !== evidence.captures.captureIndexPath
      || reportManifest.evidenceBinding.path !== rolePaths.CASE_EVIDENCE
      || reportManifest.comparisonBinding.path !== rolePaths.COMPARISON
      || reportManifest.captureIndexBinding.path !== rolePaths.CAPTURE_INDEX
      || reportManifest.outputs.markdownPath !== rolePaths.REPORT_MARKDOWN
      || reportManifest.outputs.pdfPath !== rolePaths.REPORT_PDF) {
      throw reportError('P17_SIGNOFF_ARTIFACT_PATH_BINDING_MISMATCH', 'Approved artifact paths differ from the evidence/report manifest paths.');
    }
    const chainByRole = new Map(evidence.hashChain.map((row) => [row.role, row.sha256]));
    for (const role of ['SOURCE_MANIFEST', 'CANONICAL_INPUT', 'SSTRUCTURES_INPUT', 'MODEL_EQUIVALENCE', 'REFERENCE_MANIFEST', 'EXPECTED_VALUES', 'TOLERANCE_MANIFEST', 'PROBE_MANIFEST', 'PRODUCT_BUILD']) {
      if (chainByRole.get(role) !== artifacts.get(role).sha256) throw reportError('P17_SIGNOFF_HASH_CHAIN_ARTIFACT_MISMATCH', `${role} approved bytes differ from the official run hash chain.`);
    }
    const preReportAudit = await auditCaseEvidencePackage({
      repoRoot,
      caseRoot,
      evidence,
      trustedExternalAnchorKeys: input.trustedExternalAnchorKeys,
    });
    if (!preReportAudit.ok) throw reportError('P17_SIGNOFF_PRE_REPORT_AUDIT_FAILED', preReportAudit.errors.join(', '));
    if (reportManifest.reportSnapshotHash !== preReportAudit.snapshot.reportSnapshotHash) throw reportError('P17_SIGNOFF_REPORT_SNAPSHOT_MISMATCH', 'Report manifest is stale or bound to a different evidence snapshot.');
    const expectedMarkdown = Buffer.from(renderEvidenceOnlyMarkdown(preReportAudit.snapshot), 'utf8');
    if (!artifacts.get('REPORT_MARKDOWN').bytes.equals(expectedMarkdown)) throw reportError('P17_SIGNOFF_REPORT_MARKDOWN_MISMATCH', 'Approved Markdown is not the deterministic rendering of the audited snapshot.');
    if (!artifacts.get('REPORT_PDF').bytes.subarray(0, 5).equals(Buffer.from('%PDF-', 'ascii'))) throw reportError('P17_SIGNOFF_REPORT_PDF_INVALID', 'Approved PDF does not have a valid PDF header.');
    if (!P17_M1_TERMINAL_PASS_ENABLED) {
      throw reportError(
        'P17_M1_TERMINAL_PASS_DISABLED',
        'M1 cannot authorize terminal PASS until M2 adds the official execution orchestrator, pinned trust registry, comparison/extraction replay, physics/mutation replay, three independent custodied runs, and deterministic PDF reproduction audit.',
      );
    }
    const facts = {
      caseId: signoff.caseId,
      runId: signoff.runId,
      signoffHash: signoff.signoffHash,
      preReportAuditHash: preReportAudit.auditHash,
      approvedArtifactCount: signoff.approvedArtifacts.length,
      terminalPassAuthorized: true,
      releaseAllowed: signoff.releaseAllowed,
    };
    return deepFreeze({ ok: true, errors: [], facts, auditHash: canonicalHash(facts) });
  } catch (error) {
    return deepFreeze({ ok: false, errors: [error?.code || 'P17_APPROVED_CASE_PACKAGE_INVALID'], message: String(error?.message || error), facts: null, auditHash: null });
  }
}

/**
 * Verifies the actual immutable files behind a pre-report case evidence record.
 * This is the mandatory terminal-qualification loader; schema validation alone
 * never authorizes a case PASS.
 */
export async function auditCaseEvidencePackage(input = {}) {
  const errors = [];
  try {
    const repoRoot = await realpath(path.resolve(input.repoRoot));
    const caseRoot = await realpath(path.resolve(input.caseRoot));
    if (caseRoot !== repoRoot && !caseRoot.startsWith(`${repoRoot}${path.sep}`)) throw reportError('P17_CASE_ROOT_PATH_ESCAPE', 'Case root is outside the repository.');
    const caseRepositoryPath = repositoryPathForAbsolute(repoRoot, caseRoot, 'P17_CASE_ROOT_PATH_ESCAPE');
    const evidence = assertStrictJson(input.evidence, 'evidence');
    validateManifestDocument('caseEvidence', evidence);
    const runRecordFile = await loadRepositoryJsonFile(repoRoot, evidence.runRecordBinding.path, 'runRecord');
    const runRecord = runRecordFile.value;
    if (runRecord.runRecordHash !== evidence.runRecordBinding.sha256) throw reportError('P17_PACKAGE_RUN_RECORD_HASH_MISMATCH', 'Run-record self hash differs from case evidence.');
    if (runRecordFile.sha256 !== evidence.runRecordBinding.contentSha256) throw reportError('P17_PACKAGE_RUN_RECORD_CONTENT_HASH_MISMATCH', 'Run-record bytes differ from case evidence.');
    if (runRecord.caseId !== evidence.caseId || runRecord.runId !== evidence.runId) throw reportError('P17_PACKAGE_RUN_RECORD_CASE_RUN_MISMATCH', 'Run record and evidence do not share a case/run identity.');

    const expectedRunDirectoryPath = `${caseRepositoryPath}/runs/${evidence.runId}`;
    let custodyAudit = null;
    if (evidence.runCustodyBinding.status === 'EXTERNAL_SIGNED_ANCHOR_VERIFIED') {
      const custody = evidence.runCustodyBinding;
      const expectedIntegrityPath = `${expectedRunDirectoryPath}/integrity-manifest.json`;
      const expectedRunRecordPath = `${expectedRunDirectoryPath}/run-record.json`;
      if (custody.runDirectoryPath !== expectedRunDirectoryPath
        || custody.integrityManifestPath !== expectedIntegrityPath
        || evidence.runRecordBinding.path !== expectedRunRecordPath) {
        throw reportError('P17_PACKAGE_RUN_DIRECTORY_BINDING_MISMATCH', 'Run custody must bind the exact caseRoot/runs/runId directory and run-record path.');
      }
      if (!plainRecord(input.trustedExternalAnchorKeys) || Object.keys(input.trustedExternalAnchorKeys).length === 0) throw reportError('P17_PACKAGE_EXTERNAL_TRUST_REQUIRED', 'Externally governed trusted custody keys are required.');
      const runDirectory = await resolveRepositoryDirectory(repoRoot, custody.runDirectoryPath);
      custodyAudit = await verifyAppendOnlyRun(runDirectory, { trustedExternalAnchorKeys: input.trustedExternalAnchorKeys });
      if (!custodyAudit.ok) throw reportError('P17_PACKAGE_RUN_CUSTODY_INVALID', custodyAudit.errors.join(', '));
      const anchor = custodyAudit.integrity.custodyAnchor;
      if (!custodyAudit.assurance.officialTerminalQualificationAnchorEligible
        || !custodyAudit.assurance.externalSignatureVerified
        || anchor.type !== P17_EXTERNAL_SIGNED_ANCHOR
        || custodyAudit.integrity.integrityHash !== custody.integrityHash
        || custodyAudit.directoryHash !== custody.directoryHash
        || custodyAudit.custodyPayloadHash !== custody.custodyPayloadHash
        || custodyAudit.integrity.storagePolicy.version !== custody.storagePolicyVersion
        || custody.storagePolicyVersion !== P17_APPEND_ONLY_ASSURANCE_POLICY.version
        || anchor.authority !== custody.authority
        || anchor.anchorId !== custody.anchorId
        || anchor.keyId !== custody.keyId) {
        throw reportError('P17_PACKAGE_RUN_CUSTODY_BINDING_MISMATCH', 'Externally verified custody facts differ from case evidence.');
      }
      const runRecordIntegrityRow = custodyAudit.integrity.files.find((row) => row.path === 'run-record.json');
      if (runRecordIntegrityRow?.sha256 !== runRecordFile.sha256) throw reportError('P17_PACKAGE_RUN_RECORD_NOT_IN_CUSTODY', 'The externally anchored directory does not bind the supplied run-record bytes.');
    } else if (evidence.status === 'QUALIFICATION_CANDIDATE') {
      throw reportError('P17_PACKAGE_EXTERNAL_CUSTODY_REQUIRED', 'Qualified evidence requires an externally signed append-only run directory.');
    }

    let comparison = null;
    if (evidence.comparison.status === 'COMPLETE') {
      const comparisonFile = await loadRepositoryJsonFile(repoRoot, evidence.comparison.path, 'comparison');
      comparison = comparisonFile.value;
      if (comparison.comparisonHash !== evidence.comparison.sha256) throw reportError('P17_PACKAGE_COMPARISON_HASH_MISMATCH', 'Comparison self hash differs from case evidence.');
      if (comparisonFile.sha256 !== evidence.comparison.contentSha256) throw reportError('P17_PACKAGE_COMPARISON_CONTENT_HASH_MISMATCH', 'Comparison bytes differ from case evidence.');
    }
    const captureIndexFile = await loadRepositoryJsonFile(repoRoot, evidence.captures.captureIndexPath, 'captureIndex');
    const captureIndex = captureIndexFile.value;
    if (captureIndex.captureIndexHash !== evidence.captures.captureIndexHash) throw reportError('P17_PACKAGE_CAPTURE_HASH_MISMATCH', 'Capture-index self hash differs from case evidence.');
    if (captureIndexFile.sha256 !== evidence.captures.contentSha256) throw reportError('P17_PACKAGE_CAPTURE_CONTENT_HASH_MISMATCH', 'Capture-index bytes differ from case evidence.');

    const artifactRows = runRecord.artifactHashes || [];
    const artifactFiles = new Map();
    const roles = new Set();
    const paths = new Set();
    for (const row of artifactRows) {
      if (roles.has(row.role)) throw reportError('P17_PACKAGE_DUPLICATE_ARTIFACT_ROLE', `Duplicate run artifact role: ${row.role}`);
      if (paths.has(row.path)) throw reportError('P17_PACKAGE_DUPLICATE_ARTIFACT_PATH', `Duplicate run artifact path: ${row.path}`);
      roles.add(row.role);
      paths.add(row.path);
      if (evidence.status === 'QUALIFICATION_CANDIDATE') assertPathWithinRepositoryPrefix(row.path, expectedRunDirectoryPath, 'P17_PACKAGE_RUN_ARTIFACT_OUTSIDE_CUSTODY');
      const file = await loadRepositoryFile(repoRoot, row.path);
      if (file.sha256 !== row.sha256) throw reportError('P17_PACKAGE_ARTIFACT_HASH_MISMATCH', `${row.role} differs from the run record.`);
      artifactFiles.set(row.role, file);
      if (custodyAudit) {
        const relative = row.path.slice(expectedRunDirectoryPath.length + 1);
        const integrityRow = custodyAudit.integrity.files.find((entry) => entry.path === relative);
        if (integrityRow?.sha256 !== row.sha256) throw reportError('P17_PACKAGE_ARTIFACT_NOT_IN_CUSTODY', `${row.role} is not bound by the externally anchored run directory.`);
      }
    }
    const engineering = artifactRows.find((row) => row.role === 'ENGINEERING_RESULT');
    if (runRecord.status === 'EXECUTED' && engineering?.sha256 !== runRecord.engineeringResultHash) throw reportError('P17_PACKAGE_ENGINEERING_RESULT_MISMATCH', 'Executed run record does not bind its engineering result artifact.');
    if (runRecord.status === 'EXECUTED') assertRunInputHashBindings(runRecord, artifactFiles);

    if (comparison) {
      const actualFile = await loadRepositoryFile(repoRoot, comparison.actualValuesBinding.path);
      const actualArtifact = JSON.parse(actualFile.bytes.toString('utf8'));
      if (actualArtifact.artifactHash !== comparison.actualValuesBinding.sha256
        || actualFile.sha256 !== comparison.actualValuesBinding.contentSha256
        || !actualFile.bytes.equals(Buffer.from(canonicalJson(actualArtifact), 'utf8'))) {
        throw reportError('P17_PACKAGE_ACTUAL_VALUES_HASH_MISMATCH', 'Extracted actual-values artifact is not canonical, self-consistent or comparison-bound.');
      }
      const extractor = await loadRepositoryFile(repoRoot, comparison.actualValuesBinding.extractorPath);
      if (extractor.sha256 !== comparison.actualValuesBinding.extractorHash) throw reportError('P17_PACKAGE_EXTRACTOR_HASH_MISMATCH', 'Probe extractor source differs from the comparison binding.');
      if (comparison.actualValuesBinding.runRecordHash !== runRecord.runRecordHash || comparison.actualValuesBinding.engineeringResultHash !== runRecord.engineeringResultHash || comparison.actualValuesBinding.probeHash !== runRecord.inputHashes.probeHash) throw reportError('P17_PACKAGE_ACTUAL_PROVENANCE_MISMATCH', 'Comparison actual-values provenance differs from the official run record.');
      const actualRow = artifactRows.find((row) => row.role === 'EXTRACTED_ACTUAL_VALUES');
      const extractorRow = artifactRows.find((row) => row.role === 'PROBE_EXTRACTOR');
      if (actualRow?.path !== comparison.actualValuesBinding.path || actualRow?.sha256 !== actualFile.sha256 || extractorRow?.path !== comparison.actualValuesBinding.extractorPath || extractorRow?.sha256 !== extractor.sha256) throw reportError('P17_PACKAGE_EXTRACTION_ARTIFACT_MISMATCH', 'Run record does not bind the actual-values artifact and extractor bytes.');
      const engineeringFile = artifactFiles.get('ENGINEERING_RESULT');
      const probeManifest = parseArtifactJson(artifactFiles, 'PROBE_MANIFEST', 'probeManifest');
      const extractionReplay = verifyExtractedActualValuesArtifact(actualArtifact, {
        engineeringResult: engineeringFile.bytes,
        probeManifest,
      });
      if (!extractionReplay.ok) throw reportError('P17_PACKAGE_EXTRACTION_REPLAY_FAILED', extractionReplay.errors.join(', '));
      if (actualArtifact.engineeringResult.sourcePath !== artifactRows.find((row) => row.role === 'ENGINEERING_RESULT')?.path) throw reportError('P17_PACKAGE_ENGINEERING_RESULT_PATH_MISMATCH', 'Actual-value extraction does not name the signed engineering-result path.');

      const referenceBundle = prepareReferenceBundle({
        sourceManifest: parseArtifactJson(artifactFiles, 'SOURCE_MANIFEST', 'sourceManifest'),
        referenceManifest: parseArtifactJson(artifactFiles, 'REFERENCE_MANIFEST', 'referenceManifest'),
        expectedValues: parseArtifactJson(artifactFiles, 'EXPECTED_VALUES', 'expectedValues'),
        toleranceManifest: parseArtifactJson(artifactFiles, 'TOLERANCE_MANIFEST', 'toleranceManifest'),
        probeManifest,
      });
      if (referenceBundle.status !== 'READY') throw reportError('P17_PACKAGE_REFERENCE_REPLAY_NOT_READY', referenceBundle.reasonCodes.join(', '));
      const replayedComparison = evaluateLockedComparison({
        referenceBundle,
        runId: runRecord.runId,
        runRecord,
        actualValuesArtifact: actualArtifact,
        actualValuesPath: actualRow.path,
      });
      if (canonicalJson(replayedComparison) !== canonicalJson(comparison)) throw reportError('P17_PACKAGE_COMPARISON_REPLAY_MISMATCH', 'Stored comparison differs from deterministic reference/tolerance replay.');
    }

    const captureAudit = evidence.captures.status === 'COMPLETE'
      ? await auditCaptureFiles(caseRoot, captureIndex)
      : { ok: captureIndex.status !== 'COMPLETE', errors: [], files: [] };
    if (!captureAudit.ok) throw reportError('P17_PACKAGE_CAPTURE_FILE_AUDIT_FAILED', captureAudit.errors.join(', '));
    const snapshot = buildEvidenceOnlyReportSnapshot({ evidence, captureIndex, comparison, runRecord });
    const facts = {
      caseId: evidence.caseId,
      runId: evidence.runId,
      evidenceHash: evidence.evidenceHash,
      runRecordHash: runRecord.runRecordHash,
      comparisonHash: comparison?.comparisonHash ?? null,
      captureIndexHash: captureIndex.captureIndexHash,
      artifactCount: artifactRows.length,
      captureFileCount: captureAudit.files.length,
      reportSnapshotHash: snapshot.reportSnapshotHash,
      runCustodyIntegrityHash: custodyAudit?.integrity.integrityHash ?? null,
      runCustodyDirectoryHash: custodyAudit?.directoryHash ?? null,
      externalCustodyVerified: Boolean(custodyAudit?.assurance.externalSignatureVerified),
      terminalPassAuthorized: false,
      postReportSignoffRequired: true,
    };
    return deepFreeze({ ok: true, errors: [], facts, auditHash: canonicalHash(facts), snapshot });
  } catch (error) {
    errors.push(error?.code || 'P17_CASE_EVIDENCE_PACKAGE_INVALID');
    return deepFreeze({ ok: false, errors, message: String(error?.message || error), facts: null, auditHash: null, snapshot: null });
  }
}

export async function auditCaptureFiles(caseRoot, captureIndex) {
  const root = await realpath(path.resolve(caseRoot));
  const errors = validateCaptureIndex(captureIndex, { requireHash: true });
  const files = [];
  if (errors.length || captureIndex.status !== 'COMPLETE') return deepFreeze({ ok: false, errors: [...errors, 'P17_CAPTURE_FILES_NOT_COMPLETE'].sort(), files });
  for (const row of captureIndex.captures) {
    try {
      const target = path.resolve(root, ...row.path.split('/'));
      if (!target.startsWith(`${root}${path.sep}`)) throw reportError('P17_CAPTURE_FILE_PATH_ESCAPE', row.path);
      const unresolvedInfo = await lstat(target);
      if (!unresolvedInfo.isFile() || unresolvedInfo.isSymbolicLink()) throw reportError('P17_CAPTURE_FILE_UNSAFE', row.path);
      const actual = await realpath(target);
      if (!actual.startsWith(`${root}${path.sep}`)) throw reportError('P17_CAPTURE_FILE_PATH_ESCAPE', row.path);
      const info = await lstat(actual);
      if (!info.isFile() || info.isSymbolicLink()) throw reportError('P17_CAPTURE_FILE_UNSAFE', row.path);
      const bytes = await readFile(actual);
      const dimensions = pngDimensions(bytes);
      const audit = {
        kind: row.kind,
        path: row.path,
        byteLength: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        ...dimensions,
      };
      if (audit.byteLength !== row.byteLength) errors.push(`P17_CAPTURE_FILE_SIZE_MISMATCH_${row.kind}`);
      if (audit.sha256 !== row.sha256) errors.push(`P17_CAPTURE_FILE_HASH_MISMATCH_${row.kind}`);
      if (audit.width !== row.width || audit.height !== row.height) errors.push(`P17_CAPTURE_FILE_DIMENSION_MISMATCH_${row.kind}`);
      files.push(audit);
    } catch (error) {
      errors.push(error?.code?.startsWith?.('P17_') ? error.code : `P17_CAPTURE_FILE_MISSING_${row.kind}`);
    }
  }
  return deepFreeze({ ok: errors.length === 0, errors: [...new Set(errors)].sort(), files });
}

function normalizeCapture(row = {}) {
  return {
    ordinal: Number(row.ordinal),
    kind: String(row.kind || ''),
    path: String(row.path || '').replaceAll('\\', '/'),
    sha256: String(row.sha256 || ''),
    byteLength: Number(row.byteLength),
    width: Number(row.width),
    height: Number(row.height),
    caseIdVisible: strictBoolean(row.caseIdVisible, 'caseIdVisible'),
    runIdVisible: strictBoolean(row.runIdVisible, 'runIdVisible'),
    modelHashVisible: strictBoolean(row.modelHashVisible, 'modelHashVisible'),
    unitsVisible: strictBoolean(row.unitsVisible, 'unitsVisible'),
    sourceValueParity: String(row.sourceValueParity || ''),
  };
}

function strictBoolean(value, label) {
  if (typeof value !== 'boolean') throw reportError('P17_CAPTURE_BOOLEAN_REQUIRED', `${label} must be a JSON boolean.`);
  return value;
}

async function loadRepositoryJsonFile(repoRoot, repositoryPath, kind) {
  const file = await loadRepositoryFile(repoRoot, repositoryPath);
  let value;
  try {
    value = JSON.parse(file.bytes.toString('utf8'));
  } catch (error) {
    throw reportError('P17_PACKAGE_JSON_INVALID', `${repositoryPath}: ${error.message}`);
  }
  validateManifestDocument(kind, value);
  return { ...file, value };
}

function parseArtifactJson(artifactFiles, role, kind = null) {
  const file = artifactFiles.get(role);
  if (!file) throw reportError('P17_PACKAGE_ARTIFACT_ROLE_MISSING', role);
  let value;
  try {
    value = JSON.parse(file.bytes.toString('utf8'));
    assertStrictJson(value, role);
  } catch (error) {
    throw reportError('P17_PACKAGE_ARTIFACT_JSON_INVALID', `${role}: ${error.message}`);
  }
  if (kind) validateManifestDocument(kind, value);
  return value;
}

function assertRunInputHashBindings(runRecord, artifactFiles) {
  const canonicalMappings = {
    referenceManifestHash: ['REFERENCE_MANIFEST', 'referenceManifest'],
    toleranceHash: ['TOLERANCE_MANIFEST', 'toleranceManifest'],
    probeHash: ['PROBE_MANIFEST', 'probeManifest'],
    canonicalCaseHash: ['CANONICAL_INPUT', 'canonicalInput'],
    modelMappingHash: ['MODEL_EQUIVALENCE', 'modelEquivalence'],
    nativeModelHash: ['SSTRUCTURES_INPUT', 'sstructuresInput'],
    solverSettingsHash: ['SOLVER_SETTINGS', null],
  };
  const rawMappings = {
    sourceArtifactHash: 'SOURCE_ARTIFACT',
    productSourceHash: 'PRODUCT_SOURCE',
    buildHash: 'PRODUCT_BUILD',
    dependencyLockHash: 'DEPENDENCY_LOCK',
  };
  for (const [field, [role, kind]] of Object.entries(canonicalMappings)) {
    const value = parseArtifactJson(artifactFiles, role, kind);
    if (canonicalHash(value) !== runRecord.inputHashes[field]) throw reportError('P17_PACKAGE_RUN_INPUT_HASH_MISMATCH', `${field} differs from signed ${role}.`);
  }
  for (const [field, role] of Object.entries(rawMappings)) {
    const file = artifactFiles.get(role);
    if (!file || file.sha256 !== runRecord.inputHashes[field]) throw reportError('P17_PACKAGE_RUN_INPUT_HASH_MISMATCH', `${field} differs from signed ${role}.`);
  }
}

function jsonRole(role) {
  return ['SOURCE_MANIFEST', 'CANONICAL_INPUT', 'SSTRUCTURES_INPUT', 'MODEL_EQUIVALENCE', 'REFERENCE_MANIFEST', 'EXPECTED_VALUES', 'TOLERANCE_MANIFEST', 'PROBE_MANIFEST', 'RUN_RECORD', 'COMPARISON', 'CASE_EVIDENCE', 'CAPTURE_INDEX', 'REPORT_MANIFEST'].includes(role);
}

async function loadRepositoryFile(repoRoot, repositoryPath) {
  const normalized = normalizeRepositoryPath(repositoryPath);
  const target = path.resolve(repoRoot, ...normalized.split('/'));
  if (!target.startsWith(`${repoRoot}${path.sep}`)) throw reportError('P17_PACKAGE_PATH_ESCAPE', normalized);
  const unresolved = await lstat(target);
  if (!unresolved.isFile() || unresolved.isSymbolicLink()) throw reportError('P17_PACKAGE_FILE_UNSAFE', normalized);
  const actual = await realpath(target);
  if (!actual.startsWith(`${repoRoot}${path.sep}`)) throw reportError('P17_PACKAGE_PATH_ESCAPE', normalized);
  const info = await lstat(actual);
  if (!info.isFile() || info.isSymbolicLink()) throw reportError('P17_PACKAGE_FILE_UNSAFE', normalized);
  const bytes = await readFile(actual);
  return { path: normalized, bytes, byteLength: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function resolveRepositoryDirectory(repoRoot, repositoryPath) {
  const normalized = normalizeRepositoryPath(repositoryPath);
  const target = path.resolve(repoRoot, ...normalized.split('/'));
  if (!target.startsWith(`${repoRoot}${path.sep}`)) throw reportError('P17_PACKAGE_PATH_ESCAPE', normalized);
  const unresolved = await lstat(target);
  if (!unresolved.isDirectory() || unresolved.isSymbolicLink()) throw reportError('P17_PACKAGE_DIRECTORY_UNSAFE', normalized);
  const actual = await realpath(target);
  if (!actual.startsWith(`${repoRoot}${path.sep}`)) throw reportError('P17_PACKAGE_PATH_ESCAPE', normalized);
  return actual;
}

function repositoryPathForAbsolute(repoRoot, target, code) {
  const relative = path.relative(repoRoot, target).replaceAll('\\', '/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) throw reportError(code, 'Path is not a proper repository descendant.');
  return normalizeRepositoryPath(relative);
}

function assertPathWithinRepositoryPrefix(repositoryPath, prefix, code) {
  const normalized = normalizeRepositoryPath(repositoryPath);
  const normalizedPrefix = normalizeRepositoryPath(prefix);
  if (normalized !== normalizedPrefix && !normalized.startsWith(`${normalizedPrefix}/`)) throw reportError(code, `${normalized} is outside ${normalizedPrefix}.`);
  return normalized;
}

function pngDimensions(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.byteLength < 24 || !bytes.subarray(0, 8).equals(signature) || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw reportError('P17_CAPTURE_FILE_NOT_PNG', 'Capture is not a valid PNG header.');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height) throw reportError('P17_CAPTURE_FILE_DIMENSION_INVALID', 'PNG dimensions are invalid.');
  return { width, height };
}

function normalizeRepositoryPath(value) {
  const normalized = String(value || '').replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/u.test(normalized) || normalized.split('/').includes('..')) {
    throw reportError('P17_REPORT_PATH_INVALID', `Invalid repository-relative path: ${normalized || '(empty)'}`);
  }
  return normalized;
}

function normalizeNullableBinding(value) {
  return {
    path: value?.path == null ? null : normalizeRepositoryPath(value.path),
    sha256: value?.sha256 == null ? null : String(value.sha256),
  };
}

function assertStrictJson(value, label, seen = new Set()) {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return clone(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw reportError('P17_REPORT_NONFINITE_VALUE', `${label} contains NaN or Infinity.`);
    return value;
  }
  if (typeof value !== 'object' || typeof value === 'function') throw reportError('P17_REPORT_NON_JSON_VALUE', `${label} contains a non-JSON value.`);
  if (seen.has(value)) throw reportError('P17_REPORT_CYCLIC_VALUE', `${label} contains a cycle.`);
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw reportError('P17_REPORT_NON_JSON_VALUE', `${label} contains a non-plain object.`);
  }
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map((child, index) => assertStrictJson(child, `${label}/${index}`, seen))
    : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, assertStrictJson(child, `${label}/${key}`, seen)]));
  seen.delete(value);
  return result;
}

function canonicalHash(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function uniqueStrings(values) {
  return [...new Set(Array.from(values || [], String).filter(Boolean))].sort();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function reportError(code, message) {
  return Object.assign(new Error(message), { code });
}

function plainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
