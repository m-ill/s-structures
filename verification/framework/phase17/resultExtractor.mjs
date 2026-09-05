import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertRepoRelativePath,
  assertStrictJson,
  canonicalJson,
  sha256Canonical,
} from './canonical.mjs';
import {
  assertRfc6901JsonPointer,
  validateManifestDocument,
} from './manifestValidation.mjs';

export const P17_RESULT_EXTRACTOR_VERSION = 'p17-result-extractor-v1';
export const P17_EXTRACTED_ACTUAL_VALUES_SCHEMA_VERSION = 'p17-extracted-actual-values-v1';
export const P17_RESULT_EXTRACTION_OPERATION = 'IDENTITY_FINITE_NUMBER';
export const P17_RESULT_EXTRACTOR_SOURCE_PATH = 'verification/framework/phase17/resultExtractor.mjs';

const MODULE_SOURCE_BYTES = readFileSync(fileURLToPath(import.meta.url));
const MODULE_SOURCE_SHA256 = sha256Bytes(MODULE_SOURCE_BYTES);
const ARTIFACT_KEYS = Object.freeze([
  'schemaVersion',
  'caseId',
  'status',
  'dataOnly',
  'transformationPolicy',
  'extractorExecutedSolver',
  'extractorExecutedBenchmark',
  'engineeringResult',
  'probeManifest',
  'extractor',
  'metricCount',
  'values',
  'artifactHash',
]);
const VALUE_KEYS = Object.freeze([
  'ordinal',
  'probeId',
  'metricId',
  'sourcePointer',
  'extractionOperation',
  'value',
  'unit',
  'mandatory',
]);

/**
 * Extracts locked scalar values without evaluating code, transforming values,
 * or converting units. The exact input bytes (or canonical object snapshot)
 * and the locked probe contract are hash-bound into the returned artifact.
 */
export function extractActualValues(options = {}) {
  if (!plainRecord(options)) throw extractorError('P17_RESULT_EXTRACTOR_OPTIONS_INVALID', 'Extractor options must be an object.');
  assertNoAccessorProperties(options, 'resultExtractorOptions');
  const engineeringResultPath = requireRepoRelativePath(options.engineeringResultPath, 'engineeringResultPath');
  const engineering = snapshotEngineeringResult(options.engineeringResult);
  const probeManifest = snapshotLockedProbeManifest(options.probeManifest);
  assertUnique(probeManifest.probes, (row) => row.metricId, 'P17_EXTRACTOR_DUPLICATE_METRIC', 'metricId');
  assertUnique(probeManifest.probes, (row) => row.jsonPointer, 'P17_EXTRACTOR_DUPLICATE_POINTER', 'jsonPointer');

  const values = probeManifest.probes.map((probe, index) => {
    if (probe.extractionOperation !== P17_RESULT_EXTRACTION_OPERATION) {
      throw extractorError('P17_EXTRACTOR_OPERATION_FORBIDDEN', `${probe.metricId} requests a non-identity extraction operation.`);
    }
    const value = resolveJsonPointer(engineering.value, probe.jsonPointer, probe.metricId);
    if (typeof value !== 'number') {
      throw extractorError('P17_EXTRACTED_VALUE_NOT_NUMBER', `${probe.metricId} at ${displayPointer(probe.jsonPointer)} is not a number.`);
    }
    if (!Number.isFinite(value)) {
      throw extractorError('P17_EXTRACTED_VALUE_NONFINITE', `${probe.metricId} at ${displayPointer(probe.jsonPointer)} is NaN or Infinity.`);
    }
    return {
      ordinal: index + 1,
      probeId: probe.probeId,
      metricId: probe.metricId,
      sourcePointer: probe.jsonPointer,
      extractionOperation: P17_RESULT_EXTRACTION_OPERATION,
      value,
      unit: probe.unit,
      mandatory: probe.mandatory,
    };
  });

  const core = {
    schemaVersion: P17_EXTRACTED_ACTUAL_VALUES_SCHEMA_VERSION,
    caseId: probeManifest.caseId,
    status: 'EXTRACTED',
    dataOnly: true,
    transformationPolicy: 'NO_TRANSFORM_NO_UNIT_CONVERSION',
    extractorExecutedSolver: false,
    extractorExecutedBenchmark: false,
    engineeringResult: {
      sourcePath: engineeringResultPath,
      inputKind: engineering.inputKind,
      rawByteLength: engineering.bytes.byteLength,
      rawSha256: sha256Bytes(engineering.bytes),
    },
    probeManifest: {
      schemaVersion: probeManifest.schemaVersion,
      status: probeManifest.status,
      canonicalHash: sha256Canonical(probeManifest),
      approvalHash: probeManifest.approval.approvalHash,
    },
    extractor: {
      version: P17_RESULT_EXTRACTOR_VERSION,
      sourcePath: P17_RESULT_EXTRACTOR_SOURCE_PATH,
      sourceSha256: MODULE_SOURCE_SHA256,
    },
    metricCount: values.length,
    values,
  };
  return deepFreeze({ ...core, artifactHash: sha256Canonical(core) });
}

