import { stableHash } from '../../core/stableHash.js';
import { createCscFromTriplets } from '../../compute/sparse/matrix.js';
import { rigidRotationVector } from '../domain/rigidBodyModes.js';

export { rigidRotationVector } from '../domain/rigidBodyModes.js';

export const UNSUPPORTED_ROTATION_FLOOR_VERSION = 'p14-m9-unsupported-rotation-floor-v1';
export const UNSUPPORTED_ROTATION_FLOOR_PLAN_VERSION = 'p15-m8-unsupported-rotation-floor-plan-v1';
export const UNSUPPORTED_ROTATION_FLOOR_RATIO_RANGE = Object.freeze([1e-12, 1e-6]);

export function stabilizeUnsupportedRotations(matrix, nodes, fixedDofs, requestedFloorRatio = 1e-9) {
  if (!isDenseMatrix(matrix)) {
    throw rotationFloorError(
      'SHELL_ROTATION_FLOOR_DENSE_COMPATIBILITY_ONLY',
      'The mutating compatibility helper accepts dense matrices only; use stabilizeUnsupportedRotationSystem for CSC.',
    );
  }
  return stabilizeUnsupportedRotationSystem(matrix, nodes, fixedDofs, requestedFloorRatio).audit;
}

export function stabilizeUnsupportedRotationSystem(matrix, nodes, fixedDofs, requestedFloorRatio = 1e-9) {
  const plan = buildUnsupportedRotationFloorPlan({
    matrix,
    nodes,
    fixedDofs,
    requestedRatio: requestedFloorRatio,
  });
  return Object.freeze({
    matrix: applyUnsupportedRotationFloorPlan(matrix, plan),
    plan,
    audit: legacyRotationFloorAudit(plan),
  });
}

/**
 * Storage-independent classifier.  Dense and CSC matrices produce the same
 * canonical plan hash for the same physical matrix and constraints.
 */
export function buildUnsupportedRotationFloorPlan(input = {}) {
  const access = matrixAccess(input.matrix);
  const nodes = Array.from(input.nodes || []);
  if (!nodes.length || nodes.length * 6 !== access.dimension) {
    throw rotationFloorError('SHELL_ROTATION_FLOOR_NODE_COUNT_INVALID', 'Node count must match six-DOF matrix size.');
  }
  const fixedDofs = new Set(Array.from(input.fixedDofs || [], Number));
  const requestedRatio = Number(input.requestedRatio ?? input.floorRatio ?? 1e-9);
  const ratioValid = Number.isFinite(requestedRatio);
  const ratioInRange = ratioValid
    && requestedRatio >= UNSUPPORTED_ROTATION_FLOOR_RATIO_RANGE[0]
    && requestedRatio <= UNSUPPORTED_ROTATION_FLOOR_RATIO_RANGE[1];
  const effectiveRatio = normalizeRotationFloorRatio(requestedRatio);
  const characteristic = Math.max(0, ...Array.from({ length: access.dimension }, (_item, dof) => Math.abs(access.diagonal(dof))));
  const floorStiffness = characteristic * effectiveRatio;
  const nullThreshold = characteristic * 1e-14;
  const rigidMechanismComponents = [];
  const rigidMechanismDofs = new Set();
  for (let component = 3; component < 6; component += 1) {
    const vector = rigidRotationVector(nodes, component);
    const admissible = [...fixedDofs].every((dof) => Math.abs(vector[dof] || 0) <= 1e-14);
    const residual = access.matvec(vector);
    const residualMaximum = Math.max(0, ...residual.map(Math.abs));
    if (!admissible || residualMaximum > characteristic * Math.max(1, nodes.length) * 1e-12) continue;
    rigidMechanismComponents.push(component);
    nodes.forEach((_node, nodeIndex) => {
      const dof = nodeIndex * 6 + component;
      if (!fixedDofs.has(dof)) rigidMechanismDofs.add(dof);
    });
  }

  const affectedDofs = [];
  const physicalRotationDofs = [];
  const rejectedRigidMechanismDofs = [];
  nodes.forEach((_node, nodeIndex) => {
    for (let component = 3; component < 6; component += 1) {
      const dof = nodeIndex * 6 + component;
      if (fixedDofs.has(dof)) continue;
      if (rigidMechanismDofs.has(dof)) {
        rejectedRigidMechanismDofs.push(dof);
        continue;
      }
      if (access.rowMaximum(dof) <= nullThreshold) affectedDofs.push(dof);
      else physicalRotationDofs.push(dof);
    }
  });
  const diagonalAdditions = floorStiffness > 0
    ? affectedDofs.map((dof) => ({ dof, value: floorStiffness }))
    : [];
  const canonical = {
    effectiveRatio,
    characteristic,
    floorStiffness,
    nullThreshold,
    affectedDofs,
    diagonalAdditions,
    physicalRotationDofs,
    rigidMechanismComponents,
    rejectedRigidMechanismDofs,
  };
  const core = {
    version: UNSUPPORTED_ROTATION_FLOOR_PLAN_VERSION,
    storage: access.storage,
    requestedRatio: ratioValid ? requestedRatio : null,
    effectiveRatio,
    ratioValid,
    ratioInRange,
    clamped: !ratioInRange || requestedRatio !== effectiveRatio,
    ...canonical,
    canonicalPlanHash: stableHash(canonical),
  };
  return deepFreeze({ ...core, traceHash: stableHash(core) });
}
export function applyUnsupportedRotationFloorPlan(matrix, plan) {
  if (plan?.version !== UNSUPPORTED_ROTATION_FLOOR_PLAN_VERSION || !Array.isArray(plan.diagonalAdditions)) {
    throw rotationFloorError('SHELL_ROTATION_FLOOR_PLAN_INVALID', 'A canonical unsupported-rotation floor plan is required.');
  }
  if (isDenseMatrix(matrix)) {
    for (const addition of plan.diagonalAdditions) matrix[addition.dof][addition.dof] += addition.value;
    return matrix;
  }
  const access = matrixAccess(matrix);
  if (access.storage !== 'csc') throw rotationFloorError('SHELL_ROTATION_FLOOR_MATRIX_INVALID', 'A finite dense or CSC matrix is required.');
  const triplets = [];
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let pointer = matrix.colPtr[column]; pointer < matrix.colPtr[column + 1]; pointer += 1) {
      triplets.push({ row: matrix.rowIdx[pointer], column, value: matrix.values[pointer] });
    }
  }
  for (const addition of plan.diagonalAdditions) {
    triplets.push({ row: addition.dof, column: addition.dof, value: addition.value });
  }
  const updated = createCscFromTriplets(matrix.rowCount, matrix.colCount, triplets);
  return Object.freeze({
    ...matrix,
    ...updated,
    stabilizationPlanHash: plan.canonicalPlanHash,
  });
}

