import { vcross } from '../core/vector.js';
import { matMul, matTrans, matVec, memberAxes, transform12 } from './linear3dElement.js';

export const MEMBER_OFFSET_VERSION = 'p10-m4-member-offset-v1';
export const MEMBER_OFFSET_FRAMES = Object.freeze(['local', 'global']);
export const INSERTION_POINTS = Object.freeze([
  'centroid',
  'top-center',
  'bottom-center',
  'center-left',
  'center-right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]);

export function resolveMemberOffsetKinematics(member = {}, a = {}, b = {}, section = {}) {
  const base = memberAxes(a, b, member.localAxis);
  if (!(base.L > 0) || !finiteVector(base.x) || !finiteVector(base.y) || !finiteVector(base.z)) {
    return failure('INVALID_MEMBER_OFFSET_GEOMETRY', member, 'Member gross geometry is invalid.');
  }
  const normalized = normalizeMemberEndOffset(member.endOffset, member);
  if (!normalized.ok) return normalized;
  const insertion = resolveInsertionPointOffset(member.insertionPoint, section, member);
  if (!insertion.ok) return insertion;

  const rawI = vectorToGlobal(normalized.i, normalized.frame, base);
  const rawJ = vectorToGlobal(normalized.j, normalized.frame, base);
  const insertionGlobal = vectorToGlobal(insertion.vector, 'local', base);
  const globalI = add3(rawI, insertionGlobal);
  const globalJ = add3(rawJ, insertionGlobal);
  const start = addPoint(a, globalI);
  const end = addPoint(b, globalJ);
  const flexibleVector = [end.x - start.x, end.y - start.y, end.z - start.z];
  const forwardProjection = dot3(base.x, flexibleVector);
  if (!(forwardProjection > Math.max(1e-9, base.L * 1e-12))) {
    return failure(
      'INVALID_MEMBER_OFFSET_CLEAR_LENGTH',
      member,
      'Member end offsets must leave a positive forward flexible length.',
    );
  }
  const ax = memberAxes(start, end, member.localAxis);
  if (!(ax.L > Math.max(1e-9, base.L * 1e-12))) {
    return failure('INVALID_MEMBER_OFFSET_CLEAR_LENGTH', member, 'Member end offsets must leave a positive flexible length.');
  }
  const localI = globalToLocal(globalI, ax);
  const localJ = globalToLocal(globalJ, ax);
  const offsetTransform = rigidArmTransform12(localI, localJ);
  const T = matMul(offsetTransform, transform12(ax));
  const applied = maxAbs([...globalI, ...globalJ]) > 0;
  const vector3d = normalized.vectorInput || maxAbs([
    localI[1], localI[2], localJ[1], localJ[2],
  ]) > 1e-14;
  const offset = legacyOffsetSnapshot(normalized, {
    applied,
    vector3d,
    insertion,
    globalI,
    globalJ,
    localI,
    localJ,
  });

  return {
    version: MEMBER_OFFSET_VERSION,
    ok: true,
    ax: {
      ...ax,
      grossL: base.L,
      offset,
      flexibleStart: start,
      flexibleEnd: end,
    },
    T,
    applied,
    vector3d,
    rigidFactor: normalized.rigidFactor,
    frame: normalized.frame,
    vectors: {
      global: { i: globalI, j: globalJ },
      local: { i: localI, j: localJ },
      insertionLocal: insertion.vector,
    },
    insertionPoint: insertion.name,
    flexibleStart: start,
    flexibleEnd: end,
    grossAxes: base,
    offsetTransform,
  };
}

export function normalizeMemberEndOffset(value, member = {}) {
  if (value == null) {
    return {
      ok: true,
      i: [0, 0, 0],
      j: [0, 0, 0],
      legacyI: 0,
      legacyJ: 0,
      rigidFactor: 1,
      frame: 'local',
      vectorInput: false,
    };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return failure('INVALID_MEMBER_OFFSET', member, 'member.endOffset must be an object.');
  }
  const frame = value.frame ?? 'local';
  if (!MEMBER_OFFSET_FRAMES.includes(frame)) {
    return failure('INVALID_MEMBER_OFFSET_FRAME', member, 'Member offset frame must be local or global.');
  }
  const rigidFactor = value.rigidFactor ?? 1;
  if (typeof rigidFactor !== 'number' || !Number.isFinite(rigidFactor) || Math.abs(rigidFactor - 1) > 1e-12) {
    return failure(
      'UNSUPPORTED_MEMBER_OFFSET_RIGID_FACTOR',
      member,
      'Only fully rigid end offsets with rigidFactor=1 are supported.',
    );
  }
  const i = normalizeEnd(value.i, 'i', member);
  if (!i.ok) return i;
  const j = normalizeEnd(value.j, 'j', member);
  if (!j.ok) return j;
  return {
    ok: true,
    i: i.vector,
    j: j.vector,
    legacyI: i.legacyLength,
    legacyJ: j.legacyLength,
    rigidFactor,
    frame,
    vectorInput: i.vectorInput || j.vectorInput,
  };
}

export function resolveInsertionPointOffset(value, section = {}, member = {}) {
  const name = value == null ? 'centroid' : typeof value === 'string' ? value : value?.position;
  if (!INSERTION_POINTS.includes(name)) {
    return failure('INVALID_MEMBER_INSERTION_POINT', member, `Unsupported member insertion point: ${name}.`);
  }
  if (name === 'centroid') return { ok: true, name, vector: [0, 0, 0] };
  const H = sectionDimension(section, 'H', ['h', 'depth']);
  const B = sectionDimension(section, 'B', ['b', 'width']);
  if (!(H > 0) || !(B > 0)) {
    return failure(
      'MEMBER_INSERTION_POINT_SECTION_DIMENSIONS_REQUIRED',
      member,
      'A non-centroid insertion point requires positive section H and B dimensions.',
    );
  }
  const [vertical, horizontal] = name.split('-');
  const pointY = vertical === 'top' ? H / 2 : vertical === 'bottom' ? -H / 2 : 0;
  const pointZ = horizontal === 'right' ? B / 2 : horizontal === 'left' ? -B / 2 : 0;
  // The named point lies on the joint/reference line.  The rigid arm points
  // from that line to the section centroid, hence the negative point vector.
  return { ok: true, name, vector: [0, -pointY, -pointZ], dimensions: { H, B } };
}

export function rigidArmTransform12(localI = [0, 0, 0], localJ = [0, 0, 0]) {
  const transform = identity12();
  for (const [base, vector] of [[0, localI], [6, localJ]]) {
    const [rx, ry, rz] = vector;
    // u_face = u_joint + theta x r = u_joint - skew(r) theta
    transform[base][base + 4] = rz;
    transform[base][base + 5] = -ry;
    transform[base + 1][base + 3] = -rz;
    transform[base + 1][base + 5] = rx;
    transform[base + 2][base + 3] = ry;
    transform[base + 2][base + 4] = -rx;
  }
  return transform;
}

export function buildMemberOffsetRecoveryTrace(kinematics, localEndForces = []) {
  if (!kinematics?.ok || !finiteVector(localEndForces, 12)) return null;
  const rotation = transform12(kinematics.ax);
  const faceGlobal = matVec(matTrans(rotation), localEndForces);
  const jointGlobal = matVec(matTrans(kinematics.T), localEndForces);
  const rows = [
    endTransferRow('i', faceGlobal.slice(0, 6), jointGlobal.slice(0, 6), kinematics.vectors.global.i),
    endTransferRow('j', faceGlobal.slice(6, 12), jointGlobal.slice(6, 12), kinematics.vectors.global.j),
  ];
  return {
    version: MEMBER_OFFSET_VERSION,
    applied: kinematics.applied,
    vector3d: kinematics.vector3d,
    frame: kinematics.frame,
    insertionPoint: kinematics.insertionPoint,
    flexibleLength: kinematics.ax.L,
    grossLength: kinematics.ax.grossL,
    vectors: clone(kinematics.vectors),
    rows,
    faceEndGlobal: faceGlobal,
    jointEndGlobal: jointGlobal,
    maxEquilibriumResidual: Math.max(0, ...rows.map((row) => row.equilibriumResidual)),
    transferEquation: 'F_joint=F_face; M_joint=M_face+r_cross_F_face',
  };
}

export function memberOffsetInputValues(member = {}) {
  const normalized = normalizeMemberEndOffset(member.endOffset, member);
  if (!normalized.ok) {
    const error = new Error(normalized.message);
    error.code = normalized.reason;
    throw error;
  }
  return {
    values: [...normalized.i, ...normalized.j],
    frame: normalized.frame,
    rigidFactor: normalized.rigidFactor,
    vectorInput: normalized.vectorInput,
    kindMask: (typeof member.endOffset?.i === 'object' && member.endOffset?.i != null ? 1 : 0)
      | (typeof member.endOffset?.j === 'object' && member.endOffset?.j != null ? 2 : 0),
  };
}

function normalizeEnd(value, end, member) {
  if (value == null) return { ok: true, vector: [0, 0, 0], legacyLength: 0, vectorInput: false };
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      return failure('INVALID_MEMBER_OFFSET', member, `Member ${end}-end offset length must be finite and nonnegative.`);
    }
    return {
      ok: true,
      vector: [end === 'i' ? value : -value, 0, 0],
      legacyLength: value,
      vectorInput: false,
    };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return failure('INVALID_MEMBER_OFFSET', member, `Member ${end}-end offset must be a number or {dx,dy,dz}.`);
  }
  const unknown = Object.keys(value).filter((key) => !['dx', 'dy', 'dz'].includes(key));
  if (unknown.length) {
    return failure('INVALID_MEMBER_OFFSET', member, `Unsupported member ${end}-end offset component: ${unknown[0]}.`);
  }
  const vector = ['dx', 'dy', 'dz'].map((key) => value[key] ?? 0);
  if (vector.some((component) => typeof component !== 'number' || !Number.isFinite(component))) {
    return failure('INVALID_MEMBER_OFFSET', member, `Member ${end}-end offset components must be finite numbers.`);
  }
  return { ok: true, vector, legacyLength: 0, vectorInput: true };
}

