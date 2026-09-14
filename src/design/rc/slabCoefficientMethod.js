import { SLAB_COEFFICIENT_TABLES } from './slabCoefficientTables.js';
import { getKcscRuleSources } from '../../metadata/kcscRuleSources.js';

export const SLAB_COEFFICIENT_METHOD_VERSION = 'p29-slab-coefficient-method-v1';

// KDS 14 20 70 appendix: design moments for a rectangular two-way slab
// supported on four edges.
//
//   Ma-  = CA_neg * wu * l1^2        wu = 1.2D + 1.6L
//   Mb-  = CB_neg * wu * l2^2
//   Ma+  = (CA_DL * 1.2D + CA_LL * 1.6L) * l1^2
//   Mb+  = (CB_DL * 1.2D + CB_LL * 1.6L) * l2^2
//
// l1 is the short clear span and l2 the long one, so m = l1/l2 never exceeds 1.
// The dead and live contributions to the positive moment take their own
// coefficients and are summed; they do not share one.
const SPAN_RATIO_STEP = 0.05;
const MIN_SPAN_RATIO = 0.5;
const MAX_SPAN_RATIO = 1;

const refs = () => getKcscRuleSources(['142070'])
  .map((source) => ({ ...source, clause: '4.1.1.1(2); 부록 표 4-1~4-4' }));

const base = () => ({
  version: SLAB_COEFFICIENT_METHOD_VERSION,
  codeReferences: refs(),
  qualification: 'clause-scoped-not-whole-design',
  designTransferAllowed: false,
  sourceProvenance: {
    coefficients: 'captured KDS 14 20 70 HTML',
    supportConditions: 'owner-supplied from the published figures, cross-checked against the table blanks',
    suspectedSourceDefects: SLAB_COEFFICIENT_TABLES.suspectedSourceDefects,
  },
});

const notChecked = (reason, extra = {}) => ({ ...base(), status: 'NOT_CHECKED', reason, ...extra });

/**
 * Design moments and shear distribution for one rectangular two-way panel.
 *
 * The case is the caller's declaration of the panel's edge conditions, matched
 * against the appendix figures. A panel whose edges match no case is reported
 * as such rather than snapped to the nearest one.
 */
export function slabCoefficientMoments(input = {}) {
  const { shortSpan, longSpan, deadLoad, liveLoad, caseId = null, edges = null } = input;

  if (![shortSpan, longSpan].every((value) => Number.isFinite(value) && value > 0)) {
    return notChecked('SLAB_CLEAR_SPANS_REQUIRED');
  }
  if (shortSpan > longSpan) {
    // Selecting a case against an unsorted panel would pair the edge conditions
    // with the wrong direction, so this is refused rather than silently sorted.
    return notChecked('SPANS_NOT_ORIENTED_SHORT_FIRST', {
      note: 'l1 must be the short clear span; rotate the panel and carry its edge conditions and A/B direction along with it',
      shortSpan,
      longSpan,
    });
  }
  if (![deadLoad, liveLoad].every((value) => Number.isFinite(value) && value >= 0)) {
    return notChecked('SLAB_SERVICE_LOADS_REQUIRED');
  }

  const spanRatio = shortSpan / longSpan;
  // 4.1.1.1(2): beyond a ratio of 2 the panel is one-way and the appendix does
  // not cover it.
  if (spanRatio < MIN_SPAN_RATIO) {
    return notChecked('SPAN_RATIO_OUTSIDE_TABLE', {
      spanRatio,
      tableRange: [MIN_SPAN_RATIO, MAX_SPAN_RATIO],
      note: 'a long-to-short ratio above 2 is a one-way slab; use the one-way strip review',
    });
  }

  const resolved = resolveCase(caseId, edges);
  if (resolved.reason) return notChecked(resolved.reason, resolved.detail);

  // Coefficients are tabulated at 0.05 steps; the appendix gives no
  // interpolation rule, so the table is read at the nearest tabulated ratio and
  // the shift is reported rather than hidden.
  const tabulated = nearestTabulatedRatio(spanRatio);

  const negative = read('4-1', tabulated, resolved.caseId);
  const dead = read('4-2', tabulated, resolved.caseId);
  const live = read('4-3', tabulated, resolved.caseId);
  const distribution = read('4-4', tabulated, resolved.caseId);
  const defective = [negative, dead, live, distribution].flatMap((row) => row.defects);
  if (defective.length) {
    return notChecked('COEFFICIENT_PRINTED_DEFECTIVELY_IN_SOURCE', {
      caseId: resolved.caseId,
      spanRatio,
      tabulatedSpanRatio: tabulated,
      defects: defective,
    });
  }

  const factoredDead = 1.2 * deadLoad;
  const factoredLive = 1.6 * liveLoad;
  const wu = factoredDead + factoredLive;
  const shortSquared = shortSpan ** 2;
  const longSquared = longSpan ** 2;

  return {
    ...base(),
    status: 'OK',
    reason: null,
    caseId: resolved.caseId,
    caseSupportConditions: SLAB_COEFFICIENT_TABLES.supportConditions[resolved.caseId],
    caseMatchedFrom: resolved.matchedFrom,
    spanRatio,
    tabulatedSpanRatio: tabulated,
    spanRatioRoundedToTable: Math.abs(tabulated - spanRatio) > 1e-12,
    factoredLoad: { dead: factoredDead, live: factoredLive, total: wu, combination: '1.2D + 1.6L' },
    moments: {
      shortSpanNegative: signed(negative.short, wu * shortSquared),
      longSpanNegative: signed(negative.long, wu * longSquared),
      shortSpanPositive: sum(dead.short, live.short, factoredDead, factoredLive, shortSquared),
      longSpanPositive: sum(dead.long, live.long, factoredDead, factoredLive, longSquared),
    },
    shearDistribution: { shortSpan: distribution.short, longSpan: distribution.long },
    units: { span: 'm', load: 'kN/m2', moment: 'kN*m per metre of width' },
    limitations: [
      'a blank negative moment coefficient means the appendix tabulates none for that direction, not that the design negative moment is zero; the discontinuous edge provision applies separately',
      'the appendix applies to a slab supported on four edges and requires the relative deflection of the supporting members to be considered separately',
      'this produces design moments only; section strength, detailing and deflection remain separate checks',
    ],
  };
}

