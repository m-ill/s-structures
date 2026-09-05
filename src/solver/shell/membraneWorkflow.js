import { stableHash } from '../../core/stableHash.js';
import { buildWallMembraneQm6 } from './wallMembraneQm6.js';
import {
  buildShellLocalFrame,
  multiplyVector,
  q4GeometryQuality,
  q4Shape,
  recoverMembraneStress,
} from './shellElementMath.js';

export const MEMBRANE_WORKFLOW_VERSION = 'p14-m5-membrane-workflow-v1';
const GAUSS = [-1 / Math.sqrt(3), 1 / Math.sqrt(3)];

export function createStructuredQuadMesh(input = {}) {
  const nx = positiveInteger(input.nx ?? input.divisions?.[0], 'nx');
  const ny = positiveInteger(input.ny ?? input.divisions?.[1], 'ny');
  const mapPoint = resolveMap(input);
  const nodes = [];
  for (let j = 0; j <= ny; j += 1) for (let i = 0; i <= nx; i += 1) {
    const u = i / nx;
    const v = j / ny;
    const point = finitePoint(mapPoint(u, v), `mesh point (${i},${j})`);
    nodes.push({ id: `N${j * (nx + 1) + i + 1}`, i, j, u, v, ...point });
  }
  const elements = [];
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    const a = j * (nx + 1) + i;
    elements.push({
      id: `E${j * nx + i + 1}`,
      i,
      j,
      nodeIds: [nodes[a].id, nodes[a + 1].id, nodes[a + nx + 2].id, nodes[a + nx + 1].id],
    });
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const qualityRows = elements.map((element) => elementQuality(element, nodeById));
  const invalid = qualityRows.filter((row) => !row.ok);
  if (invalid.length) throw workflowError(invalid[0].reason, `Invalid element ${invalid[0].elementId}: ${invalid[0].reason}`);
  const boundary = boundaryNodeIds(nodes, nx, ny);
  const chordError = boundaryChordError(mapPoint, nx, ny);
  const core = {
    version: MEMBRANE_WORKFLOW_VERSION,
    id: String(input.id || 'MESH'),
    lineage: {
      familyId: String(input.familyId || input.id || 'MESH'),
      level: Number(input.level ?? 0),
      parentMeshHash: input.parentMeshHash || null,
      divisions: [nx, ny],
    },
    nodes,
    elements,
    boundary,
    geometry: {
      mapping: input.mapping || (input.mapPoint ? 'user-parametric-map' : 'bilinear-corners'),
      chordError,
      maxAspectRatio: Math.max(0, ...qualityRows.map((row) => row.aspectRatio)),
      minJacobianReciprocalCondition: Math.min(...qualityRows.map((row) => row.minimumJacobianReciprocalCondition)),
      minDetJ: Math.min(...qualityRows.map((row) => row.minDetJ)),
      maxWarpRatio: Math.max(0, ...qualityRows.map((row) => row.maxWarpRatio)),
      qualityRows,
    },
  };
  return deepFreeze({ ...core, meshHash: stableHash(core) });
}

