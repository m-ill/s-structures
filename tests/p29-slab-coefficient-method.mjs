import assert from 'node:assert/strict';
import { SLAB_COEFFICIENT_TABLES } from '../src/design/rc/slabCoefficientTables.js';
import { slabCoefficientMoments } from '../src/design/rc/slabCoefficientMethod.js';

// KDS 14 20 70 appendix tables 4-1 to 4-4. Coefficients recovered from the
// captured HTML; the Case 1~9 support diagrams are owner-supplied and were
// cross-checked against the table's own blanks.

// Every restrained direction must have a negative moment coefficient and every
// unrestrained one must not. This is what makes the diagrams and the blanks
// independent evidence for each other, so it is asserted, not assumed.
const negative = SLAB_COEFFICIENT_TABLES.tables['4-1'];
let checked = 0;
for (const row of negative.rows) {
  for (const [name, edges] of Object.entries(SLAB_COEFFICIENT_TABLES.supportConditions)) {
    const shortRestrained = edges.top === 'thick' || edges.bottom === 'thick';
    const longRestrained = edges.left === 'thick' || edges.right === 'thick';
    assert.equal(shortRestrained, row.values[name].CA_neg !== null, `${name} m=${row.spanRatio} short`);
    assert.equal(longRestrained, row.values[name].CB_neg !== null, `${name} m=${row.spanRatio} long`);
    checked += 1;
  }
}
assert.equal(checked, 99);

// All four tables carry 11 span ratios from 1.00 down to 0.50.
for (const id of ['4-1', '4-2', '4-3', '4-4']) {
  const table = SLAB_COEFFICIENT_TABLES.tables[id];
  assert.equal(table.rows.length, 11, id);
  assert.equal(table.rows[0].spanRatio, 1);
  assert.equal(table.rows[10].spanRatio, 0.5);
}

// A square panel continuous on all four edges, wu = 1.2(5) + 1.6(3) = 10.8.
const square = slabCoefficientMoments({ shortSpan: 5, longSpan: 5, deadLoad: 5, liveLoad: 3, caseId: 'Case2' });
assert.equal(square.status, 'OK');
assert.equal(square.spanRatio, 1);
assert.equal(square.factoredLoad.total, 10.8);
assert.ok(Math.abs(square.moments.shortSpanNegative.moment - 0.045 * 10.8 * 25) < 1e-9);
assert.ok(Math.abs(square.moments.shortSpanNegative.moment - 12.15) < 1e-9);
// The positive moment takes the dead and live coefficients separately and sums
// them; it does not apply one coefficient to the combined load.
assert.ok(Math.abs(square.moments.shortSpanPositive.moment - (0.018 * 6 + 0.027 * 4.8) * 25) < 1e-9);
assert.ok(Math.abs(square.moments.shortSpanPositive.moment - 5.94) < 1e-9);
assert.notEqual(square.moments.shortSpanPositive.moment, 0.018 * 10.8 * 25);
assert.equal(square.designTransferAllowed, false);

// A case with restraint in one direction only tabulates a negative coefficient
// for that direction alone. Case6 is restrained on the top edge, which carries
// the short span.
const case6 = slabCoefficientMoments({ shortSpan: 4, longSpan: 5, deadLoad: 5, liveLoad: 3, caseId: 'Case6' });
assert.equal(case6.moments.shortSpanNegative.tabulated, true);
assert.equal(case6.moments.longSpanNegative.tabulated, false);
assert.equal(case6.moments.longSpanNegative.moment, null);
// Case7 is restrained on the right edge instead, so it is the mirror image.
const case7 = slabCoefficientMoments({ shortSpan: 4, longSpan: 5, deadLoad: 5, liveLoad: 3, caseId: 'Case7' });
assert.equal(case7.moments.shortSpanNegative.tabulated, false);
assert.equal(case7.moments.longSpanNegative.tabulated, true);
// A blank means the table gives no coefficient, not that the moment is zero.
assert.ok(case6.limitations.some((line) => /not that the design negative moment is zero/.test(line)));

// Case1 is simply supported all round and tabulates no negative coefficient at
// all, while its positive coefficients are the largest.
const case1 = slabCoefficientMoments({ shortSpan: 5, longSpan: 5, deadLoad: 5, liveLoad: 3, caseId: 'Case1' });
assert.equal(case1.moments.shortSpanNegative.tabulated, false);
assert.ok(case1.moments.shortSpanPositive.moment > square.moments.shortSpanPositive.moment);

