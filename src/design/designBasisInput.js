import { LOAD_ESTIMATION_VERSION } from './loadEstimationConstants.js';
import { finite } from './loadMath.js';
import {
  LOAD_FAMILY_DEFINITIONS,
  LOAD_INPUT_STATES,
  normalizeLoadFamily,
  normalizeLoadInputState,
} from '../loads/loadCaseMetadata.js';

export const DESIGN_BASIS_INPUT_VERSION = 'm47-design-basis-input';

export const OCCUPANCY_LOAD_PRESETS = {
  office: { label: 'Office', dead: 5.0, live: 2.5, roofLive: 1.0 },
  residential: { label: 'Residential', dead: 4.5, live: 2.0, roofLive: 1.0 },
  school: { label: 'School', dead: 5.0, live: 3.0, roofLive: 1.0 },
  hospital: { label: 'Hospital', dead: 5.5, live: 3.0, roofLive: 1.0 },
  parking: { label: 'Parking', dead: 5.5, live: 4.0, roofLive: 1.0 },
  warehouse: { label: 'Warehouse', dead: 4.0, live: 5.0, roofLive: 1.0 },
};

export const DEFAULT_DESIGN_BASIS = {
  occupancy: 'office',
  designMethod: null,
  floorArea: null,
  roofArea: null,
  deadLoad: null,
  liveLoad: null,
  roofLiveLoad: null,
  windPressureX: 0.7,
  windPressureY: 0.7,
  seismicCoefficientX: 0.10,
  seismicCoefficientY: 0.10,
  seismicLiveLoadFactor: 0.25,
  accidentalEccentricityRatio: 0.05,
};

export const DESIGN_BASIS_NUMERIC_FIELDS = [
  { id: 'floorArea', label: 'Typical floor area', unit: 'm2', min: 0, step: 1 },
  { id: 'roofArea', label: 'Roof area', unit: 'm2', min: 0, step: 1 },
  { id: 'deadLoad', label: 'Dead load', unit: 'kN/m2', min: 0, step: 0.1 },
  { id: 'liveLoad', label: 'Live load', unit: 'kN/m2', min: 0, step: 0.1 },
  { id: 'roofLiveLoad', label: 'Roof live', unit: 'kN/m2', min: 0, step: 0.1 },
  { id: 'windPressureX', label: 'Wind X', unit: 'kN/m2', min: 0, step: 0.05 },
  { id: 'windPressureY', label: 'Wind Y', unit: 'kN/m2', min: 0, step: 0.05 },
  { id: 'seismicCoefficientX', label: 'Seismic X', unit: 'g', min: 0, step: 0.01 },
  { id: 'seismicCoefficientY', label: 'Seismic Y', unit: 'g', min: 0, step: 0.01 },
  { id: 'seismicLiveLoadFactor', label: 'Seismic live factor', unit: '-', min: 0, step: 0.05 },
  { id: 'accidentalEccentricityRatio', label: 'Accidental eccentricity', unit: 'B', min: 0, step: 0.01 },
];

