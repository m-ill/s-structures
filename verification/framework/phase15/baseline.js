import {
  cloneStrictJson,
  immutable,
  optionalText,
  requiredFinite,
  requiredHash,
  requiredText,
  sortedUniqueText,
  strictCanonicalHash,
} from './strictCanonical.js';
import { isApprovedPhase15ReferenceManifest } from './referenceManifest.js';
import { isApprovedPhase15ToleranceManifest } from './toleranceManifest.js';
import { isApprovedPhase15ProbeManifest } from './probeManifest.js';

export const PHASE15_BASELINE_VERSION = 'p15-m0-corrective-baseline-v1';
export const PHASE15_REQUIRED_REVIEW_ROLES = Object.freeze([
  'numerical',
  'structural-domain',
  'verification',
  'architecture',
  'release',
]);
export const PHASE15_DISCREPANCY_IDS = Object.freeze(
  Array.from({ length: 16 }, (_value, index) => `P15-D${String(index + 1).padStart(3, '0')}`),
);

export function buildPhase15CorrectiveBaseline(input = {}) {
  const sourceRevision = requiredHash(input.sourceRevision, 'sourceRevision', [40]);
  if (!Array.isArray(input.dirtyEntries)) throw new TypeError('dirtyEntries must be an explicit inventory array, including an empty array for a clean tree.');
  const dirtyEntries = sortedUniqueText(input.dirtyEntries || [], 'dirtyEntries');
  const preservedArtifacts = normalizeArtifacts(input.preservedArtifacts);
  const manifestBindings = normalizeManifestBindings(
    input.referenceManifests,
    input.toleranceManifests,
    input.probeManifests,
  );
  const discrepancyIds = sortedUniqueText(input.discrepancyIds || [], 'discrepancyIds');
  const reviewers = normalizeReviewers(input.reviewers);
  const expectedImportAudit = normalizeExpectedImportAudit(input.expectedImportAudit);
  const phase14StatusAudit = normalizePhase14StatusAudit(input.phase14StatusAudit);
  const traceCoverage = requiredFinite(input.traceCoverage ?? 0, 'traceCoverage');
  if (traceCoverage < 0 || traceCoverage > 1) throw new RangeError('traceCoverage must be between 0 and 1.');
  const performanceBaseline = normalizePerformanceBaseline(input.performanceBaseline);
  const environment = cloneStrictJson(requiredNonemptyObject(input.environment, 'environment'), 'environment');

  const gates = [
    gate('P15-GOV-01', sourceRevision.length === 40, 'source revision and dirty inventory captured'),
    gate('P15-GOV-02', hasRequiredArchives(preservedArtifacts), 'first-batch and Phase 14 artifacts archived with content hashes'),
    gate('P15-GOV-03', manifestBindings.length > 0 && manifestBindings.every((row) => row.approved), 'reference, tolerance, and probe manifests pre-registered and approved'),
    gate('P15-GOV-04', sameSet(discrepancyIds, PHASE15_DISCREPANCY_IDS) && traceCoverage === 1, 'all discrepancies and trace links registered'),
    gate('P15-GOV-05', expectedImportAudit.scannedFileCount > 0 && expectedImportAudit.violations.length === 0 && Boolean(expectedImportAudit.auditHash), 'production expected/reference import audit is clean'),
    gate('P15-GOV-06', performanceBaseline.measurements.length > 0 && performanceBaseline.repeatabilityRuns >= 3, 'performance and determinism baseline captured'),
    gate('P15-GOV-07', PHASE15_REQUIRED_REVIEW_ROLES.every((role) => reviewers[role]?.reviewer && reviewers[role]?.approvalHash), 'required reviewers assigned'),
    gate('P15-GOV-08', phase14StatusAudit.benchmarkExecutionStarted === true && phase14StatusAudit.staleAssertionCount === 0 && Boolean(phase14StatusAudit.statusDocumentHash), 'P15-D016 Phase 14 live status is current'),
  ];
  const status = gates.every((row) => row.status === 'PASS') ? 'PASS' : 'BLOCKED';
  const core = {
    version: PHASE15_BASELINE_VERSION,
    phase: 'Phase 15',
    milestone: 'P15-M0',
    sourceRevision,
    dirtyTree: {
      entries: dirtyEntries,
      summary: summarizeDirtyEntries(dirtyEntries),
      inventoryHash: strictCanonicalHash(dirtyEntries, 'dirty inventory'),
    },
    environment,
    preservedArtifacts,
    manifestBindings,
    discrepancyIds,
    reviewers,
    expectedImportAudit,
    phase14StatusAudit,
    traceCoverage,
    performanceBaseline,
    gates,
    status,
    releaseAllowed: false,
    finalDesignTransferAllowed: false,
  };
  const baselineHash = strictCanonicalHash(core, 'Phase 15 corrective baseline');
  const runCore = {
    baselineHash,
    capturedAt: requiredTimestamp(input.run?.capturedAt, 'run.capturedAt'),
    host: optionalText(input.run?.host),
  };
  const run = immutable({ ...runCore, runRecordHash: strictCanonicalHash(runCore, 'baseline run record') });
  const artifactCore = { ...core, baselineHash, run };
  return immutable({ ...artifactCore, artifactHash: strictCanonicalHash(artifactCore, 'baseline artifact') });
}

