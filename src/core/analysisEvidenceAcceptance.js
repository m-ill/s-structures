import { stableHash, stableStringify } from './stableHash.js';

export const ANALYSIS_EVIDENCE_ACCEPTANCE_VERSION = 'p15-analysis-evidence-acceptance-v1';
export const ANALYSIS_EVIDENCE_ACCEPTANCE_POLICY = 'verified-analysis-result-v1';
export const ANALYSIS_EVIDENCE_TRUSTED_PRODUCER = Object.freeze({
  id: 's-structures-independent-comparison-adapter',
  contractVersion: 'p15-independent-comparison-adapter-v1',
});

const ACCEPTANCE_KEYS = Object.freeze([
  'version',
  'policy',
  'producer',
  'decision',
  'subject',
  'assertions',
  'sourceEvidenceHash',
  'reasonCodes',
  'integrityHash',
]);

/**
 * Creates the generic product-side acceptance envelope consumed by analysis run
 * records. Producers remain responsible for adapting and validating their own
 * evidence format; this contract owns the fail-closed production boundary.
 */
export function createAnalysisEvidenceAcceptance({
  producer = ANALYSIS_EVIDENCE_TRUSTED_PRODUCER,
  subject = {},
  assertions = [],
  sourceEvidence = null,
  accepted = false,
  reasonCodes = [],
} = {}) {
  const normalizedProducer = normalizeProducer(producer);
  const normalizedSubject = normalizeSubject(subject);
  const normalizedAssertions = normalizeAssertions(assertions);
  const genericErrors = genericAssertionErrors(normalizedAssertions);
  const trustedProducer = producerIsTrusted(normalizedProducer);
  const decision = accepted === true && trustedProducer && genericErrors.length === 0
    ? 'ACCEPTED'
    : 'REJECTED';
  const normalizedReasons = uniqueSorted([
    ...reasonCodes,
    ...(trustedProducer ? [] : ['UNTRUSTED_EVIDENCE_PRODUCER']),
    ...genericErrors,
    ...(accepted === true ? [] : ['EVIDENCE_PRODUCER_REJECTED']),
  ]);
  const core = {
    version: ANALYSIS_EVIDENCE_ACCEPTANCE_VERSION,
    policy: ANALYSIS_EVIDENCE_ACCEPTANCE_POLICY,
    producer: normalizedProducer,
    decision,
    subject: normalizedSubject,
    assertions: normalizedAssertions,
    sourceEvidenceHash: stableHash(withoutAcceptance(sourceEvidence)),
    reasonCodes: decision === 'ACCEPTED' ? [] : normalizedReasons,
  };
  return deepFreeze({ ...core, integrityHash: stableHash(core) });
}

export function validateAnalysisEvidenceAcceptance(evidence, expectedSubject = {}) {
  const errors = [];
  const acceptance = evidence?.acceptance;
  if (!plainRecord(evidence)) errors.push('evidence:not-object');
  if (!plainRecord(acceptance)) return fail([...errors, 'acceptance:missing']);
  if (!exactKeys(acceptance, ACCEPTANCE_KEYS)) errors.push('acceptance:fields');
  if (acceptance.version !== ANALYSIS_EVIDENCE_ACCEPTANCE_VERSION) errors.push('acceptance:version');
  if (acceptance.policy !== ANALYSIS_EVIDENCE_ACCEPTANCE_POLICY) errors.push('acceptance:policy');

  let producer;
  let subject;
  let expected;
  let assertions;
  try {
    producer = normalizeProducer(acceptance.producer);
    subject = normalizeSubject(acceptance.subject);
    expected = normalizeSubject(expectedSubject);
    assertions = normalizeAssertions(acceptance.assertions);
  } catch (error) {
    return fail([...errors, `acceptance:schema:${error.message}`]);
  }

  if (!producerIsTrusted(producer)) errors.push('acceptance:producer');
  if (stableStringify(acceptance.producer) !== stableStringify(producer)) errors.push('acceptance:producer-contract');
  if (stableStringify(acceptance.subject) !== stableStringify(subject)) errors.push('acceptance:subject-contract');
  if (stableStringify(subject) !== stableStringify(expected)) errors.push('acceptance:subject-binding');
  if (stableStringify(acceptance.assertions) !== stableStringify(assertions)) errors.push('acceptance:assertion-contract');
  errors.push(...genericAssertionErrors(assertions).map((error) => `acceptance:${error}`));
  if (acceptance.decision !== 'ACCEPTED') errors.push('acceptance:decision');
  if (!Array.isArray(acceptance.reasonCodes) || acceptance.reasonCodes.length !== 0) errors.push('acceptance:reason-codes');
  if (acceptance.sourceEvidenceHash !== stableHash(withoutAcceptance(evidence))) errors.push('acceptance:source-evidence-hash');

  const core = {
    version: acceptance.version,
    policy: acceptance.policy,
    producer: acceptance.producer,
    decision: acceptance.decision,
    subject: acceptance.subject,
    assertions: acceptance.assertions,
    sourceEvidenceHash: acceptance.sourceEvidenceHash,
    reasonCodes: acceptance.reasonCodes,
  };
  if (acceptance.integrityHash !== stableHash(core)) errors.push('acceptance:integrity-hash');
  return errors.length ? fail(errors) : deepFreeze({ ok: true, errors: [] });
}

