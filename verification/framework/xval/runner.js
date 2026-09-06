import { stableHash, stableStringify } from '../../../src/core/stableHash.js';
import {
  VERIFICATION_MATRIX_RECORD_VERSION,
  modelHash,
} from '../matrix/record.js';
import {
  validateXvalReferenceArtifact,
} from './referenceArtifact.js';
import {
  XVAL_M1_REQUIRED_CASE_IDS,
  XVAL_RELEASE_CASE_IDS,
} from './cases.js';
import { parseXvalResultPath } from './resultPath.js';

export const P10_XVAL_RUNNER_VERSION = 'p10-m1-xval-runner-v1';
export const P10_XVAL_SOLVER_VERSION = 's-structures-0.1.0-p10-m1';

export function runXvalSuite({
  cases = [],
  artifacts = [],
  requiredCaseIds = XVAL_M1_REQUIRED_CASE_IDS,
  badgeCaseIds = XVAL_RELEASE_CASE_IDS,
  solverVersion = P10_XVAL_SOLVER_VERSION,
} = {}) {
  const normalizedArtifacts = normalizeArtifacts(artifacts);
  const artifactById = normalizedArtifacts.byId;
  const duplicateArtifactCaseIds = normalizedArtifacts.duplicateCaseIds;
  const caseIds = new Set(cases.map((item) => item.caseId));
  const duplicateCaseIds = cases
    .map((item) => item.caseId)
    .filter((caseId, index, values) => values.indexOf(caseId) !== index);
  const results = cases.map((definition) => (
    duplicateArtifactCaseIds.includes(definition.caseId)
      ? blockedResult(definition.caseId, 'XVAL_REFERENCE_ARTIFACT_DUPLICATE', definition.model, solverVersion)
      : runXvalCase({
          definition,
          artifact: artifactById.get(definition.caseId) || null,
          solverVersion,
        })
  ));
  const resultById = new Map(results.map((result) => [result.caseId, result]));
  const missingRequired = requiredCaseIds.filter((caseId) => !caseIds.has(caseId));
  const milestoneGate = {
    requiredCaseIds: [...requiredCaseIds],
    missingCaseIds: missingRequired,
    ok: duplicateCaseIds.length === 0
      && duplicateArtifactCaseIds.length === 0
      && missingRequired.length === 0
      && requiredCaseIds.every((caseId) => resultById.get(caseId)?.status === 'PASS'),
  };
  const pendingCaseIds = results.filter((result) => result.status === 'PENDING').map((result) => result.caseId);
  const blockedCaseIds = results.filter((result) => result.status === 'BLOCKED').map((result) => result.caseId);
  const failedCaseIds = results.filter((result) => result.status === 'NG').map((result) => result.caseId);
  const badgeMissingCaseIds = badgeCaseIds.filter((caseId) => resultById.get(caseId)?.status !== 'PASS');
  const externalReferenceCaseIds = badgeCaseIds.filter((caseId) => caseId !== 'XV-01');
  const sourceIneligibleCaseIds = externalReferenceCaseIds.filter((caseId) => {
    const result = resultById.get(caseId);
    return result?.status === 'PASS' && !['opensees', 'sap2000', 'etabs'].includes(result.referenceSource);
  });
  const externallyCrossValidated = badgeMissingCaseIds.length === 0
    && sourceIneligibleCaseIds.length === 0
    && badgeCaseIds.length > 0
    && duplicateCaseIds.length === 0
    && duplicateArtifactCaseIds.length === 0;
  const report = {
    version: P10_XVAL_RUNNER_VERSION,
    status: milestoneGate.ok ? 'OK' : 'NG',
    solverVersion,
    cases: results,
    summary: {
      total: results.length,
      pass: results.filter((result) => result.status === 'PASS').length,
      pending: pendingCaseIds.length,
      blocked: blockedCaseIds.length,
      ng: failedCaseIds.length,
    },
    milestoneGate,
    releaseQualification: {
      badge: 'externally-cross-validated',
      externallyCrossValidated,
      requiredCaseIds: [...badgeCaseIds],
      externalReferenceCaseIds,
      handCalcAnchorCaseIds: badgeCaseIds.includes('XV-01') ? ['XV-01'] : [],
      missingGreenCaseIds: badgeMissingCaseIds,
      sourceIneligibleCaseIds,
      pendingCaseIds,
      blockedCaseIds,
      failedCaseIds,
    },
    duplicateCaseIds: [...new Set(duplicateCaseIds)],
    duplicateArtifactCaseIds,
  };
  return { ...report, artifactHash: stableHash(report).slice(0, 24) };
}

