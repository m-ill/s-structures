export const INDEX_NATIVE_RESULT_CONTROLS_VERSION = 'm25-native-result-controls';

const RESULT_SCALE_VALUES = ['auto', '10', '50', '100', '500'];

export function installIndexNativeResultControls(target = globalThis, options = {}) {
  const doc = target?.document;
  if (!doc?.getElementById) return null;
  if (target.SStructuresNativeResultControls) return target.SStructuresNativeResultControls;

  const state = {
    pDeltaStep: 0,
    pDeltaPlaying: false,
    playerOwned: false,
    resultScale: readResultScale(doc),
    selectedMemberId: null,
    timer: null,
  };

  const api = {
    version: INDEX_NATIVE_RESULT_CONTROLS_VERSION,
    state,
    getState() {
      return buildNativeResultState(target, options.bridge, state);
    },
    refresh() {
      syncNativeResultControls(target, options.bridge, state);
      return api.getState();
    },
    setPDeltaEnabled(enabled) {
      const model = getCurrentModel(target, options.bridge);
      if (!model) throw new Error('Current UI model is not available.');
      model.analysisSettings = model.analysisSettings || {};
      model.analysisSettings.includeGeometricStiffness = !!enabled;
      if (!enabled) {
        state.pDeltaStep = 0;
        state.pDeltaPlaying = false;
        stopPlayback(state);
      }
      runUiAnalysis(target);
      syncNativeResultControls(target, options.bridge, state);
      return api.getState();
    },
    setPDeltaStep(step) {
      const maxStep = getPDeltaMaxStep(getAnalysis(target, options.bridge));
      state.pDeltaStep = clampStep(step, maxStep);
      syncPlayer(target, options.bridge, state);
      target.SStructuresResultVisuals?.setPDeltaStep?.(state.pDeltaStep);
      return api.getState();
    },
    setResultScale(value) {
      state.resultScale = normalizeResultScale(value);
      const scale = doc.getElementById?.('setExag');
      if (scale) scale.value = state.resultScale;
      const nativeScale = doc.getElementById?.('ssNativeResultScale');
      if (nativeScale) nativeScale.value = state.resultScale;
      target.SStructuresNativeResultScale = state.resultScale;
      target.draw?.();
      return api.getState();
    },
    showMemberResult(memberId) {
      state.selectedMemberId = String(memberId || '').trim() || null;
      renderMemberResult(target, options.bridge, state.selectedMemberId);
      return api.getState();
    },
  };

  target.SStructuresNativeResultControls = api;
  bindPlayerControls(target, options.bridge, state, api);
  bindRibbonControls(target, state, api);
  api.refresh();
  return api;
}

export function buildNativeResultState(target = globalThis, bridge = target?.SStructuresEngine || null, state = {}) {
  const doc = target?.document || null;
  const analysis = getAnalysis(target, bridge);
  const maxStep = getPDeltaMaxStep(analysis);
  const player = doc?.getElementById?.('playerBar');
  const slider = doc?.getElementById?.('plSlider');
  const propResult = doc?.getElementById?.('propResult');
  const scale = readResultScale(doc, state.resultScale);
  const experimentalVisible = isVisible(doc?.getElementById?.('engineResultsDock'), target)
    || isVisible(doc?.getElementById?.('engineVisualControls'), target)
    || isVisible(doc?.getElementById?.('enginePushoverPanel'), target);

  return {
    version: INDEX_NATIVE_RESULT_CONTROLS_VERSION,
    available: !!doc,
    singleResultControlSystem: !experimentalVisible,
    pDelta: {
      enabled: !!analysis?.pDelta,
      step: clampStep(state.pDeltaStep, maxStep),
      maxStep,
      playing: !!state.pDeltaPlaying,
    },
    player: {
      available: !!player,
      visible: isVisible(player, target),
      owned: !!state.playerOwned,
      label: textOf(doc?.getElementById?.('plInfo')),
      sliderValue: slider?.value ?? null,
      sliderMax: slider?.max ?? null,
    },
    resultScale: {
      value: scale,
      values: RESULT_SCALE_VALUES.slice(),
    },
    detail: {
      memberId: state.selectedMemberId || propResult?.getAttribute?.('data-member-id') || null,
      visible: isVisible(propResult, target),
      text: textOf(propResult),
    },
  };
}

function syncNativeResultControls(target, bridge, state) {
  syncPlayer(target, bridge, state);
  syncRibbonState(target, bridge, state);
  if (state.selectedMemberId) renderMemberResult(target, bridge, state.selectedMemberId);
}

