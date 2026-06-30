import { deriveStories } from './storyDerive.js';

export const STORY_MODEL_VERSION = 'p2-s4-story-model';
export { deriveStories } from './storyDerive.js';

export function normalizeStories(model) {
  const stories = deriveStories(model);
  return { ...model, stories, storyModel: { version: STORY_MODEL_VERSION, source: 'node-z', count: stories.length } };
}
