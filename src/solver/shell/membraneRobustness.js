import { stableHash } from '../../core/stableHash.js';
import { buildWallMembraneQm6 } from './wallMembraneQm6.js';
import { multiplyVector } from './shellElementMath.js';
import { createStructuredQuadMesh } from './membraneWorkflow.js';

export const MEMBRANE_ROBUSTNESS_VERSION = 'p14-m6-distorted-membrane-robustness-v1';

export function createCookMembraneMesh(input = {}) {
  const width = positive(input.width ?? 48, 'width');
  const leftHeight = positive(input.leftHeight ?? 44, 'leftHeight');
  const rightBottom = Number(input.rightBottom ?? 44);
  const rightTop = Number(input.rightTop ?? 60);
  if (!Number.isFinite(rightBottom) || !Number.isFinite(rightTop) || !(rightTop > rightBottom)) throw robustError('COOK_GEOMETRY_INVALID', 'Cook right-edge coordinates must be finite and ordered.');
  const transform = normalizeTransform(input.transform);
  const rawMap = (u, v) => ({
    x: width * u,
    y: 0,
    z: (1 - u) * leftHeight * v + u * (rightBottom + (rightTop - rightBottom) * v),
  });
  const mapPoint = (u, v) => transformPoint(rawMap(u, v), transform);
  return createStructuredQuadMesh({
    id: input.id || `COOK-${input.nx || 2}x${input.ny || 2}`,
    familyId: input.familyId || 'COOK-MEMBRANE',
    level: input.level || 0,
    parentMeshHash: input.parentMeshHash || null,
    nx: input.nx || 2,
    ny: input.ny || 2,
    mapPoint,
    mapping: `cook-bilinear-${transform.kind}`,
  });
}

export function assessMembraneDistortion(mesh, options = {}) {
  const warningAspect = Number(options.warningAspect ?? 3);
  const blockAspect = Number(options.blockAspect ?? 4.1);
  const warningJacobian = Number(options.warningJacobianReciprocal ?? 0.2);
  const blockJacobian = Number(options.blockJacobianReciprocal ?? 0.1);
  const rows = (mesh.geometry?.qualityRows || []).map((row) => {
    const reasons = [];
    let status = 'PASS';
    if (!Number.isFinite(row.minDetJ) || row.minDetJ <= 0) { status = 'BLOCKED'; reasons.push('SHELL_DISTORTION_JACOBIAN_NONPOSITIVE'); }
    if (!Number.isFinite(row.aspectRatio) || row.aspectRatio > blockAspect) { status = 'BLOCKED'; reasons.push('SHELL_DISTORTION_ASPECT_BLOCK'); }
    else if (row.aspectRatio > warningAspect && status === 'PASS') { status = 'WARNING'; reasons.push('SHELL_DISTORTION_ASPECT_WARNING'); }
    if (!Number.isFinite(row.minimumJacobianReciprocalCondition) || row.minimumJacobianReciprocalCondition < blockJacobian) { status = 'BLOCKED'; reasons.push('SHELL_DISTORTION_JACOBIAN_CONDITION_BLOCK'); }
    else if (row.minimumJacobianReciprocalCondition < warningJacobian && status === 'PASS') { status = 'WARNING'; reasons.push('SHELL_DISTORTION_JACOBIAN_CONDITION_WARNING'); }
    return { ...row, status, reasons };
  });
  const blockers = rows.flatMap((row) => row.status === 'BLOCKED' ? row.reasons : []);
  const warnings = rows.flatMap((row) => row.status === 'WARNING' ? row.reasons : []);
  const core = {
    version: MEMBRANE_ROBUSTNESS_VERSION,
    meshHash: mesh.meshHash,
    status: blockers.length ? 'BLOCKED' : warnings.length ? 'WARNING' : 'PASS',
    criteria: { warningAspect, blockAspect, warningJacobian, blockJacobian },
    rows,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    falseGreenGuardPassed: rows.every((row) => Number.isFinite(row.minDetJ) && Number.isFinite(row.aspectRatio) && Number.isFinite(row.minimumJacobianReciprocalCondition)),
  };
  return deepFreeze({ ...core, assessmentHash: stableHash(core) });
}