export function validatePhase15CorrectiveBaseline(artifact = {}) {
  const errors = [];
  try {
    const topLevelKeys = [
      'version', 'phase', 'milestone', 'sourceRevision', 'dirtyTree', 'environment', 'preservedArtifacts',
      'manifestBindings', 'discrepancyIds', 'reviewers', 'expectedImportAudit', 'phase14StatusAudit', 'traceCoverage',
      'performanceBaseline', 'gates', 'status', 'releaseAllowed', 'finalDesignTransferAllowed', 'baselineHash', 'run', 'artifactHash',
    ];
    if (!hasExactKeys(artifact, topLevelKeys)) errors.push('baseline:unknown-or-missing-field');
    if (artifact.version !== PHASE15_BASELINE_VERSION) errors.push('baseline:version');
    if (artifact.phase !== 'Phase 15' || artifact.milestone !== 'P15-M0') errors.push('baseline:scope');
    if (artifact.releaseAllowed !== false || artifact.finalDesignTransferAllowed !== false) errors.push('baseline:release');
    if (!artifact.discrepancyIds?.includes('P15-D016')) errors.push('baseline:d016');
    if (artifact.dirtyTree?.inventoryHash !== strictCanonicalHash(artifact.dirtyTree?.entries || [], 'dirty inventory')) errors.push('baseline:dirty-hash');
    if (strictCanonicalHash(artifact.dirtyTree?.summary || {}, 'dirty summary') !== strictCanonicalHash(summarizeDirtyEntries(artifact.dirtyTree?.entries || []), 'expected dirty summary')) errors.push('baseline:dirty-summary');
    const semanticGates = expectedBaselineGates(artifact);
    if (strictCanonicalHash(artifact.gates || [], 'baseline gates') !== strictCanonicalHash(semanticGates, 'expected baseline gates')) errors.push('baseline:gates');
    const core = cloneStrictJson(artifact, 'baseline artifact');
    delete core.baselineHash;
    delete core.run;
    delete core.artifactHash;
    if (artifact.baselineHash !== strictCanonicalHash(core, 'Phase 15 corrective baseline')) errors.push('baseline:hash');
    const runCore = cloneStrictJson(artifact.run, 'baseline run');
    delete runCore.runRecordHash;
    if (artifact.run?.baselineHash !== artifact.baselineHash) errors.push('baseline:run-binding');
    if (artifact.run?.runRecordHash !== strictCanonicalHash(runCore, 'baseline run record')) errors.push('baseline:run-hash');
    const artifactCore = cloneStrictJson(artifact, 'baseline artifact');
    delete artifactCore.artifactHash;
    if (artifact.artifactHash !== strictCanonicalHash(artifactCore, 'baseline artifact')) errors.push('baseline:artifact-hash');
    const expectedStatus = (artifact.gates || []).every((row) => row.status === 'PASS') ? 'PASS' : 'BLOCKED';
    if (artifact.status !== expectedStatus) errors.push('baseline:status');
    const importAuditCore = {
      scannedFileCount: artifact.expectedImportAudit?.scannedFileCount,
      violations: artifact.expectedImportAudit?.violations,
    };
    if (artifact.expectedImportAudit?.auditHash !== strictCanonicalHash(importAuditCore, 'production expected import audit')) errors.push('baseline:expected-import-audit-hash');
    if (artifact.performanceBaseline?.measurementHash !== strictCanonicalHash(artifact.performanceBaseline?.measurements || [], 'performance measurements')) errors.push('baseline:performance-hash');
  } catch (error) {
    errors.push(`baseline:schema:${error.message}`);
  }
  return immutable({ ok: errors.length === 0, errors });
}

