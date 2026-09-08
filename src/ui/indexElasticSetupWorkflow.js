import { createRibbonGroup } from './indexNativeRibbonDom.js';
import { installFloatingPanel } from './floatingPanel.js';
import {
  KDS_41_12_00_2022_RULE_PACK,
} from '../core/kdsLoadCombinations.js';
import { formatCombinationFactors } from '../core/combinations.js';
import {
  applyLoadCombinationChangeSet,
  approveLoadCombinationChangeSet,
  previewLoadCombinationChangeSet,
} from '../loads/loadCombinationChangeSet.js';
import {
  OCCUPANCY_LOAD_PRESETS,
  createDesignBasis,
} from '../design/designBasisInput.js';
import { modernizeLegacyDefaultCombinations } from '../core/schema.js';

export const ELASTIC_SETUP_WORKFLOW_VERSION = 'p7-m11-elastic-setup-workflow-v1';

export const ELASTIC_SETUP_STEPS = [
  {
    id: 'basis',
    label: '기본설정',
    purpose: '용도·설계법·지역 조건을 먼저 고정해야 하중값과 조합식의 적용 범위를 결정할 수 있습니다.',
  },
  {
    id: 'loads',
    label: '하중·질량',
    purpose: 'D/L/W/E를 물리적 하중케이스로 분리하고 질량원을 만들어야 조합과 동적해석이 같은 입력을 사용합니다.',
  },
  {
    id: 'combinations',
    label: '하중조합',
    purpose: '강도·사용성 목적을 구분하고 설계법에 맞는 계수를 적용해야 부재력과 변위 검토가 섞이지 않습니다.',
  },
  {
    id: 'validation',
    label: '모델검증',
    purpose: '지점·연결·재료·단면·하중 참조 오류를 해석 전에 차단해야 그럴듯한 잘못된 결과를 피할 수 있습니다.',
  },
  {
    id: 'first-order',
    label: '1차해석',
    purpose: '기본 선형해석으로 평형과 변위 수준을 먼저 확인해야 2차효과와 동적결과를 비교할 기준이 생깁니다.',
  },
  {
    id: 'advanced',
    label: '고급해석',
    purpose: '구조 거동과 검토 목적에 따라 Direct P-Delta, 모달/RSA, 좌굴 또는 시간이력을 선택합니다.',
  },
  {
    id: 'review',
    label: '결과검토',
    purpose: '수렴·평형·질량참여·지배조합·경고를 확인한 결과만 설계검토와 보고서에 전달합니다.',
  },
];

const OCCUPANCY_LABELS = {
  office: '업무시설',
  residential: '주거시설',
  school: '학교',
  hospital: '병원',
  parking: '주차장',
  warehouse: '창고·공장',
};

