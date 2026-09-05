import { stableHash } from '../../core/stableHash.js';
import { buildWallMembraneQm6 } from './wallMembraneQm6.js';
import {
  stabilizeUnsupportedRotations,
  UNSUPPORTED_ROTATION_FLOOR_RATIO_RANGE,
} from './unsupportedRotationFloor.js';

export { buildUnsupportedRotationFloorPlan } from './unsupportedRotationFloor.js';

export const SHELL_STABILIZATION_VERSION = 'p14-m9-shell-stabilization-v1';
export const SHELL_STABILIZATION_POLICY = Object.freeze({
  drillingAlphaRange: Object.freeze([1e-6, 1e-4]),
  drillingPhysicalResponseVariationMax: 5e-3,
  stabilizationEnergyRatioMax: 1e-4,
  unsupportedRotationFloorRatioRange: UNSUPPORTED_ROTATION_FLOOR_RATIO_RANGE,
  physicalModeMacMin: 0.99,
  physicalModeStabilizationEnergyRatioMax: 1e-3,
});

export function traceShellStabilizationEnergy(element, globalDisplacement = []) {
  const vector = Array.from(globalDisplacement || []).map(Number);
  if (vector.length !== 24 || vector.some((value) => !Number.isFinite(value))) throw stabilizationError('SHELL_STABILIZATION_DISPLACEMENT_INVALID', 'A finite 24-DOF shell displacement is required.');
  const physical = 0.5 * quadratic(vector, element.compatibleMatrix);
  const stabilization = 0.5 * quadratic(vector, element.drillingMatrix);
  const total = physical + stabilization;
  const core = {
    version: SHELL_STABILIZATION_VERSION,
    elementId: element.id || null,
    drillingAlpha: element.drilling.alpha,
    physicalEnergy: physical,
    stabilizationEnergy: stabilization,
    totalEnergy: total,
    stabilizationToPhysicalRatio: physical > 0 ? stabilization / physical : stabilization === 0 ? 0 : null,
    finite: [physical, stabilization, total].every(Number.isFinite),
  };
  return deepFreeze({ ...core, traceHash: stableHash(core) });
}

export function runDrillingAlphaSweep(input = {}) {
  const alphas = Array.from(input.alphas || [1e-6, 1e-5, 1e-4]).map(Number);
  if (!alphas.length || alphas.some((value) => !Number.isFinite(value))) throw stabilizationError('SHELL_DRILLING_SWEEP_INVALID', 'Finite drilling alpha values are required.');
  const displacement = Array.from(input.displacement || []);
  const rows = alphas.map((alpha) => {
    const element = buildWallMembraneQm6({ ...(input.element || {}), drillingAlpha: alpha });
    if (!element.ok) throw stabilizationError(element.reason, `Shell element failed for drilling alpha ${alpha}.`);
    const energy = traceShellStabilizationEnergy(element, displacement);
    const totalForce = matrixVector(element.matrix, displacement);
    const physicalForce = matrixVector(element.compatibleMatrix, displacement);
    return {
      alpha,
      qualificationStatus: element.qualification.status,
      drillingStiffnessRatio: element.drilling.stiffnessRatio,
      physicalForceNorm: norm(physicalForce),
      totalForceNorm: norm(totalForce),
      forceContaminationRatio: norm(subtract(totalForce, physicalForce)) / Math.max(1, norm(physicalForce)),
      energy,
    };
  });
  const physicalNorms = rows.map((row) => row.physicalForceNorm);
  const reference = Math.max(1, ...physicalNorms);
  const physicalResponseVariation = (Math.max(...physicalNorms) - Math.min(...physicalNorms)) / reference;
  const core = { version: SHELL_STABILIZATION_VERSION, rows, physicalResponseVariation, benchmarkExecuted: false, designTransferAllowed: false };
  return deepFreeze({ ...core, sweepHash: stableHash(core) });
}

