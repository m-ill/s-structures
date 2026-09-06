export const SOURCE_REGISTRY_VERSION = 'p7-m0-source-registry-v1';

export const PUBLICATION_STATUSES = new Set([
  'effective',
  'adopted-not-effective',
  'draft',
  'withdrawn',
]);

export const SOURCE_VERIFICATION_STATUSES = new Set([
  'unverified',
  'candidate',
  'verified',
]);

export function normalizeSourceRecord(record = {}) {
  const input = isRecord(record) ? record : {};
  return {
    id: clean(input.id),
    authority: clean(input.authority),
    code: clean(input.code),
    edition: clean(input.edition),
    amendmentsReviewed: uniqueStrings(input.amendmentsReviewed),
    publicationStatus: clean(input.publicationStatus) || 'draft',
    effectiveDate: nullableString(input.effectiveDate),
    verifiedAt: nullableString(input.verifiedAt),
    verificationStatus: clean(input.verificationStatus) || 'unverified',
    sourceUrls: uniqueStrings(input.sourceUrls),
    sourceHash: nullableString(input.sourceHash),
    note: nullableString(input.note),
  };
}

export function validateSourceRecord(record = {}) {
  const raw = isRecord(record) ? record : {};
  const normalized = normalizeSourceRecord(raw);
  const errors = [];
  const warnings = [];
  if (!isRecord(record)) errors.push('record');
  const rawPublicationStatus = clean(raw.publicationStatus);
  const rawVerificationStatus = clean(raw.verificationStatus);
  for (const key of ['id', 'authority', 'code', 'edition']) {
    if (!normalized[key]) errors.push(key);
    if (raw[key] != null && typeof raw[key] !== 'string') errors.push(`${key}:type`);
  }
  if (raw.publicationStatus != null && typeof raw.publicationStatus !== 'string') errors.push('publicationStatus:type');
  else if (rawPublicationStatus && !PUBLICATION_STATUSES.has(rawPublicationStatus)) errors.push('publicationStatus');
  if (raw.verificationStatus != null && typeof raw.verificationStatus !== 'string') errors.push('verificationStatus:type');
  else if (rawVerificationStatus && !SOURCE_VERIFICATION_STATUSES.has(rawVerificationStatus)) errors.push('verificationStatus');
  for (const key of ['amendmentsReviewed', 'sourceUrls']) {
    if (raw[key] != null && (!Array.isArray(raw[key]) || raw[key].some((item) => typeof item !== 'string'))) errors.push(`${key}:type`);
  }
  for (const key of ['effectiveDate', 'verifiedAt', 'sourceHash', 'note']) {
    if (raw[key] != null && typeof raw[key] !== 'string') errors.push(`${key}:type`);
  }
  if (!normalized.sourceUrls.length) warnings.push('sourceUrls');
  if (normalized.verificationStatus === 'verified' && !normalized.sourceHash) errors.push('sourceHash');
  if (normalized.publicationStatus === 'effective' && !normalized.effectiveDate) warnings.push('effectiveDate');
  if (normalized.verificationStatus === 'verified' && !normalized.verifiedAt) warnings.push('verifiedAt');
  return { ok: errors.length === 0, errors, warnings, normalized };
}

export function validateSourceRegistry(records = []) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(records)) return { ok: false, errors: ['registry:not-array'], warnings };
  const seen = new Set();
  for (const record of Array.isArray(records) ? records : []) {
    const id = clean(record?.id);
    if (id && seen.has(id)) errors.push(`duplicate-id:${id}`);
    if (id) seen.add(id);
    const result = validateSourceRecord(record);
    errors.push(...result.errors.map((key) => `${id || '?'}:${key}`));
    warnings.push(...result.warnings.map((key) => `${id || '?'}:${key}`));
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function normalizeSourceRegistry(records = []) {
  return (Array.isArray(records) ? records : []).map(normalizeSourceRecord);
}

export function sourceCanAutoApply(record = {}) {
  const checked = validateSourceRecord(record);
  const source = checked.normalized;
  return source.publicationStatus === 'effective'
    && source.verificationStatus === 'verified'
    && checked.ok
    && sourceEvidenceIsComplete(source);
}

export function sourceEvidenceIsComplete(record = {}) {
  const checked = validateSourceRecord(record);
  const source = checked.normalized;
  return checked.ok
    && ['id', 'authority', 'code', 'edition'].every((key) => Boolean(source[key]))
    && source.amendmentsReviewed.length > 0
    && source.sourceUrls.length > 0
    && Boolean(source.sourceHash)
    && Boolean(source.effectiveDate)
    && Boolean(source.verifiedAt);
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function nullableString(value) {
  const text = clean(value);
  return text || null;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean))];
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
