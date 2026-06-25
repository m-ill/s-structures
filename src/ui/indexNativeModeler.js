import {
  executeModelingAction,
  ensureAgentState,
  summarizeAgentModelState,
} from './indexAgentActions.js';

export const INDEX_NATIVE_MODELER_VERSION = 'm26-native-modeler-workflow';

export const NATIVE_MODELER_ACTIONS = [
  'nativeClearPage',
  'nativeSelectTool',
  'nativeDrawMember',
  'nativeAddColumn',
  'nativeSetSupport',
  'nativeAddUdl',
  'nativeAddNodalLoad',
  'nativeMoveNode',
  'nativeSelectMember',
  'nativeDeleteElement',
];

const TOOL_FOR_ACTION = {
  nativeDrawMember: 'member',
  nativeAddColumn: 'column',
  nativeSetSupport: null,
  nativeAddUdl: 'udl',
  nativeAddNodalLoad: 'pload',
  nativeMoveNode: 'smove',
  nativeSelectMember: 'smove',
  nativeDeleteElement: 'sdelete',
};

export function installIndexNativeModeler(target = globalThis, options = {}) {
  if (!target) return null;
  if (target.SStructuresNativeModeler) return target.SStructuresNativeModeler;

  const state = {
    lastAction: null,
    lastTool: activeTool(target),
    reanalysisCount: 0,
  };

  const api = {
    version: INDEX_NATIVE_MODELER_VERSION,
    actions: NATIVE_MODELER_ACTIONS.slice(),
    state,
    getState() {
      return buildNativeModelerState(target, state);
    },
    selectTool(tool) {
      state.lastTool = selectNativeTool(target, tool);
      return api.getState();
    },
    execute(action, payload = {}) {
      if (!NATIVE_MODELER_ACTIONS.includes(action)) {
        throw new Error(`Unsupported native modeler action: ${action}`);
      }
      const result = runNativeModelerAction(target, options.bridge, state, action, payload);
      state.lastAction = {
        action,
        changed: !!result.changed,
        at: new Date().toISOString(),
      };
      return {
        ...api.getState(),
        actionResult: result,
      };
    },
  };

  target.SStructuresNativeModeler = api;
  return api;
}

export function buildNativeModelerState(target = globalThis, state = {}) {
  const model = getCurrentModel(target);
  const agentState = ensureAgentState(target || {});
  return {
    version: INDEX_NATIVE_MODELER_VERSION,
    available: !!model,
    activeTool: activeTool(target),
    toolCount: target?.document?.querySelectorAll?.('[data-tool]')?.length || 0,
    lastTool: state.lastTool || null,
    lastAction: state.lastAction || null,
    model: model ? summarizeAgentModelState(model, agentState) : null,
  };
}

function runNativeModelerAction(target, bridge, state, action, payload) {
  const model = getCurrentModel(target, bridge);
  if (!model) throw new Error('Current UI model is not available.');

  if (action === 'nativeSelectTool') {
    return { changed: false, tool: selectNativeTool(target, payload.tool || payload.value || payload) };
  }

  const tool = action === 'nativeSetSupport'
    ? supportTool(payload.support || payload.value)
    : TOOL_FOR_ACTION[action];
  if (tool) state.lastTool = selectNativeTool(target, tool);

  let result;
  if (action === 'nativeClearPage') result = clearNativePage(model, target);
  else if (action === 'nativeDrawMember') result = drawNativeMember(model, target, payload);
  else if (action === 'nativeAddColumn') result = addNativeColumn(model, target, payload);
  else if (action === 'nativeSetSupport') result = setNativeSupport(model, target, payload);
  else if (action === 'nativeAddUdl') result = addNativeUdl(model, target, payload);
  else if (action === 'nativeAddNodalLoad') result = addNativeNodalLoad(model, target, payload);
  else if (action === 'nativeMoveNode') result = moveNativeNode(model, target, payload);
  else if (action === 'nativeSelectMember') result = selectNativeMember(model, target, payload);
  else if (action === 'nativeDeleteElement') result = deleteNativeElement(model, target, payload);
  else throw new Error(`Unsupported native modeler action: ${action}`);

  if (result.changed) {
    runUiAnalysis(target);
    state.reanalysisCount += 1;
  }
  return result;
}

function clearNativePage(model, target) {
  model.nodes = [];
  model.members = [];
  model.loads = [];
  const state = ensureAgentState(target);
  state.selection = { type: null, id: null };
  return { changed: true, cleared: true };
}

function drawNativeMember(model, target, payload) {
  const n1 = payload.n1 || ensureNodeAt(model, payload.start || payload.from || [0, 0, 0], payload.startNodeId).id;
  const n2 = payload.n2 || ensureNodeAt(model, payload.end || payload.to || [1, 0, 0], payload.endNodeId).id;
  const state = ensureAgentState(target);
  const actionResult = executeModelingAction(model, state, 'addMember', {
    id: payload.id,
    n1,
    n2,
    matId: payload.matId,
    secId: payload.secId,
    design: payload.design,
  });
  return { ...actionResult, changed: true, tool: 'member', createdNodeIds: [n1, n2] };
}

function addNativeColumn(model, target, payload) {
  const base = ensureNodeAt(model, payload.base || [0, 0, 0], payload.baseNodeId, {
    support: payload.support || 'fixed',
  });
  const height = finite(payload.height, payload.storyH, 3);
  const top = ensureNodeAt(model, payload.top || [base.x, base.y, (base.z || 0) + height], payload.topNodeId);
  const state = ensureAgentState(target);
  const actionResult = executeModelingAction(model, state, 'addMember', {
    id: payload.id,
    n1: base.id,
    n2: top.id,
    matId: payload.matId,
    secId: payload.secId,
    design: { role: 'column', ...(payload.design || {}) },
  });
  return { ...actionResult, changed: true, tool: 'column', baseNodeId: base.id, topNodeId: top.id };
}

