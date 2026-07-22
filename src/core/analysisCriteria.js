export const ANALYSIS_CRITERIA_VERSION = 'p6-m0-analysis-criteria-v1';
export const ANALYSIS_CRITERIA_PRESETS = ['kds', 'asce', 'eurocode', 'custom'];

export const ANALYSIS_CRITERIA_WARNING_CODES = {
  UNKNOWN_ANALYSIS_CRITERIA: 'UNKNOWN_ANALYSIS_CRITERIA',
  BAD_ANALYSIS_CRITERIA_TYPE: 'BAD_ANALYSIS_CRITERIA_TYPE',
  ANALYSIS_CRITERIA_OUT_OF_RANGE: 'ANALYSIS_CRITERIA_OUT_OF_RANGE',
  BAD_ANALYSIS_CRITERIA_PRESET: 'BAD_ANALYSIS_CRITERIA_PRESET',
};

export const DEFAULT_CRITERIA_VALUES = {
  solver: {
    symWarn: 1e-8,
    symFail: null,
    resWarn: 1e-6,
    resFail: null,
    condWarn: 1e12,
    condSingular: 1e15,
    pivotWarn: 1e-8,
    pivotSingular: 1e-12,
  },
  load: {
    equilTol: 1e-10,
  },
  loadgen: {
    equilTol: 1e-10,
  },
  element: {
    shearSlenderCutoff: 60,
    shearShallowTol: 1e-3,
    shearPhiZeroTol: 1e-12,
    shearDeepBeamTol: 1e-9,
    shearReleaseTol: 1e-8,
  },
  connection: {
    stiffRatioWarn: 1e4,
    releaseRatioWarn: 1e-4,
    rigidLimitTol: 1e-9,
    releaseLimitTol: 1e-9,
    closedFormTol: 1e-7,
  },
  offset: {
    equilibriumTol: 1e-10,
  },
  constraint: {
    consistencyTol: 1e-10,
  },
  taper: {
    prismaticRegressionTol: 1e-12,
    closedFormTol: 1e-6,
    integrationConvergenceTol: 1e-8,
    gaussPoints: 5,
  },
  ltb: {
    c1Default: 1,
    closedFormTol: 1e-6,
  },
  shell: {
    drillingAlpha: 1e-5,
    wallBeamTol: 5e-2,
    plateTol: 1e-2,
    warpTol: 1e-2,
    spuriousEnergyMax: 1e-4,
    gpuResidualRefine: 1e-10,
  },
  audit: {
    equilibriumRelative: 1e-8,
  },
  tolerance: {
    element: { min: 1e-9, max: 1e-7 },
    smallFrame: { min: 1e-7, max: 1e-5 },
    largeFrame: { min: 1e-5, max: 1e-3 },
    modal: { min: 1e-6, max: 1e-4 },
    modalParticipation: { min: 1e-6, max: 1e-4 },
    rsa: { min: 1e-4, max: 1e-2 },
    pdelta: { min: 1e-5, max: 1e-3 },
    equivalentShellGlobal: 5e-2,
  },
  rsa: {
    massMin: 0.9,
    massStrong: 0.8,
    cqcPeriodRatio: { min: 0.9, max: 1.1 },
    dirFactor: 0.3,
    eccentricity: 0.05,
    applyBaseShearScaling: true,
  },
  pdelta: {
    eR: 1e-6,
    eU: 1e-6,
    eE: 1e-8,
    maxIter: 30,
    ampLimit: 2.5,
    thetaCaution: 0.05,
    thetaRequire: 0.1,
    thetaStrong: 0.2,
    includeTensionKg: true,
    notionalLoad: false,
    notionalRatio: 0.002,
    stiffnessReduction: 1,
  },
  equivalentShell: {
    driftErr: 0.1,
    shearErr: 0.05,
    momentErr: 0.1,
  },
  xval: {
    displacementReaction: 1e-4,
    memberForce: 1e-3,
    period: 1e-3,
    massParticipation: 1e-3,
    rsaBaseShear: 5e-3,
    pdelta: 5e-3,
    buckling: 5e-3,
  },
};

