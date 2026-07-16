import { createProductionNonlinearCase, NONLINEAR_PRODUCT_STAGES } from '../nonlinear/product/preflight.js';
import { installFloatingPanel } from './floatingPanel.js';
import { createRibbonGroup } from './indexNativeRibbonDom.js';

export const NONLINEAR_WORKFLOW_UI_VERSION = 'p9-m9-nonlinear-workflow-ui-v2';

const PANEL_STORAGE_KEY = 's-structures:nonlinear-workflow:p8-m10';
const PURPOSES = Object.freeze({
  model: '지점, 연결, 부재 참조와 지원 범위를 먼저 확인해야 잘못된 모델을 수치해석이 정상 결과처럼 처리하지 않습니다.',
  gravity: '비선형 횡응답과 시간이력은 실제 축력과 초기 변형을 가진 수렴된 중력 선행상태에서 시작해야 합니다.',
  properties: '힌지 또는 fiber 속성은 항복강도, 소성변형과 이력거동을 정의합니다. 자동 배정도 원본과 덮어쓰기 차이를 검토한 뒤 적용합니다.',
  control: 'Pushover 경로 또는 NLTH 시간적분의 증분과 수렴기준을 고정해야 실패 위치와 결과 재현성이 명확해집니다.',
  groundMotion: 'NLTH는 모델 질량원과 단위가 확인된 가속도 시간이력을 함께 사용해야 실제 3D 관성력을 조립할 수 있습니다.',
  run: '실행 전에 지원 범위, 도메인 변경, 자유도, 메모리, Worker와 backend를 확인합니다.',
  results: '해석 완료와 설계값 사용 가능은 다릅니다. 결과, 수렴, 경고, 검증등급과 stale 상태를 함께 검토합니다.',
});

export function installNonlinearWorkflow(target = globalThis, options = {}) {
  const doc = target?.document;
  const bridge = options.bridge || target?.SStructuresEngine;
  if (!doc?.createElement || (!bridge?.getProductAnalysisService && !bridge?.getNonlinearProductService)) return null;
  if (target.SStructuresNonlinearWorkflow) return target.SStructuresNonlinearWorkflow;

  injectStyles(doc);
  const service = bridge.getProductAnalysisService?.() || bridge.getNonlinearProductService();
  const host = doc.getElementById?.(options.hostId || 'canvasWrap') || doc.getElementById?.('main') || doc.body;
  const root = ensureRoot(doc, host);
  const state = {
    open: false,
    mode: 'pushover',
    step: 0,
    drafts: {},
    preflight: null,
    currentJobId: null,
    currentJob: null,
    message: null,
    messageTone: 'info',
    renderingQueued: false,
    computeTarget: readComputeTarget(target),
  };

  const api = {
    version: NONLINEAR_WORKFLOW_UI_VERSION,
    root,
    state,
    open(input = {}) {
      if (typeof input === 'string') input = { mode: input };
      if (input.mode) state.mode = normalizeMode(input.mode);
      if (input.step != null) state.step = clampStep(input.step);
      state.open = true;
      ensureDraft(target, bridge, state);
      render(target, bridge, service, state, root, api);
      target.SStructuresFloatingPanels?.recordVisibility?.('nonlinear-workflow', true);
      return api.getState();
    },
    close() {
      readVisibleForm(target, state, root);
      state.open = false;
      render(target, bridge, service, state, root, api);
      target.SStructuresFloatingPanels?.recordVisibility?.('nonlinear-workflow', false);
      return api.getState();
    },
    setMode(mode) {
      readVisibleForm(target, state, root);
      state.mode = normalizeMode(mode);
      state.step = 0;
      ensureDraft(target, bridge, state);
      state.message = null;
      render(target, bridge, service, state, root, api);
      return api.getState();
    },
    go(step) {
      readVisibleForm(target, state, root);
      state.step = clampStep(step);
      state.message = null;
      render(target, bridge, service, state, root, api);
      return api.getState();
    },
    refresh() {
      ensureDraft(target, bridge, state);
      render(target, bridge, service, state, root, api);
      return api.getState();
    },
    run() {
      readVisibleForm(target, state, root);
      const draft = ensureDraft(target, bridge, state);
      state.preflight = service.validate({
        analysisCase: draft,
        requireWorker: true,
        computeTarget: state.computeTarget,
        previousDomainHashes: latestDomainHashes(bridge, draft.id),
      });
      if (!state.preflight.ok) {
        state.open = true;
        state.step = firstBlockedStep(state.preflight);
        state.message = state.preflight.blocking[0]?.message || '실행 전 입력을 수정해야 합니다.';
        state.messageTone = 'error';
        render(target, bridge, service, state, root, api);
        return api.getState();
      }
      const job = (bridge.startAnalysisRun || bridge.startNonlinearRun).call(bridge, {
        analysisCase: draft,
        requireWorker: true,
        computeTarget: state.computeTarget,
        previousDomainHashes: latestDomainHashes(bridge, draft.id),
      });
      state.currentJobId = job.id;
      state.currentJob = job;
      state.step = 5;
      state.open = true;
      state.message = 'Production Worker 실행을 시작했습니다.';
      state.messageTone = 'info';
      render(target, bridge, service, state, root, api);
      return api.getState();
    },
    pause() {
      if (!state.currentJobId) return api.getState();
      state.currentJob = (bridge.pauseAnalysisRun || bridge.pauseNonlinearRun).call(bridge, state.currentJobId);
      render(target, bridge, service, state, root, api);
      return api.getState();
    },
    cancel() {
      if (!state.currentJobId) return api.getState();
      state.currentJob = (bridge.cancelAnalysisRun || bridge.cancelNonlinearRun).call(bridge, state.currentJobId);
      render(target, bridge, service, state, root, api);
      return api.getState();
    },
    resume() {
      if (!state.currentJobId) return api.getState();
      const job = (bridge.resumeAnalysisRun || bridge.resumeNonlinearRun).call(bridge, state.currentJobId, { computeTarget: state.computeTarget });
      state.currentJobId = job.id;
      state.currentJob = job;
      render(target, bridge, service, state, root, api);
      return api.getState();
    },
    retry() {
      if (!state.currentJobId) return api.run();
      const job = (bridge.retryAnalysisRun || bridge.retryNonlinearRun).call(bridge, state.currentJobId, { computeTarget: state.computeTarget });
      state.currentJobId = job.id;
      state.currentJob = job;
      render(target, bridge, service, state, root, api);
      return api.getState();
    },
    applyAssignments() {
      const preview = state.preflight?.assignment?.preview;
      if (!preview || preview.status !== 'ready') {
        state.message = '적용 가능한 자동 배정 미리보기가 없습니다. 재료·단면과 RC 보강근거를 확인하세요.';
        state.messageTone = 'error';
      } else {
        try {
          bridge.applyNonlinearAssignments(preview);
          state.message = `${preview.assignments.length}개 힌지 배정을 모델에 적용했습니다.`;
          state.messageTone = 'ok';
          refreshDraftFromStoredCase(target, state);
        } catch (error) {
          state.message = error?.message || '비선형 속성 배정에 실패했습니다.';
          state.messageTone = 'error';
        }
      }
      render(target, bridge, service, state, root, api);
      return api.getState();
    },
    openResults() {
      if (state.currentJobId) target.SStructuresNonlinearResultPopup?.openJob?.(state.currentJobId);
      else target.SStructuresNonlinearResultPopup?.open?.();
      return api.getState();
    },
    setComputeTarget(computeTarget) {
      state.computeTarget = ['auto', 'cpu', 'gpu'].includes(computeTarget) ? computeTarget : 'auto';
      target.localStorage?.setItem?.('s-structures:compute-target', state.computeTarget);
      render(target, bridge, service, state, root, api);
      return api.getState();
    },
    getState() {
      return {
        version: NONLINEAR_WORKFLOW_UI_VERSION,
        open: state.open,
        mode: state.mode,
        step: state.step,
        caseId: state.drafts[state.mode]?.id || null,
        preflightStatus: state.preflight?.status || null,
        blockingCount: state.preflight?.blocking?.length || 0,
        currentJobId: state.currentJobId,
        currentJobStatus: state.currentJob?.status || null,
        resultAvailable: state.currentJob?.resultAvailable === true,
        computeTarget: state.computeTarget,
      };
    },
  };

  target.SStructuresNonlinearWorkflow = api;
  installRibbon(target, api);
  api.unsubscribe = service.subscribe((job, event) => {
    if (job.id !== state.currentJobId) return;
    state.currentJob = job;
    if (event === 'completed') {
      state.step = 6;
      state.message = '해석이 완료되었습니다. 결과의 검증등급과 설계전달 차단 상태를 확인하세요.';
      state.messageTone = 'ok';
      target.SStructuresNonlinearResultPopup?.openJob?.(job.id);
    } else if (['failed', 'blocked'].includes(event)) {
      state.message = job.error?.message || job.progressMessage;
      state.messageTone = 'error';
    }
    queueRender(target, () => render(target, bridge, service, state, root, api), state);
  });
  ensureDraft(target, bridge, state);
  render(target, bridge, service, state, root, api);
  return api;
}

