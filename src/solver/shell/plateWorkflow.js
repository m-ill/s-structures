import { stableHash } from '../../core/stableHash.js';
import { createElasticFactorSession } from '../../compute/elastic/factorSession.js';
import { createDeterministicSparseAssembler, extractDeterministicCscSubmatrix } from '../../compute/sparse/assembly.js';
import { cscQuadratic } from '../../compute/sparse/matrix.js';
import { createStructuredQuadMesh } from './membraneWorkflow.js';
import { buildSlabPlateMitc4, buildSlabPressureLoad } from './slabPlateMitc4.js';
import { recoverMitc4PlateResult } from './shellElementMath.js';
import { buildPlateBoundaryTemplate } from './plateBoundary.js';

export { buildPlateBoundaryTemplate } from './plateBoundary.js';

export const PLATE_WORKFLOW_VERSION = 'p15-m4-plate-workflow-v2';
const ACTIVE_COMPONENTS = [2, 3, 4];

export function createRectangularPlateMesh(input = {}) {
  const width = positive(input.width ?? input.a, 'width');
  const height = positive(input.height ?? input.b ?? width, 'height');
  const nx = positiveInteger(input.nx, 'nx');
  const ny = positiveInteger(input.ny, 'ny');
  const mesh = createStructuredQuadMesh({
    id: input.id || `PLATE-${nx}x${ny}`,
    familyId: input.familyId || 'RECTANGULAR-PLATE',
    level: input.level || 0,
    parentMeshHash: input.parentMeshHash || null,
    nx,
    ny,
    corners: [{ x: 0, y: 0, z: 0 }, { x: width, y: 0, z: 0 }, { x: width, y: height, z: 0 }, { x: 0, y: height, z: 0 }],
  });
  return deepFreeze({ ...mesh, plateGeometry: { width, height, aspectRatio: width / height } });
}

