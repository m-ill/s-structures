import {
  createLoadCombinationsFromRulePack,
  KDS_41_12_00_2022_RULE_PACK,
} from './kdsLoadCombinations.js';

export const SCHEMA_VERSION = 4;
export const SCHEMA_NAME = 's-structures-model';

export const DOF_KEYS = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
export const FORCE_KEYS = ['fx', 'fy', 'fz', 'mx', 'my', 'mz'];

export const SUPPORT_TYPES = new Set(['fixed', 'pin', 'roller', 'custom', 'spring', null, undefined]);
export const MEMBER_TYPES = new Set(['frame', 'truss', 'tensionOnly', 'compressionOnly', undefined, null]);
export const RELEASE_TYPES = new Set(['rigid', 'pin', undefined, null]);
export const LOAD_TYPES = new Set(['nodal', 'nmoment', 'udl', 'point', 'udl-partial', 'trapezoid', 'mmoment', 'temperature', 'tgradient']);
export const LOAD_CASE_TYPES = new Set([
  'dead',
  'live',
  'roofLive',
  'wind',
  'seismic',
  'snow',
  'rain',
  'earthPressure',
  'temperature',
  'fluid',
  'equipment',
  'construction',
  'roof',
  'other',
  'user',
]);
export const LOAD_FAMILIES = new Set(['D', 'L', 'Lr', 'S', 'R', 'W', 'E', 'H', 'T', 'F', 'EQUIPMENT', 'CONSTRUCTION', 'OTHER']);
export const COMBINATION_TYPES = new Set(['strength', 'service', 'envelope', 'user', undefined, null]);

