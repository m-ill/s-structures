import { getStoryLevels, nodesAtStoryLevel } from './storyLevels.js';

export function deriveStories(model) {
  const info = getStoryLevels(model);
  const saved = Array.isArray(model?.stories) ? model.stories : [];
  const rows = [];
  let baseZ = info.baseZ;
  for (let i = 0; i < info.storyTops.length; i += 1) {
    const topZ = info.storyTops[i];
    const prior = pick(saved, i, topZ);
    rows.push({
      id: prior.id || `ST${i + 1}`,
      name: prior.name || `Story ${i + 1}`,
      index: i + 1,
      baseZ,
      topZ,
      height: round(topZ - baseZ),
      nodeIds: nodesAtStoryLevel(model, topZ).map((node) => node.id).filter(Boolean),
      diaphragm: prior.diaphragm || null,
    });
    baseZ = topZ;
  }
  return rows;
}

function pick(stories, index, topZ) {
  return stories.find((story) => story?.index === index + 1 || Math.abs(Number(story?.topZ) - topZ) <= 1e-6)
    || stories[index]
    || {};
}

function round(value) {
  return Number(Number(value).toFixed(6));
}
