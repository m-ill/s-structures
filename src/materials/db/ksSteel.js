export const KS_STEEL_DB_VERSION = 'p7-m1-ks-steel-2026-07-10-v1';

const ELASTIC_STEEL = Object.freeze({
  E: 205000,
  G: 79000,
  nu: 0.3,
  rho: 7.85,
  alpha: 1.2e-5,
});

const SS275_RANGES = Object.freeze([
  range('T0-16', 0, 16, 275, 410),
  range('T16-40', 16, 40, 265, 410),
  range('T40-75', 40, 75, 245, 410),
  range('T75-100', 75, 100, 245, 410),
]);

const SM355_RANGES = Object.freeze([
  range('T0-16', 0, 16, 355, 490),
  range('T16-40', 16, 40, 345, 490),
  range('T40-75', 40, 75, 335, 490),
  range('T75-100', 75, 100, 325, 490),
]);

const STANDARD_DEFINITIONS = Object.freeze([
  Object.freeze({
    designation: 'SS275',
    suffix: null,
    standardCode: 'KS D 3503',
    edition: '2026-06-30',
    standardTitle: 'General structural rolled steel',
    productForm: 'hot-rolled-structural-steel',
    productForms: Object.freeze(['plate', 'sheet', 'strip', 'section', 'flat-bar', 'bar']),
    ranges: SS275_RANGES,
    legacyAliases: Object.freeze([legacyCandidate('SS400')]),
    sourceUrl: 'https://standard.go.kr/KSCI/standardIntro/getStandardSearchView.do?ksNo=KSD3503&tmprKsNo=KSD3503',
  }),
  ...['A', 'B', 'C'].map((suffix) => Object.freeze({
    designation: `SM355${suffix}`,
    suffix,
    standardCode: 'KS D 3515',
    edition: '2018-12-27',
    confirmedOn: '2023-06-16',
    standardTitle: 'Rolled steels for welded structures',
    productForm: 'hot-rolled-weldable-structural-steel',
    productForms: Object.freeze(['plate', 'sheet', 'strip', 'section', 'flat-bar']),
    ranges: SM355_RANGES,
    legacyAliases: Object.freeze([legacyCandidate(`SM490${suffix}`)]),
    sourceUrl: 'https://standard.go.kr/KSCI/standardIntro/getStandardSearchView.do?ksNo=KSD3515&tmprKsNo=KSD3515',
  })),
]);

export const KS_STEEL_MATERIALS = Object.freeze(
  STANDARD_DEFINITIONS.flatMap((definition) => definition.ranges.map((properties, index) => standardRecord(definition, properties, index))),
);

export const KS_STEEL_LEGACY_ALIASES = Object.freeze([
  aliasRecord('SS400', 'KS D 3503', ['SS275'], ['thicknessMm', 'productForm']),
  aliasRecord('SM490', 'KS D 3515', ['SM355A', 'SM355B', 'SM355C'], ['suffix', 'thicknessMm', 'productForm']),
  aliasRecord('SM490A', 'KS D 3515', ['SM355A'], ['thicknessMm', 'productForm']),
  aliasRecord('SM490B', 'KS D 3515', ['SM355B'], ['thicknessMm', 'productForm']),
  aliasRecord('SM490C', 'KS D 3515', ['SM355C'], ['thicknessMm', 'productForm']),
]);

export function getKsSteelMaterial(id) {
  const key = String(id || '').trim().toUpperCase();
  return KS_STEEL_MATERIALS.find((record) => record.id.toUpperCase() === key) || null;
}

export function listKsSteelMaterials(filters = {}) {
  const designation = normalizeDesignation(filters.designation);
  const suffix = normalizeDesignation(filters.suffix);
  const thicknessMm = finiteNumber(filters.thicknessMm);
  const productForm = String(filters.productForm || '').trim().toLowerCase();
  return KS_STEEL_MATERIALS.filter((record) => {
    if (designation && normalizeDesignation(record.designation) !== designation) return false;
    if (suffix && normalizeDesignation(record.suffix) !== suffix) return false;
    if (thicknessMm != null && !containsThickness(record.thicknessRange, thicknessMm)) return false;
    if (productForm && !record.productForms.includes(productForm)) return false;
    return true;
  });
}

