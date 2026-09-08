import { SHELL_FRAME_ASSEMBLY_VERSION } from '../../metadata/numericVersions.js';
export { SHELL_FRAME_ASSEMBLY_VERSION };
import { buildQuad4ShellElement } from './quad4.js';
import { materialOf } from '../../core/catalogs.js';
import { buildEquivalentShellScope, EQUIVALENT_SHELL_WARNING } from './equivalentScope.js';
import { buildShellLocalFrame, q4GeometryQuality } from './shellElementMath.js';



export function expandShellsToFrameLinks(model = {}) {
  const nodeMap = Object.fromEntries((model.nodes || []).map((node) => [node.id, node]));
  const shells = [
    ...(Array.isArray(model.shells) ? model.shells : []),
    ...(Array.isArray(model.slabs) ? model.slabs.filter((item) => item?.type === 'shell') : []),
  ];
  const members = [];
  const sections = [];
  const rows = [];
  const errors = [];
  const femElements = [];
  const seenShellIds = new Set();
  let equivalentShellCount = 0;
  shells.forEach((shell) => {
    const id = shellId(shell);
    if (!id) {
      blockShell(rows, errors, null, 'SHELL_ID_REQUIRED');
      return;
    }
    if (seenShellIds.has(id)) {
      blockShell(rows, errors, id, 'SHELL_ID_DUPLICATE');
      return;
    }
    seenShellIds.add(id);
    const ids = shellNodeIds(shell);
    if (ids.length !== 4) {
      blockShell(rows, errors, id, 'SHELL_NODE_IDS_REQUIRED');
      return;
    }
    if (new Set(ids).size !== 4) {
      blockShell(rows, errors, id, 'SHELL_NODE_IDS_DUPLICATE');
      return;
    }
    const nodes = ids.map((nodeId) => nodeMap[nodeId]);
    const missingNodeId = ids.find((nodeId, index) => !nodes[index]);
    if (missingNodeId != null) {
      blockShell(rows, errors, id, 'SHELL_NODE_REFERENCE_MISSING', { nodeId: missingNodeId });
      return;
    }
    const formulation = normalizeFormulation(shell.formulation);
    if (!formulation) {
      blockShell(rows, errors, id, 'SHELL_FORMULATION_UNSUPPORTED', { formulation: shell.formulation });
      return;
    }
    const properties = resolveShellProperties(model, shell);
    if (!properties.ok) {
      blockShell(rows, errors, id, properties.reason, properties.details);
      return;
    }
    const frame = buildShellLocalFrame(nodes);
    if (!frame.ok) {
      blockShell(rows, errors, id, frame.reason || 'SHELL_DEGENERATE_GEOMETRY');
      return;
    }
    const geometry = q4GeometryQuality(frame.projected);
    if (!geometry.jacobianSamples.every((sample) => Number.isFinite(sample.determinant) && sample.determinant > 1e-14)
      || !Number.isFinite(geometry.shortestEdge) || !(geometry.shortestEdge > 1e-12)) {
      blockShell(rows, errors, id, 'SHELL_DEGENERATE_GEOMETRY');
      return;
    }
    const { matId, material, linkE, thickness } = properties;
    const normalizedShell = { ...shell, id, nodeIds: ids, nodes, matId, material, thickness, t: thickness };
    const element = buildQuad4ShellElement(normalizedShell);
    if (!Number.isFinite(element.area) || !(element.area > 1e-12)) {
      blockShell(rows, errors, id, 'SHELL_DEGENERATE_GEOMETRY');
      return;
    }
    if (formulation !== 'equivalent') {
      femElements.push({ ...normalizedShell, formulation });
      const secId = `__shell_${element.id}_connectivity_sec`;
      sections.push({ id: secId, kind: 'direct', A: 1e-12, Iy: 1e-12, Iz: 1e-12, J: 1e-12 });
      for (let edge = 0; edge < 4; edge += 1) {
        members.push({ id: `__shell_${element.id}_connectivity_${edge + 1}`, type: 'frame', n1: ids[edge], n2: ids[(edge + 1) % 4], matId, secId, generated: true, source: 'shellFemConnectivity', shellId: element.id });
      }
      rows.push({ id: element.id, status: 'assembled-fem', formulation, nodeIds: ids, area: element.area, thickness: element.thickness, materialId: matId, linkCount: 0, warnings: [] });
      return;
    }
    equivalentShellCount += 1;
    const links = [[0, 1, 'edge'], [1, 2, 'edge'], [2, 3, 'edge'], [3, 0, 'edge'], [0, 2, 'diagonal'], [1, 3, 'diagonal']];
    const linkRows = [];
    links.forEach(([a, b, kind], index) => {
      const L = distance(nodes[a], nodes[b]);
      const E = linkE;
      const stiffness = element.stiffness.membrane * element.area / Math.max(1e-9, L * links.length);
      const secId = `__shell_${element.id}_${index + 1}_sec`;
      members.push({ id: `__shell_${element.id}_${index + 1}`, type: 'truss', n1: ids[a], n2: ids[b], matId, secId, generated: true, source: 'shellFrameAssembly', shellId: element.id, linkKind: kind });
      sections.push({ id: secId, kind: 'direct', A: Math.max(1e-9, stiffness * L / E), Iy: 1e-12, Iz: 1e-12, J: 1e-12 });
      linkRows.push({ kind, n1: ids[a], n2: ids[b], length: L, materialId: matId, materialE: E, sectionId: secId, area: sections.at(-1).A, targetAxialStiffness: stiffness });
    });
    rows.push({ id: element.id, status: 'assembled-preliminary', nodeIds: ids, area: element.area, thickness: element.thickness, materialId: matId, linkCount: links.length, links: linkRows, warnings: [EQUIVALENT_SHELL_WARNING] });
  });
  return {
    ok: errors.length === 0,
    reason: errors[0]?.code || null,
    version: SHELL_FRAME_ASSEMBLY_VERSION,
    shellCount: shells.length,
    linkCount: members.filter((member) => member.source !== 'shellFemConnectivity').length,
    rows,
    members,
    sections,
    femElements,
    femElementCount: femElements.length,
    equivalentShellCount,
    errors,
    equivalentShellScope: buildEquivalentShellScope(model, { forceActive: equivalentShellCount > 0 }),
    warnings: equivalentShellCount ? [EQUIVALENT_SHELL_WARNING] : [],
    limitations: [
      'Shell frame assembly is an equivalent edge/diagonal link model, not certified shell FEM.',
      'Generated shell links are solver aids and are not reported as shell local design forces.',
    ],
  };
}

