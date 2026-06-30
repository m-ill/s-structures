import { findStoryDiaphragm } from './storyDiaphragmMatch.js';
import { storyEccentricity } from './storyMassEccentricity.js';
import { storyStiffnessProxy } from './storyStiffnessProxy.js';
import { nodeMassValue, weightedCenter } from './storyMassValues.js';

export function buildStoryMassRow(model, story, nodes, diaphragms) {
  const storyNodes = story.nodeIds.map((id) => nodes[id]).filter(Boolean);
  const cm = weightedCenter(storyNodes, nodeMassValue);
  const diaphragm = findStoryDiaphragm(story, diaphragms);
  const stiffness = storyStiffnessProxy(model, story);
  return {
    story: story.index,
    storyId: story.id,
    z: story.topZ,
    nodeIds: story.nodeIds,
    nodeCount: storyNodes.length,
    mass: cm.total,
    massCenter: { x: cm.x, y: cm.y },
    diaphragmCenter: diaphragm?.center || null,
    stiffnessCenter: stiffness,
    eccentricity: storyEccentricity(cm, diaphragm?.center, stiffness),
  };
}
