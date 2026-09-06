import { diaphragmCenter, diaphragmNodeIds } from './diaphragmGroupSource.js';

export function resolveRigidDiaphragms(model, nodes = model?.nodes || []) {
  const ids = new Set(nodes.map((node) => node.id));
  return (model?.diaphragms || [])
    .filter((item) => item?.type === 'rigid')
    .map((item, index) => buildGroup(item, index, model, ids))
    .filter(Boolean);
}

function buildGroup(item, index, model, ids) {
  const nodeIds = diaphragmNodeIds(item, model).filter((id) => ids.has(id));
  if (nodeIds.length < 2) return null;
  const nodes = (model?.nodes || []).filter((node) => nodeIds.includes(node.id));
  return {
    id: item.id || `DIA${index + 1}`,
    type: 'rigid',
    nodeIds,
    center: item.center || diaphragmCenter(nodes),
  };
}