function render(target, bridge, service, state, root, api) {
  const doc = root.ownerDocument;
  const draft = ensureDraft(target, bridge, state);
  state.preflight = service.validate({
    analysisCase: draft,
    requireWorker: true,
    computeTarget: state.computeTarget,
    previousDomainHashes: latestDomainHashes(bridge, draft.id),
  });
  clear(root);
  root.style.display = state.open ? 'flex' : 'none';
  root.classList?.toggle?.('is-open', state.open);
  root.setAttribute?.('aria-hidden', state.open ? 'false' : 'true');
  root.setAttribute?.('data-mode', state.mode);
  root.setAttribute?.('data-step', String(state.step));

  root.appendChild(renderHeader(doc, state, api));
  root.appendChild(renderSteps(doc, state, api));
  const body = doc.createElement('div');
  body.className = 'ss-nl-workflow-body';
  const stage = NONLINEAR_PRODUCT_STAGES[state.step];
  const heading = doc.createElement('h3');
  heading.textContent = `${state.step + 1}. ${stage.label}`;
  body.appendChild(heading);
  const purpose = doc.createElement('p');
  purpose.className = 'ss-nl-purpose';
  purpose.textContent = PURPOSES[stage.id];
  body.appendChild(purpose);
  const stageState = state.preflight.stages.find((row) => row.id === stage.id);
  if (stageState?.issues?.length) body.appendChild(renderIssues(doc, stageState.issues, api, target, state));
  if (state.message) body.appendChild(note(doc, state.message, state.messageTone));
  body.appendChild(renderStage(doc, target, bridge, state, stage.id, api));
  root.appendChild(body);
  root.appendChild(renderFooter(doc, state, api));

  installFloatingPanel(target, root, {
    allowPanelHandle: false,
    boundsElement: root.parentNode?.id === 'canvasWrap' ? root.parentNode : null,
    defaultWidth: 540,
    defaultHeight: 620,
    minWidth: 380,
    minHeight: 360,
    maxWidth: 820,
    maxHeight: 940,
    handleSelector: '.ss-nl-workflow-header',
    position: root.parentNode?.id === 'canvasWrap' ? 'absolute' : 'fixed',
    storageKey: PANEL_STORAGE_KEY,
    snapThreshold: 18,
    viewportPadding: 10,
    suspendClamp: (runtime) => Number(runtime?.innerWidth) <= 760,
  });
  syncRibbon(target, state);
}

function renderHeader(doc, state, api) {
  const header = doc.createElement('header');
  header.className = 'ss-nl-workflow-header';
  header.setAttribute('data-ss-floating-handle', '1');
  const title = doc.createElement('div');
  const h2 = doc.createElement('h2');
  h2.textContent = 'Production 비선형해석';
  title.appendChild(h2);
  const meta = doc.createElement('span');
  meta.textContent = `${state.mode === 'pushover' ? 'Pushover' : 'MDOF NLTH'} · ${qualificationLabel(state.preflight)}`;
  title.appendChild(meta);
  header.appendChild(title);
  const actions = doc.createElement('div');
  actions.className = 'ss-nl-head-actions';
  actions.appendChild(segmentButton(doc, 'ssNlModePushover', 'Pushover', state.mode === 'pushover', () => api.setMode('pushover')));
  actions.appendChild(segmentButton(doc, 'ssNlModeNlth', 'NLTH', state.mode === 'nlth', () => api.setMode('nlth')));
  actions.appendChild(iconButton(doc, 'ssNlWorkflowClose', '×', '비선형해석 설정 닫기', () => api.close()));
  header.appendChild(actions);
  return header;
}

function renderSteps(doc, state, api) {
  const nav = doc.createElement('nav');
  nav.className = 'ss-nl-steps';
  nav.setAttribute('aria-label', '비선형해석 단계');
  NONLINEAR_PRODUCT_STAGES.forEach((stage, index) => {
    const status = state.preflight?.stages?.find((row) => row.id === stage.id)?.status || 'pending';
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = `${index + 1} ${stage.label}`;
    button.className = index === state.step ? 'active' : '';
    button.setAttribute('data-stage-status', status);
    button.setAttribute('aria-current', index === state.step ? 'step' : 'false');
    button.addEventListener?.('click', () => api.go(index));
    nav.appendChild(button);
  });
  return nav;
}