export function createDesignBasis(input = {}) {
  const occupancy = input.occupancy || DEFAULT_DESIGN_BASIS.occupancy;
  const preset = OCCUPANCY_LOAD_PRESETS[occupancy] || OCCUPANCY_LOAD_PRESETS.office;
  const values = {
    floorArea: finite(input.floorArea, DEFAULT_DESIGN_BASIS.floorArea),
    roofArea: finite(input.roofArea, DEFAULT_DESIGN_BASIS.roofArea),
    deadLoad: finite(input.deadLoad, DEFAULT_DESIGN_BASIS.deadLoad, preset.dead),
    liveLoad: finite(input.liveLoad, DEFAULT_DESIGN_BASIS.liveLoad, preset.live),
    roofLiveLoad: finite(input.roofLiveLoad, DEFAULT_DESIGN_BASIS.roofLiveLoad, preset.roofLive),
    windPressureX: finite(input.windPressureX, DEFAULT_DESIGN_BASIS.windPressureX),
    windPressureY: finite(input.windPressureY, DEFAULT_DESIGN_BASIS.windPressureY),
    seismicCoefficientX: finite(input.seismicCoefficientX, DEFAULT_DESIGN_BASIS.seismicCoefficientX),
    seismicCoefficientY: finite(input.seismicCoefficientY, DEFAULT_DESIGN_BASIS.seismicCoefficientY),
    seismicLiveLoadFactor: finite(input.seismicLiveLoadFactor, DEFAULT_DESIGN_BASIS.seismicLiveLoadFactor),
    accidentalEccentricityRatio: finite(input.accidentalEccentricityRatio, DEFAULT_DESIGN_BASIS.accidentalEccentricityRatio),
  };
  const inputStates = normalizeDesignBasisInputStates(input, values);
  const familyStates = normalizeDesignBasisFamilyStates(input, inputStates);
  const optionalFamilyValues = preserveOptionalFamilyValues(input);
  const valueMetadata = buildDesignBasisValueMetadata(input, values, inputStates, occupancy);
  const storyOccupancies = normalizeStoryOccupancies(input.storyOccupancies || input.floorUsages);
  const confirmedFields = [...new Set([
    ...(Array.isArray(input.confirmedFields) ? input.confirmedFields : []),
    ...Object.entries(inputStates).filter(([, state]) => state === 'confirmed').map(([field]) => field),
  ])];
  return {
    version: LOAD_ESTIMATION_VERSION,
    inputVersion: DESIGN_BASIS_INPUT_VERSION,
    status: input.status || 'draft',
    codeSourceId: input.codeSourceId || input.standard?.id || input.codeBasis?.id || null,
    unitSystem: input.unitSystem || null,
    occupancy,
    occupancyLabel: preset.label,
    designMethod: input.designMethod == null || input.designMethod === '' ? null : String(input.designMethod).trim().toLowerCase(),
    standard: clonePlain(input.standard || input.codeBasis || null),
    ...values,
    ...optionalFamilyValues,
    familyInputs: clonePlain(input.familyInputs || {}),
    inputStates,
    familyStates,
    valueMetadata,
    fields: {
      ...(input.fields && typeof input.fields === 'object' ? clonePlain(input.fields) : {}),
      ...Object.fromEntries(Object.entries(valueMetadata).map(([field, metadata]) => [field, {
        value: metadata.value,
        unit: metadata.unit,
        source: metadata.source,
        condition: metadata.condition,
        status: metadata.inputState,
        confirmed: metadata.userConfirmed,
      }])),
    },
    storyOccupancies,
    floorUsages: storyOccupancies.map((item) => ({ ...item })),
    confirmedFields,
    notes: Array.isArray(input.notes) ? input.notes.slice() : [],
  };
}

export function getDesignBasisInputFields() {
  return {
    version: DESIGN_BASIS_INPUT_VERSION,
    occupancyOptions: Object.entries(OCCUPANCY_LOAD_PRESETS).map(([id, preset]) => ({
      id,
      label: preset.label,
      defaults: {
        deadLoad: preset.dead,
        liveLoad: preset.live,
        roofLiveLoad: preset.roofLive,
      },
    })),
    numericFields: DESIGN_BASIS_NUMERIC_FIELDS.map((field) => ({ ...field })),
    loadFamilies: LOAD_FAMILY_DEFINITIONS.map((item) => ({
      id: item.id,
      label: item.label,
      purposes: item.purposes.slice(),
      multi: !!item.multi,
    })),
    inputStates: LOAD_INPUT_STATES.slice(),
  };
}

export function normalizeDesignBasisFamilyStates(input = {}, inputStates = null) {
  const explicit = input.familyStates || input.loadFamilies || {};
  const explicitMap = Array.isArray(explicit)
    ? Object.fromEntries(explicit.map((item) => [typeof item === 'string' ? item : item?.family || item?.id, typeof item === 'string' ? 'confirmed' : item?.state]))
    : explicit;
  const states = {};
  for (const definition of LOAD_FAMILY_DEFINITIONS) states[definition.id] = 'unconfigured';

  states.D = derivedState(inputStates?.deadLoad);
  states.L = derivedState(inputStates?.liveLoad);
  states.Lr = derivedState(inputStates?.roofLiveLoad);
  states.W = strongestState(inputStates?.windPressureX, inputStates?.windPressureY);
  states.E = strongestState(inputStates?.seismicCoefficientX, inputStates?.seismicCoefficientY);

  const optionalInputs = {
    S: ['snowLoad', 'snowPressure'],
    R: ['rainLoad', 'rainPressure'],
    H: ['earthPressure', 'soilPressure'],
    T: ['temperatureLoad', 'temperatureRange'],
    F: ['fluidLoad', 'waterPressure'],
    EQUIPMENT: ['equipmentLoad', 'equipmentWeight'],
    CONSTRUCTION: ['constructionLoad'],
    OTHER: ['otherLoad'],
  };
  for (const [family, keys] of Object.entries(optionalInputs)) {
    const key = keys.find((item) => Object.prototype.hasOwnProperty.call(input, item));
    if (key) states[family] = normalizeLoadInputState(input.inputStates?.[key], input[key]);
  }

  for (const [rawFamily, rawState] of Object.entries(explicitMap || {})) {
    if (!rawFamily) continue;
    const family = normalizeLoadFamily(rawFamily);
    const state = typeof rawState === 'object' ? rawState?.state : rawState;
    states[family] = normalizeLoadInputState(state);
  }
  return states;
}

