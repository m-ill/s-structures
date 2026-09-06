import { createElasticFactorSession } from '../compute/elastic/factorSession.js';
import { stableHash } from '../core/stableHash.js';

export const DYNAMIC_CONDENSATION_VERSION = 'p14-m2-massless-dof-condensation-v1';

export function condenseMasslessDynamicDofs(input = {}) {
  const stiffness = input.stiffness || [];
  const mass = input.mass || [];
  const active = Array.from(input.activeDofs || [], Number);
  const residual = Array.from(input.residualDofs || [], Number);
  const size = stiffness.length;
  validateSquare(stiffness, size, 'stiffness');
  validateSquare(mass, size, 'mass');
  if (!active.length) throw condensationError('DYNAMIC_ACTIVE_DOFS_REQUIRED');
  const transformation = Array.from({ length: size }, () => new Array(active.length).fill(0));
  active.forEach((dof, column) => { transformation[dof][column] = 1; });
  let factorization = null;
  if (residual.length) {
    const krr = submatrix(stiffness, residual, residual);
    const krm = submatrix(stiffness, residual, active);
    const session = createElasticFactorSession();
    for (let column = 0; column < active.length; column += 1) {
      const rhs = krm.map((row) => -row[column]);
      const solved = session.solve(krr, rhs, { groupKey: 'dynamic-massless-condensation', componentKey: `column-${column}`, matrixClass: 'spd' });
      if (!solved.ok) {
        session.dispose();
        throw condensationError(solved.reason || 'DYNAMIC_RESIDUAL_CONDENSATION_FAILED');
      }
      residual.forEach((dof, row) => { transformation[dof][column] = Number(solved.x[row]) || 0; });
    }
    factorization = session.dispose();
  }
  const stiffnessReduced = triple(transformation, stiffness);
  const massReduced = triple(transformation, mass);
  const core = {
    version: DYNAMIC_CONDENSATION_VERSION,
    activeDofs: active,
    residualDofs: residual,
    fullDofCount: size,
    reducedDofCount: active.length,
    stiffness: stiffnessReduced,
    mass: massReduced,
    transformation,
    factorization,
    method: residual.length ? 'static-guyan-condensation-of-zero-mass-dofs' : 'identity-active-dof-projection',
  };
  return {
    ...core,
    condensationHash: stableHash(core),
    expandVector: (values) => transformation.map((row) => dot(row, values)),
    reduceForce: (values) => transposeMultiply(transformation, values),
    projectCoordinateVector: (values) => active.map((dof) => Number(values?.[dof]) || 0),
  };
}

function triple(T, matrix) {
  const mT = matrix.map((row) => T[0].map((_value, column) => dot(row, T.map((item) => item[column]))));
  return T[0].map((_value, row) => T[0].map((_other, column) => T.reduce((sum, item, index) => sum + item[row] * mT[index][column], 0)));
}
function transposeMultiply(T, values) { return T[0].map((_value, column) => T.reduce((sum, row, index) => sum + row[column] * (Number(values?.[index]) || 0), 0)); }
function submatrix(matrix, rows, columns) { return rows.map((row) => columns.map((column) => Number(matrix[row]?.[column]) || 0)); }
function dot(a, b) { return a.reduce((sum, value, index) => sum + Number(value || 0) * Number(b[index] || 0), 0); }
function validateSquare(matrix, size, name) { if (!Array.isArray(matrix) || matrix.length !== size || matrix.some((row) => !Array.isArray(row) || row.length !== size)) throw condensationError('DYNAMIC_MATRIX_INVALID', { name }); }
function condensationError(code, details = {}) { return Object.assign(new Error(code), { code, details }); }
