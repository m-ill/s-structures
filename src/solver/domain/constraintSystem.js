import { stableHash } from '../../core/stableHash.js';
import { buildDiaphragmDofMap } from '../diaphragmDofMap.js';
import {
  STRUCTURAL_DOF_KEYS,
  buildFixedDofs,
  collectPrescribedDofs,
} from './supportConstraints.js';

export const CANONICAL_CONSTRAINT_VERSION = 'p8-m1-canonical-constraint-v1';

export function buildConstraintSystem(nodes = [], rigidDiaphragms = [], options = {}) {
  const tolerance = positive(options.tolerance, 1e-11);
  const map = buildDiaphragmDofMap(nodes, rigidDiaphragms);
  const baseTransform = sparseRowsToDense(map.rows, map.ncols);
  const fixedDofs = buildFixedDofs(nodes);
  const prescribed = collectPrescribedDofs(nodes, fixedDofs);
  if (!prescribed.ok) return failed('PRESCRIBED_DISPLACEMENT_INVALID', prescribed.errors, nodes, map);

  const valueByDof = new Map(prescribed.entries.map((entry) => [entry.fullDof, entry.value]));
  const constraintRows = [...fixedDofs]
    .sort((a, b) => a - b)
    .map((fullDof) => ({
      fullDof,
      coefficients: baseTransform[fullDof].slice(),
      value: valueByDof.get(fullDof) || 0,
    }));
  const affine = solveAffineConstraints(
    constraintRows.map((row) => row.coefficients),
    constraintRows.map((row) => row.value),
    map.ncols,
    tolerance,
  );
  if (!affine.ok) {
    return failed('CONSTRAINT_SYSTEM_INCONSISTENT', [{
      code: 'CONSTRAINT_SYSTEM_INCONSISTENT',
      message: 'Support, prescribed displacement, and rigid diaphragm constraints are inconsistent.',
    }], nodes, map);
  }

  const transform = multiply(baseTransform, affine.nullspace);
  const prescribedVector = matrixVector(baseTransform, affine.particular);
  const rows = denseToSparseRows(transform, tolerance);
  const fullDofs = nodes.flatMap((node, nodeIndex) => STRUCTURAL_DOF_KEYS.map((component, componentIndex) => ({
    index: nodeIndex * 6 + componentIndex,
    nodeId: node.id,
    component,
  })));
  const reducedDofs = affine.freeColumns.map((baseColumn, index) => ({
    index,
    baseColumn,
    key: map.columnKeys?.[baseColumn] || `q:${baseColumn}`,
  }));
  const contract = {
    version: CANONICAL_CONSTRAINT_VERSION,
    ok: true,
    fullDofCount: nodes.length * 6,
    baseDofCount: map.ncols,
    reducedDofCount: affine.freeColumns.length,
    diaphragmCount: rigidDiaphragms.length,
    fullDofs,
    reducedDofs,
    rows,
    transform,
    prescribed: prescribedVector,
    constrainedFullDofs: constraintRows.map((row) => row.fullDof),
    prescribedEntries: prescribed.entries,
    pivotColumns: affine.pivotColumns,
    freeColumns: affine.freeColumns,
    baseColumnKeys: map.columnKeys || [],
  };
  return { ...contract, hash: stableHash(contract).slice(0, 24) };
}

export function expandConstraintDisplacements(constraint, reduced = []) {
  requireConstraint(constraint);
  if (reduced.length !== constraint.reducedDofCount) {
    const error = new RangeError(`Reduced displacement length must be ${constraint.reducedDofCount}.`);
    error.code = 'CONSTRAINT_REDUCED_VECTOR_SIZE';
    throw error;
  }
  const values = finiteVector(reduced, 'reduced displacement');
  return constraint.transform.map((row, index) => (
    row.reduce((sum, coefficient, column) => sum + coefficient * values[column], 0)
      + Number(constraint.prescribed[index] || 0)
  ));
}

export function reduceConstraintVector(constraint, full = []) {
  requireConstraint(constraint);
  if (full.length !== constraint.fullDofCount) throw sizeError('vector', constraint.fullDofCount, full.length);
  return transposeMatrixVector(constraint.transform, finiteVector(full, 'full vector'));
}

export function reduceConstraintMatrix(constraint, full = []) {
  requireConstraint(constraint);
  if (full.length !== constraint.fullDofCount || full.some((row) => row.length !== constraint.fullDofCount)) {
    throw sizeError('matrix', constraint.fullDofCount, full.length);
  }
  const finite = full.map((row, index) => finiteVector(row, `full matrix row ${index}`));
  return multiply(transpose(constraint.transform), multiply(finite, constraint.transform));
}

