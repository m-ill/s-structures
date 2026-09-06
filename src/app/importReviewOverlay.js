import { buildModelLayerData } from '../viewer/modelLayer.js';
import { buildPickingTable } from '../viewer/picking.js';

export const IMPORT_REVIEW_OVERLAY_VERSION = 'p4-import-review-overlay-v1';

export function buildImportReviewOverlay(summary = {}, options = {}) {
  const model = candidateToModel(summary.candidate);
  const modelLayer = buildModelLayerData(model, { colorBy: 'confidence', slice: options.slice || {} });
  const pickItems = [
    ...modelLayer.nodes.map((node) => ({ type: 'node', id: node.id })),
    ...modelLayer.members.map((member) => ({ type: 'member', id: member.id })),
  ];
  const picking = buildPickingTable(pickItems);
  return {
    version: IMPORT_REVIEW_OVERLAY_VERSION,
    status: summary.status || 'pending',
    modelLayer,
    picking,
    selected: pickItems.find((item) => item.id === options.selectedId) || null,
  };
}

function candidateToModel(candidate = {}) {
  const source = candidate.candidates || {};
  return {
    nodes: (source.nodes || []).map((node) => ({ ...node })),
    members: (source.members || []).map((member) => ({
      ...member,
      n1: member.from || member.n1,
      n2: member.to || member.n2,
      role: member.kind || member.role || null,
    })),
  };
}
