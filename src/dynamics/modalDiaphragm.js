import { resolveRigidDiaphragms } from '../core/diaphragmGroups.js';
import { buildDiaphragmDofMap } from '../solver/diaphragmDofMap.js';
import { reducedFixedDofs } from '../solver/diaphragmFixedDofs.js';
import { reduceSystem } from '../solver/diaphragmReduce.js';
import { buildConstraintSystem, reduceConstraintMatrix } from '../solver/domain/constraintSystem.js';

export const MODAL_DIAPHRAGM_VERSION = 'p7-modal-rigid-diaphragm-v1';

export function buildModalConstraintDomain(model, system, mass) {
  const groups = resolveRigidDiaphragms(model, model.nodes || []);
  const constraints = model.constraints || [];
  if (!groups.length && !constraints.length) {
    return {
      version: MODAL_DIAPHRAGM_VERSION,
      applied: false,
      groups: [],
      system,
      massMatrix: null,
      expandVector: (vector) => vector.slice(),
      summary: {
        version: MODAL_DIAPHRAGM_VERSION,
        status: 'not-applicable',
        applied: false,
        diaphragmCount: 0,
        fullDofCount: system.ndof,
        reducedDofCount: system.ndof,
      },
    };
  }


  if (constraints.length) {
    const contract = buildConstraintSystem(model.nodes || [], groups, { constraints });
    if (!contract.ok) {
      return {
        version: MODAL_DIAPHRAGM_VERSION,
        applied: false,
        ok: false,
        reason: contract.reason,
        errors: contract.errors || [],
      };
    }
    const fixedDofs = new Set();
    const K = reduceConstraintMatrix(contract, system.K);
    fixIsolatedDofs(K, fixedDofs);
    const free = [];
    for (let dof = 0; dof < contract.reducedDofCount; dof += 1) {
      if (!fixedDofs.has(dof)) free.push(dof);
    }
    const map = {
      rows: contract.rows,
      ncols: contract.reducedDofCount,
      columnKeys: contract.reducedDofs.map((row) => row.key),
    };
    return {
      version: MODAL_DIAPHRAGM_VERSION,
      applied: true,
      groups,
      map,
      constraintContract: contract,
      system: { ...system, K, free, fixedDofs, ndof: contract.reducedDofCount, diaphragmMap: map },
      massMatrix: reduceDiagonalMass(mass, map),
      expandVector: (vector) => map.rows.map((row) => row.reduce(
        (sum, [column, coefficient]) => sum + coefficient * (vector[column] || 0),
        0,
      )),
      summary: {
        version: MODAL_DIAPHRAGM_VERSION,
        status: 'available',
        applied: true,
        method: 'exact-affine-constraint-transformation',
        diaphragmCount: groups.length,
        diaphragmIds: groups.map((group) => group.id),
        generalConstraintCount: constraints.length,
        generalConstraintEquationCount: contract.generalConstraintEquationCount,
        fullDofCount: system.ndof,
        reducedDofCount: contract.reducedDofCount,
        freeDofCount: free.length,
        massReduction: 'transpose(T)-M-T',
        stiffnessReduction: 'transpose(T)-K-T',
      },
    };
  }

  const map = buildDiaphragmDofMap(model.nodes || [], groups);
  const reduced = reduceSystem(system.K, new Array(system.ndof).fill(0), map);
  const fixedDofs = reducedFixedDofs(system.fixedDofs, map);
  fixIsolatedDofs(reduced.K, fixedDofs);
  const free = [];
  for (let dof = 0; dof < map.ncols; dof += 1) {
    if (!fixedDofs.has(dof)) free.push(dof);
  }
  const reducedSystem = {
    ...system,
    K: reduced.K,
    free,
    fixedDofs,
    ndof: map.ncols,
    diaphragmMap: map,
  };

  return {
    version: MODAL_DIAPHRAGM_VERSION,
    applied: true,
    groups,
    map,
    system: reducedSystem,
    massMatrix: reduceDiagonalMass(mass, map),
    expandVector: (vector) => map.rows.map((row) => row.reduce(
      (sum, [column, coefficient]) => sum + coefficient * (vector[column] || 0),
      0,
    )),
    summary: {
      version: MODAL_DIAPHRAGM_VERSION,
      status: 'available',
      applied: true,
      method: 'exact-constraint-transformation',
      diaphragmCount: groups.length,
      diaphragmIds: groups.map((group) => group.id),
      fullDofCount: system.ndof,
      reducedDofCount: map.ncols,
      freeDofCount: free.length,
      massReduction: 'transpose(T)-M-T',
      stiffnessReduction: 'transpose(T)-K-T',
    },
  };
}

function reduceDiagonalMass(mass, map) {
  const out = Array.from({ length: map.ncols }, () => new Array(map.ncols).fill(0));
  for (let fullDof = 0; fullDof < map.rows.length; fullDof += 1) {
    const value = Number(mass[fullDof]) || 0;
    if (!(value > 0)) continue;
    for (const [row, rowCoefficient] of map.rows[fullDof]) {
      for (const [column, columnCoefficient] of map.rows[fullDof]) {
        out[row][column] += rowCoefficient * value * columnCoefficient;
      }
    }
  }
  return out;
}

function fixIsolatedDofs(K, fixedDofs) {
  const scale = Math.max(1, ...K.map((row) => Math.max(0, ...row.map((value) => Math.abs(value)))));
  const tolerance = scale * 1e-14;
  for (let dof = 0; dof < K.length; dof += 1) {
    if (K[dof].every((value) => Math.abs(value) <= tolerance)) fixedDofs.add(dof);
  }
}