function expectedBaselineGates(artifact) {
  return [
    gate('P15-GOV-01', /^[0-9a-f]{40}$/i.test(artifact.sourceRevision || '') && Array.isArray(artifact.dirtyTree?.entries), 'source revision and dirty inventory captured'),
    gate('P15-GOV-02', hasRequiredArchives(artifact.preservedArtifacts || []), 'first-batch and Phase 14 artifacts archived with content hashes'),
    gate('P15-GOV-03', (artifact.manifestBindings || []).length > 0 && artifact.manifestBindings.every((row) => row.approved === true && row.referenceHash && row.toleranceHash && row.probeHash), 'reference, tolerance, and probe manifests pre-registered and approved'),
    gate('P15-GOV-04', sameSet(artifact.discrepancyIds || [], PHASE15_DISCREPANCY_IDS) && artifact.traceCoverage === 1, 'all discrepancies and trace links registered'),
    gate('P15-GOV-05', artifact.expectedImportAudit?.scannedFileCount > 0 && artifact.expectedImportAudit?.violations?.length === 0 && Boolean(artifact.expectedImportAudit?.auditHash), 'production expected/reference import audit is clean'),
    gate('P15-GOV-06', artifact.performanceBaseline?.measurements?.length > 0 && artifact.performanceBaseline?.repeatabilityRuns >= 3, 'performance and determinism baseline captured'),
    gate('P15-GOV-07', PHASE15_REQUIRED_REVIEW_ROLES.every((role) => artifact.reviewers?.[role]?.reviewer && artifact.reviewers?.[role]?.approvalHash), 'required reviewers assigned'),
    gate('P15-GOV-08', artifact.phase14StatusAudit?.benchmarkExecutionStarted === true && artifact.phase14StatusAudit?.staleAssertionCount === 0 && Boolean(artifact.phase14StatusAudit?.statusDocumentHash), 'P15-D016 Phase 14 live status is current'),
  ];
}

function normalizeArtifacts(values) {
  const rows = Array.from(values || [], (artifact, index) => ({
    id: requiredText(artifact?.id, `preservedArtifacts[${index}].id`),
    kind: requiredText(artifact?.kind, `preservedArtifacts[${index}].kind`),
    path: requiredText(artifact?.path, `preservedArtifacts[${index}].path`),
    sha256: requiredHash(artifact?.sha256, `preservedArtifacts[${index}].sha256`),
    byteLength: nonnegativeInteger(artifact?.byteLength, `preservedArtifacts[${index}].byteLength`),
  })).sort((left, right) => left.id.localeCompare(right.id));
  assertUniqueIds(rows, 'preservedArtifacts');
  return rows;
}

function normalizeManifestBindings(references = [], tolerances = [], probes = []) {
  const referenceByCase = uniqueByCase(references, 'reference manifests');
  const toleranceByCase = uniqueByCase(tolerances, 'tolerance manifests');
  const probeByCase = uniqueByCase(probes, 'probe manifests');
  const caseIds = [...new Set([...referenceByCase.keys(), ...toleranceByCase.keys(), ...probeByCase.keys()])].sort();
  return caseIds.map((caseId) => {
    const reference = referenceByCase.get(caseId);
    const tolerance = toleranceByCase.get(caseId);
    const probe = probeByCase.get(caseId);
    const referenceHash = reference?.referenceHash || null;
    return {
      caseId,
      referenceHash,
      toleranceHash: tolerance?.toleranceHash || null,
      probeHash: probe?.probeHash || null,
      approved: Boolean(reference && tolerance && probe
        && tolerance.referenceHash === referenceHash
        && probe.referenceHash === referenceHash
        && isApprovedPhase15ReferenceManifest(reference)
        && isApprovedPhase15ToleranceManifest(tolerance)
        && isApprovedPhase15ProbeManifest(probe)),
    };
  });
}

