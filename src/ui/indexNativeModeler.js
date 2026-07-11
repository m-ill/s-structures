import {
  executeModelingAction,
  ensureAgentState,
  summarizeAgentModelState,
} from './indexAgentActions.js';
import {
  commitModelTransaction,
  undoModelTransaction,
} from '../modeling/transaction.js';
import {
  applyPhase7LibraryImport,
  assignPhase7LibraryToMembers,
  buildPhase7LibraryUsage,
  clonePhase7LibraryDefinition,
  createPhase7LibraryDefinition,
  exportPhase7Library,
  listPhase7Library,
  previewPhase7LibraryDefinition,
  previewPhase7LibraryImport,
  validatePhase7LibraryReferences,
} from './phase7LibraryWorkflow.js';
import {
  applyPhase7CopyStory,
  applyPhase7GridStory,
  applyPhase7ModelRepairs,
  previewPhase7CopyStory,
  previewPhase7GridStory,
  previewPhase7ModelRepairs,
  selectPhase7ModelEntities,
} from './phase7ModelingWorkflow.js';
import {
  currentPaletteReferences,
  installIndexSectionLibraryPanel,
} from './indexSectionLibraryPanel.js';

export const INDEX_NATIVE_MODELER_VERSION = 'm26-native-modeler-workflow';

export const NATIVE_MODELER_ACTIONS = [
  'nativeClearPage',
  'nativeSelectTool',
  'nativeDrawMember',
  'nativeAddColumn',
  'nativeSetSupport',
  'nativeSetSpringSupport',
  'nativeSetSettlement',
  'nativeAddUdl',
  'nativeAddPartialLoad',
  'nativeAddTemperatureLoad',
  'nativeAddNodalLoad',
  'nativeSetMemberBehavior',
  'nativeMoveNode',
  'nativeSelectMember',
  'nativeDeleteElement',
];

export const PHASE7_NATIVE_MODELER_COMMANDS = Object.freeze([
  'listLibrary',
  'previewLibraryDefinition',
  'createLibraryDefinition',
  'cloneLibraryDefinition',
  'getLibraryUsage',
  'validateLibraryReferences',
  'assignLibraryToMembers',
  'exportLibrary',
  'previewLibraryImport',
  'importLibrary',
  'previewGridStory',
  'applyGridStory',
  'previewCopyStory',
  'applyCopyStory',
  'selectMembersByFilter',
  'selectNodesByFilter',
  'inspectModelGeometry',
  'previewModelRepairs',
  'applyModelRepairs',
  'undoModelChange',
]);

const TOOL_FOR_ACTION = {
  nativeDrawMember: 'member',
  nativeAddColumn: 'column',
  nativeSetSupport: null,
  nativeSetSpringSupport: 'spring',
  nativeSetSettlement: 'settle',
  nativeAddUdl: 'udl',
  nativeAddPartialLoad: 'udl',
  nativeAddTemperatureLoad: 'temp',
  nativeAddNodalLoad: 'pload',
  nativeSetMemberBehavior: 'smove',
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
    transactionHistory: [],
    lastPreview: null,
    selection: { memberIds: [], nodeIds: [] },
  };

  const api = {
    version: INDEX_NATIVE_MODELER_VERSION,
    actions: NATIVE_MODELER_ACTIONS.slice(),
    commands: [...PHASE7_NATIVE_MODELER_COMMANDS],
    state,
    getState() {
      return buildNativeModelerState(target, state);
    },
    selectTool(tool) {
      state.lastTool = selectNativeTool(target, tool);
      return api.getState();
    },
    execute(action, payload = {}) {
      if (!NATIVE_MODELER_ACTIONS.includes(action) && !PHASE7_NATIVE_MODELER_COMMANDS.includes(action)) {
        throw new Error(`Unsupported native modeler action: ${action}`);
      }
      const result = NATIVE_MODELER_ACTIONS.includes(action)
        ? runNativeModelerAction(target, options.bridge, state, action, payload)
        : runPhase7NativeModelerCommand(target, options.bridge, state, action, payload);
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
    executeCommand(command, payload = {}) {
      return api.execute(command, payload).actionResult;
    },
    undo() {
      return api.executeCommand('undoModelChange');
    },
  };

  target.SStructuresNativeModeler = api;
  if (target.document?.createElement) {
    markLegacySteelPalette(target.document);
    installIndexSectionLibraryPanel(target, api);
    installSpringSupportTool(target, api);
    installLoadCaseManagerControls(target);
    installAdvancedLoadConditionControls(target, api);
  }
  return api;
}

