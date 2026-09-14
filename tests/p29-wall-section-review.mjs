import assert from 'node:assert/strict';
import {
  AXIAL_EQUATION,
  EFFECTIVE_LENGTH_FACTOR,
  HORIZONTAL_EXPRESSION,
  TWO_LAYER_THICKNESS,
  VERTICAL_MINIMUM,
  WALL_CHECK_IDS,
  reviewWallSection,
} from '../src/design/rc/wallSectionReview.js';

// KDS 14 20 72. The ratios, spacing, thickness and layer rules are prose and
// implemented; the practical design method's axial strength equation (4.3-1) is
// an image in the capture and was owner-confirmed against the published figure.

const wall = {
  thickness: 0.3,
  clearHeight: 3.5,
  clearLength: 6,
  fy: 400,
  reinforcementClass: 'deformed-400-or-higher-d16-or-smaller',
  verticalReinforcement: { diameter: 0.013, spacing: 0.3, layers: 2 },
  horizontalReinforcement: { diameter: 0.013, spacing: 0.25, layers: 2 },
};

const result = reviewWallSection(wall);
assert.deepEqual(Object.keys(result).sort(), [...WALL_CHECK_IDS].sort());
for (const id of WALL_CHECK_IDS) {
  assert.equal(result[id].designTransferAllowed, false, id);
  assert.ok(result[id].codeReferences.length > 0, id);
}
assert.equal(result['wall-thickness'].status, 'OK');
assert.equal(result['wall-minimum-vertical-reinforcement'].status, 'OK');
assert.equal(result['wall-minimum-horizontal-reinforcement'].status, 'OK');
assert.equal(result['wall-bar-spacing'].status, 'OK');
assert.equal(result['wall-reinforcement-layers'].status, 'OK');

// 4.2(2): the three rows of the minimum vertical ratio.
assert.deepEqual(VERTICAL_MINIMUM, {
  'deformed-400-or-higher-d16-or-smaller': 0.0012,
  'deformed-other': 0.0015,
  'welded-wire-16mm-or-smaller': 0.0012,
});
assert.equal(result['wall-minimum-vertical-reinforcement'].requiredRatio, 0.0012);
assert.equal(reviewWallSection({ ...wall, reinforcementClass: 'deformed-other' })['wall-minimum-vertical-reinforcement'].requiredRatio, 0.0015);

// Both layers count toward the ratio, which is taken on the gross wall area.
const oneLayer = reviewWallSection({
  ...wall,
  verticalReinforcement: { diameter: 0.013, spacing: 0.3, layers: 1 },
});
assert.ok(oneLayer['wall-minimum-vertical-reinforcement'].providedRatio
  < result['wall-minimum-vertical-reinforcement'].providedRatio);
assert.equal(oneLayer['wall-minimum-vertical-reinforcement'].layers, 1);
// Thin bars far apart fall short.
assert.equal(reviewWallSection({
  ...wall,
  verticalReinforcement: { diameter: 0.01, spacing: 0.44, layers: 1 },
})['wall-minimum-vertical-reinforcement'].reason, 'WALL_REINFORCEMENT_RATIO_BELOW_MINIMUM');

// 4.2(3)1 is an expression, not a constant: 0.0020 x 400 / fy, with fy capped
// at 500 MPa inside the ratio.
assert.equal(HORIZONTAL_EXPRESSION.fyCap, 500);
const horizontal = result['wall-minimum-horizontal-reinforcement'];
assert.ok(Math.abs(horizontal.requiredRatio - 0.002) < 1e-12);
assert.equal(horizontal.fyUsed, 400);
assert.equal(horizontal.fyCapApplied, false);
const capped = reviewWallSection({ ...wall, fy: 600 })['wall-minimum-horizontal-reinforcement'];
assert.ok(Math.abs(capped.requiredRatio - 0.0016) < 1e-12);
assert.equal(capped.fyUsed, 500);
assert.equal(capped.fyCapApplied, true);
// The other rows are constants and ignore fy.
assert.equal(reviewWallSection({ ...wall, fy: 600, reinforcementClass: 'deformed-other' })['wall-minimum-horizontal-reinforcement'].requiredRatio, 0.0025);