export function installElasticSetupWorkflow(target = globalThis, options = {}) {
  const doc = target?.document;
  const bridge = options.bridge || target?.SStructuresEngine;
  if (!doc?.createElement || !bridge) return null;
  if (target.SStructuresElasticSetupWorkflow) return target.SStructuresElasticSetupWorkflow;

  injectStyle(doc);
  const panel = ensurePanel(doc);
  const model = currentModel(target);
  const combinationModernization = modernizeLegacyDefaultCombinations(model.loadCombinations, model.loadCases);
  if (combinationModernization.changed) model.loadCombinations = combinationModernization.combinations;
  const projectId = ensureWorkflowProjectIdentity(target, model);
  const state = {
    open: false,
    step: 0,
    draft: initialDraft(model, projectId),
    comboPreview: null,
    validation: null,
    message: null,
    messageKind: 'info',
    rawControlsVisible: false,
    autoOpened: false,
  };

  const ribbon = installWorkflowRibbon(target);
  const legacyLoadButton = doc.getElementById?.('mLoadCombos');
  const legacyLoadHandler = typeof legacyLoadButton?.onclick === 'function'
    ? legacyLoadButton.onclick
    : null;

  const api = {
    version: ELASTIC_SETUP_WORKFLOW_VERSION,
    state,
    panel,
    open(step = state.step) {
      state.open = true;
      state.step = clampStep(step);
      syncDraftFromModel(state, currentModel(target), target);
      render(target, bridge, state, panel, api);
      target.SStructuresFloatingPanels?.recordVisibility?.('elastic-workflow', true);
      return api.getState();
    },
    close() {
      readDraft(panel, state);
      state.open = false;
      render(target, bridge, state, panel, api);
      target.SStructuresFloatingPanels?.recordVisibility?.('elastic-workflow', false);
      return api.getState();
    },
    go(step) {
      readDraft(panel, state);
      if (state.step === 0) saveBasis(target, state);
      state.step = clampStep(step);
      state.message = null;
      render(target, bridge, state, panel, api);
      return api.getState();
    },
    loadOccupancyDefaults() {
      readDraft(panel, state);
      const preset = OCCUPANCY_LOAD_PRESETS[state.draft.occupancy] || OCCUPANCY_LOAD_PRESETS.office;
      state.draft.deadLoad = preset.dead;
      state.draft.liveLoad = preset.live;
      state.draft.roofLiveLoad = preset.roofLive;
      state.message = '용도별 시작값을 불러왔습니다. 프로젝트 하중표와 대조한 뒤 적용하세요.';
      state.messageKind = 'review';
      render(target, bridge, state, panel, api);
      return api.getState();
    },
    applyLoads() {
      readDraft(panel, state);
      try {
        saveBasis(target, state);
        const result = target.SStructuresAgent?.execute?.('applyDesignBasisLoads', {
          designBasis: designBasisInput(state.draft),
          replaceGenerated: true,
        });
        const massPerFloor = nonNegative(state.draft.massPerFloor, 10);
        if (massPerFloor > 0) target.SStructuresAgent?.execute?.('generateFloorMass', { massPerFloor });
        state.comboPreview = null;
        state.message = `하중 적용 완료: ${result?.loadEstimation?.loads?.length || 0}개 생성, 층 질량 ${formatNumber(massPerFloor)}.`;
        state.messageKind = 'ok';
        bridge.markAnalysisCasesStale?.('load-setup-changed');
      } catch (error) {
        state.message = error?.message || '하중 적용에 실패했습니다.';
        state.messageKind = 'error';
      }
      render(target, bridge, state, panel, api);
      return api.getState();
    },
    previewCombinations() {
      readDraft(panel, state);
      const model = currentModel(target);
      try {
        saveBasis(target, state);
        state.comboPreview = previewLoadCombinationChangeSet(model, KDS_41_12_00_2022_RULE_PACK, {
          method: state.draft.designMethod || 'strength',
          includeReverseLateral: true,
          mode: 'merge',
        });
        state.message = `${state.comboPreview.generated.length}개 조합을 만들었습니다. 계수·누락 하중·방향을 확인하고 프로젝트 검토 승인 후 적용하세요.`;
        state.messageKind = 'review';
      } catch (error) {
        state.comboPreview = null;
        state.message = error?.message || '조합 미리보기에 실패했습니다.';
        state.messageKind = 'error';
      }
      render(target, bridge, state, panel, api);
      return api.getState();
    },
    applyCombinations() {
      readDraft(panel, state);
      const model = currentModel(target);
      try {
        if (!state.comboPreview) throw new Error('먼저 KDS 조합 미리보기를 실행하세요.');
        state.draft.projectId = ensureWorkflowProjectIdentity(target, model, state.draft.projectId);
        if (!state.draft.projectId) throw new Error('1단계 기본설정에서 프로젝트 ID를 입력하세요.');
        if (!state.draft.approvalChecked) throw new Error('프로젝트 조합 검토 확인이 필요합니다.');
        if (!String(state.draft.reviewer || '').trim()) throw new Error('검토자 ID를 입력하세요.');
        if (!String(state.draft.approvalNote || '').trim()) throw new Error('검토 메모를 입력하세요.');
        const approved = approveLoadCombinationChangeSet(model, state.comboPreview, {
          projectId: state.draft.projectId,
          reviewer: { id: String(state.draft.reviewer).trim() },
          reviewedAt: new Date().toISOString(),
          note: String(state.draft.approvalNote).trim(),
        }, { projectId: state.draft.projectId });
        const applied = applyLoadCombinationChangeSet(model, approved, { projectId: state.draft.projectId });
        cleanLegacyDefaultCombinations(model, approved.projectApproval);
        state.comboPreview = null;
        state.message = `프로젝트 승인 조합 적용 완료: ${applied.summary.created}개 추가, ${applied.summary.updated}개 갱신.`;
        state.messageKind = 'ok';
        bridge.markAnalysisCasesStale?.('load-combinations-changed');
        bridge.reanalyze?.();
      } catch (error) {
        const blockers = error?.approvalBlockers
          || error?.changeSet?.guard?.approvalBlockers
          || error?.blockers
          || [];
        state.message = blockers.length
          ? `조합 적용 차단: ${formatApprovalBlockers(blockers)}`
          : error?.message || '조합 적용에 실패했습니다.';
        state.messageKind = 'error';
      }
      render(target, bridge, state, panel, api);
      return api.getState();
    },
    runValidation() {
      state.validation = bridge.validateModel?.(currentModel(target)) || null;
      const errors = state.validation?.errors?.length || 0;
      const warnings = state.validation?.warnings?.length || 0;
      state.message = errors
        ? `모델 검증 실패: 오류 ${errors}건, 경고 ${warnings}건.`
        : `모델 검증 완료: 오류 0건, 경고 ${warnings}건.`;
      state.messageKind = errors ? 'error' : warnings ? 'review' : 'ok';
      render(target, bridge, state, panel, api);
      return api.getState();
    },
    async runFirstOrder() {
      target.SStructuresElasticAnalysisRibbon?.select?.('static');
      target.SStructuresAnalysisCenter?.close?.();
      await target.SStructuresElasticAnalysisRibbon?.runSelected?.();
      const model = currentModel(target);
      const firstOrder = (model.analysisCases || []).find((item) => (
        item.settings?._elasticCommand === 'static' || item.id === 'EL-STATIC'
      ));
      const result = firstOrder
        ? bridge.getAnalysisLatestAttempt?.(firstOrder.id) || bridge.getAnalysisCaseResult?.(firstOrder.id)
        : null;
      const status = result?.status || firstOrder?.status || 'not-run';
      if (status === 'ok') {
        state.message = '1차 정적해석이 완료됐습니다. 평형, 최대변위, 실패 조합을 먼저 확인하세요.';
        state.messageKind = 'ok';
      } else if (status === 'failed') {
        state.message = `1차 정적해석 실패: ${result?.message || result?.error?.message || '모델과 해석 입력을 확인하세요.'}`;
        state.messageKind = 'error';
      } else {
        state.message = `1차 정적해석 상태: ${statusLabel(status)}. 결과 검토 후 다음 단계로 진행하세요.`;
        state.messageKind = 'review';
      }
      state.open = true;
      render(target, bridge, state, panel, api);
      return api.getState();
    },
    selectAdvanced(key) {
      state.open = false;
      render(target, bridge, state, panel, api);
      target.SStructuresElasticAnalysisRibbon?.select?.(key);
      return api.getState();
    },
    openAnalysisCenter() {
      target.SStructuresAnalysisCenter?.open?.();
      return api.getState();
    },
    openReport() {
      doc.getElementById?.('mDesignReport')?.click?.();
      return api.getState();
    },
    openLegacyEditor() {
      state.open = false;
      render(target, bridge, state, panel, api);
      legacyLoadHandler?.call?.(legacyLoadButton);
      decorateLegacyEditor(doc);
      return api.getState();
    },
    toggleRawControls() {
      state.rawControlsVisible = !state.rawControlsVisible;
      syncRawControls(doc, state.rawControlsVisible);
      refreshRibbon(target, ribbon);
      return api.getState();
    },
    refresh() {
      if (state.open) render(target, bridge, state, panel, api);
      refreshRibbon(target, ribbon);
      return api.getState();
    },
    getState() {
      return summarizeWorkflow(target, state);
    },
  };

  target.SStructuresElasticSetupWorkflow = api;
  doc.body?.classList?.add('ss-guided-elastic-ready');
  syncRawControls(doc, false);
  if (legacyLoadButton) {
    legacyLoadButton.onclick = () => {
      doc.getElementById?.('menuDrop')?.classList?.remove?.('show');
      api.open(2);
      return false;
    };
  }
  target.addEventListener?.('sstructures:native-mode-change', (event) => {
    const mode = event?.detail?.activeMode || event?.detail?.modes?.find?.((item) => item.active)?.id;
    if (mode !== 'elastic' || state.autoOpened) return;
    state.autoOpened = true;
    if (workflowNeedsAttention(currentModel(target))) api.open(firstRequiredStep(target));
  });
  render(target, bridge, state, panel, api);
  refreshRibbon(target, ribbon);
  if (combinationModernization.changed) {
    bridge.markAnalysisCasesStale?.('legacy-load-combinations-modernized');
    bridge.reanalyze?.();
    target.SStructuresNativeResultControls?.refresh?.();
  }
  return api;
}

export function summarizeWorkflow(target = globalThis, state = {}) {
  const model = currentModel(target);
  const statuses = workflowStepStatuses(target, model, state);
  return {
    version: ELASTIC_SETUP_WORKFLOW_VERSION,
    open: state.open === true,
    step: clampStep(state.step),
    stepId: ELASTIC_SETUP_STEPS[clampStep(state.step)].id,
    setupStatus: statuses.every((item) => ['complete', 'optional'].includes(item.status)) ? 'complete' : 'attention-required',
    steps: statuses,
    combinationAudit: auditCombinations(model),
    hasPreview: !!state.comboPreview,
  };
}