export function buildDesignBasisValueMetadata(input = {}, values = {}, inputStates = null, occupancy = null) {
  const states = inputStates || normalizeDesignBasisInputStates(input, values);
  const metadata = {};
  for (const field of DESIGN_BASIS_NUMERIC_FIELDS) {
    const explicit = Object.prototype.hasOwnProperty.call(input, field.id) && input[field.id] != null && input[field.id] !== '';
    const supplied = input.valueMetadata?.[field.id] || {};
    const defaultSource = ['deadLoad', 'liveLoad', 'roofLiveLoad'].includes(field.id)
      ? `occupancy-preset:${occupancy}`
      : 'legacy-load-estimation-default';
    metadata[field.id] = {
      value: values[field.id],
      unit: field.unit,
      source: supplied.source || (explicit ? 'project-input' : defaultSource),
      condition: supplied.condition || field.id,
      inputState: supplied.inputState || states[field.id],
      userConfirmed: supplied.userConfirmed === true || states[field.id] === 'confirmed',
    };
  }
  return metadata;
}

export function summarizeAppliedLoadEstimation(estimation) {
  if (!estimation || typeof estimation !== 'object') return null;
  return {
    version: estimation.version || null,
    basis: estimation.basis || null,
    summary: estimation.summary || null,
  };
}

function normalizeDesignBasisInputStates(input, values) {
  const states = {};
  for (const field of DESIGN_BASIS_NUMERIC_FIELDS) {
    const explicitState = input.inputStates?.[field.id] || input.valueMetadata?.[field.id]?.inputState;
    if (explicitState) {
      states[field.id] = normalizeLoadInputState(explicitState, input[field.id]);
      continue;
    }
    const explicitValue = Object.prototype.hasOwnProperty.call(input, field.id) && input[field.id] != null && input[field.id] !== '';
    states[field.id] = explicitValue ? normalizeLoadInputState('confirmed', input[field.id]) : 'candidate';
    if (!Number.isFinite(Number(values[field.id]))) states[field.id] = 'unconfigured';
  }
  return states;
}

function normalizeStoryOccupancies(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && (item.story != null || item.storyId != null))
    .map((item) => ({
      story: item.story ?? item.storyId,
      occupancy: String(item.occupancy || '').trim() || null,
      liveLoad: item.liveLoad == null || item.liveLoad === '' ? null : finite(item.liveLoad),
      unit: item.unit || 'kN/m2',
      source: item.source || 'project-input',
      inputState: normalizeLoadInputState(item.inputState, item.liveLoad),
      userConfirmed: item.userConfirmed === true || item.inputState === 'confirmed',
    }));
}

function preserveOptionalFamilyValues(input) {
  const fields = [
    'snowLoad',
    'snowPressure',
    'rainLoad',
    'rainPressure',
    'earthPressure',
    'soilPressure',
    'temperatureLoad',
    'temperatureRange',
    'fluidLoad',
    'waterPressure',
    'equipmentLoad',
    'equipmentWeight',
    'constructionLoad',
    'otherLoad',
  ];
  const out = {};
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    const value = input[field];
    if (value == null || value === '') out[field] = value;
    else if (Number.isFinite(Number(value))) out[field] = Number(value);
    else out[field] = clonePlain(value);
  }
  return out;
}

function derivedState(state) {
  return state === 'confirmed' ? 'confirmed' : state === 'not-applicable' ? 'not-applicable' : 'candidate';
}

function strongestState(...states) {
  if (states.includes('confirmed')) return 'confirmed';
  if (states.every((state) => state === 'not-applicable')) return 'not-applicable';
  if (states.includes('candidate')) return 'candidate';
  return 'unconfigured';
}

function clonePlain(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}
