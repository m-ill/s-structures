import { stableHash } from '../../core/stableHash.js';
import { beamShapes, bendingPhi, integrateGauss } from '../frame/beamInterpolation.js';
import { WINKLER_LINE_VERSION } from './winklerLine.js';

export const FOUNDATION_RECOVERY_VERSION = 'p15-m5-foundation-recovery-v1';

const ACTION_DOF_COUNT = 12;
const LOCAL_Y_DOFS = Object.freeze([1, 5, 7, 11]);
const LOCAL_Z_DOFS = Object.freeze([2, 4, 8, 10]);
const STATION_ENDPOINTS = Object.freeze({
  N: Object.freeze([0, -1, 6, 1]),
  Vy: Object.freeze([1, -1, 7, 1]),
  Vz: Object.freeze([2, -1, 8, 1]),
  Tq: Object.freeze([3, -1, 9, 1]),
  My: Object.freeze([4, 1, 10, -1]),
  Mz: Object.freeze([5, -1, 11, 1]),
});

/**
 * Canonical additive local-end-action contract for a frame member on a
 * distributed foundation.  `foundationEnd` is the resisting action assembled
 * into the global stiffness equation.  The equal-and-opposite soil load is
 * exposed by the Winkler result as `equivalentActionLocal` for compatibility.
 */
export function buildFoundationEndActionContract(input = {}) {
  const structuralEnd = actionVector(input.structuralEnd, 'FOUNDATION_STRUCTURAL_END_INVALID');
  const localDisplacements = actionVector(input.localDisplacements, 'FOUNDATION_LOCAL_DISPLACEMENT_INVALID');
  const foundationEnd = input.foundation?.active
    ? matrixVector12(input.foundation.matrix, localDisplacements)
    : zeroAction();
  const equilibriumEnd = addActions(structuralEnd, foundationEnd);
  const soilEquivalentNodalAction = Object.freeze(foundationEnd.map((value) => -value));
  const core = {
    version: FOUNDATION_RECOVERY_VERSION,
    coordinateSystem: 'member-local',
    actionConvention: 'assembled-resisting-end-action',
    equation: 'equilibriumEnd=structuralEnd+foundationEnd',
    structuralEquation: input.structuralEquation || 'Ks*d+f0_external',
    foundationEquation: 'Kf*d',
    soilEquivalentNodalEquation: '-Kf*d',
    foundationActive: input.foundation?.active === true,
    structuralEnd,
    foundationEnd,
    soilEquivalentNodalAction,
    equilibriumEnd,
  };
  return Object.freeze({ ...core, contractHash: stableHash(core) });
}

/**
 * Audits the public station arrays against the local end-action convention.
 * Force and moment channels are normalized independently by their own end
 * values, avoiding a dimensionally mixed pass/fail comparison.
 */
export function evaluateStationEndClosure(endAction, stations = {}, options = {}) {
  const end = actionVector(endAction, 'FOUNDATION_CLOSURE_END_ACTION_INVALID');
  const tolerance = positiveTolerance(options.tolerance, 1e-10);
  const residuals = {};
  let maximumAbsoluteResidual = 0;
  let maximumRelativeResidual = 0;
  let available = true;

  for (const [quantity, [iDof, iSign, jDof, jSign]] of Object.entries(STATION_ENDPOINTS)) {
    const values = stations?.[quantity];
    if (!Array.isArray(values) || values.length < 2) {
      available = false;
      residuals[quantity] = Object.freeze({ available: false, start: null, finish: null });
      continue;
    }
    const actual = [Number(values[0]), Number(values.at(-1))];
    const expected = [iSign * end[iDof], jSign * end[jDof]];
    if (actual.some((value) => !Number.isFinite(value))) {
      available = false;
      residuals[quantity] = Object.freeze({ available: false, start: null, finish: null });
      continue;
    }
    const channelResiduals = actual.map((value, index) => value - expected[index]);
    const scale = Math.max(1, ...expected.map(Math.abs), ...actual.map(Math.abs));
    const relative = channelResiduals.map((value) => Math.abs(value) / scale);
    maximumAbsoluteResidual = Math.max(maximumAbsoluteResidual, ...channelResiduals.map(Math.abs));
    maximumRelativeResidual = Math.max(maximumRelativeResidual, ...relative);
    residuals[quantity] = Object.freeze({
      available: true,
      expected: Object.freeze(expected),
      actual: Object.freeze(actual),
      residual: Object.freeze(channelResiduals),
      relativeResidual: Object.freeze(relative),
      scale,
    });
  }

  const qualified = available && maximumRelativeResidual <= tolerance;
  return Object.freeze({
    version: FOUNDATION_RECOVERY_VERSION,
    basis: options.basis || 'equilibriumEnd',
    status: !available ? 'NOT_AVAILABLE' : qualified ? 'PASS' : 'FAIL',
    available,
    qualified,
    tolerance,
    maximumAbsoluteResidual,
    maximumRelativeResidual,
    residuals: Object.freeze(residuals),
  });
}

