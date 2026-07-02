import { createModel } from '../core/model.js';

export const IMPORT_CANDIDATE_MODEL_VERSION = 'p3-m9-import-candidate-model-v1';

export function importCandidateToModel(candidate, options = {}) {
  const model = createModel();
  const nodes = candidate?.candidates?.nodes || [];
  const members = candidate?.candidates?.members || [];
  const minZ = Math.min(...nodes.map((n) => n.z || 0));
  model.nodes = nodes.map((n) => ({
    id: n.id, x: n.x, y: n.y, z: n.z || 0,
    support: Math.abs((n.z || 0) - minZ) <= 1e-6 ? 'fixed' : null,
  }));
  const secId = options.secId || model.sections[0]?.id || 'box400h';
  model.members = members.map((m, i) => ({
    id: m.id || `M${i + 1}`, type: 'frame', n1: m.from, n2: m.to,
    matId: options.matId || 'steel', secId,
    releases: { i: 'rigid', j: 'rigid' },
    design: { role: m.kind || 'unknown' },
  }));
  addMinimalLoads(model, options);
  model.meta = { ...(model.meta || {}), importSource: candidate?.source?.type || 'import' };
  return model;
}

function addMinimalLoads(model, options) {
  const topZ = Math.max(...model.nodes.map((n) => n.z || 0));
  const top = model.nodes.filter((n) => Math.abs((n.z || 0) - topZ) <= 1e-6);
  top.forEach((node, index) => model.loads.push({
    id: `PCD${index + 1}`, type: 'nodal', node: node.id,
    P: options.topDeadLoad ?? 1, dir: '-z', case: 'D',
    source: 'pointcloud-import-e2e',
  }));
}
