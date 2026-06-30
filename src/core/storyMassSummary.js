import { deriveStories } from './storyModel.js';
import { buildStoryMassRows } from './storyMassRow.js';

export const STORY_MASS_SUMMARY_VERSION = 'p2-t18-story-mass-center';

export function buildStoryMassSummary(model) {
  const stories = deriveStories(model);
  const rows = buildStoryMassRows(model, stories);
  return {
    version: STORY_MASS_SUMMARY_VERSION,
    source: 'node.mass',
    storyCount: rows.length,
    totalMass: rows.reduce((sum, row) => sum + row.mass, 0),
    rows,
    limitations: [
      'Stiffness center is a column stiffness proxy, not a unit-load center of rigidity.',
      'Rows use explicit node.mass values only; design-basis seismic weight remains separate.',
    ],
  };
}
