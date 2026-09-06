import { buildIndexResultVisuals } from './indexResultVisuals.js';

export const INDEX_RESULT_CASE_VIEW_VERSION = 'p5-m9-result-case-view';

export function buildAnalysisCaseResultView(model = {}, result = null, options = {}) {
  const selection = resultViewSelection(options);
  if (!result) {
    return {
      version: INDEX_RESULT_CASE_VIEW_VERSION,
      available: false,
      caseId: null,
      kind: null,
      selectedIndex: 0,
      sliderMax: 0,
      overlayState: {},
      overlayData: null,
      trace: [],
      limitations: ['analysis-case-result-not-run'],
      selection,
      qualification: null,
      designTransferAllowed: false,
      runRecordId: null,
    };
  }
  const requestedIndex = Object.prototype.hasOwnProperty.call(options, 'index')
    ? options.index
    : selection.modeOrStep;
  const selectedIndex = Math.max(0, Math.trunc(Number(requestedIndex) || 0));
  let view;
  if (result.kind === 'modal') view = modalResultView(model, result, selectedIndex);
  else if (result.kind === 'buckling') view = bucklingResultView(model, result, selectedIndex);
  else if (result.kind === 'pushover') view = pushoverResultView(model, result, selectedIndex);
  else if (result.kind === 'static') view = staticResultView(model, result);
  else view = genericResultView(result, selectedIndex);
  return { ...view, selection };
}

export function updateResultViewSelection(store, patch = {}, source = 'result-view') {
  return store?.set?.(patch, source) || null;
}

function staticResultView(model, result) {
  const visuals = buildIndexResultVisuals(model, result.payload || {});
  const memberRatioMap = buildMemberRatioMap(visuals.members);
  return baseView(result, {
    selectedIndex: 0,
    sliderMax: 0,
    overlayState: { showDeformed: true },
    overlayData: {
      visualKind: 'static-deformation',
      visuals,
      deformedNodes: visuals.deformedNodes,
      memberCount: visuals.members.length,
      memberRatioMap,
      ratioLegend: memberRatioMap.legend,
    },
  });
}

function modalResultView(model, result, selectedIndex) {
  const payload = result.payload || {};
  const modes = payload.modes || [];
  const index = Math.max(0, Math.min(Math.max(0, modes.length - 1), selectedIndex));
  const visuals = buildIndexResultVisuals(model, { ok: true, dynamics: payload }, { modeIndex: index });
  const mode = modes[index] || null;
  return baseView(result, {
    selectedIndex: index,
    sliderMax: Math.max(0, modes.length - 1),
    overlayState: { showModal: true, modeIndex: index },
    overlayData: {
      visualKind: 'modal-shape',
      visuals,
      mode: mode ? {
        id: mode.id,
        index: mode.index,
        period: finite(mode.period),
        frequencyHz: finite(mode.frequencyHz),
      } : null,
      shapeNodeCount: visuals.modal?.modes?.[index]?.shape?.length || 0,
    },
  });
}

function bucklingResultView(model, result, selectedIndex) {
  const payload = result.payload || {};
  const modes = payload.modes || [];
  const index = Math.max(0, Math.min(Math.max(0, modes.length - 1), selectedIndex));
  const mode = modes[index] || payload.primaryMode || null;
  return baseView(result, {
    selectedIndex: index,
    sliderMax: Math.max(0, modes.length - 1),
    overlayState: { showUtilization: true },
    overlayData: {
      visualKind: 'buckling-trace',
      criticalLoadFactor: mode?.loadFactor ?? payload.criticalLoadFactor ?? null,
      mode: mode?.mode ?? index + 1,
      fullModeShape: mode?.fullModeShape || payload.fullModeShape || null,
      nodeCount: model?.nodes?.length || 0,
      referenceCompressionCount: payload.referenceCompression?.length || 0,
      status: payload.status || 'not-available',
    },
    trace: payload.iterations || payload.referenceCompression || [],
    limitations: mode?.modeShape || payload.modeShape ? [] : ['buckling-mode-shape-not-available-in-current-trace'],
  });
}

