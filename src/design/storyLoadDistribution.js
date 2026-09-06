import { nodesAtStoryLevel } from '../core/storyLevels.js';
import { distributionRow } from './storyDistributionRow.js';
import { uniformStoryDistribution } from './uniformStoryDistribution.js';

export function storyLoadDistribution(model, z, force, dir, derivation = {}, summary, options = {}) {
  if (Math.abs(force) <= 1e-9) return null;
  const nodes = nodesAtStoryLevel(model, z);
  if (!nodes.length) return null;
  const uniform = () => uniformStoryDistribution(nodes, force, dir, derivation);
  if (options.eccentricDistribution === false) return uniform();
  const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const row = distributionRow({ story: derivation.story, storyId: derivation.storyId, caseId: derivation.caseId, force, dir, basis: options.designBasis, options }, summary?.rows || [], nodeMap);
  if (!row) return uniform();
  return { ...row, method: Math.abs(row.torsionMz || 0) > 1e-9 ? 'story-eccentric' : 'uniform' };
}
