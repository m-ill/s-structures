import { getStoryLevels } from './storyLevels.js';
import { STORY_MODEL_VERSION, deriveStories } from './storyModel.js';

export const STORY_SUMMARY_VERSION = 'p2-s4-story-summary';

export function buildStorySummary(model) {
  const info = getStoryLevels(model);
  const rows = deriveStories(model);
  const stored = Array.isArray(model?.stories) ? model.stories.length : null;
  const warnings = stored > 0 && stored !== rows.length
    ? [{ code: 'STORY_COUNT_STALE', message: 'Stored story count is stale.' }]
    : [];
  return {
    version: STORY_SUMMARY_VERSION,
    storyModelVersion: STORY_MODEL_VERSION,
    source: 'node-z',
    baseZ: info.baseZ,
    levels: info.levels,
    count: rows.length,
    stories: rows.map(summaryRow),
    warnings,
  };
}

function summaryRow(story) {
  const { id, name, index, baseZ, topZ, height, diaphragm } = story;
  return {
    id,
    name,
    index,
    baseZ,
    topZ,
    height,
    nodeCount: story.nodeIds.length,
    diaphragm,
  };
}