// A case can be selected from the edge conditions instead of named.
const byEdges = slabCoefficientMoments({
  shortSpan: 4, longSpan: 5, deadLoad: 5, liveLoad: 3,
  edges: { top: 'thick', bottom: 'thin', left: 'thin', right: 'thin' },
});
assert.equal(byEdges.caseId, 'Case6');
assert.equal(byEdges.caseMatchedFrom, 'edge conditions');
assert.equal(byEdges.spanRatio, 0.8);
assert.equal(byEdges.tabulatedSpanRatio, 0.8);
assert.equal(byEdges.spanRatioRoundedToTable, false);

// A ratio between tabulated steps is read at the nearest one and says so,
// because the appendix gives no interpolation rule.
const between = slabCoefficientMoments({ shortSpan: 4.1, longSpan: 5, deadLoad: 5, liveLoad: 3, caseId: 'Case2' });
assert.equal(between.tabulatedSpanRatio, 0.8);
assert.equal(between.spanRatioRoundedToTable, true);

// An unsorted panel is refused rather than silently sorted: selecting a case
// against it would pair the edge conditions with the wrong direction.
const unsorted = slabCoefficientMoments({ shortSpan: 6, longSpan: 5, deadLoad: 5, liveLoad: 3, caseId: 'Case2' });
assert.equal(unsorted.status, 'NOT_CHECKED');
assert.equal(unsorted.reason, 'SPANS_NOT_ORIENTED_SHORT_FIRST');

// Past a long-to-short ratio of 2 the panel is one-way and outside the table.
assert.equal(slabCoefficientMoments({ shortSpan: 2, longSpan: 5, deadLoad: 5, liveLoad: 3, caseId: 'Case2' }).reason, 'SPAN_RATIO_OUTSIDE_TABLE');

// A coefficient the source printed malformed blocks the calculation instead of
// producing a moment from it. Table 4-1 Case4 at m = 0.85 prints 0066.
const defective = slabCoefficientMoments({ shortSpan: 4.25, longSpan: 5, deadLoad: 5, liveLoad: 3, caseId: 'Case4' });
assert.equal(defective.status, 'NOT_CHECKED');
assert.equal(defective.reason, 'COEFFICIENT_PRINTED_DEFECTIVELY_IN_SOURCE');
assert.equal(defective.defects[0].printed, '0066');
// The same case at a neighbouring ratio is fine, so it is the one cell.
assert.equal(slabCoefficientMoments({ shortSpan: 4, longSpan: 5, deadLoad: 5, liveLoad: 3, caseId: 'Case4' }).status, 'OK');

// Unknown cases and unmatched edge combinations are distinct from missing input.
assert.equal(slabCoefficientMoments({ shortSpan: 4, longSpan: 5, deadLoad: 5, liveLoad: 3, caseId: 'Case10' }).reason, 'SLAB_CASE_NOT_IN_APPENDIX');
assert.equal(slabCoefficientMoments({ shortSpan: 4, longSpan: 5, deadLoad: 5, liveLoad: 3 }).reason, 'SLAB_CASE_OR_EDGE_CONDITIONS_REQUIRED');
assert.equal(slabCoefficientMoments({
  shortSpan: 4, longSpan: 5, deadLoad: 5, liveLoad: 3,
  edges: { top: 'thick', bottom: 'thin', left: 'thick', right: 'thin' },
}).reason, 'SLAB_EDGE_COMBINATION_NOT_IN_APPENDIX');
assert.equal(slabCoefficientMoments({ shortSpan: 4, longSpan: 5, deadLoad: 5, caseId: 'Case2' }).reason, 'SLAB_SERVICE_LOADS_REQUIRED');
assert.equal(slabCoefficientMoments({ caseId: 'Case2' }).reason, 'SLAB_CLEAR_SPANS_REQUIRED');

// Table 4-4 distributes the load between the directions and the two shares sum
// to one.
assert.ok(Math.abs(square.shearDistribution.shortSpan + square.shearDistribution.longSpan - 1) < 1e-12);
assert.equal(case6.shearDistribution.shortSpan + case6.shearDistribution.longSpan, 1);

// The printed defects travel with every result.
assert.equal(square.sourceProvenance.suspectedSourceDefects.length, 4);

console.log(JSON.stringify({
  ok: true,
  crossChecked: checked,
  squareNegative: square.moments.shortSpanNegative.moment,
  squarePositive: square.moments.shortSpanPositive.moment,
}, null, 2));
