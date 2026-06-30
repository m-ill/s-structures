export const SCHEMA_VERSION = 3;
export const SCHEMA_NAME = 's-structures-model';

export const DOF_KEYS = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
export const FORCE_KEYS = ['fx', 'fy', 'fz', 'mx', 'my', 'mz'];

export const SUPPORT_TYPES = new Set(['fixed', 'pin', 'roller', 'custom', null, undefined]);
export const MEMBER_TYPES = new Set(['frame', undefined, null]);
export const RELEASE_TYPES = new Set(['rigid', 'pin', undefined, null]);
export const LOAD_TYPES = new Set(['nodal', 'nmoment', 'udl', 'point']);
export const LOAD_CASE_TYPES = new Set(['dead', 'live', 'wind', 'seismic', 'snow', 'roof', 'other', 'user']);
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
  LOAD_MISSING_ID: 'LOAD_MISSING_ID',
  DUPLICATE_LOAD_ID: 'DUPLICATE_LOAD_ID',
  BAD_LOAD_TYPE: 'BAD_LOAD_TYPE',
  BAD_LOAD_MEMBER_REF: 'BAD_LOAD_MEMBER_REF',
  BAD_LOAD_NODE_REF: 'BAD_LOAD_NODE_REF',
  BAD_LOAD_MAGNITUDE: 'BAD_LOAD_MAGNITUDE',
  BAD_POINT_LOAD_LOCATION: 'BAD_POINT_LOAD_LOCATION',
  LOAD_CASE_MISSING_ID: 'LOAD_CASE_MISSING_ID',
  DUPLICATE_LOAD_CASE_ID: 'DUPLICATE_LOAD_CASE_ID',
  BAD_LOAD_CASE_TYPE: 'BAD_LOAD_CASE_TYPE',
  COMBO_MISSING_ID: 'COMBO_MISSING_ID',
  DUPLICATE_COMBO_ID: 'DUPLICATE_COMBO_ID',
  BAD_COMBO_FACTORS: 'BAD_COMBO_FACTORS',
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
};

export function defaultLoadCases() {
  return [
    { id: 'D', name: 'Dead load', type: 'dead' },
    { id: 'L', name: 'Live load', type: 'live' },
  ];
}

export function defaultLoadCombinations() {
  return [
    { id: 'CO1', name: '1.0D + 1.0L', type: 'strength', factors: { D: 1, L: 1 } },
    { id: 'SLS1', name: 'Service 1.0D + 1.0L', type: 'service', factors: { D: 1, L: 1 } },
  ];
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