export function solveRectangularPlate(mesh, properties = {}, load = {}, options = {}) {
  const nodeIndex = new Map(mesh.nodes.map((node, index) => [node.id, index]));
  const size = mesh.nodes.length * 3;
  const dofOrder = mesh.nodes.flatMap((node) => ['w', 'rx', 'ry'].map((component) => `${node.id}:${component}`));
  const assembler = createDeterministicSparseAssembler({
    rowCount: size,
    basis: 'GLOBAL',
    symmetric: true,
    dofOrder,
    symmetryTolerance: Number(options.symmetryTolerance ?? 1e-12),
  });
  const F = new Array(size).fill(0);
  const builtById = {};
  const nx = mesh.lineage.divisions[0];
  const ny = mesh.lineage.divisions[1];
  const centerElementId = mesh.elements[Math.min(ny - 1, Math.floor(ny / 2)) * nx + Math.min(nx - 1, Math.floor(nx / 2))]?.id;
  for (const element of mesh.elements) {
    const nodes = element.nodeIds.map((id) => mesh.nodes[nodeIndex.get(id)]);
    const built = buildSlabPlateMitc4({ id: element.id, nodes, ...properties });
    if (!built.ok) throw plateError(built.reason, `Plate element ${element.id} build failed.`);
    if (built.qualification?.status !== 'pass') throw plateError(built.qualification.reason || 'SHELL_PLATE_ELEMENT_UNQUALIFIED', `Plate element ${element.id} is outside the qualified geometry envelope.`);
    if (element.id === centerElementId) builtById[element.id] = built;
    // The element matrix uses the full shell ordering [ux, uy, uz, rx, ry, rz],
    // while this workflow assembles the reduced plate ordering [w, rx, ry].
    // Keep the two index domains explicit so full-shell component numbers never
    // leak into the reduced global equation numbering.
    const active = element.nodeIds.flatMap((id) => ACTIVE_COMPONENTS.map((_component, plateComponent) => activeDof(mesh, id, plateComponent)));
    const localFull = element.nodeIds.flatMap((_id, localNode) => ACTIVE_COMPONENTS.map((component) => localNode * 6 + component));
    const elementMatrix = localFull.map((row) => localFull.map((column) => built.matrix[row][column]));
    assembler.addBlock({
      elementId: element.id,
      contributionId: 'mitc4-plate-stiffness',
      basis: 'GLOBAL',
      dofs: active,
      dofOrder: active.map((dof) => dofOrder[dof]),
      matrix: elementMatrix,
    });
    if (load.pressure != null) {
      const elementLoad = buildSlabPressureLoad(built, Number(load.pressure));
      active.forEach((dof, index) => { F[dof] += elementLoad[localFull[index]]; });
    }
  }
  const K = assembler.finalize();
  const pointTrace = load.pointLoad == null ? null : applyCentralPointLoad(mesh, F, Number(load.pointLoad));
  if (F.some((value) => !Number.isFinite(value))) throw plateError('SHELL_PLATE_LOAD_NONFINITE', 'Plate load vector is nonfinite.');
  const boundary = buildPlateBoundaryTemplate(mesh, options.support || load.support || 'simply-supported');
  const fixed = new Set(boundary.constrainedDofs);
  const free = Array.from({ length: size }, (_item, index) => index).filter((dof) => !fixed.has(dof));
  const reducedK = extractDeterministicCscSubmatrix(K, free);
  const reducedF = free.map((dof) => F[dof]);
  const ownsSession = !options.factorSession;
  const session = options.factorSession || createElasticFactorSession();
  const solved = session.solve(reducedK, reducedF, {
    groupKey: `plate:${mesh.meshHash}:${boundary.support}`,
    componentKey: 'plate-stiffness',
    matrixClass: 'spd',
    tolerance: Number(options.solveTolerance ?? 1e-10),
    trueResidualTolerance: Number(options.trueResidualTolerance ?? 1e-8),
  });
  const factorizationActive = session.snapshot();
  const factorizationDisposed = ownsSession ? session.dispose() : null;
  const factorization = factorizationDisposed ? {
    ...factorizationActive,
    disposed: factorizationDisposed.disposed,
    activeFactorCount: factorizationDisposed.activeFactorCount,
    backend: factorizationDisposed.backend,
  } : factorizationActive;
  if (!solved.ok) throw plateError(solved.reason || 'SHELL_PLATE_SOLVE_FAILED', 'Plate solve failed.');
  const displacement = new Array(size).fill(0);
  free.forEach((dof, index) => { displacement[dof] = solved.x[index]; });
  const center = recoverPlateCenter(mesh, builtById, displacement);
  const totalLoad = F.reduce((sum, value, index) => index % 3 === 0 ? sum + value : sum, 0);
  const energy = 0.5 * cscQuadratic(K, displacement);
  const work = 0.5 * dot(displacement, F);
  const energyResidual = Math.abs(energy - work) / Math.max(1, Math.abs(energy), Math.abs(work));
  const rigidity = Number(properties.E) * Number(properties.t ?? properties.thickness) ** 3 / (12 * (1 - Number(properties.nu ?? properties.material?.nu ?? 0.3) ** 2));
  const referenceLength = Math.min(mesh.plateGeometry.width, mesh.plateGeometry.height);
  const coefficient = load.pressure != null && Number(load.pressure) !== 0
    ? center.w * rigidity / (Number(load.pressure) * referenceLength ** 4)
    : load.pointLoad != null && Number(load.pointLoad) !== 0
      ? center.w * rigidity / (Number(load.pointLoad) * referenceLength ** 2)
      : null;
  const core = {
    version: PLATE_WORKFLOW_VERSION,
    meshHash: mesh.meshHash,
    formulation: 'MITC4-Reissner-Mindlin',
    support: boundary.support,
    boundary,
    load: {
      pressure: load.pressure ?? null,
      pointLoad: load.pointLoad ?? null,
      totalTransverseLoad: totalLoad,
      pointTrace,
      expectedPressureResultant: load.pressure == null ? null : Number(load.pressure) * mesh.plateGeometry.width * mesh.plateGeometry.height,
    },
    center,
    dimensionlessCoefficient: coefficient,
    dimensionlessReferenceLength: referenceLength,
    displacementByNode: Object.fromEntries(mesh.nodes.map((node, index) => [node.id, displacement.slice(index * 3, index * 3 + 3)])),
    energy: { strain: energy, halfExternalWork: work, relativeResidual: energyResidual, passed: energyResidual <= Number(options.energyTolerance ?? 1e-9) },
    factorization,
    sparseAssembly: K.assembly,
    sparseStorage: { format: K.format, rowCount: K.rowCount, nnz: K.nnz, denseMatrixAllocated: false },
    designTransferAllowed: false,
    benchmarkExecuted: false,
  };
  return deepFreeze({ ...core, runHash: stableHash(core) });
}

