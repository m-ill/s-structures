export const INDEX_PRODUCT_HARDENING_VERSION = 'm30-product-hardening';

export function installIndexProductHardening(target = globalThis, options = {}) {
  if (!target?.document) return null;
  if (target.SStructuresProductHardening) return target.SStructuresProductHardening;

  const api = {
    version: INDEX_PRODUCT_HARDENING_VERSION,
    getState() {
      return runProductHardeningAudit(target, options.bridge);
    },
    runAudit() {
      return runProductHardeningAudit(target, options.bridge);
    },
  };

  target.SStructuresProductHardening = api;
  return api;
}

export function runProductHardeningAudit(target = globalThis, bridge = target?.SStructuresEngine || null) {
  const doc = target?.document || null;
  const runtime = target?.SStructuresRuntimeAdapter?.getDiagnostics?.() || null;
  const model = bridge?.getCurrentModel?.() || (typeof target?.model === 'function' ? target.model() : null);
  const nativeResult = target?.SStructuresNativeResultControls?.getState?.() || null;
  const nativeUi = target?.SStructuresNativeUI?.getState?.() || null;
  const duplicatePanels = visibleDuplicatePanels(target);
  const controls = [...doc?.querySelectorAll?.('[data-agent-id]') || []].map((item) => item.getAttribute('data-agent-id'));
  const duplicateAgentIds = findDuplicates(controls);

  const checks = {
    nativeUiAvailable: !!nativeUi?.ribbon?.available,
    nativeModelerAvailable: !!target?.SStructuresNativeModeler,
    nativePersistenceAvailable: !!target?.SStructuresNativePersistence,
    nativeAgentControlsAvailable: !!target?.SStructuresNativeAgentControls,
    nativeAdvancedAvailable: !!target?.SStructuresNativeAdvancedAnalysis,
    oneResultControlSystem: nativeResult ? nativeResult.singleResultControlSystem === true : duplicatePanels.length === 0,
    noDuplicatePanelsVisible: duplicatePanels.length === 0,
    modelConsistency: runtime?.modelConsistency?.matches !== false,
    reportModalAvailable: !!doc?.getElementById?.('reportModal'),
    noDuplicateAgentIds: duplicateAgentIds.length === 0,
    liveModelAvailable: !!model,
  };

  return {
    version: INDEX_PRODUCT_HARDENING_VERSION,
    ok: Object.values(checks).every(Boolean),
    checks,
    duplicatePanels,
    duplicateAgentIds,
    modelCounts: countModel(model),
    runtimeModelCounts: runtime?.modelCounts || null,
    visualContracts: [
      buildVisualContract(target, { id: 'desktop', width: 1366, height: 768 }),
      buildVisualContract(target, { id: 'tablet', width: 834, height: 1112 }),
    ],
  };
}

export function buildVisualContract(target = globalThis, viewport = { id: 'desktop', width: 1366, height: 768 }) {
  const doc = target?.document || null;
  const modeTabs = doc?.getElementById?.('ssModeTabs');
  const ribbon = doc?.getElementById?.('ssNativeRibbon');
  const palette = doc?.getElementById?.('palette');
  const topbar = doc?.getElementById?.('topbar');
  const subbar = doc?.getElementById?.('subbar');
  const requiredControls = [
    'native-mode-modeling',
    'native-mode-elastic',
    'native-mode-nonlinear',
    'native-mode-memo',
    'native-toggle-palette',
  ];
  const missingControls = requiredControls.filter((id) => !doc?.querySelector?.(`[data-agent-id="${id}"]`));
  return {
    ...viewport,
    topbarAvailable: !!topbar,
    subbarAvailable: !!subbar,
    modeTabsAvailable: !!modeTabs,
    ribbonAvailable: !!ribbon,
    paletteAvailable: !!palette,
    paletteCollapsible: !!doc?.querySelector?.('[data-ss-palette-toggle]'),
    missingControls,
    ok: !!topbar && !!subbar && !!modeTabs && !!ribbon && !!palette && missingControls.length === 0,
  };
}

export function measureAnalysisPerformance(label, analyze, options = {}) {
  const thresholdMs = Number(options.thresholdMs) || 5000;
  const start = performanceNow();
  const result = analyze();
  const elapsedMs = performanceNow() - start;
  return {
    label,
    ok: elapsedMs <= thresholdMs && result?.ok !== false,
    elapsedMs,
    thresholdMs,
    resultOk: result?.ok ?? null,
  };
}

function visibleDuplicatePanels(target) {
  const doc = target?.document || null;
  const ids = ['engineResultsDock', 'engineVisualControls', 'enginePushoverPanel'];
  return ids.filter((id) => isVisible(doc?.getElementById?.(id), target));
}

function isVisible(element, target = globalThis) {
  if (!element) return false;
  const style = typeof target?.getComputedStyle === 'function' ? target.getComputedStyle(element) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  if (element.hidden) return false;
  if (element.classList?.contains?.('show')) return true;
  return !style || style.display !== 'none';
}

function countModel(model) {
  return {
    available: !!model,
    nodeCount: model?.nodes?.length || 0,
    memberCount: model?.members?.length || 0,
    loadCount: model?.loads?.length || 0,
    loadCaseCount: model?.loadCases?.length || 0,
    combinationCount: model?.loadCombinations?.length || 0,
  };
}

function findDuplicates(items) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items.filter(Boolean)) {
    if (seen.has(item)) duplicates.add(item);
    seen.add(item);
  }
  return [...duplicates].sort();
}

function performanceNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}
