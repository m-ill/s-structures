export const AUTOSAVE_RING_KEY_PREFIX = 's-structures-autosave-ring-';
export const AUTOSAVE_RING_SIZE = 3;

/**
 * Keeps the most recent AUTOSAVE_RING_SIZE autosave payloads in a storage-like
 * object (localStorage or a test double with getItem/setItem/removeItem).
 * PERSISTENCE_PLAN.md M3-2: "최근 3개 링 버퍼".
 */
export function pushAutosave(storage, scope, payload, size = AUTOSAVE_RING_SIZE) {
  const entries = readEntries(storage, scope);
  entries.push({ savedAt: payload.savedAt || new Date().toISOString(), payload });
  while (entries.length > size) entries.shift();
  storage.setItem(ringKey(scope), JSON.stringify(entries));
  return entries;
}

export function readEntries(storage, scope) {
  try {
    const raw = storage.getItem(ringKey(scope));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function latestAutosave(storage, scope) {
  const entries = readEntries(storage, scope);
  return entries.at(-1) || null;
}

export function ringKey(scope) {
  return `${AUTOSAVE_RING_KEY_PREFIX}${scope || 'local'}`;
}
