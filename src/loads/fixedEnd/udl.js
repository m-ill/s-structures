import {
  addConsistentDistributed,
  loadSource,
  negateVector,
  resolveLoadComponents,
} from './common.js';

export const FIXED_END_UDL_VERSION = 'p6-m2-fixed-end-udl-v1';

export function fixedEndUdl(load, ax) {
  const inputLength = Number(ax?.L);
  const L = Number.isFinite(inputLength) ? inputLength : 0;
  const resolved = resolveLoadComponents(load, ax, load.w, 'w');
  const issues = [resolved.issue].filter(Boolean);
  if (!(L > 0)) issues.push(loadIssue(load, 'INVALID_MEMBER_LENGTH', 'L', ax?.L));
  const fe = new Array(12).fill(0);
  const qAtRatio = (r) => {
    let scale = 1;
    if (load.shape === 'asc') scale = r;
    else if (load.shape === 'desc') scale = 1 - r;
    return resolved.ok ? resolved.localComponents.map((value) => value * scale) : [0, 0, 0];
  };
  addConsistentDistributed(fe, L, 0, 1, qAtRatio);
  const q0 = negateVector(fe);
  return {
    ok: issues.length === 0,
    reason: issues[0]?.code || null,
    issues,
    version: FIXED_END_UDL_VERSION,
    source: loadSource(load),
    method: load.shape && load.shape !== 'uniform' ? 'consistent-triangular-udl' : 'consistent-uniform-udl',
    fe,
    q0,
    recovery: {
      type: 'distributed-linear',
      a: 0,
      b: L,
      q1: qAtRatio(0),
      q2: qAtRatio(1),
      shape: load.shape || 'uniform',
    },
    handcalc: {
      expression: load.shape && load.shape !== 'uniform'
        ? 'fe = integral(N^T q(x) dx), q(x) linear over full member'
        : 'fe = [qL/2, qL^2/12, qL/2, -qL^2/12] by bending plane',
      totalLoad: resolved.ok ? resolved.magnitude * L * (load.shape && load.shape !== 'uniform' ? 0.5 : 1) : null,
      length: L,
      direction: load.dir || load.direction || '-z',
      coordinate: resolved.coordinate || load.coordinate || 'global',
    },
  };
}

function loadIssue(load, code, component, value) {
  return { code, entityType: 'load', entityId: load.id || null, memberId: load.member || null, component, value };
}