/**
 * Verifies self-hash and provenance bindings. Supplying the original sources
 * additionally replays every pointer as an identity-only extraction.
 */
export function verifyExtractedActualValuesArtifact(artifact, sources = {}) {
  const errors = [];
  try {
    if (!plainRecord(sources)) throw extractorError('P17_RESULT_EXTRACTOR_OPTIONS_INVALID', 'Verification sources must be an object.');
    assertNoAccessorProperties(sources, 'resultExtractorVerificationSources');
    assertDataOnlyJson(artifact, 'extractedActualValues');
    assertStrictJson(artifact, 'extractedActualValues');
    validateArtifactShape(artifact);
  } catch (error) {
    errors.push(error?.code || 'P17_EXTRACTED_ARTIFACT_SCHEMA_INVALID');
    return verificationResult(errors);
  }

  const core = Object.fromEntries(Object.entries(artifact).filter(([key]) => key !== 'artifactHash'));
  if (artifact.artifactHash !== sha256Canonical(core)) errors.push('P17_EXTRACTED_ARTIFACT_HASH_MISMATCH');
  if (artifact.extractor.sourcePath !== P17_RESULT_EXTRACTOR_SOURCE_PATH
    || artifact.extractor.version !== P17_RESULT_EXTRACTOR_VERSION
    || artifact.extractor.sourceSha256 !== MODULE_SOURCE_SHA256) {
    errors.push('P17_EXTRACTOR_SOURCE_BINDING_MISMATCH');
  }

  let engineering = null;
  let probeManifest = null;
  if (Object.hasOwn(sources, 'engineeringResult')) {
    try {
      engineering = snapshotEngineeringResult(sources.engineeringResult);
      if (artifact.engineeringResult.rawByteLength !== engineering.bytes.byteLength
        || artifact.engineeringResult.rawSha256 !== sha256Bytes(engineering.bytes)
        || artifact.engineeringResult.inputKind !== engineering.inputKind) {
        errors.push('P17_ENGINEERING_RESULT_BINDING_MISMATCH');
      }
    } catch (error) {
      errors.push(error?.code || 'P17_ENGINEERING_RESULT_JSON_INVALID');
    }
  }
  if (Object.hasOwn(sources, 'probeManifest')) {
    try {
      probeManifest = snapshotLockedProbeManifest(sources.probeManifest);
      if (artifact.caseId !== probeManifest.caseId
        || artifact.probeManifest.canonicalHash !== sha256Canonical(probeManifest)
        || artifact.probeManifest.approvalHash !== probeManifest.approval.approvalHash) {
        errors.push('P17_PROBE_MANIFEST_BINDING_MISMATCH');
      }
    } catch (error) {
      errors.push(error?.code || 'P17_PROBE_MANIFEST_INVALID');
    }
  }
  if (engineering && probeManifest) {
    try {
      const replay = probeManifest.probes.map((probe, index) => ({
        ordinal: index + 1,
        probeId: probe.probeId,
        metricId: probe.metricId,
        sourcePointer: probe.jsonPointer,
        extractionOperation: probe.extractionOperation,
        value: resolveJsonPointer(engineering.value, probe.jsonPointer, probe.metricId),
        unit: probe.unit,
        mandatory: probe.mandatory,
      }));
      for (const row of replay) {
        if (typeof row.value !== 'number') throw extractorError('P17_EXTRACTED_VALUE_NOT_NUMBER', `${row.metricId} is not numeric.`);
        if (!Number.isFinite(row.value)) throw extractorError('P17_EXTRACTED_VALUE_NONFINITE', `${row.metricId} is non-finite.`);
      }
      if (canonicalJson(replay) !== canonicalJson(artifact.values)) errors.push('P17_EXTRACTED_VALUES_REPLAY_MISMATCH');
    } catch (error) {
      errors.push(error?.code || 'P17_EXTRACTED_VALUES_REPLAY_FAILED');
    }
  }
  return verificationResult(errors);
}

