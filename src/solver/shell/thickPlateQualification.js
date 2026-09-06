import { stableHash } from '../../core/stableHash.js';
import { buildSlabPlateMitc4 } from './slabPlateMitc4.js';
import { createRectangularPlateMesh, solveRectangularPlate } from './plateWorkflow.js';

export const THICK_PLATE_QUALIFICATION_VERSION = 'p14-m8-thick-plate-qualification-v1';
export const THICK_PLATE_POLICY = Object.freeze({
  targetShortSideThicknessRatio: Object.freeze([5, 50]),
  hardShortSideThicknessRatio: Object.freeze([2, 200]),
  recommendedElementsOnShortSide: 4,
  minimumElementsOnShortSide: 2,
  maximumElementAspectRatio: 4,
  thinLimitRatio: 20,
  thinLimitShearEnergyFractionWarning: 0.25,
});

export function qualifyThickPlateRun(mesh, run, properties = {}, options = {}) {
  if (!mesh?.plateGeometry || !run?.displacementByNode) throw qualificationError('SHELL_THICK_PLATE_RUN_INVALID', 'A solved rectangular plate run is required.');
  const thickness = finitePositive(properties.t ?? properties.thickness, 'thickness');
  const shortSide = Math.min(mesh.plateGeometry.width, mesh.plateGeometry.height);
  const shortSideThicknessRatio = shortSide / thickness;
  const shortDirectionDivisions = mesh.plateGeometry.width <= mesh.plateGeometry.height ? mesh.lineage.divisions[0] : mesh.lineage.divisions[1];
  const componentEnergy = recoverComponentEnergy(mesh, run, properties);
  const total = componentEnergy.bending + componentEnergy.shear;
  const shearFraction = total > 0 ? componentEnergy.shear / total : null;
  const componentResidual = Math.abs(total - run.energy.strain) / Math.max(1, Math.abs(total), Math.abs(run.energy.strain));
  const policy = { ...THICK_PLATE_POLICY, ...(options.policy || {}) };
  const blockers = [];
  const warnings = [];
  if (shortSideThicknessRatio < policy.hardShortSideThicknessRatio[0] || shortSideThicknessRatio > policy.hardShortSideThicknessRatio[1]) blockers.push('SHELL_THICKNESS_RATIO_OUTSIDE_HARD_ENVELOPE');
  else if (shortSideThicknessRatio < policy.targetShortSideThicknessRatio[0] || shortSideThicknessRatio > policy.targetShortSideThicknessRatio[1]) warnings.push('SHELL_THICKNESS_RATIO_OUTSIDE_QUALIFIED_TARGET');
  if (shortDirectionDivisions < policy.minimumElementsOnShortSide) blockers.push('SHELL_THICK_PLATE_MESH_TOO_COARSE');
  else if (shortDirectionDivisions < policy.recommendedElementsOnShortSide) warnings.push('SHELL_THICK_PLATE_MESH_REFINEMENT_RECOMMENDED');
  if (mesh.geometry.maxAspectRatio > policy.maximumElementAspectRatio * (1 + 1e-12)) blockers.push('SHELL_ELEMENT_ASPECT_RATIO_OUTSIDE_QUALIFIED_RANGE');
  if (!(componentEnergy.bending >= 0) || !(componentEnergy.shear >= 0) || !Number.isFinite(total)) blockers.push('SHELL_THICK_PLATE_ENERGY_INVALID');
  if (componentResidual > Number(options.energyTolerance ?? 1e-9)) blockers.push('SHELL_THICK_PLATE_COMPONENT_ENERGY_MISMATCH');
  const lockingSuspected = shortSideThicknessRatio >= policy.thinLimitRatio && shearFraction > policy.thinLimitShearEnergyFractionWarning;
  if (lockingSuspected) warnings.push('SHELL_TRANSVERSE_SHEAR_LOCKING_SUSPECTED');
  const status = blockers.length ? 'blocked' : warnings.length ? 'warning' : 'pass';
  const core = {
    version: THICK_PLATE_QUALIFICATION_VERSION,
    meshHash: mesh.meshHash,
    runHash: run.runHash,
    status,
    allowedUse: status === 'blocked' ? 'diagnostic-only' : 'implementation-verification-only',
    reasonCodes: [...blockers, ...warnings],
    blockers,
    warnings,
    geometry: {
      shortSide,
      thickness,
      shortSideThicknessRatio,
      plateAspectRatio: Math.max(mesh.plateGeometry.width, mesh.plateGeometry.height) / shortSide,
      maximumElementAspectRatio: mesh.geometry.maxAspectRatio,
      shortDirectionDivisions,
    },
    constitutive: componentEnergy.constitutive,
    energy: {
      bending: componentEnergy.bending,
      transverseShear: componentEnergy.shear,
      total,
      transverseShearFraction: shearFraction,
      solverTotal: run.energy.strain,
      componentResidual,
      positive: componentEnergy.bending >= 0 && componentEnergy.shear >= 0,
    },
    lockingDiagnostic: { suspected: lockingSuspected, thinLimitRatio: policy.thinLimitRatio, shearEnergyFractionWarning: policy.thinLimitShearEnergyFractionWarning },
    policy,
    benchmarkExecuted: false,
    designTransferAllowed: false,
  };
  return deepFreeze({ ...core, qualificationHash: stableHash(core) });
}

