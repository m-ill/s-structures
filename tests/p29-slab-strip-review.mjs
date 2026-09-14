import assert from 'node:assert/strict';
import {
  MINIMUM_THICKNESS,
  SLAB_STRIP_CHECK_IDS,
  SPACING_LIMITS,
  reviewOneWaySlabStrip,
} from '../src/design/rc/slabStripReview.js';

// KDS 14 20 70 4.1.1 with KDS 14 20 22 shear and KDS 14 20 50 4.6.2 shrinkage
// steel, evaluated on a 1 m strip through the existing section evaluator.

const slab = {
  thickness: 0.18,
  cover: 0.03,
  fck: 24,
  fy: 400,
  spanRatio: 3,
  stations: [
    { id: 'mid', kind: 'critical', moment: 30, shear: 40, bars: { diameter: 0.013, spacing: 0.15 } },
    { id: 'sup', kind: 'critical', moment: -35, shear: 55, bars: { diameter: 0.013, spacing: 0.12 } },
  ],
  transverseReinforcement: { diameter: 0.013, spacing: 0.25 },
};

const result = reviewOneWaySlabStrip(slab);
assert.deepEqual(Object.keys(result).sort(), [...SLAB_STRIP_CHECK_IDS].sort());
for (const id of SLAB_STRIP_CHECK_IDS) {
  assert.equal(result[id].designTransferAllowed, false, id);
  assert.ok(result[id].codeReferences.length > 0, id);
}
assert.equal(result['slab-flexure'].status, 'OK');
assert.equal(result['slab-one-way-shear'].status, 'OK');
assert.equal(result['slab-bar-spacing'].status, 'OK');
assert.equal(result['slab-shrinkage-temperature'].status, 'OK');

// Every station is reported, not only the governing one.
assert.equal(result['slab-flexure'].stationChecks.length, 2);
assert.equal(result['slab-one-way-shear'].stationChecks.length, 2);
// A negative moment puts the steel on the top face.
const support = result['slab-flexure'].stationChecks.find((row) => row.stationId === 'sup');
assert.equal(support.tensionFace, 'top');
assert.equal(result['slab-flexure'].stationChecks.find((row) => row.stationId === 'mid').tensionFace, 'bottom');

// 4.1.1.3(1): at least 100 mm, and the deflection thickness of KDS 14 20 30 is
// a separate requirement this does not cover.
assert.equal(MINIMUM_THICKNESS, 0.1);
assert.equal(result['slab-thickness'].status, 'OK');
assert.equal(result['slab-thickness'].deflectionThicknessChecked, false);
assert.equal(reviewOneWaySlabStrip({ ...slab, thickness: 0.08 })['slab-thickness'].status, 'NG');

// 4.1.1.3(2): two limits apply and the smaller governs. At 180 mm the critical
// section limit is 2t = 360 mm against 300 mm, so 300 governs.
assert.deepEqual(SPACING_LIMITS.critical, { thicknessMultiple: 2, absolute: 0.3, clause: SPACING_LIMITS.critical.clause });
const spacingRow = result['slab-bar-spacing'].stationChecks[0];
assert.equal(spacingRow.spacingLimit, 0.3);
assert.equal(spacingRow.governedBy, 'absolute limit');
// A thin slab is governed by the thickness multiple instead.
const thin = reviewOneWaySlabStrip({ ...slab, thickness: 0.12 })['slab-bar-spacing'].stationChecks[0];
assert.ok(Math.abs(thin.spacingLimit - 0.24) < 1e-12);
assert.equal(thin.governedBy, 'thickness multiple');
// Elsewhere the limits are 3t and 450 mm.
const other = reviewOneWaySlabStrip({
  ...slab,
  stations: [{ id: 'x', kind: 'other', moment: 10, shear: 10, bars: { diameter: 0.013, spacing: 0.44 } }],
})['slab-bar-spacing'];
assert.equal(other.status, 'OK');
assert.equal(other.stationChecks[0].spacingLimit, 0.45);
// Over the limit is NG.
assert.equal(reviewOneWaySlabStrip({
  ...slab,
  stations: [{ id: 'x', kind: 'critical', moment: 10, shear: 10, bars: { diameter: 0.013, spacing: 0.35 } }],
})['slab-bar-spacing'].status, 'NG');

// KDS 14 20 50 4.6.2: D13 at 250 mm gives more than 0.0020 x 180 mm2/m; at
// 300 mm it does not.
const shrinkage = result['slab-shrinkage-temperature'];
assert.ok(Math.abs(shrinkage.requiredRatio - 0.002) < 1e-12);
assert.ok(Math.abs(shrinkage.requiredArea - 0.002 * 0.18) < 1e-12);
assert.equal(shrinkage.areaCapApplied, false);
assert.equal(shrinkage.severeRestraintChecked, false);
assert.equal(reviewOneWaySlabStrip({
  ...slab,
  transverseReinforcement: { diameter: 0.01, spacing: 0.3 },
})['slab-shrinkage-temperature'].reason, 'SHRINKAGE_STEEL_AREA_BELOW_MINIMUM');
// 4.6.2(3): spacing is capped at min(5t, 450 mm).
assert.equal(reviewOneWaySlabStrip({
  ...slab,
  transverseReinforcement: { diameter: 0.022, spacing: 0.5 },
})['slab-shrinkage-temperature'].reason, 'SHRINKAGE_STEEL_SPACING_EXCEEDS_LIMIT');

