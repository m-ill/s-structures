import {
  addConsistentPoint,
  clamp01,
  loadSource,
  negateVector,
  resolveLoadComponents,
} from './common.js';

export const FIXED_END_POINT_LOAD_VERSION = 'p6-m2-fixed-end-point-load-v1';

export function fixedEndPointLoad(load, ax) {
  const inputLength = Number(ax?.L);
  const L = Number.isFinite(inputLength) ? inputLength : 0;
  const inputPosition = Number(load.t ?? load.at ?? 0.5);
  const r = clamp01(load.t ?? load.at, 0.5);
  const resolved = resolveLoadComponents(load, ax, load.P, 'P');
  const force = resolved.ok ? resolved.localComponents : [0, 0, 0];
  const issues = [resolved.issue].filter(Boolean);
  if (!Number.isFinite(inputPosition) || inputPosition < 0 || inputPosition > 1) {
    issues.push(loadIssue(load, 'INVALID_MEMBER_LOAD_POSITION', 't', load.t ?? load.at));
  }
  if (!(L > 0)) issues.push(loadIssue(load, 'INVALID_MEMBER_LENGTH', 'L', ax?.L));
  const fe = new Array(12).fill(0);
  addConsistentPoint(fe, force, r, L);
  const q0 = negateVector(fe);
  return {
    ok: issues.length === 0,
    reason: issues[0]?.code || null,
    issues,
    version: FIXED_END_POINT_LOAD_VERSION,
    source: loadSource(load),
    method: 'consistent-point-load',
    fe,
    q0,
    recovery: {
      type: 'point',
      a: r * L,
      q: force,
      sourceRange: load.sourceRange || null,
    },
    handcalc: {
      expression: 'fe = P[N1(a), N2(a), N3(a), N4(a)]',
      position: r,
      direction: load.dir || load.direction || '-z',
      coordinate: resolved.coordinate || load.coordinate || 'global',
      totalLoad: resolved.ok ? resolved.magnitude : null,
    },
  };
}

function loadIssue(load, code, component, value) {
  return { code, entityType: 'load', entityId: load.id || null, memberId: load.member || null, component, value };
}
