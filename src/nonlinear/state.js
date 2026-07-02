export const NONLINEAR_STATE_VERSION = 'p3-m14-nonlinear-state';

export function createAnalysisState(options = {}) {
  return {
    version: NONLINEAR_STATE_VERSION,
    step: integer(options.step, 0),
    lambda: number(options.lambda, 0),
    u: new Float64Array(options.u || 0),
    hinges: normalizeHinges(options.hinges),
    converged: !!options.converged,
    iterations: integer(options.iterations, 0),
    events: cloneRows(options.events || []),
  };
}

export function snapshotAnalysisState(state) {
  return {
    version: state.version || NONLINEAR_STATE_VERSION,
    step: integer(state.step, 0),
    lambda: number(state.lambda, 0),
    u: [...(state.u || [])],
    hinges: [...(state.hinges || new Map()).entries()].map(([id, value]) => ({ id, ...cloneRow(value) })),
    converged: !!state.converged,
    iterations: integer(state.iterations, 0),
    events: cloneRows(state.events || []),
  };
}

export function advanceAnalysisState(state, increment = {}) {
  const next = createAnalysisState({
    ...snapshotAnalysisState(state),
    step: integer(state.step, 0) + 1,
    lambda: number(state.lambda, 0) + number(increment.dLambda, 0),
    u: addVectors(state.u, increment.du),
    hinges: snapshotAnalysisState(state).hinges,
    events: [...(state.events || []), ...(increment.events || [])],
  });
  next.converged = !!increment.converged;
  next.iterations = integer(increment.iterations, 0);
  return next;
}

function addVectors(a = [], b = []) {
  const n = Math.max(a.length || 0, b.length || 0);
  return Array.from({ length: n }, (_, i) => number(a[i], 0) + number(b[i], 0));
}

function normalizeHinges(hinges = []) {
  const items = hinges || [];
  if (items instanceof Map) return new Map([...items.entries()].map(([id, value]) => [id, cloneRow(value)]));
  return new Map([...items].map((item) => (
    Array.isArray(item) ? [item[0], cloneRow(item[1])] : [item.id, withoutId(item)]
  )));
}

function withoutId(item) {
  const { id: _id, ...value } = item || {};
  return cloneRow(value);
}

function cloneRows(rows) {
  return [...rows].map(cloneRow);
}

function cloneRow(row) {
  if (!row || typeof row !== 'object') return row;
  if (Array.isArray(row)) return row.map(cloneRow);
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, cloneRow(value)]));
}

function number(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function integer(value, fallback) {
  return Math.trunc(number(value, fallback));
}