export function recoverMembraneField(mesh, displacementByNode = {}, properties = {}, options = {}) {
  validateMesh(mesh);
  const nodeById = new Map(mesh.nodes.map((node) => [node.id, node]));
  const integrationPoints = [];
  const extrapolatedByElement = {};
  const averaged = new Map(mesh.nodes.map((node) => [node.id, { weight: 0, sx: 0, sy: 0, txy: 0 }]));
  for (const element of mesh.elements) {
    const nodes = element.nodeIds.map((id) => nodeById.get(id));
    const built = buildWallMembraneQm6({ id: element.id, nodes, ...properties }, options);
    if (!built.ok) throw workflowError(built.reason, `Element ${element.id} build failed: ${built.reason}`);
    if (built.qualification?.status !== 'pass') throw workflowError(built.qualification.reason || 'SHELL_ELEMENT_UNQUALIFIED', `Element ${element.id} is outside the qualified membrane range.`);
    const global = element.nodeIds.flatMap((id) => normalizeDof(displacementByNode[id], id));
    const local = multiplyVector(built.transform, global);
    const gaussRows = [];
    for (const xi of GAUSS) for (const eta of GAUSS) {
      const recovered = recoverMembraneStress(built.frame.projected, local, built.material.E, built.material.nu, xi, eta, {
        internalDisplacementOperator: built.internalDisplacementOperator,
      });
      if (!recovered.ok) throw workflowError(recovered.reason, `Stress recovery failed for ${element.id}.`);
      const row = stressRow(mesh, element, built, xi, eta, 'raw-integration-point', recovered);
      gaussRows.push(row);
      integrationPoints.push(row);
    }
    const cornerStress = extrapolateGaussToCorners(gaussRows);
    extrapolatedByElement[element.id] = element.nodeIds.map((nodeId, index) => ({
      nodeId,
      ...cornerStress[index],
      source: 'gauss-extrapolated',
      elementId: element.id,
    }));
    element.nodeIds.forEach((nodeId, index) => {
      const target = averaged.get(nodeId);
      const weight = built.area;
      target.weight += weight;
      for (const key of ['sx', 'sy', 'txy']) target[key] += cornerStress[index][key] * weight;
    });
  }
  const averagedNodes = [...averaged.entries()].map(([nodeId, row]) => ({
    nodeId,
    sx: row.weight > 0 ? row.sx / row.weight : 0,
    sy: row.weight > 0 ? row.sy / row.weight : 0,
    txy: row.weight > 0 ? row.txy / row.weight : 0,
    weight: row.weight,
    source: 'area-weighted-nodal-average',
  }));
  const core = {
    version: MEMBRANE_WORKFLOW_VERSION,
    meshHash: mesh.meshHash,
    formulation: 'QM6-EAS',
    resultKinds: ['raw-integration-point', 'gauss-extrapolated', 'area-weighted-nodal-average'],
    integrationPoints,
    extrapolatedByElement,
    averagedNodes,
    units: {
      stress: properties.stressUnit || 'model-force/model-length2',
      strain: '1',
    },
  };
  return deepFreeze({ ...core, resultHash: stableHash(core) });
}

export function probeMembraneStress(mesh, field, probe = {}) {
  validateMesh(mesh);
  const nodeById = new Map(mesh.nodes.map((node) => [node.id, node]));
  let selected = null;
  for (const element of mesh.elements) {
    const nodes = element.nodeIds.map((id) => nodeById.get(id));
    const natural = probe.xi != null && probe.eta != null && probe.elementId === element.id
      ? { ok: true, xi: Number(probe.xi), eta: Number(probe.eta), residual: 0 }
      : naturalCoordinates(nodes, probe.point);
    if (!natural.ok || Math.abs(natural.xi) > 1 + 1e-9 || Math.abs(natural.eta) > 1 + 1e-9) continue;
    selected = { element, natural };
    break;
  }
  if (!selected) throw workflowError('SHELL_PROBE_OUTSIDE_MESH', 'Probe point is outside the mesh or invalid.');
  const elementRows = field.extrapolatedByElement?.[selected.element.id] || [];
  if (elementRows.length !== 4) throw workflowError('SHELL_PROBE_FIELD_UNAVAILABLE', 'Probe requires four extrapolated corner rows.');
  const shape = { N: q4Natural(selected.natural.xi, selected.natural.eta) };
  const stress = {};
  for (const key of ['sx', 'sy', 'txy']) stress[key] = shape.N.reduce((sum, value, index) => sum + value * elementRows[index][key], 0);
  const core = {
    version: MEMBRANE_WORKFLOW_VERSION,
    probeId: probe.id || null,
    elementId: selected.element.id,
    xi: selected.natural.xi,
    eta: selected.natural.eta,
    mappingResidual: selected.natural.residual,
    stress,
    source: 'natural-coordinate-interpolation-of-extrapolated-corner-stress',
    meshHash: mesh.meshHash,
    resultHash: field.resultHash,
  };
  return deepFreeze({ ...core, probeHash: stableHash(core) });
}

