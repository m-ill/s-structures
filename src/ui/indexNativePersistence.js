import { migrateToV3 } from '../core/migration.js';
import { createIndexStartupSampleModel, INDEX_STARTUP_SAMPLE_VERSION } from '../examples/indexStartupSample.js';

export const INDEX_NATIVE_PERSISTENCE_VERSION = 'm27-native-persistence';
export const INDEX_AUTOSAVE_KEY = 's-structures-autosave-v3';
export const PRODUCT_BOOK_FORMAT = 's-structures-product-book';

export function installIndexNativePersistence(target = globalThis, options = {}) {
  if (!target) return null;
  if (target.SStructuresNativePersistence) return target.SStructuresNativePersistence;

  const api = {
    version: INDEX_NATIVE_PERSISTENCE_VERSION,
    autosaveKey: INDEX_AUTOSAVE_KEY,
    fixtureVersion: INDEX_STARTUP_SAMPLE_VERSION,
    getState() {
      return buildNativePersistenceState(target);
    },
    createExample() {
      return createIndexStartupSampleModel();
    },
    loadExample() {
      const model = createIndexStartupSampleModel();
      replaceLiveModel(target, options.bridge, model);
      return api.getState();
    },
    exportBook(exportOptions = {}) {
      return createProductBook(getCurrentModel(target, options.bridge), exportOptions);
    },
    importBook(input) {
      const model = extractProductModel(input);
      replaceLiveModel(target, options.bridge, model);
      return api.getState();
    },
    saveAutosave(saveOptions = {}) {
      const payload = createAutosavePayload(getCurrentModel(target, options.bridge), saveOptions);
      writeAutosave(target, payload);
      return { ...api.getState(), saved: true, autosave: summarizeAutosave(payload) };
    },
    restoreAutosave() {
      const payload = readAutosave(target);
      if (!payload) throw new Error('Native autosave is not available.');
      const model = extractProductModel(payload);
      replaceLiveModel(target, options.bridge, model);
      return { ...api.getState(), restored: true, autosave: summarizeAutosave(payload) };
    },
    readAutosave() {
      const payload = readAutosave(target);
      return payload ? summarizeAutosave(payload) : { available: false };
    },
  };

  target.SStructuresNativePersistence = api;
  return api;
}

export function buildNativePersistenceState(target = globalThis) {
  const model = getCurrentModel(target);
  const autosave = readAutosave(target);
  return {
    version: INDEX_NATIVE_PERSISTENCE_VERSION,
    fixtureVersion: INDEX_STARTUP_SAMPLE_VERSION,
    autosaveKey: INDEX_AUTOSAVE_KEY,
    model: model ? productModelSignature(model) : null,
    autosave: autosave ? summarizeAutosave(autosave) : { available: false },
  };
}

export function createProductBook(inputModel, options = {}) {
  const model = migrateToV3(inputModel);
  const savedAt = options.savedAt || new Date().toISOString();
  const pageId = options.pageId || 'page-1';
  return {
    format: PRODUCT_BOOK_FORMAT,
    version: 1,
    savedAt,
    activePageId: pageId,
    fixtureVersion: options.fixtureVersion || null,
    pages: [{
      id: pageId,
      title: options.title || 'Page 1',
      model: cloneJson(model),
      strokes: cloneJson(options.strokes || []),
      images: cloneJson(options.images || []),
    }],
    signature: productModelSignature(model),
  };
}

export function createAutosavePayload(inputModel, options = {}) {
  const savedAt = options.savedAt || new Date().toISOString();
  const book = createProductBook(inputModel, {
    ...options,
    savedAt,
  });
  return {
    savedAt,
    book,
    signature: book.signature,
  };
}

export function extractProductModel(input) {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  const source = parsed?.book || parsed;
  if (!source) throw new Error('No product model data.');
  if (source.model) return migrateToV3(source.model);
  if (Array.isArray(source.pages)) {
    const page = source.pages.find((item) => item.id === source.activePageId)
      || source.pages[source.cur || 0]
      || source.pages[0];
    if (page?.model) return migrateToV3(page.model);
  }
  if (Array.isArray(source.nodes) && Array.isArray(source.members)) return migrateToV3(source);
  throw new Error('Unsupported product model payload.');
}

export function productModelSignature(inputModel) {
  const model = migrateToV3(inputModel);
  return {
    schemaVersion: model.schemaVersion || null,
    nodeCount: model.nodes?.length || 0,
    memberCount: model.members?.length || 0,
    loadCount: model.loads?.length || 0,
    loadCaseCount: model.loadCases?.length || 0,
    combinationCount: model.loadCombinations?.length || 0,
    nodeIds: (model.nodes || []).map((item) => item.id).sort(),
    memberIds: (model.members || []).map((item) => item.id).sort(),
    loadIds: (model.loads || []).map((item) => item.id).sort(),
    bounds: modelBounds(model),
  };
}

function replaceLiveModel(target, bridge, nextModel) {
  const current = getCurrentModel(target, bridge);
  if (!current) throw new Error('Current UI model is not available.');
  const migrated = migrateToV3(nextModel);
  for (const key of Object.keys(current)) delete current[key];
  Object.assign(current, migrated);
  if (typeof target?.reanalyze === 'function') target.reanalyze(true);
  return current;
}

function getCurrentModel(target, bridge = target?.SStructuresEngine || null) {
  return bridge?.getCurrentModel?.() || (typeof target?.model === 'function' ? target.model() : null);
}

function writeAutosave(target, payload) {
  target?.localStorage?.setItem?.(INDEX_AUTOSAVE_KEY, JSON.stringify(payload));
}

function readAutosave(target) {
  try {
    const text = target?.localStorage?.getItem?.(INDEX_AUTOSAVE_KEY);
    return text ? JSON.parse(text) : null;
  } catch (_error) {
    return null;
  }
}

function summarizeAutosave(payload) {
  if (!payload) return { available: false };
  return {
    available: true,
    savedAt: payload.savedAt || payload.book?.savedAt || null,
    signature: payload.signature || payload.book?.signature || productModelSignature(extractProductModel(payload)),
  };
}

function modelBounds(model) {
  const nodes = model.nodes || [];
  if (!nodes.length) return null;
  const xs = nodes.map((node) => Number(node.x) || 0);
  const ys = nodes.map((node) => Number(node.y) || 0);
  const zs = nodes.map((node) => Number(node.z) || 0);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
