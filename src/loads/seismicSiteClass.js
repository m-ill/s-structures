import { getKcscRuleSources } from '../metadata/kcscRuleSources.js';

export const SEISMIC_SITE_CLASS_VERSION = 'p29-seismic-site-class-v1';

// KDS 17 10 00 4.2.1.2 classifies the ground; KDS 41 17 00 4.1.1 modifies that
// classification for buildings and 4.2.2/4.2.3 turn it into amplification
// factors. Both documents are needed: implementing only the KDS 17 table drops
// the building-specific rules.
//
// The captured text carries the criteria but renders every site-class symbol
// and equation (4.2-1) as an image, so those were confirmed against the
// published standards and the confirmation travels on each result.
const SOURCE_CONFIRMATION = Object.freeze({
  siteClassSymbols: 'owner-confirmed S1..S6 row order in KDS 17 10 00 table 4.2-4',
  amplificationRows: 'owner-confirmed S1..S5 row order in KDS 41 17 00 tables 4.2-1 and 4.2-2',
  averagingEquation: 'owner-confirmed KDS 17 10 00 equation (4.2-1)',
  editionPinned: false,
  editionNote: 'the public capture carries no edition field; the owner read a 2024-03-21 reissue and the 2024-05 correction notice has not been collated, so the edition is not pinned',
});

// (4.2-1) Vs,soil = sum(d_i) / sum(d_i / Vs_i): a travel-time average, not an
// arithmetic mean of the layer velocities.
const AVERAGING_EQUATION = Object.freeze({
  id: '4.2-1',
  expression: 'Vs_soil = sum(d_i) / sum(d_i / Vs_i)',
  document: '171000',
  clause: '4.2.1.2(2)',
});

const BEDROCK_SHEAR_WAVE_VELOCITY = 760;

// KDS 17 10 00 table 4.2-4. Ordered, because classification walks it in order.
const SITE_CLASS_TABLE = Object.freeze([
  { id: 'S1', label: '암반 지반', maxBedrockDepth: 1 },
  { id: 'S2', label: '얕고 단단한 지반', bedrockDepthRange: [1, 20], minVelocity: 260 },
  { id: 'S3', label: '얕고 연약한 지반', bedrockDepthRange: [1, 20], maxVelocity: 260 },
  { id: 'S4', label: '깊고 단단한 지반', minBedrockDepth: 20, minVelocity: 180 },
  { id: 'S5', label: '깊고 연약한 지반', minBedrockDepth: 20, maxVelocity: 180 },
  { id: 'S6', label: '부지 고유의 특성평가 및 지반응답해석이 필요한 지반' },
]);

// KDS 41 17 00 tables 4.2-1 and 4.2-2, by effective ground acceleration S.
// S6 is deliberately absent: the standard gives it no coefficients because it
// requires a site response analysis. Borrowing the S5 row would silently invent
// a value, so S6 returns NOT_CHECKED instead.
const AMPLIFICATION_ANCHORS = Object.freeze([0.1, 0.2, 0.3]);
const SHORT_PERIOD_AMPLIFICATION = Object.freeze({
  S1: [1.12, 1.12, 1.12],
  S2: [1.4, 1.4, 1.3],
  S3: [1.7, 1.5, 1.3],
  S4: [1.6, 1.4, 1.2],
  S5: [1.8, 1.3, 1.3],
});
const ONE_SECOND_AMPLIFICATION = Object.freeze({
  S1: [0.84, 0.84, 0.84],
  S2: [1.5, 1.4, 1.3],
  S3: [1.7, 1.6, 1.5],
  S4: [2.2, 2.0, 1.8],
  S5: [3.0, 2.7, 2.4],
});

const codeReferences = () => [
  ...getKcscRuleSources(['171000']).map((source) => ({ ...source, clause: '4.2.1.2' })),
  ...getKcscRuleSources(['411700']).map((source) => ({ ...source, clause: '4.1.1; 4.1.3; 4.2.2; 4.2.3' })),
];

const base = () => ({
  version: SEISMIC_SITE_CLASS_VERSION,
  sourceConfirmation: SOURCE_CONFIRMATION,
  codeReferences: codeReferences(),
  qualification: 'clause-scoped-not-whole-design',
  designTransferAllowed: false,
});