export function comparePlateMeshLevels(levels = [], options = {}) {
  const rows = levels.map((row) => ({ meshHash: row.meshHash, level: Number(row.level), elementCount: Number(row.elementCount), centerW: Number(row.centerW), coefficient: Number(row.coefficient) }))
    .filter((row) => Number.isFinite(row.centerW)).sort((a, b) => a.level - b.level || a.elementCount - b.elementCount);
  const deltas = rows.slice(1).map((row, index) => Math.abs(row.centerW - rows[index].centerW) / Math.max(1e-30, Math.abs(row.centerW)));
  const tolerance = Number(options.tolerance ?? 0.02);
  const core = { version: PLATE_WORKFLOW_VERSION, rows, deltas, tolerance, convergenceAvailable: rows.length >= 3, converged: rows.length >= 3 && deltas.at(-1) <= tolerance, benchmarkExecuted: false };
  return deepFreeze({ ...core, comparisonHash: stableHash(core) });
}

function applyCentralPointLoad(mesh, F, magnitude) {
  if (!Number.isFinite(magnitude)) throw plateError('SHELL_POINT_LOAD_INVALID', 'Central point load must be finite.');
  const centerNode = mesh.nodes.find((node) => Math.abs(node.x - mesh.plateGeometry.width / 2) < 1e-12 && Math.abs(node.y - mesh.plateGeometry.height / 2) < 1e-12);
  if (centerNode) {
    F[activeDof(mesh, centerNode.id, 0)] += magnitude;
    return { method: 'exact-center-node', nodeIds: [centerNode.id], weights: [1], resultant: magnitude };
  }
  const nx = mesh.lineage.divisions[0]; const ny = mesh.lineage.divisions[1];
  const i = Math.floor(nx / 2); const j = Math.floor(ny / 2);
  const element = mesh.elements[j * nx + i];
  const localU = nx / 2 - i; const localV = ny / 2 - j;
  const xi = 2 * localU - 1; const eta = 2 * localV - 1;
  const weights = [(1 - xi) * (1 - eta), (1 + xi) * (1 - eta), (1 + xi) * (1 + eta), (1 - xi) * (1 + eta)].map((value) => value / 4);
  element.nodeIds.forEach((id, index) => { F[activeDof(mesh, id, 0)] += magnitude * weights[index]; });
  return { method: 'exact-isoparametric-point', elementId: element.id, nodeIds: element.nodeIds, weights, resultant: magnitude };
}

function recoverPlateCenter(mesh, builtById, displacement) {
  const nx = mesh.lineage.divisions[0]; const ny = mesh.lineage.divisions[1];
  const i = Math.min(nx - 1, Math.floor(nx / 2)); const j = Math.min(ny - 1, Math.floor(ny / 2));
  const element = mesh.elements[j * nx + i];
  const built = builtById[element.id];
  const u = nx / 2 - i; const v = ny / 2 - j;
  const xi = 2 * u - 1; const eta = 2 * v - 1;
  const local = element.nodeIds.flatMap((id) => {
    const index = mesh.nodes.findIndex((node) => node.id === id);
    return displacement.slice(index * 3, index * 3 + 3);
  });
  const shape = [(1 - xi) * (1 - eta), (1 + xi) * (1 - eta), (1 + xi) * (1 + eta), (1 - xi) * (1 + eta)].map((value) => value / 4);
  const w = shape.reduce((sum, value, index) => sum + value * local[index * 3], 0);
  const recovered = recoverMitc4PlateResult(built.frame.projected, local, built.material.E, built.material.nu, built.thickness, xi, eta, built.shearFactor);
  if (!recovered.ok) throw plateError(recovered.reason, 'Plate center recovery failed.');
  return { elementId: element.id, xi, eta, w, ...recovered };
}

function activeDof(mesh, nodeId, component) { const index = mesh.nodes.findIndex((node) => node.id === nodeId); if (index < 0) throw plateError('SHELL_PLATE_NODE_MISSING', `Missing node ${nodeId}.`); return index * 3 + component; }
function dot(a, b) { return a.reduce((sum, value, index) => sum + value * b[index], 0); }
function positive(value, label) { const number = Number(value); if (!(number > 0)) throw plateError('SHELL_PLATE_GEOMETRY_INVALID', `${label} must be positive.`); return number; }
function positiveInteger(value, label) { const number = Number(value); if (!Number.isInteger(number) || number < 1) throw plateError('SHELL_PLATE_MESH_INVALID', `${label} must be a positive integer.`); return number; }
function plateError(code, message) { return Object.assign(new Error(message), { code }); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
