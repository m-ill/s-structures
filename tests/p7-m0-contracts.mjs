import assert from 'node:assert/strict';
import {
  RESULT_DIMENSION_CONTRACT_VERSION,
  SCHEMA_VERSION,
  assertResultDimension,
  createPracticeModel,
  dimensionedValue,
  migrateModel,
  sourceCanAutoApply,
  validateModel,
  validateSourceRecord,
} from '../src/index.js';

assert.equal(SCHEMA_VERSION, 6);
assert.equal(RESULT_DIMENSION_CONTRACT_VERSION, 'p8-m1-result-dimensions-v2');

const practice = createPracticeModel();
assert.equal(practice.schemaVersion, 6);
assert.equal(practice.projectSetup.status, 'load-setup-required');
assert.deepEqual(practice.loadCombinations, []);
assert.deepEqual(practice.loadCases.map((item) => item.id), ['D-SW', 'D-SDL', 'L']);
assert.deepEqual(practice.loadCases.map((item) => item.family), ['D', 'D', 'L']);
assert.equal(validateModel(practice).ok, true);

const draftSource = {
  id: 'KDS-DRAFT', authority: 'MOLIT', code: 'KDS 41', edition: '2026-draft',
  publicationStatus: 'draft', verificationStatus: 'verified', sourceHash: 'abc', sourceUrls: ['https://example.invalid/draft'],
};
assert.equal(validateSourceRecord(draftSource).ok, true);
assert.equal(sourceCanAutoApply(draftSource), false);
assert.equal(sourceCanAutoApply({
  ...draftSource,
  id: 'KDS-EFFECTIVE',
  publicationStatus: 'effective',
  effectiveDate: '2022-10-11',
  amendmentsReviewed: ['none through 2026-07-10'],
  verifiedAt: '2026-07-10T00:00:00.000Z',
}), true);

assert.equal(validateSourceRecord({ ...draftSource, sourceUrls: 'https://example.invalid/not-an-array' }).ok, false);
assert.equal(validateModel(createPracticeModel({ sourceRegistry: [
  { ...draftSource, id: 'DUP', amendmentsReviewed: ['none'], verifiedAt: '2026-07-10' },
  { ...draftSource, id: 'DUP', amendmentsReviewed: ['none'], verifiedAt: '2026-07-10' },
] })).ok, false);

assert.equal(assertResultDimension(dimensionedValue(12.3, 'force'), 'force', 'baseShear'), 12.3);
assert.throws(
  () => assertResultDimension(dimensionedValue(0.02, 'length'), 'force', 'baseShear'),
  (error) => error.code === 'RESULT_DIMENSION_MISMATCH',
);
assert.deepEqual(dimensionedValue(5, 'force', { value: 999, dimension: 'length', source: 'fixture' }), {
  source: 'fixture', value: 5, dimension: 'force',
});

const legacy = {
  schemaVersion: 3,
  materials: [{ id: 'steel', name: 'Steel SS400', E: 205000, G: 79000, Fy: 235, Fu: 400, density: 7.85 }],
  sections: [{ id: 'h300', A: 0.01, Iy: 1e-4, Iz: 2e-4, J: 1e-6 }],
  nodes: [], members: [], loads: [], stories: [], diaphragms: [], analysisCases: [],
  loadCases: [{ id: 'D', name: 'Dead', type: 'dead' }, { id: 'L', name: 'Live', type: 'live' }],
  loadCombinations: [{ id: 'CO1', name: '1.0D + 1.0L', type: 'strength', factors: { D: 1, L: 1 } }],
};
const first = migrateModel(legacy);
assert.equal(first.model.schemaVersion, 6);
assert.equal(first.model.materials[0].Fy, 235);
assert.equal(first.model.materials[0].name, 'Steel SS400');
assert.deepEqual(first.model.loadCombinations.map((combo) => combo.id), ['KDS22-ST-01', 'KDS22-ST-02']);
assert.ok(first.model.loadCombinations.every((combo) => combo.status === 'candidate'));
assert.equal(first.model.projectSetup.status, 'legacy-unreviewed');
assert.ok(Array.isArray(first.model.massSources));
assert.ok(Array.isArray(first.model.sourceRegistry));

const second = migrateModel(first.model);
assert.deepEqual(second.model.loadCombinations, first.model.loadCombinations);
assert.equal(second.changed, false);

const currentManual = createPracticeModel({
  loadCases: [{ id: 'D', name: 'Dead', type: 'dead' }, { id: 'L', name: 'Live', type: 'live' }],
  loadCombinations: [{
    id: 'CO1', name: 'Project manual 1.0D + 1.0L', type: 'strength', factors: { D: 1, L: 1 }, origin: 'manual', userModified: true,
  }],
});
const currentManualRoundTrip = migrateModel(currentManual);
assert.equal(currentManualRoundTrip.model.loadCombinations.length, 1);
assert.equal(currentManualRoundTrip.model.loadCombinations[0].id, 'CO1');
assert.equal(currentManualRoundTrip.model.loadCombinations[0].origin, 'manual');

const currentUnmarked = createPracticeModel({
  loadCases: currentManual.loadCases,
  loadCombinations: [{ id: 'CO1', name: 'Imported current-schema combination', type: 'strength', factors: { D: 1, L: 1 } }],
});
assert.equal(migrateModel(currentUnmarked).model.loadCombinations[0].id, 'CO1');

assert.throws(
  () => migrateModel({ ...first.model, schemaVersion: SCHEMA_VERSION + 1 }),
  (error) => error.code === 'FUTURE_SCHEMA_VERSION',
);

const explicitEmpty = migrateModel(createPracticeModel({
  materials: [], sections: [], loadCases: [], loadCombinations: [], sourceRegistry: [], massSources: [],
}));
for (const key of ['materials', 'sections', 'loadCases', 'loadCombinations', 'sourceRegistry', 'massSources']) {
  assert.deepEqual(explicitEmpty.model[key], [], `${key} explicit empty collection must survive migration`);
}
const normalizedCurrent = createPracticeModel({ nodes: [{ id: 'N', x: 0, y: 0, z: '0', support: null }] });
assert.equal(migrateModel(normalizedCurrent).changed, true, 'normalization must report an actual structural change');

const configuredEmpty = createPracticeModel({ projectSetup: { status: 'draft' } });
const emptyRoundTrip = migrateModel(configuredEmpty);
assert.deepEqual(emptyRoundTrip.model.loadCombinations, []);
assert.equal(emptyRoundTrip.model.projectSetup.status, 'draft');

console.log(JSON.stringify({
  ok: true,
  schemaVersion: SCHEMA_VERSION,
  practiceCases: practice.loadCases.map((item) => item.id),
  migratedCombinationIds: first.model.loadCombinations.map((combo) => combo.id),
  dimensionMismatchBlocked: true,
}, null, 2));
