export const FIXED_END_COMMON_VERSION = 'p7-m7-axis-aware-load-direction-v1';

export const FIXED_END_AXIS = {
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 1, 0],
  '-y': [0, -1, 0],
  '+z': [0, 0, 1],
  '-z': [0, 0, -1],
};

const GAUSS5 = [
  [-0.906179845938664, 0.236926885056189],
  [-0.538469310105683, 0.478628670499366],
  [0, 0.568888888888889],
  [0.538469310105683, 0.478628670499366],
  [0.906179845938664, 0.236926885056189],
];

export function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export function resolveLoadDirection(load = {}, ax = null) {
  const coordinate = normalizeLoadCoordinate(load.coordinate ?? load.coordinateSystem ?? load.coord);
  if (!coordinate) {
    return directionFailure('UNSUPPORTED_LOAD_COORDINATE_SYSTEM', load, 'coordinate', load.coordinate ?? load.coordinateSystem ?? load.coord);
  }

  const raw = rawDirection(load);
  if (!raw.ok) return raw;
  const norm = Math.hypot(...raw.vector);
  if (!(norm > 0) || !Number.isFinite(norm)) {
    return directionFailure('INVALID_LOAD_DIRECTION', load, 'direction', raw.input);
  }
  const input = raw.vector.map((value) => value / norm);

  if (coordinate === 'local') {
    if (!validAxes(ax)) {
      return directionFailure('MEMBER_AXES_REQUIRED_FOR_LOCAL_LOAD', load, 'coordinate', coordinate);
    }
    return {
      ok: true,
      coordinate,
      input,
      local: input,
      global: combineAxes(ax, input),
    };
  }

  return {
    ok: true,
    coordinate,
    input,
    global: input,
    local: validAxes(ax) ? [dotStrict(ax.x, input), dotStrict(ax.y, input), dotStrict(ax.z, input)] : null,
  };
}

export function loadDirection(load = {}, ax = null) {
  const resolved = resolveLoadDirection(load, ax);
  return resolved.ok ? resolved.global : null;
}

export function resolveLoadComponents(load = {}, ax = null, value, component = 'magnitude') {
  const direction = resolveLoadDirection(load, ax);
  if (!direction.ok) return direction;
  const magnitude = finiteNumber(value);
  if (magnitude == null) {
    return directionFailure('NONFINITE_LOAD_COMPONENT', load, component, value);
  }
  return {
    ...direction,
    magnitude,
    localComponents: direction.local.map((item) => item * magnitude),
    globalComponents: direction.global.map((item) => item * magnitude),
  };
}

export function localComponents(ax, direction, magnitude) {
  const m = Number(magnitude) || 0;
  return [
    dot(ax.x, direction) * m,
    dot(ax.y, direction) * m,
    dot(ax.z, direction) * m,
  ];
}

export function dot(a = [], b = []) {
  return (Number(a[0]) || 0) * (Number(b[0]) || 0)
    + (Number(a[1]) || 0) * (Number(b[1]) || 0)
    + (Number(a[2]) || 0) * (Number(b[2]) || 0);
}

export function addConsistentPoint(fe, localForce, r, L) {
  const xi = clamp01(r);
  const [N1, N2, N3, N4] = beamShapes(xi, L);
  const [qx, qy, qz] = localForce;
  fe[0] += (1 - xi) * qx;
  fe[6] += xi * qx;
  fe[1] += N1 * qy;
  fe[5] += N2 * qy;
  fe[7] += N3 * qy;
  fe[11] += N4 * qy;
  fe[2] += N1 * qz;
  fe[4] += -N2 * qz;
  fe[8] += N3 * qz;
  fe[10] += -N4 * qz;
}

export function addConsistentDistributed(fe, L, aRatio, bRatio, qAtRatio) {
  const a = clamp01(aRatio, 0);
  const b = clamp01(bRatio, 1);
  if (!(b > a) || !(L > 0)) return;
  integrateGauss(a, b, (r, weight) => {
    const [N1, N2, N3, N4] = beamShapes(r, L);
    const [qx, qy, qz] = qAtRatio(r);
    const dx = L * weight;
    fe[0] += (1 - r) * qx * dx;
    fe[6] += r * qx * dx;
    fe[1] += N1 * qy * dx;
    fe[5] += N2 * qy * dx;
    fe[7] += N3 * qy * dx;
    fe[11] += N4 * qy * dx;
    fe[2] += N1 * qz * dx;
    fe[4] += -N2 * qz * dx;
    fe[8] += N3 * qz * dx;
    fe[10] += -N4 * qz * dx;
  });
}

export function beamShapes(r, L) {
  const r2 = r * r;
  const r3 = r2 * r;
  return [
    1 - 3 * r2 + 2 * r3,
    L * (r - 2 * r2 + r3),
    3 * r2 - 2 * r3,
    L * (r3 - r2),
  ];
}

export function integrateGauss(a, b, fn) {
  const mid = (a + b) / 2;
  const half = (b - a) / 2;
  for (const [point, weight] of GAUSS5) fn(mid + half * point, half * weight);
}

export function negateVector(vector) {
  return vector.map((value) => -value);
}

export function vectorSum(vectors = []) {
  const out = [0, 0, 0];
  for (const v of vectors) {
    out[0] += Number(v?.[0]) || 0;
    out[1] += Number(v?.[1]) || 0;
    out[2] += Number(v?.[2]) || 0;
  }
  return out;
}

export function loadSource(load = {}) {
  return {
    id: load.id || null,
    type: load.type || null,
    member: load.member || null,
    case: load.case || 'LC1',
  };
}

function normalizeLoadCoordinate(value) {
  const coordinate = String(value ?? 'global').trim().toLowerCase().replaceAll('_', '-');
  if (['global', 'world'].includes(coordinate)) return 'global';
  if (['local', 'member', 'member-local', 'local-member'].includes(coordinate)) return 'local';
  return null;
}

function rawDirection(load) {
  if (load.direction != null) {
    if (!Array.isArray(load.direction) || load.direction.length !== 3) {
      return directionFailure('INVALID_LOAD_DIRECTION', load, 'direction', load.direction);
    }
    const vector = load.direction.map((value) => finiteNumber(value));
    if (vector.some((value) => value == null)) {
      return directionFailure('NONFINITE_LOAD_DIRECTION', load, 'direction', load.direction);
    }
    return { ok: true, vector, input: load.direction };
  }
  const key = load.dir ?? '-z';
  const vector = FIXED_END_AXIS[key];
  if (!vector) return directionFailure('INVALID_LOAD_DIRECTION', load, 'dir', key);
  return { ok: true, vector: vector.slice(), input: key };
}

function validAxes(ax) {
  return ['x', 'y', 'z'].every((key) => (
    Array.isArray(ax?.[key]) && ax[key].length === 3 && ax[key].every((value) => Number.isFinite(Number(value)))
  ));
}

function combineAxes(ax, local) {
  return [0, 1, 2].map((component) => (
    Number(ax.x[component]) * local[0]
    + Number(ax.y[component]) * local[1]
    + Number(ax.z[component]) * local[2]
  ));
}

function dotStrict(a, b) {
  return Number(a[0]) * b[0] + Number(a[1]) * b[1] + Number(a[2]) * b[2];
}

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function directionFailure(code, load, component, value) {
  return {
    ok: false,
    reason: code,
    issue: {
      code,
      entityType: 'load',
      entityId: load.id || null,
      memberId: load.member || null,
      component,
      value,
    },
  };
}