function renderStage(doc, target, bridge, state, stage, api) {
  if (stage === 'model') return renderModelStage(doc, target, state);
  if (stage === 'gravity') return renderGravityStage(doc, target, state);
  if (stage === 'properties') return renderPropertyStage(doc, target, state, api);
  if (stage === 'control') return renderControlStage(doc, bridge, state, api);
  if (stage === 'groundMotion') return renderGroundMotionStage(doc, target, state);
  if (stage === 'run') return renderRunStage(doc, state, api);
  return renderResultStage(doc, bridge, state, api);
}

function renderModelStage(doc, target, state) {
  const section = band(doc);
  const model = currentModel(target);
  section.appendChild(metricGrid(doc, [
    ['절점', model.nodes?.length || 0],
    ['부재', model.members?.length || 0],
    ['활성 DOF', state.preflight?.runtime?.dofCount ?? '-'],
    ['검증 오류', state.preflight?.modelValidation?.errors?.length || 0],
  ]));
  section.appendChild(actionButton(doc, 'ssNlOpenModelEditor', '모델링 화면에서 수정', () => openModelEditor(target)));
  if (state.preflight?.domainDiff?.previousAvailable) {
    section.appendChild(note(doc, state.preflight.domainDiff.changed.length
      ? `이전 실행 후 변경된 도메인: ${state.preflight.domainDiff.changed.join(', ')}`
      : '이전 실행과 구조 도메인이 같습니다.', state.preflight.domainDiff.changed.length ? 'warning' : 'ok'));
  }
  return section;
}

function renderGravityStage(doc, target, state) {
  const section = band(doc);
  const model = currentModel(target);
  section.appendChild(selectField(doc, 'ssNlGravityCombo', '중력 하중조합', model.loadCombinations || [], state.drafts[state.mode].settings.gravityCombinationId, (row) => row.id, (row) => `${row.id} · ${row.name || row.id}`));
  section.appendChild(metricGrid(doc, [
    ['하중케이스', model.loadCases?.length || 0],
    ['조합', model.loadCombinations?.length || 0],
    ['선택', state.preflight?.gravity?.combinationId || '-'],
    ['Load-set', shortHash(state.preflight?.gravity?.loadSetHash)],
  ]));
  section.appendChild(actionButton(doc, 'ssNlOpenLoadMassEditor', '기존 하중·질량 편집 열기', () => target.SStructuresElasticSetupWorkflow?.open?.(1)));
  return section;
}

function renderPropertyStage(doc, target, state, api) {
  const section = band(doc);
  const preview = state.preflight?.assignment?.preview;
  section.appendChild(metricGrid(doc, [
    ['비선형 부재', state.preflight?.assignment?.nonlinearMemberCount || 0],
    ['현재 힌지', state.preflight?.assignment?.resolvedAssignmentCount || 0],
    ['자동 후보', preview?.assignments?.length || 0],
    ['덮어쓰기', preview?.diff?.filter((row) => row.mode === 'user-override').length || 0],
  ]));
  const actions = doc.createElement('div');
  actions.className = 'ss-nl-actions';
  actions.appendChild(actionButton(doc, 'ssNlOpenPropertyEditor', '기존 재료·단면 편집', () => openPropertyEditor(target)));
  const apply = actionButton(doc, 'ssNlApplyAssignments', '검토한 자동 배정 적용', () => api.applyAssignments(), 'primary');
  apply.disabled = preview?.status !== 'ready';
  actions.appendChild(apply);
  section.appendChild(actions);
  if (preview?.diff?.length) section.appendChild(assignmentTable(doc, preview.diff.slice(0, 120), preview.properties));
  return section;
}

function renderControlStage(doc, bridge, state, api) {
  const section = band(doc);
  const settings = state.drafts[state.mode].settings;
  section.appendChild(renderComputeTargets(doc, bridge, state, api));
  if (state.mode === 'pushover') {
    section.appendChild(selectValuesField(doc, 'ssNlDirection', '방향', ['+x', '-x', '+y', '-y'], settings.direction));
    section.appendChild(selectValuesField(doc, 'ssNlPattern', '횡하중 패턴', ['triangular', 'uniform', 'modal', 'user'], settings.pattern));
    section.appendChild(textField(doc, 'ssNlControlNode', '제어절점', settings.controlNodeId));
    section.appendChild(numberField(doc, 'ssNlTargetDisplacement', '목표변위 (m)', settings.targetDisplacement, 0.001));
    section.appendChild(numberField(doc, 'ssNlSteps', '기본 증분 수', settings.steps, 1));
    section.appendChild(checkboxField(doc, 'ssNlArcEnabled', 'Post-peak arc-length 연속해석', settings.arcLength?.enabled === true));
  } else {
    section.appendChild(numberField(doc, 'ssNlOutputDt', '출력 간격 (s)', settings.newmark?.outputDt, 0.001));
    section.appendChild(numberField(doc, 'ssNlInitialDt', '초기 적분 간격 (s)', settings.newmark?.initialDt, 0.001));
    section.appendChild(numberField(doc, 'ssNlMinDt', '최소 적분 간격 (s)', settings.newmark?.minDt, 0.000001));
    section.appendChild(numberField(doc, 'ssNlMaxIterations', '스텝당 최대 Newton 반복', settings.newmark?.maxIterations, 1));
    section.appendChild(numberField(doc, 'ssNlDampingAlpha', 'Rayleigh α', settings.damping?.coefficients?.alpha, 0.0001));
    section.appendChild(numberField(doc, 'ssNlDampingBeta', 'Rayleigh β', settings.damping?.coefficients?.beta, 0.000001));
  }
  return section;
}