export function findKsSteelMaterial(designation, thicknessOrOptions = {}) {
  const options = typeof thicknessOrOptions === 'number'
    ? { thicknessMm: thicknessOrOptions }
    : { ...(thicknessOrOptions || {}) };
  const thicknessMm = finiteNumber(options.thicknessMm);
  if (!(thicknessMm > 0)) return null;
  const normalized = normalizeDesignation(designation);
  const fullDesignation = normalized === 'SM355' && options.suffix
    ? `${normalized}${normalizeDesignation(options.suffix)}`
    : normalized;
  return listKsSteelMaterials({ ...options, designation: fullDesignation, thicknessMm })[0] || null;
}

export function findKsSteelLegacyAlias(alias) {
  const key = normalizeDesignation(alias);
  return KS_STEEL_LEGACY_ALIASES.find((record) => normalizeDesignation(record.alias) === key) || null;
}

export function resolveKsSteelLegacyAlias(alias) {
  return findKsSteelLegacyAlias(alias);
}

export function isVerifiedCurrentKsSteelMaterial(record = {}) {
  return record.status === 'current'
    && record.source?.verificationStatus === 'verified-current'
    && /^KS D \d+$/u.test(String(record.standardCode || ''));
}

function standardRecord(definition, properties, index) {
  const id = index === 0 ? definition.designation : `${definition.designation}-${properties.key}`;
  const thicknessRange = Object.freeze({
    unit: 'mm',
    minExclusive: properties.minExclusive,
    maxInclusive: properties.maxInclusive,
  });
  const mechanicalProperties = Object.freeze({
    unit: 'MPa',
    Fy: properties.Fy,
    Fu: properties.Fu,
    basis: 'specified-minimum',
  });
  return Object.freeze({
    id,
    version: 1,
    name: `${definition.designation} (${thicknessLabel(thicknessRange)})`,
    kind: 'steel',
    status: 'current',
    legacy: false,
    standardCode: definition.standardCode,
    edition: definition.edition,
    designation: definition.designation,
    variant: properties.key,
    suffix: definition.suffix,
    productForm: definition.productForm,
    productForms: definition.productForms,
    gradeBasis: 'yield-strength-by-product-thickness',
    thicknessRange,
    mechanicalProperties,
    legacyAliases: definition.legacyAliases,
    elastic: ELASTIC_STEEL,
    strength: Object.freeze({
      steel: Object.freeze({
        Fy: properties.Fy,
        Fu: properties.Fu,
        thicknessRange,
        gradeBasis: 'specified-minimum',
      }),
    }),
    source: Object.freeze({
      scope: 'builtin',
      db: KS_STEEL_DB_VERSION,
      standard: definition.standardCode,
      standardCode: definition.standardCode,
      standardTitle: definition.standardTitle,
      edition: definition.edition,
      confirmedOn: definition.confirmedOn || null,
      publicationStatus: 'effective',
      verificationStatus: 'verified-current',
      verifiedOn: '2026-07-10',
      sourceUrls: Object.freeze([definition.sourceUrl]),
    }),
  });
}

function range(key, minExclusive, maxInclusive, Fy, Fu) {
  return Object.freeze({ key, minExclusive, maxInclusive, Fy, Fu });
}

function legacyCandidate(designation) {
  return Object.freeze({
    designation,
    purpose: 'search-and-migration-candidate',
    equivalent: false,
  });
}

function aliasRecord(alias, standardCode, candidateDesignations, requires) {
  return Object.freeze({
    alias,
    status: 'legacy-designation',
    standardCode,
    candidateDesignations: Object.freeze([...candidateDesignations]),
    requires: Object.freeze([...requires]),
    equivalent: false,
    automaticMigration: false,
    resolution: 'migration-candidate-only',
  });
}

function containsThickness(rangeValue, thicknessMm) {
  return thicknessMm > Number(rangeValue.minExclusive)
    && (rangeValue.maxInclusive == null || thicknessMm <= Number(rangeValue.maxInclusive));
}

function thicknessLabel(rangeValue) {
  if (Number(rangeValue.minExclusive) === 0) return `t <= ${rangeValue.maxInclusive} mm`;
  return `${rangeValue.minExclusive} mm < t <= ${rangeValue.maxInclusive} mm`;
}

function normalizeDesignation(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/gu, '');
}

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
