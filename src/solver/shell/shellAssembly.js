import { buildQuad4ShellElement } from './quad4.js';

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
      rows.push({ id: shell.id || `SHELL${shellIndex + 1}`, status: 'skipped', reason: 'SHELL_NODE_IDS_REQUIRED', linkCount: 0 });
      return;
    }
    const element = buildQuad4ShellElement({ ...shell, nodes });
    const links = [[0, 1, 'edge'], [1, 2, 'edge'], [2, 3, 'edge'], [3, 0, 'edge'], [0, 2, 'diagonal'], [1, 3, 'diagonal']];
    links.forEach(([a, b, kind], index) => {
      const L = distance(nodes[a], nodes[b]);
      const stiffness = element.stiffness.membrane * element.area / Math.max(1e-9, L * links.length);
      const secId = `__shell_${element.id}_${index + 1}_sec`;
      members.push({ id: `__shell_${element.id}_${index + 1}`, type: 'truss', n1: ids[a], n2: ids[b], matId: shell.matId || 'steel', secId, generated: true, source: 'shellFrameAssembly', shellId: element.id, linkKind: kind });
      sections.push({ id: secId, kind: 'direct', A: Math.max(1e-9, stiffness * L / 205000000), Iy: 1e-12, Iz: 1e-12, J: 1e-12 });
    });
    rows.push({ id: element.id, status: 'assembled-preliminary', nodeIds: ids, area: element.area, thickness: element.thickness, linkCount: links.length });
  });
  return { version: SHELL_FRAME_ASSEMBLY_VERSION, shellCount: shells.length, linkCount: members.length, rows, members, sections };
}

function shellNodeIds(shell = {}) {
  if (Array.isArray(shell.nodeIds)) return shell.nodeIds.filter(Boolean);
  if (Array.isArray(shell.nodes)) return shell.nodes.map((node) => node.id).filter(Boolean);
  return [];
}

function distance(a, b) {
  return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0), (b.z || 0) - (a.z || 0));
}
