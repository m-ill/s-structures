import { nodesAtStoryLevel } from './storyLevels.js';

export function diaphragmNodeIds(item, model) {
  if (Array.isArray(item.nodeIds)) return item.nodeIds;
  const story = (model?.stories || []).find((row) => row.id === item.storyId);
  if (story?.nodeIds?.length) return story.nodeIds;
  if (Number.isFinite(Number(item.z))) return nodesAtStoryLevel(model, Number(item.z)).map((node) => node.id);
  return [];
}

export function diaphragmCenter(nodes) {
  const n = nodes.length || 1;
  return {
    x: nodes.reduce((sum, node) => sum + Number(node.x || 0), 0) / n,
    y: nodes.reduce((sum, node) => sum + Number(node.y || 0), 0) / n,
  };
}
