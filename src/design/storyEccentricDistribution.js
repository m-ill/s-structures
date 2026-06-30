import { buildStoryMassSummary, STORY_MASS_SUMMARY_VERSION } from '../core/storyMassSummary.js';
import { distributionRow } from './storyDistributionRow.js';

export const STORY_ECCENTRIC_DISTRIBUTION_VERSION = 'p2-t18-eccentric-story-distribution';

export function buildEccentricStoryLoadDistribution(model, options = {}) {
  const forces = Array.isArray(options) ? options : options.forces || [];
  const mass = buildStoryMassSummary(model);
  const nodes = Object.fromEntries((model?.nodes || []).map((node) => [node.id, node]));
  const rows = forces.map((force) => distributionRow(force, mass.rows, nodes)).filter(Boolean);
  return {
    version: STORY_ECCENTRIC_DISTRIBUTION_VERSION,
    storyMassVersion: STORY_MASS_SUMMARY_VERSION,
    rows,
    summary: { rowCount: rows.length },
  };
}