function solveAffineConstraints(coefficients, values, columnCount, tolerance) {
  if (!coefficients.length) {
    return {
      ok: true,
      particular: new Array(columnCount).fill(0),
      nullspace: identity(columnCount),
      pivotColumns: [],
      freeColumns: Array.from({ length: columnCount }, (_value, index) => index),
    };
  }
  const rows = coefficients.map((row, index) => [...row.map(Number), Number(values[index] || 0)]);
  const pivotColumns = [];
  let pivotRow = 0;
  for (let column = 0; column < columnCount && pivotRow < rows.length; column += 1) {
    let selected = pivotRow;
    for (let row = pivotRow + 1; row < rows.length; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[selected][column])) selected = row;
    }
    if (Math.abs(rows[selected][column]) <= tolerance) continue;
    [rows[pivotRow], rows[selected]] = [rows[selected], rows[pivotRow]];
    const scale = rows[pivotRow][column];
    for (let j = column; j <= columnCount; j += 1) rows[pivotRow][j] /= scale;
    for (let row = 0; row < rows.length; row += 1) {
      if (row === pivotRow) continue;
      const factor = rows[row][column];
      if (Math.abs(factor) <= tolerance) continue;
      for (let j = column; j <= columnCount; j += 1) rows[row][j] -= factor * rows[pivotRow][j];
    }
    pivotColumns.push(column);
    pivotRow += 1;
  }
  for (const row of rows) {
    const coefficientNorm = Math.max(0, ...row.slice(0, columnCount).map(Math.abs));
    if (coefficientNorm <= tolerance && Math.abs(row[columnCount]) > tolerance) return { ok: false };
  }
  const pivotSet = new Set(pivotColumns);
  const freeColumns = Array.from({ length: columnCount }, (_value, index) => index).filter((index) => !pivotSet.has(index));
  const particular = new Array(columnCount).fill(0);
  pivotColumns.forEach((column, row) => { particular[column] = clean(rows[row][columnCount], tolerance); });
  const nullspace = Array.from({ length: columnCount }, () => new Array(freeColumns.length).fill(0));
  freeColumns.forEach((column, freeIndex) => {
    nullspace[column][freeIndex] = 1;
    pivotColumns.forEach((pivot, row) => {
      nullspace[pivot][freeIndex] = clean(-rows[row][column], tolerance);
    });
  });
  return { ok: true, particular, nullspace, pivotColumns, freeColumns };
}

function failed(reason, errors, nodes, map) {
  return {
    version: CANONICAL_CONSTRAINT_VERSION,
    ok: false,
    reason,
    errors,
    fullDofCount: nodes.length * 6,
    baseDofCount: map.ncols,
    reducedDofCount: 0,
    diaphragmCount: map.diaphragmCount || 0,
  };
}

function sparseRowsToDense(rows, columnCount) {
  return rows.map((row) => {
    const dense = new Array(columnCount).fill(0);
    for (const [column, coefficient] of row || []) dense[column] += Number(coefficient || 0);
    return dense;
  });
}

function denseToSparseRows(matrix, tolerance) {
  return matrix.map((row) => row.flatMap((value, column) => (
    Math.abs(value) > tolerance ? [[column, clean(value, tolerance)]] : []
  )));
}

function multiply(a, b) {
  if (!a.length) return [];
  const columns = b[0]?.length || 0;
  const inner = b.length;
  return a.map((row) => Array.from({ length: columns }, (_value, column) => {
    let sum = 0;
    for (let index = 0; index < inner; index += 1) sum += Number(row[index] || 0) * Number(b[index][column] || 0);
    return sum;
  }));
}

function matrixVector(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * Number(vector[index] || 0), 0));
}

function transposeMatrixVector(matrix, vector) {
  const out = new Array(matrix[0]?.length || 0).fill(0);
  matrix.forEach((row, fullIndex) => row.forEach((coefficient, reducedIndex) => {
    out[reducedIndex] += coefficient * Number(vector[fullIndex] || 0);
  }));
  return out;
}

function transpose(matrix) {
  return Array.from({ length: matrix[0]?.length || 0 }, (_value, column) => matrix.map((row) => row[column]));
}

function identity(size) {
  return Array.from({ length: size }, (_row, i) => Array.from({ length: size }, (_column, j) => (i === j ? 1 : 0)));
}

function requireConstraint(constraint) {
  if (!constraint?.ok || constraint.version !== CANONICAL_CONSTRAINT_VERSION) {
    const error = new TypeError('A valid canonical constraint contract is required.');
    error.code = 'CONSTRAINT_CONTRACT_INVALID';
    throw error;
  }
}

function sizeError(kind, expected, actual) {
  const error = new RangeError(`Full ${kind} size must be ${expected}; received ${actual}.`);
  error.code = 'CONSTRAINT_FULL_SIZE';
  return error;
}

function finiteVector(values, label) {
  return Array.from(values, (value, index) => {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      const error = new TypeError(`${label}[${index}] must be finite.`);
      error.code = 'CONSTRAINT_VALUE_NONFINITE';
      throw error;
    }
    return number;
  });
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clean(value, tolerance) {
  return Math.abs(value) <= tolerance ? 0 : value;
}