function normalizeFormulation(value) {
  if (['membrane', 'plate', 'shell', 'fem', 'equivalent'].includes(value)) return value;
  if (value == null) return 'equivalent';
  return null;
}

function shellNodeIds(shell = {}) {
  if (Array.isArray(shell.nodeIds)) return shell.nodeIds.filter((id) => id != null && id !== '');
  if (Array.isArray(shell.nodes)) return shell.nodes.map((node) => node?.id).filter((id) => id != null && id !== '');
  return [];
}

function shellId(shell = {}) {
  return typeof shell.id === 'string' && shell.id.trim() ? shell.id.trim() : null;
}

function blockShell(rows, errors, id, reason, details = {}) {
  rows.push({ id, status: 'skipped', disposition: 'blocked', reason, linkCount: 0, warnings: [] });
  errors.push({ code: reason, shellId: id, ...details });
}

function resolveShellProperties(model, shell) {
  const thickness = strictNumber(shell.t ?? shell.thickness);
  if (!Number.isFinite(thickness) || thickness <= 0) return { ok: false, reason: 'SHELL_THICKNESS_INVALID' };
  const matId = typeof shell.matId === 'string' && shell.matId.trim() ? shell.matId.trim() : 'steel';
  let memberMaterial;
  try {
    memberMaterial = materialOf(model, matId);
  } catch (error) {
    return { ok: false, reason: 'SHELL_MATERIAL_INVALID', details: { materialId: matId, cause: error.code || null } };
  }
  const source = shell.material || memberMaterial;
  const E = strictNumber(shell.E ?? source?.E);
  const linkE = strictNumber(memberMaterial?.E);
  const nu = strictNumber(shell.nu ?? source?.nu ?? 0.2);
  const densityInput = shell.density ?? source?.density ?? source?.rho;
  const density = densityInput == null ? 0 : strictNumber(densityInput);
  if (!Number.isFinite(E) || E <= 0 || !Number.isFinite(linkE) || linkE <= 0
    || !Number.isFinite(nu) || nu < 0 || nu >= 0.5
    || !Number.isFinite(density) || density < 0) {
    return { ok: false, reason: 'SHELL_MATERIAL_INVALID', details: { materialId: matId } };
  }
  return { ok: true, matId, thickness, material: { ...source, E, nu, density }, linkE };
}

function strictNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

function distance(a, b) {
  return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0), (b.z || 0) - (a.z || 0));
}
