import assert from 'node:assert/strict';
import {
  analyzeModel,
  createIndexStartupSampleModel,
  createModel,
} from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import {
  INDEX_AUTOSAVE_KEY,
  INDEX_NATIVE_PERSISTENCE_VERSION,
  createAutosavePayload,
  createProductBook,
  extractProductModel,
  productModelSignature,
} from '../src/ui/indexNativePersistence.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const fixture = createIndexStartupSampleModel();
const fixtureAnalysis = analyzeModel(fixture);
assert.equal(fixtureAnalysis.ok, true, JSON.stringify(fixtureAnalysis.validation.errors, null, 2));
assert.equal(fixture.nodes.length, 8);
assert.equal(fixture.members.length, 8);
assert.equal(fixture.loads.length, 2);

const fixtureSignature = productModelSignature(fixture);
const book = createProductBook(fixture, {
  savedAt: '2026-06-26T00:00:00.000Z',
  fixtureVersion: 'test-fixture',
});
assert.deepEqual(book.signature, fixtureSignature);
assert.deepEqual(productModelSignature(extractProductModel(book)), fixtureSignature);
assert.deepEqual(productModelSignature(extractProductModel({ book })), fixtureSignature);
assert.deepEqual(productModelSignature(extractProductModel(JSON.stringify(fixture))), fixtureSignature);

const autosave = createAutosavePayload(fixture, { savedAt: '2026-06-26T00:00:01.000Z' });
assert.deepEqual(autosave.signature, fixtureSignature);
assert.deepEqual(productModelSignature(extractProductModel(autosave)), fixtureSignature);

const { target, storage } = createTarget();
const bridge = installIndexEngineBridge(target);
bridge.reanalyze();

const capabilities = target.SStructuresAgent.getCapabilities();
assert.equal(capabilities.modules.nativePersistence, INDEX_NATIVE_PERSISTENCE_VERSION);
assert.ok(capabilities.dataContracts.includes('nativePersistenceBook'));
assert.ok(capabilities.milestones.some((item) => item.id === 'M27'));

let snapshot = target.SStructuresAgent.execute('loadNativeExample');
assert.equal(snapshot.nativePersistence.version, INDEX_NATIVE_PERSISTENCE_VERSION);
assert.deepEqual(snapshot.nativePersistence.model, fixtureSignature);
assert.equal(snapshot.analysis.ok, true);
assert.equal(snapshot.model.memberCount, 8);

snapshot = target.SStructuresAgent.execute('exportNativeBook', {
  savedAt: '2026-06-26T00:00:02.000Z',
});
assert.equal(snapshot.productBook.format, 's-structures-product-book');
assert.deepEqual(snapshot.productBook.signature, fixtureSignature);

target.SStructuresAgent.execute('nativeClearPage');
snapshot = target.SStructuresAgent.execute('importNativeBook', { book: snapshot.productBook });
assert.deepEqual(snapshot.nativePersistence.model, fixtureSignature);
assert.equal(snapshot.analysis.ok, true);

target.SStructuresAgent.execute('nativeClearPage');
snapshot = target.SStructuresAgent.execute('importNativeBook', fixture);
assert.deepEqual(snapshot.nativePersistence.model, fixtureSignature);
assert.equal(snapshot.model.nodeCount, 8);

snapshot = target.SStructuresAgent.execute('saveNativeAutosave', {
  savedAt: '2026-06-26T00:00:03.000Z',
});
assert.equal(snapshot.persistence.saved, true);
assert.equal(snapshot.persistence.autosave.available, true);
assert.equal(storage.has(INDEX_AUTOSAVE_KEY), true);

target.SStructuresAgent.execute('nativeClearPage');
assert.equal(target.SStructuresAgent.getSnapshot().model.nodeCount, 0);
snapshot = target.SStructuresAgent.execute('restoreNativeAutosave');
assert.equal(snapshot.persistence.restored, true);
assert.deepEqual(snapshot.nativePersistence.model, fixtureSignature);
assert.equal(snapshot.analysis.ok, true);

console.log(JSON.stringify({
  ok: true,
  version: INDEX_NATIVE_PERSISTENCE_VERSION,
  nodes: fixtureSignature.nodeCount,
  members: fixtureSignature.memberCount,
  loads: fixtureSignature.loadCount,
  autosaveKey: INDEX_AUTOSAVE_KEY,
}, null, 2));

function createTarget() {
  const document = createFakeIndexDocument();
  buildNativeIndexShell(document);
  const model = createModel();
  let result = null;
  const storage = new Map();
  const target = {
    document,
    location: { search: '' },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    model: () => model,
    activeResult: () => result?.pDelta?.envelope || result?.envelope || null,
    reanalyze: () => {
      result = target.analyzeModel(model);
      document.getElementById('statusTxt').textContent = result.ok ? 'OK' : 'NG';
      document.getElementById('statusChip').textContent = result.ok ? 'OK' : 'NG';
      target.draw();
      return result;
    },
    draw: () => {},
    getComputedStyle(element) {
      return {
        display: element.style?.display || 'block',
        visibility: element.style?.visibility || 'visible',
      };
    },
  };
  document.defaultView = target;
  return { target, storage };
}
