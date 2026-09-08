import { PMM_INTERACTION_CACHE_VERSION } from '../../metadata/numericVersions.js';
export { PMM_INTERACTION_CACHE_VERSION };
import { stableHash } from '../../core/stableHash.js';
import { validatePmmSurface } from './pmmSurface.js';


export const PMM_INTERACTION_CACHE_DB = 's-structures-fiber-pmm-cache-v2';

export function createPmmInteractionCache(options = {}) {
  const memory = new Map();
  const adapter = options.adapter || createDefaultAdapter(options);
  const maxMemoryEntries = Math.max(1, Math.trunc(Number(options.maxMemoryEntries ?? 64)));
  const counters = {
    memoryHits: 0,
    persistentHits: 0,
    misses: 0,
    writes: 0,
    invalidEntries: 0,
    memoryEvictions: 0,
    persistentErrors: 0,
  };
  const remember = (key, record) => {
    if (memory.has(key)) memory.delete(key);
    memory.set(key, record);
    while (memory.size > maxMemoryEntries) {
      memory.delete(memory.keys().next().value);
      counters.memoryEvictions += 1;
    }
    return record;
  };

  return Object.freeze({
    version: PMM_INTERACTION_CACHE_VERSION,
    persistent: adapter.kind !== 'memory',
    adapterKind: adapter.kind,
    async get(cacheKey, expectedIdentity = null) {
      const key = requiredKey(cacheKey);
      if (memory.has(key)) {
        const record = memory.get(key);
        const validation = validateCacheRecord(record, key, expectedIdentity);
        if (!validation.ok) {
          memory.delete(key);
          counters.invalidEntries += 1;
          counters.misses += 1;
          return null;
        }
        counters.memoryHits += 1;
        return remember(key, record).interaction;
      }
      let record;
      try {
        record = await adapter.get(key);
      } catch {
        counters.persistentErrors += 1;
        counters.misses += 1;
        return null;
      }
      if (!record) {
        counters.misses += 1;
        return null;
      }
      const validation = validateCacheRecord(record, key, expectedIdentity);
      if (!validation.ok) {
        counters.invalidEntries += 1;
        counters.misses += 1;
        try { await adapter.delete(key); }
        catch { counters.persistentErrors += 1; }
        return null;
      }
      const frozenRecord = deepFreeze(clone(record));
      remember(key, frozenRecord);
      counters.persistentHits += 1;
      return frozenRecord.interaction;
    },
    async set(cacheKey, interaction, cacheIdentity) {
      const key = requiredKey(cacheKey);
      const identity = requiredIdentity(cacheIdentity, key);
      const validation = validateInteraction(interaction, key, identity);
      if (!validation.ok) throw cacheError('PMM_CACHE_INTERACTION_INVALID', 'Only a validated M6 fiber PMM interaction can be cached.', validation);
      const snapshot = clone(interaction);
      const now = new Date().toISOString();
      const record = {
        version: PMM_INTERACTION_CACHE_VERSION,
        cacheKey: key,
        identity,
        identityHash: stableHash(identity),
        interaction: snapshot,
        payloadHash: stableHash(snapshot),
        sourceHash: interaction.surface.sourceHash,
        surfaceHash: interaction.surface.surfaceHash,
        createdAt: now,
      };
      const frozenRecord = deepFreeze(clone(record));
      remember(key, frozenRecord);
      try { await adapter.set(key, record); }
      catch { counters.persistentErrors += 1; }
      counters.writes += 1;
      return frozenRecord.interaction;
    },
    async delete(cacheKey) {
      const key = requiredKey(cacheKey);
      memory.delete(key);
      await adapter.delete(key);
    },
    async clear() {
      memory.clear();
      await adapter.clear();
    },
    clearMemory() {
      memory.clear();
    },
    stats() {
      return Object.freeze({
        ...counters,
        memoryEntries: memory.size,
        maxMemoryEntries,
        persistent: adapter.kind !== 'memory',
        adapterKind: adapter.kind,
      });
    },
  });
}

export function createMemoryPmmCacheAdapter(initialRecords = []) {
  const records = new Map(initialRecords.map((record) => [String(record.cacheKey), clone(record)]));
  return Object.freeze({
    kind: 'memory',
    async get(key) {
      return records.has(key) ? clone(records.get(key)) : null;
    },
    async set(key, record) {
      records.set(key, clone(record));
    },
    async delete(key) {
      records.delete(key);
    },
    async clear() {
      records.clear();
    },
    snapshot() {
      return clone([...records.values()]);
    },
  });
}

export function createIndexedDbPmmCacheAdapter(options = {}) {
  const indexedDb = options.indexedDB || globalThis.indexedDB;
  if (!indexedDb || typeof indexedDb.open !== 'function') return createMemoryPmmCacheAdapter();
  const databaseName = String(options.databaseName || PMM_INTERACTION_CACHE_DB);
  const storeName = String(options.storeName || 'interactions');
  let databasePromise = null;
  const database = () => {
    databasePromise ||= new Promise((resolve, reject) => {
      const request = indexedDb.open(databaseName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName, { keyPath: 'cacheKey' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(cacheError('PMM_CACHE_OPEN_FAILED', 'IndexedDB PMM cache could not be opened.', request.error));
      request.onblocked = () => reject(cacheError('PMM_CACHE_OPEN_BLOCKED', 'IndexedDB PMM cache upgrade is blocked.'));
    });
    return databasePromise;
  };
  const request = async (mode, operation) => {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let result;
      try {
        result = operation(store);
      } catch (error) {
        reject(error);
        return;
      }
      transaction.oncomplete = () => resolve(result?.result ?? null);
      transaction.onerror = () => reject(cacheError('PMM_CACHE_TRANSACTION_FAILED', 'IndexedDB PMM cache transaction failed.', transaction.error));
      transaction.onabort = () => reject(cacheError('PMM_CACHE_TRANSACTION_ABORTED', 'IndexedDB PMM cache transaction was aborted.', transaction.error));
    });
  };
  return Object.freeze({
    kind: 'indexeddb',
    get: (key) => request('readonly', (store) => store.get(key)),
    set: (_key, record) => request('readwrite', (store) => store.put(clone(record))),
    delete: (key) => request('readwrite', (store) => store.delete(key)),
    clear: () => request('readwrite', (store) => store.clear()),
  });
}