function renderComputeTargets(doc, bridge, state, api) {
  const kind = state.mode === 'nlth' ? 'nonlinearTimeHistory' : 'nonlinearStatic';
  const capability = bridge.getAnalysisCapabilities?.({ kind });
  const wrap = doc.createElement('div');
  wrap.className = 'ss-nl-compute-control';
  const segments = doc.createElement('div');
  segments.className = 'ss-nl-compute-segments';
  for (const target of capability?.targets || []) {
    const control = segmentButton(doc, `ssNlCompute-${target.id}`, target.label, state.computeTarget === target.id, () => api.setComputeTarget(target.id));
    control.disabled = target.available !== true;
    control.title = target.available ? target.message : `${target.message} ${target.remediation || ''}`.trim();
    segments.appendChild(control);
  }
  wrap.appendChild(segments);
  const active = (capability?.targets || []).find((row) => row.id === state.computeTarget);
  wrap.appendChild(note(doc, active?.available ? active.message : `${active?.message || ''} ${active?.remediation || ''}`.trim(), active?.available ? 'info' : 'warning'));
  for (const unavailable of (capability?.targets || []).filter((row) => row.available !== true)) {
    wrap.appendChild(note(doc, `${unavailable.label} 사용 불가: ${unavailable.message || '지원되지 않는 계산 경로입니다.'} ${unavailable.remediation || ''}`.trim(), 'warning'));
  }
  return wrap;
}

function renderGroundMotionStage(doc, target, state) {
  const section = band(doc);
  if (state.mode === 'pushover') {
    section.appendChild(note(doc, 'Pushover에는 지진파 입력이 필요하지 않습니다.', 'ok'));
    return section;
  }
  const model = currentModel(target);
  const settings = state.drafts.nlth.settings;
  const record = settings.groundMotionRecords?.[0] || {};
  section.appendChild(selectField(doc, 'ssNlMassSource', '질량원', model.massSources || [], settings.massSourceId, (row) => row.id, (row) => row.name ? `${row.id} · ${row.name}` : row.id));
  section.appendChild(textField(doc, 'ssNlGroundId', '지진파 ID', record.id || 'GM-X'));
  section.appendChild(selectValuesField(doc, 'ssNlGroundDirection', '방향', ['x', 'y', 'z'], record.direction || 'x'));
  section.appendChild(selectValuesField(doc, 'ssNlGroundUnit', '가속도 단위', ['m/s2', 'g', 'gal'], record.unit || 'm/s2'));
  section.appendChild(numberField(doc, 'ssNlGroundDt', '기록 Δt (s)', record.dt || settings.newmark?.outputDt || 0.02, 0.001));
  const label = doc.createElement('label');
  label.className = 'ss-nl-field ss-nl-field-stack';
  const title = doc.createElement('span');
  title.textContent = '가속도 값';
  label.appendChild(title);
  const textarea = doc.createElement('textarea');
  textarea.id = 'ssNlGroundValues';
  textarea.setAttribute('id', textarea.id);
  textarea.rows = 7;
  textarea.value = (record.values || record.accelerations || []).join(' ');
  textarea.placeholder = '0.0  0.12  -0.08  ...';
  label.appendChild(textarea);
  section.appendChild(label);
  const file = doc.createElement('input');
  file.type = 'file';
  file.id = 'ssNlGroundFile';
  file.setAttribute('id', file.id);
  file.accept = '.txt,.csv,.dat';
  file.setAttribute('aria-label', '지진파 텍스트 파일 불러오기');
  file.addEventListener?.('change', () => loadGroundMotionFile(target, file, textarea));
  section.appendChild(file);
  section.appendChild(note(doc, `${parseNumbers(textarea.value).length}개 값 · 기준선 보정 none · 원본 단위와 Δt는 실행기록에 고정됩니다.`, 'info'));
  return section;
}

function renderRunStage(doc, state, api) {
  const section = band(doc);
  const runtime = state.preflight?.runtime;
  section.appendChild(metricGrid(doc, [
    ['Reduced DOF', runtime?.dofCount ?? '-'],
    ['Sparse nnz', runtime?.nnz ?? '-'],
    ['예상 메모리', formatBytes(runtime?.memory?.totalBytes)],
    ['실행 모드', runtime?.thread?.mode || '-'],
  ]));
  if (runtime?.runtimeEstimate) {
    section.appendChild(note(doc, `사전 추정 ${runtime.runtimeEstimate.lowerSeconds}~${runtime.runtimeEstimate.upperSeconds}s · 성능 검증값이 아닌 규모 선별값입니다.`, 'info'));
  }
  section.appendChild(note(doc, `엔진 ${state.preflight?.analysisCase?.engineId || '-'} · ${qualificationLabel(state.preflight)} · 설계전달 차단`, 'warning'));
  if (state.currentJob) section.appendChild(renderJobProgress(doc, state.currentJob));
  const actions = doc.createElement('div');
  actions.className = 'ss-nl-actions';
  if (!state.currentJob || ['failed', 'blocked', 'cancelled'].includes(state.currentJob.status)) {
    actions.appendChild(actionButton(doc, 'ssNlRunNow', state.currentJob ? '다시 실행' : '전체 비선형 준비/실행', () => state.currentJob ? api.retry() : api.run(), 'primary'));
  }
  if (state.currentJob?.status === 'running') {
    actions.appendChild(actionButton(doc, 'ssNlPause', '일시정지', () => api.pause()));
    actions.appendChild(actionButton(doc, 'ssNlCancel', '취소', () => api.cancel(), 'danger'));
  }
  if (state.currentJob?.status === 'paused') actions.appendChild(actionButton(doc, 'ssNlResume', state.currentJob.checkpoint ? '체크포인트에서 재개' : '원점부터 재실행', () => api.resume(), 'primary'));
  section.appendChild(actions);
  return section;
}

function renderResultStage(doc, bridge, state, api) {
  const section = band(doc);
  if (!state.currentJob?.resultAvailable) {
    section.appendChild(note(doc, state.currentJob?.progressMessage || '완료된 비선형해석 결과가 없습니다.', state.currentJob?.status === 'failed' ? 'error' : 'info'));
    return section;
  }
  section.appendChild(metricGrid(doc, [
    ['상태', state.currentJob.status],
    ['검증등급', state.currentJob.qualification],
    ['설계전달', state.currentJob.designBlocked ? '차단' : '허용'],
    ['Stale', state.currentJob.stale ? '재실행 필요' : '현재 모델'],
  ]));
  const actions = doc.createElement('div');
  actions.className = 'ss-nl-actions';
  actions.appendChild(actionButton(doc, 'ssNlOpenResults', '결과 팝업 열기', () => api.openResults(), 'primary'));
  actions.appendChild(actionButton(doc, 'ssNlOpenReport', '계산서 보기', () => openReport(bridge, state.currentJobId)));
  section.appendChild(actions);
  const runs = bridge.listNonlinearRuns?.({ caseId: state.currentJob.caseId }) || [];
  if (runs.length) section.appendChild(runHistoryTable(doc, runs));
  return section;
}

