import assert from 'node:assert/strict';
import {
  AVERAGING_EQUATION,
  ONE_SECOND_AMPLIFICATION,
  SHORT_PERIOD_AMPLIFICATION,
  SITE_CLASS_TABLE,
  amplificationFactors,
  averageShearWaveVelocity,
  deriveSiteClass,
} from '../src/loads/seismicSiteClass.js';

// KDS 17 10 00 4.2.1.2 with the KDS 41 17 00 4.1.1 / 4.2.2 modifications.
// The site-class symbols and equation (4.2-1) are images in the captured text
// and were confirmed against the published standards.

const layers = [
  { thickness: 5, shearWaveVelocity: 150 },
  { thickness: 10, shearWaveVelocity: 300 },
  { thickness: 15, shearWaveVelocity: 400 },
];

// (4.2-1) is a travel-time average, not an arithmetic mean of the velocities.
const averaged = averageShearWaveVelocity(layers);
assert.equal(averaged.ok, true);
assert.equal(averaged.depthUsed, 30);
const expected = 30 / (5 / 150 + 10 / 300 + 15 / 400);
assert.ok(Math.abs(averaged.velocity - expected) < 1e-9, JSON.stringify(averaged));
// The thickness-weighted arithmetic mean would be 325; weighting by travel
// time instead pulls the average down toward the slow layers.
const arithmetic = (5 * 150 + 10 * 300 + 15 * 400) / 30;
assert.equal(arithmetic, 325);
assert.ok(averaged.velocity < arithmetic, JSON.stringify(averaged));
assert.equal(averaged.equation.id, '4.2-1');
assert.equal(AVERAGING_EQUATION.expression, 'Vs_soil = sum(d_i) / sum(d_i / Vs_i)');

// 4.1.1(1)2: past 30 m the upper 30 m may be averaged instead, and the result
// says it was truncated.
const truncated = averageShearWaveVelocity([...layers, { thickness: 20, shearWaveVelocity: 600 }], { depthLimit: 30 });
assert.equal(truncated.depthUsed, 30);
assert.equal(truncated.truncatedToDepthLimit, true);
assert.ok(Math.abs(truncated.velocity - expected) < 1e-9);

