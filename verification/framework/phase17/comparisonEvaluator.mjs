import { assertRepoRelativePath, assertStrictJson, sha256Canonical } from './canonical.mjs';
import { validateManifestDocument } from './manifestValidation.mjs';
import { assertExtractedActualValuesArtifact } from './resultExtractor.mjs';

export const P17_COMPARISON_EVALUATOR_VERSION = 'p17-m1-comparison-evaluator-v1';

/** Evaluates immutable, pre-locked metrics. M1 never calls this with numbers. */
export function evaluateLockedComparison(input = {}) {
  const bundle = input.referenceBundle;
  if (bundle?.status !== 'READY' || bundle?.payloadAbsent !== false) {
    throw evaluatorError('P17_COMPARISON_REFERENCE_NOT_READY', 'Comparison requires a locked reference bundle.');
  }
  const runId = typeof input.runId === 'string' ? input.runId.trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{5,127}$/u.test(runId)) throw evaluatorError('P17_COMPARISON_RUN_ID_INVALID', 'A valid immutable run ID is required.');
  const runRecord = strictClone(input.runRecord, 'runRecord');
  validateManifestDocument('runRecord', runRecord);
  if (runRecord.caseId !== bundle.caseId || runRecord.runId !== runId || runRecord.status !== 'EXECUTED' || runRecord.engineeringResultHash === null) throw evaluatorError('P17_COMPARISON_RUN_RECORD_INVALID', 'Comparison requires the executed official run record for the same case and run ID.');
  if (runRecord.productBinding.executionProvenance.mode !== 'OFFICIAL_PUBLIC_SERVICE' || runRecord.productBinding.executionProvenance.terminalQualificationEligible !== true) throw evaluatorError('P17_COMPARISON_TEST_PROVENANCE_FORBIDDEN', 'TEST_ONLY or injected execution cannot produce a qualification comparison.');
  const actualArtifact = validateActualValuesArtifact(input.actualValuesArtifact, { bundle, runRecord, runId });
  const actualValuesPath = assertRepoRelativePath(input.actualValuesPath, 'actualValuesPath');
  const extractorPath = assertRepoRelativePath(actualArtifact.extractor.sourcePath, 'actualValuesArtifact.extractor.sourcePath');
  const actualById = uniqueMap(actualArtifact.values, (row) => row.metricId, 'P17_COMPARISON_ACTUAL_ID_DUPLICATE');
  const referenceByLane = Object.fromEntries(['PRIMARY_INDEPENDENT', 'STRIX_PUBLISHED', 'STRIX_R4', 'MIDAS_R4'].map((lane) => [
    lane,
    uniqueMap(bundle.expectedValues.values.filter((row) => row.lane === lane), (row) => row.metricId, 'P17_COMPARISON_REFERENCE_ID_DUPLICATE'),
  ]));
  uniqueMap(bundle.toleranceManifest.criteria, (row) => row.metricId, 'P17_COMPARISON_CRITERION_ID_DUPLICATE');
  const metrics = [];
  for (const criterion of bundle.toleranceManifest.criteria) {
    const actual = actualById.get(criterion.metricId);
    const reference = referenceByLane.PRIMARY_INDEPENDENT.get(criterion.metricId);
    if (!actual) throw evaluatorError('P17_ACTUAL_METRIC_MISSING', `Actual metric ${criterion.metricId} is missing.`);
    const actualValue = finite(actual.value, 'P17_ACTUAL_VALUE_NONFINITE');
    if (actual.unit !== criterion.unit) {
      metrics.push({
        metricId: criterion.metricId,
        mandatory: criterion.mandatory,
        unit: criterion.unit,
        sstructuresValue: actualValue,
        primaryReference: reference?.value ?? null,
        strixPublished: laneValue(referenceByLane.STRIX_PUBLISHED, criterion.metricId, criterion.unit),
        strixR4: laneValue(referenceByLane.STRIX_R4, criterion.metricId, criterion.unit),
        midasR4: laneValue(referenceByLane.MIDAS_R4, criterion.metricId, criterion.unit),
        comparisonMode: criterion.comparisonMode,
        signedDifference: null,
        signedErrorPct: null,
        absoluteError: null,
        tolerance: toleranceRecord(criterion),
        status: 'FAIL',
        reasonCodes: ['P17_COMPARISON_UNIT_MISMATCH'],
      });
      continue;
    }
    if (!reference) {
      metrics.push({
        metricId: criterion.metricId,
        mandatory: criterion.mandatory,
        unit: criterion.unit,
        sstructuresValue: actualValue,
        primaryReference: null,
        strixPublished: laneValue(referenceByLane.STRIX_PUBLISHED, criterion.metricId, criterion.unit),
        strixR4: laneValue(referenceByLane.STRIX_R4, criterion.metricId, criterion.unit),
        midasR4: laneValue(referenceByLane.MIDAS_R4, criterion.metricId, criterion.unit),
        comparisonMode: criterion.comparisonMode,
        signedDifference: null,
        signedErrorPct: null,
        absoluteError: null,
        tolerance: toleranceRecord(criterion),
        status: 'BLOCKED_REFERENCE',
        reasonCodes: ['P17_PRIMARY_REFERENCE_MISSING'],
      });
      continue;
    }
    if (reference.unit !== criterion.unit) throw evaluatorError('P17_PRIMARY_REFERENCE_UNIT_MISMATCH', `Reference metric ${criterion.metricId} has an inconsistent unit.`);
    const referenceValue = finite(reference.value, 'P17_REFERENCE_VALUE_NONFINITE');
    const rawSignedDifference = actualValue - referenceValue;
    const nearZero = Math.abs(referenceValue) <= criterion.nearZeroThreshold;
    const unsigned = criterion.comparisonMode === 'UNSIGNED_ABSOLUTE';
    const signedDifference = unsigned ? null : rawSignedDifference;
    const absoluteError = unsigned
      ? Math.abs(Math.abs(actualValue) - Math.abs(referenceValue))
      : Math.abs(rawSignedDifference);
    const signedErrorPct = nearZero || criterion.comparisonMode !== 'SIGNED_RELATIVE'
      ? null
      : 100 * rawSignedDifference / Math.abs(referenceValue);
    const relativePass = signedErrorPct !== null && Math.abs(signedErrorPct) <= criterion.relativeTolerancePct;
    const absolutePass = criterion.absoluteTolerance !== null && absoluteError <= criterion.absoluteTolerance;
    const relativeMode = criterion.comparisonMode === 'SIGNED_RELATIVE';
    const comparable = relativeMode ? (nearZero ? criterion.absoluteTolerance !== null : criterion.relativeTolerancePct !== null) : criterion.absoluteTolerance !== null;
    const pass = comparable && (relativeMode ? (nearZero ? absolutePass : relativePass) : absolutePass);
    const status = pass ? 'PASS' : 'FAIL';
    metrics.push({
      metricId: criterion.metricId,
      mandatory: criterion.mandatory,
      unit: actual.unit,
      sstructuresValue: actualValue,
      primaryReference: referenceValue,
      strixPublished: laneValue(referenceByLane.STRIX_PUBLISHED, criterion.metricId, criterion.unit),
      strixR4: laneValue(referenceByLane.STRIX_R4, criterion.metricId, criterion.unit),
      midasR4: laneValue(referenceByLane.MIDAS_R4, criterion.metricId, criterion.unit),
      comparisonMode: criterion.comparisonMode,
      signedDifference,
      absoluteError,
      signedErrorPct,
      tolerance: toleranceRecord(criterion),
      status,
      reasonCodes: status === 'PASS' ? [] : [comparable ? 'P17_TOLERANCE_EXCEEDED' : 'P17_NEAR_ZERO_ABSOLUTE_TOLERANCE_REQUIRED'],
    });
  }
  const mandatory = metrics.filter((row) => row.mandatory);
  const blocked = mandatory.filter((row) => row.status === 'BLOCKED_REFERENCE').length;
  const failed = mandatory.filter((row) => row.status === 'FAIL').length;
  const passed = mandatory.filter((row) => row.status === 'PASS').length;
  const status = blocked ? 'BLOCKED_REFERENCE' : failed ? 'FAIL' : 'PASS';
  const core = {
    schemaVersion: 'p17-comparison-v1',
    caseId: bundle.caseId,
    runId,
    status,
    actualValuesBinding: {
      path: actualValuesPath,
      sha256: actualArtifact.artifactHash,
      contentSha256: sha256Canonical(actualArtifact),
      engineeringResultHash: actualArtifact.engineeringResult.rawSha256,
      probeHash: actualArtifact.probeManifest.canonicalHash,
      extractorPath,
      extractorHash: actualArtifact.extractor.sourceSha256,
      runRecordHash: runRecord.runRecordHash,
    },
    comparisonPolicy: {
      signedRelativeFormula: '100*(SStructures-Reference)/abs(Reference)',
      nearZeroUsesAbsolute: true,
      independentAndCrossSolverSeparated: true,
      toleranceHash: bundle.documentHashes.toleranceManifest,
      probeHash: bundle.documentHashes.probeManifest,
    },
    metrics,
    summary: {
      mandatoryMetricCount: mandatory.length,
      passedMetricCount: passed,
      failedMetricCount: failed,
      blockedMetricCount: blocked,
    },
    reasonCodes: status === 'PASS' ? [] : [status === 'BLOCKED_REFERENCE' ? 'P17_PRIMARY_REFERENCE_INCOMPLETE' : 'P17_MANDATORY_COMPARISON_FAILED'],
  };
  const comparison = { ...core, comparisonHash: sha256Canonical(core) };
  validateManifestDocument('comparison', comparison);
  return deepFreeze(comparison);
}

