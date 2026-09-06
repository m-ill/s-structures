import { stableHash } from '../core/stableHash.js';

export const MODAL_DAMPING_VERSION = 'p14-m2-modal-damping-v1';

export function buildModalDampingMatrix(input = {}) {
  const mass = input.mass || [];
  const size = mass.length;
  validateSquare(mass, size, 'mass');
  const modes = Array.from(input.modes || []).map((mode, index) => normalizeMode(mode, index, size, input));
  if (!modes.length) throw dampingError('MODAL_DAMPING_MODES_REQUIRED');
  const matrix = zeros(size);
  const modalForces = [];
  for (const mode of modes) {
    const mPhi = matVec(mass, mode.vector);
    modalForces.push(mPhi);
    const coefficient = 2 * mode.dampingRatio * mode.omega;
    for (let row = 0; row < size; row += 1) for (let column = 0; column < size; column += 1) {
      matrix[row][column] += coefficient * mPhi[row] * mPhi[column];
    }
  }
  const audit = modalAudit(modes, matrix);
  const symmetryError = symmetry(matrix);
  const core = {
    version: MODAL_DAMPING_VERSION,
    type: 'modal',
    matrix,
    modes: modes.map(({ vector, ...row }) => ({ ...row, vectorHash: stableHash(vector) })),
    audit,
    symmetryError,
    positiveSemidefiniteByConstruction: true,
    formula: 'C=M*Phi*diag(2*zeta*omega)*Phi^T*M',
    massHash: stableHash(mass),
  };
  return Object.freeze({ ...core, dampingHash: stableHash(core) });
}

function normalizeMode(mode, index, size, input) {
  const vector = Array.from(mode?.dynamicVector || mode?.vector || [], Number);
  if (vector.length !== size || vector.some((value) => !Number.isFinite(value))) throw dampingError('MODAL_DAMPING_VECTOR_INVALID', { modeIndex: index });
  const omega = Number(mode?.omega);
  if (!(omega > 0) || !Number.isFinite(omega)) throw dampingError('MODAL_DAMPING_FREQUENCY_INVALID', { modeIndex: index });
  const id = String(mode?.id || `MODE${index + 1}`);
  const supplied = input.dampingRatios;
  const value = Array.isArray(supplied) ? supplied[index]
    : supplied && typeof supplied === 'object' ? supplied[id] ?? supplied[index]
      : mode?.dampingRatio ?? input.dampingRatio ?? 0.05;
  const dampingRatio = Number(value);
  if (!Number.isFinite(dampingRatio) || dampingRatio < 0 || dampingRatio > 1) throw dampingError('MODAL_DAMPING_RATIO_INVALID', { modeIndex: index });
  return { id, index: index + 1, omega, dampingRatio, vector };
}

function modalAudit(modes, matrix) {
  const rows = [];
  let maximumDiagonalError = 0;
  let maximumOffDiagonal = 0;
  for (let i = 0; i < modes.length; i += 1) for (let j = 0; j < modes.length; j += 1) {
    const value = dot(modes[i].vector, matVec(matrix, modes[j].vector));
    const expected = i === j ? 2 * modes[i].dampingRatio * modes[i].omega : 0;
    const error = Math.abs(value - expected);
    if (i === j) maximumDiagonalError = Math.max(maximumDiagonalError, error / Math.max(1, Math.abs(expected)));
    else maximumOffDiagonal = Math.max(maximumOffDiagonal, Math.abs(value));
    rows.push({ rowModeId: modes[i].id, columnModeId: modes[j].id, value, expected, error });
  }
  return { rows, maximumDiagonalError, maximumOffDiagonal, passed: maximumDiagonalError <= 1e-8 && maximumOffDiagonal <= 1e-8 };
}

function zeros(size) { return Array.from({ length: size }, () => new Array(size).fill(0)); }
function matVec(matrix, vector) { return matrix.map((row) => dot(row, vector)); }
function dot(a, b) { return a.reduce((sum, value, index) => sum + Number(value || 0) * Number(b[index] || 0), 0); }
function symmetry(matrix) { return Math.max(0, ...matrix.flatMap((row, i) => row.map((value, j) => Math.abs(value - matrix[j][i])))); }
function validateSquare(matrix, size, name) { if (!Array.isArray(matrix) || !size || matrix.some((row) => !Array.isArray(row) || row.length !== size)) throw dampingError('MODAL_DAMPING_MATRIX_INVALID', { name }); }
function dampingError(code, details = {}) { return Object.assign(new Error(code), { code, details }); }