export const ANALYSIS_CRITERIA_PRESET_VALUES = {
  kds: {},
  asce: {},
  eurocode: {},
  custom: {},
};

const LEGACY_DEFAULTS = {
  pDeltaMaxIterations: 12,
  pDeltaTolerance: 1e-4,
  pDeltaMaxAmplification: 2.5,
};

const LEGACY_CRITERIA_MAP = [
  { legacyKey: 'pDeltaTolerance', criteriaKey: 'pdelta.eR' },
  { legacyKey: 'pDeltaTolerance', criteriaKey: 'pdelta.eU' },
  { legacyKey: 'pDeltaTolerance', criteriaKey: 'pdelta.eE' },
  { legacyKey: 'pDeltaMaxIterations', criteriaKey: 'pdelta.maxIter' },
  { legacyKey: 'pDeltaMaxAmplification', criteriaKey: 'pdelta.ampLimit' },
  { legacyKey: 'pDeltaThetaNegligible', criteriaKey: 'pdelta.thetaCaution' },
  { legacyKey: 'pDeltaThetaLimit', criteriaKey: 'pdelta.thetaStrong' },
];

const CRITERION_RULES = {
  'solver.symWarn': { kind: 'number', min: 0, exclusiveMin: true },
  'solver.symFail': { kind: 'number', min: 0, exclusiveMin: true, allowNull: true },
  'solver.resWarn': { kind: 'number', min: 0, exclusiveMin: true },
  'solver.resFail': { kind: 'number', min: 0, exclusiveMin: true, allowNull: true },
  'solver.condWarn': { kind: 'number', min: 0, exclusiveMin: true },
  'solver.condSingular': { kind: 'number', min: 0, exclusiveMin: true },
  'solver.pivotWarn': { kind: 'number', min: 0, exclusiveMin: true },
  'solver.pivotSingular': { kind: 'number', min: 0, exclusiveMin: true },
  'load.equilTol': { kind: 'number', min: 0, exclusiveMin: true },
  'loadgen.equilTol': { kind: 'number', min: 0, exclusiveMin: true },
  'element.shearSlenderCutoff': { kind: 'number', min: 0, exclusiveMin: true },
  'element.shearShallowTol': { kind: 'number', min: 0, exclusiveMin: true },
  'element.shearPhiZeroTol': { kind: 'number', min: 0, exclusiveMin: true },
  'element.shearDeepBeamTol': { kind: 'number', min: 0, exclusiveMin: true },
  'element.shearReleaseTol': { kind: 'number', min: 0, exclusiveMin: true },
  'connection.stiffRatioWarn': { kind: 'number', min: 0, exclusiveMin: true },
  'connection.releaseRatioWarn': { kind: 'number', min: 0, exclusiveMin: true },
  'connection.rigidLimitTol': { kind: 'number', min: 0, exclusiveMin: true },
  'connection.releaseLimitTol': { kind: 'number', min: 0, exclusiveMin: true },
  'connection.closedFormTol': { kind: 'number', min: 0, exclusiveMin: true },
  'offset.equilibriumTol': { kind: 'number', min: 0, exclusiveMin: true },
  'constraint.consistencyTol': { kind: 'number', min: 0, exclusiveMin: true },
  'taper.prismaticRegressionTol': { kind: 'number', min: 0, exclusiveMin: true },
  'taper.closedFormTol': { kind: 'number', min: 0, exclusiveMin: true },
  'taper.integrationConvergenceTol': { kind: 'number', min: 0, exclusiveMin: true },
  'taper.gaussPoints': { kind: 'integer', min: 5, max: 10, values: [5, 10] },
  'ltb.c1Default': { kind: 'number', min: 0, exclusiveMin: true },
  'ltb.closedFormTol': { kind: 'number', min: 0, exclusiveMin: true },
  'shell.drillingAlpha': { kind: 'number', min: 1e-6, max: 1e-4 },
  'shell.wallBeamTol': { kind: 'number', min: 0, max: 1, exclusiveMin: true },
  'shell.plateTol': { kind: 'number', min: 0, max: 1, exclusiveMin: true },
  'shell.warpTol': { kind: 'number', min: 0, max: 1, exclusiveMin: true },
  'shell.spuriousEnergyMax': { kind: 'number', min: 0, max: 1, exclusiveMin: true },
  'shell.gpuResidualRefine': { kind: 'number', min: 0, exclusiveMin: true },
  'audit.equilibriumRelative': { kind: 'number', min: 0, exclusiveMin: true },
  'tolerance.element.min': { kind: 'number', min: 0, exclusiveMin: true },
  'tolerance.element.max': { kind: 'number', min: 0, exclusiveMin: true },
  'tolerance.smallFrame.min': { kind: 'number', min: 0, exclusiveMin: true },
  'tolerance.smallFrame.max': { kind: 'number', min: 0, exclusiveMin: true },
  'tolerance.largeFrame.min': { kind: 'number', min: 0, exclusiveMin: true },
  'tolerance.largeFrame.max': { kind: 'number', min: 0, exclusiveMin: true },
  'tolerance.modal.min': { kind: 'number', min: 0, exclusiveMin: true },
  'tolerance.modal.max': { kind: 'number', min: 0, exclusiveMin: true },
  'tolerance.modalParticipation.min': { kind: 'number', min: 0, exclusiveMin: true },
  'tolerance.modalParticipation.max': { kind: 'number', min: 0, exclusiveMin: true },
  'tolerance.rsa.min': { kind: 'number', min: 0, exclusiveMin: true },
  'tolerance.rsa.max': { kind: 'number', min: 0, exclusiveMin: true },
  'tolerance.pdelta.min': { kind: 'number', min: 0, exclusiveMin: true },
  'tolerance.pdelta.max': { kind: 'number', min: 0, exclusiveMin: true },
  'tolerance.equivalentShellGlobal': { kind: 'number', min: 0, exclusiveMin: true },
  'rsa.massMin': { kind: 'number', min: 0, max: 1 },
  'rsa.massStrong': { kind: 'number', min: 0, max: 1 },
  'rsa.cqcPeriodRatio.min': { kind: 'number', min: 0, exclusiveMin: true },
  'rsa.cqcPeriodRatio.max': { kind: 'number', min: 0, exclusiveMin: true },
  'rsa.dirFactor': { kind: 'number', min: 0, max: 1 },
  'rsa.eccentricity': { kind: 'number', min: 0, max: 1 },
  'rsa.applyBaseShearScaling': { kind: 'boolean' },
  'pdelta.eR': { kind: 'number', min: 0, exclusiveMin: true },
  'pdelta.eU': { kind: 'number', min: 0, exclusiveMin: true },
  'pdelta.eE': { kind: 'number', min: 0, exclusiveMin: true },
  'pdelta.maxIter': { kind: 'integer', min: 1 },
  'pdelta.ampLimit': { kind: 'number', min: 1, exclusiveMin: true },
  'pdelta.thetaCaution': { kind: 'number', min: 0, max: 1 },
  'pdelta.thetaRequire': { kind: 'number', min: 0, max: 1 },
  'pdelta.thetaStrong': { kind: 'number', min: 0, max: 1 },
  'pdelta.includeTensionKg': { kind: 'boolean' },
  'pdelta.notionalLoad': { kind: 'boolean' },
  'pdelta.notionalRatio': { kind: 'number', min: 0 },
  'pdelta.stiffnessReduction': { kind: 'number', min: 0, max: 1, exclusiveMin: true },
  'equivalentShell.driftErr': { kind: 'number', min: 0, max: 1 },
  'equivalentShell.shearErr': { kind: 'number', min: 0, max: 1 },
  'equivalentShell.momentErr': { kind: 'number', min: 0, max: 1 },
  'xval.displacementReaction': { kind: 'number', min: 0, exclusiveMin: true },
  'xval.memberForce': { kind: 'number', min: 0, exclusiveMin: true },
  'xval.period': { kind: 'number', min: 0, exclusiveMin: true },
  'xval.massParticipation': { kind: 'number', min: 0, exclusiveMin: true },
  'xval.rsaBaseShear': { kind: 'number', min: 0, exclusiveMin: true },
  'xval.pdelta': { kind: 'number', min: 0, exclusiveMin: true },
  'xval.buckling': { kind: 'number', min: 0, exclusiveMin: true },
};