export const ERROR_CODES = {
  NO_MODEL: 'NO_MODEL',
  MODEL_NOT_OBJECT: 'MODEL_NOT_OBJECT',
  BAD_SCHEMA_VERSION: 'BAD_SCHEMA_VERSION',
  BAD_COLLECTION: 'BAD_COLLECTION',
  NODE_MISSING_ID: 'NODE_MISSING_ID',
  DUPLICATE_NODE_ID: 'DUPLICATE_NODE_ID',
  BAD_NODE_COORDS: 'BAD_NODE_COORDS',
  BAD_SUPPORT_TYPE: 'BAD_SUPPORT_TYPE',
  BAD_CUSTOM_SUPPORT: 'BAD_CUSTOM_SUPPORT',
  MEMBER_MISSING_ID: 'MEMBER_MISSING_ID',
  DUPLICATE_MEMBER_ID: 'DUPLICATE_MEMBER_ID',
  BAD_MEMBER_TYPE: 'BAD_MEMBER_TYPE',
  BAD_MEMBER_OFFSET: 'BAD_MEMBER_OFFSET',
  BAD_MEMBER_NODE_REF: 'BAD_MEMBER_NODE_REF',
  ZERO_LENGTH_MEMBER: 'ZERO_LENGTH_MEMBER',
  NO_SECTION: 'NO_SECTION',
  BAD_SECTION_PROPS: 'BAD_SECTION_PROPS',
  NO_MATERIAL: 'NO_MATERIAL',
  BAD_MATERIAL_PROPS: 'BAD_MATERIAL_PROPS',
  BAD_RELEASE_END: 'BAD_RELEASE_END',
  BAD_RELEASE_TYPE: 'BAD_RELEASE_TYPE',
  BAD_DIAPHRAGM_TYPE: 'BAD_DIAPHRAGM_TYPE',
  BAD_DIAPHRAGM_NODE_REF: 'BAD_DIAPHRAGM_NODE_REF',
  BAD_DIAPHRAGM_PROPS: 'BAD_DIAPHRAGM_PROPS',
  BAD_SHELL_NODE_REF: 'BAD_SHELL_NODE_REF',
  BAD_SHELL_PROPS: 'BAD_SHELL_PROPS',
  LOAD_MISSING_ID: 'LOAD_MISSING_ID',
  DUPLICATE_LOAD_ID: 'DUPLICATE_LOAD_ID',
  BAD_LOAD_TYPE: 'BAD_LOAD_TYPE',
  BAD_LOAD_MEMBER_REF: 'BAD_LOAD_MEMBER_REF',
  BAD_LOAD_NODE_REF: 'BAD_LOAD_NODE_REF',
  BAD_LOAD_MAGNITUDE: 'BAD_LOAD_MAGNITUDE',
  BAD_POINT_LOAD_LOCATION: 'BAD_POINT_LOAD_LOCATION',
  UNSUPPORTED_LOAD_EFFECT: 'UNSUPPORTED_LOAD_EFFECT',
  LOAD_CASE_MISSING_ID: 'LOAD_CASE_MISSING_ID',
  DUPLICATE_LOAD_CASE_ID: 'DUPLICATE_LOAD_CASE_ID',
  BAD_LOAD_CASE_TYPE: 'BAD_LOAD_CASE_TYPE',
  COMBO_MISSING_ID: 'COMBO_MISSING_ID',
  DUPLICATE_COMBO_ID: 'DUPLICATE_COMBO_ID',
  BAD_COMBO_FACTORS: 'BAD_COMBO_FACTORS',
  BAD_SOURCE_REGISTRY: 'BAD_SOURCE_REGISTRY',
  BAD_SOURCE_RECORD: 'BAD_SOURCE_RECORD',
  BAD_MASS_SOURCE: 'BAD_MASS_SOURCE',
  BAD_PROJECT_SETUP: 'BAD_PROJECT_SETUP',
  BAD_ANALYSIS_CASE_COLLECTION: 'BAD_ANALYSIS_CASE_COLLECTION',
  BAD_ANALYSIS_CASE: 'BAD_ANALYSIS_CASE',
  ANALYSIS_CASE_MISSING_ID: 'ANALYSIS_CASE_MISSING_ID',
  DUPLICATE_ANALYSIS_CASE_ID: 'DUPLICATE_ANALYSIS_CASE_ID',
  BAD_ANALYSIS_CASE_KIND: 'BAD_ANALYSIS_CASE_KIND',
  BAD_ANALYSIS_CASE_STATUS: 'BAD_ANALYSIS_CASE_STATUS',
  BAD_ANALYSIS_CASE_SETTINGS: 'BAD_ANALYSIS_CASE_SETTINGS',
  BAD_ANALYSIS_CASE_INPUT: 'BAD_ANALYSIS_CASE_INPUT',
  BAD_ANALYSIS_CASE_LAST_RUN: 'BAD_ANALYSIS_CASE_LAST_RUN',
  NO_SUPPORT: 'NO_SUPPORT',
};

export const WARNING_CODES = {
  NO_UNITS: 'NO_UNITS',
  NO_UNIT_SYSTEM: 'NO_UNIT_SYSTEM',
  UNSUPPORTED_UNIT: 'UNSUPPORTED_UNIT',
  NO_MATERIALS: 'NO_MATERIALS',
  NO_SECTIONS: 'NO_SECTIONS',
  DUPLICATE_NODE_COORDS: 'DUPLICATE_NODE_COORDS',
  FREE_NODE: 'FREE_NODE',
  BAD_LOAD_CASE_REF: 'BAD_LOAD_CASE_REF',
  BAD_COMBO_CASE_REF: 'BAD_COMBO_CASE_REF',
  LOAD_CASE_UNUSED: 'LOAD_CASE_UNUSED',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  UNKNOWN_ANALYSIS_CRITERIA: 'UNKNOWN_ANALYSIS_CRITERIA',
  BAD_ANALYSIS_CRITERIA_TYPE: 'BAD_ANALYSIS_CRITERIA_TYPE',
  ANALYSIS_CRITERIA_OUT_OF_RANGE: 'ANALYSIS_CRITERIA_OUT_OF_RANGE',
  BAD_ANALYSIS_CRITERIA_PRESET: 'BAD_ANALYSIS_CRITERIA_PRESET',
  SOLVER_SYMMETRY_WARN: 'SOLVER_SYMMETRY_WARN',
  SOLVER_SYMMETRY_FAIL: 'SOLVER_SYMMETRY_FAIL',
  SOLVER_RESIDUAL_WARN: 'SOLVER_RESIDUAL_WARN',
  SOLVER_RESIDUAL_FAIL: 'SOLVER_RESIDUAL_FAIL',
  SOLVER_CONDITION_WARN: 'SOLVER_CONDITION_WARN',
  SOLVER_CONDITION_FAIL: 'SOLVER_CONDITION_FAIL',
  SOLVER_PIVOT_NEAR_SINGULAR: 'SOLVER_PIVOT_NEAR_SINGULAR',
};

