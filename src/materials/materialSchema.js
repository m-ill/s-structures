import {validateSteelTestEvidence,assessSteelTestEvidence} from './steelTestEvidence.js';
import {validateConcreteCreep} from './concreteCreep.js';
export const MATERIAL_SCHEMA_VERSION = 'p25-material-schema-v2-steel-test-evidence';

export const STANDARD_MATERIAL_REQUIRED_FIELDS = Object.freeze([
  'standardCode',
  'edition',
  'designation',
  'productForm',
  'gradeBasis',
  'thicknessRange',
]);

export function validateMaterialRecord(record = {}) {
  const normalized = normalizeMaterialRecord(record);
  const errors = [];
  const warnings = [];
  errors.push(...validateSteelTestEvidence(normalized));
  if(record.creep!=null)errors.push(...validateConcreteCreep(normalized));
  if(record.inputContract!=null&&record.inputContract!=='p24-material-v1')errors.push('inputContract');
  if (!normalized.id) errors.push('id');
  if (!Number.isInteger(Number(normalized.version)) || Number(normalized.version) < 1) errors.push('version');
  for (const key of ['E', 'G']) if (!positive(normalized.elastic?.[key])) errors.push(`elastic.${key}`);
  if (!['steel', 'concrete', 'timber', 'masonry', 'custom'].includes(normalized.kind)) errors.push('kind');
  errors.push(...validateStrength(normalized.kind, normalized.strength));
  errors.push(...validateStandardMaterialMetadata(normalized));
  warnings.push(...validateSourceTrace(normalized.kind, normalized));
  if(normalized.kind==='masonry'&&!positive(normalized.strength?.masonry?.fm))errors.push('strength.masonry.fm');
  if(normalized.inputContract==='p24-material-v1') errors.push(...validatePracticalMaterial(normalized));
  else if(normalized.kind==='timber')warnings.push('legacy-timber-design-properties-unverified');
  if (normalized.nonlinear && !validateBackbone(normalized.nonlinear.backbone || [])) errors.push('nonlinear.backbone');
  return { ok: errors.length === 0, errors: unique(errors), warnings: unique(warnings), normalized };
}

export function normalizeMaterialRecord(record = {}) {
  const elastic = record.elastic || record;
  const kind = record.kind || inferKind(record);
  const strength = normalizeStrength(record, kind);
  return {
    ...record,
    ...(record.testEvidence!=null||record.testEvidenceAssessment!==undefined?{testEvidenceAssessment:assessSteelTestEvidence({...record,kind,strength})}:{}),
    kind,
    elastic: {
      ...(record.elastic || {}),
      E: elastic.E ?? null,
      G: elastic.G ?? null,
      nu: elastic.nu ?? record.nu ?? null,
      rho: elastic.rho ?? elastic.density ?? record.rho ?? record.density ?? null,
      alpha: elastic.alpha ?? record.alpha ?? null,
    },
    strength,
    nonlinear: record.inputContract==='p24-material-v1' ? (record.nonlinear??null) : record.nonlinear || defaultNonlinear(kind, strength, {
      E: elastic.E ?? null,
    }),
  };
}

export function isStandardMaterialRecord(record = {}) {
  return nonEmpty(record.standardCode || record.source?.standardCode || record.source?.standard);
}

export function isVerifiedCurrentMaterialRecord(record = {}) {
  return isStandardMaterialRecord(record)
    && record.status === 'current'
    && record.source?.verificationStatus === 'verified-current';
}

export function validateStandardMaterialMetadata(record = {}) {
  if (!isStandardMaterialRecord(record)) return [];
  const errors = [];
  for (const key of STANDARD_MATERIAL_REQUIRED_FIELDS) {
    if (key === 'thicknessRange') continue;
    if (!nonEmpty(record[key])) errors.push(key);
  }
  if (!validThicknessRange(record.thicknessRange)) errors.push('thicknessRange');
  if (!positive(record.elastic?.rho ?? record.density)) errors.push('elastic.rho');
  const mechanical = record.mechanicalProperties;
  if (!mechanical || !positive(mechanical.Fy)) errors.push('mechanicalProperties.Fy');
  if (!mechanical || !positive(mechanical.Fu)) errors.push('mechanicalProperties.Fu');
  if (mechanical && positive(mechanical.Fy) && positive(record.strength?.steel?.Fy)
    && Number(mechanical.Fy) !== Number(record.strength.steel.Fy)) {
    errors.push('mechanicalProperties.Fy-mismatch');
  }
  if (mechanical && positive(mechanical.Fu) && positive(record.strength?.steel?.Fu)
    && Number(mechanical.Fu) !== Number(record.strength.steel.Fu)) {
    errors.push('mechanicalProperties.Fu-mismatch');
  }
  if (record.status === 'current' && record.source?.verificationStatus !== 'verified-current') {
    errors.push('source.verificationStatus');
  }
  return errors;
}

export const standardMaterialMetadataErrors = validateStandardMaterialMetadata;

function validateBackbone(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return false;
  let lastX = -Infinity;
  for (const row of rows) {
    const x = row.strain ?? row.rotation;
    const y = row.stress ?? row.moment;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x <= lastX) return false;
    lastX = x;
  }
  return true;
}

