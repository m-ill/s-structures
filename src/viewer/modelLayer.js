import { isPointInSlice, normalizeSliceBox } from './sliceControl.js';

export const MODEL_LAYER_VERSION = 'p3-m4-model-layer-v1';

export function buildModelLayerData(model = {}, options = {}) {
  const slice = normalizeSliceBox(options.slice || options);
  const nodeMap = new Map((model.nodes || []).map((node) => [node.id, node]));
  const nodes = (model.nodes || [])
    .filter((node) => isPointInSlice(node, slice))
    .map((node) => nodeRow(node, options));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const members = (model.members || [])
    .map((member) => memberRow(member, nodeMap, options))
    .filter((row) => row && (nodeIds.has(row.n1) || nodeIds.has(row.n2)));
  return {
    version: MODEL_LAYER_VERSION,
    slice,
    nodes,
    members,
    metadata: {
      inputNodeCount: (model.nodes || []).length,
      inputMemberCount: (model.members || []).length,
      nodeCount: nodes.length,
      memberCount: members.length,
      colorRule: 'role-and-confidence',
    },
  };
}

function nodeRow(node, options) {
  return {
    id: node.id,
    position: [number(node.x), number(node.y), number(node.z)],
    color: colorFor(node, options),
  };
}

function memberRow(member, nodeMap, options) {
  const a = nodeMap.get(member.n1);
  const b = nodeMap.get(member.n2);
  if (!a || !b) return null;
  return {
    id: member.id,
    n1: member.n1,
    n2: member.n2,
    role: member.design?.role || member.role || null,
    confidence: member.confidence ?? member.import?.confidence ?? null,
    points: [[number(a.x), number(a.y), number(a.z)], [number(b.x), number(b.y), number(b.z)]],
    color: colorFor(member, options),
  };
}

function colorFor(item, options) {
  if (options.colorBy === 'confidence' || item.confidence != null || item.import?.confidence != null) {
    return confidenceColor(item.confidence ?? item.import?.confidence ?? 0.5);
  }
  const role = item.design?.role || item.role;
  if (role === 'column') return [52, 118, 210];
  if (role === 'brace') return [142, 93, 178];
  if (role === 'beam') return [35, 143, 122];
  return [110, 116, 128];
}

function confidenceColor(value) {
  const confidence = number(value, 0.5);
  if (confidence >= 0.8) return [30, 160, 90];
  if (confidence >= 0.5) return [230, 170, 40];
  return [210, 70, 70];
}

function number(value, fallback = 0) {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
}
