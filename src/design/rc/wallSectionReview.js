import { getKcscRuleSources } from '../../metadata/kcscRuleSources.js';

export const WALL_SECTION_REVIEW_VERSION = 'p29-wall-section-review-v1';

// KDS 14 20 72. The minimum ratios, the spacing limit, the thickness limits and
// the two-layer rule are all stated in prose. Equation (4.3-1) of the practical
// design method is an image in the capture and was owner-confirmed against the
// published figure; its origin travels on every result that uses it.
//
// Like the other practical checks this evaluates the reinforcement it is given.
// No reinforcement means NOT_CHECKED, never OK.

// 4.2(2): minimum vertical ratio on the gross area.
const VERTICAL_MINIMUM = Object.freeze({
  'deformed-400-or-higher-d16-or-smaller': 0.0012,
  'deformed-other': 0.0015,
  'welded-wire-16mm-or-smaller': 0.0012,
});

// 4.2(3): minimum horizontal ratio. The first row is an expression rather than
// a constant, and the clause caps fy at 500 MPa inside it.
const HORIZONTAL_MINIMUM = Object.freeze({
  'deformed-400-or-higher-d16-or-smaller': null,
  'deformed-other': 0.0025,
  'welded-wire-16mm-or-smaller': 0.002,
});
const HORIZONTAL_EXPRESSION = Object.freeze({
  expression: '0.0020 * 400 / fy',
  fyCap: 500,
  clause: 'KDS 14 20 72 4.2(3)1',
});

const SPACING_THICKNESS_MULTIPLE = 3;
const SPACING_ABSOLUTE = 0.45;
const TWO_LAYER_THICKNESS = 0.25;
const MINIMUM_THICKNESS = 0.1;
const SUPPORT_SPACING_DIVISOR = 25;
const BASEMENT_MINIMUM_THICKNESS = 0.2;

// 4.3.2(2) equation (4.3-1). The strength reduction factor is inside the
// expression, so the result is already a DESIGN strength and phi must not be
// applied again.
//
//   phi*Pnw = 0.55 * phi * fck * Ag * (1 - (k*lc / (32h))^2)     phi = 0.65
//
// lc is the vertical length between supports and h is the wall thickness, not
// the storey height.
const AXIAL_EQUATION = Object.freeze({
  id: '4.3-1',
  expression: 'phi*Pnw = 0.55 * phi * fck * Ag * (1 - (k*lc/(32h))^2)',
  strengthReductionFactor: 0.65,
  phiIncludedInResult: true,
  origin: 'owner-confirmed against the published KDS 14 20 72:2021 4.3.2 equation image; the captured text renders it as an image',
  clause: 'KDS 14 20 72 4.3.2(2)',
});

// 4.3.2(2), effective length factor by restraint condition.
const EFFECTIVE_LENGTH_FACTOR = Object.freeze({
  'braced-rotation-restrained': 0.8,
  'braced-rotation-free': 1,
  unbraced: 2,
});

// 4.3.2(1): the resultant of the factored load must fall within the middle
// third of the wall thickness, which is an eccentricity of h/6.
const MIDDLE_THIRD_ECCENTRICITY = 1 / 6;

const CHECK_IDS = [
  'wall-thickness',
  'wall-minimum-vertical-reinforcement',
  'wall-minimum-horizontal-reinforcement',
  'wall-bar-spacing',
  'wall-reinforcement-layers',
  'wall-axial-strength',
];

// Each check cites its own clauses, so the central review map can say which
// document a given check actually depends on.
const CHECK_REFERENCES = Object.freeze({
  'wall-thickness': [['142072', '4.3.2(3)']],
  'wall-minimum-vertical-reinforcement': [['142072', '4.2(2)']],
  'wall-minimum-horizontal-reinforcement': [['142072', '4.2(3)']],
  'wall-bar-spacing': [['142072', '4.2(5)']],
  'wall-reinforcement-layers': [['142072', '4.2(4)']],
  // 4.3.1(1) routes a wall carrying axial load with moment to the KDS 14 20 20
  // compression member path, so both documents bear on this one.
  'wall-axial-strength': [['142072', '4.3.2(2)'], ['142020', '4.3.1']],
});