function endTransferRow(end, face, joint, arm) {
  const force = face.slice(0, 3);
  const faceMoment = face.slice(3, 6);
  const expectedMoment = add3(faceMoment, cross3(arm, force));
  const forceResidual = joint.slice(0, 3).map((value, index) => value - force[index]);
  const momentResidual = joint.slice(3, 6).map((value, index) => value - expectedMoment[index]);
  const scale = Math.max(1, maxAbs([...force, ...faceMoment, ...expectedMoment, ...joint]));
  return {
    end,
    arm: [...arm],
    faceForce: force,
    faceMoment,
    jointForce: joint.slice(0, 3),
    jointMoment: joint.slice(3, 6),
    expectedJointMoment: expectedMoment,
    forceResidual,
    momentResidual,
    equilibriumResidual: maxAbs([...forceResidual, ...momentResidual]) / scale,
  };
}

function legacyOffsetSnapshot(normalized, details) {
  const base = {
    i: normalized.legacyI,
    j: normalized.legacyJ,
    rigidFactor: normalized.rigidFactor,
  };
  if (!details.vector3d && details.insertion.name === 'centroid') return base;
  return {
    ...base,
    frame: normalized.frame,
    vector3d: details.vector3d,
    vectors: {
      global: { i: [...details.globalI], j: [...details.globalJ] },
      local: { i: [...details.localI], j: [...details.localJ] },
    },
    insertionPoint: details.insertion.name,
  };
}