function installWorkflowRibbon(target) {
  const doc = target.document;
  const panel = doc.querySelector?.('[data-ss-ribbon-panel="elastic"]');
  if (!panel) return null;
  const group = createRibbonGroup(doc, 'elastic-guided-workflow', '해석 절차');
  group.setAttribute('data-ss-elastic-workflow-ribbon', '1');
  const items = group.querySelector('[data-ss-ribbon-items]');
  const stepButtons = [];
  ELASTIC_SETUP_STEPS.forEach((step, index) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'ss-ribbon-command ss-elastic-workflow-step';
    button.setAttribute('data-ss-elastic-step', step.id);
    button.setAttribute('data-agent-id', `elastic-workflow-${step.id}`);
    button.setAttribute('aria-label', `${index + 1}단계 ${step.label}`);
    button.innerHTML = `<span class="ss-step-number">${index + 1}</span><span>${step.label}</span><span class="ss-step-state"></span>`;
    button.addEventListener?.('click', () => target.SStructuresElasticSetupWorkflow?.open?.(index));
    items.appendChild(button);
    stepButtons.push(button);
  });
  const raw = doc.createElement('button');
  raw.type = 'button';
  raw.id = 'ssElasticRawLoadToggle';
  raw.className = 'ss-ribbon-command ss-elastic-raw-toggle';
  raw.setAttribute('aria-label', '상세 하중 입력 표시');
  raw.setAttribute('title', '상세 하중 입력 표시');
  raw.innerHTML = '<span class="ss-ribbon-icon">⋯</span>';
  raw.addEventListener?.('click', () => target.SStructuresElasticSetupWorkflow?.toggleRawControls?.());
  items.appendChild(raw);
  panel.insertBefore?.(group, panel.firstChild || null);
  return { group, stepButtons, raw };
}

function ensurePanel(doc) {
  let root = doc.getElementById?.('ssElasticWorkflow');
  if (root) return root;
  root = doc.createElement('section');
  root.id = 'ssElasticWorkflow';
  root.setAttribute('id', root.id);
  root.className = 'ss-elastic-workflow';
  root.setAttribute('data-agent-id', 'elastic-setup-workflow');
  (doc.querySelector?.('#main') || doc.body || doc.documentElement)?.appendChild?.(root);
  return root;
}

function render(target, bridge, state, panel, api) {
  clear(panel);
  panel.classList?.toggle('is-open', state.open === true);
  panel.classList?.toggle('is-closed', state.open !== true);
  panel.setAttribute('aria-hidden', state.open === true ? 'false' : 'true');
  const doc = panel.ownerDocument;
  const model = currentModel(target);
  const step = ELASTIC_SETUP_STEPS[state.step];

  const header = doc.createElement('div');
  header.className = 'ss-ew-header';
  const title = doc.createElement('h2');
  title.textContent = `탄성해석 설정 · ${state.step + 1}/${ELASTIC_SETUP_STEPS.length}`;
  header.appendChild(title);
  const status = doc.createElement('span');
  status.className = 'ss-ew-progress';
  status.textContent = `${workflowStepStatuses(target, model, state).filter((item) => item.status === 'complete').length}단계 완료`;
  header.appendChild(status);
  header.appendChild(actionButton(doc, 'ssEwClose', '닫기', () => api.close(), 'ss-ew-close'));
  panel.appendChild(header);

  const nav = doc.createElement('div');
  nav.className = 'ss-ew-nav';
  workflowStepStatuses(target, model, state).forEach((item, index) => {
    const button = actionButton(doc, null, `${index + 1} ${item.label}`, () => api.go(index));
    button.className = `ss-ew-nav-step${index === state.step ? ' active' : ''}`;
    button.setAttribute('data-status', item.status);
    nav.appendChild(button);
  });
  panel.appendChild(nav);

  const purpose = doc.createElement('div');
  purpose.className = 'ss-ew-purpose';
  const purposeTitle = doc.createElement('strong');
  purposeTitle.textContent = `${state.step + 1}. ${step.label}`;
  purpose.appendChild(purposeTitle);
  const purposeText = doc.createElement('span');
  purposeText.textContent = step.purpose;
  purpose.appendChild(purposeText);
  panel.appendChild(purpose);

  const body = doc.createElement('div');
  body.className = 'ss-ew-body';
  body.setAttribute('data-step', step.id);
  renderStep(target, bridge, state, body, api);
  panel.appendChild(body);

  if (state.message) {
    const message = doc.createElement('div');
    message.className = `ss-ew-message message-${state.messageKind}`;
    message.textContent = state.message;
    panel.appendChild(message);
  }

  const footer = doc.createElement('div');
  footer.className = 'ss-ew-footer';
  const previous = actionButton(doc, 'ssEwPrevious', '이전', () => api.go(state.step - 1));
  previous.disabled = state.step === 0;
  footer.appendChild(previous);
  const next = actionButton(doc, 'ssEwNext', state.step === ELASTIC_SETUP_STEPS.length - 1 ? '완료' : '다음', () => {
    if (state.step === ELASTIC_SETUP_STEPS.length - 1) api.close();
    else api.go(state.step + 1);
  }, 'primary');
  footer.appendChild(next);
  panel.appendChild(footer);

  installFloatingPanel(target, panel, {
    defaultHeight: 620,
    defaultWidth: 500,
    handleSelector: '.ss-ew-header',
    maxHeight: 820,
    maxWidth: 760,
    minHeight: 360,
    minWidth: 340,
    position: 'fixed',
    snapThreshold: 18,
    storageKey: 's-structures:elastic-workflow-panel',
    viewportPadding: 8,
  });
  refreshRibbon(target);
}

function renderStep(target, bridge, state, body, api) {
  if (state.step === 0) return renderBasisStep(body, state, api);
  if (state.step === 1) return renderLoadsStep(target, body, state, api);
  if (state.step === 2) return renderCombinationStep(target, body, state, api);
  if (state.step === 3) return renderValidationStep(target, bridge, body, state, api);
  if (state.step === 4) return renderFirstOrderStep(target, body, api);
  if (state.step === 5) return renderAdvancedStep(body, api);
  return renderReviewStep(target, body, api);
}