export function assertExtractedActualValuesArtifact(artifact, sources = {}) {
  const verification = verifyExtractedActualValuesArtifact(artifact, sources);
  if (!verification.ok) {
    throw extractorError('P17_EXTRACTED_ACTUAL_VALUES_INVALID', verification.errors.join(', '));
  }
  return artifact;
}

function snapshotEngineeringResult(input) {
  let bytes;
  let inputKind;
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    bytes = Buffer.from(input);
    inputKind = 'RAW_UTF8_JSON_BYTES';
  } else {
    try {
      assertDataOnlyJson(input, 'engineeringResult');
      assertStrictJson(input, 'engineeringResult');
      bytes = Buffer.from(canonicalJson(input), 'utf8');
    } catch (error) {
      throw extractorError('P17_ENGINEERING_RESULT_JSON_INVALID', 'Engineering-result object must contain strict finite JSON values.', error);
    }
    inputKind = 'CANONICAL_JSON_OBJECT_SNAPSHOT';
  }
  if (!bytes.byteLength) throw extractorError('P17_ENGINEERING_RESULT_JSON_INVALID', 'Engineering-result JSON bytes are empty.');
  let text;
  let value;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(text);
    assertStrictJson(value, 'engineeringResult');
  } catch (error) {
    throw extractorError('P17_ENGINEERING_RESULT_JSON_INVALID', 'Engineering-result bytes must be valid strict UTF-8 JSON.', error);
  }
  return { bytes, value: deepFreeze(value), inputKind };
}

function snapshotLockedProbeManifest(input) {
  let manifest;
  try {
    assertDataOnlyJson(input, 'probeManifest');
    assertStrictJson(input, 'probeManifest');
    manifest = JSON.parse(canonicalJson(input));
    validateManifestDocument('probeManifest', manifest);
  } catch (error) {
    throw extractorError('P17_PROBE_MANIFEST_INVALID', 'Probe manifest failed schema or semantic validation.', error);
  }
  if (manifest.status !== 'LOCKED'
    || manifest.payloadAbsent
    || !manifest.releaseAllowed
    || manifest.signConventionStatus !== 'LOCKED'
    || manifest.approval.status !== 'APPROVED'
    || !manifest.approval.approvalHash
    || !manifest.probes.length) {
    throw extractorError('P17_PROBE_MANIFEST_NOT_LOCKED', 'Actual-value extraction requires a present, approved, LOCKED probe manifest.');
  }
  assertUnique(manifest.probes, (row) => row.metricId, 'P17_EXTRACTOR_DUPLICATE_METRIC', 'metricId');
  assertUnique(manifest.probes, (row) => row.jsonPointer, 'P17_EXTRACTOR_DUPLICATE_POINTER', 'jsonPointer');
  return deepFreeze(manifest);
}