export function buildMembraneEnergyTrace(mesh, displacementByNode = {}, properties = {}, options = {}) {
  const nodeById = new Map(mesh.nodes.map((node) => [node.id, node]));
  const rows = mesh.elements.map((element) => {
    const nodes = element.nodeIds.map((id) => nodeById.get(id));
    const built = buildWallMembraneQm6({ id: element.id, nodes, ...properties }, options);
    if (!built.ok) throw robustError(built.reason, `Element ${element.id} build failed.`);
    const global = element.nodeIds.flatMap((id) => normalizeDof(displacementByNode[id], id));
    const local = multiplyVector(built.transform, global);
    const condensedRaw = quadratic(local, built.localMatrix) / 2;
    const compatibleRaw = quadratic(local, built.uncondensedCompatibleLocalMatrix) / 2;
    const enhancedRaw = quadratic(local, built.enhancedCorrectionLocalMatrix) / 2;
    const drillingRaw = quadratic(global, built.drillingMatrix) / 2;
    const tolerance = 1e-12 * Math.max(1, Math.abs(compatibleRaw));
    const condensedMembrane = Math.abs(condensedRaw) <= tolerance ? 0 : condensedRaw;
    const compatible = Math.abs(compatibleRaw) <= tolerance ? 0 : compatibleRaw;
    const enhancedReduction = Math.abs(enhancedRaw) <= tolerance ? 0 : enhancedRaw;
    const drilling = Math.abs(drillingRaw) <= tolerance ? 0 : drillingRaw;
    const total = condensedMembrane + drilling;
    const enhancedParameters = multiplyVector(built.internalDisplacementOperator, local);
    const values = [condensedMembrane, compatible, enhancedReduction, drilling, total, ...enhancedParameters];
    if (values.some((value) => !Number.isFinite(value))) throw robustError('SHELL_ENERGY_NONFINITE', `Element ${element.id} produced nonfinite energy.`);
    if (condensedMembrane < -1e-10 || drilling < -1e-10 || total < -1e-10) throw robustError('SHELL_ENERGY_NEGATIVE', `Element ${element.id} produced negative energy.`);
    return {
      elementId: element.id,
      condensedMembrane,
      compatible,
      enhancedReduction,
      drilling,
      total,
      drillingRatio: drilling / Math.max(1e-30, total),
      enhancedReductionRatio: enhancedReduction / Math.max(1e-30, compatible),
      enhancedParameterNorm: Math.hypot(...enhancedParameters),
      drillingAlpha: built.drilling.alpha,
    };
  });
  const totals = sumKeys(rows, ['condensedMembrane', 'compatible', 'enhancedReduction', 'drilling', 'total']);
  const core = {
    version: MEMBRANE_ROBUSTNESS_VERSION,
    meshHash: mesh.meshHash,
    rows,
    totals: {
      ...totals,
      drillingRatio: totals.drilling / Math.max(1e-30, totals.total),
      enhancedReductionRatio: totals.enhancedReduction / Math.max(1e-30, totals.compatible),
    },
    qualification: {
      drillingEnergyRatioMax: Number(options.drillingEnergyRatioMax ?? 1e-3),
      passed: totals.drilling / Math.max(1e-30, totals.total) <= Number(options.drillingEnergyRatioMax ?? 1e-3),
    },
  };
  return deepFreeze({ ...core, energyHash: stableHash(core) });
}

export function normalizeMembraneResponse(quantity, input = {}) {
  const value = Number(quantity);
  const force = Number(input.force);
  const modulus = Number(input.E);
  const thickness = Number(input.thickness);
  const length = Number(input.length);
  if (![value, force, modulus, thickness, length].every(Number.isFinite) || force === 0 || modulus <= 0 || thickness <= 0 || length <= 0) throw robustError('SHELL_NORMALIZATION_INPUT_INVALID', 'Normalized membrane response requires finite response, nonzero force and positive E/t/L.');
  return {
    version: MEMBRANE_ROBUSTNESS_VERSION,
    value: value * modulus * thickness / (force * length),
    equation: 'u*E*t/(P*L)',
    dimensionless: true,
  };
}

function normalizeTransform(value = {}) {
  const kind = String(value.kind || 'identity').toLowerCase();
  if (!['identity', 'rotate', 'reflect'].includes(kind)) throw robustError('COOK_TRANSFORM_INVALID', `Unsupported Cook transform: ${kind}`);
  return { kind, angle: Number(value.angle || 0), axis: String(value.axis || 'x') };
}
function transformPoint(point, transform) {
  if (transform.kind === 'reflect') return { x: -point.x, y: point.y, z: point.z };
  if (transform.kind === 'rotate') {
    const c = Math.cos(transform.angle); const s = Math.sin(transform.angle);
    return { x: c * point.x, y: s * point.x, z: point.z };
  }
  return point;
}
function quadratic(vector, matrix) { const product = multiplyVector(matrix, vector); return vector.reduce((sum, value, index) => sum + value * product[index], 0); }
function normalizeDof(value, id) { if (!Array.isArray(value) || value.length !== 6 || value.some((item) => !Number.isFinite(Number(item)))) throw robustError('SHELL_DISPLACEMENT_VECTOR_INVALID', `Node ${id} requires six finite DOFs.`); return value.map(Number); }
function sumKeys(rows, keys) { return Object.fromEntries(keys.map((key) => [key, rows.reduce((sum, row) => sum + row[key], 0)])); }
function positive(value, label) { const number = Number(value); if (!(number > 0)) throw robustError('COOK_GEOMETRY_INVALID', `${label} must be positive.`); return number; }
function robustError(code, message) { return Object.assign(new Error(message), { code }); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