function renderIssues(doc, issues, api, target, state) {
  const wrap = doc.createElement('div');
  wrap.className = 'ss-nl-issues';
  for (const row of issues) {
    const item = doc.createElement('div');
    item.className = `tone-${row.severity}`;
    const text = doc.createElement('span');
    text.textContent = `${row.code} · ${row.message}`;
    item.appendChild(text);
    if (row.remediation) item.appendChild(actionButton(doc, '', row.remediation.label, () => runRemediation(row.remediation.action, api, target, state), 'small'));
    wrap.appendChild(item);
  }
  return wrap;
}

function renderFooter(doc, state, api) {
  const footer = doc.createElement('footer');
  footer.className = 'ss-nl-workflow-footer';
  const previous = actionButton(doc, 'ssNlPrevious', '이전', () => api.go(state.step - 1));
  previous.disabled = state.step === 0;
  footer.appendChild(previous);
  const count = doc.createElement('span');
  count.textContent = `${state.step + 1} / ${NONLINEAR_PRODUCT_STAGES.length}`;
  footer.appendChild(count);
  if (state.step < NONLINEAR_PRODUCT_STAGES.length - 1) footer.appendChild(actionButton(doc, 'ssNlNext', '다음', () => api.go(state.step + 1), 'primary'));
  else footer.appendChild(actionButton(doc, 'ssNlDone', '닫기', () => api.close(), 'primary'));
  return footer;
}

function installRibbon(target, api) {
  const doc = target.document;
  const panel = doc.querySelector?.('[data-ss-ribbon-panel="nonlinear"]');
  if (!panel || panel.querySelector?.('[data-ss-ribbon-group="nonlinear-production"]')) return;
  const group = createRibbonGroup(doc, 'nonlinear-production', 'Production');
  const items = group.querySelector('[data-ss-ribbon-items]');
  const modes = doc.createElement('div');
  modes.className = 'ss-nl-ribbon-segments';
  modes.appendChild(segmentButton(doc, 'ssNlRibbonPushover', 'Pushover', true, () => api.setMode('pushover')));
  modes.appendChild(segmentButton(doc, 'ssNlRibbonNlth', 'NLTH', false, () => api.setMode('nlth')));
  items.appendChild(modes);
  const run = actionButton(doc, 'ssRunNonlinearProduction', '▶ 전체 비선형 준비/실행', () => api.run(), 'ribbon-primary');
  run.setAttribute('data-agent-id', 'nonlinear-production-run');
  items.appendChild(run);
  items.appendChild(actionButton(doc, 'ssOpenNonlinearSetup', '설정', () => api.open()));
  items.appendChild(actionButton(doc, 'ssOpenNonlinearResults', '결과', () => api.openResults()));
  const status = doc.createElement('span');
  status.id = 'ssNonlinearProductionStatus';
  status.setAttribute('id', status.id);
  status.className = 'ss-ribbon-status';
  status.textContent = '설정 확인';
  items.appendChild(status);
  panel.appendChild(group);
  const legacy = doc.getElementById?.('ssRunPushover');
  if (legacy) legacy.setAttribute('title', '예비 비교용 Pushover');
}

function syncRibbon(target, state) {
  const doc = target.document;
  const push = doc.getElementById?.('ssNlRibbonPushover');
  const nlth = doc.getElementById?.('ssNlRibbonNlth');
  setPressed(push, state.mode === 'pushover');
  setPressed(nlth, state.mode === 'nlth');
  const status = doc.getElementById?.('ssNonlinearProductionStatus');
  if (status) status.textContent = state.currentJob
    ? `${statusLabel(state.currentJob.status)} ${formatPercent(state.currentJob.progress)}`.trim()
    : state.preflight?.ok ? '실행 가능' : `수정 ${state.preflight?.blocking?.length || 0}`;
}

function ensureDraft(target, bridge, state) {
  if (state.drafts[state.mode]) return state.drafts[state.mode];
  const model = currentModel(target);
  const existing = (model.analysisCases || []).find((row) => (
    state.mode === 'pushover'
      ? row.engineId === 'p8-production-mdof-pushover'
      : row.engineId === 'p8-production-mdof-nlth'
  ));
  state.drafts[state.mode] = clone(createProductionNonlinearCase(model, existing || { mode: state.mode }));
  return state.drafts[state.mode];
}

function refreshDraftFromStoredCase(target, state) {
  const model = currentModel(target);
  const currentId = state.drafts[state.mode]?.id;
  const stored = (model.analysisCases || []).find((row) => row.id === currentId);
  state.drafts[state.mode] = clone(createProductionNonlinearCase(model, stored || state.drafts[state.mode] || { mode: state.mode }));
}

function readVisibleForm(target, state, root) {
  const draft = state.drafts[state.mode];
  if (!draft) return;
  const value = (id, fallback) => root.querySelector?.(`#${id}`)?.value ?? fallback;
  const checked = (id, fallback) => root.querySelector?.(`#${id}`)?.checked ?? fallback;
  const settings = clone(draft.settings || {});
  settings.gravityCombinationId = value('ssNlGravityCombo', settings.gravityCombinationId);
  if (state.mode === 'pushover') {
    settings.direction = value('ssNlDirection', settings.direction);
    settings.pattern = value('ssNlPattern', settings.pattern);
    settings.controlNodeId = value('ssNlControlNode', settings.controlNodeId);
    settings.targetDisplacement = numberValue(value('ssNlTargetDisplacement', settings.targetDisplacement), settings.targetDisplacement);
    settings.steps = Math.max(1, Math.trunc(numberValue(value('ssNlSteps', settings.steps), settings.steps)));
    settings.arcLength = { ...(settings.arcLength || {}), enabled: checked('ssNlArcEnabled', settings.arcLength?.enabled === true) };
    settings.control = settings.arcLength.enabled ? 'arcLength' : 'displacement';
  } else {
    settings.massSourceId = value('ssNlMassSource', settings.massSourceId);
    settings.newmark = {
      ...(settings.newmark || {}),
      outputDt: numberValue(value('ssNlOutputDt', settings.newmark?.outputDt), settings.newmark?.outputDt),
      initialDt: numberValue(value('ssNlInitialDt', settings.newmark?.initialDt), settings.newmark?.initialDt),
      minDt: numberValue(value('ssNlMinDt', settings.newmark?.minDt), settings.newmark?.minDt),
      maxIterations: Math.max(1, Math.trunc(numberValue(value('ssNlMaxIterations', settings.newmark?.maxIterations), settings.newmark?.maxIterations))),
    };
    settings.damping = {
      ...(settings.damping || {}),
      coefficients: {
        ...(settings.damping?.coefficients || {}),
        alpha: numberValue(value('ssNlDampingAlpha', settings.damping?.coefficients?.alpha), settings.damping?.coefficients?.alpha),
        beta: numberValue(value('ssNlDampingBeta', settings.damping?.coefficients?.beta), settings.damping?.coefficients?.beta),
      },
    };
    settings.gpuEnabled = false;
    const values = parseNumbers(value('ssNlGroundValues', (settings.groundMotionRecords?.[0]?.values || []).join(' ')));
    if (values.length) {
      settings.groundMotionRecords = [{
        ...(settings.groundMotionRecords?.[0] || {}),
        id: value('ssNlGroundId', settings.groundMotionRecords?.[0]?.id || 'GM-X'),
        values,
        dt: numberValue(value('ssNlGroundDt', settings.groundMotionRecords?.[0]?.dt || 0.02), 0.02),
        unit: value('ssNlGroundUnit', settings.groundMotionRecords?.[0]?.unit || 'm/s2'),
        direction: value('ssNlGroundDirection', settings.groundMotionRecords?.[0]?.direction || 'x'),
        baseline: 'none',
      }];
    }
  }
  state.drafts[state.mode] = clone(createProductionNonlinearCase(currentModel(target), {
    ...draft,
    mode: state.mode,
    settings,
    gravityCombinationId: settings.gravityCombinationId,
    massSourceId: settings.massSourceId,
    controlNodeId: settings.controlNodeId,
    direction: settings.direction,
    groundMotionRecords: settings.groundMotionRecords,
  }));
}