export function winklerReactionAt(foundation, localDisplacements = [], ratio = 0) {
  if (!foundation?.active) return Object.freeze({ localY: 0, localZ: 0, displacementLocalY: 0, displacementLocalZ: 0 });
  const r = Math.max(0, Math.min(1, Number(ratio) || 0));
  const yShapes = beamShapes(r, foundation.length, bendingPhi(foundation.timoshenko, 'z'));
  const zShapes = beamShapes(r, foundation.length, bendingPhi(foundation.timoshenko, 'y'));
  const displacementLocalY = dotShapes(yShapes, LOCAL_Y_DOFS, localDisplacements, [1, 1, 1, 1]);
  const displacementLocalZ = dotShapes(zShapes, LOCAL_Z_DOFS, localDisplacements, [1, -1, 1, -1]);
  return Object.freeze({
    displacementLocalY,
    displacementLocalZ,
    localY: -foundation.lineStiffness.localY * displacementLocalY,
    localZ: -foundation.lineStiffness.localZ * displacementLocalZ,
  });
}

export function integrateFoundationReactionTo(foundation, localDisplacements = [], x = 0) {
  const L = Number(foundation?.length) || 0;
  const hi = Math.max(0, Math.min(Number(x) || 0, L));
  const force = { localY: 0, localZ: 0 };
  const moment = { localY: 0, localZ: 0 };
  if (!(hi > 0) || !foundation?.active || !(L > 0)) return { force, moment };
  integrateGauss(0, hi, (position, weight) => {
    const reaction = winklerReactionAt(foundation, localDisplacements, position / L);
    const arm = hi - position;
    force.localY += reaction.localY * weight;
    force.localZ += reaction.localZ * weight;
    moment.localY += reaction.localY * arm * weight;
    moment.localZ += reaction.localZ * arm * weight;
  });
  return { force, moment };
}