// 4.2(5): spacing at most 3t and 450 mm, the smaller governing. At 300 mm 3t is
// 900 mm, so 450 governs.
assert.equal(result['wall-bar-spacing'].spacingLimit, 0.45);
assert.equal(reviewWallSection({
  ...wall,
  horizontalReinforcement: { diameter: 0.013, spacing: 0.5, layers: 2 },
})['wall-bar-spacing'].reason, 'WALL_BAR_SPACING_EXCEEDS_LIMIT');
// A thin wall is governed by 3t instead.
assert.ok(Math.abs(reviewWallSection({ ...wall, thickness: 0.12 })['wall-bar-spacing'].spacingLimit - 0.36) < 1e-12);

// 4.2(4): two layers from 250 mm up, not applicable below it.
assert.equal(TWO_LAYER_THICKNESS, 0.25);
assert.equal(reviewWallSection({ ...wall, thickness: 0.2 })['wall-reinforcement-layers'].status, 'N_A');
assert.equal(reviewWallSection({
  ...wall,
  verticalReinforcement: { diameter: 0.013, spacing: 0.3, layers: 1 },
})['wall-reinforcement-layers'].reason, 'WALL_REQUIRES_TWO_REINFORCEMENT_LAYERS');
// The split of the area between the faces is a further requirement not covered.
assert.equal(result['wall-reinforcement-layers'].faceDistributionChecked, false);

// 4.3.2(3): the smaller support spacing over 25, never below 100 mm, and a
// basement or foundation wall never below 200 mm.
assert.equal(result['wall-thickness'].governingSupportSpacing, 3.5);
assert.ok(Math.abs(result['wall-thickness'].requiredThickness - 3.5 / 25) < 1e-12);
assert.equal(result['wall-thickness'].governedBy, 'support spacing / 25');
const shortWall = reviewWallSection({ ...wall, clearHeight: 2, clearLength: 2, thickness: 0.12 });
assert.equal(shortWall['wall-thickness'].requiredThickness, 0.1);
assert.equal(shortWall['wall-thickness'].governedBy, 'absolute floor');
const basement = reviewWallSection({ ...wall, clearHeight: 2, clearLength: 2, thickness: 0.18, isBasementOrFoundationWall: true });
assert.equal(basement['wall-thickness'].requiredThickness, 0.2);
assert.equal(basement['wall-thickness'].status, 'NG');
assert.equal(basement['wall-thickness'].governedBy, 'basement or foundation wall floor');
// 4.1(8) lets a rigorous analysis set the thickness limit aside; not evaluated.
assert.equal(result['wall-thickness'].rigorousAnalysisExemptionChecked, false);

// 4.3.2(2) equation (4.3-1):
//   phi*Pnw = 0.55 * phi * fck * Ag * (1 - (k*lc/(32h))^2),  phi = 0.65
// The factor is inside the expression, so the result is already a design
// strength and phi must not be applied again.
assert.equal(AXIAL_EQUATION.strengthReductionFactor, 0.65);
assert.equal(AXIAL_EQUATION.phiIncludedInResult, true);
assert.deepEqual(EFFECTIVE_LENGTH_FACTOR, {
  'braced-rotation-restrained': 0.8,
  'braced-rotation-free': 1,
  unbraced: 2,
});

const axialInput = {
  ...wall,
  fck: 24,
  verticalSupportLength: 3.5,
  restraint: 'braced-rotation-restrained',
  factoredAxialLoad: 1500,
  eccentricity: 0.03,
};
const axial = reviewWallSection(axialInput)['wall-axial-strength'];
assert.equal(axial.status, 'OK');
// Hand check in the equation's own units: h = 300 mm, lc = 3,500 mm, k = 0.8.
const hand = (0.55 * 0.65 * 24 * 300 * 1000 * (1 - ((0.8 * 3500) / (32 * 300)) ** 2)) / 1000;
assert.ok(Math.abs(axial.capacity - hand) < 1e-9, `${axial.capacity} vs ${hand}`);
assert.ok(Math.abs(axial.capacity - 2355) < 0.5, String(axial.capacity));
assert.equal(axial.effectiveLengthFactor, 0.8);
assert.equal(axial.strengthReductionFactorAlreadyApplied, true);
assert.equal(reviewWallSection({ ...axialInput, factoredAxialLoad: 3000 })['wall-axial-strength'].status, 'NG');