export function runUnsupportedRotationFloorSweep(input = {}) {
  const matrix = input.matrix;
  if (!Array.isArray(matrix) || matrix.length === 0 || matrix.some((row) => !Array.isArray(row) || row.length !== matrix.length)) throw stabilizationError('SHELL_ROTATION_FLOOR_MATRIX_INVALID', 'A square stiffness matrix is required.');
  const nodes = Array.from(input.nodes || []);
  if (nodes.length * 6 !== matrix.length) throw stabilizationError('SHELL_ROTATION_FLOOR_NODE_COUNT_INVALID', 'Node count must match six-DOF matrix size.');
  const fixedDofs = new Set(input.fixedDofs || []);
  const responseVector = input.responseVector ? Array.from(input.responseVector).map(Number) : null;
  const baselineResponse = responseVector ? matrixVector(matrix, responseVector) : null;
  const rows = Array.from(input.ratios || [1e-12, 1e-9, 1e-6]).map((ratio) => {
    const candidate = matrix.map((row) => [...row]);
    const audit = stabilizeUnsupportedRotations(candidate, nodes, fixedDofs, ratio);
    const response = responseVector ? matrixVector(candidate, responseVector) : null;
    return {
      requestedRatio: Number(ratio),
      audit,
      affectedDofs: audit.affectedDofs,
      responseVariation: response ? norm(subtract(response, baselineResponse)) / Math.max(1, norm(baselineResponse)) : null,
    };
  });
  const core = { version: SHELL_STABILIZATION_VERSION, rows, nullRotationOnly: rows.every((row) => row.affectedDofs.every((dof) => Math.max(...matrix[dof].map((value) => Math.abs(Number(value) || 0))) <= row.audit.nullThreshold || row.audit.rigidNullComponents?.includes(dof % 6) || row.audit.nullModeRotationDofs?.includes(dof))), benchmarkExecuted: false };
  return deepFreeze({ ...core, sweepHash: stableHash(core) });
}

export function modalAssuranceCriterion(left = [], right = [], massMatrix = null) {
  const a = Array.from(left).map(Number); const b = Array.from(right).map(Number);
  if (!a.length || a.length !== b.length || a.some((value) => !Number.isFinite(value)) || b.some((value) => !Number.isFinite(value))) throw stabilizationError('SHELL_MODE_VECTOR_INVALID', 'Comparable finite mode vectors are required.');
  const Mb = massMatrix ? matrixVector(massMatrix, b) : b;
  const Ma = massMatrix ? matrixVector(massMatrix, a) : a;
  const numerator = dot(a, Mb) ** 2;
  const denominator = dot(a, Ma) * dot(b, Mb);
  return denominator > 0 ? numerator / denominator : 0;
}

export function classifyStabilizedModes(modes = [], options = {}) {
  const policy = { ...SHELL_STABILIZATION_POLICY, ...(options.policy || {}) };
  return modes.map((mode, index) => {
    const physicalEnergy = Number(mode.physicalEnergy);
    const stabilizationEnergy = Number(mode.stabilizationEnergy);
    const ratio = stabilizationEnergy / Math.max(1e-30, physicalEnergy);
    const mac = mode.referenceVector ? modalAssuranceCriterion(mode.vector, mode.referenceVector, mode.massMatrix || null) : null;
    const physical = physicalEnergy > 0 && ratio <= policy.physicalModeStabilizationEnergyRatioMax && (mac == null || mac >= policy.physicalModeMacMin);
    return { id: mode.id || `MODE-${index + 1}`, mac, physicalEnergy, stabilizationEnergy, stabilizationEnergyRatio: ratio, classification: physical ? 'physical' : 'stabilization-dominated' };
  });
}

export function qualifyShellStabilization(input = {}, options = {}) {
  const policy = { ...SHELL_STABILIZATION_POLICY, ...(options.policy || {}) };
  const drillingSweep = input.drillingSweep || null;
  const floorSweep = input.floorSweep || null;
  const modes = classifyStabilizedModes(input.modes || [], { policy });
  const blockers = [];
  if (!drillingSweep || drillingSweep.physicalResponseVariation > policy.drillingPhysicalResponseVariationMax) blockers.push('SHELL_DRILLING_PHYSICAL_RESPONSE_SENSITIVE');
  if (!floorSweep || !floorSweep.nullRotationOnly || floorSweep.rows.some((row) => row.responseVariation != null && row.responseVariation > 1e-12)) blockers.push('SHELL_ROTATION_FLOOR_PHYSICAL_RESPONSE_SENSITIVE');
  if (modes.some((mode) => mode.classification !== 'physical')) blockers.push('SHELL_PHYSICAL_MODE_STABILIZATION_SENSITIVE');
  const core = {
    version: SHELL_STABILIZATION_VERSION,
    status: blockers.length ? 'blocked' : 'pass',
    blockers,
    policy,
    drillingSweepHash: drillingSweep?.sweepHash || null,
    floorSweepHash: floorSweep?.sweepHash || null,
    modes,
    claim: { id: 'P3S2-SS', kind: 'S-Structures custom stabilization criterion', crossSolverEquivalent: false },
    benchmarkExecuted: false,
    designTransferAllowed: false,
  };
  return deepFreeze({ ...core, qualificationHash: stableHash(core) });
}

function matrixVector(matrix, vector) { return matrix.map((row) => dot(row, vector)); }
function quadratic(vector, matrix) { return dot(vector, matrixVector(matrix, vector)); }
function dot(left, right) { return left.reduce((sum, value, index) => sum + value * right[index], 0); }
function norm(vector) { return Math.sqrt(dot(vector, vector)); }
function subtract(left, right) { return left.map((value, index) => value - right[index]); }
function stabilizationError(code, message) { return Object.assign(new Error(message), { code }); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
