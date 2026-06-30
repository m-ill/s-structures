export const STORY_LEVELS_VERSION = 'p2-s4-story-levels';
export const STORY_TOLERANCE = 1e-6;

export function getStoryLevels(model) {
  const levels = unique((model?.nodes || []).map((node) => zOf(node))).sort((a, b) => a - b);
  const baseZ = levels[0] ?? 0;
  const storyTops = levels.filter((z) => z > baseZ + STORY_TOLERANCE);
  return {
    version: STORY_LEVELS_VERSION,
    baseZ,
    levels,
    storyTops,
    storyCount: storyTops.length,
  };
}

export function nodesAtStoryLevel(model, z) {
  return (model?.nodes || []).filter((node) => Math.abs(zOf(node) - z) <= STORY_TOLERANCE);
}

function unique(values) {
  return [...new Set(values.map((value) => Number(value.toFixed(6))))];
}

function zOf(node) {
  const z = Number(node?.z || 0);
  return Number.isFinite(z) ? z : 0;
}