const refs = (checkId) => (CHECK_REFERENCES[checkId] || [])
  .flatMap(([document, clause]) => getKcscRuleSources([document]).map((source) => ({ ...source, clause })));

const base = (checkId) => ({
  version: WALL_SECTION_REVIEW_VERSION,
  codeReferences: refs(checkId),
  qualification: 'clause-scoped-not-whole-design',
  designTransferAllowed: false,
});

const notChecked = (checkId, reason, extra = {}) => ({ ...base(checkId), status: 'NOT_CHECKED', ratio: null, reason, ...extra });
const allNotChecked = (reason) => Object.fromEntries(CHECK_IDS.map((id) => [id, notChecked(id, reason)]));

/**
 * Wall section review against KDS 14 20 72.
 *
 * `verticalReinforcement` and `horizontalReinforcement` describe what is on the
 * wall: bar size, spacing and how many layers. The reinforcement class decides
 * which minimum ratio row applies and is the user's declaration, because the
 * rows separate on bar grade and size in ways a bar diameter alone does not
 * settle.
 */
export function reviewWallSection(input = {}) {
  const {
    thickness,
    clearHeight = null,
    clearLength = null,
    fy,
    verticalReinforcement = null,
    horizontalReinforcement = null,
    reinforcementClass = null,
    isBasementOrFoundationWall = false,
  } = input;

  if (!Number.isFinite(thickness) || thickness <= 0) return allNotChecked('WALL_THICKNESS_REQUIRED');
  if (!Number.isFinite(fy) || fy <= 0) return allNotChecked('WALL_STEEL_STRENGTH_REQUIRED');

  const spacingLimit = Math.min(SPACING_THICKNESS_MULTIPLE * thickness, SPACING_ABSOLUTE);

  return {
    'wall-thickness': thicknessCheck({ thickness, clearHeight, clearLength, isBasementOrFoundationWall }),
    'wall-minimum-vertical-reinforcement': ratioCheck({
      checkId: 'wall-minimum-vertical-reinforcement',
      reinforcement: verticalReinforcement,
      thickness,
      required: verticalMinimum(reinforcementClass),
      direction: 'vertical',
      clause: 'KDS 14 20 72 4.2(2)',
      reinforcementClass,
    }),
    'wall-minimum-horizontal-reinforcement': ratioCheck({
      checkId: 'wall-minimum-horizontal-reinforcement',
      reinforcement: horizontalReinforcement,
      thickness,
      required: horizontalMinimum(reinforcementClass, fy),
      direction: 'horizontal',
      clause: 'KDS 14 20 72 4.2(3)',
      reinforcementClass,
    }),
    'wall-bar-spacing': spacingCheck({ verticalReinforcement, horizontalReinforcement, spacingLimit }),
    'wall-reinforcement-layers': layerCheck({ thickness, verticalReinforcement, horizontalReinforcement }),
    'wall-axial-strength': axialStrengthCheck({ ...input, thickness }),
  };
}

export {
  AXIAL_EQUATION,
  BASEMENT_MINIMUM_THICKNESS,
  EFFECTIVE_LENGTH_FACTOR,
  CHECK_IDS as WALL_CHECK_IDS,
  HORIZONTAL_EXPRESSION,
  HORIZONTAL_MINIMUM,
  MINIMUM_THICKNESS,
  SPACING_ABSOLUTE,
  TWO_LAYER_THICKNESS,
  VERTICAL_MINIMUM,
};

function verticalMinimum(reinforcementClass) {
  if (!reinforcementClass) return { reason: 'WALL_REINFORCEMENT_CLASS_REQUIRED' };
  const ratio = VERTICAL_MINIMUM[reinforcementClass];
  return ratio === undefined ? { reason: 'WALL_REINFORCEMENT_CLASS_NOT_IN_TABLE' } : { ratio };
}