export function buildConsistentMembraneEdgeTraction(mesh, input = {}) {
  validateMesh(mesh);
  const edge = String(input.edge || 'u1').toLowerCase();
  const ids = mesh.boundary?.[edge];
  if (!Array.isArray(ids) || ids.length < 2) throw workflowError('SHELL_EDGE_INVALID', `Unknown mesh edge: ${edge}`);
  const nodeById = new Map(mesh.nodes.map((node) => [node.id, node]));
  const traction = finiteVector(input.traction || input.lineLoad, 3, 'traction');
  const thickness = input.lineLoad ? 1 : positive(input.thickness, 'thickness');
  const nodalLoads = Object.fromEntries(ids.map((id) => [id, [0, 0, 0]]));
  const resultant = [0, 0, 0];
  const moment = [0, 0, 0];
  let length = 0;
  for (let index = 0; index < ids.length - 1; index += 1) {
    const a = nodeById.get(ids[index]);
    const b = nodeById.get(ids[index + 1]);
    const segment = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (!(segment > 0)) throw workflowError('SHELL_EDGE_DEGENERATE', `Degenerate edge segment ${ids[index]}-${ids[index + 1]}.`);
    const force = traction.map((value) => value * thickness * segment);
    for (let axis = 0; axis < 3; axis += 1) {
      nodalLoads[a.id][axis] += force[axis] / 2;
      nodalLoads[b.id][axis] += force[axis] / 2;
      resultant[axis] += force[axis];
    }
    const midpoint = [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2];
    const cross = cross3(midpoint, force);
    for (let axis = 0; axis < 3; axis += 1) moment[axis] += cross[axis];
    length += segment;
  }
  const summed = Object.values(nodalLoads).reduce((total, row) => total.map((value, axis) => value + row[axis]), [0, 0, 0]);
  const residual = Math.max(...summed.map((value, axis) => Math.abs(value - resultant[axis])));
  const core = {
    version: MEMBRANE_WORKFLOW_VERSION,
    edge,
    edgeNodeIds: ids,
    traction,
    thickness,
    length,
    nodalLoads,
    resultant,
    momentAboutOrigin: moment,
    equilibriumResidual: residual,
    meshHash: mesh.meshHash,
    method: 'two-node-consistent-edge-traction',
  };
  return deepFreeze({ ...core, loadHash: stableHash(core) });
}

export function compareMembraneMeshLevels(levels = [], options = {}) {
  const rows = levels.map((row) => ({
    meshHash: row.meshHash,
    level: Number(row.level),
    elementCount: Number(row.elementCount),
    quantity: Number(row.quantity),
    probeHash: row.probeHash || null,
  })).filter((row) => Number.isFinite(row.quantity)).sort((a, b) => a.level - b.level || a.elementCount - b.elementCount);
  const deltas = rows.slice(1).map((row, index) => Math.abs(row.quantity - rows[index].quantity) / Math.max(1e-15, Math.abs(row.quantity)));
  const tolerance = Number(options.tolerance ?? 0.02);
  const core = {
    version: MEMBRANE_WORKFLOW_VERSION,
    rows,
    deltas,
    tolerance,
    convergenceAvailable: rows.length >= 3,
    converged: rows.length >= 3 && deltas.at(-1) <= tolerance,
    benchmarkExecuted: false,
  };
  return deepFreeze({ ...core, comparisonHash: stableHash(core) });
}

function stressRow(mesh, element, built, xi, eta, source, recovered) {
  return {
    elementId: element.id,
    xi,
    eta,
    source,
    strain: recovered.strain,
    stress: recovered.stress,
    sx: recovered.stress.sx,
    sy: recovered.stress.sy,
    txy: recovered.stress.txy,
    detJ: q4Shape(built.frame.projected, xi, eta).detJ,
    meshHash: mesh.meshHash,
  };
}

