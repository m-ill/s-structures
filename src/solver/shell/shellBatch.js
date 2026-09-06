import { buildFlatShellQm6Mitc4 } from './flatShellQm6Mitc4.js';
import { buildSlabPlateMitc4 } from './slabPlateMitc4.js';
import { buildWallMembraneQm6 } from './wallMembraneQm6.js';

export const SHELL_BATCH_VERSION = 'p10-m9-shell-soa-batch-v4-fail-closed-qualified';
export const SHELL_TYPE = Object.freeze({ membrane: 1, plate: 2, shell: 3, fem: 3 });

export function buildShellSoaBatch(elements = [], nodeIndex = new Map()) {
  if (!Array.isArray(elements) || elements.length === 0) {
    return { ok: false, reason: 'SHELL_BATCH_EMPTY' };
  }
  const count = elements.length;
  const typeCodes = new Uint8Array(count);
  const nodeIndices = new Int32Array(count * 4);
  const properties = new Float64Array(count * 4);
  const matrixOffsets = new Int32Array(count + 1);
  const dofOffsets = new Int32Array(count + 1);
  const matrices = [];
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const input = elements[index];
    const formulation = normalizeFormulation(input.formulation);
    if (!formulation) {
      return { ok: false, reason: 'SHELL_FORMULATION_UNSUPPORTED', elementId: input.id || null };
    }
    const built = buildByFormulation(input, formulation);
    if (!built.ok) return { ok: false, reason: built.reason, elementId: input.id || null, element: built };
    typeCodes[index] = SHELL_TYPE[formulation];
    const ids = input.nodeIds || input.nodes.map((node) => node.id);
    const resolvedNodeIndices = ids.map((id) => lookupNode(nodeIndex, id));
    const missingLocal = resolvedNodeIndices.findIndex((value) => !Number.isInteger(value) || value < 0);
    if (missingLocal >= 0) {
      return {
        ok: false,
        reason: 'SHELL_NODE_INDEX_MISSING',
        elementId: input.id || null,
        nodeId: ids[missingLocal] ?? null,
      };
    }
    if (new Set(resolvedNodeIndices).size !== 4) {
      return { ok: false, reason: 'SHELL_NODE_INDEX_DUPLICATE', elementId: input.id || null };
    }
    for (let local = 0; local < 4; local += 1) nodeIndices[index * 4 + local] = resolvedNodeIndices[local];
    properties.set([built.thickness, built.material?.E || built.membrane?.material.E || 0, built.material?.nu ?? built.membrane?.material.nu ?? 0, built.area], index * 4);
    matrices.push(Float64Array.from(built.matrix.flat()));
    matrixOffsets[index + 1] = matrixOffsets[index] + 24 * 24;
    dofOffsets[index + 1] = dofOffsets[index] + 24;
    rows.push(built);
  }
  const blockers = [...new Set(rows.flatMap(elementQualificationBlockers))];
  return {
    ok: true,
    version: SHELL_BATCH_VERSION,
    elementCount: count,
    typeCodes,
    nodeIndices,
    properties,
    matrixOffsets,
    dofOffsets,
    matrices,
    rows,
    elementVersions: rows.map((row) => row.version),
    elementFormulations: rows.map((row) => row.elementFormulation),
    qualificationStatus: blockers.length ? 'blocked' : 'qualified',
    designTransferAllowed: blockers.length === 0,
    blockers,
  };
}

export function buildShellElementScatters(batch, dofPerNode = 6) {
  return Array.from({ length: batch.elementCount }, (_, element) => {
    const dofs = [];
    for (let local = 0; local < 4; local += 1) {
      const node = batch.nodeIndices[element * 4 + local];
      for (let component = 0; component < 6; component += 1) dofs.push(node * dofPerNode + component);
    }
    return { element, dofs: Int32Array.from(dofs) };
  });
}

function buildByFormulation(input, formulation) {
  if (formulation === 'membrane') return buildWallMembraneQm6(input);
  if (formulation === 'plate') return buildSlabPlateMitc4(input);
  return buildFlatShellQm6Mitc4(input);
}
function normalizeFormulation(value) {
  if (value === 'membrane' || value === 'plate') return value;
  if (value == null || value === 'shell' || value === 'fem') return 'shell';
  return null;
}
function elementQualificationBlockers(element = {}) {
  const explicit = element.designEligibility?.reasonCodes || [];
  const status = String(element.qualification?.status || '').toLowerCase();
  if (status === 'pass' && element.designEligibility?.allowed === true && explicit.length === 0) return [];
  if (explicit.length) return explicit;
  return [element.qualification?.reason || 'SHELL_NUMERICAL_QUALIFICATION_REQUIRED'];
}
function lookupNode(map, id) {
  if (map instanceof Map) return Number(map.get(id));
  if (typeof map === 'object' && map != null) return Number(map[id]);
  return Number(id);
}