function runRemediation(action, api, target, state) {
  if (action === 'open-model-editor' || action === 'focus-entity') return openModelEditor(target);
  if (action === 'open-load-mass-editor') return target.SStructuresElasticSetupWorkflow?.open?.(1);
  if (action === 'open-property-editor') return openPropertyEditor(target);
  if (action === 'preview-auto-assignment') return api.go(2);
  if (action === 'edit-control' || action === 'select-control-node') return api.go(3);
  if (action === 'edit-ground-motion') {
    state.mode = 'nlth';
    ensureDraft(target, target.SStructuresEngine, state);
    return api.go(4);
  }
  return api.open();
}

function openModelEditor(target) {
  target.SStructuresNativeUI?.setMode?.('modeling');
  target.document?.getElementById?.('palette')?.classList?.add?.('show');
}

function openPropertyEditor(target) {
  openModelEditor(target);
  target.SStructuresSectionLibraryPanel?.openEditor?.();
}

function openReport(bridge, jobId) {
  const output = bridge.getNonlinearReport?.(jobId, { format: 'html' });
  const tab = globalThis.open?.('', '_blank');
  if (tab?.document && output?.html) {
    tab.document.open();
    tab.document.write(output.html);
    tab.document.close();
  }
  return output;
}

function latestDomainHashes(bridge, caseId) {
  const result = bridge.getAnalysisCaseResult?.(caseId) || null;
  return result?.payload?.dependencies?.canonical || result?.payload?.provenance?.domainHashes || null;
}

function loadGroundMotionFile(target, input, textarea) {
  const file = input?.files?.[0];
  if (!file || typeof FileReader === 'undefined') return;
  const reader = new FileReader();
  reader.onload = () => { textarea.value = String(reader.result || ''); };
  reader.readAsText(file);
}

function renderJobProgress(doc, job) {
  const wrap = doc.createElement('div');
  wrap.className = 'ss-nl-progress';
  const row = doc.createElement('div');
  const label = doc.createElement('b');
  label.textContent = statusLabel(job.status);
  row.appendChild(label);
  const value = doc.createElement('span');
  value.textContent = formatPercent(job.progress);
  row.appendChild(value);
  wrap.appendChild(row);
  const track = doc.createElement('div');
  track.className = 'ss-nl-progress-track';
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(Math.round(Number(job.progress || 0) * 100)));
  const bar = doc.createElement('span');
  bar.style.width = formatPercent(job.progress || 0);
  track.appendChild(bar);
  wrap.appendChild(track);
  const message = doc.createElement('p');
  message.textContent = job.progressMessage || '';
  wrap.appendChild(message);
  return wrap;
}

function assignmentTable(doc, rows, properties = []) {
  const byId = new Map(properties.map((row) => [row.id, row]));
  return simpleTable(doc, ['부재단', '모드', '속성', '출처·가정', '기존'], rows.map((row) => [
    row.assignmentId,
    row.mode,
    row.propertyId,
    assignmentSourceLabel(byId.get(row.propertyId)),
    row.prior ? row.prior.propertyId || '있음' : '-',
  ]));
}

function assignmentSourceLabel(property) {
  const source = property?.source || {};
  if (source.reference) return `${source.reference}${source.clause ? ` · ${source.clause}` : ''}`;
  return source.assumption || source.type || '프로젝트 가정';
}

function runHistoryTable(doc, rows) {
  return simpleTable(doc, ['실행', '상태', '시각', '현재'], rows.slice(-20).reverse().map((row) => [
    row.id,
    row.stale ? 'stale' : row.status,
    row.completedAt || row.createdAt,
    row.current ? '현재' : '이력',
  ]));
}

function simpleTable(doc, headers, rows) {
  const wrap = doc.createElement('div');
  wrap.className = 'ss-nl-table-wrap';
  const table = doc.createElement('table');
  const head = doc.createElement('thead');
  const tr = doc.createElement('tr');
  headers.forEach((value) => { const th = doc.createElement('th'); th.textContent = value; tr.appendChild(th); });
  head.appendChild(tr);
  table.appendChild(head);
  const body = doc.createElement('tbody');
  rows.forEach((row) => {
    const item = doc.createElement('tr');
    row.forEach((value) => { const td = doc.createElement('td'); td.textContent = value == null ? '-' : String(value); item.appendChild(td); });
    body.appendChild(item);
  });
  table.appendChild(body);
  wrap.appendChild(table);
  return wrap;
}

function metricGrid(doc, rows) {
  const grid = doc.createElement('div');
  grid.className = 'ss-nl-metrics';
  rows.forEach(([label, value]) => {
    const item = doc.createElement('div');
    const span = doc.createElement('span'); span.textContent = label; item.appendChild(span);
    const strong = doc.createElement('strong'); strong.textContent = value == null ? '-' : String(value); item.appendChild(strong);
    grid.appendChild(item);
  });
  return grid;
}

function band(doc) {
  const section = doc.createElement('section');
  section.className = 'ss-nl-stage-band';
  return section;
}

function note(doc, text, tone = 'info') {
  const item = doc.createElement('div');
  item.className = `ss-nl-note tone-${tone}`;
  item.textContent = text;
  return item;
}

