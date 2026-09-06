import {
  cloneStrictJson,
  immutable,
  optionalText,
  requiredFinite,
  requiredHash,
  requiredText,
  strictCanonicalHash,
} from './strictCanonical.js';

export const PHASE15_REFERENCE_LEVELS = Object.freeze(['R1', 'R2', 'R3', 'R4', 'R5']);
export const PHASE15_REFERENCE_MANIFEST_VERSION = 'p15-reference-manifest-v1';

export function createPhase15ReferenceManifest(input = {}) {
  const caseId = requiredText(input.caseId, 'caseId').toUpperCase();
  const source = normalizeSource(input.source, caseId);
  const definition = normalizeDefinition(input.definition);
  const values = normalizeValues(input.values);
  const core = {
    version: PHASE15_REFERENCE_MANIFEST_VERSION,
    caseId,
    specVersion: requiredText(input.specVersion, 'specVersion'),
    claimScope: requiredText(input.claimScope, 'claimScope'),
    source,
    definition,
    values,
    frozenBeforeRun: input.frozenBeforeRun === true,
    approvedBy: optionalText(input.approvedBy),
    approvalHash: input.approvalHash == null ? null : requiredHash(input.approvalHash, 'approvalHash'),
  };
  return immutable({ ...core, referenceHash: strictCanonicalHash(core, 'reference manifest') });
}

export function isApprovedPhase15ReferenceManifest(manifest = {}) {
  try {
    const rebuilt = createPhase15ReferenceManifest(manifest);
    return manifest.version === PHASE15_REFERENCE_MANIFEST_VERSION
      && manifest.frozenBeforeRun === true
      && Boolean(manifest.approvedBy)
      && /^[0-9a-f]{64}$/i.test(manifest.approvalHash || '')
      && strictCanonicalHash(manifest, 'reference manifest') === strictCanonicalHash(rebuilt, 'rebuilt reference manifest');
  } catch {
    return false;
  }
}

function normalizeSource(value, caseId) {
  const source = requiredObject(value, 'source');
  const level = requiredText(source.level, 'source.level').toUpperCase();
  if (!PHASE15_REFERENCE_LEVELS.includes(level)) throw new Error(`source.level must be one of ${PHASE15_REFERENCE_LEVELS.join(', ')}.`);
  const independentFromProduction = source.independentFromProduction === true;
  if (level !== 'R5' && !independentFromProduction) {
    throw new Error(`${caseId} ${level} reference must be independent from production code.`);
  }
  return {
    level,
    title: requiredText(source.title, 'source.title'),
    revision: requiredText(source.revision, 'source.revision'),
    locator: requiredText(source.locator, 'source.locator'),
    page: requiredText(source.page, 'source.page'),
    fileHash: requiredHash(source.fileHash, 'source.fileHash'),
    licenseNote: requiredText(source.licenseNote, 'source.licenseNote'),
    displayedPrecision: requiredText(source.displayedPrecision, 'source.displayedPrecision'),
    independentFromProduction,
  };
}

function normalizeDefinition(value) {
  const definition = requiredObject(value, 'definition');
  const result = {};
  for (const field of ['geometry', 'materials', 'supports', 'loads', 'mass', 'mesh']) {
    result[field] = cloneStrictJson(requiredObject(definition[field], `definition.${field}`), `definition.${field}`);
  }
  return result;
}

function normalizeValues(values) {
  const normalized = Array.from(values || [], (value, index) => {
    const row = requiredObject(value, `values[${index}]`);
    return {
      id: requiredText(row.id, `values[${index}].id`),
      value: requiredFinite(row.value, `values[${index}].value`),
      unit: requiredText(row.unit, `values[${index}].unit`),
      resultKind: requiredText(row.resultKind, `values[${index}].resultKind`),
      displayedPrecision: requiredText(row.displayedPrecision, `values[${index}].displayedPrecision`),
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  if (!normalized.length) throw new Error('Reference manifest requires at least one value.');
  assertUniqueIds(normalized, 'reference values');
  return normalized;
}

function requiredObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) {
    throw new TypeError(`${label} must be a non-empty object.`);
  }
  return value;
}

function assertUniqueIds(rows, label) {
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error(`${label} contain duplicate ids.`);
}