function renderBasisStep(body, state, api) {
  const doc = body.ownerDocument;
  const grid = formGrid(doc);
  grid.appendChild(textField(doc, 'ssEwProjectId', '프로젝트 ID', state.draft.projectId, '예: OFFICE-2026-01'));
  grid.appendChild(selectField(doc, 'ssEwDesignMethod', '설계법', [
    { value: 'strength', label: '강도설계' },
    { value: 'allowable', label: '허용응력설계' },
  ], state.draft.designMethod || 'strength'));
  grid.appendChild(selectField(doc, 'ssEwOccupancy', '주용도', Object.keys(OCCUPANCY_LOAD_PRESETS).map((value) => ({ value, label: OCCUPANCY_LABELS[value] || value })), state.draft.occupancy));
  grid.appendChild(selectField(doc, 'ssEwRegion', '지역', ['seoul', 'central', 'southern', 'coastal'], state.draft.region));
  grid.appendChild(selectField(doc, 'ssEwSoil', '지반종류', ['S1', 'S2', 'S3', 'S4', 'S5'], state.draft.soil));
  grid.appendChild(selectField(doc, 'ssEwImportance', '중요도계수', ['1.0', '1.2', '1.5'], Number(state.draft.importance || 1).toFixed(1)));
  body.appendChild(grid);
  body.appendChild(actionButton(doc, 'ssEwOccupancyDefaults', '용도별 시작값 불러오기', () => api.loadOccupancyDefaults()));
  body.appendChild(note(doc, '시작값은 입력 편의를 위한 후보입니다. 프로젝트 구조계획서와 하중표가 우선합니다.', 'review'));
}

function renderLoadsStep(target, body, state, api) {
  const doc = body.ownerDocument;
  const grid = formGrid(doc);
  const fields = [
    ['ssEwDead', '추가고정하중 D (kN/m²)', 'deadLoad', 0.1],
    ['ssEwLive', '활하중 L (kN/m²)', 'liveLoad', 0.1],
    ['ssEwRoofLive', '지붕활하중 Lr (kN/m²)', 'roofLiveLoad', 0.1],
    ['ssEwWindX', '풍하중 WX (kN/m²)', 'windPressureX', 0.05],
    ['ssEwWindY', '풍하중 WY (kN/m²)', 'windPressureY', 0.05],
    ['ssEwSeismicX', '지진계수 EX', 'seismicCoefficientX', 0.01],
    ['ssEwSeismicY', '지진계수 EY', 'seismicCoefficientY', 0.01],
    ['ssEwSeismicLive', '지진 질량 활하중계수', 'seismicLiveLoadFactor', 0.05],
    ['ssEwMassPerFloor', '층 질량 시작값', 'massPerFloor', 0.1],
  ];
  for (const [id, label, key, step] of fields) grid.appendChild(numberField(doc, id, label, state.draft[key], step));
  body.appendChild(grid);
  body.appendChild(actionButton(doc, 'ssEwApplyLoads', '하중 케이스·하중·질량 적용', () => api.applyLoads(), 'primary'));
  const model = currentModel(target);
  body.appendChild(summaryStrip(doc, [
    ['하중케이스', model.loadCases?.length || 0],
    ['모델하중', model.loads?.length || 0],
    ['질량 절점', (model.nodes || []).filter((node) => node.mass || node.masses).length],
  ]));
}

function renderCombinationStep(target, body, state, api) {
  const doc = body.ownerDocument;
  const model = currentModel(target);
  const audit = auditCombinations(model);
  const alert = audit.invalidStrengthCount
    ? `폐기 대상 1.0D+1.0L 강도조합이 ${audit.invalidStrengthCount}개 있습니다.`
    : audit.reviewRequiredCount
      ? `최신 KDS 후보 강도조합 ${audit.reviewRequiredCount}개가 준비되었습니다. 미리보기 후 프로젝트 승인이 필요합니다.`
      : audit.strengthCount === 0
        ? '강도조합이 없습니다. KDS 조합 미리보기에서 프로젝트 조합을 생성하세요.'
        : '프로젝트 승인 강도조합이 준비되었습니다.';
  const alertKind = audit.invalidStrengthCount ? 'error' : audit.reviewRequiredCount || audit.strengthCount === 0 ? 'review' : 'ok';
  body.appendChild(note(doc, alert, alertKind));
  body.appendChild(summaryStrip(doc, [
    ['프로젝트 ID', state.draft.projectId || '미설정'],
    ['설계법', state.draft.designMethod === 'allowable' ? '허용응력설계' : '강도설계'],
  ]));
  body.appendChild(sectionTitle(doc, '현재 조합'));
  body.appendChild(combinationTable(doc, audit.rows));
  const actions = doc.createElement('div');
  actions.className = 'ss-ew-actions';
  actions.appendChild(actionButton(doc, 'ssEwPreviewCombinations', 'KDS 조합 미리보기', () => api.previewCombinations(), 'primary'));
  actions.appendChild(actionButton(doc, 'ssEwLegacyCombinationEditor', '고급 수동편집', () => api.openLegacyEditor()));
  body.appendChild(actions);

  body.appendChild(note(doc, '규칙: KDS 41 12 00:2022, 국토교통부 고시 2024-846 반영 이력. 공식 URL은 첨부됐지만 원문 파일 hash 독립검증 전이므로 프로젝트 검토 승인이 필요합니다.', 'review'));
  if (state.comboPreview) {
    body.appendChild(sectionTitle(doc, `미리보기 ${state.comboPreview.generated.length}개`));
    body.appendChild(combinationTable(doc, state.comboPreview.generated.map((combo) => ({
      id: combo.id,
      name: formatCombinationFactors(combo.factors),
      type: combo.type,
      status: combo.sourcePreset,
    }))));
    const approval = formGrid(doc);
    approval.appendChild(textField(doc, 'ssEwReviewer', '검토자 ID', state.draft.reviewer, '예: PE-KR-001'));
    approval.appendChild(textField(doc, 'ssEwApprovalNote', '검토 메모', state.draft.approvalNote, '계수·방향·적용하중 확인'));
    approval.appendChild(checkField(doc, 'ssEwApprovalChecked', '프로젝트 기준과 적용범위를 검토했습니다.', state.draft.approvalChecked));
    body.appendChild(approval);
    body.appendChild(actionButton(doc, 'ssEwApplyCombinations', '프로젝트 승인 조합 적용', () => api.applyCombinations(), 'primary'));
  }
}

function renderValidationStep(target, bridge, body, state, api) {
  const doc = body.ownerDocument;
  const result = state.validation || bridge.validateModel?.(currentModel(target));
  body.appendChild(summaryStrip(doc, [
    ['오류', result?.errors?.length || 0],
    ['경고', result?.warnings?.length || 0],
    ['상태', result?.ok === false || result?.errors?.length ? '차단' : '진행 가능'],
  ]));
  body.appendChild(actionButton(doc, 'ssEwRunValidation', '모델 검증 실행', () => api.runValidation(), 'primary'));
  const issues = [...(result?.errors || []), ...(result?.warnings || [])].slice(0, 12);
  if (issues.length) {
    const list = doc.createElement('ul');
    list.className = 'ss-ew-issues';
    for (const issue of issues) {
      const item = doc.createElement('li');
      item.textContent = `${issue.code || 'REVIEW'} · ${issue.target || '-'} · ${issue.message || ''}`;
      list.appendChild(item);
    }
    body.appendChild(list);
  }
}

