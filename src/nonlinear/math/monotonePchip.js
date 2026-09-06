import { stableHash } from '../../core/stableHash.js';

export const MONOTONE_PCHIP_VERSION = 'p18-monotone-pchip-v1';

export function createMonotonePchip(xValues, yValues) {
  const x = finiteArray(xValues, 'PCHIP_X_INVALID');
  const y = finiteArray(yValues, 'PCHIP_Y_INVALID');
  if (x.length !== y.length || x.length < 2) throw codedError('PCHIP_TABLE_INVALID', 'PCHIP requires equal x/y arrays with at least two points.');
  for (let i = 1; i < x.length; i += 1) if (!(x[i] > x[i - 1])) throw codedError('PCHIP_X_NOT_STRICTLY_INCREASING', 'PCHIP x values must be strictly increasing.');
  const h = x.slice(1).map((value, index) => value - x[index]);
  const delta = h.map((value, index) => (y[index + 1] - y[index]) / value);
  const tangents = pchipTangents(h, delta);
  const core = { version: MONOTONE_PCHIP_VERSION, x, y, h, delta, tangents };
  const snapshot = Object.freeze({ ...core, tableHash: stableHash(core) });
  return Object.freeze({
    ...snapshot,
    evaluate: (query) => evaluateMonotonePchip(snapshot, query),
  });
}

export function evaluateMonotonePchip(table, query) {
  const value = Number(query);
  if (!Number.isFinite(value)) throw codedError('PCHIP_QUERY_INVALID', 'PCHIP query must be finite.');
  const { x, y, h, tangents } = table;
  if (value <= x[0]) return Object.freeze({ value: y[0], derivative: tangents[0], interval: 0, clamped: value < x[0] });
  if (value >= x.at(-1)) return Object.freeze({ value: y.at(-1), derivative: tangents.at(-1), interval: x.length - 2, clamped: value > x.at(-1) });
  let interval = 0;
  while (interval < x.length - 2 && value > x[interval + 1]) interval += 1;
  const t = (value - x[interval]) / h[interval];
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const result = h00 * y[interval] + h10 * h[interval] * tangents[interval]
    + h01 * y[interval + 1] + h11 * h[interval] * tangents[interval + 1];
  const derivative = ((6 * t2 - 6 * t) * y[interval]
    + (3 * t2 - 4 * t + 1) * h[interval] * tangents[interval]
    + (-6 * t2 + 6 * t) * y[interval + 1]
    + (3 * t2 - 2 * t) * h[interval] * tangents[interval + 1]) / h[interval];
  return Object.freeze({ value: result, derivative, interval, clamped: false });
}

function pchipTangents(h, delta) {
  if (delta.length === 1) return [delta[0], delta[0]];
  const d = new Array(delta.length + 1).fill(0);
  for (let i = 1; i < d.length - 1; i += 1) {
    if (delta[i - 1] === 0 || delta[i] === 0 || Math.sign(delta[i - 1]) !== Math.sign(delta[i])) d[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
    }
  }
  d[0] = endpointTangent(h[0], h[1], delta[0], delta[1]);
  d[d.length - 1] = endpointTangent(h.at(-1), h.at(-2), delta.at(-1), delta.at(-2));
  return d;
}

function endpointTangent(h0, h1, delta0, delta1) {
  let value = ((2 * h0 + h1) * delta0 - h0 * delta1) / (h0 + h1);
  if (Math.sign(value) !== Math.sign(delta0)) value = 0;
  else if (Math.sign(delta0) !== Math.sign(delta1) && Math.abs(value) > 3 * Math.abs(delta0)) value = 3 * delta0;
  return value;
}

function finiteArray(value, code) { if (!Array.isArray(value) || value.some((item) => !Number.isFinite(Number(item)))) throw codedError(code, 'PCHIP arrays must contain finite values.'); return value.map(Number); }
function codedError(code, message) { return Object.assign(new Error(message), { code }); }