function textField(doc, id, label, value) {
  return field(doc, id, label, 'text', value);
}

function numberField(doc, id, label, value, step) {
  const wrap = field(doc, id, label, 'number', value);
  const input = wrap.querySelector?.('input');
  if (input) input.step = String(step || 1);
  return wrap;
}

function checkboxField(doc, id, label, checked) {
  const wrap = doc.createElement('label');
  wrap.className = 'ss-nl-check';
  const input = doc.createElement('input');
  input.type = 'checkbox'; input.id = id; input.setAttribute('id', id); input.checked = Boolean(checked);
  wrap.appendChild(input);
  const span = doc.createElement('span'); span.textContent = label; wrap.appendChild(span);
  return wrap;
}

function field(doc, id, label, type, value) {
  const wrap = doc.createElement('label');
  wrap.className = 'ss-nl-field';
  const title = doc.createElement('span'); title.textContent = label; wrap.appendChild(title);
  const input = doc.createElement('input');
  input.type = type; input.id = id; input.setAttribute('id', id); input.value = value == null ? '' : String(value);
  wrap.appendChild(input);
  return wrap;
}

function selectValuesField(doc, id, label, values, selected) {
  return selectField(doc, id, label, values.map((value) => ({ value, label: value })), selected, (row) => row.value, (row) => row.label);
}

function selectField(doc, id, label, rows, selected, valueOf, labelOf) {
  const wrap = doc.createElement('label');
  wrap.className = 'ss-nl-field';
  const title = doc.createElement('span'); title.textContent = label; wrap.appendChild(title);
  const select = doc.createElement('select');
  select.id = id; select.setAttribute('id', id);
  for (const row of rows || []) {
    const option = doc.createElement('option');
    option.value = String(valueOf(row)); option.textContent = String(labelOf(row)); select.appendChild(option);
  }
  select.value = selected == null ? '' : String(selected);
  wrap.appendChild(select);
  return wrap;
}

function actionButton(doc, id, label, handler, tone = '') {
  const button = doc.createElement('button');
  button.type = 'button';
  if (id) { button.id = id; button.setAttribute('id', id); }
  button.textContent = label;
  button.className = `ss-nl-button${tone ? ` tone-${tone}` : ''}`;
  button.addEventListener?.('click', handler);
  return button;
}

function segmentButton(doc, id, label, active, handler) {
  const button = actionButton(doc, id, label, handler, 'segment');
  setPressed(button, active);
  return button;
}

function iconButton(doc, id, symbol, label, handler) {
  const button = actionButton(doc, id, symbol, handler, 'icon');
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  return button;
}

function setPressed(button, active) {
  if (!button) return;
  button.classList?.toggle?.('active', active);
  button.setAttribute?.('aria-pressed', active ? 'true' : 'false');
}

function ensureRoot(doc, host) {
  let root = doc.getElementById?.('ssNonlinearWorkflow');
  if (root) return root;
  root = doc.createElement('section');
  root.id = 'ssNonlinearWorkflow';
  root.setAttribute('id', root.id);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Production 비선형해석 설정');
  root.setAttribute('data-agent-id', 'nonlinear-production-workflow');
  root.className = 'ss-nl-workflow';
  host.appendChild(root);
  return root;
}