function renderFirstOrderStep(target, body, api) {
  const doc = body.ownerDocument;
  const item = (currentModel(target).analysisCases || []).find((row) => row.settings?._elasticCommand === 'static' || row.id === 'EL-STATIC');
  body.appendChild(summaryStrip(doc, [
    ['해석 케이스', item?.id || '미생성'],
    ['상태', statusLabel(item?.status || 'not-run')],
    ['방법', '1차 선형 정적'],
  ]));
  body.appendChild(actionButton(doc, 'ssEwRunFirstOrder', '1차 정적해석 실행', () => api.runFirstOrder(), 'primary'));
  body.appendChild(note(doc, '완료 후 전역 평형 잔차, 실패 조합, 최대변위와 비정상적으로 큰 부재력을 먼저 확인합니다.', 'info'));
}

function renderAdvancedStep(body, api) {
  const doc = body.ownerDocument;
  const rows = [
    ['direct-pdelta', 'Direct P-Delta', '축력에 의한 2차효과와 안정성 검토'],
    ['modal', '모달', '고유주기·모드형상·질량참여율 확인'],
    ['rsa', 'RSA', '설계스펙트럼에 대한 방향별 최대 동적응답'],
    ['buckling', '탄성좌굴', '선행조합 축력 기준 고유치 좌굴계수 확인'],
    ['linear-tha', '선형 THA', '기록 기반 시간응답 예비검토 (설계전달 차단)'],
  ];
  const list = doc.createElement('div');
  list.className = 'ss-ew-advanced-list';
  for (const [key, label, reason] of rows) {
    const row = doc.createElement('div');
    row.className = 'ss-ew-advanced-row';
    const text = doc.createElement('div');
    const strong = doc.createElement('strong');
    strong.textContent = label;
    text.appendChild(strong);
    const span = doc.createElement('span');
    span.textContent = reason;
    text.appendChild(span);
    row.appendChild(text);
    row.appendChild(actionButton(doc, null, '설정', () => api.selectAdvanced(key)));
    list.appendChild(row);
  }
  body.appendChild(list);
}

function renderReviewStep(target, body, api) {
  const doc = body.ownerDocument;
  const cases = currentModel(target).analysisCases || [];
  body.appendChild(summaryStrip(doc, [
    ['해석 케이스', cases.length],
    ['완료', cases.filter((item) => item.status === 'ok').length],
    ['검토/예비', cases.filter((item) => ['review-required', 'preliminary', 'designBlocked'].includes(item.status)).length],
  ]));
  const rows = cases.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.kind,
    status: statusLabel(item.status),
  }));
  if (rows.length) body.appendChild(genericTable(doc, ['ID', '케이스', '종류', '상태'], rows.map((row) => [row.id, row.name, row.type, row.status])));
  const actions = doc.createElement('div');
  actions.className = 'ss-ew-actions';
  actions.appendChild(actionButton(doc, 'ssEwOpenAnalysisCenter', '해석 결과 열기', () => api.openAnalysisCenter(), 'primary'));
  actions.appendChild(actionButton(doc, 'ssEwOpenReport', '설계요약 열기', () => api.openReport()));
  body.appendChild(actions);
  body.appendChild(note(doc, '완료 표시만 보지 말고 평형·수렴·질량참여·지배조합·지원범위 경고를 함께 확인합니다.', 'info'));
}

function saveBasis(target, state) {
  const model = currentModel(target);
  state.draft.projectId = ensureWorkflowProjectIdentity(target, model, state.draft.projectId);
  const basis = designBasisInput(state.draft);
  target.SStructuresAgent?.execute?.('setDesignBasisInput', { designBasis: basis });
  model.designBasis ||= createDesignBasis(basis);
  model.designBasis.designMethod = basis.designMethod;
  return basis;
}

function designBasisInput(draft) {
  return {
    occupancy: draft.occupancy,
    designMethod: draft.designMethod || 'strength',
    region: draft.region,
    soil: draft.soil,
    importance: Number(draft.importance) || 1,
    deadLoad: nonNegative(draft.deadLoad, 5),
    liveLoad: nonNegative(draft.liveLoad, 2.5),
    roofLiveLoad: nonNegative(draft.roofLiveLoad, 1),
    windPressureX: nonNegative(draft.windPressureX, 0.7),
    windPressureY: nonNegative(draft.windPressureY, 0.7),
    seismicCoefficientX: nonNegative(draft.seismicCoefficientX, 0.1),
    seismicCoefficientY: nonNegative(draft.seismicCoefficientY, 0.1),
    seismicLiveLoadFactor: nonNegative(draft.seismicLiveLoadFactor, 0.25),
    accidentalEccentricityRatio: nonNegative(draft.accidentalEccentricityRatio, 0.05),
  };
}

function initialDraft(model = {}, projectId = model.projectId || model.meta?.projectId || '') {
  const basis = createDesignBasis({
    occupancy: 'office',
    deadLoad: 5,
    liveLoad: 2.5,
    roofLiveLoad: 1,
    ...(model.designBasis || {}),
  });
  return {
    projectId,
    designMethod: model.designBasis?.designMethod || 'strength',
    occupancy: basis.occupancy || 'office',
    region: basis.region || 'seoul',
    soil: basis.soil || 'S2',
    importance: basis.importance || 1,
    deadLoad: basis.deadLoad ?? 5,
    liveLoad: basis.liveLoad ?? 2.5,
    roofLiveLoad: basis.roofLiveLoad ?? 1,
    windPressureX: basis.windPressureX ?? 0.7,
    windPressureY: basis.windPressureY ?? 0.7,
    seismicCoefficientX: basis.seismicCoefficientX ?? 0.1,
    seismicCoefficientY: basis.seismicCoefficientY ?? 0.1,
    seismicLiveLoadFactor: basis.seismicLiveLoadFactor ?? 0.25,
    massPerFloor: 10,
    reviewer: '',
    approvalNote: '',
    approvalChecked: false,
  };
}

function readDraft(panel, state) {
  const mapping = {
    ssEwProjectId: 'projectId',
    ssEwDesignMethod: 'designMethod',
    ssEwOccupancy: 'occupancy',
    ssEwRegion: 'region',
    ssEwSoil: 'soil',
    ssEwImportance: 'importance',
    ssEwDead: 'deadLoad',
    ssEwLive: 'liveLoad',
    ssEwRoofLive: 'roofLiveLoad',
    ssEwWindX: 'windPressureX',
    ssEwWindY: 'windPressureY',
    ssEwSeismicX: 'seismicCoefficientX',
    ssEwSeismicY: 'seismicCoefficientY',
    ssEwSeismicLive: 'seismicLiveLoadFactor',
    ssEwMassPerFloor: 'massPerFloor',
    ssEwReviewer: 'reviewer',
    ssEwApprovalNote: 'approvalNote',
  };
  for (const [id, key] of Object.entries(mapping)) {
    const input = panel.querySelector?.(`#${id}`);
    if (!input) continue;
    state.draft[key] = input.type === 'number' ? Number(input.value) : input.value;
  }
  const approved = panel.querySelector?.('#ssEwApprovalChecked');
  if (approved) state.draft.approvalChecked = approved.checked === true;
}