export function recoverWinklerLineResult(foundation, localDisplacements = [], stationCount = 21, axes = null) {
  if (!foundation?.active) return null;
  const count = Math.max(2, Math.trunc(Number(stationCount) || 21));
  const stations = Array.from({ length: count }, (_value, index) => {
    const ratio = index / (count - 1);
    return { x: ratio * foundation.length, ratio, ...winklerReactionAt(foundation, localDisplacements, ratio) };
  });
  const resultant = { localY: 0, localZ: 0 };
  const firstMoment = { localY: 0, localZ: 0 };
  const globalForce = [0, 0, 0];
  const globalMoment = [0, 0, 0];
  integrateGauss(0, 1, (ratio, weight) => {
    const reaction = winklerReactionAt(foundation, localDisplacements, ratio);
    const dx = foundation.length * weight;
    resultant.localY += reaction.localY * dx;
    resultant.localZ += reaction.localZ * dx;
    firstMoment.localY += reaction.localY * ratio * foundation.length * dx;
    firstMoment.localZ += reaction.localZ * ratio * foundation.length * dx;
    if (axes) {
      const force = add3(scale3(axes.y, reaction.localY * dx), scale3(axes.z, reaction.localZ * dx));
      const point = add3(point3(axes.flexibleStart), scale3(axes.x, ratio * foundation.length));
      addInto(globalForce, force);
      addInto(globalMoment, cross3(point, force));
    }
  });
  const endAction = buildFoundationEndActionContract({ foundation, localDisplacements });
  const foundationEndActionLocal = endAction.foundationEnd;
  // Preserve the legacy mutable array shape of `equivalentActionLocal`.
  const equivalentActionLocal = endAction.soilEquivalentNodalAction.slice();
  const energy = 0.5 * dot(localDisplacements, foundationEndActionLocal);
  const recoveryAudit = buildRecoveryAudit({
    foundation,
    localDisplacements,
    equivalentActionLocal,
    foundationEndActionLocal,
    resultant,
    firstMoment,
    globalForce,
    globalMoment,
    axes,
    energy,
  });
  const core = {
    version: WINKLER_LINE_VERSION,
    recoveryVersion: FOUNDATION_RECOVERY_VERSION,
    propertyId: foundation.propertyId,
    memberId: foundation.memberId,
    behavior: foundation.behavior,
    length: foundation.length,
    lineStiffness: { ...foundation.lineStiffness },
    stations,
    resultant,
    firstMoment,
    centroid: {
      localY: centroid(firstMoment.localY, resultant.localY),
      localZ: centroid(firstMoment.localZ, resultant.localZ),
    },
    actionConvention: 'soil-on-member',
    equivalentActionLocal,
    foundationEndActionLocal,
    endActionConvention: endAction.actionConvention,
    endActionEquation: endAction.foundationEquation,
    globalForce,
    globalMoment,
    strainEnergy: energy,
    energyEquation: '0.5*d_local^T*K_foundation*d_local',
    recoveryAudit,
  };
  return Object.freeze({ ...core, resultHash: stableHash(core) });
}

export function foundationSpanLoad(foundation, localDisplacements) {
  if (!foundation?.active) return null;
  return Object.freeze({
    type: 'foundation-distributed',
    propertyId: foundation.propertyId,
    foundation,
    localDisplacements,
  });
}

function buildRecoveryAudit(input) {
  const L = input.foundation.length;
  const equivalent = input.equivalentActionLocal;
  const expectedResultant = {
    localY: equivalent[1] + equivalent[7],
    localZ: equivalent[2] + equivalent[8],
  };
  const expectedFirstMoment = {
    localY: L * equivalent[7] + equivalent[5] + equivalent[11],
    localZ: L * equivalent[8] - equivalent[4] - equivalent[10],
  };
  const actionResidual = equivalent.map((value, index) => value + input.foundationEndActionLocal[index]);
  const resultantResidual = {
    localY: input.resultant.localY - expectedResultant.localY,
    localZ: input.resultant.localZ - expectedResultant.localZ,
  };
  const firstMomentResidual = {
    localY: input.firstMoment.localY - expectedFirstMoment.localY,
    localZ: input.firstMoment.localZ - expectedFirstMoment.localZ,
  };
  const expectedEnergy = 0.5 * dot(input.localDisplacements, input.foundationEndActionLocal);
  const energyResidual = input.energy - expectedEnergy;
  const normalized = [
    normalizedResidual(actionResidual, [...equivalent, ...input.foundationEndActionLocal]),
    normalizedResidual(Object.values(resultantResidual), [...Object.values(input.resultant), ...Object.values(expectedResultant)]),
    normalizedResidual(Object.values(firstMomentResidual), [...Object.values(input.firstMoment), ...Object.values(expectedFirstMoment)]),
    normalizedResidual([energyResidual], [input.energy, expectedEnergy]),
  ];

  let global = null;
  if (input.axes) {
    const expectedGlobalForce = add3(
      scale3(input.axes.y, input.resultant.localY),
      scale3(input.axes.z, input.resultant.localZ),
    );
    const firstMomentVector = add3(
      scale3(input.axes.y, input.firstMoment.localY),
      scale3(input.axes.z, input.firstMoment.localZ),
    );
    const expectedGlobalMoment = add3(
      cross3(point3(input.axes.flexibleStart), expectedGlobalForce),
      cross3(input.axes.x, firstMomentVector),
    );
    const forceResidual = input.globalForce.map((value, index) => value - expectedGlobalForce[index]);
    const momentResidual = input.globalMoment.map((value, index) => value - expectedGlobalMoment[index]);
    normalized.push(
      normalizedResidual(forceResidual, [...input.globalForce, ...expectedGlobalForce]),
      normalizedResidual(momentResidual, [...input.globalMoment, ...expectedGlobalMoment]),
    );
    global = Object.freeze({
      expectedForce: Object.freeze(expectedGlobalForce),
      expectedMoment: Object.freeze(expectedGlobalMoment),
      forceResidual: Object.freeze(forceResidual),
      momentResidual: Object.freeze(momentResidual),
    });
  }

  const maximumRelativeResidual = Math.max(0, ...normalized);
  return Object.freeze({
    status: maximumRelativeResidual <= 1e-10 ? 'PASS' : 'FAIL',
    tolerance: 1e-10,
    maximumRelativeResidual,
    actionIdentityResidual: Object.freeze(actionResidual),
    resultantResidual: Object.freeze(resultantResidual),
    firstMomentResidual: Object.freeze(firstMomentResidual),
    energyResidual,
    global,
  });
}

