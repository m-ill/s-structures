import { buildQuad4ShellElement } from './quad4.js';
import { materialOf } from '../../core/catalogs.js';
import { buildEquivalentShellScope, EQUIVALENT_SHELL_WARNING } from './equivalentScope.js';

export const SHELL_FRAME_ASSEMBLY_VERSION = 'p3-t74-shell-frame-assembly';

export function expandShellsToFrameLinks(model = {}) {
  const nodeMap = Object.fromEntries((model.nodes || []).map((node) => [node.id, node]));
  const shells = model.shells || model.slabs?.filter((item) => item.type === 'shell') || [];
  const members = [];
  const sections = [];
  const rows = [];
  shells.forEach((shell, shellIndex) => {
    const ids = shellNodeIds(shell);
    const nodes = ids.map((id) => nodeMap[id]).filter(Boolean);
    if (ids.length !== 4 || nodes.length !== 4) {
      rows.push({ id: shell.id || `SHELL${shellIndex + 1}`, status: 'skipped', reason: 'SHELL_NODE_IDS_REQUIRED', linkCount: 0, warnings: [EQUIVALENT_SHELL_WARNING] });
      return;
    }
    const element = buildQuad4ShellElement({ ...shell, nodes });
    const links = [[0, 1, 'edge'], [1, 2, 'edge'], [2, 3, 'edge'], [3, 0, 'edge'], [0, 2, 'diagonal'], [1, 3, 'diagonal']];
    const linkRows = [];
    links.forEach(([a, b, kind], index) => {
      const L = distance(nodes[a], nodes[b]);
      const matId = shell.matId || 'steel';
      const E = Math.max(1e-9, Number(materialOf(model, matId).E || 205000000));
      const stiffness = element.stiffness.membrane * element.area / Math.max(1e-9, L * links.length);
      const secId = `__shell_${element.id}_${index + 1}_sec`;
      members.push({ id: `__shell_${element.id}_${index + 1}`, type: 'truss', n1: ids[a], n2: ids[b], matId, secId, generated: true, source: 'shellFrameAssembly', shellId: element.id, linkKind: kind });
      sections.push({ id: secId, kind: 'direct', A: Math.max(1e-9, stiffness * L / E), Iy: 1e-12, Iz: 1e-12, J: 1e-12 });
      linkRows.push({ kind, n1: ids[a], n2: ids[b], length: L, materialId: matId, materialE: E, sectionId: secId, area: sections.at(-1).A, targetAxialStiffness: stiffness });
    });
    rows.push({ id: element.id, status: 'assembled-preliminary', nodeIds: ids, area: element.area, thickness: element.thickness, materialId: shell.matId || 'steel', linkCount: links.length, links: linkRows, warnings: [EQUIVALENT_SHELL_WARNING] });
  });
  return {
    version: SHELL_FRAME_ASSEMBLY_VERSION,
    shellCount: shells.length,
    linkCount: members.length,
    rows,
    members,
    sections,
    equivalentShellScope: buildEquivalentShellScope(model, { forceActive: shells.length > 0 }),
    warnings: shells.length ? [EQUIVALENT_SHELL_WARNING] : [],
    limitations: [
      'Shell frame assembly is an equivalent edge/diagonal link model, not certified shell FEM.',
      'Generated shell links are solver aids and are not reported as shell local design forces.',
    ],
  };
}

function shellNodeIds(shell = {}) {
  if (Array.isArray(shell.nodeIds)) return shell.nodeIds.filter(Boolean);
  if (Array.isArray(shell.nodes)) return shell.nodes.map((node) => node.id).filter(Boolean);
  return [];
}

function distance(a, b) {
  return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0), (b.z || 0) - (a.z || 0));
}