function syncDraftFromModel(state, model, target = globalThis) {
  if (!model) return;
  state.draft.projectId = readWorkflowProjectIdentity(target, model, state.draft.projectId);
  state.draft.designMethod = model.designBasis?.designMethod || state.draft.designMethod || 'strength';
}

function cleanLegacyDefaultCombinations(model, approval) {
  model.loadCombinations = (model.loadCombinations || [])
    .filter((combo) => !isInvalidLegacyStrength(combo))
    .map((combo) => {
      if (!isLegacyServiceBaseline(combo)) return combo;
      return {
        ...combo,
        name: '사용성 D + L',
        type: 'service',
        purpose: 'deflection',
        reviewStatus: 'project-reviewed-service-baseline',
        approvalId: approval?.approvalId || null,
      };
    });
}

function auditCombinations(model = {}) {
  const rows = (model.loadCombinations || []).map((combo) => {
    const invalidStrength = isInvalidLegacyStrength(combo);
    const serviceBaseline = isLegacyServiceBaseline(combo);
    const reviewRequired = combo.type === 'strength'
      && combo.approvalStatus !== 'project-approved'
      && (combo.status === 'candidate'
        || combo.reviewStatus === 'legacy-unreviewed'
        || combo.origin === 'rule-pack');
    return {
      id: combo.id,
      name: formatCombinationFactors(combo.factors || {}),
      type: combo.type || 'strength',
      status: invalidStrength
        ? '오류: 1.0D+1.0L은 강도조합 아님'
        : serviceBaseline
          ? '사용성 기준조합'
          : combo.approvalStatus === 'project-approved'
            ? '프로젝트 승인'
            : reviewRequired
              ? '검토 필요'
              : '사용자 정의',
      invalidStrength,
      reviewRequired,
      approvedStrength: combo.type === 'strength' && combo.approvalStatus === 'project-approved',
    };
  });
  return {
    rows,
    count: rows.length,
    invalidStrengthCount: rows.filter((row) => row.invalidStrength).length,
    strengthCount: rows.filter((row) => row.type === 'strength').length,
    reviewRequiredCount: rows.filter((row) => row.reviewRequired).length,
    approvedStrengthCount: rows.filter((row) => row.approvedStrength).length,
    approvedCount: rows.filter((row) => row.status === '프로젝트 승인').length,
  };
}

function isInvalidLegacyStrength(combo = {}) {
  return (combo.type === 'strength' || !combo.type)
    && isOnlyDeadLiveOne(combo.factors)
    && combo.userModified !== true
    && (!combo.origin || combo.origin === 'legacy' || ['CO1', 'ULS1'].includes(combo.id));
}

function isLegacyServiceBaseline(combo = {}) {
  return combo.type === 'service' && isOnlyDeadLiveOne(combo.factors);
}

function isOnlyDeadLiveOne(factors = {}) {
  const active = Object.entries(factors || {}).filter(([, factor]) => Math.abs(Number(factor) || 0) > 1e-12);
  return active.length === 2
    && Number(factors.D) === 1
    && Number(factors.L) === 1;
}

function workflowStepStatuses(target, model, state) {
  const validation = state.validation || target.SStructuresEngine?.validateModel?.(model);
  const comboAudit = auditCombinations(model);
  const cases = model.analysisCases || [];
  const firstOrder = cases.find((item) => item.settings?._elasticCommand === 'static' || item.id === 'EL-STATIC');
  const latestFirstOrder = firstOrder ? target.SStructuresEngine?.getAnalysisLatestAttempt?.(firstOrder.id) : null;
  const advanced = cases.filter((item) => item.id !== firstOrder?.id && item.kind !== 'static');
  const hasD = (model.loadCases || []).some((item) => item.family === 'D' || item.type === 'dead' || item.id === 'D');
  const hasL = (model.loadCases || []).some((item) => item.family === 'L' || item.type === 'live' || item.id === 'L');
  const hasMass = (model.nodes || []).some((node) => node.mass || node.masses) || (model.massSources || []).length > 0;
  const statuses = [
    state.draft.projectId && state.draft.designMethod ? 'complete' : 'required',
    hasD && hasL && (model.loads || []).length && hasMass ? 'complete' : 'required',
    comboAudit.approvedStrengthCount > 0
      && comboAudit.invalidStrengthCount === 0
      && comboAudit.reviewRequiredCount === 0 ? 'complete' : 'required',
    validation && !(validation.errors || []).length ? 'complete' : 'required',
    firstOrder?.status === 'ok' && latestFirstOrder?.status !== 'failed' ? 'complete' : 'required',
    advanced.some((item) => ['ok', 'preliminary', 'review-required'].includes(item.status)) ? 'complete' : 'optional',
    cases.some((item) => ['ok', 'preliminary', 'review-required'].includes(item.status)) ? 'complete' : 'required',
  ];
  return ELASTIC_SETUP_STEPS.map((step, index) => ({ ...step, status: statuses[index] }));
}

function firstRequiredStep(target) {
  const statuses = workflowStepStatuses(target, currentModel(target), target.SStructuresElasticSetupWorkflow?.state || { draft: initialDraft(currentModel(target)) });
  const index = statuses.findIndex((item) => item.status === 'required');
  return index < 0 ? 0 : index;
}

function workflowNeedsAttention(model) {
  const audit = auditCombinations(model);
  return !model?.meta?.projectId
    || !model?.designBasis?.designMethod
    || audit.invalidStrengthCount > 0
    || audit.reviewRequiredCount > 0
    || audit.approvedStrengthCount === 0;
}

function refreshRibbon(target, ribbon = null) {
  const view = ribbon || {
    stepButtons: [...target.document?.querySelectorAll?.('[data-ss-elastic-step]') || []],
    raw: target.document?.getElementById?.('ssElasticRawLoadToggle'),
  };
  if (!view) return;
  const statuses = workflowStepStatuses(target, currentModel(target), target.SStructuresElasticSetupWorkflow?.state || { draft: initialDraft(currentModel(target)) });
  view.stepButtons?.forEach?.((button, index) => {
    const status = statuses[index]?.status || 'required';
    button.setAttribute('data-status', status);
    button.classList?.toggle('active', target.SStructuresElasticSetupWorkflow?.state?.open && target.SStructuresElasticSetupWorkflow.state.step === index);
    const marker = button.querySelector?.('.ss-step-state');
    if (marker) marker.textContent = status === 'complete' ? '✓' : status === 'required' ? '!' : '';
  });
  view.raw?.classList?.toggle('active', target.SStructuresElasticSetupWorkflow?.state?.rawControlsVisible === true);
}

function syncRawControls(doc, visible) {
  doc.body?.classList?.toggle('ss-elastic-raw-load-visible', visible === true);
  const button = doc.getElementById?.('ssElasticRawLoadToggle');
  button?.setAttribute('title', visible ? '상세 하중 입력 숨기기' : '상세 하중 입력 표시');
}

