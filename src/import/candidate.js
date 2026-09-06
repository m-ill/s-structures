import { bboxOfPoints } from './point.js';

export const IMPORT_CANDIDATE_VERSION = 'p3-import-candidate';

export function buildImportCandidate(input = {}) {
  const source = normalizeSource(input.source);
  const candidates = {
    stories: input.stories || input.candidates?.stories || [],
    grids: input.grids || input.candidates?.grids || [],
    nodes: input.nodes || input.candidates?.nodes || [],
    members: input.members || input.candidates?.members || [],
  };
  return {
    version: IMPORT_CANDIDATE_VERSION,
    source,
    candidates,
    audit: buildAudit(input.audit, candidates),
  };
}

export function validateImportCandidate(candidate) {
  const errors = [];
  if (candidate?.version !== IMPORT_CANDIDATE_VERSION) errors.push('version');
  for (const key of ['stories', 'grids', 'nodes', 'members']) {
    if (!Array.isArray(candidate?.candidates?.[key])) errors.push(`candidates.${key}`);
  }
  const nodeIds = new Set();
  const memberIds = new Set();
  for (const node of candidate?.candidates?.nodes || []) {
    if (!node.id) errors.push('node.id');
    else if (nodeIds.has(node.id)) errors.push(`node.${node.id}.duplicate`);
    else nodeIds.add(node.id);
    if (![node.x, node.y, node.z].every(Number.isFinite)) errors.push(`node.${node.id || '?'}.coordinate`);
  }
  for (const member of candidate?.candidates?.members || []) {
    if (!member.id) errors.push('member.id');
    else if (memberIds.has(member.id)) errors.push(`member.${member.id}.duplicate`);
    else memberIds.add(member.id);
    if (member.from === member.to) errors.push(`member.${member.id || '?'}.self`);
    if (!nodeIds.has(member.from) || !nodeIds.has(member.to)) errors.push(`member.${member.id || '?'}.endpoint`);
  }
  return { ok: errors.length === 0, errors, warnings: candidate?.audit?.warnings || [] };
}

function normalizeSource(source = {}) {
  return {
    type: source.type || 'unknown',
    fileId: source.fileId || null,
    units: source.units || 'm',
    transform: source.transform || { origin: [0, 0, 0], up: 'z' },
  };
}

function buildAudit(audit = {}, candidates) {
  return {
    counts: {
      stories: candidates.stories.length,
      grids: candidates.grids.length,
      nodes: candidates.nodes.length,
      members: candidates.members.length,
      ...audit.counts,
    },
    unmapped: audit.unmapped || [],
    warnings: audit.warnings || [],
    unitSuspicion: audit.unitSuspicion || null,
    bbox: audit.bbox || bboxOfPoints(candidates.nodes),
  };
}
