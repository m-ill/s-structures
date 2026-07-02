import { deriveStories } from './storyModel.js';
import { buildStoryMassRows } from './storyMassRow.js';
import { buildMassSourceTrace } from '../loads/loadsV2.js';

export const STORY_MASS_SUMMARY_VERSION = 'p2-t18-story-mass-center';

export function buildStoryMassSummary(model) {
  const stories = deriveStories(model);
  const massSource = model?.analysisSettings?.massSource || null;
  const massTrace = massSource ? buildMassSourceTrace(model, massSource) : null;
  const massByNode = massTrace ? Object.fromEntries(massTrace.rows.map((row) => [row.node, row.mass])) : null;
  const rows = buildStoryMassRows(model, stories, massByNode);
  return {
    version: STORY_MASS_SUMMARY_VERSION,
    source: massTrace ? 'analysisSettings.massSource' : 'node.mass',
    massSourceVersion: massTrace?.version || null,
    storyCount: rows.length,
    totalMass: rows.reduce((sum, row) => sum + row.mass, 0),
    rows,
    limitations: [
      'Stiffness center is a column stiffness proxy, not a unit-load center of rigidity.',
      massTrace
        ? 'Rows use the active massSource trace; design-basis seismic weight remains separately auditable.'
        : 'Rows use explicit node.mass values only; design-basis seismic weight remains separate.',
    ],
  };
}