const RANGE_PAIRS = [
  ['tolerance.element.min', 'tolerance.element.max'],
  ['tolerance.smallFrame.min', 'tolerance.smallFrame.max'],
  ['tolerance.largeFrame.min', 'tolerance.largeFrame.max'],
  ['tolerance.modal.min', 'tolerance.modal.max'],
  ['tolerance.modalParticipation.min', 'tolerance.modalParticipation.max'],
  ['tolerance.rsa.min', 'tolerance.rsa.max'],
  ['tolerance.pdelta.min', 'tolerance.pdelta.max'],
  ['rsa.cqcPeriodRatio.min', 'rsa.cqcPeriodRatio.max'],
  ['pdelta.thetaCaution', 'pdelta.thetaRequire'],
  ['pdelta.thetaRequire', 'pdelta.thetaStrong'],
  ['solver.pivotSingular', 'solver.pivotWarn'],
  ['connection.releaseRatioWarn', 'connection.stiffRatioWarn'],
];

const KNOWN_CRITERIA_PATHS = Object.keys(CRITERION_RULES).sort();

export function defaultAnalysisCriteria(preset = 'kds') {
  return {
    version: ANALYSIS_CRITERIA_VERSION,
    preset: normalizePreset(preset),
    criteria: {},
  };
}

