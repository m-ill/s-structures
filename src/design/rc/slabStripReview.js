import { evaluateKdsSection } from './kdsStrength.js';
import { getKcscRuleSources } from '../../metadata/kcscRuleSources.js';

export const SLAB_STRIP_REVIEW_VERSION = 'p29-slab-strip-review-v1';

// KDS 14 20 70 4.1.1: a one-way slab is designed as a strip of unit width, so
// this evaluates a 1 m strip through the existing section evaluator instead of
// introducing a second flexural engine. Shear follows the footing path already
// in the repository, including the KDS 14 20 22 4.3.3(1) exemption from minimum
// shear reinforcement that slabs share with footings.
//
// Like every other practical check, this evaluates the reinforcement it is
// given. No bars means NOT_CHECKED, never OK.
const STRIP_WIDTH = 1;
const MINIMUM_THICKNESS = 0.1;

// 4.1.1.3(2). Two limits apply at once and the smaller governs.
const SPACING_LIMITS = Object.freeze({
  critical: { thicknessMultiple: 2, absolute: 0.3, clause: 'KDS 14 20 70 4.1.1.3(2) 위험단면' },
  other: { thicknessMultiple: 3, absolute: 0.45, clause: 'KDS 14 20 70 4.1.1.3(2) 기타 단면' },
});

// KDS 14 20 50 4.6.2. The ratio for fy above 400 MPa is an equation the capture
// renders as an image, so it is not implemented; that branch reports why rather
// than falling back to the 400 MPa value, which would understate the steel.
const SHRINKAGE = Object.freeze({
  ratioUpTo400: 0.002,
  absoluteFloor: 0.0014,
  areaCapPerMetre: 0.0018,
  spacingThicknessMultiple: 5,
  spacingAbsolute: 0.45,
  clause: 'KDS 14 20 50 4.6.1(1); 4.6.2(1)~(3)',
});

// Each check cites its own clauses rather than the module's whole set, so the
// central review map can say which document a given check actually depends on.
const CHECK_REFERENCES = Object.freeze({
  'slab-thickness': [['142070', '4.1.1.3(1)'], ['142030', '4.2.1']],
  'slab-flexure': [['142070', '4.1.1.1'], ['142020', '4.1']],
  'slab-one-way-shear': [['142022', '4.2.1(1); 4.3.3(1)']],
  'slab-bar-spacing': [['142070', '4.1.1.3(2)']],
  'slab-shrinkage-temperature': [['142050', '4.6.1; 4.6.2'], ['142070', '4.1.1.3(3)']],
});

const refs = (checkId) => (CHECK_REFERENCES[checkId] || [])
  .flatMap(([document, clause]) => getKcscRuleSources([document]).map((source) => ({ ...source, clause })));

const base = (checkId) => ({
  version: SLAB_STRIP_REVIEW_VERSION,
  codeReferences: refs(checkId),
  qualification: 'clause-scoped-not-whole-design',
  designTransferAllowed: false,
});

const notChecked = (checkId, reason, extra = {}) => ({ ...base(checkId), status: 'NOT_CHECKED', ratio: null, reason, ...extra });
const CHECK_IDS = ['slab-thickness', 'slab-flexure', 'slab-one-way-shear', 'slab-bar-spacing', 'slab-shrinkage-temperature'];
const allNotChecked = (reason) => Object.fromEntries(CHECK_IDS.map((id) => [id, notChecked(id, reason)]));

/**
 * One-way slab strip review over a unit width.
 *
 * `stations` are the sections the caller decided to check; this does not invent
 * them. Each carries its own demand, its own reinforcement and whether it is a
 * critical section, because the spacing limit differs there.
 */