// 4.6.2(1): a flat 0.0020 up to 400 MPa, then 0.0020 * 400 / fy, floored at
// 0.0014. The expression falls as fy rises, so the floor takes over at 571 MPa.
const denser = { ...slab, transverseReinforcement: { diameter: 0.013, spacing: 0.2 } };
for (const [fy, before, required, floorGoverns] of [
  [400, 0.002, 0.002, false],
  [500, 0.0016, 0.0016, false],
  [600, 0.002 * 400 / 600, 0.0014, true],
  [700, 0.002 * 400 / 700, 0.0014, true],
]) {
  const row = reviewOneWaySlabStrip({ ...denser, fy })['slab-shrinkage-temperature'];
  assert.ok(Math.abs(row.ratioBeforeFloor - before) < 1e-12, `fy ${fy}`);
  assert.ok(Math.abs(row.requiredRatio - required) < 1e-12, `fy ${fy}`);
  assert.equal(row.ratioFloorGoverns, floorGoverns, `fy ${fy}`);
  assert.equal(row.status, 'OK', `fy ${fy}: ${row.reason}`);
}
// A higher grade therefore needs LESS shrinkage steel, not more: substituting
// the 400 MPa ratio for a higher grade would overstate the requirement.
const at400 = reviewOneWaySlabStrip({ ...denser, fy: 400 })['slab-shrinkage-temperature'];
const at500 = reviewOneWaySlabStrip({ ...denser, fy: 500 })['slab-shrinkage-temperature'];
assert.ok(at500.requiredArea < at400.requiredArea);
assert.equal(at500.ratioBasis, '4.6.2(1)2 expression');
assert.equal(at400.ratioBasis, '4.6.2(1)1 flat ratio');
assert.match(at500.equationOrigin, /owner-confirmed/);
// The ratio is on the gross concrete area b*h, not b*d.
assert.equal(at400.areaBasis, 'gross concrete area b*h');
assert.ok(Math.abs(at400.grossArea - 1 * 0.18) < 1e-12);

// The provided-reinforcement contract: no bars is NOT_CHECKED, never OK.
for (const [patch, reason] of [
  [{ stations: [] }, 'MISSING_REINFORCEMENT'],
  [{ stations: [{ id: 'x', moment: 10, shear: 10 }] }, 'MISSING_REINFORCEMENT'],
  [{ stations: [{ id: 'x', moment: 10, shear: 10, bars: { diameter: 0.013 } }] }, 'BAR_SPACING_REQUIRED'],
  [{ stations: [{ id: 'x', shear: 10, bars: { diameter: 0.013, spacing: 0.2 } }] }, 'STATION_MOMENT_REQUIRED'],
  [{ thickness: 0 }, 'SLAB_GEOMETRY_AND_MATERIAL_REQUIRED'],
  [{ spanRatio: 1.5 }, 'SPAN_RATIO_BELOW_TWO_WAY_THRESHOLD'],
]) {
  const out = reviewOneWaySlabStrip({ ...slab, ...patch });
  for (const id of SLAB_STRIP_CHECK_IDS) {
    assert.equal(out[id].status, 'NOT_CHECKED', `${id} ${JSON.stringify(patch)}`);
    assert.equal(out[id].reason, reason, id);
  }
}
assert.equal(reviewOneWaySlabStrip({ ...slab, transverseReinforcement: null })['slab-shrinkage-temperature'].reason, 'MISSING_TRANSVERSE_REINFORCEMENT');

// A station with no shear demand is NOT_CHECKED for shear while flexure still
// reports, rather than the whole review collapsing.
const noShear = reviewOneWaySlabStrip({
  ...slab,
  stations: [{ id: 'x', kind: 'critical', moment: 30, bars: { diameter: 0.013, spacing: 0.15 } }],
});
assert.equal(noShear['slab-one-way-shear'].reason, 'STATION_SHEAR_REQUIRED');
assert.equal(noShear['slab-flexure'].status, 'OK');

// Slabs are exempt from minimum shear reinforcement, and that is recorded.
assert.equal(result['slab-one-way-shear'].stationChecks[0].minimumShearReinforcementException, 'KDS 14 20 22 4.3.3(1) slabs');

console.log(JSON.stringify({
  ok: true,
  flexureRatio: Number(result['slab-flexure'].ratio.toFixed(3)),
  shearRatio: Number(result['slab-one-way-shear'].ratio.toFixed(3)),
}, null, 2));