function resolveJsonPointer(document, pointer, metricId) {
  try {
    assertRfc6901JsonPointer(pointer, `${metricId}.jsonPointer`);
  } catch (error) {
    throw extractorError('P17_JSON_POINTER_INVALID', `${metricId} has an invalid RFC 6901 pointer.`, error);
  }
  if (pointer === '') return document;
  let current = document;
  for (const encodedToken of pointer.slice(1).split('/')) {
    const token = encodedToken.replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(token)) {
        throw extractorError('P17_JSON_POINTER_ARRAY_INDEX_INVALID', `${metricId} pointer token ${JSON.stringify(token)} is not a canonical array index.`);
      }
      const index = Number(token);
      if (!Number.isSafeInteger(index) || index >= current.length || !Object.hasOwn(current, index)) {
        throw extractorError('P17_JSON_POINTER_MISSING', `${metricId} pointer does not resolve at array index ${token}.`);
      }
      current = current[index];
    } else if (plainRecord(current)) {
      if (!Object.hasOwn(current, token)) {
        throw extractorError('P17_JSON_POINTER_MISSING', `${metricId} pointer does not resolve at property ${JSON.stringify(token)}.`);
      }
      current = current[token];
    } else {
      throw extractorError('P17_JSON_POINTER_MISSING', `${metricId} pointer traverses through a scalar value.`);
    }
  }
  return current;
}

function validateArtifactShape(value) {
  if (!plainRecord(value) || !sameKeys(value, ARTIFACT_KEYS)) throw extractorError('P17_EXTRACTED_ARTIFACT_SCHEMA_INVALID', 'Extracted artifact has an invalid top-level shape.');
  if (value.schemaVersion !== P17_EXTRACTED_ACTUAL_VALUES_SCHEMA_VERSION
    || value.status !== 'EXTRACTED'
    || value.dataOnly !== true
    || value.transformationPolicy !== 'NO_TRANSFORM_NO_UNIT_CONVERSION'
    || value.extractorExecutedSolver !== false
    || value.extractorExecutedBenchmark !== false
    || typeof value.caseId !== 'string'
    || !value.caseId
    || !Number.isInteger(value.metricCount)
    || value.metricCount < 1
    || !Array.isArray(value.values)
    || value.metricCount !== value.values.length
    || !sha(value.artifactHash)) {
    throw extractorError('P17_EXTRACTED_ARTIFACT_SCHEMA_INVALID', 'Extracted artifact invariants are invalid.');
  }
  if (!plainRecord(value.engineeringResult)
    || !sameKeys(value.engineeringResult, ['sourcePath', 'inputKind', 'rawByteLength', 'rawSha256'])
    || !['RAW_UTF8_JSON_BYTES', 'CANONICAL_JSON_OBJECT_SNAPSHOT'].includes(value.engineeringResult.inputKind)
    || !Number.isInteger(value.engineeringResult.rawByteLength)
    || value.engineeringResult.rawByteLength < 1
    || !sha(value.engineeringResult.rawSha256)) {
    throw extractorError('P17_EXTRACTED_ARTIFACT_SCHEMA_INVALID', 'Engineering-result provenance is invalid.');
  }
  requireRepoRelativePath(value.engineeringResult.sourcePath, 'artifact.engineeringResult.sourcePath');
  if (!plainRecord(value.probeManifest)
    || !sameKeys(value.probeManifest, ['schemaVersion', 'status', 'canonicalHash', 'approvalHash'])
    || value.probeManifest.schemaVersion !== 'p17-probe-manifest-v1'
    || value.probeManifest.status !== 'LOCKED'
    || !sha(value.probeManifest.canonicalHash)
    || !sha(value.probeManifest.approvalHash)) {
    throw extractorError('P17_EXTRACTED_ARTIFACT_SCHEMA_INVALID', 'Probe-manifest provenance is invalid.');
  }
  if (!plainRecord(value.extractor)
    || !sameKeys(value.extractor, ['version', 'sourcePath', 'sourceSha256'])
    || !sha(value.extractor.sourceSha256)) {
    throw extractorError('P17_EXTRACTED_ARTIFACT_SCHEMA_INVALID', 'Extractor provenance is invalid.');
  }
  assertUnique(value.values, (row) => row.metricId, 'P17_EXTRACTOR_DUPLICATE_METRIC', 'metricId');
  assertUnique(value.values, (row) => row.probeId, 'P17_EXTRACTOR_DUPLICATE_PROBE', 'probeId');
  assertUnique(value.values, (row) => row.sourcePointer, 'P17_EXTRACTOR_DUPLICATE_POINTER', 'sourcePointer');
  value.values.forEach((row, index) => {
    if (!plainRecord(row)
      || !sameKeys(row, VALUE_KEYS)
      || row.ordinal !== index + 1
      || typeof row.probeId !== 'string'
      || !row.probeId
      || typeof row.metricId !== 'string'
      || !row.metricId
      || row.extractionOperation !== P17_RESULT_EXTRACTION_OPERATION
      || typeof row.value !== 'number'
      || !Number.isFinite(row.value)
      || typeof row.unit !== 'string'
      || !row.unit
      || typeof row.mandatory !== 'boolean') {
      throw extractorError('P17_EXTRACTED_ARTIFACT_SCHEMA_INVALID', `Extracted metric row ${index + 1} is invalid.`);
    }
    try {
      assertRfc6901JsonPointer(row.sourcePointer, `${row.metricId}.sourcePointer`);
    } catch (error) {
      throw extractorError('P17_EXTRACTED_ARTIFACT_SCHEMA_INVALID', `${row.metricId} source pointer is invalid.`, error);
    }
  });
}