export function reviewOneWaySlabStrip(input = {}) {
  const { thickness, cover, fck, fy, Es = 200000, stations = [], transverseReinforcement = null, spanRatio = null } = input;

  // 4.1.1.1(2): past a long-to-short ratio of 2 the slab is one-way; at or
  // below it the two-way provisions apply and this strip review is the wrong
  // check to be running.
  if (Number.isFinite(spanRatio) && spanRatio < 2) {
    return allNotChecked('SPAN_RATIO_BELOW_TWO_WAY_THRESHOLD');
  }
  if (![thickness, cover, fck, fy].every((value) => Number.isFinite(value) && value > 0)) {
    return allNotChecked('SLAB_GEOMETRY_AND_MATERIAL_REQUIRED');
  }
  if (!Array.isArray(stations) || !stations.length) {
    return allNotChecked('MISSING_REINFORCEMENT');
  }

  const thicknessCheck = {
    ...base('slab-thickness'),
    status: thickness >= MINIMUM_THICKNESS ? 'OK' : 'NG',
    ratio: MINIMUM_THICKNESS / thickness,
    reason: thickness >= MINIMUM_THICKNESS ? null : 'SLAB_THICKNESS_BELOW_MINIMUM',
    thickness,
    minimumThickness: MINIMUM_THICKNESS,
    clause: 'KDS 14 20 70 4.1.1.3(1)',
    // 4.1.1.3(1) also defers to KDS 14 20 30 4.2.1 for the deflection-governed
    // thickness, which is a different and usually larger requirement.
    deflectionThicknessChecked: false,
  };

  const flexure = [];
  const shear = [];
  const spacing = [];
  for (const station of stations) {
    const evaluated = reviewStation(station, { thickness, cover, fck, fy, Es });
    if (evaluated.reason) return allNotChecked(evaluated.reason);
    flexure.push(evaluated.flexure);
    shear.push(evaluated.shear);
    spacing.push(evaluated.spacing);
  }

  return {
    'slab-thickness': thicknessCheck,
    'slab-flexure': { ...worst(flexure), stationChecks: flexure },
    'slab-one-way-shear': { ...worst(shear), stationChecks: shear },
    'slab-bar-spacing': { ...worst(spacing), stationChecks: spacing },
    'slab-shrinkage-temperature': shrinkageTemperature(transverseReinforcement, { thickness, fy }),
  };
}

export { CHECK_IDS as SLAB_STRIP_CHECK_IDS, MINIMUM_THICKNESS, SHRINKAGE, SPACING_LIMITS, STRIP_WIDTH };

function reviewStation(station, { thickness, cover, fck, fy, Es }) {
  const { id = null, kind = 'other', moment = null, shear: shearDemand = null, bars = null, face = null } = station || {};
  if (!bars || !Number.isFinite(bars.diameter) || bars.diameter <= 0) return { reason: 'MISSING_REINFORCEMENT' };
  if (!Number.isFinite(bars.spacing) || bars.spacing <= 0) return { reason: 'BAR_SPACING_REQUIRED' };
  if (!Number.isFinite(moment)) return { reason: 'STATION_MOMENT_REQUIRED' };

  const effectiveDepth = thickness - cover - bars.diameter / 2;
  if (!(effectiveDepth > 0)) return { reason: 'SLAB_EFFECTIVE_DEPTH_NOT_POSITIVE' };

  // The bars sit on the tension face, which the sign of the moment decides: a
  // negative moment puts the steel on top.
  const tensionFace = face ?? (moment < 0 ? 'top' : 'bottom');
  const barArea = Number.isFinite(bars.area) ? bars.area : (Math.PI * bars.diameter ** 2) / 4;
  const count = STRIP_WIDTH / bars.spacing;
  const steelArea = barArea * count;

  const layers = [];
  for (let index = 0; index < Math.max(1, Math.round(count)); index += 1) {
    layers.push({
      face: tensionFace,
      y: (tensionFace === 'bottom' ? 1 : -1) * (thickness / 2 - effectiveDepth),
      z: -STRIP_WIDTH / 2 + bars.spacing * (index + 0.5),
      diameter: bars.diameter,
      area: barArea,
    });
  }

  const section = evaluateKdsSection(
    { B: STRIP_WIDTH, H: thickness },
    layers,
    { fc: fck, fy, Es },
    { N: 0, My: 0, Mz: -moment },
  );

  // KDS 14 20 22 4.2.1(1) with the 4.3.3(1) exemption: a slab needs no minimum
  // shear reinforcement, so the concrete alone carries the check.
  const shearRow = Number.isFinite(shearDemand)
    ? oneWayShear(Math.abs(shearDemand), { fck, effectiveDepth })
    : notChecked('slab-one-way-shear', 'STATION_SHEAR_REQUIRED');

  const limit = SPACING_LIMITS[kind] ?? SPACING_LIMITS.other;
  const spacingLimit = Math.min(limit.thicknessMultiple * thickness, limit.absolute);

  return {
    flexure: {
      ...section,
      stationId: id,
      kind,
      demand: Math.abs(moment),
      signedMoment: moment,
      tensionFace,
      effectiveDepth,
      steelArea,
      barsPerMetre: count,
    },
    shear: { ...shearRow, stationId: id, kind, effectiveDepth },
    spacing: {
      ...base('slab-bar-spacing'),
      status: bars.spacing <= spacingLimit + 1e-12 ? 'OK' : 'NG',
      ratio: bars.spacing / spacingLimit,
      reason: bars.spacing <= spacingLimit + 1e-12 ? null : 'SLAB_BAR_SPACING_EXCEEDS_LIMIT',
      stationId: id,
      kind,
      spacing: bars.spacing,
      spacingLimit,
      governedBy: limit.thicknessMultiple * thickness <= limit.absolute ? 'thickness multiple' : 'absolute limit',
      clause: limit.clause,
    },
  };
}

