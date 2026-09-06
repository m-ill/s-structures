import assert from 'node:assert/strict';
import { createModel } from '../src/core/modelFactory.js';
import { SCHEMA_VERSION } from '../src/core/schema.js';
import {
  INDEX_AUTOSAVE_KEY,
  INDEX_LEGACY_AUTOSAVE_KEYS,
  installIndexNativePersistence,
} from '../src/ui/indexNativePersistence.js';

const legacyModel = createModel();
legacyModel.schemaVersion = 3;
delete legacyModel.massSources;
delete legacyModel.sourceRegistry;
delete legacyModel.designBasis;
delete legacyModel.projectSetup;

const storage = new Map();
storage.set(INDEX_AUTOSAVE_KEY, '{corrupt');
storage.set(INDEX_LEGACY_AUTOSAVE_KEYS[0], JSON.stringify({
  savedAt: '2026-07-10T00:00:00.000Z',
  book: {
    format: 's-structures-product-book',
    activePageId: 'page-1',
    pages: [{ id: 'page-1', model: legacyModel }],
  },
}));

const liveModel = createModel({ nodes: [{ id: 'temporary', x: 0, y: 0, z: 0 }] });
let rejectReanalysis = false;
const target = {
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
  reanalyze: () => {
    if (rejectReanalysis) throw new Error('fixture reanalysis failure');
    return { ok: true };
  },
};
const bridge = { getCurrentModel: () => liveModel };
const api = installIndexNativePersistence(target, { bridge });

assert.equal(api.readAutosave().available, true);
const restored = api.restoreAutosave();
assert.equal(restored.restored, true);
assert.equal(liveModel.schemaVersion, SCHEMA_VERSION);
assert.equal(liveModel.projectSetup.status, 'legacy-unreviewed');
assert.ok(Array.isArray(liveModel.massSources));
assert.ok(Array.isArray(liveModel.sourceRegistry));

const duplicateSource = {
  id: 'DUP', authority: 'MOLIT', code: 'KDS', edition: '2022',
  publicationStatus: 'draft', verificationStatus: 'candidate', sourceUrls: [], amendmentsReviewed: [],
};
storage.set(INDEX_AUTOSAVE_KEY, JSON.stringify({ book: {
  activePageId: 'page-1', pages: [{ id: 'page-1', model: createModel({ sourceRegistry: [duplicateSource, duplicateSource] }) }],
} }));
assert.equal(api.readAutosave().available, true, 'invalid current autosave must fall back to valid legacy data');

const beforeRollback = structuredClone(liveModel);
rejectReanalysis = true;
assert.throws(
  () => api.importBook(createModel({ nodes: [{ id: 'replacement', x: 1, y: 2, z: 3 }] })),
  (error) => error.code === 'NATIVE_PERSISTENCE_ROLLBACK',
);
assert.deepEqual(liveModel, beforeRollback, 'failed persistence commit must restore the complete live model');
rejectReanalysis = false;

api.saveAutosave({ savedAt: '2026-07-10T00:00:01.000Z' });
assert.equal(storage.has(INDEX_AUTOSAVE_KEY), true);

console.log(JSON.stringify({
  ok: true,
  restoredFrom: INDEX_LEGACY_AUTOSAVE_KEYS[0],
  savedTo: INDEX_AUTOSAVE_KEY,
  schemaVersion: liveModel.schemaVersion,
}, null, 2));