const notDerived = (reason, extra = {}) => ({
  ...base(),
  derived: false,
  siteClass: null,
  reason,
  ...extra,
});

/**
 * Travel-time average shear wave velocity of the soil column, KDS 17 10 00
 * equation (4.2-1).
 *
 * Returns null with a reason rather than a number when a layer is unusable: an
 * average computed from partial data would be indistinguishable from a measured
 * one downstream.
 */
export function averageShearWaveVelocity(layers = [], options = {}) {
  const { depthLimit = null } = options;
  if (!Array.isArray(layers) || !layers.length) {
    return { ok: false, reason: 'SOIL_LAYERS_REQUIRED', equation: AVERAGING_EQUATION };
  }

  let depthUsed = 0;
  let travelTime = 0;
  const used = [];
  for (const layer of layers) {
    const thickness = Number(layer?.thickness);
    const velocity = Number(layer?.shearWaveVelocity);
    if (!Number.isFinite(thickness) || thickness <= 0 || !Number.isFinite(velocity) || velocity <= 0) {
      return { ok: false, reason: 'SOIL_LAYER_THICKNESS_AND_VELOCITY_REQUIRED', equation: AVERAGING_EQUATION };
    }
    // 4.1.1(1)2: when bedrock sits deeper than 30 m from the reference plane,
    // the average over the upper 30 m may be used instead.
    const remaining = depthLimit === null ? thickness : Math.min(thickness, depthLimit - depthUsed);
    if (remaining <= 0) break;
    depthUsed += remaining;
    travelTime += remaining / velocity;
    used.push({ thickness: remaining, shearWaveVelocity: velocity });
  }

  if (depthUsed <= 0 || travelTime <= 0) {
    return { ok: false, reason: 'SOIL_LAYERS_REQUIRED', equation: AVERAGING_EQUATION };
  }
  return {
    ok: true,
    velocity: depthUsed / travelTime,
    depthUsed,
    layersUsed: used,
    truncatedToDepthLimit: depthLimit !== null && depthUsed >= depthLimit - 1e-9,
    equation: AVERAGING_EQUATION,
    units: { thickness: 'm', velocity: 'm/s' },
  };
}

/**
 * Site class from ground conditions.
 *
 * Every relaxation in KDS 41 17 00 4.1.1(1) is written "may be applied", so it
 * is opt-in through `allowances` and each one that fires is listed on the
 * result. A relaxation that lowers the demand must be visible.
 */
