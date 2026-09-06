export const PHASE13_ELASTIC_WORKSPACE_VERSION = 'p13-m1-elastic-workspace-v1';
export const PHASE13_WORKSPACES = Object.freeze(['project', 'model', 'loads', 'analysis', 'results', 'report']);

export function createPhase13ElasticWorkspace(initial = {}) {
  let state = normalizeWorkspace(initial);
  const listeners = new Set();
  return Object.freeze({
    version: PHASE13_ELASTIC_WORKSPACE_VERSION,
    getState: () => clone(state),
    setWorkspace(workspace) {
      return update({ workspace }, 'workspace');
    },
    selectObject(type, id, source = 'unknown') {
      return update({ selection: type && id ? { type: String(type), id: String(id) } : null }, source);
    },
    setRunState(runState) {
      return update({ runState: clone(runState) }, 'analysis-run');
    },
    resize(layout) {
      return update({ layout: { ...state.layout, ...layout } }, 'layout');
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    buildViewModel(viewport = {}) {
      return buildPhase13WorkspaceViewModel(state, viewport);
    },
  });

  function update(patch, source) {
    const previous = state;
    state = normalizeWorkspace({ ...state, ...patch });
    listeners.forEach((listener) => listener(clone(state), clone(previous), source));
    return clone(state);
  }
}

export function buildPhase13WorkspaceViewModel(input = {}, viewport = {}) {
  const state = normalizeWorkspace(input);
  const width = Math.max(1280, Number(viewport.width || 1280));
  const height = Math.max(720, Number(viewport.height || 720));
  const centerWidth = Math.max(600, width - state.layout.leftWidth - state.layout.rightWidth);
  const centerHeight = Math.max(360, height - state.layout.headerHeight - state.layout.drawerHeight);
  return Object.freeze({
    version: PHASE13_ELASTIC_WORKSPACE_VERSION,
    workspace: state.workspace,
    navigation: PHASE13_WORKSPACES.map((id) => ({ id, active: id === state.workspace })),
    status: statusBadge(state.runState),
    panes: {
      left: { id: 'model-case-tree', width: state.layout.leftWidth, selection: state.selection },
      center: { id: 'viewport', width: centerWidth, height: centerHeight, selection: state.selection },
      right: { id: 'context-inspector', width: state.layout.rightWidth, selection: state.selection },
      drawer: { id: 'analysis-drawer', height: state.layout.drawerHeight, runId: state.runState?.runId || null },
    },
    overflowX: false,
  });
}

function normalizeWorkspace(input = {}) {
  const workspace = PHASE13_WORKSPACES.includes(input.workspace) ? input.workspace : 'project';
  return {
    workspace,
    selection: input.selection?.type && input.selection?.id
      ? { type: String(input.selection.type), id: String(input.selection.id) }
      : null,
    runState: clone(input.runState || { execution: 'not-run', current: false, stale: false }),
    layout: {
      leftWidth: bounded(input.layout?.leftWidth, 220, 360, 260),
      rightWidth: bounded(input.layout?.rightWidth, 280, 420, 320),
      drawerHeight: bounded(input.layout?.drawerHeight, 180, 360, 240),
      headerHeight: bounded(input.layout?.headerHeight, 72, 120, 88),
    },
  };
}

function statusBadge(runState = {}) {
  const execution = runState.execution || 'not-run';
  return {
    code: execution,
    label: execution === 'current' ? 'Current' : execution === 'stale' ? 'Stale' : execution,
    tone: execution === 'current' ? 'positive' : execution === 'stale' ? 'warning' : execution === 'failed' ? 'critical' : 'neutral',
    runId: runState.runId || null,
    qualification: runState.qualification || null,
  };
}

function bounded(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function clone(value) {
  return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
}
