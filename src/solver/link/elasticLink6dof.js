import { stableHash } from '../../core/stableHash.js';

export const ELASTIC_LINK_6DOF_VERSION = 'p18-elastic-link-6dof-v1';

/** Build the MIDAS-style beta-angle frame. Rows map global vectors to local. */
export function buildElasticLinkLocalFrame(nodeI, nodeJ, betaDeg = 0, options = {}) {
  const x = normalize([
    Number(nodeJ?.x) - Number(nodeI?.x),
    Number(nodeJ?.y) - Number(nodeI?.y),
    Number(nodeJ?.z || 0) - Number(nodeI?.z || 0),
  ]);
  if (!x) return failure('ELASTIC_LINK_ZERO_LENGTH', 'Elastic link nodes must be distinct.');
  const nearVerticalTolerance = positive(options.nearVerticalTolerance, 1e-8);
  const nearVertical = Math.hypot(x[0], x[1]) <= nearVerticalTolerance;
  const up = nearVertical ? [1, 0, 0] : [0, 0, 1];
  const y0 = normalize(cross(up, x));
  if (!y0) return failure('ELASTIC_LINK_FRAME_DEGENERATE', 'Elastic link local frame is degenerate.');
  const z0 = cross(x, y0);
  const beta = Number(betaDeg) * Math.PI / 180;
  if (!Number.isFinite(beta)) return failure('ELASTIC_LINK_BETA_INVALID', 'Elastic link beta angle must be finite.');
  const c = Math.cos(beta);
  const s = Math.sin(beta);
  const y = add(scale(y0, c), scale(z0, s));
  const z = add(scale(y0, -s), scale(z0, c));
  const length = distance(nodeI, nodeJ);
  const core = {
    version: ELASTIC_LINK_6DOF_VERSION,
    ok: true,
    length,
    betaDeg: Number(betaDeg),
    branch: nearVertical ? 'global-x-up' : 'global-z-up',
    up,
    x,
    y,
    z,
    rotation: [x, y, z],
  };
  return Object.freeze({ ...core, frameHash: stableHash(core) });
}

/**
 * Return q=C*u_local for OpenSees TwoNodeLink-style shear-distance coupling.
 * Local DOF order is [ux,uy,uz,rx,ry,rz] at i followed by the same at j.
 */
export function buildTwoNodeLinkBasicOperator(length, shearDist = 0.5) {
  const L = Number(length);
  const s = Number(shearDist);
  if (!(L > 0)) throw codedError('ELASTIC_LINK_LENGTH_INVALID', 'Elastic link length must be positive.');
  if (!Number.isFinite(s) || s < 0 || s > 1) throw codedError('ELASTIC_LINK_SHEAR_DISTANCE_INVALID', 'shearDist must be between zero and one.');
  const C = matrix(6, 12);
  C[0][0] = -1; C[0][6] = 1;
  C[1][1] = -1; C[1][7] = 1; C[1][5] = -L * (1 - s); C[1][11] = -L * s;
  C[2][2] = -1; C[2][8] = 1; C[2][4] = L * (1 - s); C[2][10] = L * s;
  C[3][3] = -1; C[3][9] = 1;
  C[4][4] = -1; C[4][10] = 1;
  C[5][5] = -1; C[5][11] = 1;
  return Object.freeze({
    version: ELASTIC_LINK_6DOF_VERSION,
    length: L,
    shearDist: s,
    matrix: deepFreeze(C),
    operatorHash: stableHash({ length: L, shearDist: s, C }),
  });
}

