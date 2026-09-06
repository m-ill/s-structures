import { migrateToCurrent } from '../core/migration.js';
import { validateModel } from '../core/validation.js';
import { stableHash } from '../core/stableHash.js';
import { createIndexStartupSampleModel, INDEX_STARTUP_SAMPLE_VERSION } from '../examples/indexStartupSample.js';

export const INDEX_NATIVE_PERSISTENCE_VERSION = 'p8-m0-native-persistence-v5';
export const INDEX_AUTOSAVE_KEY = 's-structures-autosave-v5';
export const INDEX_LEGACY_AUTOSAVE_KEYS = Object.freeze(['s-structures-autosave-v4', 's-structures-autosave-v3']);
export const PRODUCT_BOOK_FORMAT = 's-structures-product-book';

export function installIndexNativePersistence(target = globalThis, options = {}) {
  if (!target) return null;
  if (target.SStructuresNativePersistence) return target.SStructuresNativePersistence;

  const api = {
    version: INDEX_NATIVE_PERSISTENCE_VERSION,
    autosaveKey: INDEX_AUTOSAVE_KEY,
    fixtureVersion: INDEX_STARTUP_SAMPLE_VERSION,
    getState() {
      return buildNativePersistenceState(target, options.bridge);
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

export function buildNativePersistenceState(target = globalThis, bridge = target?.SStructuresEngine || null) {
  const model = getCurrentModel(target, bridge);
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
  const model = prepareProductModel(inputModel);
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
  let inputModel = null;
  if (source.model) inputModel = source.model;
  if (Array.isArray(source.pages)) {
    const page = source.pages.find((item) => item.id === source.activePageId)
      || source.pages[source.cur || 0]
      || source.pages[0];
    if (page?.model) inputModel = page.model;
  }
  if (!inputModel && Array.isArray(source.nodes) && Array.isArray(source.members)) inputModel = source;
  if (!inputModel) throw new Error('Unsupported product model payload.');
  const model = prepareProductModel(inputModel);
  verifyEmbeddedSignature(model, source.signature || parsed?.signature || null);
  return model;
}

export function productModelSignature(inputModel) {
  const model = prepareProductModel(inputModel);
  return signatureForPreparedModel(model);
}

function signatureForPreparedModel(model) {
  return {
    version: 2,
    algorithm: 'SHA-256',
    digest: stableHash(model),
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

function verifyEmbeddedSignature(model, expected) {
  if (!expected?.digest) return;
  const actual = signatureForPreparedModel(model);
  if (String(expected.algorithm || '').toUpperCase() !== 'SHA-256' || expected.digest !== actual.digest) {
    const error = new Error('Product model signature mismatch. The saved payload may be incomplete or modified.');
    error.code = 'PRODUCT_MODEL_SIGNATURE_MISMATCH';
    error.expected = expected;
    error.actual = actual;
    throw error;
  }
}

function replaceLiveModel(target, bridge, nextModel) {
  const current = getCurrentModel(target, bridge);
  if (!current) throw new Error('Current UI model is not available.');
  const migrated = prepareProductModel(nextModel);
  const previous = cloneJson(current);
  try {
    replaceObject(current, migrated);
    const analysis = typeof target?.reanalyze === 'function' ? target.reanalyze(true) : null;
    if (analysis?.ok === false) throw new Error('Reanalysis rejected the restored model.');
    return current;
  } catch (cause) {
    replaceObject(current, previous);
    const error = new Error(`Native persistence commit failed; live model was restored. ${cause?.message || ''}`.trim());
    error.code = 'NATIVE_PERSISTENCE_ROLLBACK';
    error.cause = cause;
    throw error;
  }
}

function getCurrentModel(target, bridge = target?.SStructuresEngine || null) {
  return bridge?.getCurrentModel?.() || (typeof target?.model === 'function' ? target.model() : null);
}

function writeAutosave(target, payload) {
  target?.localStorage?.setItem?.(INDEX_AUTOSAVE_KEY, JSON.stringify(payload));
}

function readAutosave(target) {
  const keys = [INDEX_AUTOSAVE_KEY, ...INDEX_LEGACY_AUTOSAVE_KEYS];
  for (const key of keys) {
    try {
      const text = target?.localStorage?.getItem?.(key);
      if (!text) continue;
      const payload = JSON.parse(text);
      extractProductModel(payload);
      return payload;
    } catch (_error) {
      // A corrupt newer autosave must not hide a recoverable legacy payload.
    }
  }
  return null;
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

function prepareProductModel(inputModel) {
  const model = migrateToCurrent(inputModel);
  const validation = validateModel(model);
  if (!validation.ok) {
    const error = new Error(`Product model validation failed: ${validation.errors.map((item) => item.code).join(', ')}.`);
    error.code = 'PRODUCT_MODEL_INVALID';
    error.validation = validation;
    throw error;
  }
  return model;
}

function replaceObject(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, cloneJson(source));
}