export function runThickPlateSweep(input = {}) {
  const geometry = input.geometry || {};
  const cases = Array.from(input.cases || []);
  if (!cases.length) throw qualificationError('SHELL_THICK_PLATE_SWEEP_EMPTY', 'At least one thick-plate sweep case is required.');
  const rows = cases.map((entry, index) => {
    const properties = { ...(input.properties || {}), ...(entry.properties || {}), ...(entry.t != null ? { t: entry.t } : {}), ...(entry.shearFactor != null ? { shearFactor: entry.shearFactor } : {}) };
    const mesh = createRectangularPlateMesh({ ...geometry, ...(entry.mesh || {}), id: entry.id || `THICK-${index + 1}`, level: entry.level ?? index + 1 });
    const run = solveRectangularPlate(mesh, properties, { ...(input.load || {}), ...(entry.load || {}) }, { ...(input.options || {}), ...(entry.options || {}) });
    const qualification = qualifyThickPlateRun(mesh, run, properties, input.qualificationOptions);
    return { id: entry.id || `THICK-${index + 1}`, meshHash: mesh.meshHash, runHash: run.runHash, thickness: properties.t ?? properties.thickness, shearFactor: properties.shearFactor ?? 5 / 6, centerW: run.center.w, coefficient: run.dimensionlessCoefficient, shearEnergyFraction: qualification.energy.transverseShearFraction, status: qualification.status, reasonCodes: qualification.reasonCodes, mesh, run, qualification };
  });
  const thicknessRows = [...rows].sort((a, b) => a.qualification.geometry.shortSideThicknessRatio - b.qualification.geometry.shortSideThicknessRatio);
  const coefficientChanges = thicknessRows.slice(1).map((row, index) => Math.abs(row.coefficient - thicknessRows[index].coefficient) / Math.max(1e-30, Math.abs(row.coefficient)));
  const core = {
    version: THICK_PLATE_QUALIFICATION_VERSION,
    rows,
    trends: {
      byThicknessRatio: thicknessRows.map((row) => ({ id: row.id, shortSideThicknessRatio: row.qualification.geometry.shortSideThicknessRatio, coefficient: row.coefficient, shearEnergyFraction: row.shearEnergyFraction })),
      coefficientChanges,
      thinLimitRecoveryAvailable: thicknessRows.length >= 2,
      shearFractionNonIncreasing: thicknessRows.slice(1).every((row, index) => row.shearEnergyFraction <= thicknessRows[index].shearEnergyFraction + 1e-12),
    },
    benchmarkExecuted: false,
    designTransferAllowed: false,
  };
  return deepFreeze({ ...core, sweepHash: stableHash(core) });
}

function recoverComponentEnergy(mesh, run, properties) {
  const nodesById = new Map(mesh.nodes.map((node) => [node.id, node]));
  let bending = 0;
  let shear = 0;
  let constitutive = null;
  for (const element of mesh.elements) {
    const built = buildSlabPlateMitc4({ id: element.id, nodes: element.nodeIds.map((id) => nodesById.get(id)), ...properties });
    if (!built.ok) throw qualificationError(built.reason, `Plate element ${element.id} build failed during energy recovery.`);
    constitutive ||= built.constitutiveProvenance;
    const vector = new Array(24).fill(0);
    element.nodeIds.forEach((id, localNode) => {
      const active = run.displacementByNode[id];
      if (!Array.isArray(active) || active.length !== 3) throw qualificationError('SHELL_THICK_PLATE_DISPLACEMENT_MISSING', `Missing displacement for node ${id}.`);
      vector[localNode * 6 + 2] = Number(active[0]);
      vector[localNode * 6 + 3] = Number(active[1]);
      vector[localNode * 6 + 4] = Number(active[2]);
    });
    bending += 0.5 * quadratic(vector, built.bendingComponentMatrix);
    shear += 0.5 * quadratic(vector, built.shearComponentMatrix);
  }
  return { bending, shear, constitutive };
}

function quadratic(vector, matrix) { return vector.reduce((sum, value, row) => sum + value * matrix[row].reduce((inner, coefficient, column) => inner + coefficient * vector[column], 0), 0); }
function finitePositive(value, label) { const number = Number(value); if (!(number > 0)) throw qualificationError('SHELL_THICK_PLATE_INPUT_INVALID', `${label} must be positive.`); return number; }
function qualificationError(code, message) { return Object.assign(new Error(message), { code }); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
