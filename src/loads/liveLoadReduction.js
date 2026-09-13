import { getKcscRuleSources } from '../metadata/kcscRuleSources.js';

export const LIVE_LOAD_REDUCTION_VERSION = 'p29-live-load-reduction-v1';

// KDS 41 12 00 3.5. C is the fraction of the basic uniform live load that is
// KEPT, not the amount removed: C = 0.65 means 65 percent is applied.
//
// The captured official text carries 3.5.1 to 3.5.3 as prose but renders
// equation (3.5-1) as an image, so the equation below was confirmed separately
// against the published standard and its origin is recorded on every result.
// Everything else here is read straight from the captured clauses.
const EQUATION = Object.freeze({
  id: '3.5-1',
  expression: 'C = 0.3 + 4.2 / sqrt(A)',
  areaUnit: 'm2',
  origin: 'owner-confirmed against the published KDS 41 12 00:2022 3.5.1 equation image',
  // verification/evidence/phase25/kcsc/official-20260911/411200-text.txt line 359
  // is the captured 3.5.1 clause and carries only the label `(3.5-1)`: the
  // equation itself is an image and is absent from the text. Everything else
  // in this module is read from that file; only this expression is not.
  capturedTextHasEquation: false,
});

// 3.5.2(1): influence area is the loaded area times four for columns and
// foundations, twice for beams and walls, and the loaded area itself for slabs.
const INFLUENCE_MULTIPLIER = Object.freeze({
  column: 4,
  foundation: 4,
  beam: 2,
  wall: 2,
  slab: 1,
});

const MINIMUM_INFLUENCE_AREA = 36;
const restricted = (factorFloor, reason) => ({ factorFloor, reason });

// 3.5.3: occupancies that may not be reduced, and the cases where a member
// carrying two or more floors may still keep 0.8.
//
// Public assembly needs the two clauses read together, because 3.5.3(3)
// restricts only "활하중 5kN/m2 이하의 공중집회 용도":
//
//   <= 5 kN/m2, any storey count   3.5.3(3) forbids reduction
//   >  5 kN/m2, one storey         3.5.3(2) forbids reduction
//   >  5 kN/m2, two or more        3.5.3(2) allows C = 0.8
//
// The last line follows the clause text but has no separate official ruling
// behind it, so results reaching it carry `interpretation` naming the reading.
// It reduces the design load, so the basis travels with it.
const OCCUPANCY_RULES = Object.freeze({
  'public-assembly': restricted(null, 'ASSEMBLY_OCCUPANCY_NOT_REDUCIBLE'),
  'passenger-car-parking': restricted(0.8, 'PASSENGER_CAR_PARKING_LIMITED_REDUCTION'),
});
const ASSEMBLY_INTENSITY_LIMIT = 5;
const ASSEMBLY_ABOVE_LIMIT_INTERPRETATION = Object.freeze({
  clauses: 'KDS 41 12 00 3.5.3(2) read with 3.5.3(3)',
  reading: '3.5.3(3) restricts assembly only up to 5 kN/m2, so above it 3.5.3(2) governs and a member carrying two or more floors may keep 0.8',
  basis: 'clause text; no separate official interpretation obtained',
});

const codeReferences = () => getKcscRuleSources(['411200'])
  .map((source) => ({ ...source, clause: '3.5.1; 3.5.2; 3.5.3' }));

const base = () => ({
  version: LIVE_LOAD_REDUCTION_VERSION,
  equation: EQUATION,
  codeReferences: codeReferences(),
  qualification: 'clause-scoped-not-whole-design',
  designTransferAllowed: false,
});

const notReduced = (reason, extra = {}) => ({
  ...base(),
  applied: false,
  factor: 1,
  reason,
  ...extra,
});

/**
 * Live load reduction factor for one member.
 *
 * Missing or unusable input never reduces: the load is kept at full value with
 * the reason recorded, because a reduction lowers the design result and must
 * not happen silently.
 */