function matrixVector12(matrix, vector) {
  if (!Array.isArray(matrix) || matrix.length !== ACTION_DOF_COUNT) {
    throw recoveryError('FOUNDATION_RECOVERY_MATRIX_INVALID');
  }
  const result = matrix.map((row) => {
    if (!Array.isArray(row) || row.length !== ACTION_DOF_COUNT) {
      throw recoveryError('FOUNDATION_RECOVERY_MATRIX_INVALID');
    }
    const value = row.reduce((sum, item, index) => {
      const coefficient = Number(item);
      if (!Number.isFinite(coefficient)) throw recoveryError('FOUNDATION_RECOVERY_MATRIX_INVALID');
      return sum + coefficient * vector[index];
    }, 0);
    if (!Number.isFinite(value)) throw recoveryError('FOUNDATION_END_ACTION_NONFINITE');
    return value;
  });
  return Object.freeze(result);
}

function actionVector(value, code) {
  if (value == null) return zeroAction();
  if (!Array.isArray(value) || value.length !== ACTION_DOF_COUNT) throw recoveryError(code);
  const result = value.map(Number);
  if (result.some((item) => !Number.isFinite(item))) throw recoveryError(code);
  return Object.freeze(result);
}

function addActions(left, right) {
  return Object.freeze(left.map((value, index) => value + right[index]));
}

function normalizedResidual(residuals, values) {
  const scale = Math.max(1, ...values.map((value) => Math.abs(Number(value) || 0)));
  return Math.max(0, ...residuals.map((value) => Math.abs(Number(value) || 0) / scale));
}

function dotShapes(shapes, dofs, values, signs) {
  return shapes.reduce((sum, shape, index) => sum + shape * signs[index] * (Number(values[dofs[index]]) || 0), 0);
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + Number(value || 0) * Number(right[index] || 0), 0);
}

function centroid(firstMoment, resultant) {
  return Math.abs(resultant) > 1e-14 ? firstMoment / resultant : null;
}

function point3(value) {
  return [Number(value?.x) || 0, Number(value?.y) || 0, Number(value?.z) || 0];
}

function scale3(value, factor) {
  return [0, 1, 2].map((index) => Number(value?.[index] || 0) * factor);
}

function add3(left, right) {
  return [0, 1, 2].map((index) => Number(left?.[index] || 0) + Number(right?.[index] || 0));
}

function addInto(target, value) {
  for (let index = 0; index < 3; index += 1) target[index] += Number(value[index]) || 0;
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function zeroAction() {
  return Object.freeze(new Array(ACTION_DOF_COUNT).fill(0));
}

function positiveTolerance(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function recoveryError(code) {
  return Object.assign(new Error(code), { code });
}
