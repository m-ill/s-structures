import { createWebMcpTools, WEBMCP_VERSION } from './tools.js';

// Progressive enhancement: unsupported browsers keep the ordinary modeler.
export function installWebMcp(target, bridge) {
  if (target.SStructuresWebMcp) return target.SStructuresWebMcp;
  const context = target.document?.modelContext;
  const state = { version: WEBMCP_VERSION, status: 'unsupported', registered: [], errors: [] };
  target.SStructuresWebMcp = state;
  if (target.top && target.top !== target) { state.status = 'top-level-required'; return state; }
  if (target.isSecureContext === false || typeof context?.registerTool !== 'function') return state;
  const controller = new AbortController();
  let active = true;
  const tools = createWebMcpTools({ agent: target.SStructuresAgent, bridge });
  state.status = 'registering';
  state.dispose = () => {
    active = false;
    controller.abort();
    state.status = 'disposed';
  };
  // Some implementations resolve registration only when it is removed. Never
  // await that promise before registering the rest of the tools or starting UI.
  for (const definition of tools) {
    const tool = { ...definition, execute: (args) => {
      if (!active) throw new Error('WebMCP page session is inactive.');
      return definition.execute(args);
    } };
    try {
      const registration = context.registerTool(tool, { signal: controller.signal });
      state.registered.push(tool.name);
      Promise.resolve(registration).catch((error) => {
        if (!active) return;
        state.errors.push({ tool: tool.name, message: String(error?.message || error) });
        state.status = 'registration-failed';
      });
    } catch (error) {
      state.errors.push({ tool: tool.name, message: String(error?.message || error) });
    }
  }
  state.status = state.errors.length ? 'registration-failed' : 'registered';
  // BFCache keeps this Document and its registrations alive. Normal navigation
  // destroys the document; the callback guard also stops stale invocations.
  target.addEventListener?.('pagehide', (event) => { if (!event.persisted) state.dispose(); });
  return state;
}
