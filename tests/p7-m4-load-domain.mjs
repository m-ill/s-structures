import assert from 'node:assert/strict';
import {
  DESIGN_BASIS_CHANGE_SET_VERSION,
  LOAD_CASE_FAMILY_IDS,
  MASS_SOURCE_DEFINITION_VERSION,
  applyDesignBasisLoads,
  applyDesignBasisChangeSet,
  createMassSourceDefinition,
  createPracticeModel,
  createTwoStoryElasticFrameModel,
  previewDesignBasisChangeSet,
  validateModel,
} from '../src/index.js';

const model = createPracticeModel();
const input = {
  occupancy: 'office',
  designMethod: 'strength',
  deadLoad: 5.1,
  liveLoad: 2.6,
  seismicLiveLoadFactor: 0.25,
  earthPressure: 18,
  familyStates: {
    H: 'confirmed',
    S: 'not-applicable',
    R: 'unconfigured',
    EQUIPMENT: 'not-applicable',
  },
  storyOccupancies: [
    { story: 'S1', occupancy: 'office', liveLoad: 2.6, inputState: 'confirmed' },
    { story: 'S2', occupancy: 'storage', liveLoad: 4.0, inputState: 'confirmed' },
  ],
};

assert.deepEqual(LOAD_CASE_FAMILY_IDS, [
  'D', 'L', 'Lr', 'S', 'R', 'W', 'E', 'H', 'T', 'F', 'EQUIPMENT', 'CONSTRUCTION', 'OTHER',
]);

const beforePreview = structuredClone(model);
const preview = previewDesignBasisChangeSet(model, input, { includeLoadPreview: false });
assert.equal(preview.version, DESIGN_BASIS_CHANGE_SET_VERSION);
assert.deepEqual(model, beforePreview, 'preview must not mutate the model');
assert.equal(preview.errors.length, 0);
assert.ok(preview.loadCases.proposed.some((item) => item.id === 'D-SW' && item.variant === 'selfWeight'));
assert.ok(preview.loadCases.proposed.some((item) => item.id === 'D-SDL' && item.variant === 'superimposed'));
assert.ok(preview.loadCases.proposed.some((item) => item.id === 'H' && item.family === 'H'));
assert.ok(!preview.loadCases.proposed.some((item) => item.family === 'S'));
assert.ok(!preview.loadCases.proposed.some((item) => item.family === 'R'));
assert.equal(preview.designBasis.after.inputStates.deadLoad, 'confirmed');
assert.equal(preview.designBasis.after.familyStates.S, 'not-applicable');
assert.equal(preview.designBasis.after.familyStates.R, 'unconfigured');
assert.equal(preview.designBasis.after.floorUsages.length, 2);

const massSource = preview.next.massSources[0];
assert.equal(massSource.version, MASS_SOURCE_DEFINITION_VERSION);
assert.ok(Array.isArray(massSource.components));
assert.ok(massSource.components.some((item) => item.kind === 'self-weight' && item.caseId === 'D-SW'));
assert.deepEqual(massSource.combos, [
  { case: 'D-SDL', factor: 1 },
  { case: 'L', factor: 0.25 },
]);

const deduplicated = createMassSourceDefinition({
  id: 'MS-DEDUP',
  entries: [
    { case: 'D-SDL', factor: 1 },
    { case: 'D-SDL', factor: 1 },
    { case: 'L', factor: 0.25 },
  ],
});
assert.equal(deduplicated.entries.length, 2);
assert.equal(deduplicated.deduplication.duplicateCount, 1);
assert.equal(deduplicated.components.filter((item) => item.kind === 'load-case').length, 2);

applyDesignBasisChangeSet(model, preview);
assert.equal(validateModel(model).ok, true, JSON.stringify(validateModel(model).errors, null, 2));
assert.equal(model.projectSetup.status, 'draft');
assert.equal(new Set(model.loadCases.map((item) => item.id)).size, model.loadCases.length);
assert.equal(new Set(model.massSources.map((item) => item.generatedKey)).size, model.massSources.length);

const repeat = previewDesignBasisChangeSet(model, input, { includeLoadPreview: false });
assert.equal(repeat.loadCases.create.length, 0);
assert.equal(repeat.loadCases.update.length, 0);
assert.equal(repeat.massSources.create.length, 0);
assert.equal(repeat.massSources.update.length, 0);

const protectedCase = model.loadCases.find((item) => item.id === 'D-SDL');
protectedCase.name = 'Engineer-edited SDL';
protectedCase.userModified = true;
const protectedPreview = previewDesignBasisChangeSet(model, { ...input, deadLoad: 5.4 }, { includeLoadPreview: false });
assert.ok(protectedPreview.conflicts.some((item) => item.id === 'D-SDL'));
applyDesignBasisChangeSet(model, protectedPreview);
assert.equal(model.loadCases.find((item) => item.id === 'D-SDL').name, 'Engineer-edited SDL');

const stalePreview = previewDesignBasisChangeSet(model, { ...input, windPressureX: 0.85 }, { includeLoadPreview: false });
const protectedAfterPreview = model.loadCases.find((item) => item.id === 'WX');
protectedAfterPreview.name = 'Engineer-edited wind case';
protectedAfterPreview.userModified = true;
const staleApply = applyDesignBasisChangeSet(model, stalePreview);
assert.ok(staleApply.conflicts.some((item) => item.id === 'WX'));
assert.equal(model.loadCases.find((item) => item.id === 'WX').name, 'Engineer-edited wind case');

const beforeBlockedApply = structuredClone(model);
const blocked = previewDesignBasisChangeSet(model, {
  ...input,
  massSource: {
    entries: [
      { case: 'D-SDL', factor: 1 },
      { case: 'D-SDL', factor: 0.8 },
    ],
  },
}, { includeLoadPreview: false });
assert.equal(blocked.status, 'blocked');
assert.throws(() => applyDesignBasisChangeSet(model, blocked), (error) => error.code === 'DESIGN_BASIS_CHANGE_SET_BLOCKED');
assert.deepEqual(model, beforeBlockedApply, 'blocked apply must be atomic');

const estimationModel = createTwoStoryElasticFrameModel();
estimationModel.loads = [];
applyDesignBasisLoads(estimationModel, { occupancy: 'office' });
const generatedKeys = estimationModel.loads.map((load) => load.generatedKey).sort();
estimationModel.members.reverse();
applyDesignBasisLoads(estimationModel, { occupancy: 'office' });
assert.deepEqual(estimationModel.loads.map((load) => load.generatedKey).sort(), generatedKeys);
assert.equal(new Set(estimationModel.loads.map((load) => load.id)).size, estimationModel.loads.length);

console.log(JSON.stringify({
  ok: true,
  version: DESIGN_BASIS_CHANGE_SET_VERSION,
  loadCases: model.loadCases.length,
  massComponents: model.massSources[0].components.length,
  protectedConflicts: protectedPreview.conflicts.length,
}, null, 2));