export function buildElasticLink6dofMatrix(input = {}) {
  const stiffness = normalizeStiffness(input.stiffness);
  const frame = input.frame?.ok ? input.frame : buildElasticLinkLocalFrame(input.nodeI, input.nodeJ, input.betaDeg, input);
  if (!frame.ok) return frame;
  const basic = buildTwoNodeLinkBasicOperator(frame.length, input.shearDist ?? 0.5);
  const transform = blockRotation12(frame.rotation);
  const B = multiply(basic.matrix, transform);
  const localStiffness = diagonal(stiffness);
  const globalStiffness = multiply(transpose(B), multiply(localStiffness, B));
  const core = {
    version: ELASTIC_LINK_6DOF_VERSION,
    ok: true,
    formulation: 'K=B^T*diag(k)*B; B=C*T',
    stiffness,
    frame,
    basic,
    transform,
    basicOperator: B,
    localStiffness,
    globalStiffness,
  };
  return deepFreeze({ ...core, matrixHash: stableHash(core) });
}

export function recoverElasticLink6dofResponse(input = {}) {
  const built = input.built?.ok ? input.built : buildElasticLink6dofMatrix(input);
  if (!built.ok) return built;
  const displacement = finiteVector(input.displacement, 12, 'ELASTIC_LINK_DISPLACEMENT_INVALID');
  const basicDeformation = multiplyVector(built.basicOperator, displacement);
  const basicForce = basicDeformation.map((value, index) => built.stiffness[index] * value);
  const globalEndForce = multiplyVector(transpose(built.basicOperator), basicForce);
  const strainEnergy = 0.5 * dot(basicDeformation, basicForce);
  const core = {
    version: ELASTIC_LINK_6DOF_VERSION,
    ok: true,
    matrixHash: built.matrixHash,
    displacement,
    basicDeformation,
    basicForce,
    globalEndForce,
    strainEnergy,
  };
  return deepFreeze({ ...core, responseHash: stableHash(core) });
}

function normalizeStiffness(value) {
  if (!Array.isArray(value) || value.length !== 6) throw codedError('ELASTIC_LINK_STIFFNESS_INVALID', 'Elastic link stiffness must contain six components.');
  return value.map((item, index) => {
    const number = Number(item);
    if (!Number.isFinite(number) || number < 0) throw codedError('ELASTIC_LINK_STIFFNESS_INVALID', `Elastic link stiffness[${index}] must be finite and nonnegative.`);
    return number;
  });
}

function blockRotation12(rotation) {
  const result = matrix(12, 12);
  for (let block = 0; block < 4; block += 1) for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) {
    result[3 * block + row][3 * block + column] = rotation[row][column];
  }
  return result;
}

function matrix(rows, columns) { return Array.from({ length: rows }, () => new Array(columns).fill(0)); }
function diagonal(values) { return values.map((value, row) => values.map((_item, column) => row === column ? value : 0)); }
function transpose(value) { return value[0].map((_item, column) => value.map((row) => row[column])); }
function multiply(left, right) {
  const result = matrix(left.length, right[0].length);
  for (let row = 0; row < left.length; row += 1) for (let inner = 0; inner < right.length; inner += 1) {
    const value = left[row][inner];
    if (!value) continue;
    for (let column = 0; column < right[0].length; column += 1) result[row][column] += value * right[inner][column];
  }
  return result;
}
function multiplyVector(value, vector) { return value.map((row) => dot(row, vector)); }
function dot(left, right) { return left.reduce((sum, value, index) => sum + value * right[index], 0); }
function cross(left, right) { return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]]; }
function add(left, right) { return left.map((value, index) => value + right[index]); }
function scale(value, factor) { return value.map((item) => item * factor); }
function normalize(value) { const length = Math.hypot(...value); return length > 1e-14 && value.every(Number.isFinite) ? value.map((item) => item / length) : null; }
function distance(left, right) { return Math.hypot(Number(right?.x) - Number(left?.x), Number(right?.y) - Number(left?.y), Number(right?.z || 0) - Number(left?.z || 0)); }
function positive(value, fallback) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : fallback; }
function finiteVector(value, length, code) { if (!Array.isArray(value) || value.length !== length || value.some((item) => !Number.isFinite(Number(item)))) throw codedError(code, `Expected ${length} finite components.`); return value.map(Number); }
function failure(reason, message) { return Object.freeze({ version: ELASTIC_LINK_6DOF_VERSION, ok: false, reason, message }); }
function codedError(code, message) { return Object.assign(new Error(message), { code }); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
