import assert from 'node:assert/strict';
import { createTwoStoryElasticFrameModel } from '../src/index.js';
import { createProductBook, extractProductModel, productModelSignature } from '../src/ui/indexNativePersistence.js';
import { createApiClient } from '../src/app/apiClient.js';
import { createPersistenceClient } from '../src/app/persistenceClient.js';
import { createAutosaveScheduler } from '../src/app/autosaveScheduler.js';
import { pushAutosave, latestAutosave, readEntries } from '../src/app/autosaveRingBuffer.js';
import { bootTestApp, registerAndLogin } from './helpers/serverTestApp.mjs';
import { PERSISTENCE_ENVELOPE_VERSION } from '../src/platform/platformVersion.js';

assert.equal(typeof PERSISTENCE_ENVELOPE_VERSION, 'string');
assert.ok(PERSISTENCE_ENVELOPE_VERSION.startsWith('p3-'));

const model = createTwoStoryElasticFrameModel();
const signature = productModelSignature(model);

// L1/L2: existing product-book round trip (localStorage export / file export use the same shape)
const book = createProductBook(model, { title: 'Test Page' });
const roundTripL1 = extractProductModel(book);
assert.deepEqual(productModelSignature(roundTripL1), signature);

const fileJson = JSON.stringify(book);
const roundTripL2 = extractProductModel(JSON.parse(fileJson));
assert.deepEqual(productModelSignature(roundTripL2), signature);

// L3: server round trip via the persistence client
const app = await bootTestApp();
try {
  const { token } = await registerAndLogin(app);
  const api = createApiClient({ baseUrl: app.baseUrl, token });
  const persistence = createPersistenceClient(api);

  const projectResult = await api.post('/api/projects', { body: { name: 'Persistence Test' } });
  const projectId = projectResult.project.id;

  const saved = await persistence.saveToServer(projectId, model, { note: 'initial' });
  assert.equal(saved.rev, 1);
  assert.equal(saved.lineageWarning, false);
  assert.deepEqual(saved.signature, signature);

  const loaded = await persistence.loadFromServer(projectId, 1);
  assert.deepEqual(loaded.signature, signature);
  assert.equal(loaded.model.nodes.length, model.nodes.length);
  assert.equal(loaded.model.members.length, model.members.length);

  // stale schema version round trip: migration must normalize on load
  const legacyModel = { schemaVersion: 1, nodes: model.nodes, members: model.members };
  const savedLegacy = await persistence.saveToServer(projectId, legacyModel, { parentRev: 1 });
  assert.equal(savedLegacy.rev, 2);
  const loadedLegacy = await persistence.loadFromServer(projectId, 2);
  assert.equal(loadedLegacy.model.schemaVersion, 3);

  // lineage warning surfaces through the client
  const savedStale = await persistence.saveToServer(projectId, model, { parentRev: 0 });
  assert.equal(savedStale.lineageWarning, true);

  const revisions = await persistence.listRevisions(projectId);
  assert.equal(revisions.length, 3);

  // 401 handling triggers onUnauthorized callback
  let unauthorizedFired = false;
  const badApi = createApiClient({
    baseUrl: app.baseUrl, token: 'not-a-real-token',
    onUnauthorized: () => { unauthorizedFired = true; },
  });
  await assert.rejects(() => badApi.get('/api/auth/me'));
  assert.equal(unauthorizedFired, true);
} finally {
  await app.close();
}

// autosave scheduler: idle trigger + max-interval trigger under pending changes
await new Promise((resolve) => {
  let saves = [];
  const scheduler = createAutosaveScheduler((reason) => saves.push(reason), { idleMs: 20, maxIntervalMs: 60 });
  scheduler.notifyChange();
  setTimeout(() => {
    assert.deepEqual(saves, ['idle']);
    // simulate continuous changes faster than idleMs so only max-interval saves
    saves = [];
    const interval = setInterval(() => scheduler.notifyChange(), 10);
    setTimeout(() => {
      clearInterval(interval);
      scheduler.dispose();
      assert.ok(saves.includes('max-interval'), `expected a max-interval save, got ${JSON.stringify(saves)}`);
      resolve();
    }, 80);
  }, 40);
});

// autosave ring buffer keeps only the most recent 3 entries
const storage = createMemoryStorage();
for (let i = 1; i <= 5; i += 1) {
  pushAutosave(storage, 'local', { savedAt: `t${i}`, book: createProductBook(model) });
}
const entries = readEntries(storage, 'local');
assert.equal(entries.length, 3);
assert.deepEqual(entries.map((entry) => entry.savedAt), ['t3', 't4', 't5']);
assert.equal(latestAutosave(storage, 'local').savedAt, 't5');

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}

console.log(JSON.stringify({ ok: true, version: 'p3-persistence' }, null, 2));