function decorateLegacyEditor(doc) {
  const modal = doc.getElementById?.('lcModal');
  const title = modal?.querySelector?.('h2');
  if (title) title.textContent = '수동 하중케이스·조합 편집 (고급)';
  const preset = doc.getElementById?.('coPreset');
  if (preset) {
    preset.textContent = '교육용 예비 프리셋';
    preset.setAttribute('title', '공식 설계조합이 아니며 실무 적용 전 별도 검토가 필요합니다.');
  }
}

function combinationTable(doc, rows) {
  return genericTable(doc, ['ID', '조합식', '구분', '상태'], rows.map((row) => [row.id, row.name, row.type, row.status]));
}

function genericTable(doc, headers, rows) {
  const wrap = doc.createElement('div');
  wrap.className = 'ss-ew-table-wrap';
  const table = doc.createElement('table');
  table.className = 'ss-ew-table';
  const head = doc.createElement('tr');
  for (const header of headers) {
    const cell = doc.createElement('th');
    cell.textContent = header;
    head.appendChild(cell);
  }
  table.appendChild(head);
  for (const values of rows) {
    const row = doc.createElement('tr');
    for (const value of values) {
      const cell = doc.createElement('td');
      cell.textContent = String(value ?? '-');
      row.appendChild(cell);
    }
    table.appendChild(row);
  }
  wrap.appendChild(table);
  return wrap;
}

function formGrid(doc) {
  const grid = doc.createElement('div');
  grid.className = 'ss-ew-form-grid';
  return grid;
}

function textField(doc, id, label, value, placeholder = '') {
  return inputField(doc, id, label, 'text', value, { placeholder });
}

function numberField(doc, id, label, value, step = 0.1) {
  return inputField(doc, id, label, 'number', value, { min: 0, step });
}

function inputField(doc, id, label, type, value, attributes = {}) {
  const wrap = doc.createElement('label');
  wrap.className = 'ss-ew-field';
  const title = doc.createElement('span');
  title.textContent = label;
  wrap.appendChild(title);
  const input = doc.createElement('input');
  input.id = id;
  input.setAttribute('id', id);
  input.type = type;
  input.value = value == null ? '' : String(value);
  for (const [key, next] of Object.entries(attributes)) input.setAttribute(key, next);
  wrap.appendChild(input);
  return wrap;
}

function selectField(doc, id, label, options, selected) {
  const wrap = doc.createElement('label');
  wrap.className = 'ss-ew-field';
  const title = doc.createElement('span');
  title.textContent = label;
  wrap.appendChild(title);
  const select = doc.createElement('select');
  select.id = id;
  select.setAttribute('id', id);
  for (const entry of options) {
    const value = typeof entry === 'object' ? entry.value : entry;
    const labelText = typeof entry === 'object' ? entry.label : entry;
    const option = doc.createElement('option');
    option.value = value;
    option.textContent = labelText;
    select.appendChild(option);
  }
  select.value = selected;
  wrap.appendChild(select);
  return wrap;
}

function checkField(doc, id, label, checked) {
  const wrap = doc.createElement('label');
  wrap.className = 'ss-ew-check';
  const input = doc.createElement('input');
  input.id = id;
  input.setAttribute('id', id);
  input.type = 'checkbox';
  input.checked = checked === true;
  wrap.appendChild(input);
  const span = doc.createElement('span');
  span.textContent = label;
  wrap.appendChild(span);
  return wrap;
}

function actionButton(doc, id, label, onClick, className = '') {
  const button = doc.createElement('button');
  button.type = 'button';
  if (id) {
    button.id = id;
    button.setAttribute('id', id);
    button.setAttribute('data-agent-id', id);
  }
  button.className = `ss-ew-button ${className}`.trim();
  button.textContent = label;
  button.addEventListener?.('click', onClick);
  return button;
}

function note(doc, text, kind = 'info') {
  const div = doc.createElement('div');
  div.className = `ss-ew-note note-${kind}`;
  div.textContent = text;
  return div;
}

function sectionTitle(doc, text) {
  const heading = doc.createElement('h3');
  heading.className = 'ss-ew-section-title';
  heading.textContent = text;
  return heading;
}

function summaryStrip(doc, rows) {
  const wrap = doc.createElement('div');
  wrap.className = 'ss-ew-summary';
  for (const [label, value] of rows) {
    const item = doc.createElement('div');
    const key = doc.createElement('span');
    key.textContent = label;
    item.appendChild(key);
    const data = doc.createElement('strong');
    data.textContent = String(value ?? '-');
    item.appendChild(data);
    wrap.appendChild(item);
  }
  return wrap;
}

function statusLabel(status) {
  const labels = {
    'not-run': '미실행', running: '실행 중', ok: '완료', failed: '실패', stale: '재실행 필요',
    'review-required': '검토 필요', preliminary: '예비 결과', designBlocked: '설계전달 차단',
  };
  return labels[status] || status || '미실행';
}

function currentModel(target) {
  return target?.SStructuresEngine?.getCurrentModel?.() || (typeof target?.model === 'function' ? target.model() : {}) || {};
}

function ensureWorkflowProjectIdentity(target, model = {}, draftProjectId = '') {
  const projectId = readWorkflowProjectIdentity(target, model, draftProjectId);
  if (model && typeof model === 'object') {
    model.meta ||= {};
    model.meta.projectId = projectId;
  }
  return projectId;
}

function readWorkflowProjectIdentity(target, model = {}, draftProjectId = '') {
  return authoritativeProjectId(target, model)
    || String(draftProjectId || '').trim()
    || String(model.meta?.projectId || '').trim()
    || 'LOCAL-MODEL';
}

function authoritativeProjectId(target, model = {}) {
  const modelProjectId = String(model.projectId || '').trim();
  if (modelProjectId) return modelProjectId;
  try {
    return String(new URLSearchParams(target?.location?.search || '').get('project') || '').trim();
  } catch {
    return '';
  }
}

function formatApprovalBlockers(blockers = []) {
  const labels = {
    'project-approval-project-required': '프로젝트 ID가 필요합니다',
    'project-approval-project-mismatch': '미리보기와 현재 프로젝트 ID가 다릅니다. 미리보기를 다시 실행하세요',
    'project-approval-reviewer-required': '검토자 ID가 필요합니다',
    'project-approval-note-required': '검토 메모가 필요합니다',
    'project-approval-reviewed-at-invalid': '검토 시각이 올바르지 않습니다',
    'project-approval-model-stale': '미리보기 후 모델이 변경되었습니다. 미리보기를 다시 실행하세요',
    'project-approval-method-mismatch': '미리보기와 현재 설계법이 다릅니다. 미리보기를 다시 실행하세요',
    'project-approval-rule-snapshot-stale': '기준 조합 스냅샷이 변경되었습니다. 미리보기를 다시 실행하세요',
    'project-approval-preview-tampered': '조합 미리보기 무결성을 확인할 수 없습니다',
    'approval-preview-required': '조합 미리보기가 필요합니다',
    'approval-preview-blocked': '현재 조합 미리보기를 승인할 수 없습니다',
    'approval-combinations-required': '적용할 조합이 없습니다',
  };
  return [...new Set(blockers)].map((code) => labels[code] || code).join(' · ');
}