export function runXvalCase({ definition, artifact, solverVersion = P10_XVAL_SOLVER_VERSION } = {}) {
  const caseId = definition?.caseId || artifact?.caseId || null;
  if (!definition || typeof definition !== 'object') {
    return blockedResult(caseId, 'XVAL_CASE_DEFINITION_MISSING', null, solverVersion);
  }
  if (!artifact) return blockedResult(caseId, 'XVAL_REFERENCE_ARTIFACT_MISSING', definition.model, solverVersion);
  const artifactValidation = validateXvalReferenceArtifact(artifact);
  if (!artifactValidation.ok) {
    return blockedResult(caseId, 'XVAL_REFERENCE_ARTIFACT_INVALID', definition.model, solverVersion, {
      validationErrors: artifactValidation.errors,
    });
  }
  let artifactSnapshot;
  try {
    artifactSnapshot = structuredClone(artifact);
  } catch (error) {
    return blockedResult(caseId, 'XVAL_REFERENCE_ARTIFACT_CLONE_FAILED', definition.model, solverVersion, {
      message: error?.message || String(error),
    });
  }
  const snapshotValidation = validateXvalReferenceArtifact(artifactSnapshot);
  if (!snapshotValidation.ok) {
    return blockedResult(caseId, 'XVAL_REFERENCE_ARTIFACT_INVALID', definition.model, solverVersion, {
      validationErrors: snapshotValidation.errors,
      snapshotValidation: true,
    });
  }
  if (artifactSnapshot.caseId !== caseId) {
    return blockedResult(caseId, 'XVAL_CASE_ID_MISMATCH', definition.model, solverVersion, {
      artifactCaseId: artifactSnapshot.caseId,
    });
  }
  const liveModelHash = modelHash(definition.model);
  if (artifactSnapshot.model.modelHash !== liveModelHash) {
    return blockedResult(caseId, 'XVAL_MODEL_HASH_MISMATCH', definition.model, solverVersion, {
      referenceModelHash: artifactSnapshot.model.modelHash,
      liveModelHash,
    });
  }
  if (stableStringify(artifactSnapshot.model.unitSystem) !== stableStringify(definition.model?.unitSystem)) {
    return blockedResult(caseId, 'XVAL_UNIT_SYSTEM_MISMATCH', definition.model, solverVersion);
  }
  if (artifactSnapshot.status === 'pending-reference') {
    return {
      version: P10_XVAL_RUNNER_VERSION,
      caseId,
      status: 'PENDING',
      reason: 'XVAL_REFERENCE_PENDING',
      modelHash: liveModelHash,
      referenceArtifactHash: artifactSnapshot.artifactHash,
      referenceSource: artifactSnapshot.source,
      solverVersion,
      records: [],
      details: { executed: false },
    };
  }
  if (typeof definition.execute !== 'function') {
    return blockedResult(caseId, 'XVAL_EXECUTOR_MISSING', definition.model, solverVersion, {
      referenceArtifactHash: artifactSnapshot.artifactHash,
    });
  }

  let executionModel;
  try {
    executionModel = structuredClone(definition.model);
  } catch (error) {
    return blockedResult(caseId, 'XVAL_MODEL_CLONE_FAILED', definition.model, solverVersion, {
      message: error?.message || String(error),
      referenceArtifactHash: artifactSnapshot.artifactHash,
    });
  }
  const executionModelHash = modelHash(executionModel);
  let response;
  let executionError = null;
  try {
    response = definition.execute(executionModel);
  } catch (error) {
    executionError = error;
  }
  const postExecutionModelHash = modelHash(executionModel);
  const postDefinitionModelHash = modelHash(definition.model);
  if (postExecutionModelHash !== executionModelHash || postDefinitionModelHash !== liveModelHash) {
    return blockedResult(caseId, 'XVAL_EXECUTOR_MUTATED_MODEL', definition.model, solverVersion, {
      executionModelHash,
      postExecutionModelHash,
      liveModelHash,
      postDefinitionModelHash,
      referenceArtifactHash: artifactSnapshot.artifactHash,
    });
  }
  if (executionError) {
    return blockedResult(caseId, 'XVAL_EXECUTION_FAILED', definition.model, solverVersion, {
      message: executionError?.message || String(executionError),
      referenceArtifactHash: artifactSnapshot.artifactHash,
    });
  }
  let responseIsThenable = false;
  try {
    responseIsThenable = Boolean(response) && typeof response.then === 'function';
  } catch (error) {
    return blockedResult(caseId, 'XVAL_RESULT_EXTRACTION_FAILED', definition.model, solverVersion, {
      message: error?.message || String(error),
      referenceArtifactHash: artifactSnapshot.artifactHash,
    });
  }
  if (responseIsThenable) {
    return blockedResult(caseId, 'XVAL_ASYNC_EXECUTOR_UNSUPPORTED', definition.model, solverVersion);
  }
  let records;
  try {
    records = artifactSnapshot.quantities.map((quantity) => buildXvalQuantityRecord({
      caseId,
      response,
      quantity,
      artifact: artifactSnapshot,
      liveModelHash,
      solverVersion,
    }));
  } catch (error) {
    return blockedResult(caseId, 'XVAL_RESULT_EXTRACTION_FAILED', definition.model, solverVersion, {
      message: error?.message || String(error),
      referenceArtifactHash: artifactSnapshot.artifactHash,
    });
  }
  if (modelHash(executionModel) !== executionModelHash || modelHash(definition.model) !== liveModelHash) {
    return blockedResult(caseId, 'XVAL_EXECUTOR_MUTATED_MODEL', definition.model, solverVersion, {
      executionModelHash,
      postExecutionModelHash: modelHash(executionModel),
      liveModelHash,
      postDefinitionModelHash: modelHash(definition.model),
      referenceArtifactHash: artifactSnapshot.artifactHash,
    });
  }
  const status = records.every((record) => record.status === 'OK') ? 'PASS' : 'NG';
  return {
    version: P10_XVAL_RUNNER_VERSION,
    caseId,
    status,
    reason: status === 'PASS' ? null : 'XVAL_TOLERANCE_OR_PATH_FAILURE',
    modelHash: liveModelHash,
    referenceArtifactHash: artifactSnapshot.artifactHash,
    referenceSource: artifactSnapshot.source,
    solverVersion,
    records,
    details: { executed: true, quantityCount: records.length },
  };
}