export function defaultLoadCases() {
  return [
    { id: 'D', name: 'Dead load', type: 'dead' },
    { id: 'L', name: 'Live load', type: 'live' },
  ];
}

export function defaultLoadCombinations() {
  return [
    ...defaultKdsStrengthCandidates(defaultLoadCases()),
    defaultServiceCombination(),
  ];
}

export function modernizeLegacyDefaultCombinations(combinations = [], loadCases = defaultLoadCases(), options = {}) {
  const current = Array.isArray(combinations)
    ? combinations.map((combo) => ({ ...combo, factors: { ...(combo.factors || {}) } }))
    : [];
  const standardDeadLiveCases = hasStandardDeadLiveCases(loadCases);
  const obsolete = standardDeadLiveCases
    ? current.filter((combo) => isObsoleteLegacyStrengthDefault(combo, options))
    : [];
  const serviceChanged = standardDeadLiveCases && current.some((combo) => isLegacyServiceDefault(combo)
    && (combo.origin !== 'service-baseline' || combo.purpose !== 'deflection'));
  if (!obsolete.length && !serviceChanged) {
    return { changed: false, combinations: current, removedIds: [], addedIds: [] };
  }

  const preserved = current
    .filter((combo) => !isObsoleteLegacyStrengthDefault(combo, options))
    .map((combo) => (isLegacyServiceDefault(combo)
      ? { ...combo, name: 'Service D + L', type: 'service', purpose: 'deflection', origin: 'service-baseline', reviewStatus: 'service-baseline' }
      : combo));
  const usedIds = new Set(preserved.map((combo) => combo.id));
  const candidates = defaultKdsStrengthCandidates(loadCases).filter((combo) => !usedIds.has(combo.id));
  return {
    changed: true,
    combinations: [...candidates, ...preserved],
    removedIds: obsolete.map((combo) => combo.id),
    addedIds: candidates.map((combo) => combo.id),
  };
}

export function defaultPracticeLoadCases() {
  return [
    practiceLoadCase('D-SW', 'Self weight', 'dead', 'D', 'selfWeight'),
    practiceLoadCase('D-SDL', 'Superimposed dead load', 'dead', 'D', 'superimposed'),
    practiceLoadCase('L', 'Live load', 'live', 'L', 'floor'),
  ];
}

export function defaultPracticeLoadCombinations() {
  return [];
}

function practiceLoadCase(id, name, type, family, variant) {
  return {
    id,
    name,
    type,
    family,
    variant,
    confirmation: 'unconfirmed',
    origin: 'practice-template',
    generatedKey: `practice:${id}`,
    userModified: false,
  };
}

function defaultKdsStrengthCandidates(loadCases) {
  return createLoadCombinationsFromRulePack(
    { loadCases: Array.isArray(loadCases) ? loadCases : defaultLoadCases() },
    KDS_41_12_00_2022_RULE_PACK,
    { method: 'strength', includeReverseLateral: true },
  );
}