function injectStyles(doc) {
  if (doc.getElementById?.('ssNonlinearWorkflowStyles')) return;
  const style = doc.createElement('style');
  style.id = 'ssNonlinearWorkflowStyles'; style.setAttribute('id', style.id);
  style.textContent = `
    .ss-nl-workflow{position:absolute;left:12px;top:12px;z-index:48;display:none;flex-direction:column;min-width:380px;min-height:360px;max-width:calc(100% - 20px);max-height:calc(100% - 20px);overflow:hidden;background:#fff;border:1px solid #adbfcc;border-radius:7px;box-shadow:0 14px 36px rgba(22,45,63,.2);color:#243b4d;font:12px/1.42 "Segoe UI","Malgun Gothic",Arial,sans-serif}.ss-nl-workflow.is-open{display:flex}.ss-nl-workflow *{box-sizing:border-box;letter-spacing:0}
    .ss-nl-workflow-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;min-height:54px;padding:9px 9px 8px 13px;border-bottom:1px solid #ccdae4;background:#f5f9fb;flex:none}.ss-nl-workflow-header h2{margin:0;color:#034f77;font-size:15px;line-height:1.3}.ss-nl-workflow-header span{display:block;margin-top:2px;color:#657b8c;font-size:10.5px}.ss-nl-head-actions{display:flex;align-items:center;gap:3px}.ss-nl-button{min-height:30px;padding:0 10px;border:1px solid #b8c9d5;border-radius:5px;background:#fff;color:#294c64;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap}.ss-nl-button:hover{background:#edf4f8}.ss-nl-button:disabled{opacity:.45;cursor:not-allowed}.ss-nl-button.tone-primary,.ss-nl-button.tone-ribbon-primary{border-color:#00618f;background:#00618f;color:#fff}.ss-nl-button.tone-danger{border-color:#c75454;color:#a42727}.ss-nl-button.tone-small{min-height:25px;padding:0 7px;font-size:10px}.ss-nl-button.tone-icon{width:30px;padding:0;font-size:18px}.ss-nl-button.tone-segment{min-width:56px;padding:0 7px}.ss-nl-button.tone-segment.active{border-color:#00618f;background:#e4f2f8;color:#00537b}
    .ss-nl-steps{display:flex;gap:3px;padding:6px 7px;border-bottom:1px solid #dce5eb;overflow-x:auto;background:#fff;flex:none}.ss-nl-steps button{height:29px;padding:0 8px;border:1px solid #c8d5de;border-radius:4px;background:#f8fafb;color:#4a6578;font-size:10.5px;white-space:nowrap}.ss-nl-steps button.active{border-color:#00618f;background:#00618f;color:#fff}.ss-nl-steps button[data-stage-status="blocked"]:not(.active){border-color:#d89696;color:#a12e2e}.ss-nl-steps button[data-stage-status="warning"]:not(.active){border-color:#d8b56c;color:#835a00}.ss-nl-steps button[data-stage-status="ready"]:not(.active){border-color:#98c1a6;color:#19643a}
    .ss-nl-workflow-body{min-height:0;overflow:auto;padding:11px 13px 18px;overscroll-behavior:contain}.ss-nl-workflow-body h3{margin:0 0 3px;color:#174d6b;font-size:14px}.ss-nl-purpose{margin:0 0 10px;padding-left:9px;border-left:3px solid #6d9cb8;color:#586f80;font-size:11px}.ss-nl-stage-band{display:grid;gap:8px;padding:2px 0}.ss-nl-field{display:grid;grid-template-columns:minmax(120px,38%) minmax(0,1fr);align-items:center;gap:9px}.ss-nl-field>span,.ss-nl-check>span{color:#526b7c;font-size:11px;font-weight:600}.ss-nl-field input,.ss-nl-field select,.ss-nl-field textarea{width:100%;min-width:0;border:1px solid #b9c9d4;border-radius:5px;background:#fff;color:#233f52;font:12px/1.35 inherit}.ss-nl-field input,.ss-nl-field select{height:32px;padding:4px 7px}.ss-nl-field textarea{padding:7px;resize:vertical}.ss-nl-field-stack{grid-template-columns:1fr}.ss-nl-check{display:flex;align-items:center;gap:7px;min-height:30px}.ss-nl-check input{accent-color:#00618f}.ss-nl-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:3px}
    .ss-nl-compute-control{display:grid;gap:6px;padding:7px;border:1px solid #d4e0e7;background:#f9fbfc}.ss-nl-compute-segments{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px}.ss-nl-compute-segments button{min-width:0;width:100%;overflow:hidden;text-overflow:ellipsis}.ss-nl-compute-segments button:disabled{opacity:.45;cursor:not-allowed}
    .ss-nl-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #d4e0e7}.ss-nl-metrics>div{min-width:0;padding:7px;border-right:1px solid #e0e8ed;background:#f9fbfc}.ss-nl-metrics>div:last-child{border-right:0}.ss-nl-metrics span,.ss-nl-metrics strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ss-nl-metrics span{color:#728593;font-size:9.5px}.ss-nl-metrics strong{margin-top:2px;color:#28495f;font-size:11px}.ss-nl-note{padding:7px 9px;border-left:3px solid #7b9bae;background:#f3f7f9;color:#536b7b;font-size:10.5px}.ss-nl-note.tone-ok{border-color:#419062;background:#edf8f1;color:#276543}.ss-nl-note.tone-warning{border-color:#d39a31;background:#fff8e7;color:#765400}.ss-nl-note.tone-error{border-color:#c65151;background:#fff1f1;color:#902d2d}
    .ss-nl-issues{display:grid;gap:4px;margin:0 0 9px}.ss-nl-issues>div{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:6px 7px;border-left:3px solid #c54c4c;background:#fff2f2;color:#862d2d;font-size:10.5px}.ss-nl-issues>div.tone-warning{border-color:#d39a31;background:#fff8e7;color:#765400}.ss-nl-table-wrap{max-height:220px;overflow:auto;border:1px solid #d5e0e7}.ss-nl-table-wrap table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:10.5px}.ss-nl-table-wrap th,.ss-nl-table-wrap td{padding:5px 6px;border-bottom:1px solid #e3eaef;text-align:left}.ss-nl-table-wrap th{position:sticky;top:0;background:#eef4f7;color:#50697b}.ss-nl-progress{display:grid;gap:5px;padding:8px;border:1px solid #ccd9e2;background:#f8fbfc}.ss-nl-progress>div:first-child{display:flex;justify-content:space-between}.ss-nl-progress p{margin:0;color:#5e7382;font-size:10.5px}.ss-nl-progress-track{height:8px;overflow:hidden;background:#dce6ec}.ss-nl-progress-track span{display:block;height:100%;background:#16836a;transition:width .18s ease}
    .ss-nl-workflow-footer{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;padding:8px 10px;border-top:1px solid #d8e2e9;background:#f8fafb;flex:none}.ss-nl-workflow-footer span{text-align:center;color:#6f8290;font-size:10.5px}.ss-nl-ribbon-segments{display:flex;gap:2px}
    @media(max-width:760px){.ss-nl-workflow{position:fixed!important;left:6px!important;right:6px!important;top:6px!important;width:auto!important;height:calc(100% - 12px)!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important}.ss-nl-workflow-header{align-items:center}.ss-nl-workflow-header h2{font-size:13px}.ss-nl-head-actions .tone-segment{min-width:45px}.ss-nl-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.ss-nl-metrics>div:nth-child(2){border-right:0}.ss-nl-field{grid-template-columns:1fr}.ss-nl-purpose{font-size:10.5px}}
  `;
  (doc.head || doc.documentElement || doc.body)?.appendChild(style);
}

function currentModel(target) {
  return target.SStructuresEngine?.getCurrentModel?.() || (typeof target.model === 'function' ? target.model() : {});
}

function readComputeTarget(target) {
  const value = target?.localStorage?.getItem?.('s-structures:compute-target');
  return ['auto', 'cpu', 'gpu'].includes(value) ? value : 'auto';
}

function normalizeMode(value) {
  return String(value || '').toLowerCase().includes('nlth') || String(value || '').toLowerCase().includes('time') ? 'nlth' : 'pushover';
}

function clampStep(value) {
  return Math.max(0, Math.min(NONLINEAR_PRODUCT_STAGES.length - 1, Math.trunc(Number(value) || 0)));
}

function firstBlockedStep(preflight) {
  const stage = preflight.blocking?.[0]?.stage;
  const index = NONLINEAR_PRODUCT_STAGES.findIndex((row) => row.id === stage);
  return index >= 0 ? index : 0;
}

function qualificationLabel(preflight) {
  return `${preflight?.qualification || 'candidate'} / 설계전달 차단`;
}

function statusLabel(status) {
  return {
    queued: '대기', running: '실행 중', pausing: '일시정지 중', paused: '일시정지',
    cancelling: '취소 중', cancelled: '취소', completed: '완료', failed: '실패', blocked: '차단',
  }[status] || status || '미실행';
}

function parseNumbers(text) {
  return String(text || '').split(/[\s,;]+/).map(Number).filter(Number.isFinite);
}

function numberValue(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatBytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  if (number >= 1024 ** 3) return `${(number / 1024 ** 3).toFixed(2)} GB`;
  if (number >= 1024 ** 2) return `${(number / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(number / 1024)} KB`;
}

function shortHash(value) {
  return value ? String(value).slice(0, 8) : '-';
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : '';
}

function queueRender(target, callback, state) {
  if (state.renderingQueued) return;
  state.renderingQueued = true;
  const schedule = target.requestAnimationFrame || ((fn) => queueMicrotask(fn));
  schedule(() => {
    state.renderingQueued = false;
    callback();
  });
}

function clear(element) {
  while (element.childNodes?.length) element.removeChild(element.childNodes[0]);
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