function extrapolateGaussToCorners(rows) {
  const interpolation = rows.map((row) => q4Natural(row.xi, row.eta));
  return ['sx', 'sy', 'txy'].reduce((corners, key) => {
    const values = solveLinear(interpolation, rows.map((row) => row[key]));
    if (!values) throw workflowError('SHELL_STRESS_EXTRAPOLATION_FAILED', 'Gauss-to-corner extrapolation failed.');
    values.forEach((value, index) => { corners[index][key] = value; });
    return corners;
  }, Array.from({ length: 4 }, () => ({})));
}

function naturalCoordinates(nodes, pointInput) {
  if (!pointInput) return { ok: false };
  const frame = buildShellLocalFrame(nodes);
  if (!frame.ok) return frame;
  const point = finitePoint(pointInput, 'probe.point');
  const delta = [point.x - frame.origin[0], point.y - frame.origin[1], point.z - frame.origin[2]];
  const target = { x: dot3(delta, frame.e1), y: dot3(delta, frame.e2) };
  let xi = 0; let eta = 0;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const shape = q4Shape(frame.projected, xi, eta);
    if (!shape.ok) return shape;
    const x = shape.N.reduce((sum, value, index) => sum + value * frame.projected[index].x, 0);
    const y = shape.N.reduce((sum, value, index) => sum + value * frame.projected[index].y, 0);
    const rx = target.x - x; const ry = target.y - y;
    const residual = Math.hypot(rx, ry);
    if (residual <= 1e-10 * Math.max(1, frame.characteristicLength)) return { ok: true, xi, eta, residual };
    xi += shape.inverseJacobian[0][0] * rx + shape.inverseJacobian[1][0] * ry;
    eta += shape.inverseJacobian[0][1] * rx + shape.inverseJacobian[1][1] * ry;
    if (!Number.isFinite(xi + eta)) return { ok: false };
  }
  return { ok: false };
}

function elementQuality(element, nodeById) {
  const nodes = element.nodeIds.map((id) => nodeById.get(id));
  const frame = buildShellLocalFrame(nodes);
  if (!frame.ok) return { ok: false, elementId: element.id, reason: frame.reason };
  const quality = q4GeometryQuality(frame.projected);
  const dets = quality.jacobianSamples.map((row) => row.determinant);
  const minDetJ = Math.min(...dets);
  return {
    ok: minDetJ > 0,
    elementId: element.id,
    reason: minDetJ > 0 ? null : 'SHELL_JACOBIAN_NONPOSITIVE',
    minDetJ,
    aspectRatio: quality.aspectRatio,
    minimumJacobianReciprocalCondition: quality.minimumJacobianReciprocalCondition,
    maxWarpRatio: frame.maxWarpRatio,
  };
}

function resolveMap(input) {
  if (typeof input.mapPoint === 'function') return input.mapPoint;
  const corners = input.corners;
  if (!Array.isArray(corners) || corners.length !== 4) throw workflowError('SHELL_MESH_MAPPING_REQUIRED', 'Mesh requires mapPoint(u,v) or four corners.');
  const points = corners.map((point, index) => finitePoint(point, `corner[${index}]`));
  return (u, v) => ({
    x: (1 - u) * (1 - v) * points[0].x + u * (1 - v) * points[1].x + u * v * points[2].x + (1 - u) * v * points[3].x,
    y: (1 - u) * (1 - v) * points[0].y + u * (1 - v) * points[1].y + u * v * points[2].y + (1 - u) * v * points[3].y,
    z: (1 - u) * (1 - v) * points[0].z + u * (1 - v) * points[1].z + u * v * points[2].z + (1 - u) * v * points[3].z,
  });
}

function boundaryNodeIds(nodes, nx, ny) {
  const id = (i, j) => nodes[j * (nx + 1) + i].id;
  return {
    u0: Array.from({ length: ny + 1 }, (_item, j) => id(0, j)),
    u1: Array.from({ length: ny + 1 }, (_item, j) => id(nx, j)),
    v0: Array.from({ length: nx + 1 }, (_item, i) => id(i, 0)),
    v1: Array.from({ length: nx + 1 }, (_item, i) => id(i, ny)),
  };
}