function bindPlayerControls(target, bridge, state, api) {
  const doc = target?.document;
  const slider = doc?.getElementById?.('plSlider');
  const prev = doc?.getElementById?.('plPrev');
  const next = doc?.getElementById?.('plNext');
  const play = doc?.getElementById?.('plPlay');
  const close = doc?.getElementById?.('plClose');

  slider?.addEventListener?.('input', () => api.setPDeltaStep(slider.value));
  prev?.addEventListener?.('click', () => api.setPDeltaStep((Number(state.pDeltaStep) || 0) - 1));
  next?.addEventListener?.('click', () => api.setPDeltaStep((Number(state.pDeltaStep) || 0) + 1));
  play?.addEventListener?.('click', () => togglePlayback(target, bridge, state, api));
  close?.addEventListener?.('click', () => {
    state.pDeltaPlaying = false;
    stopPlayback(state);
    const player = doc?.getElementById?.('playerBar');
    if (player && state.playerOwned) player.style.display = 'none';
  });
}

function bindRibbonControls(target, state, api) {
  const doc = target?.document;
  const toggle = doc?.getElementById?.('ssNativePDeltaToggle');
  const scale = doc?.getElementById?.('ssNativeResultScale');

  toggle?.addEventListener?.('click', () => {
    const model = getCurrentModel(target);
    const enabled = !!model?.analysisSettings?.includeGeometricStiffness;
    api.setPDeltaEnabled(!enabled);
  });
  scale?.addEventListener?.('change', () => api.setResultScale(scale.value));
  if (scale) scale.value = normalizeResultScale(state.resultScale);
}

function togglePlayback(target, bridge, state, api) {
  const analysis = getAnalysis(target, bridge);
  const maxStep = getPDeltaMaxStep(analysis);
  if (maxStep <= 0) {
    api.setPDeltaStep(0);
    return;
  }
  state.pDeltaPlaying = !state.pDeltaPlaying;
  stopPlayback(state);
  if (state.pDeltaPlaying) {
    state.timer = setInterval(() => {
      const next = (Number(state.pDeltaStep) || 0) + 1;
      api.setPDeltaStep(next > maxStep ? 0 : next);
    }, 700);
  }
  syncPlayer(target, bridge, state);
}

