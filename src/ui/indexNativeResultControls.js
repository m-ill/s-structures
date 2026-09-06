import { installFloatingPanel } from './floatingPanel.js';

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
  bindLegacyMemberSelectionSync(target, options.bridge, state);
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
      stepKind: 'iteration',
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
  syncRibbonState(target, state);
  if (state.selectedMemberId) renderMemberResult(target, bridge, state.selectedMemberId);
  else hideMemberPDeltaDock(target);
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
  const scale = doc?.getElementById?.('ssNativeResultScale');

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
    info.textContent = `P-Delta iter ${state.pDeltaStep + 1}/${maxStep + 1}`;
    if (play) play.textContent = state.pDeltaPlaying ? 'Pause' : 'Play';
  } else if (state.playerOwned) {
    player.style.display = 'none';
    player.setAttribute?.('data-ss-native-result-player', '');
    slider.value = '0';
    info.textContent = 'Step 1/1';
  }
}

function syncRibbonState(target, state) {
  const doc = target?.document;
  const scale = doc?.getElementById?.('ssNativeResultScale');
  if (scale) scale.value = normalizeResultScale(state.resultScale);
}

function renderMemberResult(target, bridge, memberId) {
  const doc = target?.document;
  const model = getCurrentModel(target, bridge);
  const analysis = getAnalysis(target, bridge);
  const panel = doc?.getElementById?.('propPanel');
  if (!doc || !panel || !memberId) return null;
  ensureMemberPDeltaStyles(doc);

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
    hideMemberPDeltaDock(target);
  } else {
    const pDeltaReview = buildMemberPDeltaReview(analysis, memberId);
    renderMemberPDeltaDock(target, pDeltaReview, memberId);
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

function bindLegacyMemberSelectionSync(target, bridge, state) {
  const doc = target?.document;
  if (!doc?.addEventListener || target.__SStructuresNativeMemberResultSync) return;
  target.__SStructuresNativeMemberResultSync = true;
  const schedule = () => {
    const run = () => syncLegacyMemberSelection(target, bridge, state);
    if (typeof target?.queueMicrotask === 'function') target.queueMicrotask(run);
    else run();
  };
  doc.addEventListener('click', schedule);
  doc.addEventListener('pointerup', schedule);
}

function syncLegacyMemberSelection(target, bridge, state) {
  const doc = target?.document;
  const panel = doc?.getElementById?.('propPanel');
  if (!doc || !isVisible(panel, target)) return;
  const memberId = readLegacyMemberId(panel);
  if (!memberId) return;
  const analysis = getAnalysis(target, bridge);
  if (!analysis?.pDelta) return;
  const propResult = doc.getElementById?.('propResult');
  const alreadyNative = propResult?.getAttribute?.('data-agent-id') === 'native-member-result-detail'
    && propResult?.getAttribute?.('data-member-id') === memberId;
  if (alreadyNative) return;
  state.selectedMemberId = memberId;
  renderMemberResult(target, bridge, memberId);
}

function renderMemberPDeltaDock(target, review, memberId, selectedComboId = null) {
  const unifiedState = target?.SStructuresElasticResultPopup?.getState?.();
  if (
    target?.SStructuresElasticResultPopup?.selectMember
    && unifiedState?.visualizationKind === 'pdelta'
    && unifiedState?.resultAvailable === true
  ) {
    hideMemberPDeltaDock(target);
    target.SStructuresElasticResultPopup.selectMember(memberId, { open: true });
    return null;
  }
  const doc = target?.document;
  const host = doc?.getElementById?.('canvasWrap') || doc?.getElementById?.('palette');
  if (!doc?.createElement || !host) return null;
  if (!review?.available) return hideMemberPDeltaDock(target);
  ensureMemberPDeltaStyles(doc);
  let dock = doc.getElementById?.('ssPDeltaMemberDock');
  if (!dock) {
    dock = doc.createElement('div');
    dock.id = 'ssPDeltaMemberDock';
    dock.setAttribute?.('id', 'ssPDeltaMemberDock');
    dock.setAttribute?.('data-agent-id', 'native-member-pdelta-dock');
  }
  if (dock.parentNode !== host) {
    if (host.id === 'palette') {
      const anchor = doc.getElementById?.('palCollapse');
      host.insertBefore?.(dock, anchor?.nextSibling || host.firstChild || null);
      if (!dock.parentNode) host.appendChild?.(dock);
    } else {
      host.appendChild?.(dock);
    }
  }
  const comboId = normalizePDeltaComboId(review, selectedComboId || dock.getAttribute?.('data-combo-id') || 'all');
  dock.hidden = false;
  dock.style.display = 'block';
  dock.setAttribute?.('data-member-id', memberId);
  dock.setAttribute?.('data-combo-id', comboId);
  dock.innerHTML = [
    '<div class="ss-pdelta-dock-bar">',
    `<b>P-Delta ${escapeHtml(memberId)}</b>`,
    '<button type="button" data-ss-pdelta-close="1" aria-label="P-Delta panel close">&times;</button>',
    '</div>',
    renderMemberPDeltaContent(review, comboId),
  ].join('');
  dock.querySelector?.('[data-ss-pdelta-close]')?.addEventListener?.('click', () => hideMemberPDeltaDock(target));
  const comboSelect = dock.querySelector?.('[data-ss-pdelta-combo]');
  if (comboSelect) {
    comboSelect.value = comboId;
    comboSelect.addEventListener?.('change', () => renderMemberPDeltaDock(target, review, memberId, comboSelect.value));
  }
  installFloatingPanel(target, dock, {
    allowPanelHandle: true,
    boundsElement: host.id === 'canvasWrap' ? host : null,
    defaultHeight: 290,
    defaultWidth: 320,
    handleSelector: '.ss-pdelta-dock-bar',
    maxHeight: 620,
    maxWidth: 560,
    minHeight: 180,
    minWidth: 260,
    position: host.id === 'canvasWrap' ? 'absolute' : 'fixed',
    snapThreshold: 18,
    storageKey: 's-structures:pdelta-member-dock',
    viewportPadding: 12,
  });
  if (host.id === 'palette') dock.scrollIntoView?.({ block: 'nearest' });
  return dock;
}

function hideMemberPDeltaDock(target) {
  const dock = target?.document?.getElementById?.('ssPDeltaMemberDock');
  if (!dock) return null;
  dock.hidden = true;
  dock.style.display = 'none';
  dock.setAttribute?.('data-member-id', '');
  return dock;
}

function readLegacyMemberId(panel) {
  const headings = [...panel?.querySelectorAll?.('h3') || []].map((item) => item.textContent || '');
  const candidates = headings.concat(panel?.textContent || '');
  for (const candidate of candidates) {
    const match = String(candidate).match(/(?:Member|부재)\s+([A-Za-z0-9_.:-]+)/);
    if (match?.[1]) return match[1];
  }
  return null;
}

function ensureMemberPDeltaStyles(doc) {
  if (!doc?.createElement || doc.getElementById?.('ssMemberPDeltaStyles')) return;
  const style = doc.createElement('style');
  if (!style) return;
  style.id = 'ssMemberPDeltaStyles';
  style.setAttribute?.('id', 'ssMemberPDeltaStyles');
  style.textContent = `
    #ssPDeltaMemberDock{
      margin:0 0 9px;
      padding:8px 8px 18px;
      background:#fff;
      border:1px solid #d8e6f0;
      border-radius:8px;
      box-shadow:0 1px 0 rgba(0,30,60,.04);
      color:#2c3e50;
      line-height:1.45;
      min-width:260px;
      min-height:180px;
    }
    #canvasWrap > #ssPDeltaMemberDock{
      position:absolute;
      left:12px;
      top:12px;
      z-index:33;
      width:320px;
      max-width:calc(100% - 24px);
      max-height:calc(100% - 94px);
      margin:0;
      overflow:auto;
      box-shadow:0 7px 22px rgba(0,30,60,.18);
    }
    #palette > #ssPDeltaMemberDock{
      position:sticky;
      top:0;
      z-index:2;
    }
    #ssPDeltaMemberDock[hidden]{
      display:none!important;
    }
    #ssPDeltaMemberDock .ss-pdelta-dock-bar{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      margin-bottom:5px;
      cursor:move;
    }
    #ssPDeltaMemberDock .ss-pdelta-dock-bar button{
      width:22px;
      height:22px;
      border:1px solid #d8e6f0;
      border-radius:50%;
      background:#fff;
      color:#789;
      line-height:1;
      padding:0;
    }
    #ssPDeltaMemberDock b{
      display:block;
      margin-bottom:3px;
      color:#00467F;
      font-size:11.5px;
    }
    #ssPDeltaMemberDock .ss-member-pdelta-metrics{
      margin:2px 0 6px;
      color:#48647c;
      font-size:10.5px;
      line-height:1.45;
    }
    #ssPDeltaMemberDock .ss-member-pdelta-toolbar{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      margin:3px 0 6px;
      color:#48647c;
      font-size:10.5px;
    }
    #ssPDeltaMemberDock .ss-member-pdelta-toolbar select{
      max-width:120px;
      height:24px;
      border:1px solid #d8e6f0;
      border-radius:5px;
      background:#fff;
      color:#24445e;
      font-size:10.5px;
      padding:0 5px;
    }
    #ssPDeltaMemberDock .ss-member-pdelta-note{
      margin:0 0 6px;
      color:#6d7f90;
      font-size:10px;
      line-height:1.35;
    }
    #ssPDeltaMemberDock .ss-member-pdelta-chart{
      display:block;
      width:100%;
      height:auto;
      background:#fbfdff;
      border:1px solid #dfe8f1;
      border-radius:6px;
    }
    #ssPDeltaMemberDock .ss-member-pdelta-table{
      width:100%;
      margin-top:6px;
      border-collapse:collapse;
      font-size:10.5px;
      line-height:1.35;
    }
    #ssPDeltaMemberDock .ss-member-pdelta-table th,
    #ssPDeltaMemberDock .ss-member-pdelta-table td{
      padding:3px 4px;
      border-bottom:1px solid #e5edf4;
      text-align:right;
      white-space:nowrap;
    }
    #ssPDeltaMemberDock .ss-member-pdelta-table th:first-child,
    #ssPDeltaMemberDock .ss-member-pdelta-table td:first-child{
      text-align:left;
    }
  `;
  (doc.head || doc.body || doc.documentElement)?.appendChild?.(style);
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

function buildMemberPDeltaReview(analysis, memberId) {
  if (!analysis?.pDelta?.byCombo) return null;
  const series = Object.entries(analysis.pDelta.byCombo)
    .map(([comboId, item]) => {
      const memberCurve = (item?.curve?.members || []).find((candidate) => candidate.memberId === memberId);
      const points = (memberCurve?.points || []).map((point) => ({
        comboId,
        loadFactor: Number(point.loadFactor) || 0,
        axialForce: Number(point.axialForce) || 0,
        localChordDriftY: Number(point.localChordDriftY) || 0,
        localChordDriftZ: Number(point.localChordDriftZ) || 0,
        localChordDrift: Number(point.localChordDrift) || 0,
        pDeltaShearY: Number(point.pDeltaShearY) || 0,
        pDeltaShearZ: Number(point.pDeltaShearZ) || 0,
        pDeltaShear: Number(point.pDeltaShear) || 0,
        pDeltaMomentY: Number(point.pDeltaMomentY) || 0,
        pDeltaMomentZ: Number(point.pDeltaMomentZ) || 0,
        axialRatio: point.axialRatio == null ? null : Number(point.axialRatio),
        amplificationB: point.amplificationB == null ? null : Number(point.amplificationB),
      }));
      return {
        comboId,
        converged: !!item?.converged,
        reason: item?.reason || null,
        points,
      };
    })
    .filter((item) => item.points.some((point) => point.pDeltaShear > 0 || point.axialForce > 0));
  if (!series.length) {
    return {
      available: true,
      memberId,
      active: false,
      message: 'Selected member has no load-step P-Delta contribution in the active result.',
      series: [],
      rows: [],
    };
  }
  const rows = series.flatMap((item) => item.points.map((point) => ({
    ...point,
    comboId: item.comboId,
    converged: item.converged,
  })));
  const governing = rows.reduce((best, row) => (
    !best || row.pDeltaShear > best.pDeltaShear ? row : best
  ), null);
  return {
    available: true,
    memberId,
    active: true,
    series,
    rows,
    governing,
    maxPDeltaShear: Math.max(0, ...rows.map((row) => row.pDeltaShear)),
    maxAxialRatio: Math.max(0, ...rows.map((row) => row.axialRatio || 0)),
    maxB: Math.max(1, ...rows.map((row) => row.amplificationB || 1)),
  };
}

function renderMemberPDeltaContent(review, selectedComboId = 'all') {
  if (!review.active) {
    return [
      '<b>Member P-Delta Contribution</b>',
      `<div>${escapeHtml(review.message)}</div>`,
    ].join('');
  }
  const view = filterMemberPDeltaReview(review, selectedComboId);
  const rows = view.rows
    .filter((row) => row.loadFactor > 0 || row.pDeltaShear > 0)
    .slice(0, 16);
  return [
    '<b>Member P-Delta Contribution</b>',
    renderMemberPDeltaComboControl(review, view.selectedComboId),
    '<div class="ss-member-pdelta-metrics">',
    `view ${escapeHtml(view.selectedComboId === 'all' ? 'all combos' : view.selectedComboId)} · `,
    `governing ${escapeHtml(view.governing?.comboId || '-')} · `,
    `max Nδ/L ${formatPDeltaNumber(view.maxPDeltaShear)} kN · `,
    `max N/Pcr ${formatRatio(view.maxAxialRatio)}`,
    '</div>',
    '<div class="ss-member-pdelta-note">member diagnostic only; design uses final second-order member forces.</div>',
    renderMemberPDeltaSvg(view),
    '<table class="ss-member-pdelta-table"><thead><tr><th>Combo</th><th>λ</th><th>N</th><th>δy</th><th>δz</th><th>Nδ/L</th><th>Nδy</th><th>Nδz</th><th>N/Pcr</th><th>B</th></tr></thead><tbody>',
    rows.map((row) => [
      '<tr>',
      `<td>${escapeHtml(row.comboId)}</td>`,
      `<td>${formatRatio(row.loadFactor)}</td>`,
      `<td>${formatNumber(row.axialForce)}</td>`,
      `<td>${formatNumber(row.localChordDriftY * 1000)} mm</td>`,
      `<td>${formatNumber(row.localChordDriftZ * 1000)} mm</td>`,
      `<td>${formatPDeltaNumber(row.pDeltaShear)}</td>`,
      `<td>${formatPDeltaNumber(row.pDeltaMomentZ)}</td>`,
      `<td>${formatPDeltaNumber(row.pDeltaMomentY)}</td>`,
      `<td>${row.axialRatio == null ? '-' : formatRatio(row.axialRatio)}</td>`,
      `<td>${row.amplificationB == null ? '-' : formatRatio(row.amplificationB)}</td>`,
      '</tr>',
    ].join('')).join(''),
    '</tbody></table>',
  ].join('');
}

function renderMemberPDeltaComboControl(review, selectedComboId) {
  if ((review.series || []).length <= 1) return '';
  const options = [
    ['all', 'All combos'],
    ...review.series.map((item) => [item.comboId, item.comboId]),
  ];
  return [
    '<label class="ss-member-pdelta-toolbar">',
    '<span>Combo graph</span>',
    '<select data-ss-pdelta-combo data-agent-id="native-member-pdelta-combo">',
    options.map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selectedComboId ? ' selected' : ''}>${escapeHtml(label)}</option>`).join(''),
    '</select>',
    '</label>',
  ].join('');
}

function filterMemberPDeltaReview(review, comboId = 'all') {
  const selectedComboId = normalizePDeltaComboId(review, comboId);
  const series = selectedComboId === 'all'
    ? review.series
    : review.series.filter((item) => item.comboId === selectedComboId);
  const rows = series.flatMap((item) => item.points.map((point) => ({
    ...point,
    comboId: item.comboId,
    converged: item.converged,
  })));
  const governing = rows.reduce((best, row) => (
    !best || row.pDeltaShear > best.pDeltaShear ? row : best
  ), null);
  return {
    ...review,
    selectedComboId,
    series,
    rows,
    governing,
    maxPDeltaShear: Math.max(0, ...rows.map((row) => row.pDeltaShear)),
    maxAxialRatio: Math.max(0, ...rows.map((row) => row.axialRatio || 0)),
    maxB: Math.max(1, ...rows.map((row) => row.amplificationB || 1)),
  };
}

function normalizePDeltaComboId(review, comboId = 'all') {
  const text = String(comboId || 'all');
  if (text === 'all') return 'all';
  return (review?.series || []).some((item) => item.comboId === text) ? text : 'all';
}

function renderMemberPDeltaSvg(review) {
  const width = 300;
  const height = 132;
  const pad = { left: 36, right: 10, top: 12, bottom: 28 };
  const maxLoadFactor = Math.max(1, ...review.rows.map((row) => row.loadFactor));
  const maxForce = Math.max(1e-9, review.maxPDeltaShear || 0);
  const x = (loadFactor) => pad.left + (loadFactor / maxLoadFactor) * (width - pad.left - pad.right);
  const y = (force) => height - pad.bottom - (force / maxForce) * (height - pad.top - pad.bottom);
  const colors = ['#0A5CA8', '#1a7f37', '#b07c1a', '#8a5fc0'];
  const lines = review.series.map((item, index) => {
    const color = colors[index % colors.length];
    const points = item.points.map((point) => `${x(point.loadFactor)},${y(point.pDeltaShear)}`).join(' ');
    return `<polyline points="${points}" stroke="${color}" fill="none" stroke-width="2"></polyline>`;
  }).join('');
  const dots = review.series.map((item, index) => {
    const color = colors[index % colors.length];
    return item.points.map((row) => (
      `<circle cx="${x(row.loadFactor)}" cy="${y(row.pDeltaShear)}" r="2.5" fill="${color}"></circle>`
    )).join('');
  }).join('');
  const legends = review.series.slice(0, 4).map((item, index) => {
    const color = colors[index % colors.length];
    const tx = pad.left + index * 62;
    return [
      `<rect x="${tx}" y="${height - 13}" width="7" height="7" rx="1.5" fill="${color}"></rect>`,
      `<text x="${tx + 10}" y="${height - 7}" font-size="9" fill="#48647c">${escapeHtml(item.comboId)}</text>`,
    ].join('');
  }).join('');
  return [
    `<svg class="ss-member-pdelta-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Selected member P-Delta contribution curve">`,
    `<line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" stroke="#cfdbe6"></line>`,
    `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" stroke="#cfdbe6"></line>`,
    `<line x1="${pad.left}" y1="${y(maxForce * 0.5)}" x2="${width - pad.right}" y2="${y(maxForce * 0.5)}" stroke="#edf3f8"></line>`,
    `<text x="3" y="${pad.top + 6}" font-size="10" fill="#48647c">${formatPDeltaNumber(maxForce)}kN</text>`,
    `<text x="${width - 34}" y="${height - 21}" font-size="10" fill="#48647c">λ</text>`,
    lines,
    dots,
    legends,
    '</svg>',
  ].join('');
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

function formatPDeltaNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  const abs = Math.abs(number);
  if (abs > 0 && abs < 0.001) return number.toExponential(2);
  if (abs > 0 && abs < 0.01) return number.toFixed(5);
  return formatNumber(number);
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