export function normalizeRotationFloorRatio(value) {
  const number = Number(value);
  return Number.isFinite(number)
    && number >= UNSUPPORTED_ROTATION_FLOOR_RATIO_RANGE[0]
    && number <= UNSUPPORTED_ROTATION_FLOOR_RATIO_RANGE[1]
    ? number
    : 1e-9;
}

function legacyRotationFloorAudit(plan) {
  return Object.freeze({
    version: UNSUPPORTED_ROTATION_FLOOR_VERSION,
    floorRatio: plan.effectiveRatio,
    requestedFloorRatio: plan.requestedRatio,
    ratioValid: plan.ratioValid,
    ratioInRange: plan.ratioInRange,
    characteristic: plan.characteristic,
    floorStiffness: plan.floorStiffness,
    nullThreshold: plan.nullThreshold,
    rigidNullComponents: [...plan.rigidMechanismComponents],
    nullModeRotationDofs: [],
    rejectedRigidMechanismDofs: [...plan.rejectedRigidMechanismDofs],
    affectedDofs: [...plan.affectedDofs],
    canonicalPlanHash: plan.canonicalPlanHash,
  });
}

function matrixAccess(matrix) {
  if (isDenseMatrix(matrix)) {
    return {
      storage: 'dense',
      dimension: matrix.length,
      diagonal: (dof) => Number(matrix[dof][dof]),
      rowMaximum: (dof) => Math.max(0, ...matrix[dof].map((value) => Math.abs(Number(value) || 0))),
      matvec: (vector) => matrix.map((row) => row.reduce((sum, value, column) => sum + Number(value) * Number(vector[column] || 0), 0)),
    };
  }
  if (matrix?.format === 'csc'
    && Number.isInteger(matrix.rowCount)
    && matrix.rowCount > 0
    && matrix.rowCount === matrix.colCount
    && matrix.colPtr?.length === matrix.colCount + 1
    && matrix.rowIdx?.length === matrix.values?.length) {
    const diagonal = new Float64Array(matrix.rowCount);
    const rowMaximum = new Float64Array(matrix.rowCount);
    for (let column = 0; column < matrix.colCount; column += 1) {
      for (let pointer = matrix.colPtr[column]; pointer < matrix.colPtr[column + 1]; pointer += 1) {
        const row = Number(matrix.rowIdx[pointer]);
        const value = Number(matrix.values[pointer]);
        if (!Number.isInteger(row) || row < 0 || row >= matrix.rowCount || !Number.isFinite(value)) {
          throw rotationFloorError('SHELL_ROTATION_FLOOR_MATRIX_INVALID', 'CSC stiffness matrix contains an invalid entry.');
        }
        rowMaximum[row] = Math.max(rowMaximum[row], Math.abs(value));
        if (row === column) diagonal[row] += value;
      }
    }
    return {
      storage: 'csc',
      dimension: matrix.rowCount,
      diagonal: (dof) => diagonal[dof],
      rowMaximum: (dof) => rowMaximum[dof],
      matvec(vector) {
        const result = new Array(matrix.rowCount).fill(0);
        for (let column = 0; column < matrix.colCount; column += 1) {
          const scale = Number(vector[column]) || 0;
          for (let pointer = matrix.colPtr[column]; pointer < matrix.colPtr[column + 1]; pointer += 1) {
            result[matrix.rowIdx[pointer]] += matrix.values[pointer] * scale;
          }
        }
        return result;
      },
    };
  }
  throw rotationFloorError('SHELL_ROTATION_FLOOR_MATRIX_INVALID', 'A finite dense or CSC square stiffness matrix is required.');
}

function isDenseMatrix(matrix) {
  return Array.isArray(matrix)
    && matrix.length > 0
    && matrix.every((row) => Array.isArray(row) && row.length === matrix.length && row.every(Number.isFinite));
}

function rotationFloorError(code, message) {
  return Object.assign(new Error(message), { code });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