export function normalizeAnalysisCriteria(input = {}) {
  const source = isPlainObject(input) ? input : {};
  return {
    version: source.version || ANALYSIS_CRITERIA_VERSION,
    preset: source.preset || 'kds',
    criteria: isPlainObject(source.criteria) ? clone(source.criteria) : {},
  };
}

export function resolveAnalysisCriteria(modelOrCriteria = {}) {
  const holder = looksLikeAnalysisCriteria(modelOrCriteria)
    ? { analysisCriteria: modelOrCriteria, analysisSettings: {} }
    : (isPlainObject(modelOrCriteria) ? modelOrCriteria : {});
  const hasAnalysisCriteria = isPlainObject(holder.analysisCriteria);
  const config = normalizeAnalysisCriteria(holder.analysisCriteria || {});
  const preset = normalizePreset(config.preset);
  const criteria = deepMerge(DEFAULT_CRITERIA_VALUES, ANALYSIS_CRITERIA_PRESET_VALUES[preset] || {});
  const sourceByPath = Object.fromEntries(KNOWN_CRITERIA_PATHS.map((path) => [path, hasAnalysisCriteria ? 'preset' : 'default']));
  const legacyByPath = {};

  applyLegacyFallback(criteria, sourceByPath, legacyByPath, holder.analysisSettings || {}, !hasAnalysisCriteria);
  applyCriteriaOverrides(criteria, sourceByPath, config.criteria);

  const rows = KNOWN_CRITERIA_PATHS.map((path) => ({
    key: `criteria.${path}`,
    path,
    value: clone(getByPath(criteria, path)),
    source: sourceByPath[path] || 'default',
    legacyKey: legacyByPath[path] || null,
  }));
  const warnings = validateAnalysisCriteria(hasAnalysisCriteria ? holder.analysisCriteria : null);
  return {
    version: ANALYSIS_CRITERIA_VERSION,
    preset,
    criteria,
    trace: {
      version: ANALYSIS_CRITERIA_VERSION,
      preset,
      hasProjectCriteria: hasAnalysisCriteria,
      rows,
      overrideCount: rows.filter((row) => row.source === 'override').length,
      legacyFallbackCount: rows.filter((row) => row.source === 'legacyFallback').length,
      warningCount: warnings.length,
      warnings,
    },
  };
}

export function resolveCriterion(modelOrCriteria, key, fallback = null) {
  const path = normalizeCriterionKey(key);
  if (!path) return fallback;
  const resolved = resolveAnalysisCriteria(modelOrCriteria);
  const value = getByPath(resolved.criteria, path);
  return value == null ? fallback : clone(value);
}

