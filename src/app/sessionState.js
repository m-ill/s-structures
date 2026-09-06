export const SESSION_STATE_VERSION = 'p3-session-state-v1';
export const SESSION_TOKEN_KEY = 's-structures-session-token';

export function createSessionState(options = {}) {
  const storage = options.storage || null;
  const api = options.api;
  let user = null;
  let currentProjectId = null;
  const listeners = new Set();

  function notify() {
    for (const listener of listeners) listener(getState());
  }

  function getState() {
    return { version: SESSION_STATE_VERSION, user, currentProjectId, authenticated: !!user };
  }

  function persistToken(token) {
    if (!storage) return;
    if (token) storage.setItem(SESSION_TOKEN_KEY, token);
    else storage.removeItem(SESSION_TOKEN_KEY);
  }

  return {
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getState,

    async restore() {
      const token = storage?.getItem(SESSION_TOKEN_KEY);
      if (!token) return getState();
      api.setToken(token);
      try {
        const result = await api.get('/api/auth/me');
        user = result.user;
      } catch {
        user = null;
        persistToken(null);
      }
      notify();
      return getState();
    },

    async login(email, password) {
      const result = await api.post('/api/auth/login', { body: { email, password } });
      api.setToken(result.token);
      persistToken(result.token);
      user = result.user;
      notify();
      return getState();
    },

    async logout() {
      try {
        await api.post('/api/auth/logout');
      } catch {
        // ignore network/auth errors on logout — client state is cleared regardless
      }
      api.setToken(null);
      persistToken(null);
      user = null;
      currentProjectId = null;
      notify();
      return getState();
    },

    setCurrentProject(projectId) {
      const next = projectId || null;
      if (next !== currentProjectId) {
        currentProjectId = next;
        notify();
      }
      return getState();
    },
  };
}