function stopPlayback(state) {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

function syncPlayer(target, bridge, state) {
  const doc = target?.document;
  const analysis = getAnalysis(target, bridge);
  const player = doc?.getElementById?.('playerBar');
  const slider = doc?.getElementById?.('plSlider');
  const info = doc?.getElementById?.('plInfo');
  const play = doc?.getElementById?.('plPlay');
  const enabled = !!analysis?.pDelta;
  const maxStep = getPDeltaMaxStep(analysis);
  state.pDeltaStep = clampStep(state.pDeltaStep, maxStep);

  if (!player || !slider || !info) return;
  if (enabled && maxStep > 0) {
    state.playerOwned = true;
    player.style.display = 'flex';
    player.setAttribute?.('data-ss-native-result-player', 'pdelta');
    slider.min = '0';
    slider.max = String(maxStep);
    slider.value = String(state.pDeltaStep);
    info.textContent = `P-Delta ${state.pDeltaStep + 1}/${maxStep + 1}`;
    if (play) play.textContent = state.pDeltaPlaying ? 'Pause' : 'Play';
  } else if (state.playerOwned) {
    player.style.display = 'none';
    player.setAttribute?.('data-ss-native-result-player', '');
    slider.value = '0';
    info.textContent = 'Step 1/1';
  }
}

function syncRibbonState(target, bridge, state) {
  const doc = target?.document;
  const analysis = getAnalysis(target, bridge);
  const model = getCurrentModel(target, bridge);
  const toggle = doc?.getElementById?.('ssNativePDeltaToggle');
  const scale = doc?.getElementById?.('ssNativeResultScale');
  const enabled = !!model?.analysisSettings?.includeGeometricStiffness;

  if (toggle) {
    toggle.classList?.toggle?.('active', enabled);
    toggle.setAttribute?.('aria-pressed', enabled ? 'true' : 'false');
    toggle.disabled = !model;
    toggle.title = analysis?.pDelta ? 'P-Delta result is available.' : 'Enable P-Delta analysis.';
  }
  if (scale) scale.value = normalizeResultScale(state.resultScale);
}

function renderMemberResult(target, bridge, memberId) {
  const doc = target?.document;
  const model = getCurrentModel(target, bridge);
  const analysis = getAnalysis(target, bridge);
  const panel = doc?.getElementById?.('propPanel');
  if (!doc || !panel || !memberId) return null;

  let propResult = doc.getElementById?.('propResult');
  if (!propResult) {
    propResult = doc.createElement?.('div');
    if (!propResult) return null;
    propResult.id = 'propResult';
    propResult.setAttribute?.('id', 'propResult');
    panel.appendChild?.(propResult);
  }

  const member = (model?.members || []).find((item) => item.id === memberId);
  const result = pickActiveResult(target, analysis);
  const memberResult = result?.memberResults?.[memberId] || null;
  const design = analysis?.design?.steel?.memberResults?.[memberId]
    || analysis?.design?.concrete?.memberResults?.[memberId]
    || memberResult?.check
    || null;

  if (!member || !memberResult) {
    propResult.innerHTML = `<b>Result</b><br>Member ${escapeHtml(memberId)} has no active result.`;
  } else {
    propResult.innerHTML = [
      `<b>Member ${escapeHtml(memberId)} result</b>`,
      `N ${formatNumber(memberResult.Nmax)} kN`,
      `Vy ${formatNumber(memberResult.Vymax)} kN / Vz ${formatNumber(memberResult.Vzmax)} kN`,
      `My ${formatNumber(memberResult.Mymax)} kN-m / Mz ${formatNumber(memberResult.Mzmax)} kN-m`,
      `d ${formatNumber((memberResult.dmaxM || 0) * 1000)} mm`,
      `check ${formatRatio(design?.utilization ?? design?.ratio ?? memberResult.utilization)}`,
      `status ${escapeHtml(design?.status || memberResult.status || 'OK')}`,
    ].join('<br>');
  }

  propResult.style.display = 'block';
  propResult.setAttribute?.('data-agent-id', 'native-member-result-detail');
  propResult.setAttribute?.('data-member-id', memberId);
  panel.style.display = 'block';
  return propResult;
}

function getAnalysis(target, bridge = target?.SStructuresEngine || null) {
  const model = getCurrentModel(target, bridge);
  if (!model) return null;
  return bridge?.getLastResult?.()
    || bridge?.analyzeModel?.(model)
    || target?.analyzeModel?.(model)
    || null;
}

function getCurrentModel(target, bridge = target?.SStructuresEngine || null) {
  return bridge?.getCurrentModel?.() || (typeof target?.model === 'function' ? target.model() : null);
}

function runUiAnalysis(target) {
  if (typeof target?.reanalyze === 'function') target.reanalyze(true);
}

function pickActiveResult(target, analysis) {
  const active = typeof target?.activeResult === 'function' ? target.activeResult() : null;
  return active || analysis?.pDelta?.envelope || analysis?.envelope || Object.values(analysis?.byCombo || {})[0] || null;
}

function getPDeltaMaxStep(analysis) {
  let maxStep = 0;
  for (const item of Object.values(analysis?.pDelta?.byCombo || {})) {
    maxStep = Math.max(maxStep, Math.max(0, (item?.iterations?.length || 0) - 1));
  }
  return maxStep;
}

function clampStep(step, maxStep) {
  return Math.min(Math.max(0, Math.trunc(Number(step) || 0)), Math.max(0, Math.trunc(Number(maxStep) || 0)));
}

function readResultScale(doc, fallback = 'auto') {
  return normalizeResultScale(doc?.getElementById?.('ssNativeResultScale')?.value || doc?.getElementById?.('setExag')?.value || fallback);
}

function normalizeResultScale(value) {
  const text = String(value || 'auto');
  return RESULT_SCALE_VALUES.includes(text) ? text : 'auto';
}

function isVisible(element, target = globalThis) {
  if (!element) return false;
  const style = typeof target?.getComputedStyle === 'function' ? target.getComputedStyle(element) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  if (element.hidden) return false;
  if (element.classList?.contains?.('show')) return true;
  return !style || style.display !== 'none';
}

function textOf(element) {
  const text = element?.textContent || element?.innerText || '';
  return String(text).replace(/\s+/g, ' ').trim();
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  if (Math.abs(number) >= 100) return number.toFixed(0);
  if (Math.abs(number) >= 10) return number.toFixed(1);
  return number.toFixed(3);
}

function formatRatio(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '-';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