export function buildAnalysisCriteriaTrace(modelOrCriteria = {}) {
  return resolveAnalysisCriteria(modelOrCriteria).trace;
}

export function listAnalysisCriteriaKeys() {
  return KNOWN_CRITERIA_PATHS.map((path) => `criteria.${path}`);
}

export function validateAnalysisCriteria(input = null) {
  const warnings = [];
  if (input == null) return warnings;
  if (!isPlainObject(input)) {
    warnings.push(issue(
      ANALYSIS_CRITERIA_WARNING_CODES.BAD_ANALYSIS_CRITERIA_TYPE,
      'analysisCriteria must be an object when provided.',
      'analysisCriteria',
    ));
    return warnings;
  }
  if (input.preset != null && !ANALYSIS_CRITERIA_PRESETS.includes(input.preset)) {
    warnings.push(issue(
      ANALYSIS_CRITERIA_WARNING_CODES.BAD_ANALYSIS_CRITERIA_PRESET,
      `Unsupported analysisCriteria preset: ${input.preset}`,
      'analysisCriteria.preset',
    ));
  }
  if (input.criteria == null) return warnings;
  if (!isPlainObject(input.criteria)) {
    warnings.push(issue(
      ANALYSIS_CRITERIA_WARNING_CODES.BAD_ANALYSIS_CRITERIA_TYPE,
      'analysisCriteria.criteria must be an object when provided.',
      'analysisCriteria.criteria',
    ));
    return warnings;
  }

  const flat = flattenCriteria(input.criteria);
  for (const [path, value] of flat) {
    const rule = CRITERION_RULES[path];
    const target = `analysisCriteria.criteria.${path}`;
    if (!rule) {
      warnings.push(issue(
        ANALYSIS_CRITERIA_WARNING_CODES.UNKNOWN_ANALYSIS_CRITERIA,
        `Unknown analysis criterion: criteria.${path}`,
        target,
      ));
      continue;
    }
    const check = coerceValue(path, value);
    if (!check.ok) {
      warnings.push(issue(check.code, check.message, target));
    }
  }

  for (const [minPath, maxPath] of RANGE_PAIRS) {
    const minValue = getByPath(input.criteria, minPath);
    const maxValue = getByPath(input.criteria, maxPath);
    if (minValue == null || maxValue == null) continue;
    const min = Number(minValue);
    const max = Number(maxValue);
    if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
      warnings.push(issue(
        ANALYSIS_CRITERIA_WARNING_CODES.ANALYSIS_CRITERIA_OUT_OF_RANGE,
        `analysisCriteria range is inverted: criteria.${minPath} must be <= criteria.${maxPath}.`,
        `analysisCriteria.criteria.${minPath}`,
      ));
    }
  }
  return warnings;
}

function applyCriteriaOverrides(criteria, sourceByPath, overrides = {}) {
  if (!isPlainObject(overrides)) return;
  for (const [path, value] of flattenCriteria(overrides)) {
    const check = coerceValue(path, value);
    if (!check.ok) continue;
    setByPath(criteria, path, check.value);
    sourceByPath[path] = 'override';
  }
}

function applyLegacyFallback(criteria, sourceByPath, legacyByPath, settings = {}, applyDefaults = false) {
  if (!isPlainObject(settings)) return;
  for (const { legacyKey, criteriaKey } of LEGACY_CRITERIA_MAP) {
    if (!Object.prototype.hasOwnProperty.call(settings, legacyKey)) continue;
    if (!applyDefaults && Object.prototype.hasOwnProperty.call(LEGACY_DEFAULTS, legacyKey) && settings[legacyKey] === LEGACY_DEFAULTS[legacyKey]) {
      continue;
    }
    const check = coerceValue(criteriaKey, settings[legacyKey]);
    if (!check.ok) continue;
    setByPath(criteria, criteriaKey, check.value);
    sourceByPath[criteriaKey] = 'legacyFallback';
    legacyByPath[criteriaKey] = `analysisSettings.${legacyKey}`;
  }
}