// Table 4.2-4, all six rows.
assert.deepEqual(SITE_CLASS_TABLE.map((row) => row.id), ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
const classify = (patch) => deriveSiteClass({ liveLoadIntensity: undefined, ...patch }).siteClass;
assert.equal(classify({ bedrockDepth: 0.5, averageShearWaveVelocity: 800 }), 'S1');
assert.equal(classify({ bedrockDepth: 10, averageShearWaveVelocity: 300 }), 'S2');
assert.equal(classify({ bedrockDepth: 10, averageShearWaveVelocity: 200 }), 'S3');
assert.equal(classify({ bedrockDepth: 30, averageShearWaveVelocity: 200 }), 'S4');
assert.equal(classify({ bedrockDepth: 30, averageShearWaveVelocity: 170 }), 'S5');
// Boundaries: 260 and 180 belong to the stiffer class.
assert.equal(classify({ bedrockDepth: 20, averageShearWaveVelocity: 260 }), 'S2');
assert.equal(classify({ bedrockDepth: 25, averageShearWaveVelocity: 180 }), 'S4');

// 4.2.1.2(3): at or below 120 m/s it is S5 whatever the depth.
const slow = deriveSiteClass({ bedrockDepth: 5, averageShearWaveVelocity: 120 });
assert.equal(slow.siteClass, 'S5');
assert.match(slow.governedBy, /4\.2\.1\.2\(3\)/);

// 4.2.1.2(4): the site-specific conditions decide S6 before the depth and
// velocity table is consulted, which is the case a depth/velocity-only
// implementation would miss.
const liquefiable = deriveSiteClass({
  bedrockDepth: 10,
  averageShearWaveVelocity: 300,
  siteSpecificConditions: { liquefiableOrCollapsible: true },
});
assert.equal(liquefiable.siteClass, 'S6');
assert.equal(liquefiable.siteSpecificTriggers.length, 1);
assert.equal(liquefiable.amplificationStatus, 'NOT_CHECKED');

// 4.2.1.2(4)5: bedrock deeper than 50 m is S6 on its own.
assert.equal(deriveSiteClass({ bedrockDepth: 60, averageShearWaveVelocity: 300 }).siteClass, 'S6');
assert.equal(deriveSiteClass({ bedrockDepth: 50, averageShearWaveVelocity: 300 }).siteClass, 'S4');
// The thickness-and-index conditions need both parts.
assert.equal(deriveSiteClass({
  bedrockDepth: 10,
  averageShearWaveVelocity: 300,
  siteSpecificConditions: { highPlasticityClayThickness: 8, plasticityIndex: 50 },
}).siteClass, 'S2');
assert.equal(deriveSiteClass({
  bedrockDepth: 10,
  averageShearWaveVelocity: 300,
  siteSpecificConditions: { highPlasticityClayThickness: 8, plasticityIndex: 80 },
}).siteClass, 'S6');

// The KDS 41 17 00 4.1.1(1) relaxations are opt-in and each one that fires is
// listed, because a relaxation lowers the demand.
const shallow = deriveSiteClass({ bedrockDepth: 2, averageShearWaveVelocity: 200 });
assert.equal(shallow.siteClass, 'S3');
const shallowAllowed = deriveSiteClass({ bedrockDepth: 2, averageShearWaveVelocity: 200, allowances: { shallowBedrockAsS1: true } });
assert.equal(shallowAllowed.siteClass, 'S1');
assert.equal(shallowAllowed.appliedAllowances.length, 1);
assert.match(shallowAllowed.appliedAllowances[0].clause, /4\.1\.1\(1\)1/);

const noData = deriveSiteClass({ averageShearWaveVelocity: 200 });
assert.equal(noData.derived, false);
assert.equal(noData.reason, 'BEDROCK_DEPTH_REQUIRED');
const noDataAllowed = deriveSiteClass({ allowances: { insufficientDataAsS4: true } });
assert.equal(noDataAllowed.siteClass, 'S4');
assert.equal(noDataAllowed.bedrockDepthUnknown, true);

// 4.1.3(1): the reference plane is the completed ground surface.
assert.match(deriveSiteClass({ bedrockDepth: 10, averageShearWaveVelocity: 300 }).referencePlane, /completed/);

// Tables 4.2-1 and 4.2-2, owner-confirmed row order.
assert.deepEqual(SHORT_PERIOD_AMPLIFICATION.S1, [1.12, 1.12, 1.12]);
assert.deepEqual(SHORT_PERIOD_AMPLIFICATION.S5, [1.8, 1.3, 1.3]);
assert.deepEqual(ONE_SECOND_AMPLIFICATION.S4, [2.2, 2.0, 1.8]);
assert.deepEqual(Object.keys(SHORT_PERIOD_AMPLIFICATION), ['S1', 'S2', 'S3', 'S4', 'S5']);

const anchored = amplificationFactors('S3', 0.2);
assert.equal(anchored.status, 'OK');
assert.equal(anchored.shortPeriodAmplification, 1.5);
assert.equal(anchored.oneSecondAmplification, 1.6);
assert.equal(anchored.interpolated, false);

// "표에서 S의 중간값에 대하여는 직선보간한다."
const mid = amplificationFactors('S3', 0.15);
assert.equal(mid.interpolated, true);
assert.ok(Math.abs(mid.shortPeriodAmplification - 1.6) < 1e-9, JSON.stringify(mid));
assert.ok(Math.abs(mid.oneSecondAmplification - 1.65) < 1e-9);
// Outside the anchors the end values hold.
assert.equal(amplificationFactors('S2', 0.05).shortPeriodAmplification, 1.4);
assert.equal(amplificationFactors('S2', 0.4).shortPeriodAmplification, 1.3);

// S6 has no tabulated coefficients. Substituting the S5 row would invent a
// value, so it is NOT_CHECKED with the reason.
const s6 = amplificationFactors('S6', 0.2);
assert.equal(s6.status, 'NOT_CHECKED');
assert.equal(s6.reason, 'S6_REQUIRES_SITE_RESPONSE_ANALYSIS');
assert.equal(s6.shortPeriodAmplification, undefined);

// 4.2.2(2): deep bedrock with a stiff column takes 80% of the tabulated Fv,
// and Fa is untouched.
const stiffDeep = amplificationFactors('S4', 0.2, { bedrockDepth: 25, averageShearWaveVelocity: 400 });
assert.ok(Math.abs(stiffDeep.oneSecondAmplification - 2.0 * 0.8) < 1e-9, JSON.stringify(stiffDeep));
assert.equal(stiffDeep.shortPeriodAmplification, 1.4);
assert.equal(stiffDeep.adjustments.length, 1);
// Not triggered at 20 m or below 360 m/s.
assert.equal(amplificationFactors('S4', 0.2, { bedrockDepth: 20, averageShearWaveVelocity: 400 }).adjustments.length, 0);
assert.equal(amplificationFactors('S4', 0.2, { bedrockDepth: 25, averageShearWaveVelocity: 350 }).adjustments.length, 0);

// 4.2.2(3): S5 with an unclear bedrock depth takes 110% of both.
const unclear = amplificationFactors('S5', 0.2, { bedrockDepthUnknown: true });
assert.ok(Math.abs(unclear.shortPeriodAmplification - 1.3 * 1.1) < 1e-9);
assert.ok(Math.abs(unclear.oneSecondAmplification - 2.7 * 1.1) < 1e-9);

// Missing input never produces a number.
assert.equal(amplificationFactors(null, 0.2).reason, 'SITE_CLASS_REQUIRED');
assert.equal(amplificationFactors('S2', 0).reason, 'EFFECTIVE_GROUND_ACCELERATION_REQUIRED');
assert.equal(averageShearWaveVelocity([]).reason, 'SOIL_LAYERS_REQUIRED');
assert.equal(averageShearWaveVelocity([{ thickness: 5 }]).reason, 'SOIL_LAYER_THICKNESS_AND_VELOCITY_REQUIRED');

// The edition of KDS 17 10 00 is pinned and travels on the result, so a later
// revision cannot be applied without this changing.
assert.equal(anchored.sourceConfirmation.editionPinned, true);
assert.match(anchored.sourceConfirmation.edition, /2024-03-21/);
assert.equal(anchored.designTransferAllowed, false);

console.log(JSON.stringify({
  ok: true,
  travelTimeAverage: Number(averaged.velocity.toFixed(2)),
  s6Handling: s6.reason,
}, null, 2));
