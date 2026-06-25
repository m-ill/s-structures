export const INDEX_RUNTIME_ADAPTER_VERSION = 'm23-original-index-runtime-adapter';

export function installIndexRuntimeAdapter(target = globalThis, options = {}) {
  if (!target) return null;
  if (target.SStructuresRuntimeAdapter) return target.SStructuresRuntimeAdapter;

  const adapter = {
    version: INDEX_RUNTIME_ADAPTER_VERSION,
    bridge: options.bridge || target.SStructuresEngine || null,
    getModel() {
      return safeCall(target.model);
    },
    getActiveResult() {
      return safeCall(target.activeResult);
    },
    getDiagnostics() {
      return buildRuntimeDiagnostics(target, adapter);
    },
    verifyModelCounts() {
      const diagnostics = buildRuntimeDiagnostics(target, adapter);
      return diagnostics.modelConsistency;
    },
  };

  target.SStructuresRuntimeAdapter = adapter;
  return adapter;
}

export function buildRuntimeDiagnostics(target = globalThis, adapter = target?.SStructuresRuntimeAdapter || null) {
  const doc = target?.document || null;
  const model = safeCall(target?.model);
  const activeResult = safeCall(target?.activeResult);
  const bridgeModel = safeCall(adapter?.bridge?.getCurrentModel) || safeCall(target?.SStructuresEngine?.getCurrentModel);
  const modelCounts = countModel(model);
  const engineModelCounts = countModel(bridgeModel);

  return {
    version: INDEX_RUNTIME_ADAPTER_VERSION,
    available: !!model,
    functions: {
      model: typeof target?.model === 'function',
      reanalyze: typeof target?.reanalyze === 'function',
      draw: typeof target?.draw === 'function',
      activeResult: typeof target?.activeResult === 'function',
    },
    page: readPageState(doc),
    modelCounts,
    activeCombination: readSelectState(doc?.getElementById?.('comboSel')),
    activeResult: summarizeResult(activeResult),
    resultToggles: readToggleState(doc, '[data-res]', 'data-res'),
    viewMode: readActiveValue(doc, '[data-view]', 'data-view'),
    activeTool: readActiveValue(doc, '[data-tool]', 'data-tool'),
    player: readPlayerState(target, doc),
    reportModal: readModalState(target, doc?.getElementById?.('reportModal')),
    palette: readPaletteState(target, doc?.getElementById?.('palette')),
    statusText: textOf(doc?.getElementById?.('statusTxt')),
    statusChip: textOf(doc?.getElementById?.('statusChip')),
    modelConsistency: {
      source: 'runtime-model-vs-engine-model',
      comparable: !!model && !!bridgeModel,
      matches: compareCounts(modelCounts, engineModelCounts),
      runtime: modelCounts,
      engine: engineModelCounts,
    },
  };
}

export function countModel(model) {
  return {
    available: !!model,
    nodeCount: model?.nodes?.length || 0,
    memberCount: model?.members?.length || 0,
    loadCount: model?.loads?.length || 0,
    loadCaseCount: model?.loadCases?.length || 0,
    combinationCount: model?.loadCombinations?.length || 0,
  };
}

function readPageState(doc) {
  const text = textOf(doc?.getElementById?.('pageInfo'));
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  return {
    label: text || null,
    current: match ? Number(match[1]) : null,
    total: match ? Number(match[2]) : null,
  };
}

function readSelectState(select) {
  if (!select) return { available: false, value: null, label: null };
  const option = select.options?.[select.selectedIndex] || null;
  return {
    available: true,
    value: select.value || null,
    label: textOf(option) || select.value || null,
  };
}

function summarizeResult(result) {
  if (!result) return { available: false };
  return {
    available: true,
    ok: typeof result.ok === 'boolean' ? result.ok : null,
    comboId: result.comboId || result.combo?.id || null,
    hasDisplacements: !!(result.disp || result.nodeDisplacements),
    memberResultCount: result.memberResults ? Object.keys(result.memberResults).length : 0,
    reactionCount: result.reactions ? Object.keys(result.reactions).length : 0,
    maxDisplacement: result.dmax ?? result.envelope?.dmax ?? null,
    compatible: result.legacyShape?.compatible ?? null,
    legacyShape: result.legacyShape || null,
  };
}

function readToggleState(doc, selector, attr) {
  if (!doc?.querySelectorAll) return [];
  return [...doc.querySelectorAll(selector)].map((element) => ({
    id: element.getAttribute(attr),
    label: textOf(element),
    on: element.classList?.contains('on') || element.classList?.contains('active') || false,
    disabled: !!element.disabled,
    visible: isVisible(element),
  }));
}

function readActiveValue(doc, selector, attr) {
  const elements = [...doc?.querySelectorAll?.(selector) || []];
  const active = elements.find((element) => element.classList?.contains('active') || element.classList?.contains('on')) || null;
  return {
    available: elements.length > 0,
    value: active?.getAttribute?.(attr) || null,
    label: textOf(active) || null,
  };
}

function readPlayerState(target, doc) {
  const bar = doc?.getElementById?.('playerBar');
  const slider = doc?.getElementById?.('plSlider');
  return {
    available: !!bar,
    visible: isVisible(bar, target),
    label: textOf(doc?.getElementById?.('plInfo')),
    sliderValue: slider?.value ?? null,
    sliderMax: slider?.max ?? null,
  };
}

function readModalState(target, element) {
  return {
    available: !!element,
    visible: isVisible(element, target),
    open: element?.classList?.contains('show') || false,
  };
}

function readPaletteState(target, element) {
  return {
    available: !!element,
    visible: isVisible(element, target),
    open: element?.classList?.contains('show') || false,
    collapsed: element?.classList?.contains('collapsed') || false,
  };
}

function compareCounts(left, right) {
  if (!left.available || !right.available) return false;
  return (
    left.nodeCount === right.nodeCount
    && left.memberCount === right.memberCount
    && left.loadCount === right.loadCount
    && left.loadCaseCount === right.loadCaseCount
    && left.combinationCount === right.combinationCount
  );
}

function textOf(element) {
  return element?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function isVisible(element, target = globalThis) {
  if (!element) return false;
  const style = typeof target?.getComputedStyle === 'function' ? target.getComputedStyle(element) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  if (element.hidden) return false;
  if (element.classList?.contains('show')) return true;
  return !style || style.display !== 'none';
}

function safeCall(fn) {
  try {
    return typeof fn === 'function' ? fn() : null;
  } catch (_error) {
    return null;
  }
}