function setNativeSupport(model, target, payload) {
  const support = payload.support || payload.value || 'fixed';
  selectNativeTool(target, supportTool(support));
  const state = ensureAgentState(target);
  return {
    ...executeModelingAction(model, state, 'setSupport', {
      id: payload.nodeId || payload.id,
      support,
      fix: payload.fix,
    }),
    tool: supportTool(support),
  };
}

function addNativeUdl(model, target, payload) {
  const memberId = payload.memberId || payload.member || selectedMemberId(target);
  const state = ensureAgentState(target);
  return {
    ...executeModelingAction(model, state, 'addLoad', {
      ...payload,
      type: 'udl',
      memberId,
    }),
    tool: 'udl',
  };
}

function addNativeNodalLoad(model, target, payload) {
  const nodeId = payload.nodeId || payload.node || selectedNodeId(target);
  const state = ensureAgentState(target);
  return {
    ...executeModelingAction(model, state, 'addLoad', {
      ...payload,
      type: 'nodal',
      nodeId,
    }),
    tool: 'pload',
  };
}

function moveNativeNode(model, target, payload) {
  const state = ensureAgentState(target);
  return {
    ...executeModelingAction(model, state, 'updateNode', {
      id: payload.nodeId || payload.id,
      x: payload.x,
      y: payload.y,
      z: payload.z,
    }),
    tool: 'smove',
  };
}

function selectNativeMember(model, target, payload) {
  const id = payload.memberId || payload.id;
  const state = ensureAgentState(target);
  const result = executeModelingAction(model, state, 'selectEntity', { type: 'member', id });
  target.SStructuresNativeResultControls?.showMemberResult?.(id);
  return { ...result, changed: false, tool: 'smove' };
}

function deleteNativeElement(model, target, payload) {
  const type = payload.type || inferDeleteType(payload);
  const id = payload.id || payload.memberId || payload.nodeId || payload.loadId;
  const state = ensureAgentState(target);
  if (type === 'member') return { ...executeModelingAction(model, state, 'deleteMember', { id }), tool: 'sdelete' };
  if (type === 'node') return { ...executeModelingAction(model, state, 'deleteNode', { id, deleteConnectedMembers: payload.deleteConnectedMembers }), tool: 'sdelete' };
  if (type === 'load') return { ...executeModelingAction(model, state, 'deleteLoad', { id }), tool: 'sdelete' };
  throw new Error(`Unsupported native delete type: ${type}`);
}

function selectNativeTool(target, tool) {
  const id = String(tool || '').trim();
  if (!id) throw new Error('native tool is required.');
  const doc = target?.document;
  const button = doc?.querySelector?.(`[data-tool="${cssEscape(id)}"]`);
  if (!button) throw new Error(`Native tool button not found: ${id}`);
  button.click?.();
  if (!button.classList?.contains?.('active')) {
    for (const item of doc?.querySelectorAll?.('[data-tool]') || []) item.classList?.remove?.('active');
    button.classList?.add?.('active');
  }
  return id;
}

function activeTool(target) {
  const active = [...target?.document?.querySelectorAll?.('[data-tool]') || []]
    .find((item) => item.classList?.contains?.('active'));
  return active?.getAttribute?.('data-tool') || null;
}

function ensureNodeAt(model, point, requestedId, defaults = {}) {
  const coords = normalizePoint(point);
  const existing = requestedId
    ? model.nodes.find((node) => node.id === requestedId)
    : model.nodes.find((node) => sameCoord(node.x, coords.x) && sameCoord(node.y, coords.y) && sameCoord(node.z || 0, coords.z));
  if (existing) return existing;
  const node = {
    id: requestedId || uniqueId(model.nodes, 'N'),
    x: coords.x,
    y: coords.y,
    z: coords.z,
    support: defaults.support ?? null,
  };
  model.nodes.push(node);
  return node;
}

function normalizePoint(point) {
  if (Array.isArray(point)) {
    return { x: finite(point[0], 0), y: finite(point[1], 0), z: finite(point[2], 0) };
  }
  return {
    x: finite(point?.x, 0),
    y: finite(point?.y, 0),
    z: finite(point?.z, 0),
  };
}

function selectedMemberId(target) {
  const selection = ensureAgentState(target).selection;
  return selection?.type === 'member' ? selection.id : null;
}

function selectedNodeId(target) {
  const selection = ensureAgentState(target).selection;
  return selection?.type === 'node' ? selection.id : null;
}

function inferDeleteType(payload) {
  if (payload.memberId) return 'member';
  if (payload.nodeId) return 'node';
  if (payload.loadId) return 'load';
  return 'member';
}

function supportTool(support) {
  const value = String(support || 'fixed');
  if (value === 'pin' || value === 'roller' || value === 'fixed') return value;
  return 'fixed';
}

function runUiAnalysis(target) {
  if (typeof target?.reanalyze === 'function') target.reanalyze(true);
}

function getCurrentModel(target, bridge = target?.SStructuresEngine || null) {
  return bridge?.getCurrentModel?.() || (typeof target?.model === 'function' ? target.model() : null);
}

function uniqueId(items, prefix) {
  let index = 1;
  const ids = new Set(items.map((item) => item.id));
  while (ids.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

function sameCoord(a, b) {
  return Math.abs(Number(a) - Number(b)) <= 1e-8;
}

function finite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}