export function validatePmmInteractionCacheRecord(record, expectedCacheKey = null, expectedIdentity = null) {
  return validateCacheRecord(record, expectedCacheKey, expectedIdentity);
}

function createDefaultAdapter(options) {
  if (options.persistent === false) return createMemoryPmmCacheAdapter();
  return createIndexedDbPmmCacheAdapter(options);
}

function validateCacheRecord(record, expectedCacheKey, expectedIdentity = null) {
  const errors = [];
  if (!record || typeof record !== 'object') errors.push('record-required');
  if (record?.version !== PMM_INTERACTION_CACHE_VERSION) errors.push('version-mismatch');
  if (expectedCacheKey && record?.cacheKey !== expectedCacheKey) errors.push('cache-key-mismatch');
  let identityHash = null;
  try {
    identityHash = record?.identity ? stableHash(record.identity) : null;
  } catch {
    errors.push('identity-not-serializable');
  }
  if (!record?.identity || !record?.identityHash) errors.push('identity-required');
  if (identityHash !== record?.identityHash) errors.push('identity-hash-mismatch');
  if (record?.identityHash !== record?.cacheKey) errors.push('identity-cache-key-mismatch');
  if (expectedIdentity) {
    let expectedIdentityHash = null;
    try { expectedIdentityHash = stableHash(expectedIdentity); }
    catch { errors.push('expected-identity-not-serializable'); }
    if (expectedIdentityHash !== expectedCacheKey) errors.push('expected-identity-cache-key-mismatch');
    if (identityHash !== expectedIdentityHash) errors.push('expected-identity-mismatch');
  }
  const interactionValidation = validateInteraction(
    record?.interaction,
    expectedCacheKey || record?.cacheKey,
    record?.identity,
  );
  if (!interactionValidation.ok) errors.push(...interactionValidation.errors);
  let payloadHash = null;
  try {
    payloadHash = record?.interaction ? stableHash(record.interaction) : null;
  } catch {
    errors.push('payload-not-serializable');
  }
  if (!record?.payloadHash || payloadHash !== record.payloadHash) errors.push('payload-hash-mismatch');
  if (record?.surfaceHash !== record?.interaction?.surface?.surfaceHash) errors.push('surface-hash-mismatch');
  if (record?.sourceHash !== record?.interaction?.surface?.sourceHash) errors.push('source-hash-mismatch');
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)]) });
}

function validateInteraction(interaction, expectedCacheKey = null, expectedIdentity = null) {
  const errors = [];
  if (!interaction || typeof interaction !== 'object') errors.push('interaction-required');
  if (interaction?.version !== 'p8-m6-member-fiber-interaction-v1') errors.push('interaction-version-mismatch');
  const surfaceValidation = interaction?.surface ? validatePmmSurface(interaction.surface) : { ok: false };
  if (!surfaceValidation.ok) errors.push('surface-invalid');
  if (!interaction?.mesh?.geometryHash) errors.push('mesh-hash-required');
  if (!interaction?.source?.cacheKey || !interaction?.source?.cacheIdentityHash) errors.push('interaction-cache-identity-required');
  if (expectedCacheKey && interaction?.source?.cacheKey !== expectedCacheKey) errors.push('interaction-cache-key-mismatch');
  if (expectedCacheKey && interaction?.source?.cacheIdentityHash !== expectedCacheKey) errors.push('interaction-identity-hash-mismatch');
  if (expectedIdentity) {
    if (interaction?.source?.materialRef !== (expectedIdentity.matId ?? null)) errors.push('interaction-material-ref-mismatch');
    if (interaction?.source?.sectionRef !== (expectedIdentity.secId ?? null)) errors.push('interaction-section-ref-mismatch');
    if (interaction?.source?.materialSourceHash !== stableHash(expectedIdentity.materialSnapshot)) errors.push('interaction-material-source-mismatch');
    if (interaction?.source?.sectionSourceHash !== stableHash(expectedIdentity.sectionSnapshot)) errors.push('interaction-section-source-mismatch');
    const reinforcementHash = expectedIdentity.reinforcementSnapshot == null
      ? null
      : stableHash(expectedIdentity.reinforcementSnapshot);
    if ((interaction?.source?.reinforcementHash ?? null) !== reinforcementHash) errors.push('interaction-reinforcement-source-mismatch');
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors), surfaceValidation });
}

function requiredIdentity(value, expectedKey) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw cacheError('PMM_CACHE_IDENTITY_REQUIRED', 'PMM cache writes require a canonical source identity.');
  }
  const snapshot = clone(value);
  if (stableHash(snapshot) !== expectedKey) {
    throw cacheError('PMM_CACHE_IDENTITY_MISMATCH', 'PMM cache identity does not match the requested cache key.');
  }
  return snapshot;
}

function requiredKey(value) {
  const key = String(value || '').trim();
  if (!key) throw cacheError('PMM_CACHE_KEY_REQUIRED', 'PMM interaction cache key is required.');
  return key;
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cacheError(code, message, details = null) {
  const error = new Error(message);
  error.name = 'PmmInteractionCacheError';
  error.code = code;
  error.details = details;
  return error;
}
