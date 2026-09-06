import { applyModelChangeSet } from './transaction.js';

export const MODEL_REPAIR_VERSION = 'p7-m3-model-repair-v1';

export function inspectModelGeometry(model, options = {}) {
  const tolerance = Number(options.tolerance) > 0 ? Number(options.tolerance) : 1e-6;
  const nodes = model.nodes || [];
  const members = model.members || [];
  const duplicateNodeGroups = duplicateGroups(nodes, tolerance);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const zeroLengthMembers = members.filter((member) => {
    const a = nodeById.get(member.n1); const b = nodeById.get(member.n2);
    return !a || !b || distance(a, b) <= tolerance;
  }).map((member) => member.id);
  const referenced = referencedNodeIds(model);
  const isolatedNodes = nodes.filter((node) => !referenced.has(node.id)).map((node) => node.id);
  return {
    version: MODEL_REPAIR_VERSION,
    duplicateNodeGroups,
    zeroLengthMembers,
    isolatedNodes,
    summary: {
      duplicateNodeCount: duplicateNodeGroups.reduce((sum, group) => sum + group.remove.length, 0),
      zeroLengthMemberCount: zeroLengthMembers.length,
      isolatedNodeCount: isolatedNodes.length,
    },
  };
}

export function planModelRepairs(model, options = {}) {
  const inspection = inspectModelGeometry(model, options);
  const replacement = new Map();
  inspection.duplicateNodeGroups.forEach((group) => group.remove.forEach((id) => replacement.set(id, group.keep)));
  const changes = [];
  const nodeById = new Map((model.nodes || []).map((node) => [node.id, node]));
  for (const group of inspection.duplicateNodeGroups) {
    const keep = nodeById.get(group.keep);
    const patch = mergeNodeState(keep, group.remove.map((id) => nodeById.get(id)).filter(Boolean));
    if (Object.keys(patch).length) changes.push({ op: 'update', collection: 'nodes', id: group.keep, patch });
  }
  for (const member of model.members || []) {
    const n1 = replacement.get(member.n1) || member.n1;
    const n2 = replacement.get(member.n2) || member.n2;
    if (n1 !== member.n1 || n2 !== member.n2) changes.push({ op: 'update', collection: 'members', id: member.id, patch: { n1, n2 } });
  }
  for (const collection of ['loads', 'diaphragms', 'stories', 'shells', 'slabs', 'slabPanels', 'massSources', 'analysisCases']) {
    for (const row of model[collection] || []) {
      const remapped = remapNodeReferences(row, replacement);
      if (JSON.stringify(remapped) !== JSON.stringify(row)) {
        changes.push({ op: 'replace', collection, id: row.id, value: remapped });
      }
    }
  }
  for (const group of inspection.duplicateNodeGroups) for (const id of group.remove) changes.push({ op: 'remove', collection: 'nodes', id });

  const removedMembers = new Set(inspection.zeroLengthMembers);
  for (const member of model.members || []) {
    const n1 = replacement.get(member.n1) || member.n1;
    const n2 = replacement.get(member.n2) || member.n2;
    if (n1 === n2) removedMembers.add(member.id);
  }
  for (const load of model.loads || []) if (removedMembers.has(load.member)) changes.push({ op: 'remove', collection: 'loads', id: load.id });
  for (const id of removedMembers) changes.push({ op: 'remove', collection: 'members', id });
  if (options.removeIsolatedNodes !== false) {
    const alreadyRemoved = new Set(inspection.duplicateNodeGroups.flatMap((group) => group.remove));
    for (const id of inspection.isolatedNodes) if (!alreadyRemoved.has(id)) changes.push({ op: 'remove', collection: 'nodes', id });
  }
  return { ok: true, id: 'repair-model-geometry', name: 'Repair model geometry', changes: dedupeChanges(changes), inspection };
}

export function applyModelRepairs(model, options = {}) {
  return applyModelChangeSet(model, planModelRepairs(model, options), options);
}

function duplicateGroups(nodes, tolerance) {
  const parent = nodes.map((_, index) => index);
  const root = (index) => {
    let current = index;
    while (parent[current] !== current) current = parent[current];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = current;
      index = next;
    }
    return current;
  };
  for (let i = 0; i < nodes.length; i += 1) for (let j = i + 1; j < nodes.length; j += 1) {
    if (distance(nodes[i], nodes[j]) <= tolerance) parent[root(j)] = root(i);
  }
  const clusters = new Map();
  nodes.forEach((node, index) => {
    const key = root(index);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(node.id);
  });
  return [...clusters.values()].filter((ids) => ids.length > 1).map(([keep, ...remove]) => ({ keep, remove }));
}

function dedupeChanges(changes) {
  const seen = new Set();
  return changes.filter((change) => {
    const key = `${change.collection}:${change.op}:${change.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function distance(a, b) {
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y), Number(a.z || 0) - Number(b.z || 0));
}

function referencedNodeIds(model) {
  const ids = new Set((model.members || []).flatMap((member) => [member.n1, member.n2]).filter(Boolean));
  for (const collection of ['loads', 'diaphragms', 'stories', 'shells', 'slabs', 'slabPanels', 'massSources', 'analysisCases']) {
    for (const row of model[collection] || []) collectNodeReferences(row, ids);
  }
  return ids;
}

function collectNodeReferences(value, ids, key = '') {
  if (value == null) return;
  if (Array.isArray(value)) {
    if (key === 'nodeIds' || key === 'nodes') value.forEach((item) => {
      if (typeof item === 'string') ids.add(item);
      else if (item?.id) ids.add(item.id);
    });
    else value.forEach((item) => collectNodeReferences(item, ids));
    return;
  }
  if (typeof value !== 'object') {
    if (isNodeReferenceKey(key) && typeof value === 'string') ids.add(value);
    return;
  }
  for (const [childKey, child] of Object.entries(value)) collectNodeReferences(child, ids, childKey);
}

function remapNodeReferences(value, replacement, key = '') {
  if (value == null) return value;
  if (Array.isArray(value)) {
    const rows = value.map((item) => {
      if ((key === 'nodeIds' || key === 'nodes') && typeof item === 'string') return replacement.get(item) || item;
      if (key === 'nodes' && item?.id) return { ...remapNodeReferences(item, replacement), id: replacement.get(item.id) || item.id };
      return remapNodeReferences(item, replacement);
    });
    return key === 'nodeIds' || key === 'nodes' ? [...new Set(rows)] : rows;
  }
  if (typeof value !== 'object') return isNodeReferenceKey(key) ? replacement.get(value) || value : value;
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, remapNodeReferences(child, replacement, childKey)]));
}

function isNodeReferenceKey(key) {
  return ['node', 'nodeId', 'masterNode', 'masterNodeId', 'controlNode', 'controlNodeId'].includes(key);
}

function mergeNodeState(keep = {}, duplicates = []) {
  const patch = {};
  for (const key of ['support', 'fix', 'spring', 'settlement']) {
    if (keep[key] != null) continue;
    const source = duplicates.find((node) => node[key] != null);
    if (source) patch[key] = source[key];
  }
  return patch;
}
