export const AUTOSAVE_SCHEDULER_VERSION = 'p3-autosave-scheduler-v1';

/**
 * Triggers `save()` after `idleMs` of no further changes, but never lets
 * more than `maxIntervalMs` pass without a save while changes are pending
 * (PERSISTENCE_PLAN.md M3-2).
 */
export function createAutosaveScheduler(save, options = {}) {
  const idleMs = options.idleMs ?? 5000;
  const maxIntervalMs = options.maxIntervalMs ?? 60000;
  const setTimer = options.setTimeout || setTimeout;
  const clearTimer = options.clearTimeout || clearTimeout;

  let idleHandle = null;
  let maxHandle = null;
  let pending = false;
  let saveCount = 0;

  function runSave(reason) {
    clearTimer(idleHandle);
    clearTimer(maxHandle);
    idleHandle = null;
    maxHandle = null;
    pending = false;
    saveCount += 1;
    save(reason);
  }

  return {
    version: AUTOSAVE_SCHEDULER_VERSION,
    notifyChange() {
      pending = true;
      clearTimer(idleHandle);
      idleHandle = setTimer(() => runSave('idle'), idleMs);
      if (!maxHandle) {
        maxHandle = setTimer(() => runSave('max-interval'), maxIntervalMs);
      }
    },
    flush() {
      if (pending) runSave('flush');
    },
    dispose() {
      clearTimer(idleHandle);
      clearTimer(maxHandle);
      idleHandle = null;
      maxHandle = null;
      pending = false;
    },
    get pending() { return pending; },
    get saveCount() { return saveCount; },
  };
}