function markLegacySteelPalette(doc) {
  const select = doc.getElementById?.('matSel');
  if (!select?.querySelectorAll) return;
  for (const option of select.querySelectorAll('option')) {
    const label = String(option.textContent || '');
    if (!/SS400|SM490/.test(label) || label.includes('구규격')) continue;
    option.textContent = `${label} (구규격)`;
    option.title = '기존 프로젝트 호환용 재료명';
  }
  select.setAttribute?.('data-phase7-library-status', 'legacy-quick-palette');
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
    phase7: {
      undoDepth: state.transactionHistory?.length || 0,
      lastPreview: summarizePhase7Preview(state.lastPreview),
      selection: {
        memberIds: [...(state.selection?.memberIds || [])],
        nodeIds: [...(state.selection?.nodeIds || [])],
      },
    },
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
  else if (action === 'nativeSetSpringSupport') result = setNativeSpringSupport(model, target, payload);
  else if (action === 'nativeSetSettlement') result = setNativeSettlement(model, target, payload);
  else if (action === 'nativeAddUdl') result = addNativeUdl(model, target, payload);
  else if (action === 'nativeAddPartialLoad') result = addNativePartialLoad(model, target, payload);
  else if (action === 'nativeAddTemperatureLoad') result = addNativeTemperatureLoad(model, target, payload);
  else if (action === 'nativeAddNodalLoad') result = addNativeNodalLoad(model, target, payload);
  else if (action === 'nativeSetMemberBehavior') result = setNativeMemberBehavior(model, target, payload);
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

function runPhase7NativeModelerCommand(target, bridge, state, command, payload = {}) {
  const model = getCurrentModel(target, bridge);
  if (!model) throw new Error('Current UI model is not available.');
  const options = payload && typeof payload === 'object' ? { ...payload, ...(payload.options || {}) } : {};
  const libraryKind = phase7LibraryKind(payload);
  const definition = phase7DefinitionPayload(payload);
  let result;

  if (command === 'listLibrary') result = listPhase7Library(model, options);
  else if (command === 'previewLibraryDefinition') {
    result = previewPhase7LibraryDefinition(libraryKind, definition, options);
    rememberPhase7Preview(state, command, result);
  } else if (command === 'createLibraryDefinition') {
    result = createPhase7LibraryDefinition(model, libraryKind, definition, options);
    result = commitPhase7Transaction(target, bridge, state, result);
  } else if (command === 'cloneLibraryDefinition') {
    result = clonePhase7LibraryDefinition(
      model,
      libraryKind,
      payload.ref || payload.sourceRef,
      definition,
      options,
    );
    result = commitPhase7Transaction(target, bridge, state, result);
  } else if (command === 'getLibraryUsage') result = buildPhase7LibraryUsage(model);
  else if (command === 'validateLibraryReferences') result = validatePhase7LibraryReferences(model, options);
  else if (command === 'assignLibraryToMembers') {
    result = assignPhase7LibraryToMembers(model, options);
    result = commitPhase7Transaction(target, bridge, state, result);
  } else if (command === 'exportLibrary') result = exportPhase7Library(model, options);
  else if (command === 'previewLibraryImport') {
    const input = phase7ImportPayload(payload);
    result = previewPhase7LibraryImport(model, input, options);
    rememberPhase7Preview(state, command, result);
  } else if (command === 'importLibrary') {
    const supplied = phase7ImportPayload(payload);
    const input = payload.preview || supplied || phase7PreviewFor(state, 'previewLibraryImport');
    result = applyPhase7LibraryImport(model, input, options);
    result = commitPhase7Transaction(target, bridge, state, result);
  } else if (command === 'previewGridStory') {
    result = previewPhase7GridStory(model, payload.input || payload.gridStory || payload, options);
    rememberPhase7Preview(state, command, result);
  } else if (command === 'applyGridStory') {
    const supplied = payload.input || payload.gridStory || (!phase7PayloadIsEmpty(payload) ? payload : null);
    const input = payload.preview || supplied || phase7PreviewFor(state, 'previewGridStory');
    result = applyPhase7GridStory(model, input, options);
    result = commitPhase7Transaction(target, bridge, state, result);
  } else if (command === 'previewCopyStory') {
    result = previewPhase7CopyStory(model, options);
    rememberPhase7Preview(state, command, result);
  } else if (command === 'applyCopyStory') {
    const input = payload.preview || (!phase7PayloadIsEmpty(payload) ? options : null) || phase7PreviewFor(state, 'previewCopyStory');
    result = applyPhase7CopyStory(model, input, options);
    result = commitPhase7Transaction(target, bridge, state, result);
  } else if (command === 'selectMembersByFilter') {
    result = selectPhase7ModelEntities(model, { ...options, type: 'member' });
    syncPhase7Selection(target, state, result);
  } else if (command === 'selectNodesByFilter') {
    result = selectPhase7ModelEntities(model, { ...options, type: 'node' });
    syncPhase7Selection(target, state, result);
  } else if (command === 'inspectModelGeometry' || command === 'previewModelRepairs') {
    result = previewPhase7ModelRepairs(model, options);
    rememberPhase7Preview(state, 'previewModelRepairs', result);
    if (command === 'inspectModelGeometry') result = { ...result, changeSet: undefined };
  } else if (command === 'applyModelRepairs') {
    const input = payload.preview || (!phase7PayloadIsEmpty(payload) ? options : null) || phase7PreviewFor(state, 'previewModelRepairs');
    result = applyPhase7ModelRepairs(model, input, options);
    result = commitPhase7Transaction(target, bridge, state, result);
  } else if (command === 'undoModelChange') result = undoPhase7Transaction(target, bridge, state, model);
  else throw new Error(`Unsupported Phase 7 native modeler command: ${command}`);

  return result;
}

function commitPhase7Transaction(target, bridge, state, result) {
  if (!result?.ok || !result.changed) return result;
  const model = getCurrentModel(target, bridge);
  if (!commitModelTransaction(model, result)) {
    return { ok: false, changed: false, model, errors: ['model-transaction-commit-failed'] };
  }
  state.transactionHistory.push(result.transaction);
  if (state.transactionHistory.length > 100) state.transactionHistory.shift();
  bridge?.markAnalysisCasesStale?.('phase7-model-transaction');
  runUiAnalysis(target);
  state.reanalysisCount += 1;
  return { ...result, model, committed: true, undoDepth: state.transactionHistory.length };
}

function undoPhase7Transaction(target, bridge, state, model) {
  const transaction = state.transactionHistory[state.transactionHistory.length - 1];
  if (!transaction) return { ok: false, changed: false, model, errors: ['undo-history-empty'] };
  const result = undoModelTransaction(model, transaction);
  if (!result.ok || !commitModelTransaction(model, result)) return result;
  state.transactionHistory.pop();
  bridge?.markAnalysisCasesStale?.('phase7-model-transaction-undo');
  runUiAnalysis(target);
  state.reanalysisCount += 1;
  return {
    ...result,
    model,
    committed: true,
    undoneTransaction: { id: transaction.id, name: transaction.name },
    undoDepth: state.transactionHistory.length,
  };
}

function syncPhase7Selection(target, state, result) {
  const key = result.type === 'node' ? 'nodeIds' : 'memberIds';
  state.selection[key] = [...result.ids];
  const otherKey = result.type === 'node' ? 'memberIds' : 'nodeIds';
  state.selection[otherKey] = [];
  const agentState = ensureAgentState(target);
  agentState.multiSelection = { type: result.type, ids: [...result.ids] };
  agentState.selection = result.ids.length ? { type: result.type, id: result.ids[0] } : { type: null, id: null };
  target.SStructuresResultSelection?.selectEntity?.(
    result.ids.length === 1 ? result.type : null,
    result.ids.length === 1 ? result.ids[0] : null,
    'native-modeler',
  );
}

function rememberPhase7Preview(state, command, result) {
  state.lastPreview = { command, result };
}

function phase7PreviewFor(state, command) {
  return state.lastPreview?.command === command && state.lastPreview.result?.ok
    ? state.lastPreview.result
    : null;
}

function summarizePhase7Preview(value) {
  if (!value) return null;
  const result = value.result || {};
  const detail = result.preview
    || result.summary
    || result.plan?.summary
    || result.inspection?.summary
    || result.imported
    || null;
  return {
    command: String(value.command || ''),
    ok: result.ok === true,
    preview: clonePhase7StateSummary(detail),
    errorCount: Array.isArray(result.errors) ? result.errors.length : 0,
    warningCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
  };
}

function clonePhase7StateSummary(value) {
  if (value == null) return null;
  try {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return { unavailable: true };
  }
}

function phase7LibraryKind(payload = {}) {
  const explicit = payload?.libraryKind || payload?.recordType || payload?.collection;
  const envelopeKind = ['material', 'materials', 'section', 'sections'].includes(String(payload?.kind || '').toLowerCase())
    ? payload.kind
    : null;
  if (explicit || envelopeKind) return explicit || envelopeKind;
  const record = payload?.record || payload?.definition || payload || {};
  return record.shape || record.params || record.properties || record.A != null ? 'section' : 'material';
}

function phase7DefinitionPayload(payload = {}) {
  if (payload?.record || payload?.definition) return payload.record || payload.definition;
  if (!payload || typeof payload !== 'object') return {};
  const record = { ...payload };
  for (const key of ['options', 'libraryKind', 'recordType', 'collection', 'ref', 'sourceRef', 'preview', 'input', 'bundle', 'data']) delete record[key];
  if (['material', 'materials', 'section', 'sections'].includes(String(record.kind || '').toLowerCase())) delete record.kind;
  if (!record.id && record.newId) record.id = record.newId;
  delete record.newId;
  return record;
}

function phase7ImportPayload(payload) {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return null;
  if (payload.input != null) return payload.input;
  if (payload.bundle != null) return payload.bundle;
  if (payload.data != null) return payload.data;
  if (payload.materials || payload.sections || payload.version) return payload;
  return null;
}

function phase7PayloadIsEmpty(payload) {
  if (!payload || typeof payload !== 'object') return true;
  return Object.keys(payload).every((key) => key === 'options');
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
  const palette = currentPaletteReferences(target);
  const actionResult = executeModelingAction(model, state, 'addMember', {
    id: payload.id,
    n1,
    n2,
    matId: payload.matId || palette.matId,
    secId: payload.secId || palette.secId,
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
  const palette = currentPaletteReferences(target);
  const actionResult = executeModelingAction(model, state, 'addMember', {
    id: payload.id,
    n1: base.id,
    n2: top.id,
    matId: payload.matId || palette.matId,
    secId: payload.secId || palette.secId,
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
      spring: payload.spring,
      clearSpring: payload.clearSpring,
    }),
    tool: supportTool(support),
  };
}

function setNativeSpringSupport(model, target, payload) {
  selectNativeTool(target, 'spring');
  const state = ensureAgentState(target);
  return {
    ...executeModelingAction(model, state, 'setSpringSupport', {
      id: payload.nodeId || payload.id,
      spring: payload.spring || payload,
    }),
    tool: 'spring',
  };
}

function setNativeSettlement(model, target, payload) {
  selectNativeTool(target, 'settle');
  const state = ensureAgentState(target);
  return {
    ...executeModelingAction(model, state, 'setSettlement', {
      id: payload.nodeId || payload.id,
      settlement: payload.settlement || payload,
    }),
    tool: 'settle',
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

function addNativePartialLoad(model, target, payload) {
  const memberId = payload.memberId || payload.member || selectedMemberId(target);
  const state = ensureAgentState(target);
  return {
    ...executeModelingAction(model, state, 'addPartialLoad', {
      ...payload,
      memberId,
      type: payload.type || payload.loadType,
    }),
    tool: 'udl',
  };
}

function addNativeTemperatureLoad(model, target, payload) {
  const memberId = payload.memberId || payload.member || selectedMemberId(target);
  const state = ensureAgentState(target);
  return {
    ...executeModelingAction(model, state, 'addTemperatureLoad', {
      ...payload,
      memberId,
      type: payload.type || payload.loadType,
    }),
    tool: 'temp',
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

function setNativeMemberBehavior(model, target, payload) {
  const memberId = payload.memberId || payload.id || selectedMemberId(target);
  const state = ensureAgentState(target);
  return {
    ...executeModelingAction(model, state, 'setMemberBehavior', {
      id: memberId,
      type: payload.type || payload.behavior,
    }),
    tool: 'smove',
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
  if (value === 'pin' || value === 'roller' || value === 'fixed' || value === 'spring') return value;
  return 'fixed';
}

function installSpringSupportTool(target, api) {
  const doc = target?.document;
  const palette = doc?.getElementById?.('palette');
  if (palette && !palette.querySelector?.('[data-tool="spring"]')) {
    const button = doc.createElement('button');
    button.className = 'tool-btn';
    button.setAttribute('data-tool', 'spring');
    button.setAttribute('data-agent-id', 'native-tool-spring');
    button.textContent = 'spring';
    button.addEventListener?.('click', () => {
      for (const item of doc.querySelectorAll?.('[data-tool]') || []) item.classList?.remove?.('active');
      button.classList?.add?.('active');
    });
    palette.appendChild(button);
  }

  const propPanel = doc?.getElementById?.('propPanel') || doc?.body;
  if (!propPanel || propPanel.querySelector?.('#ssSpringSupportPanel')) return;
  const panel = doc.createElement('div');
  panel.id = 'ssSpringSupportPanel';
  panel.setAttribute('id', 'ssSpringSupportPanel');
  panel.setAttribute('data-agent-id', 'native-spring-support-panel');
  panel.className = 'ss-spring-support-panel';
  const title = doc.createElement('h3');
  title.textContent = 'Spring Support';
  panel.appendChild(title);
  for (const key of ['kx', 'ky', 'kz', 'krx', 'kry', 'krz']) {
    const label = doc.createElement('label');
    label.textContent = key;
    const input = doc.createElement('input');
    input.id = `ssSpring${key.toUpperCase()}`;
    input.setAttribute('id', input.id);
    input.type = 'number';
    input.value = key === 'kz' ? '1000000' : '0';
    label.appendChild(input);
    panel.appendChild(label);
  }
  const apply = doc.createElement('button');
  apply.id = 'ssApplySpringSupport';
  apply.setAttribute('id', 'ssApplySpringSupport');
  apply.setAttribute('data-agent-id', 'native-apply-spring-support');
  apply.textContent = 'Apply spring';
  apply.addEventListener?.('click', () => {
    const selection = ensureAgentState(target).selection;
    if (selection?.type !== 'node') return;
    api.execute('nativeSetSpringSupport', {
      nodeId: selection.id,
      spring: readSpringInputs(doc),
    });
  });
  panel.appendChild(apply);
  propPanel.appendChild(panel);
}

function installAdvancedLoadConditionControls(target, api) {
  const doc = target?.document;
  const palette = doc?.getElementById?.('palette');
  appendToolButton(doc, palette, 'settle');
  appendToolButton(doc, palette, 'temp');

  const propPanel = doc?.getElementById?.('propPanel') || doc?.body;
  if (!propPanel || propPanel.querySelector?.('#ssAdvancedLoadConditionPanel')) return;
  const panel = doc.createElement('div');
  panel.id = 'ssAdvancedLoadConditionPanel';
  panel.setAttribute('id', 'ssAdvancedLoadConditionPanel');
  panel.setAttribute('data-agent-id', 'native-advanced-load-condition-panel');
  panel.className = 'ss-advanced-load-condition-panel';

  const title = doc.createElement('h3');
  title.textContent = 'Advanced Loads';
  panel.appendChild(title);

  appendInput(doc, panel, 'ssSettleDof', 'Settlement DOF', 'select', 'uz', ['ux', 'uy', 'uz', 'rx', 'ry', 'rz']);
  appendInput(doc, panel, 'ssSettleValue', 'Settlement', 'number', '0');
  appendInput(doc, panel, 'ssSettleCase', 'Case', 'text', 'D');
  appendButton(doc, panel, 'ssApplySettlement', 'Apply settlement', () => {
    const selection = ensureAgentState(target).selection;
    if (selection?.type !== 'node') return;
    const dof = doc.getElementById?.('ssSettleDof')?.value || 'uz';
    api.execute('nativeSetSettlement', {
      nodeId: selection.id,
      settlement: { [dof]: Number(doc.getElementById?.('ssSettleValue')?.value || 0) },
      case: doc.getElementById?.('ssSettleCase')?.value || 'D',
    });
  });

  appendInput(doc, panel, 'ssLoadType', 'Load type', 'select', 'udl-partial', ['udl-partial', 'trapezoid']);
  appendInput(doc, panel, 'ssLoadW1', 'W1', 'number', '0');
  appendInput(doc, panel, 'ssLoadW2', 'W2', 'number', '0');
  appendInput(doc, panel, 'ssLoadFrom', 'From', 'number', '0');
  appendInput(doc, panel, 'ssLoadTo', 'To', 'number', '1');
  appendInput(doc, panel, 'ssLoadDir', 'Direction', 'select', '-z', ['-x', '+x', '-y', '+y', '-z', '+z']);
  appendButton(doc, panel, 'ssApplyPartialLoad', 'Apply partial load', () => {
    const selection = ensureAgentState(target).selection;
    if (selection?.type !== 'member') return;
    const type = doc.getElementById?.('ssLoadType')?.value || 'udl-partial';
    api.execute('nativeAddPartialLoad', {
      memberId: selection.id,
      type,
      w: Number(doc.getElementById?.('ssLoadW1')?.value || 0),
      w1: Number(doc.getElementById?.('ssLoadW1')?.value || 0),
      w2: Number(doc.getElementById?.('ssLoadW2')?.value || 0),
      from: Number(doc.getElementById?.('ssLoadFrom')?.value || 0),
      to: Number(doc.getElementById?.('ssLoadTo')?.value || 1),
      dir: doc.getElementById?.('ssLoadDir')?.value || '-z',
    });
  });

  appendInput(doc, panel, 'ssTempMode', 'Temperature mode', 'select', 'temperature', ['temperature', 'tgradient']);
  appendInput(doc, panel, 'ssTempDt', 'dT', 'number', '0');
  appendInput(doc, panel, 'ssTempTop', 'Top dT', 'number', '0');
  appendInput(doc, panel, 'ssTempBot', 'Bottom dT', 'number', '0');
  appendInput(doc, panel, 'ssTempH', 'Depth', 'number', '1');
  appendButton(doc, panel, 'ssApplyTemperatureLoad', 'Apply temperature', () => {
    const selection = ensureAgentState(target).selection;
    if (selection?.type !== 'member') return;
    const type = doc.getElementById?.('ssTempMode')?.value || 'temperature';
    api.execute('nativeAddTemperatureLoad', {
      memberId: selection.id,
      type,
      dT: Number(doc.getElementById?.('ssTempDt')?.value || 0),
      dTtop: Number(doc.getElementById?.('ssTempTop')?.value || 0),
      dTbot: Number(doc.getElementById?.('ssTempBot')?.value || 0),
      h: Number(doc.getElementById?.('ssTempH')?.value || 1),
    });
  });

  appendInput(doc, panel, 'ssMemberBehavior', 'Member behavior', 'select', 'frame', ['frame', 'truss', 'tensionOnly', 'compressionOnly']);
  appendButton(doc, panel, 'ssApplyMemberBehavior', 'Apply behavior', () => {
    const selection = ensureAgentState(target).selection;
    if (selection?.type !== 'member') return;
    api.execute('nativeSetMemberBehavior', {
      memberId: selection.id,
      type: doc.getElementById?.('ssMemberBehavior')?.value || 'frame',
    });
  });

  propPanel.appendChild(panel);
}

function installLoadCaseManagerControls(target) {
  const doc = target?.document;
  const propPanel = doc?.getElementById?.('propPanel') || doc?.body;
  if (!doc || !propPanel || propPanel.querySelector?.('#ssLoadCasePanel')) return;

  const panel = doc.createElement('div');
  panel.id = 'ssLoadCasePanel';
  panel.setAttribute('id', 'ssLoadCasePanel');
  panel.setAttribute('data-agent-id', 'native-load-case-panel');
  panel.className = 'ss-load-case-panel';

  const title = doc.createElement('h3');
  title.textContent = 'Load Cases';
  panel.appendChild(title);

  appendInput(doc, panel, 'ssLcId', 'ID', 'text', 'L');
  appendInput(doc, panel, 'ssLcName', 'Name', 'text', 'Live load');
  appendInput(doc, panel, 'ssLcType', 'Type', 'select', 'live', ['dead', 'live', 'wind', 'seismic', 'snow', 'roof', 'other', 'user']);
  appendButton(doc, panel, 'ssLcAdd', 'Add case', () => {
    const agent = target?.SStructuresAgent;
    if (!agent) return;
    agent.execute('addLoadCase', readLoadCasePanel(doc));
    renderLoadCaseList(target);
  });
  appendButton(doc, panel, 'ssLcUpdate', 'Update case', () => {
    const agent = target?.SStructuresAgent;
    if (!agent) return;
    agent.execute('updateLoadCase', readLoadCasePanel(doc));
    renderLoadCaseList(target);
  });
  appendButton(doc, panel, 'ssLcDelete', 'Delete case', () => {
    const agent = target?.SStructuresAgent;
    if (!agent) return;
    agent.execute('deleteLoadCase', { id: doc.getElementById?.('ssLcId')?.value, force: true });
    renderLoadCaseList(target);
  });

  const list = doc.createElement('div');
  list.id = 'ssLcList';
  list.setAttribute('id', 'ssLcList');
  list.setAttribute('data-agent-id', 'native-load-case-list');
  list.className = 'ss-lc-list';
  panel.appendChild(list);

  propPanel.appendChild(panel);
  renderLoadCaseList(target);
}

function readLoadCasePanel(doc) {
  return {
    id: doc?.getElementById?.('ssLcId')?.value || 'L',
    name: doc?.getElementById?.('ssLcName')?.value || doc?.getElementById?.('ssLcId')?.value || 'Load case',
    type: doc?.getElementById?.('ssLcType')?.value || 'other',
  };
}

function renderLoadCaseList(target) {
  const doc = target?.document;
  const list = doc?.getElementById?.('ssLcList');
  const model = getCurrentModel(target);
  if (!doc || !list || !model) return;
  while (list.firstChild) list.removeChild(list.firstChild);
  if (!list.firstChild && Array.isArray(list.children)) list.children.length = 0;
  for (const loadCase of model.loadCases || []) {
    const item = doc.createElement('button');
    item.type = 'button';
    item.className = 'ss-lc-item';
    item.setAttribute('data-case-id', loadCase.id);
    item.setAttribute('data-agent-id', `native-load-case-${loadCase.id}`);
    item.textContent = `${loadCase.id} · ${loadCase.type || 'other'}`;
    item.addEventListener?.('click', () => {
      const id = doc.getElementById?.('ssLcId');
      const name = doc.getElementById?.('ssLcName');
      const type = doc.getElementById?.('ssLcType');
      if (id) id.value = loadCase.id;
      if (name) name.value = loadCase.name || loadCase.id;
      if (type) type.value = loadCase.type || 'other';
    });
    list.appendChild(item);
  }
}

function appendToolButton(doc, palette, tool) {
  if (!doc || !palette || palette.querySelector?.(`[data-tool="${cssEscape(tool)}"]`)) return;
  const button = doc.createElement('button');
  button.className = 'tool-btn';
  button.setAttribute('data-tool', tool);
  button.setAttribute('data-agent-id', `native-tool-${tool}`);
  button.textContent = tool;
  button.addEventListener?.('click', () => {
    for (const item of doc.querySelectorAll?.('[data-tool]') || []) item.classList?.remove?.('active');
    button.classList?.add?.('active');
  });
  palette.appendChild(button);
}

function appendInput(doc, panel, id, labelText, type, value, options = []) {
  const label = doc.createElement('label');
  label.textContent = labelText;
  const input = doc.createElement(type === 'select' ? 'select' : 'input');
  input.id = id;
  input.setAttribute('id', id);
  if (type !== 'select') input.type = type;
  input.value = value;
  for (const optionValue of options) {
    const option = doc.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    input.appendChild(option);
  }
  label.appendChild(input);
  panel.appendChild(label);
  return input;
}

function appendButton(doc, panel, id, text, handler) {
  const button = doc.createElement('button');
  button.id = id;
  button.setAttribute('id', id);
  button.setAttribute('data-agent-id', id);
  button.textContent = text;
  button.addEventListener?.('click', handler);
  panel.appendChild(button);
  return button;
}

function readSpringInputs(doc) {
  const spring = {};
  for (const key of ['kx', 'ky', 'kz', 'krx', 'kry', 'krz']) {
    spring[key] = Number(doc.getElementById?.(`ssSpring${key.toUpperCase()}`)?.value || 0);
  }
  return spring;
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
