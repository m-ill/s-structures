import {
  addConsistentDistributed,
  clamp01,
  loadSource,
  negateVector,
  resolveLoadComponents,
} from './common.js';

export const FIXED_END_TRAPEZOID_VERSION = 'p6-m2-fixed-end-trapezoid-v1';

export function fixedEndTrapezoid(load, ax, md = {}) {
  const inputLength = Number(ax?.L);
  const L = Number.isFinite(inputLength) ? inputLength : 0;
  const inputFrom = Number(load.from);
  const inputTo = Number(load.to);
  const from = clamp01(load.from, 0);
  const to = clamp01(load.to, 1);
  const start = resolveLoadComponents(load, ax, load.w1, 'w1');
  const end = resolveLoadComponents(load, ax, load.w2, 'w2');
  const issues = [start.issue, end.issue].filter(Boolean);
  if (!Number.isFinite(inputFrom) || !Number.isFinite(inputTo) || inputFrom < 0 || inputTo > 1 || !(inputTo > inputFrom)) {
    issues.push(loadIssue(load, 'INVALID_MEMBER_LOAD_RANGE', 'from/to', [load.from, load.to]));
  }
  if (!(L > 0)) issues.push(loadIssue(load, 'INVALID_MEMBER_LENGTH', 'L', ax?.L));
  const w1 = start.ok ? start.magnitude : 0;
  const w2 = end.ok ? end.magnitude : 0;
  const fe = new Array(12).fill(0);
  const span = Math.max(1e-12, to - from);
  const qAtRatio = (r) => {
    const eta = (r - from) / span;
    if (!start.ok || !end.ok) return [0, 0, 0];
    return start.local.map((component) => component * (w1 + (w2 - w1) * eta));
  };
  addConsistentDistributed(fe, L, from, to, qAtRatio, md.timoshenko);
  const q0 = negateVector(fe);
  return {
    ok: issues.length === 0,
    reason: issues[0]?.code || null,
    issues,
    version: FIXED_END_TRAPEZOID_VERSION,
    source: loadSource(load),
    method: 'consistent-trapezoid-load',
    timoshenko: md.timoshenko || null,
    fe,
    q0,
    recovery: {
      type: 'distributed-linear',
      a: from * L,
      b: to * L,
      q1: qAtRatio(from),
      q2: qAtRatio(to),
      range: { from, to },
    },
    handcalc: {
      expression: 'fe = integral_from_a_to_b(N^T [w1 + (w2-w1)(x-a)/(b-a)] dx)',
      totalLoad: start.ok && end.ok ? ((w1 + w2) / 2) * (to - from) * L : null,
      length: L,
      range: { from, to },
      direction: load.dir || load.direction || '-z',
      coordinate: start.coordinate || load.coordinate || 'global',
    },
  };
}

function loadIssue(load, code, component, value) {
  return { code, entityType: 'load', entityId: load.id || null, memberId: load.member || null, component, value };
}