function vectorToGlobal(vector, frame, axes) {
  if (frame === 'global') return [...vector];
  return [0, 1, 2].map((component) => (
    axes.x[component] * vector[0]
    + axes.y[component] * vector[1]
    + axes.z[component] * vector[2]
  ));
}

function globalToLocal(vector, axes) {
  return [dot3(axes.x, vector), dot3(axes.y, vector), dot3(axes.z, vector)];
}

function addPoint(point, vector) {
  return {
    ...point,
    x: Number(point.x) + vector[0],
    y: Number(point.y) + vector[1],
    z: Number(point.z || 0) + vector[2],
  };
}

function add3(a, b) {
  return [0, 1, 2].map((index) => Number(a[index] || 0) + Number(b[index] || 0));
}

function cross3(a, b) {
  return vcross(a, b);
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function identity12() {
  return Array.from({ length: 12 }, (_row, row) => (
    Array.from({ length: 12 }, (_column, column) => (row === column ? 1 : 0))
  ));
}

function maxAbs(values) {
  return Math.max(0, ...values.map((value) => Math.abs(Number(value) || 0)));
}

function finiteVector(value, length = 3) {
  return Array.isArray(value) && value.length === length && value.every((item) => Number.isFinite(Number(item)));
}

function positiveDimension(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function sectionDimension(section, key, aliases = []) {
  for (const candidate of [key, ...aliases]) {
    const direct = positiveDimension(section?.[candidate]);
    if (direct) return direct;
  }
  for (const holder of [section?.dims, section?.params]) {
    const value = positiveDimension(holder?.[key]);
    if (value) return value / 1000;
  }
  return null;
}

function failure(reason, member, message) {
  return { ok: false, reason, memberId: member?.id || null, message };
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