function clampStep(value) {
  return Math.max(0, Math.min(ELASTIC_SETUP_STEPS.length - 1, Math.trunc(Number(value) || 0)));
}

function nonNegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(3)) : 0;
}

function clear(element) {
  while (element.children?.length) element.removeChild(element.children[0]);
  element.innerHTML = '';
}

function injectStyle(doc) {
  if (doc.getElementById?.('ssElasticWorkflowStyle')) return;
  const style = doc.createElement('style');
  style.id = 'ssElasticWorkflowStyle';
  style.setAttribute('id', style.id);
  style.textContent = `
    body.ss-guided-elastic-ready:not(.ss-elastic-raw-load-visible) #ssKdsPanel{display:none!important}
    .ss-elastic-workflow{position:fixed;left:18px;top:96px;width:min(500px,calc(100vw - 36px));min-width:340px;min-height:360px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);z-index:38;overflow:auto;border:1px solid #c4d4e1;background:#f8fbfd;padding:10px 10px 14px;box-shadow:0 16px 34px rgba(15,36,54,.2);font:12px/1.45 Arial,sans-serif;color:#172635}
    .ss-elastic-workflow.is-closed{display:none}
    .ss-ew-header{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px;cursor:move}.ss-ew-header h2{margin:0;font-size:15px;color:#123f60}.ss-ew-progress{color:#607384}.ss-ew-close{padding:4px 8px}
    .ss-ew-nav{display:flex;gap:3px;overflow-x:auto;margin:8px 0;padding-bottom:2px}.ss-ew-nav-step{height:28px;flex:0 0 auto;border:1px solid #cad7e2;background:#fff;border-radius:4px;padding:0 7px;color:#405b70;font-size:11px}.ss-ew-nav-step.active{background:#07598f;border-color:#07598f;color:#fff}.ss-ew-nav-step[data-status="complete"]:not(.active){border-color:#7fb193;color:#126b3c}.ss-ew-nav-step[data-status="required"]:not(.active){border-color:#d4aa55;color:#745200}
    .ss-ew-purpose{display:grid;gap:3px;border-left:3px solid #07598f;background:#edf5fa;padding:8px 9px}.ss-ew-purpose strong{font-size:13px;color:#123f60}.ss-ew-purpose span{color:#4d6578}
    .ss-ew-body{display:grid;gap:8px;margin-top:9px}.ss-ew-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.ss-ew-field{display:grid;gap:3px;min-width:0}.ss-ew-field>span{color:#5b7183}.ss-ew-field input,.ss-ew-field select{box-sizing:border-box;width:100%;min-width:0;height:30px;border:1px solid #c6d5e1;border-radius:4px;background:#fff;padding:3px 6px;color:#172635}.ss-ew-check{display:flex;align-items:flex-start;gap:6px;grid-column:1/-1}.ss-ew-check input{width:16px;height:16px;flex:none}
    .ss-ew-button{min-height:30px;border:1px solid #c6d5e1;border-radius:4px;background:#fff;color:#24475f;padding:4px 9px}.ss-ew-button:hover{background:#edf5fa}.ss-ew-button.primary{background:#07598f;border-color:#07598f;color:#fff;font-weight:700}.ss-ew-button:disabled{opacity:.45}.ss-ew-actions{display:flex;flex-wrap:wrap;gap:6px}
    .ss-ew-note,.ss-ew-message{border:1px solid #dce6ee;background:#fff;padding:7px 8px;overflow-wrap:anywhere}.note-ok,.message-ok{border-color:#b9dcc7;background:#f1faf5;color:#126b3c}.note-review,.message-review{border-color:#ead49a;background:#fff9e9;color:#745200}.note-error,.message-error{border-color:#edbaba;background:#fff5f5;color:#942222}.note-info,.message-info{color:#4d6578}
    .ss-ew-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:5px}.ss-ew-summary>div{display:grid;gap:2px;border:1px solid #dce6ee;background:#fff;padding:6px}.ss-ew-summary span{color:#607384}.ss-ew-summary strong{color:#173f5c}
    .ss-ew-section-title{margin:2px 0 0;font-size:12px;color:#294a62}.ss-ew-table-wrap{max-height:210px;overflow:auto;border:1px solid #dce6ee;background:#fff}.ss-ew-table{width:100%;border-collapse:collapse;table-layout:auto}.ss-ew-table th,.ss-ew-table td{border-bottom:1px solid #e6edf3;padding:5px;text-align:left;vertical-align:top;white-space:nowrap}.ss-ew-table th{position:sticky;top:0;background:#eef4f8;color:#526b7f}.ss-ew-table td:nth-child(2){white-space:normal;min-width:130px}
    .ss-ew-issues{margin:0;padding:0 0 0 18px;display:grid;gap:4px}.ss-ew-advanced-list{display:grid;gap:5px}.ss-ew-advanced-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;border:1px solid #dce6ee;background:#fff;padding:7px}.ss-ew-advanced-row>div{display:grid;gap:2px}.ss-ew-advanced-row span{color:#607384}
    .ss-ew-footer{display:flex;justify-content:space-between;gap:8px;position:sticky;bottom:-14px;margin:10px -10px -14px;padding:9px 10px;background:#f8fbfd;border-top:1px solid #dce6ee}
    .ss-elastic-workflow-step{position:relative;height:34px;padding:0 7px}.ss-step-number{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:50%;background:#e6eef5;color:#36566d;font-size:10px;font-weight:700}.ss-step-state{min-width:8px;font-size:9px}.ss-elastic-workflow-step[data-status="complete"]{border-color:#78aa8b;color:#126b3c}.ss-elastic-workflow-step[data-status="required"]{border-color:#d4aa55;color:#745200}.ss-elastic-workflow-step.active{background:#07598f;border-color:#07598f;color:#fff}.ss-elastic-workflow-step.active .ss-step-number{background:#fff;color:#07598f}.ss-elastic-raw-toggle{width:30px;justify-content:center;padding:0}
    @media(max-width:520px){.ss-elastic-workflow{left:8px!important;top:8px!important;width:calc(100vw - 16px)!important;min-width:0!important}.ss-ew-form-grid{grid-template-columns:1fr}.ss-ew-check{grid-column:1}.ss-ew-header{grid-template-columns:minmax(0,1fr) auto}.ss-ew-progress{display:none}}
  `;
  (doc.head || doc.documentElement || doc.body)?.appendChild?.(style);
}