export { MAX_SPAN_RATIO, MIN_SPAN_RATIO, SPAN_RATIO_STEP };

// A declared case is used as given. A declared set of edges is matched against
// the figures instead, and an unmatched set is reported with the edges that
// were asked for.
function resolveCase(caseId, edges) {
  const conditions = SLAB_COEFFICIENT_TABLES.supportConditions;
  if (caseId) {
    return conditions[caseId]
      ? { caseId, matchedFrom: 'declared case' }
      : { reason: 'SLAB_CASE_NOT_IN_APPENDIX', detail: { caseId, available: Object.keys(conditions) } };
  }
  if (!edges) return { reason: 'SLAB_CASE_OR_EDGE_CONDITIONS_REQUIRED' };

  const wanted = ['top', 'bottom', 'left', 'right'].map((edge) => edges[edge]);
  if (wanted.some((value) => value !== 'thick' && value !== 'thin')) {
    return { reason: 'SLAB_EDGE_CONDITIONS_INVALID', detail: { edges, expected: 'thick (continuous or fixed) or thin (simple support) on all four edges' } };
  }
  const match = Object.entries(conditions).find(([, row]) =>
    ['top', 'bottom', 'left', 'right'].every((edge) => row[edge] === edges[edge]));
  return match
    ? { caseId: match[0], matchedFrom: 'edge conditions' }
    : { reason: 'SLAB_EDGE_COMBINATION_NOT_IN_APPENDIX', detail: { edges } };
}

function nearestTabulatedRatio(spanRatio) {
  const clamped = Math.min(MAX_SPAN_RATIO, Math.max(MIN_SPAN_RATIO, spanRatio));
  const steps = Math.round((clamped - MIN_SPAN_RATIO) / SPAN_RATIO_STEP);
  return Number((MIN_SPAN_RATIO + steps * SPAN_RATIO_STEP).toFixed(2));
}

function read(tableId, spanRatio, caseId) {
  const table = SLAB_COEFFICIENT_TABLES.tables[tableId];
  const row = table.rows.find((entry) => Math.abs(entry.spanRatio - spanRatio) < 1e-9);
  const values = row?.values?.[caseId] ?? {};
  const short = values[table.shortSpanKey] ?? null;
  const long = values[table.longSpanKey] ?? null;
  // A coefficient the source printed malformed arrives as an object, never a
  // number, so it cannot reach a moment by accident.
  const defects = [short, long]
    .map((value, index) => (value && typeof value === 'object'
      ? { table: tableId, caseId, spanRatio, direction: index === 0 ? 'short' : 'long', printed: value.raw }
      : null))
    .filter(Boolean);
  return { short: typeof short === 'number' ? short : null, long: typeof long === 'number' ? long : null, defects };
}

function signed(coefficient, factor) {
  if (coefficient === null) {
    return { coefficient: null, moment: null, tabulated: false, note: 'the appendix tabulates no coefficient for this direction in this case' };
  }
  return { coefficient, moment: coefficient * factor, tabulated: true };
}

function sum(deadCoefficient, liveCoefficient, factoredDead, factoredLive, spanSquared) {
  if (deadCoefficient === null || liveCoefficient === null) {
    return { coefficient: null, moment: null, tabulated: false };
  }
  return {
    deadCoefficient,
    liveCoefficient,
    moment: (deadCoefficient * factoredDead + liveCoefficient * factoredLive) * spanSquared,
    tabulated: true,
  };
}