function horizontalMinimum(reinforcementClass, fy) {
  if (!reinforcementClass) return { reason: 'WALL_REINFORCEMENT_CLASS_REQUIRED' };
  if (!(reinforcementClass in HORIZONTAL_MINIMUM)) return { reason: 'WALL_REINFORCEMENT_CLASS_NOT_IN_TABLE' };
  const tabulated = HORIZONTAL_MINIMUM[reinforcementClass];
  if (tabulated !== null) return { ratio: tabulated };
  // 4.2(3)1: 0.0020 * 400 / fy, with fy capped at 500 MPa inside the ratio.
  const cappedFy = Math.min(fy, HORIZONTAL_EXPRESSION.fyCap);
  return {
    ratio: (0.002 * 400) / cappedFy,
    expression: HORIZONTAL_EXPRESSION.expression,
    fyUsed: cappedFy,
    fyCapApplied: fy > HORIZONTAL_EXPRESSION.fyCap,
  };
}

function ratioCheck({ checkId, reinforcement, thickness, required, direction, clause, reinforcementClass }) {
  if (required.reason) return notChecked(checkId, required.reason, { direction, reinforcementClass });
  if (!reinforcement || !Number.isFinite(reinforcement.spacing) || reinforcement.spacing <= 0) {
    return notChecked(checkId, 'MISSING_REINFORCEMENT', { direction });
  }
  const barArea = Number.isFinite(reinforcement.area)
    ? reinforcement.area
    : (Math.PI * reinforcement.diameter ** 2) / 4;
  if (!Number.isFinite(barArea) || barArea <= 0) return notChecked(checkId, 'MISSING_REINFORCEMENT', { direction });

  const layers = Number.isFinite(reinforcement.layers) ? reinforcement.layers : 1;
  // The ratio is taken on the gross area of the wall, so both layers count.
  const providedArea = (barArea * layers) / reinforcement.spacing;
  const grossArea = thickness;
  const providedRatio = providedArea / grossArea;
  const ok = providedRatio >= required.ratio - 1e-12;

  return {
    ...base(checkId),
    status: ok ? 'OK' : 'NG',
    ratio: providedRatio > 0 ? required.ratio / providedRatio : null,
    reason: ok ? null : 'WALL_REINFORCEMENT_RATIO_BELOW_MINIMUM',
    direction,
    clause,
    reinforcementClass,
    providedRatio,
    requiredRatio: required.ratio,
    layers,
    expression: required.expression ?? null,
    fyUsed: required.fyUsed ?? null,
    fyCapApplied: required.fyCapApplied ?? null,
    basis: 'ratio on the gross wall area per KDS 14 20 72 4.2(2),(3)',
  };
}

function spacingCheck({ verticalReinforcement, horizontalReinforcement, spacingLimit }) {
  const rows = [
    ['vertical', verticalReinforcement],
    ['horizontal', horizontalReinforcement],
  ].filter(([, bars]) => bars && Number.isFinite(bars.spacing) && bars.spacing > 0);
  if (!rows.length) return notChecked('wall-bar-spacing', 'MISSING_REINFORCEMENT');

  const checks = rows.map(([direction, bars]) => ({
    direction,
    spacing: bars.spacing,
    status: bars.spacing <= spacingLimit + 1e-12 ? 'OK' : 'NG',
    ratio: bars.spacing / spacingLimit,
  }));
  const failed = checks.find((row) => row.status === 'NG');
  return {
    ...base('wall-bar-spacing'),
    status: failed ? 'NG' : 'OK',
    ratio: Math.max(...checks.map((row) => row.ratio)),
    reason: failed ? 'WALL_BAR_SPACING_EXCEEDS_LIMIT' : null,
    spacingLimit,
    clause: 'KDS 14 20 72 4.2(5)',
    directionChecks: checks,
  };
}

