export const RESULT_SELECTION_STORE_VERSION = 'p7-m11-result-selection-store-v1';

export function createResultSelectionStore(initial = {}) {
  let state = normalizeResultSelection(initial);
  const subscribers = new Set();
  return {
    version: RESULT_SELECTION_STORE_VERSION,
    getState: () => clone(state),
    set(patch = {}, source = 'unknown') {
      const next = normalizeResultSelection({ ...state, ...patch });
      if (JSON.stringify(next) === JSON.stringify(state)) return clone(state);
      const previous = state;
      state = next;
      subscribers.forEach((listener) => listener(clone(state), clone(previous), source));
      return clone(state);
    },
    selectEntity(type, id, source = 'unknown') {
      return this.set({ selectedEntity: type && id ? { type, id } : null }, source);
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    reset() {
      return this.set(normalizeResultSelection({}), 'reset');
    },
  };
}

export function normalizeResultSelection(input = {}) {
  return {
    activeCaseId: nullable(input.activeCaseId),
    activeResultId: nullable(input.activeResultId),
    response: nullable(input.response),
    component: nullable(input.component),
    modeOrStep: input.modeOrStep ?? null,
    selectedEntity: input.selectedEntity?.type && input.selectedEntity?.id
      ? { type: String(input.selectedEntity.type), id: String(input.selectedEntity.id) }
      : null,
  };
}

function nullable(value) { return value == null || value === '' ? null : String(value); }
function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