export function liveLoadReductionFactor(input = {}) {
  const {
    role,
    loadedArea,
    cantileverArea = 0,
    supportedStoryCount,
    liveLoadIntensity,
    occupancy = 'general',
    isRoofLiveLoad = false,
    oneWaySlab = null,
  } = input;

  if (isRoofLiveLoad) return notReduced('ROOF_LIVE_LOAD_NOT_REDUCIBLE');

  const multiplier = INFLUENCE_MULTIPLIER[role];
  if (!multiplier) return notReduced('LIVE_LOAD_REDUCTION_ROLE_REQUIRED', { role: role ?? null });
  if (!Number.isFinite(loadedArea) || loadedArea <= 0) return notReduced('LOADED_AREA_REQUIRED');
  if (!Number.isFinite(cantileverArea) || cantileverArea < 0) return notReduced('CANTILEVER_AREA_INVALID');
  if (!Number.isInteger(supportedStoryCount) || supportedStoryCount < 1) return notReduced('SUPPORTED_STORY_COUNT_REQUIRED');
  if (!Number.isFinite(liveLoadIntensity) || liveLoadIntensity <= 0) return notReduced('LIVE_LOAD_INTENSITY_REQUIRED');

  // 3.5.2(1): a cantilever part is added to the influence area as it is, with
  // no multiplier.
  const influenceArea = loadedArea * multiplier + cantileverArea;

  // 3.5.3: a one-way slab may only count a width up to 1.5 times its span.
  const widthLimit = oneWaySlabWidthLimit(oneWaySlab);
  if (widthLimit?.exceeded) {
    return notReduced('ONE_WAY_SLAB_WIDTH_LIMIT_EXCEEDED', { influenceArea, oneWaySlab: widthLimit });
  }

  const carriesMultipleStories = supportedStoryCount >= 2;

  // Assembly above 5 kN/m2 leaves 3.5.3(3) and falls to 3.5.3(2).
  const assemblyAboveLimit = occupancy === 'public-assembly' && liveLoadIntensity > ASSEMBLY_INTENSITY_LIMIT;
  if (assemblyAboveLimit && !carriesMultipleStories) {
    return notReduced('LIVE_LOAD_ABOVE_5KPA_NOT_REDUCIBLE', {
      influenceArea,
      occupancy,
      liveLoadIntensity,
      supportedStoryCount,
      interpretation: ASSEMBLY_ABOVE_LIMIT_INTERPRETATION,
    });
  }
  const occupancyRule = assemblyAboveLimit ? null : OCCUPANCY_RULES[occupancy];
  if (occupancyRule && !(carriesMultipleStories && occupancyRule.factorFloor != null)) {
    return notReduced(occupancyRule.reason, { influenceArea, occupancy, supportedStoryCount });
  }

  // 3.5.3: a live load above 5 kN/m2 is not reducible, except that a member
  // carrying two or more floors may still keep 0.8.
  const heavyLive = liveLoadIntensity > 5;
  if (heavyLive && !carriesMultipleStories) {
    return notReduced('LIVE_LOAD_ABOVE_5KPA_NOT_REDUCIBLE', { influenceArea, liveLoadIntensity });
  }

  if (influenceArea < MINIMUM_INFLUENCE_AREA) {
    return notReduced('INFLUENCE_AREA_BELOW_THRESHOLD', {
      influenceArea,
      minimumInfluenceArea: MINIMUM_INFLUENCE_AREA,
    });
  }

  const computed = 0.3 + 4.2 / Math.sqrt(influenceArea);
  const floors = [carriesMultipleStories ? 0.4 : 0.5];
  if (heavyLive) floors.push(0.8);
  if (occupancyRule?.factorFloor != null) floors.push(occupancyRule.factorFloor);
  const factorFloor = Math.max(...floors);
  const factor = Math.min(1, Math.max(computed, factorFloor));
  const interpretation = assemblyAboveLimit ? ASSEMBLY_ABOVE_LIMIT_INTERPRETATION : null;

  return {
    ...base(),
    applied: factor < 1,
    factor,
    computedFactor: computed,
    factorFloor,
    factorFloorGoverns: computed < factorFloor,
    influenceArea,
    loadedArea,
    cantileverArea,
    influenceMultiplier: multiplier,
    minimumInfluenceArea: MINIMUM_INFLUENCE_AREA,
    supportedStoryCount,
    liveLoadIntensity,
    occupancy,
    units: { area: 'm2', intensity: 'kN/m2' },
    basis: 'retained fraction of the basic uniform live load; not a removed fraction',
    interpretation,
    reason: factor < 1 ? null : 'FACTOR_FLOOR_LEAVES_NO_REDUCTION',
  };
}

function oneWaySlabWidthLimit(oneWaySlab) {
  if (!oneWaySlab) return null;
  const { width, span } = oneWaySlab;
  if (!Number.isFinite(width) || !Number.isFinite(span) || span <= 0) {
    return { exceeded: true, reason: 'ONE_WAY_SLAB_SPAN_AND_WIDTH_REQUIRED' };
  }
  const limit = 1.5 * span;
  return { exceeded: width > limit + 1e-9, width, span, widthLimit: limit };
}

export { INFLUENCE_MULTIPLIER, MINIMUM_INFLUENCE_AREA };
