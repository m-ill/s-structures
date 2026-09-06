export function createFakeWindow() {
  const listeners = new Map();
  let hash = '';
  const location = {
    get hash() { return hash; },
    set hash(value) {
      const normalized = value.startsWith('#') ? value : `#${value}`;
      if (normalized === hash) return;
      hash = normalized;
      for (const handler of listeners.get('hashchange') || []) handler({ type: 'hashchange' });
    },
  };
  return {
    location,
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type);
      if (!list) return;
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    },
    dispatchEvent(event) {
      const nextEvent = { ...event, target: event?.target || this };
      for (const handler of listeners.get(nextEvent.type) || []) handler(nextEvent);
      return true;
    },
  };
}