function normalizeCriterionKey(key) {
  if (typeof key !== 'string') return null;
  const trimmed = key.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('criteria.')) return trimmed.slice('criteria.'.length);
  return trimmed;
}

function normalizePreset(preset) {
  return ANALYSIS_CRITERIA_PRESETS.includes(preset) ? preset : 'kds';
}

function looksLikeAnalysisCriteria(value) {
  return isPlainObject(value)
    && (Object.prototype.hasOwnProperty.call(value, 'criteria')
      || Object.prototype.hasOwnProperty.call(value, 'preset'))
    && !Object.prototype.hasOwnProperty.call(value, 'nodes')
    && !Object.prototype.hasOwnProperty.call(value, 'members');
}

function coerceValue(path, value) {
  const rule = CRITERION_RULES[path];
  if (!rule) {
    return {
      ok: false,
      code: ANALYSIS_CRITERIA_WARNING_CODES.UNKNOWN_ANALYSIS_CRITERIA,
      message: `Unknown analysis criterion: criteria.${path}`,
    };
  }
  if (value == null && rule.allowNull) return { ok: true, value: null };
  if (rule.kind === 'boolean') {
    if (typeof value === 'boolean') return { ok: true, value };
    return {
      ok: false,
      code: ANALYSIS_CRITERIA_WARNING_CODES.BAD_ANALYSIS_CRITERIA_TYPE,
      message: `criteria.${path} must be a boolean.`,
    };
  }
  if (typeof value !== 'number') {
    return {
      ok: false,
      code: ANALYSIS_CRITERIA_WARNING_CODES.BAD_ANALYSIS_CRITERIA_TYPE,
      message: `criteria.${path} must be a number.`,
    };
  }
  if (!Number.isFinite(value)) {
    return {
      ok: false,
      code: ANALYSIS_CRITERIA_WARNING_CODES.BAD_ANALYSIS_CRITERIA_TYPE,
      message: `criteria.${path} must be finite.`,
    };
  }
  if (rule.kind === 'integer' && !Number.isInteger(value)) {
    return {
      ok: false,
      code: ANALYSIS_CRITERIA_WARNING_CODES.BAD_ANALYSIS_CRITERIA_TYPE,
      message: `criteria.${path} must be an integer.`,
    };
  }
  if (Array.isArray(rule.values) && !rule.values.includes(value)) {
    return {
      ok: false,
      code: ANALYSIS_CRITERIA_WARNING_CODES.ANALYSIS_CRITERIA_OUT_OF_RANGE,
      message: `criteria.${path} must be one of: ${rule.values.join(', ')}.`,
    };
  }
  const tooSmall = rule.min != null && (rule.exclusiveMin ? value <= rule.min : value < rule.min);
  const tooLarge = rule.max != null && value > rule.max;
  if (tooSmall || tooLarge) {
    const lower = rule.min == null ? '-inf' : `${rule.exclusiveMin ? '>' : '>='} ${rule.min}`;
    const upper = rule.max == null ? '+inf' : `<= ${rule.max}`;
    return {
      ok: false,
      code: ANALYSIS_CRITERIA_WARNING_CODES.ANALYSIS_CRITERIA_OUT_OF_RANGE,
      message: `criteria.${path} is out of range (${lower}, ${upper}).`,
    };
  }
  return { ok: true, value };
}

function flattenCriteria(value, prefix = '') {
  if (!isPlainObject(value)) return [];
  const rows = [];
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(item) && !CRITERION_RULES[path]) rows.push(...flattenCriteria(item, path));
    else rows.push([path, item]);
  }
  return rows;
}

function getByPath(source, path) {
  return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), source);
}

function setByPath(target, path, value) {
  const keys = path.split('.');
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    if (!isPlainObject(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = value;
}

function deepMerge(base, override) {
  const output = clone(base);
  if (!isPlainObject(override)) return output;
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(output[key])) output[key] = deepMerge(output[key], value);
    else output[key] = clone(value);
  }
  return output;
}

function issue(code, message, target) {
  return { level: 'WARNING', code, message, target };
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  if (value == null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