function validateStrength(kind, strength = {}) {
  const errors = [];
  if (kind === 'steel') {
    if (!positive(strength.steel?.Fy)) errors.push('strength.steel.Fy');
    if (!positive(strength.steel?.Fu)) errors.push('strength.steel.Fu');
  }
  if (kind === 'concrete' && !positive(strength.concrete?.fck)) errors.push('strength.concrete.fck');
  return errors;
}

function validateSourceTrace(kind, record) {
  if (kind !== 'custom') return [];
  return record.source?.note ? [] : ['source.note-missing-for-custom-material'];
}

function normalizeStrength(record, kind) {
  const strength = { ...(record.strength || {}) };
  const mechanical = record.mechanicalProperties || {};
  if (kind === 'steel') {
    strength.steel = {
      ...(strength.steel || {}),
      Fy: strength.steel?.Fy ?? mechanical.Fy ?? record.Fy ?? record.fy ?? null,
      Fu: strength.steel?.Fu ?? mechanical.Fu ?? record.Fu ?? record.fu ?? null,
    };
  }
  if (kind === 'concrete') {
    strength.concrete = {
      ...(strength.concrete || {}),
      fck: strength.concrete?.fck ?? mechanical.fck ?? record.fck ?? record.Fck ?? record.Fy ?? null,
      fy_rebar: strength.concrete?.fy_rebar ?? record.fy_rebar ?? record.fyRebar ?? null,
    };
  }
  return strength;
}

function defaultNonlinear(kind, strength, elastic = {}) {
  const fy = strength?.steel?.Fy ?? strength?.concrete?.fck;
  if (!positive(fy)) return null;
  const yieldStrain = kind === 'steel' && positive(elastic.E)
    ? Number(fy) / Number(elastic.E)
    : 0.002;
  return {
    model: 'bilinear',
    hardeningRatio: 0.02,
    ultimateDuctility: 9,
    backbone: [{ strain: 0, stress: 0 }, { strain: yieldStrain, stress: Number(fy) }],
  };
}

function inferKind(record) {
  const text = `${record.id || ''} ${record.name || ''} ${record.designation || ''}`.toLowerCase();
  if (text.includes('concrete') || text.includes('fc')) return 'concrete';
  if (text.includes('wood') || text.includes('timber')) return 'timber';
  if (record.strength?.concrete || record.fck != null || record.Fck != null) return 'concrete';
  if (record.strength?.steel || record.Fy != null || record.fy != null || record.mechanicalProperties?.Fy != null) return 'steel';
  return 'custom';
}

function validatePracticalMaterial(record) {
  const errors=[],spec=record.specification||{},elastic=record.elastic||{};
  if(!['steel','concrete','timber','masonry'].includes(record.kind))errors.push('kind');
  for(const key of ['reference','edition','note','product','grade'])if(!nonEmpty(spec[key]))errors.push(`specification.${key}`);
  if(!['assumed','specified'].includes(spec.basisStatus))errors.push('specification.basisStatus');
  if(!positive(elastic.rho))errors.push('elastic.rho');
  if(typeof elastic.nu!=='number'||!Number.isFinite(elastic.nu)||elastic.nu<=-1||elastic.nu>=0.5)errors.push('elastic.nu');
  if(record.kind==='steel') {
    if(record.strength.steel.Fu<record.strength.steel.Fy)errors.push('strength.steel.Fu-below-Fy');
    if(spec.product!=='rebar'&&!positive(spec.thicknessMm)||spec.thicknessMm!==undefined&&!positive(spec.thicknessMm))errors.push('specification.thicknessMm');
  }
  if(record.kind==='timber') {
    if(record.elasticity!=='frame-longitudinal')errors.push('elasticity');
    for(const key of ['fb','ft0','fc0','fc90','fv'])if(!positive(record.strength?.timber?.[key]))errors.push(`strength.timber.${key}`);
    if(!positive(elastic.E90))errors.push('elastic.E90');
    for(const key of ['species','serviceClass','durationClass'])if(!nonEmpty(spec[key]))errors.push(`specification.${key}`);
    if(typeof spec.moisturePercent!=='number'||!Number.isFinite(spec.moisturePercent)||spec.moisturePercent<0||spec.moisturePercent>100)errors.push('specification.moisturePercent');
  } else {
    if(record.elasticity!=='isotropic')errors.push('elasticity');
    const expected=elastic.E/(2*(1+elastic.nu));
    // 0.5% accommodates explicitly rounded input moduli; values are not overwritten.
    if(!Number.isFinite(expected)||Math.abs(elastic.G-expected)>0.005*Math.abs(expected))errors.push('elastic.G-nu-inconsistent');
  }
  if(record.kind==='masonry') {
    for(const key of ['unitType','mortar','grout'])if(!nonEmpty(spec[key]))errors.push(`specification.${key}`);
    if(typeof spec.reinforced!=='boolean')errors.push('specification.reinforced');
  }
  return errors;
}

function validThicknessRange(value) {
  if (!value || value.unit !== 'mm') return false;
  const lower = Number(value.minExclusive ?? value.minInclusive);
  const upper = Number(value.maxInclusive ?? value.maxExclusive);
  return Number.isFinite(lower) && lower >= 0 && Number.isFinite(upper) && upper > lower;
}

function nonEmpty(value) {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === 'string' ? value.trim().length > 0 : value != null;
}

function positive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function unique(values) {
  return [...new Set(values)];
}