export function deriveSiteClass(input = {}) {
  const {
    bedrockDepth = null,
    averageShearWaveVelocity: providedVelocity = null,
    soilLayers = null,
    siteSpecificConditions = null,
    allowances = {},
    referencePlane = null,
  } = input;

  // 4.2.1.2(4): the site-specific conditions decide S6 on their own, before any
  // depth or velocity test, and the owner's review made the point that stopping
  // at the depth/velocity table would miss them.
  const siteSpecific = siteSpecificTriggers(siteSpecificConditions, bedrockDepth);
  if (siteSpecific.length) {
    return {
      ...base(),
      derived: true,
      siteClass: 'S6',
      siteClassLabel: SITE_CLASS_TABLE.find((row) => row.id === 'S6').label,
      reason: null,
      siteSpecificTriggers: siteSpecific,
      amplification: null,
      amplificationStatus: 'NOT_CHECKED',
      amplificationReason: 'S6_REQUIRES_SITE_RESPONSE_ANALYSIS',
      appliedAllowances: [],
      referencePlane: referencePlane ?? 'completed-ground-surface per KDS 41 17 00 4.1.3(1)',
    };
  }

  // Number(null) is 0, so the raw value is tested before conversion: an
  // undeclared bedrock depth must not read as a depth of zero and classify the
  // site as rock.
  const depthKnown = typeof bedrockDepth === 'number' && Number.isFinite(bedrockDepth) && bedrockDepth >= 0;
  const depth = depthKnown ? bedrockDepth : NaN;
  const appliedAllowances = [];

  // 4.1.1(1)1: bedrock shallower than 3 m may be taken as S1.
  if (depthKnown && depth < 3 && allowances.shallowBedrockAsS1) {
    appliedAllowances.push({
      clause: 'KDS 41 17 00 4.1.1(1)1',
      effect: 'bedrock shallower than 3 m taken as S1',
    });
    return siteClassResult('S1', { bedrockDepth: depth, appliedAllowances, referencePlane });
  }

  if (!depthKnown) {
    // 4.1.1(1)3: with insufficient data and no possibility of S5, S4 may be used.
    if (allowances.insufficientDataAsS4) {
      appliedAllowances.push({
        clause: 'KDS 41 17 00 4.1.1(1)3',
        effect: 'S4 applied with insufficient classification data',
        precondition: 'declared that S5 is not possible',
      });
      return siteClassResult('S4', { bedrockDepth: null, appliedAllowances, referencePlane, bedrockDepthUnknown: true });
    }
    return notDerived('BEDROCK_DEPTH_REQUIRED', { appliedAllowances });
  }

  if (depth < 1) return siteClassResult('S1', { bedrockDepth: depth, appliedAllowances, referencePlane });

  // 4.1.1(1)2: past 30 m the upper 30 m average may stand in for the soil average.
  const depthLimit = depth > 30 && allowances.upper30mAverage ? 30 : null;
  if (depthLimit) {
    appliedAllowances.push({
      clause: 'KDS 41 17 00 4.1.1(1)2',
      effect: 'average shear wave velocity taken over the upper 30 m',
    });
  }

  let velocity = Number(providedVelocity);
  let velocitySource = 'provided';
  let averaging = null;
  if (!Number.isFinite(velocity) || velocity <= 0) {
    averaging = averageShearWaveVelocity(soilLayers ?? [], { depthLimit });
    if (!averaging.ok) return notDerived(averaging.reason, { bedrockDepth: depth, appliedAllowances });
    velocity = averaging.velocity;
    velocitySource = 'computed-from-layers';
  }

  // 4.2.1.2(3): at or below 120 m/s the ground is S5 regardless of depth.
  if (velocity <= 120) {
    return siteClassResult('S5', {
      bedrockDepth: depth,
      averageShearWaveVelocity: velocity,
      velocitySource,
      averaging,
      appliedAllowances,
      referencePlane,
      governedBy: 'KDS 17 10 00 4.2.1.2(3) low-velocity rule',
    });
  }

  const id = depth <= 20
    ? (velocity >= 260 ? 'S2' : 'S3')
    : (velocity >= 180 ? 'S4' : 'S5');

  return siteClassResult(id, {
    bedrockDepth: depth,
    averageShearWaveVelocity: velocity,
    velocitySource,
    averaging,
    appliedAllowances,
    referencePlane,
  });
}

/**
 * Fa and Fv for a site class and effective ground acceleration.
 *
 * S here is the effective ground acceleration, a different quantity from the
 * site-class symbols S1..S6 that share the letter.
 */
export function amplificationFactors(siteClass, effectiveGroundAcceleration, options = {}) {
  const { bedrockDepth = null, averageShearWaveVelocity: velocity = null, bedrockDepthUnknown = false } = options;

  if (siteClass === 'S6') {
    return {
      ...base(),
      status: 'NOT_CHECKED',
      reason: 'S6_REQUIRES_SITE_RESPONSE_ANALYSIS',
      note: 'the standard gives S6 no tabulated coefficients; the S5 row is not a substitute',
      siteClass,
    };
  }
  if (!SHORT_PERIOD_AMPLIFICATION[siteClass]) {
    return { ...base(), status: 'NOT_CHECKED', reason: 'SITE_CLASS_REQUIRED', siteClass: siteClass ?? null };
  }
  const s = Number(effectiveGroundAcceleration);
  if (!Number.isFinite(s) || s <= 0) {
    return { ...base(), status: 'NOT_CHECKED', reason: 'EFFECTIVE_GROUND_ACCELERATION_REQUIRED', siteClass };
  }

  let fa = interpolate(SHORT_PERIOD_AMPLIFICATION[siteClass], s);
  let fv = interpolate(ONE_SECOND_AMPLIFICATION[siteClass], s);
  const adjustments = [];

  // 4.2.2(2): deep bedrock with a stiff column takes 80% of the tabulated Fv.
  const depth = Number(bedrockDepth);
  const stiff = Number(velocity);
  if (Number.isFinite(depth) && depth > 20 && Number.isFinite(stiff) && stiff >= 360) {
    fv *= 0.8;
    adjustments.push({ clause: 'KDS 41 17 00 4.2.2(2)', effect: 'Fv taken as 80% of the tabulated value', factor: 0.8 });
  }
  // 4.2.2(3): S5 with an unclear bedrock depth takes 110% of both.
  if (siteClass === 'S5' && bedrockDepthUnknown) {
    fa *= 1.1;
    fv *= 1.1;
    adjustments.push({ clause: 'KDS 41 17 00 4.2.2(3)', effect: 'Fa and Fv taken as 110% of the tabulated values', factor: 1.1 });
  }

  return {
    ...base(),
    status: 'OK',
    reason: null,
    siteClass,
    effectiveGroundAcceleration: s,
    shortPeriodAmplification: fa,
    oneSecondAmplification: fv,
    interpolated: !AMPLIFICATION_ANCHORS.includes(s),
    anchors: AMPLIFICATION_ANCHORS.slice(),
    adjustments,
    symbolNote: 'S is the effective ground acceleration; the site-class symbols S1..S6 are a different quantity',
  };
}

