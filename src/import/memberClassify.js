import { distance3 } from './point.js';

export function classifyMember(member, nodesById, options = {}) {
  if (member.kindHint) return { kind: member.kindHint, confidence: 0.95, reason: 'layer-map' };
  const verticalRatio = options.verticalRatio ?? 0.85;
  const horizontalRatio = options.horizontalRatio ?? 0.15;
  const a = nodesById.get(member.from);
  const b = nodesById.get(member.to);
  if (!a || !b) return { kind: 'unknown', confidence: 0, reason: 'missing-node' };
  const length = distance3(a, b);
  if (!length) return { kind: 'unknown', confidence: 0, reason: 'zero-length' };
  const dz = Math.abs(b.z - a.z);
  const ratio = dz / length;
  if (ratio >= verticalRatio) return { kind: 'column', confidence: clamp(ratio) };
  if (ratio <= horizontalRatio) return { kind: 'beam', confidence: clamp(1 - ratio) };
  return { kind: 'brace', confidence: clamp(Math.abs(ratio - 0.5) + 0.45) };
}

export function classifyMembers(members, nodes, options = {}) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return members.map((member) => ({ ...member, ...classifyMember(member, nodesById, options) }));
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