export function extractXvalResultPath(root, path) {
  const parsed = parseXvalResultPath(path);
  if (!parsed.ok) return parsed;
  let value = root;
  for (const segment of parsed.segments) {
    if (value == null || (typeof value !== 'object' && !Array.isArray(value))) {
      return { ok: false, code: 'XVAL_PATH_MISSING', path, segment };
    }
    if (!Object.prototype.hasOwnProperty.call(value, segment)) {
      return { ok: false, code: 'XVAL_PATH_MISSING', path, segment };
    }
    value = value[segment];
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ok: false, code: 'XVAL_PATH_NOT_FINITE_SCALAR', path, valueType: typeof value };
  }
  return { ok: true, value, path, segments: parsed.segments };
}

export function xvalScalarRelativeError(computed, reference, scale = null) {
  const actual = Number(computed);
  const expected = Number(reference);
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return Number.POSITIVE_INFINITY;
  const explicitScale = Number(scale);
  const denominator = Math.max(
    Math.abs(expected),
    Number.isFinite(explicitScale) && explicitScale > 0 ? Math.abs(explicitScale) : 0,
    1e-12,
  );
  return Math.abs(actual - expected) / denominator;
}

function buildXvalQuantityRecord({
  caseId,
  response,
  quantity,
  artifact,
  liveModelHash,
  solverVersion,
}) {
  const extracted = extractXvalResultPath(response, quantity.path);
  const relError = extracted.ok
    ? xvalScalarRelativeError(extracted.value, quantity.value, quantity.scale)
    : null;
  const status = extracted.ok && relError <= quantity.tolerance ? 'OK' : 'NG';
  return {
    version: VERIFICATION_MATRIX_RECORD_VERSION,
    caseId,
    tier: 'XV',
    name: `${caseId} ${quantity.path}`,
    metric: quantity.path,
    units: quantity.unit,
    reference: quantity.value,
    computed: extracted.ok ? extracted.value : null,
    relError,
    tolerance: quantity.tolerance,
    toleranceKey: null,
    modelHash: liveModelHash,
    solverVersion,
    referenceSource: `${artifact.source}:${artifact.sourceVersion}`,
    status,
    details: {
      scale: quantity.scale ?? null,
      path: quantity.path,
      extractionCode: extracted.ok ? 'OK' : extracted.code,
      referenceArtifactHash: artifact.artifactHash,
    },
  };
}

function blockedResult(caseId, reason, model, solverVersion, details = {}) {
  return {
    version: P10_XVAL_RUNNER_VERSION,
    caseId,
    status: 'BLOCKED',
    reason,
    modelHash: model ? modelHash(model) : null,
    referenceArtifactHash: details.referenceArtifactHash || null,
    referenceSource: null,
    solverVersion,
    records: [],
    details,
  };
}

function normalizeArtifacts(artifacts) {
  if (artifacts instanceof Map) return { byId: new Map(artifacts), duplicateCaseIds: [] };
  if (Array.isArray(artifacts)) {
    const byId = new Map();
    const duplicateCaseIds = new Set();
    for (const artifact of artifacts) {
      const caseId = artifact?.caseId;
      if (byId.has(caseId)) duplicateCaseIds.add(caseId);
      else byId.set(caseId, artifact);
    }
    return { byId, duplicateCaseIds: [...duplicateCaseIds].filter(Boolean).sort() };
  }
  if (artifacts && typeof artifacts === 'object') {
    return { byId: new Map(Object.entries(artifacts)), duplicateCaseIds: [] };
  }
  return { byId: new Map(), duplicateCaseIds: [] };
}
