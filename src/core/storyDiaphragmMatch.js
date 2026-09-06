export function findStoryDiaphragm(story, diaphragms) {
  const ids = new Set(story.nodeIds);
  return diaphragms.find((item) => item.nodeIds.some((id) => ids.has(id))) || null;
}