function boundaryChordError(mapPoint, nx, ny) {
  let maximum = 0;
  const sample = (u1, v1, u2, v2) => {
    const a = finitePoint(mapPoint(u1, v1), 'boundary');
    const b = finitePoint(mapPoint(u2, v2), 'boundary');
    const middle = finitePoint(mapPoint((u1 + u2) / 2, (v1 + v2) / 2), 'boundary midpoint');
    maximum = Math.max(maximum, Math.hypot(middle.x - (a.x + b.x) / 2, middle.y - (a.y + b.y) / 2, middle.z - (a.z + b.z) / 2));
  };
  for (let i = 0; i < nx; i += 1) { sample(i / nx, 0, (i + 1) / nx, 0); sample(i / nx, 1, (i + 1) / nx, 1); }
  for (let j = 0; j < ny; j += 1) { sample(0, j / ny, 0, (j + 1) / ny); sample(1, j / ny, 1, (j + 1) / ny); }
  return maximum;
}

function validateMesh(mesh) {
  if (mesh?.version !== MEMBRANE_WORKFLOW_VERSION || !Array.isArray(mesh.nodes) || !Array.isArray(mesh.elements)) throw workflowError('SHELL_MESH_INVALID', 'A canonical membrane mesh is required.');
}
function normalizeDof(value, id) {
  if (!Array.isArray(value) || value.length !== 6 || value.some((item) => !Number.isFinite(Number(item)))) throw workflowError('SHELL_DISPLACEMENT_VECTOR_INVALID', `Node ${id} requires six finite displacement components.`);
  return value.map(Number);
}
function finitePoint(value, label) {
  const point = Array.isArray(value) ? { x: value[0], y: value[1], z: value[2] } : value || {};
  const result = { x: Number(point.x), y: Number(point.y), z: Number(point.z ?? 0) };
  if (!Object.values(result).every(Number.isFinite)) throw workflowError('SHELL_POINT_INVALID', `${label} must contain finite x/y/z coordinates.`);
  return result;
}
function finiteVector(value, length, label) {
  if (!Array.isArray(value) || value.length !== length || value.some((item) => !Number.isFinite(Number(item)))) throw workflowError('SHELL_VECTOR_INVALID', `${label} requires ${length} finite components.`);
  return value.map(Number);
}
function positiveInteger(value, label) { const number = Number(value); if (!Number.isInteger(number) || number < 1) throw workflowError('SHELL_MESH_DIVISION_INVALID', `${label} must be a positive integer.`); return number; }
function positive(value, label) { const number = Number(value); if (!(number > 0)) throw workflowError('SHELL_POSITIVE_VALUE_REQUIRED', `${label} must be positive.`); return number; }
function q4Natural(xi, eta) { return [(1 - xi) * (1 - eta) / 4, (1 + xi) * (1 - eta) / 4, (1 + xi) * (1 + eta) / 4, (1 - xi) * (1 + eta) / 4]; }
function solveLinear(matrix, rhs) { const a = matrix.map((row, i) => [...row, rhs[i]]); for (let p = 0; p < a.length; p += 1) { let pivot = p; for (let r = p + 1; r < a.length; r += 1) if (Math.abs(a[r][p]) > Math.abs(a[pivot][p])) pivot = r; [a[p], a[pivot]] = [a[pivot], a[p]]; if (Math.abs(a[p][p]) < 1e-14) return null; const d = a[p][p]; for (let c = p; c <= a.length; c += 1) a[p][c] /= d; for (let r = 0; r < a.length; r += 1) if (r !== p) { const f = a[r][p]; for (let c = p; c <= a.length; c += 1) a[r][c] -= f * a[p][c]; } } return a.map((row) => row.at(-1)); }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot3(a, b) { return a.reduce((sum, value, index) => sum + value * b[index], 0); }
function workflowError(code, message) { return Object.assign(new Error(message), { code }); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