function defaultServiceCombination() {
  return {
    id: 'SLS1',
    name: 'Service D + L',
    type: 'service',
    factors: { D: 1, L: 1 },
    purpose: 'deflection',
    origin: 'service-baseline',
    reviewStatus: 'service-baseline',
    userModified: false,
  };
}

function isObsoleteLegacyStrengthDefault(combo = {}, options = {}) {
  const origin = String(combo.origin || '').toLowerCase();
  const userOwned = combo.userModified === true || ['manual', 'user', 'custom'].includes(origin);
  const legacyOwned = origin === 'legacy'
    || combo.reviewStatus === 'legacy-unreviewed'
    || combo.legacy === true
    || (options.assumeUnmarkedLegacy !== false && !origin && !combo.generatedKey);
  return ['CO1', 'ULS1'].includes(combo.id)
    && (combo.type === 'strength' || !combo.type)
    && isOnlyDeadLiveUnity(combo.factors)
    && !userOwned
    && legacyOwned;
}

function isLegacyServiceDefault(combo = {}) {
  return combo.id === 'SLS1'
    && combo.type === 'service'
    && isOnlyDeadLiveUnity(combo.factors);
}

function isOnlyDeadLiveUnity(factors = {}) {
  const active = Object.entries(factors || {}).filter(([, factor]) => Math.abs(Number(factor) || 0) > 1e-12);
  return active.length === 2 && Number(factors.D) === 1 && Number(factors.L) === 1;
}

function hasStandardDeadLiveCases(loadCases = []) {
  const dead = loadCases.find((item) => item.id === 'D');
  const live = loadCases.find((item) => item.id === 'L');
  const deadFamily = String(dead?.family || dead?.type || '').toLowerCase();
  const liveFamily = String(live?.family || live?.type || '').toLowerCase();
  return !!dead && !!live
    && ['d', 'dead'].includes(deadFamily)
    && ['l', 'live'].includes(liveFamily);
}

export function defaultAnalysisSettings() {
  return {
    analysisType: 'linear_static',
    elementType: '3d_frame',
    includeShearDeformation: false,
    includeGeometricStiffness: false,
    includeSelfWeight: false,
    solverTolerance: 1e-10,
    memberStations: 21,
    includeFixedEndDeformation: true,
    validateBeforeSolve: true,
    pDeltaMaxIterations: 12,
    pDeltaTolerance: 1e-4,
    pDeltaMaxAmplification: 2.5,
    modalModeCount: 6,
    responseSpectrum: {
      enabled: true,
      dampingRatio: 0.05,
      scale: 9.80665,
      directions: ['x', 'y'],
      points: [
        { period: 0, sa: 0.4 },
        { period: 5, sa: 0.4 },
      ],
    },
  };
}

export function defaultDesignParams() {
  return {
    global: {
      mode: 'off',
      codeCompliance: false,
      defaultKy: 1.0,
      defaultKz: 1.0,
      defaultLbY: null,
      defaultLbZ: null,
      defaultDeflectionLimitTotal: 250,
      defaultDeflectionLimitLive: 360,
      defaultCompressionSlendernessLimit: 200,
      defaultTensionSlendernessLimit: 300,
      warnAtRatio: 0.7,
    },
    rc: {
      defaultCover: 0.05,
      defaultRebarFy: 400,
      defaultBeamRebarRatio: 0.01,
      defaultColumnRebarRatio: 0.015,
      minBeamRebarRatio: 0.002,
      minColumnRebarRatio: 0.01,
      maxColumnRebarRatio: 0.04,
      phiFlexure: 0.85,
      phiShear: 0.75,
      phiCompression: 0.65,
      warnAtRatio: 0.7,
    },
    members: {},
  };
}

export function defaultDesignSettings() {
  return {
    method: 'allowable_stress',
    defaultCheck: 'elastic_stress_interaction',
  };
}