// 4.2(4): a wall 250 mm or thicker carries reinforcement in two layers parallel
// to the faces.
function layerCheck({ thickness, verticalReinforcement, horizontalReinforcement }) {
  if (thickness < TWO_LAYER_THICKNESS) {
    return {
      ...base('wall-reinforcement-layers'),
      status: 'N_A',
      ratio: null,
      reason: 'WALL_BELOW_TWO_LAYER_THICKNESS',
      thickness,
      twoLayerThickness: TWO_LAYER_THICKNESS,
      clause: 'KDS 14 20 72 4.2(4)',
    };
  }
  const rows = [
    ['vertical', verticalReinforcement],
    ['horizontal', horizontalReinforcement],
  ];
  if (rows.some(([, bars]) => !bars)) return notChecked('wall-reinforcement-layers', 'MISSING_REINFORCEMENT');

  const checks = rows.map(([direction, bars]) => ({
    direction,
    layers: Number.isFinite(bars.layers) ? bars.layers : 1,
  }));
  const failed = checks.find((row) => row.layers < 2);
  return {
    ...base('wall-reinforcement-layers'),
    status: failed ? 'NG' : 'OK',
    ratio: null,
    reason: failed ? 'WALL_REQUIRES_TWO_REINFORCEMENT_LAYERS' : null,
    thickness,
    twoLayerThickness: TWO_LAYER_THICKNESS,
    clause: 'KDS 14 20 72 4.2(4)',
    directionChecks: checks,
    // 4.2(4)1,2 also split the required area between the faces and fix each
    // layer's cover; that split is not evaluated here.
    faceDistributionChecked: false,
  };
}

// 4.3.2(3): the thickness floor is the smaller support spacing over 25, and
// never below 100 mm; a basement or foundation wall is never below 200 mm.
function thicknessCheck({ thickness, clearHeight, clearLength, isBasementOrFoundationWall }) {
  const spacings = [clearHeight, clearLength].filter((value) => Number.isFinite(value) && value > 0);
  if (!spacings.length) {
    return notChecked('wall-thickness', 'WALL_SUPPORT_SPACING_REQUIRED', {
      note: '4.3.2(3)1 needs the smaller of the vertical and horizontal support spacing',
      thickness,
    });
  }
  const governingSpacing = Math.min(...spacings);
  const floors = [governingSpacing / SUPPORT_SPACING_DIVISOR, MINIMUM_THICKNESS];
  if (isBasementOrFoundationWall) floors.push(BASEMENT_MINIMUM_THICKNESS);
  const required = Math.max(...floors);

  return {
    ...base('wall-thickness'),
    status: thickness >= required - 1e-12 ? 'OK' : 'NG',
    ratio: required / thickness,
    reason: thickness >= required - 1e-12 ? null : 'WALL_THICKNESS_BELOW_MINIMUM',
    thickness,
    requiredThickness: required,
    governingSupportSpacing: governingSpacing,
    governedBy: required === BASEMENT_MINIMUM_THICKNESS && isBasementOrFoundationWall
      ? 'basement or foundation wall floor'
      : required === MINIMUM_THICKNESS ? 'absolute floor' : 'support spacing / 25',
    clause: 'KDS 14 20 72 4.3.2(3)',
    // 4.1(8) allows the thickness limit to be set aside when a rigorous
    // structural analysis shows the wall is adequate; that route is not
    // evaluated here.
    rigorousAnalysisExemptionChecked: false,
  };
}

