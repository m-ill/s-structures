import {
  AGENT_COMMAND_MESSAGE_TYPE,
  AGENT_RESPONSE_MESSAGE_TYPE,
} from '../ui/indexAgentCommandBridge.js';

export const MODELER_BRIDGE_VERSION = 'p4-m7-modeler-bridge-v1';

export function createModelerBridge({ window, iframe, timeoutMs = 3000 } = {}) {
  const target = iframe?.contentWindow;
  if (!window?.addEventListener || !target?.postMessage) {
    return createUnavailableBridge('Native modeler frame is not ready.');
  }
  const pending = new Map();
  let disposed = false;
  let origin;
  try {
    origin = new URL(iframe.src || iframe.getAttribute?.('src'), window.location.href).origin;
    if (!/^https?:\/\//.test(origin) || origin !== window.location.origin) throw new Error('Cross-origin modeler');
  } catch {
    return createUnavailableBridge('Modeler requires a same-origin HTTP(S) frame.');
  }

  function onMessage(event) {
    if (disposed || event?.origin !== origin || event.source !== target) return;
    const data = event?.data || null;
    if (data?.type !== AGENT_RESPONSE_MESSAGE_TYPE) return;
    const response = data.response || data.detail || data;
    const item = pending.get(response?.id);
    if (!item) return;
    pending.delete(response.id);
    window.clearTimeout?.(item.timer);
    if (response.ok) item.resolve(response.data);
    else item.reject(new Error(response.error?.message || 'Modeler command failed.'));
  }

  window.addEventListener('message', onMessage);

  function request(method, payload = {}, options = {}) {
    if (disposed) return Promise.reject(new Error('Modeler bridge disposed.'));
    const id = options.id || `modeler-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (pending.has(id)) return Promise.reject(new Error('Duplicate modeler request id.'));
    const command = {
      id,
      method: method === 'execute' ? 'execute' : String(method),
      action: options.action || null,
      payload,
    };
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout?.(() => {
        pending.delete(id);
        reject(new Error(`Modeler command timed out: ${command.method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        target.postMessage({ type: AGENT_COMMAND_MESSAGE_TYPE, command }, origin);
      } catch (error) {
        pending.delete(id);
        window.clearTimeout?.(timer);
        reject(error);
      }
    });
  }

  return {
    version: MODELER_BRIDGE_VERSION,
    request,
    getModel() {
      return request('getModel');
    },
    setModel(model) {
      return request('execute', { model }, { action: 'setModel' });
    },
    dispose() {
      disposed = true;
      window.removeEventListener?.('message', onMessage);
      for (const item of pending.values()) {
        window.clearTimeout?.(item.timer);
        item.reject(new Error('Modeler bridge disposed.'));
      }
      pending.clear();
    },
  };
}

function createUnavailableBridge(message) {
  const fail = () => Promise.reject(new Error(message));
  return {
    version: MODELER_BRIDGE_VERSION,
    request: fail,
    getModel: fail,
    setModel: fail,
    dispose() {},
  };
}