function oneWayShear(demand, { fck, effectiveDepth }) {
  const Vc = (Math.min(Math.sqrt(fck), 8.4) * STRIP_WIDTH * effectiveDepth * 1000) / 6;
  const capacity = 0.75 * Vc;
  return {
    ...base('slab-one-way-shear'),
    status: demand > capacity ? 'NG' : 'OK',
    ratio: capacity > 0 ? demand / capacity : null,
    reason: demand > capacity ? 'SLAB_ONE_WAY_SHEAR_EXCEEDS_CAPACITY' : null,
    demand,
    capacity,
    Vc,
    phi: 0.75,
    minimumShearReinforcementException: 'KDS 14 20 22 4.3.3(1) slabs',
    units: { force: 'kN per metre of width' },
  };
}

// KDS 14 20 50 4.6.2, placed perpendicular to the flexural steel.
function shrinkageTemperature(reinforcement, { thickness, fy }) {
  if (!reinforcement || !Number.isFinite(reinforcement.spacing) || reinforcement.spacing <= 0) {
    return notChecked('slab-shrinkage-temperature', 'MISSING_TRANSVERSE_REINFORCEMENT');
  }
  if (fy > 400) {
    return notChecked('slab-shrinkage-temperature', 'SHRINKAGE_STEEL_RATIO_EQUATION_NOT_IN_CAPTURED_TEXT', {
      fy,
      note: 'KDS 14 20 50 4.6.2(1)2 gives the ratio for fy above 400 MPa as an equation the capture renders as an image; the 400 MPa ratio is not substituted because it would understate the steel',
    });
  }

  const barArea = Number.isFinite(reinforcement.area)
    ? reinforcement.area
    : (Math.PI * reinforcement.diameter ** 2) / 4;
  const providedArea = barArea * (STRIP_WIDTH / reinforcement.spacing);
  const grossArea = STRIP_WIDTH * thickness;
  const ratioRequirement = Math.max(SHRINKAGE.ratioUpTo400, SHRINKAGE.absoluteFloor);
  // 4.6.2(2) caps the required area at 1,800 mm2 per metre of width.
  const requiredArea = Math.min(ratioRequirement * grossArea, SHRINKAGE.areaCapPerMetre);
  const spacingLimit = Math.min(SHRINKAGE.spacingThicknessMultiple * thickness, SHRINKAGE.spacingAbsolute);

  const areaOk = providedArea >= requiredArea - 1e-12;
  const spacingOk = reinforcement.spacing <= spacingLimit + 1e-12;
  return {
    ...base('slab-shrinkage-temperature'),
    status: areaOk && spacingOk ? 'OK' : 'NG',
    ratio: requiredArea > 0 ? requiredArea / providedArea : null,
    reason: areaOk
      ? (spacingOk ? null : 'SHRINKAGE_STEEL_SPACING_EXCEEDS_LIMIT')
      : 'SHRINKAGE_STEEL_AREA_BELOW_MINIMUM',
    providedArea,
    requiredArea,
    requiredRatio: ratioRequirement,
    areaCapApplied: ratioRequirement * grossArea > SHRINKAGE.areaCapPerMetre,
    spacing: reinforcement.spacing,
    spacingLimit,
    clause: SHRINKAGE.clause,
    // 4.6.1(3): the tabulated minimum is for members not severely restrained.
    severeRestraintChecked: false,
  };
}

const PRIORITY = { OK: 0, NG: 1, NOT_CHECKED: 2, FAILED: 3 };

function worst(rows) {
  return rows.reduce((carried, row) => {
    if (!carried) return row;
    const higher = PRIORITY[row.status] > PRIORITY[carried.status];
    const sameButWorse = PRIORITY[row.status] === PRIORITY[carried.status] && (row.ratio || 0) > (carried.ratio || 0);
    return higher || sameButWorse ? row : carried;
  }, null);
}
