import { LOAD_ESTIMATION_VERSION } from './loadEstimationConstants.js';
import { finite } from './loadMath.js';

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
};

export const DESIGN_BASIS_NUMERIC_FIELDS = [
  { id: 'deadLoad', label: 'Dead load', unit: 'kN/m2', min: 0, step: 0.1 },
  { id: 'liveLoad', label: 'Live load', unit: 'kN/m2', min: 0, step: 0.1 },
  { id: 'roofLiveLoad', label: 'Roof live', unit: 'kN/m2', min: 0, step: 0.1 },
  { id: 'windPressureX', label: 'Wind X', unit: 'kN/m2', min: 0, step: 0.05 },
  { id: 'windPressureY', label: 'Wind Y', unit: 'kN/m2', min: 0, step: 0.05 },
  { id: 'seismicCoefficientX', label: 'Seismic X', unit: 'g', min: 0, step: 0.01 },
  { id: 'seismicCoefficientY', label: 'Seismic Y', unit: 'g', min: 0, step: 0.01 },
  { id: 'seismicLiveLoadFactor', label: 'Seismic live factor', unit: '-', min: 0, step: 0.05 },
];

export function createDesignBasis(input = {}) {
  const occupancy = input.occupancy || DEFAULT_DESIGN_BASIS.occupancy;
  const preset = OCCUPANCY_LOAD_PRESETS[occupancy] || OCCUPANCY_LOAD_PRESETS.office;
  return {
    version: LOAD_ESTIMATION_VERSION,
    occupancy,
    occupancyLabel: preset.label,
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
  };
}

export function summarizeAppliedLoadEstimation(estimation) {
  if (!estimation || typeof estimation !== 'object') return null;
  return {
    version: estimation.version || null,
    basis: estimation.basis || null,
    summary: estimation.summary || null,
  };
}