export function buildAnalysisEvidenceSubject({
  modelHash = null,
  caseId = null,
  caseHash = null,
  domainHash = null,
  engine = null,
} = {}) {
  return deepFreeze(normalizeSubject({
    modelHash,
    caseId,
    caseHash,
    domainHash,
    engineId: engine?.id ?? null,
    engineVersion: engine?.version ?? null,
  }));
}

function normalizeProducer(value = {}) {
  return {
    id: requiredText(value.id, 'producer.id'),
    contractVersion: requiredText(value.contractVersion, 'producer.contractVersion'),
  };
}

function normalizeSubject(value = {}) {
  return {
    modelHash: requiredText(value.modelHash, 'subject.modelHash'),
    caseId: requiredText(value.caseId, 'subject.caseId'),
    caseHash: requiredText(value.caseHash, 'subject.caseHash'),
    domainHash: requiredText(value.domainHash, 'subject.domainHash'),
    engineId: optionalText(value.engineId),
    engineVersion: optionalText(value.engineVersion),
  };
}

function normalizeAssertions(values = []) {
  if (!Array.isArray(values)) throw new TypeError('assertions must be an array.');
  const rows = values.map((value, index) => ({
    id: requiredText(value?.id, `assertions[${index}].id`),
    status: requiredText(value?.status, `assertions[${index}].status`).toUpperCase(),
    referenceSource: requiredText(value?.referenceSource, `assertions[${index}].referenceSource`),
    solverVersion: requiredText(value?.solverVersion, `assertions[${index}].solverVersion`),
    relativeError: finiteNumber(value?.relativeError, `assertions[${index}].relativeError`),
    tolerance: finiteNumber(value?.tolerance, `assertions[${index}].tolerance`),
  })).sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error('assertions contain duplicate ids.');
  return rows;
}

function genericAssertionErrors(assertions) {
  const errors = [];
  if (!assertions.length) errors.push('EVIDENCE_ASSERTIONS_REQUIRED');
  for (const assertion of assertions) {
    if (assertion.status !== 'PASS') errors.push(`EVIDENCE_ASSERTION_NOT_PASS:${assertion.id}`);
    if (assertion.solverVersion === 'unknown') errors.push(`EVIDENCE_SOLVER_UNKNOWN:${assertion.id}`);
    if (assertion.relativeError < 0) errors.push(`EVIDENCE_ERROR_NEGATIVE:${assertion.id}`);
    if (!(assertion.tolerance > 0)) errors.push(`EVIDENCE_TOLERANCE_INVALID:${assertion.id}`);
    if (assertion.relativeError > assertion.tolerance) errors.push(`EVIDENCE_TOLERANCE_EXCEEDED:${assertion.id}`);
  }
  return uniqueSorted(errors);
}

function producerIsTrusted(producer) {
  return producer.id === ANALYSIS_EVIDENCE_TRUSTED_PRODUCER.id
    && producer.contractVersion === ANALYSIS_EVIDENCE_TRUSTED_PRODUCER.contractVersion;
}

function withoutAcceptance(evidence) {
  if (!plainRecord(evidence)) return evidence;
  const source = clone(evidence);
  delete source.acceptance;
  return source;
}

function exactKeys(value, expected) {
  if (!plainRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length && keys.every((key, index) => key === sortedExpected[index]);
}

function requiredText(value, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new TypeError(`${label} must be a non-empty string.`);
  return text;
}

function optionalText(value) {
  if (value == null) return null;
  return requiredText(value, 'optional text');
}

function finiteNumber(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new TypeError(`${label} must be finite.`);
  return numeric;
}

function uniqueSorted(values) {
  return [...new Set(Array.from(values || [], String).filter(Boolean))].sort();
}

function plainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fail(errors) {
  return deepFreeze({ ok: false, errors: uniqueSorted(errors) });
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
