import { beamRotationShapes, bendingPhi, clamp01, loadSource, negateVector } from './common.js';

export const FIXED_END_MEMBER_MOMENT_VERSION = 'p7-m7-consistent-member-moment-v1';

export function fixedEndMemberMoment(load, ax, md = {}) {
  const inputLength = Number(ax?.L);
  const L = Number.isFinite(inputLength) ? inputLength : 0;
  const inputPosition = Number(load.at ?? load.t ?? 0.5);
  const r = clamp01(load.at ?? load.t, 0.5);
  const axis = load.axis || 'z';
  const inputMoment = Number(load.M);
  const M = Number.isFinite(inputMoment) ? inputMoment : 0;
  const fe = new Array(12).fill(0);
  const phi = bendingPhi(md.timoshenko, axis === 'y' ? 'y' : 'z');
  const derivatives = beamRotationShapes(r, L, phi);

  if (axis === 'z') {
    fe[1] = M * derivatives[0];
    fe[5] = M * derivatives[1];
    fe[7] = M * derivatives[2];
    fe[11] = M * derivatives[3];
  } else if (axis === 'y') {
    fe[2] = -M * derivatives[0];
    fe[4] = M * derivatives[1];
    fe[8] = -M * derivatives[2];
    fe[10] = M * derivatives[3];
  } else if (axis === 'x') {
    fe[3] = M * (1 - r);
    fe[9] = M * r;
  }

  const q0 = negateVector(fe);
  const issues = [];
  if (!['x', 'y', 'z'].includes(axis)) issues.push(loadIssue(load, 'UNSUPPORTED_MEMBER_MOMENT_AXIS', 'axis', axis));
  if (!Number.isFinite(inputMoment)) issues.push(loadIssue(load, 'NONFINITE_LOAD_COMPONENT', 'M', load.M));
  if (!Number.isFinite(inputPosition) || inputPosition < 0 || inputPosition > 1) {
    issues.push(loadIssue(load, 'INVALID_MEMBER_LOAD_POSITION', 'at', load.at ?? load.t));
  }
  if (!(L > 0)) issues.push(loadIssue(load, 'INVALID_MEMBER_LENGTH', 'L', ax?.L));
  return {
    ok: issues.length === 0,
    reason: issues[0]?.code || null,
    issues,
    version: FIXED_END_MEMBER_MOMENT_VERSION,
    source: loadSource(load),
    method: axis === 'x' ? 'consistent-member-torsional-moment' : 'consistent-member-point-couple',
    timoshenko: md.timoshenko || null,
    fe,
    q0,
    recovery: {
      type: 'moment',
      a: r * L,
      axis,
      M,
    },
    handcalc: {
      expression: axis === 'x'
        ? 'fe = M [1-a/L, a/L] on torsional rotation DOFs'
        : phi > 0
          ? 'fe = M times the exact-static Timoshenko cross-section rotation interpolation at x=a'
          : 'fe = M times the derivative of the cubic Hermite displacement interpolation at x=a',
      axis,
      position: r,
      moment: M,
      coordinate: 'local',
      shapeDerivatives: derivatives,
      phi,
      equivalentNodalVector: fe.slice(),
      endMoments: {
        i: fe[axis === 'x' ? 3 : axis === 'y' ? 4 : 5],
        j: fe[axis === 'x' ? 9 : axis === 'y' ? 10 : 11],
      },
    },
  };
}

function loadIssue(load, code, component, value) {
  return { code, entityType: 'load', entityId: load.id || null, memberId: load.member || null, component, value };
}