function pushoverResultView(model, result, selectedIndex) {
  const payload = result.payload || {};
  const curve = payload.curve || [];
  const index = Math.max(0, Math.min(Math.max(0, curve.length - 1), selectedIndex));
  const memberStates = payload.memberStates || {};
  const members = (model.members || []).map((member) => {
    const state = memberStates[member.id] || {};
    return {
      memberId: member.id,
      n1: member.n1,
      n2: member.n2,
      state: state.overall || 'unknown',
      color: hingeColor(state.overall),
      ratio: Math.max(finite(state.i?.ratio), finite(state.j?.ratio)),
    };
  });
  return baseView(result, {
    selectedIndex: index,
    sliderMax: Math.max(0, curve.length - 1),
    overlayState: { showHinges: true, pushoverStep: index },
    overlayData: {
      visualKind: 'pushover-hinge-state',
      step: curve[index] || null,
      members,
      stateCounts: countBy(members.map((member) => member.state)),
      memberRatioMap: buildMemberRatioMap(members.map((member) => ({
        id: member.memberId,
        ratio: member.ratio,
      }))),
    },
    limitations: ['step-specific-hinge-events-use-final-member-state-when-detailed-events-are-not-available'],
  });
}

export function buildMemberRatioMap(members = []) {
  const rows = (members || []).map((member) => {
    const ratio = finite(member.ratio);
    return {
      memberId: member.memberId || member.id,
      ratio,
      status: ratioStatus(ratio),
      color: ratioColor(ratio),
    };
  }).filter((row) => row.memberId);
  const maxRatio = rows.reduce((max, row) => Math.max(max, row.ratio), 0);
  const statusCounts = countBy(rows.map((row) => row.status));
  return {
    version: 'p5-m10-member-ratio-map',
    rows,
    maxRatio,
    statusCounts,
    legend: [
      { status: 'ok', label: 'OK', max: 0.7, color: ratioColor(0.4) },
      { status: 'warning', label: 'Review', min: 0.7, max: 1, color: ratioColor(0.85) },
      { status: 'ng', label: 'NG', min: 1, color: ratioColor(1.1) },
    ],
  };
}

export function ratioStatus(ratio) {
  if (ratio >= 1) return 'ng';
  if (ratio >= 0.7) return 'warning';
  return 'ok';
}

export function ratioColor(ratio) {
  if (ratio >= 1) return '#c62828';
  if (ratio >= 0.7) return '#f2a900';
  return '#2e7d32';
}

function genericResultView(result, selectedIndex) {
  return baseView(result, {
    selectedIndex,
    sliderMax: Math.max(0, (result.payload?.rows || []).length - 1),
    overlayState: {},
    overlayData: {
      visualKind: result.view || 'analysis-result',
      rowCount: result.payload?.rows?.length || 0,
    },
  });
}

function baseView(result, overrides = {}) {
  return {
    version: INDEX_RESULT_CASE_VIEW_VERSION,
    available: true,
    caseId: result.caseId,
    kind: result.kind,
    status: result.status,
    view: result.view,
    selectedIndex: overrides.selectedIndex || 0,
    sliderMax: overrides.sliderMax || 0,
    overlayState: overrides.overlayState || {},
    overlayData: overrides.overlayData || null,
    trace: overrides.trace || [],
    limitations: overrides.limitations || [],
    runRecordId: result.runRecordId || null,
    qualification: result.qualification || null,
    designTransferAllowed: result.designTransferAllowed === true,
    provenance: result.analysisProvenance || null,
  };
}

function resultViewSelection(options = {}) {
  const selection = options.selectionStore?.getState?.() || options.selection || {};
  return {
    activeCaseId: selection.activeCaseId || null,
    activeResultId: selection.activeResultId || null,
    response: selection.response || null,
    component: selection.component || null,
    modeOrStep: selection.modeOrStep ?? null,
    selectedEntity: selection.selectedEntity || null,
  };
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function countBy(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function hingeColor(state) {
  if (state === 'ultimate') return '#c62828';
  if (state === 'yielded') return '#f2a900';
  if (state === 'elastic') return '#2e7d32';
  return '#7f8c9a';
}
