import { hasDistributionCenters } from './storyDistributionCenters.js';
import { storyDistributionEccentricity } from './storyDistributionEccentricity.js';
import { buildStoryDistributionResult } from './storyDistributionResult.js';

export function distributionRow(force, stories, nodes) {
  const story = stories.find((row) => row.story === Number(force.story) || row.storyId === force.storyId);
  if (!story || !hasDistributionCenters(story)) return null;
  const storyNodes = story.nodeIds.map((id) => nodes[id]).filter(Boolean);
  const totalForce = Number(force.force ?? force.P ?? 0);
  const dir = force.dir || '+x';
  const ecc = storyDistributionEccentricity(storyNodes, story, dir, force);
  return buildStoryDistributionResult(story, storyNodes, totalForce, dir, ecc, force);
}
