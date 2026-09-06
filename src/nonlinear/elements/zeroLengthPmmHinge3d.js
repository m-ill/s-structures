import { stableHash } from '../../core/stableHash.js';
import { createPmmHinge3dProperty, evaluatePmmHinge3d } from '../materials/pmmHinge3d.js';

export const ZERO_LENGTH_PMM_HINGE_3D_VERSION = 'p18-zero-length-pmm-hinge-3d-v1';

/**
 * Native 12-DOF zero-length element. The coupled constitutive subset is
 * [relative ux, relative ry, relative rz] -> [P, My, Mz].
 */
export function evaluateZeroLengthPmmHinge3d(input = {}) {
  const displacement = finiteVector(input.displacement, 12);
  const property = input.property?.propertyHash ? input.property : createPmmHinge3dProperty(input.property || {});
  const relative = displacement.slice(6).map((value, index) => value - displacement[index]);
  const material = evaluatePmmHinge3d(property, {
    axial: relative[0], thetaY: relative[4], thetaZ: relative[5],
  }, input.state, input.options);
  const endForce = new Array(12).fill(0);
  const values = [material.force.axial, material.force.momentY, material.force.momentZ];
  const dofs = [0, 4, 5];
  dofs.forEach((dof, index) => { endForce[dof] = -values[index]; endForce[6 + dof] = values[index]; });
  const tangent = Array.from({ length: 12 }, () => new Array(12).fill(0));
  for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) {
    const rowDof = dofs[row];
    const columnDof = dofs[column];
    const value = material.tangent.matrix[row][column];
    tangent[rowDof][columnDof] += value;
    tangent[rowDof][6 + columnDof] -= value;
    tangent[6 + rowDof][columnDof] -= value;
    tangent[6 + rowDof][6 + columnDof] += value;
  }
  const core = {
    version: ZERO_LENGTH_PMM_HINGE_3D_VERSION,
    ok: true,
    propertyHash: property.propertyHash,
    displacement,
    relativeDeformation: { axial: relative[0], thetaY: relative[4], thetaZ: relative[5] },
    endForce,
    tangent,
    material,
    equilibriumResidual: Math.max(...dofs.map((dof) => Math.abs(endForce[dof] + endForce[6 + dof]))),
  };
  return deepFreeze({ ...core, elementResponseHash: stableHash(core) });
}

/** Assemble every native zero-length P-My-Mz hinge into a global tangent/internal-force domain. */
export function assembleZeroLengthPmmHinge3dDomain(model = {}, input = {}) {
  const nodes = model.nodes || [];
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const elements = model.zeroLengthPmmHinges || model.pmmHinges || [];
  const properties = new Map((model.hingeProperties || []).map((property) => [property.id, property]));
  const ndof = nodes.length * 6;
  const displacement = input.displacement == null ? new Array(ndof).fill(0) : finiteVector(input.displacement, ndof);
  const tangent = Array.from({ length: ndof }, () => new Array(ndof).fill(0));
  const internalForce = new Array(ndof).fill(0);
  const rows = [];
  const ids = new Set();
  for (const element of elements) {
    const id = String(element?.id || '').trim();
    if (!id) return domainFailure('ZERO_LENGTH_PMM_ID_REQUIRED', null, ndof);
    if (ids.has(id)) return domainFailure('ZERO_LENGTH_PMM_ID_DUPLICATE', id, ndof);
    ids.add(id);
    const i = nodeIndex.get(element.n1);
    const j = nodeIndex.get(element.n2);
    if (i == null || j == null) return domainFailure('ZERO_LENGTH_PMM_NODE_REFERENCE_MISSING', id, ndof);
    if (i === j) return domainFailure('ZERO_LENGTH_PMM_DISTINCT_NODE_IDS_REQUIRED', id, ndof);
    const distance = Math.hypot(
      Number(nodes[j].x) - Number(nodes[i].x),
      Number(nodes[j].y) - Number(nodes[i].y),
      Number(nodes[j].z || 0) - Number(nodes[i].z || 0),
    );
    const tolerance = Number(element.coordinateTolerance ?? input.coordinateTolerance ?? 1e-9);
    if (!Number.isFinite(tolerance) || tolerance < 0 || distance > tolerance) return domainFailure('ZERO_LENGTH_PMM_COORDINATE_MISMATCH', id, ndof, { distance, tolerance });
    const registryProperty = properties.get(element.propertyId || element.hingePropertyId);
    if (!element.property && !registryProperty) return domainFailure('ZERO_LENGTH_PMM_PROPERTY_MISSING', id, ndof);
    const propertyInput = element.property || registryProperty;
    const parameters = propertyInput?.propertyHash ? propertyInput : { id: propertyInput.id || element.propertyId || `${id}-PROPERTY`, ...(propertyInput.parameters || propertyInput) };
    let property;
    let response;
    try {
      property = propertyInput?.propertyHash ? propertyInput : createPmmHinge3dProperty(parameters);
      const dof = [...Array.from({ length: 6 }, (_unused, component) => 6 * i + component), ...Array.from({ length: 6 }, (_unused, component) => 6 * j + component)];
      response = evaluateZeroLengthPmmHinge3d({
        property,
        displacement: dof.map((index) => displacement[index]),
        state: input.states?.[id] || null,
        options: { ...(input.options || {}), ...(element.options || {}) },
      });
      for (let row = 0; row < 12; row += 1) {
        internalForce[dof[row]] += response.endForce[row];
        for (let column = 0; column < 12; column += 1) tangent[dof[row]][dof[column]] += response.tangent[row][column];
      }
      rows.push({ id, n1: element.n1, n2: element.n2, dof, propertyHash: property.propertyHash, response });
    } catch (error) {
      return domainFailure(error?.code || 'ZERO_LENGTH_PMM_ASSEMBLY_FAILED', id, ndof, { message: error?.message || null });
    }
  }
  const core = {
    version: ZERO_LENGTH_PMM_HINGE_3D_VERSION,
    ok: true,
    ndof,
    elementCount: rows.length,
    displacement,
    tangent,
    internalForce,
    elements: rows,
    stateByElement: Object.fromEntries(rows.map((row) => [row.id, row.response.material.state])),
  };
  return deepFreeze({ ...core, assemblyHash: stableHash(core) });
}

function finiteVector(value, length) {
  if (!Array.isArray(value) || value.length !== length || value.some((item) => !Number.isFinite(Number(item)))) {
    throw Object.assign(new Error(`Zero-length PMM hinge displacement must contain ${length} finite components.`), { code: 'ZERO_LENGTH_PMM_DISPLACEMENT_INVALID' });
  }
  return value.map(Number);
}
function domainFailure(reason, elementId, ndof, details = {}) {
  return Object.freeze({ version: ZERO_LENGTH_PMM_HINGE_3D_VERSION, ok: false, reason, elementId, ndof, ...details });
}
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