function validateActualValuesArtifact(value, { bundle, runRecord, runId }) {
  const artifact = strictClone(value, 'actualValuesArtifact');
  try {
    assertExtractedActualValuesArtifact(artifact);
  } catch (error) {
    throw evaluatorError('P17_ACTUAL_VALUES_ARTIFACT_INVALID', `Actual-values artifact failed the framework extractor contract: ${error.message}`);
  }
  if (artifact.schemaVersion !== 'p17-extracted-actual-values-v1'
    || artifact.caseId !== bundle.caseId
    || artifact.engineeringResult.rawSha256 !== runRecord.engineeringResultHash
    || artifact.probeManifest.canonicalHash !== bundle.documentHashes.probeManifest
    || !Array.isArray(artifact.values)
    || artifact.values.length === 0) {
    throw evaluatorError('P17_ACTUAL_VALUES_ARTIFACT_INVALID', 'Actual values must be a self-hashed extraction bound to the official run result, probe manifest and extractor code.');
  }
  assertRepoRelativePath(artifact.extractor.sourcePath, 'actualValuesArtifact.extractor.sourcePath');
  for (const row of artifact.values) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || !/^[A-Za-z0-9._-]+$/u.test(String(row.metricId || '')) || typeof row.value !== 'number' || !Number.isFinite(row.value) || typeof row.unit !== 'string' || !row.unit) {
      throw evaluatorError('P17_ACTUAL_VALUES_ROW_INVALID', 'Extracted actual values must contain finite metricId/value/unit rows.');
    }
  }
  return artifact;
}

function laneValue(lane, metricId, expectedUnit) {
  const row = lane.get(metricId);
  if (!row) return null;
  if (row.unit !== expectedUnit) throw evaluatorError('P17_CROSS_SOLVER_REFERENCE_UNIT_MISMATCH', `Reference lane metric ${metricId} has an inconsistent unit.`);
  return finite(row.value, 'P17_REFERENCE_VALUE_NONFINITE');
}

function toleranceRecord(criterion) {
  return {
    relativePct: criterion.relativeTolerancePct,
    absolute: criterion.absoluteTolerance,
    nearZeroThreshold: criterion.nearZeroThreshold,
  };
}

function uniqueMap(values, keyOf, code) {
  const result = new Map();
  for (const value of values || []) {
    const key = keyOf(value);
    if (result.has(key)) throw evaluatorError(code, `Duplicate metric: ${key}`);
    result.set(key, value);
  }
  return result;
}

function strictClone(value, label) {
  assertStrictJson(value, label);
  return JSON.parse(JSON.stringify(value));
}

function finite(value, code) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw evaluatorError(code, 'Comparison values must be finite numbers.');
  return value;
}

function evaluatorError(code, message) {
  return Object.assign(new Error(message), { code });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
