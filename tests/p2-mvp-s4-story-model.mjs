import assert from 'node:assert/strict';
import {
  STORY_MODEL_VERSION,
  STORY_SUMMARY_VERSION,
  analyzeModel,
  buildServiceabilityDriftReport,
  buildStorySummary,
  createModel,
  createTwoStoryElasticFrameModel,
  estimateModelLoads,
  getStoryLevels,
  migrateModel,
  normalizeStories,
} from '../src/index.js';
import { buildAgentManifest } from '../src/ui/agentManifest.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const nodes = [
  { id: 'B1', x: 0, y: 0, z: 0, support: 'fixed' },
  { id: 'F1', x: 0, y: 0, z: 3 },
  { id: 'R1', x: 0, y: 0, z: 6 },
];
const model = createModel({ nodes });
assert.equal(model.storyModel.version, STORY_MODEL_VERSION);
assert.equal(model.stories.length, 2);
assert.equal(model.stories[1].height, 3);
assert.deepEqual(getStoryLevels(model).storyTops, [3, 6]);

const manual = normalizeStories({ ...model, stories: [{ index: 2, topZ: 6, name: 'Roof' }] });
assert.equal(manual.stories[1].name, 'Roof');

const migrated = migrateModel({ schemaVersion: 1, nodes, members: [], loads: [] });
assert.equal(migrated.model.storyModel.version, STORY_MODEL_VERSION);
assert.equal(migrated.model.stories.length, 2);
assert.ok(migrated.migrations.some((item) => item.to === 'stories'));

const frame = createTwoStoryElasticFrameModel();
const summary = buildStorySummary(frame);
assert.equal(summary.version, STORY_SUMMARY_VERSION);
assert.equal(summary.count, 2);
assert.equal(summary.stories[0].nodeCount, 9);
assert.equal(summary.stories[1].nodeCount, 9);

const loads = estimateModelLoads(frame, {}, { generateLoads: false });
assert.equal(loads.geometry.storyLevels.length, 2);
assert.equal(loads.summary.storyCount, 2);

const analysis = analyzeModel(frame);
const drift = buildServiceabilityDriftReport(frame, analysis);
assert.equal(drift.summary.storyCount, 2);

const agent = createIndexAgentApi({ model: () => frame, reanalyze: () => {} }, {
  getLastResult: () => analysis,
});
assert.equal(agent.getStorySummary().version, STORY_SUMMARY_VERSION);

const manifest = buildAgentManifest();
assert.equal(manifest.modules.storyModel, STORY_MODEL_VERSION);
assert.ok(manifest.readApis.includes('getStorySummary'));
assert.ok(manifest.dataContracts.includes('phase2StorySummary'));

console.log(JSON.stringify({
  ok: true,
  storyModel: STORY_MODEL_VERSION,
  storySummary: STORY_SUMMARY_VERSION,
  stories: summary.count,
}, null, 2));