// 4.3.2 practical design method. The method's own preconditions are tested
// first: failing one does not make the wall inadequate, it makes this equation
// the wrong tool, so that case is NOT_CHECKED with the condition named rather
// than a pass or fail.
function axialStrengthCheck(input) {
  const {
    thickness,
    fck = null,
    grossArea = null,
    verticalSupportLength = null,
    restraint = null,
    factoredAxialLoad = null,
    factoredMoment = null,
    eccentricity = null,
    rectangularSection = true,
  } = input;

  if (!rectangularSection) {
    return notChecked('wall-axial-strength', 'PRACTICAL_METHOD_REQUIRES_RECTANGULAR_SECTION', {
      clause: 'KDS 14 20 72 4.3.2(1)',
      equation: AXIAL_EQUATION,
    });
  }
  const k = EFFECTIVE_LENGTH_FACTOR[restraint];
  if (!k) {
    return notChecked('wall-axial-strength', 'WALL_RESTRAINT_CONDITION_REQUIRED', {
      available: Object.keys(EFFECTIVE_LENGTH_FACTOR),
      equation: AXIAL_EQUATION,
    });
  }
  if (![fck, verticalSupportLength, factoredAxialLoad].every((value) => Number.isFinite(value) && value > 0)) {
    return notChecked('wall-axial-strength', 'WALL_AXIAL_INPUT_REQUIRED', {
      needs: 'fck, verticalSupportLength and factoredAxialLoad',
      equation: AXIAL_EQUATION,
    });
  }

  // 4.3.2(1): the resultant must land inside the middle third of the
  // thickness. e = Mu/Pu when the eccentricity is not given directly.
  const resolvedEccentricity = Number.isFinite(eccentricity)
    ? Math.abs(eccentricity)
    : (Number.isFinite(factoredMoment) ? Math.abs(factoredMoment) / factoredAxialLoad : null);
  if (resolvedEccentricity === null) {
    return notChecked('wall-axial-strength', 'WALL_LOAD_ECCENTRICITY_REQUIRED', {
      note: '4.3.2(1) needs the resultant position; supply eccentricity, or the factored moment so e = Mu/Pu can be formed',
      equation: AXIAL_EQUATION,
    });
  }
  const eccentricityLimit = MIDDLE_THIRD_ECCENTRICITY * thickness;
  if (resolvedEccentricity > eccentricityLimit + 1e-12) {
    return notChecked('wall-axial-strength', 'RESULTANT_OUTSIDE_MIDDLE_THIRD', {
      clause: 'KDS 14 20 72 4.3.2(1)',
      eccentricity: resolvedEccentricity,
      eccentricityLimit,
      note: 'the practical design method does not apply; 4.3.1(1) routes the wall to the KDS 14 20 20 compression member path instead',
      equation: AXIAL_EQUATION,
    });
  }

  // The equation is written in N, mm and MPa. This module works in metres and
  // kN, so the conversion happens here and both are reported.
  const thicknessMm = thickness * 1000;
  const supportLengthMm = verticalSupportLength * 1000;
  const areaMm2 = Number.isFinite(grossArea) && grossArea > 0
    ? grossArea * 1e6
    : thicknessMm * 1000;
  const slenderTerm = 1 - ((k * supportLengthMm) / (32 * thicknessMm)) ** 2;
  if (slenderTerm <= 0) {
    return notChecked('wall-axial-strength', 'WALL_SLENDERNESS_OUTSIDE_PRACTICAL_METHOD', {
      slendernessTerm: slenderTerm,
      note: 'the bracket term is not positive, so the practical design method yields no strength for this wall',
      equation: AXIAL_EQUATION,
    });
  }

  const designStrengthN = 0.55 * AXIAL_EQUATION.strengthReductionFactor * fck * areaMm2 * slenderTerm;
  const capacity = designStrengthN / 1000;

  return {
    ...base('wall-axial-strength'),
    status: factoredAxialLoad > capacity ? 'NG' : 'OK',
    ratio: capacity > 0 ? factoredAxialLoad / capacity : null,
    reason: factoredAxialLoad > capacity ? 'WALL_AXIAL_LOAD_EXCEEDS_DESIGN_STRENGTH' : null,
    equation: AXIAL_EQUATION,
    demand: factoredAxialLoad,
    capacity,
    effectiveLengthFactor: k,
    restraint,
    slendernessTerm: slenderTerm,
    eccentricity: resolvedEccentricity,
    eccentricityLimit,
    grossArea: areaMm2 / 1e6,
    units: { force: 'kN', length: 'm', strength: 'MPa' },
    // The factor sits inside the equation, so the capacity above is already a
    // design strength.
    strengthReductionFactorAlreadyApplied: true,
    limitations: [
      'this is the practical design method axial strength only, not a completed wall design',
      'shear follows KDS 14 20 22 4.9 through 4.1(5) and is a separate check',
      '4.3.2(1) also requires the 4.1 and 4.2 conditions to be met; those are the other checks in this review and are not re-tested here',
    ],
  };
}