function requireRepoRelativePath(value, label) {
  try {
    return assertRepoRelativePath(value, label);
  } catch (error) {
    throw extractorError('P17_ENGINEERING_RESULT_PATH_INVALID', `${label} must be a repository-relative path.`, error);
  }
}

function assertUnique(values, selector, code, label) {
  const keys = values.map(selector);
  if (new Set(keys).size !== keys.length) throw extractorError(code, `Locked probes contain duplicate ${label} values.`);
}

function verificationResult(errors) {
  const unique = [...new Set(errors)].sort();
  return Object.freeze({ ok: unique.length === 0, errors: Object.freeze(unique) });
}

function sameKeys(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function sha(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function displayPointer(pointer) {
  return pointer === '' ? '(document root)' : pointer;
}

function extractorError(code, message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code });
}

function assertDataOnlyJson(value, label, stack = new Set()) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return;
  if (typeof value !== 'object') throw extractorError('P17_DATA_ONLY_JSON_REQUIRED', `${label} contains a non-JSON value.`);
  if (stack.has(value)) throw extractorError('P17_DATA_ONLY_JSON_REQUIRED', `${label} contains a cycle.`);
  if (Object.getOwnPropertySymbols(value).length) throw extractorError('P17_DATA_ONLY_JSON_REQUIRED', `${label} contains symbol-keyed data.`);
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw extractorError('P17_DATA_ONLY_JSON_REQUIRED', `${label} must contain plain data objects only.`);
  }
  stack.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key === 'length' && Array.isArray(value)) continue;
    if (typeof descriptor.get === 'function' || typeof descriptor.set === 'function') {
      throw extractorError('P17_DATA_ONLY_JSON_REQUIRED', `${label}.${key} is an accessor; extraction never evaluates code.`);
    }
    if (descriptor.enumerable) assertDataOnlyJson(descriptor.value, `${label}.${key}`, stack);
  }
  stack.delete(value);
}

function assertNoAccessorProperties(value, label) {
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (typeof descriptor.get === 'function' || typeof descriptor.set === 'function') {
      throw extractorError('P17_DATA_ONLY_JSON_REQUIRED', `${label}.${key} is an accessor; extraction never evaluates code.`);
    }
  }
}

function plainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
