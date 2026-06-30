import { resolveRigidDiaphragms } from './diaphragmGroups.js';
import { buildStoryMassRow } from './storyMassRowBuild.js';

export function buildStoryMassRows(model, stories) {
  const nodes = Object.fromEntries((model?.nodes || []).map((node) => [node.id, node]));
  const diaphragms = resolveRigidDiaphragms(model);
  return stories.map((story) => buildStoryMassRow(model, story, nodes, diaphragms));
}