// lc is the length between supports and h is the wall thickness, so a thinner
// wall of the same height is more slender and weaker per unit area.
const thinner = reviewWallSection({ ...axialInput, thickness: 0.2 })['wall-axial-strength'];
assert.ok(thinner.slendernessTerm < axial.slendernessTerm);
// An unbraced wall takes k = 2.0 and loses much more.
const unbraced = reviewWallSection({ ...axialInput, restraint: 'unbraced' })['wall-axial-strength'];
assert.equal(unbraced.effectiveLengthFactor, 2);
assert.ok(unbraced.capacity < axial.capacity);

// 4.3.2(1): outside the middle third the method does not apply. That is not a
// failure of the wall, so it is NOT_CHECKED with the condition named.
const eccentric = reviewWallSection({ ...axialInput, eccentricity: 0.06 })['wall-axial-strength'];
assert.equal(eccentric.status, 'NOT_CHECKED');
assert.equal(eccentric.reason, 'RESULTANT_OUTSIDE_MIDDLE_THIRD');
assert.ok(Math.abs(eccentric.eccentricityLimit - 0.05) < 1e-12);
assert.match(eccentric.note, /4\.3\.1\(1\)/);
// e = Mu/Pu when the eccentricity is not given directly.
const fromMoment = reviewWallSection({ ...axialInput, eccentricity: undefined, factoredMoment: 30 })['wall-axial-strength'];
assert.ok(Math.abs(fromMoment.eccentricity - 0.02) < 1e-12);

// The method's own preconditions and inputs are each distinct reasons.
for (const [patch, reason] of [
  [{ restraint: null }, 'WALL_RESTRAINT_CONDITION_REQUIRED'],
  [{ rectangularSection: false }, 'PRACTICAL_METHOD_REQUIRES_RECTANGULAR_SECTION'],
  [{ fck: null }, 'WALL_AXIAL_INPUT_REQUIRED'],
  [{ eccentricity: undefined, factoredMoment: undefined }, 'WALL_LOAD_ECCENTRICITY_REQUIRED'],
  [{ verticalSupportLength: 40 }, 'WALL_SLENDERNESS_OUTSIDE_PRACTICAL_METHOD'],
]) {
  const out = reviewWallSection({ ...axialInput, ...patch })['wall-axial-strength'];
  assert.equal(out.status, 'NOT_CHECKED', JSON.stringify(patch));
  assert.equal(out.reason, reason, JSON.stringify(patch));
}

// A strength is not a completed wall design.
assert.ok(axial.limitations.some((line) => /not a completed wall design/.test(line)));
assert.ok(axial.limitations.some((line) => /4\.9/.test(line)));

// Missing input never becomes OK.
for (const [patch, ids, reason] of [
  [{ thickness: null }, WALL_CHECK_IDS, 'WALL_THICKNESS_REQUIRED'],
  [{ fy: null }, WALL_CHECK_IDS, 'WALL_STEEL_STRENGTH_REQUIRED'],
  [{ reinforcementClass: null }, ['wall-minimum-vertical-reinforcement', 'wall-minimum-horizontal-reinforcement'], 'WALL_REINFORCEMENT_CLASS_REQUIRED'],
  [{ reinforcementClass: 'unknown-class' }, ['wall-minimum-vertical-reinforcement'], 'WALL_REINFORCEMENT_CLASS_NOT_IN_TABLE'],
  [{ verticalReinforcement: null, horizontalReinforcement: null }, ['wall-bar-spacing'], 'MISSING_REINFORCEMENT'],
  [{ clearHeight: null, clearLength: null }, ['wall-thickness'], 'WALL_SUPPORT_SPACING_REQUIRED'],
]) {
  const out = reviewWallSection({ ...wall, ...patch });
  for (const id of ids) {
    assert.equal(out[id].status, 'NOT_CHECKED', `${id} ${JSON.stringify(patch)}`);
    assert.equal(out[id].reason, reason, id);
  }
}

console.log(JSON.stringify({
  ok: true,
  verticalRatio: result['wall-minimum-vertical-reinforcement'].providedRatio.toFixed(5),
  horizontalRequired: horizontal.requiredRatio,
  axialCapacity: Number(axial.capacity.toFixed(1)),
}, null, 2));