export {
  AMPLIFICATION_ANCHORS,
  AVERAGING_EQUATION,
  BEDROCK_SHEAR_WAVE_VELOCITY,
  ONE_SECOND_AMPLIFICATION,
  SHORT_PERIOD_AMPLIFICATION,
  SITE_CLASS_TABLE,
  SOURCE_CONFIRMATION,
};

function siteClassResult(id, extra) {
  const row = SITE_CLASS_TABLE.find((entry) => entry.id === id);
  return {
    ...base(),
    derived: true,
    siteClass: id,
    siteClassLabel: row.label,
    reason: null,
    siteSpecificTriggers: [],
    bedrockShearWaveVelocity: BEDROCK_SHEAR_WAVE_VELOCITY,
    units: { depth: 'm', velocity: 'm/s' },
    ...extra,
    // After the spread: an absent referencePlane in extra must not overwrite
    // the 4.1.3(1) default with null.
    referencePlane: extra.referencePlane ?? 'completed-ground-surface per KDS 41 17 00 4.1.3(1)',
  };
}

// 4.2.1.2(4)1~5. Each is a declared condition, not something derivable from
// depth and velocity, so an undeclared condition is simply absent rather than
// assumed false-and-verified.
function siteSpecificTriggers(conditions, bedrockDepth) {
  const flags = conditions && typeof conditions === 'object' ? conditions : {};
  const triggers = [];
  if (flags.liquefiableOrCollapsible) triggers.push({ clause: '4.2.1.2(4)1', condition: '액상화·고예민비·붕괴성 흙' });
  if (flags.peatOrHighlyOrganicClayThickness > 3) triggers.push({ clause: '4.2.1.2(4)2', condition: '이탄/유기질 점토 두께 > 3 m' });
  if (flags.highPlasticityClayThickness > 7 && flags.plasticityIndex > 75) {
    triggers.push({ clause: '4.2.1.2(4)3', condition: '고소성 점토 두께 > 7 m 이고 소성지수 > 75' });
  }
  if (flags.softToMediumClayThickness > 36) triggers.push({ clause: '4.2.1.2(4)4', condition: '연약~중간 점토 두께 > 36 m' });
  const depth = Number(bedrockDepth);
  if (Number.isFinite(depth) && depth > 50) triggers.push({ clause: '4.2.1.2(4)5', condition: '기반암 깊이 > 50 m' });
  return triggers;
}

// "표에서 S의 중간값에 대하여는 직선보간한다."
function interpolate(row, s) {
  if (s <= AMPLIFICATION_ANCHORS[0]) return row[0];
  if (s >= AMPLIFICATION_ANCHORS[AMPLIFICATION_ANCHORS.length - 1]) return row[row.length - 1];
  for (let i = 1; i < AMPLIFICATION_ANCHORS.length; i += 1) {
    const low = AMPLIFICATION_ANCHORS[i - 1];
    const high = AMPLIFICATION_ANCHORS[i];
    if (s <= high) return row[i - 1] + ((row[i] - row[i - 1]) * (s - low)) / (high - low);
  }
  return row[row.length - 1];
}