function normalizeReviewers(value = {}) {
  return Object.fromEntries(PHASE15_REQUIRED_REVIEW_ROLES.map((role) => {
    const row = value?.[role] || {};
    return [role, {
      reviewer: optionalText(row.reviewer),
      approvalHash: row.approvalHash == null ? null : requiredHash(row.approvalHash, `reviewers.${role}.approvalHash`),
    }];
  }));
}

function normalizeExpectedImportAudit(value = {}) {
  const core = {
    scannedFileCount: nonnegativeInteger(value.scannedFileCount ?? 0, 'expectedImportAudit.scannedFileCount'),
    violations: sortedUniqueText(value.violations || [], 'expectedImportAudit.violations'),
  };
  const auditHash = strictCanonicalHash(core, 'production expected import audit');
  if (value.auditHash != null && requiredHash(value.auditHash, 'expectedImportAudit.auditHash') !== auditHash) {
    throw new Error('expectedImportAudit.auditHash does not match the audit payload.');
  }
  return { ...core, auditHash };
}

function normalizePhase14StatusAudit(value = {}) {
  return {
    benchmarkExecutionStarted: value.benchmarkExecutionStarted === true,
    staleAssertionCount: nonnegativeInteger(value.staleAssertionCount ?? 0, 'phase14StatusAudit.staleAssertionCount'),
    statusDocumentHash: value.statusDocumentHash == null ? null : requiredHash(value.statusDocumentHash, 'phase14StatusAudit.statusDocumentHash'),
  };
}

function normalizePerformanceBaseline(value = {}) {
  const measurements = cloneStrictJson(Array.from(value.measurements || []), 'performanceBaseline.measurements');
  return {
    repeatabilityRuns: nonnegativeInteger(value.repeatabilityRuns ?? 0, 'performanceBaseline.repeatabilityRuns'),
    measurements,
    measurementHash: strictCanonicalHash(measurements, 'performance measurements'),
  };
}

function hasRequiredArchives(rows) {
  const ids = new Set(rows.map((row) => row.id));
  return ['first-batch-json', 'first-batch-pdf', 'phase14-release-manifest', 'phase14-m0-baseline'].every((id) => ids.has(id));
}

function summarizeDirtyEntries(entries) {
  const result = { modified: 0, added: 0, deleted: 0, renamed: 0, untracked: 0 };
  for (const line of entries) {
    const code = line.slice(0, 2);
    if (code === '??') result.untracked += 1;
    else {
      if (code.includes('M')) result.modified += 1;
      if (code.includes('A')) result.added += 1;
      if (code.includes('D')) result.deleted += 1;
      if (code.includes('R')) result.renamed += 1;
    }
  }
  return result;
}

function gate(id, pass, label) {
  return { id, status: pass ? 'PASS' : 'BLOCKED', label };
}

function uniqueByCase(values, label) {
  const result = new Map();
  for (const [index, row] of Array.from(values || []).entries()) {
    const caseId = requiredText(row?.caseId, `${label}[${index}].caseId`).toUpperCase();
    if (result.has(caseId)) throw new Error(`${label} contains duplicate case ${caseId}.`);
    result.set(caseId, row);
  }
  return result;
}

function sameSet(left, right) {
  return strictCanonicalHash([...left].sort(), 'left set') === strictCanonicalHash([...right].sort(), 'right set');
}

function nonnegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new TypeError(`${label} must be a nonnegative integer.`);
  return number;
}

function requiredNonemptyObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) throw new TypeError(`${label} must be a non-empty object.`);
  return value;
}

function requiredTimestamp(value, label) {
  const timestamp = requiredText(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) throw new TypeError(`${label} must be an ISO-compatible timestamp.`);
  return timestamp;
}

function assertUniqueIds(rows, label) {
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error(`${label} contains duplicate ids.`);
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
