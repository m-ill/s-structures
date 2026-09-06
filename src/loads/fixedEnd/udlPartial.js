import {
  addConsistentDistributed,
  clamp01,
  loadSource,
  negateVector,
  resolveLoadComponents,
} from './common.js';

export const FIXED_END_PARTIAL_UDL_VERSION = 'p6-m2-fixed-end-partial-udl-v1';

export function fixedEndPartialUdl(load, ax, md = {}) {
  const inputLength = Number(ax?.L);
  const L = Number.isFinite(inputLength) ? inputLength : 0;
  const inputFrom = Number(load.from);
  const inputTo = Number(load.to);
  const from = clamp01(load.from, 0);
  const to = clamp01(load.to, 1);
  const resolved = resolveLoadComponents(load, ax, load.w, 'w');
  const issues = [resolved.issue].filter(Boolean);
  if (!Number.isFinite(inputFrom) || !Number.isFinite(inputTo) || inputFrom < 0 || inputTo > 1 || !(inputTo > inputFrom)) {
    issues.push(loadIssue(load, 'INVALID_MEMBER_LOAD_RANGE', 'from/to', [load.from, load.to]));
  }
  if (!(L > 0)) issues.push(loadIssue(load, 'INVALID_MEMBER_LENGTH', 'L', ax?.L));
  const fe = new Array(12).fill(0);
  const q = resolved.ok ? resolved.localComponents : [0, 0, 0];
  addConsistentDistributed(fe, L, from, to, () => q, md.timoshenko);
  const q0 = negateVector(fe);
  return {
    ok: issues.length === 0,
    reason: issues[0]?.code || null,
    issues,
    version: FIXED_END_PARTIAL_UDL_VERSION,
    source: loadSource(load),
    method: 'consistent-partial-udl',
    timoshenko: md.timoshenko || null,
    fe,
    q0,
    recovery: {
      type: 'distributed-linear',
      a: from * L,
      b: to * L,
      q1: q,
      q2: q,
      range: { from, to },
    },
    handcalc: {
      expression: 'fe = integral_from_a_to_b(N^T q dx), constant q',
      totalLoad: resolved.ok ? resolved.magnitude * (to - from) * L : null,
      length: L,
      range: { from, to },
      direction: load.dir || load.direction || '-z',
      coordinate: resolved.coordinate || load.coordinate || 'global',
    },
  };
}

function loadIssue(load, code, component, value) {
  return { code, entityType: 'load', entityId: load.id || null, memberId: load.member || null, component, value };
}
