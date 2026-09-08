import { createPhase13ElasticWorkspace, PHASE13_WORKSPACES } from './phase13ElasticWorkspace.js';
import { phase7ModelHash } from './phase7AnalysisRecords.js';
import { stableHash } from '../core/stableHash.js';
import {
  applyPhase13RepairPreview,
  buildPhase13ModelCheck,
  buildPhase13IssueCenterView,
  createPhase13IssueWaiver,
  previewPhase13ModelRepair,
  undoPhase13Repair,
} from '../modeling/phase13ModelCheck.js';
import { commitModelTransaction, undoModelTransaction } from '../modeling/transaction.js';
import {
  applyPhase13ManualCombinationChangeSet,
  applyPhase13SlabPanelChangeSet,
  buildPhase13LoadWorkspace,
  parsePhase13LoadPaste,
  previewPhase13ManualCombinationChangeSet,
  previewPhase13SlabPanelChangeSet,
} from '../loads/phase13LoadWorkspace.js';
import { buildPhase13ShellLab } from '../compute/product/shellLab.js';
import { buildPhase13ShellContainmentAudit } from '../compute/product/shellLab.js';
import {
  createPhase13KdsApproval,
  createPhase13KdsSourceSnapshot,
  evaluatePhase13KdsApproval,
  executePhase13KdsProcedure,
} from '../loads/phase13KdsProcedures.js';
import {
  applyPhase13DiaphragmAssignment,
  applyPhase13StoryGeneration,
  applyPhase13TableEdit,
  previewPhase13DiaphragmAssignment,
  previewPhase13StoryGeneration,
  previewPhase13TableEdit,
  validatePhase13Diaphragms,
} from '../modeling/phase13PracticalEditors.js';
import { buildPhase13ElasticDashboard, buildPhase13ElasticResultQuery, exportPhase13DashboardCsv } from '../results/phase13ElasticDashboard.js';
import { buildPhase13ReviewPackageSnapshot, buildPhase13RevisionDiff, commitPhase13MgtDraftRevision, createPhase13MgtImportCandidate } from '../import/phase13MgtImport.js';
import { buildPhase13ReleaseGate } from '../platform/phase13ReleaseReadiness.js';
import { ensureElasticAnalysisCases } from './indexElasticAnalysisRibbon.js';
import { buildFoundationInspector } from './foundationInspector.js';

export const INDEX_PHASE13_ELASTIC_WORKSPACE_VERSION = 'p14-m1-index-workspace-v5-foundation';

const ISSUE_WAIVER_STORAGE_KEY = 's-structures:p13:issue-waivers';

const ELASTIC_KINDS = new Set(['static', 'modal', 'responseSpectrum', 'buckling', 'linearTha']);
const WORKSPACE_LABELS = Object.freeze({
  project: '개요',
  model: '모델 검토',
  loads: '하중·질량',
  analysis: '탄성해석',
  results: '결과',
  report: '검토·보고서',
});

export function installIndexPhase13ElasticWorkspace(target = globalThis, options = {}) {
  const doc = target?.document;
  const bridge = options.bridge || target?.SStructuresEngine;
  if (!doc?.createElement || !bridge) return null;
  if (target.SStructuresPhase13Workspace) return target.SStructuresPhase13Workspace;

  injectStyle(doc);
  const state = createPhase13ElasticWorkspace({ workspace: 'project' });
  let selectedCaseId = null;
  let selectedIssueId = null;
  let repairPreview = null;
  let repairTransaction = null;
  let issueFilters = { severity: '', category: '', search: '' };
  let modelCheckMessage = null;
  let loadTab = 'load-cases';
  let loadPreview = null;
  let loadTransaction = null;
  let loadMessage = null;
  let loadPasteReview = null;
  let modelSurface = 'model-check';
  let editorPreview = null;
  let editorTransaction = null;
  let editorMessage = null;
  let kdsOpen = false;
  let kdsSource = createPhase13KdsSourceSnapshot({});
  let kdsProcedure = null;
  let kdsApproval = null;
  let resultTab = 'overview';
  let reviewTab = 'package';
  let mgtCandidate = null;
  let mgtDraftRevision = null;
  let shellLab = buildPhase13ShellLab({ meshResults: [], phase10EvidenceStatus: 'unknown' });
  let open = false;
  let busy = false;

  const launch = element(doc, 'button', 'ss-p13-launch', '실무 워크벤치');
  launch.type = 'button';
  launch.id = 'ssPhase13WorkspaceOpen';
  launch.setAttribute('data-testid', 'p13-workspace-open');
  launch.setAttribute('aria-label', 'Phase 13 실무 워크벤치 열기');
  const topbar = doc.getElementById?.('topbar');
  const spacer = topbar?.querySelector?.('.spacer') || null;
  if (topbar) topbar.insertBefore?.(launch, spacer);

  const root = element(doc, 'section', 'ss-p13-workspace');
  root.id = 'ssPhase13Workspace';
  root.hidden = true;
  root.setAttribute('data-testid', 'p13-workspace');
  root.setAttribute('aria-label', 'Phase 13 탄성해석 실무 워크벤치');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');

  const header = element(doc, 'header', 'ss-p13-header');
  const title = element(doc, 'div', 'ss-p13-title');
  title.appendChild(element(doc, 'strong', '', 'S-Structures 실무 워크벤치'));
  title.appendChild(element(doc, 'span', '', '자체 탄성해석 엔진 · Phase 13'));
  const nav = element(doc, 'nav', 'ss-p13-nav');
  nav.setAttribute('aria-label', '워크스페이스 이동');
  const navButtons = new Map();
  for (const id of PHASE13_WORKSPACES) {
    const button = element(doc, 'button', 'ss-p13-nav-button', WORKSPACE_LABELS[id] || id);
    button.type = 'button';
    button.setAttribute('data-p13-workspace', id);
    button.setAttribute('data-testid', `p13-nav-${id}`);
    button.addEventListener?.('click', () => api.setWorkspace(id));
    navButtons.set(id, button);
    nav.appendChild(button);
  }
  const actions = element(doc, 'div', 'ss-p13-actions');
  const status = element(doc, 'span', 'ss-p13-status', '미실행');
  status.id = 'ssPhase13RunStatus';
  status.setAttribute('data-testid', 'p13-run-status');
  const runButton = element(doc, 'button', 'ss-p13-run', '선택 케이스 실행');
  runButton.id = 'ssPhase13RunSelected';
  runButton.type = 'button';
  runButton.setAttribute('data-testid', 'p13-run-selected');
  runButton.addEventListener?.('click', () => api.runSelected());
  const runAllButton = element(doc, 'button', 'ss-p13-run-all', '전체 탄성해석');
  runAllButton.id = 'ssPhase13RunAll';
  runAllButton.type = 'button';
  runAllButton.setAttribute('data-testid', 'p13-run-all');
  runAllButton.addEventListener?.('click', () => api.runAll());
  const closeButton = element(doc, 'button', 'ss-p13-close', '닫기');
  closeButton.id = 'ssPhase13WorkspaceClose';
  closeButton.type = 'button';
  closeButton.setAttribute('data-testid', 'p13-workspace-close');
  closeButton.addEventListener?.('click', () => api.close());
  actions.appendChild(status);
  actions.appendChild(runButton);
  actions.appendChild(runAllButton);
  actions.appendChild(closeButton);
  header.appendChild(title);
  header.appendChild(nav);
  header.appendChild(actions);

  const body = element(doc, 'div', 'ss-p13-body');
  const tree = element(doc, 'aside', 'ss-p13-tree');
  tree.setAttribute('data-testid', 'p13-tree');
  const center = element(doc, 'main', 'ss-p13-center');
  center.setAttribute('data-testid', 'p13-center');
  const inspector = element(doc, 'aside', 'ss-p13-inspector');
  inspector.setAttribute('data-testid', 'p13-inspector');
  body.appendChild(tree);
  body.appendChild(center);
  body.appendChild(inspector);
  const drawer = element(doc, 'footer', 'ss-p13-drawer');
  drawer.setAttribute('data-testid', 'p13-drawer');
  root.appendChild(header);
  root.appendChild(body);
  root.appendChild(drawer);
  doc.body?.appendChild?.(root);

  const api = {
    version: INDEX_PHASE13_ELASTIC_WORKSPACE_VERSION,
    open() {
      open = true;
      root.hidden = false;
      doc.body?.classList?.add('ss-p13-workspace-open');
      target.SStructuresNativeUI?.setMode?.('elastic', { clickLegacy: false, emit: false });
      target.SStructuresElasticSetupWorkflow?.close?.();
      api.refresh();
      return api.getState();
    },
    close() {
      open = false;
      root.hidden = true;
      doc.body?.classList?.remove('ss-p13-workspace-open');
      return api.getState();
    },
    setWorkspace(workspace) {
      state.setWorkspace(workspace);
      api.refresh();
      return api.getState();
    },
    selectCase(caseId) {
      selectedCaseId = String(caseId || '');
      const analysisCase = elasticCases(bridge).find((item) => item.id === selectedCaseId);
      if (analysisCase) {
        state.selectObject('analysis-case', selectedCaseId, 'case-tree');
        target.SStructuresAnalysisCenter?.select?.(selectedCaseId);
      }
      api.refresh();
      return api.getState();
    },
    selectIssue(issueId) {
      const model = bridge.getCurrentModel?.() || {};
      const check = currentModelCheck(target, model);
      const issue = check.issues.find((item) => item.issueId === issueId) || null;
      selectedIssueId = issue?.issueId || null;
      if (issue) {
        state.selectObject('model-issue', issue.issueId, 'issue-center');
        const ref = issue.objectRefs?.[0];
        if (ref?.type === 'node') target.SStructuresNativeModeler?.executeCommand?.('selectNodesByFilter', { ids: [ref.id] });
        if (ref?.type === 'member') target.SStructuresNativeModeler?.executeCommand?.('selectMembersByFilter', { ids: [ref.id] });
        target.draw?.();
      }
      api.refresh();
      return api.getState();
    },
    setIssueFilters(filters = {}) {
      issueFilters = { ...issueFilters, ...filters };
      api.refresh();
      return api.getState();
    },
    previewIssueRepair(issueIds = null) {
      const model = bridge.getCurrentModel?.() || {};
      const ids = Array.isArray(issueIds) ? issueIds : [issueIds || selectedIssueId].filter(Boolean);
      repairPreview = previewPhase13ModelRepair(model, ids, { removeIsolatedNodes: true });
      modelCheckMessage = repairPreview.ok
        ? { tone: 'neutral', title: '수정 미리보기 준비', text: `${repairPreview.changes.length}개 변경을 검토한 뒤 적용하세요.` }
        : { tone: 'warning', title: '미리보기 차단', text: repairPreview.errors?.map((item) => item.code).join(' · ') || '수정 미리보기를 만들 수 없습니다.' };
      api.refresh();
      return api.getState();
    },
    applyIssueRepair() {
      const model = bridge.getCurrentModel?.() || {};
      const result = applyPhase13RepairPreview(model, repairPreview);
      if (!result.ok || !commitModelTransaction(model, result)) {
        modelCheckMessage = { tone: 'warning', title: '수정 적용 실패', text: result.errors?.map((item) => item.code).join(' · ') || '모델은 변경되지 않았습니다.' };
        api.refresh();
        return api.getState();
      }
      repairTransaction = result.transaction;
      repairPreview = null;
      selectedIssueId = null;
      bridge.markAnalysisCasesStale?.('p13-model-repair');
      target.SStructuresElasticResultPopup?.close?.();
      target.draw?.();
      modelCheckMessage = { tone: 'positive', title: '수정 적용 완료', text: '하나의 transaction으로 적용했습니다. 기존 해석결과는 Stale이며 Undo할 수 있습니다.' };
      api.refresh();
      return api.getState();
    },
    undoIssueRepair() {
      const model = bridge.getCurrentModel?.() || {};
      if (!repairTransaction) return api.getState();
      const result = undoPhase13Repair(model, repairTransaction);
      if (!result.ok || !commitModelTransaction(model, result)) {
        modelCheckMessage = { tone: 'warning', title: 'Undo 실패', text: result.errors?.map((item) => item.code).join(' · ') || '모델은 변경되지 않았습니다.' };
        api.refresh();
        return api.getState();
      }
      repairTransaction = null;
      repairPreview = null;
      target.draw?.();
      modelCheckMessage = { tone: 'positive', title: 'Undo 완료', text: '수정 전 모델 hash로 복원했습니다. 기존 실행기록의 Current 여부는 복원된 hash로 다시 판정합니다.' };
      api.refresh();
      return api.getState();
    },
    waiveIssue(issueId, input = {}) {
      const model = bridge.getCurrentModel?.() || {};
      const check = currentModelCheck(target, model);
      const issue = check.issues.find((item) => item.issueId === issueId);
      try {
        const waiver = {
          ...createPhase13IssueWaiver(issue, {
            reviewer: input.reviewer || '미지정 검토자',
            reason: input.reason,
            createdAt: input.createdAt || new Date().toISOString(),
          }),
          projectId: phase13ProjectId(model),
          revisionId: model.meta?.revisionId || null,
        };
        writeIssueWaivers(target, model, waiver);
        modelCheckMessage = { tone: 'positive', title: 'Waiver 기록 완료', text: `${issue.code} 경고에 검토자와 사유를 기록했습니다.` };
      } catch (error) {
        modelCheckMessage = { tone: 'warning', title: 'Waiver 기록 실패', text: error?.message || String(error) };
      }
      api.refresh();
      return api.getState();
    },
    clearRepairPreview() {
      repairPreview = null;
      modelCheckMessage = null;
      api.refresh();
      return api.getState();
    },
    getModelCheckSnapshot() {
      const model = bridge.getCurrentModel?.() || {};
      const check = currentModelCheck(target, model);
      const waivers = readIssueWaivers(target, model);
      return cloneValue({
        version: 'p13-m2-model-check-surface-v1',
        projectId: phase13ProjectId(model),
        revisionId: model.meta?.revisionId || null,
        modelHash: check.modelHash,
        ok: check.ok,
        summary: check.summary,
        issues: check.issues,
        waivers,
      });
    },
    getIssueWaivers() {
      return cloneValue(readIssueWaivers(target, bridge.getCurrentModel?.() || {}));
    },
    setLoadTab(tabId) {
      const tabs = buildPhase13LoadWorkspace(bridge.getCurrentModel?.() || {}).tabs;
      if (tabs.includes(tabId)) loadTab = tabId;
      api.refresh();
      return api.getState();
    },
    previewSlabPanelLoads() {
      const model = bridge.getCurrentModel?.() || {};
      loadPreview = { kind: 'slab-panels', value: previewPhase13SlabPanelChangeSet(model) };
      const preview = loadPreview.value;
      loadMessage = {
        tone: preview.status === 'blocked' ? 'warning' : preview.status === 'review-required' ? 'warning' : 'neutral',
        title: preview.status === 'blocked' ? '슬래브 하중 변환 차단' : '슬래브 하중 변환 미리보기',
        text: `${preview.changes.length}개 변경 · 평형 ${preview.equilibrium.filter((item) => item.status === 'PASS').length}/${preview.equilibrium.length} · 충돌 ${preview.conflicts.length}`,
      };
      api.refresh();
      return api.getState();
    },
    previewManualCombinations(text) {
      const model = bridge.getCurrentModel?.() || {};
      const parsed = parseManualCombinationText(text);
      const preview = parsed.ok
        ? previewPhase13ManualCombinationChangeSet(model, parsed.combinations)
        : { version: 'p13-m3-manual-combination-ui-preview-v1', status: 'blocked', errors: parsed.errors, changes: [], combinations: [] };
      loadPreview = { kind: 'manual-combinations', value: preview, sourceText: String(text || '') };
      loadMessage = {
        tone: preview.status === 'ready' ? 'neutral' : 'warning',
        title: preview.status === 'ready' ? '수동 조합 미리보기' : '수동 조합 검토 필요',
        text: preview.status === 'ready'
          ? `${preview.combinations.length}개 수동 조합 · ${preview.locked?.length || 0}개 생성 조합 보존 · ${preview.changes.length}개 변경`
          : preview.errors?.map((item) => item.code).join(' · ') || '입력을 확인하세요.',
      };
      api.refresh();
      return api.getState();
    },
    reviewLoadPaste(text) {
      loadPasteReview = parsePhase13LoadPaste(text, ['id', 'type', 'target', 'value', 'direction', 'case']);
      loadMessage = {
        tone: loadPasteReview.ok ? 'neutral' : 'warning',
        title: loadPasteReview.ok ? '붙여넣기 검토 완료' : '붙여넣기 차단',
        text: loadPasteReview.ok
          ? `${loadPasteReview.rows.length}개 행을 읽었습니다. 이 단계에서는 검토만 하며 자동 적용하지 않습니다.`
          : `${loadPasteReview.errors.length}개 위험 입력을 발견했습니다. 수식과 매크로는 실행하지 않았습니다.`,
      };
      api.refresh();
      return api.getState();
    },
    applyLoadPreview() {
      const model = bridge.getCurrentModel?.() || {};
      const preview = loadPreview?.value;
      let result = null;
      if (loadPreview?.kind === 'slab-panels') result = applyPhase13SlabPanelChangeSet(model, preview);
      if (loadPreview?.kind === 'manual-combinations') result = applyPhase13ManualCombinationChangeSet(model, preview);
      if (!result?.ok || !commitModelTransaction(model, result)) {
        loadMessage = { tone: 'warning', title: '하중 변경 적용 실패', text: result?.errors?.map((item) => item.code).join(' · ') || '적용 가능한 미리보기가 없습니다.' };
        api.refresh();
        return api.getState();
      }
      loadPreview = null;
      loadTransaction = result.transaction;
      bridge.markAnalysisCasesStale?.('p13-load-workspace-change');
      target.SStructuresElasticResultPopup?.close?.();
      target.draw?.();
      loadMessage = { tone: 'positive', title: '하중 변경 적용 완료', text: '하나의 transaction으로 적용했고 기존 해석결과를 Stale로 전환했습니다.' };
      api.refresh();
      return api.getState();
    },
    undoLoadChange() {
      const model = bridge.getCurrentModel?.() || {};
      if (!loadTransaction) return api.getState();
      const result = undoModelTransaction(model, loadTransaction);
      if (!result.ok || !commitModelTransaction(model, result)) {
        loadMessage = { tone: 'warning', title: '하중 변경 Undo 실패', text: result.errors?.map((item) => item.code).join(' · ') || '모델을 복원하지 못했습니다.' };
        api.refresh();
        return api.getState();
      }
      loadTransaction = null;
      loadPreview = null;
      bridge.markAnalysisCasesStale?.('p13-load-workspace-undo');
      target.SStructuresElasticResultPopup?.close?.();
      target.draw?.();
      loadMessage = { tone: 'positive', title: '하중 변경 Undo 완료', text: '마지막 하중·조합 transaction을 적용 전 상태로 복원했습니다.' };
      api.refresh();
      return api.getState();
    },
    clearLoadPreview() {
      loadPreview = null;
      loadMessage = null;
      api.refresh();
      return api.getState();
    },
    setModelSurface(surface) {
      if (['model-check', 'practical-editors'].includes(surface)) modelSurface = surface;
      api.refresh();
      return api.getState();
    },
    selectEditorObjects(type, ids = []) {
      const values = [...new Set(ids.map(String))];
      if (values[0]) state.selectObject(type, values[0], 'p13-practical-editor');
      if (type === 'member') target.SStructuresNativeModeler?.executeCommand?.('selectMembersByFilter', { ids: values });
      if (type === 'node') target.SStructuresNativeModeler?.executeCommand?.('selectNodesByFilter', { ids: values });
      target.draw?.();
      api.refresh();
      return api.getState();
    },
    previewEditorEdit(input = {}) {
      editorPreview = { kind: 'table-edit', value: previewPhase13TableEdit(bridge.getCurrentModel?.() || {}, input) };
      editorMessage = editorPreview.value.status === 'ready'
        ? { tone: 'neutral', title: '일괄 편집 미리보기', text: `${editorPreview.value.changes.length}개 객체 변경을 검토한 뒤 적용하세요.` }
        : { tone: 'warning', title: '일괄 편집 차단', text: editorPreview.value.errors.map((row) => row.code).join(' · ') };
      api.refresh();
      return api.getState();
    },
    previewStoryEditor(text) {
      const parsed = parseStoryEditorText(text);
      editorPreview = { kind: 'stories', value: parsed.ok ? previewPhase13StoryGeneration(bridge.getCurrentModel?.() || {}, parsed.rows) : { status: 'blocked', changes: [], errors: parsed.errors } };
      editorMessage = editorPreview.value.status === 'ready'
        ? { tone: 'neutral', title: '층 편집 미리보기', text: `${editorPreview.value.stories.length}개 층을 한 transaction으로 적용합니다.` }
        : { tone: 'warning', title: '층 편집 차단', text: editorPreview.value.errors.map((row) => row.code).join(' · ') };
      api.refresh();
      return api.getState();
    },
    previewDiaphragmEditor(input = {}) {
      editorPreview = { kind: 'diaphragm', value: previewPhase13DiaphragmAssignment(bridge.getCurrentModel?.() || {}, input) };
      editorMessage = editorPreview.value.status === 'ready'
        ? { tone: 'neutral', title: '다이어프램 미리보기', text: 'Master/Slave, 중복 배정과 누락 절점을 검토했습니다.' }
        : { tone: 'warning', title: '다이어프램 차단', text: editorPreview.value.validation?.issues?.map((row) => row.code).join(' · ') || '입력을 확인하세요.' };
      api.refresh();
      return api.getState();
    },
    applyEditorPreview() {
      const model = bridge.getCurrentModel?.() || {};
      let result = null;
      if (editorPreview?.kind === 'table-edit') result = applyPhase13TableEdit(model, editorPreview.value);
      if (editorPreview?.kind === 'stories') result = applyPhase13StoryGeneration(model, editorPreview.value);
      if (editorPreview?.kind === 'diaphragm') result = applyPhase13DiaphragmAssignment(model, editorPreview.value);
      if (!result?.ok || !commitModelTransaction(model, result)) {
        editorMessage = { tone: 'warning', title: '편집 적용 실패', text: result?.errors?.map((row) => row.code).join(' · ') || '적용 가능한 미리보기가 없습니다.' };
        api.refresh();
        return api.getState();
      }
      editorTransaction = result.transaction;
      editorPreview = null;
      bridge.markAnalysisCasesStale?.('p13-practical-editor-change');
      target.SStructuresElasticResultPopup?.close?.();
      target.draw?.();
      editorMessage = { tone: 'positive', title: '편집 적용 완료', text: '하나의 transaction으로 적용했고 기존 결과를 Stale로 전환했습니다.' };
      api.refresh();
      return api.getState();
    },
    undoEditorChange() {
      const model = bridge.getCurrentModel?.() || {};
      if (!editorTransaction) return api.getState();
      const result = undoModelTransaction(model, editorTransaction);
      if (!result.ok || !commitModelTransaction(model, result)) return api.getState();
      editorTransaction = null;
      editorPreview = null;
      bridge.markAnalysisCasesStale?.('p13-practical-editor-undo');
      target.draw?.();
      editorMessage = { tone: 'positive', title: '편집 Undo 완료', text: '마지막 실무 편집 transaction을 복원했습니다.' };
      api.refresh();
      return api.getState();
    },
    clearEditorPreview() {
      editorPreview = null;
      editorMessage = null;
      api.refresh();
      return api.getState();
    },
    openKdsProcedures(value = true) {
      kdsOpen = value !== false;
      api.refresh();
      return api.getState();
    },
    setKdsSource(input = {}) {
      kdsSource = createPhase13KdsSourceSnapshot(input);
      kdsProcedure = null;
      kdsApproval = null;
      api.refresh();
      return api.getState();
    },
    runKdsProcedure(procedureId, parameters = {}, rulePack = {}) {
      kdsProcedure = executePhase13KdsProcedure({ source: kdsSource, procedureId, model: bridge.getCurrentModel?.() || {}, parameters, rulePack });
      kdsApproval = null;
      api.refresh();
      return api.getState();
    },
    approveKdsProcedure(input = {}) {
      const model = bridge.getCurrentModel?.() || {};
      kdsApproval = createPhase13KdsApproval(kdsProcedure, {
        ...input,
        projectId: input.projectId || phase13ProjectId(model),
        revisionId: input.revisionId || model.meta?.revisionId || 'working',
      });
      api.refresh();
      return api.getState();
    },
    setResultTab(tabId) {
      if (['overview', 'deformation', 'reactions', 'member-forces', 'story', 'modal', 'rsa', 'p-delta', 'buckling', 'time-history'].includes(tabId)) resultTab = tabId;
      api.refresh();
      return api.getState();
    },
    selectResultObject(type, id) {
      state.selectObject(type, id, 'p13-results-dashboard');
      bridge.selectResultEntity?.(type, id, 'p13-results-dashboard');
      api.refresh();
      return api.getState();
    },
    getResultsDashboard() {
      return cloneValue(currentResultsDashboard(bridge, selectedCase(bridge, selectedCaseId), deriveRunState(bridge, bridge.getCurrentModel?.() || {}, selectedCase(bridge, selectedCaseId), busy), state.getState().selection));
    },
    exportResultCsv() {
      const dashboard = api.getResultsDashboard();
      if (!dashboard) return null;
      return exportPhase13DashboardCsv(buildPhase13ElasticResultQuery(dashboard, { tab: resultTab }));
    },
    setReviewTab(tabId) {
      if (['package', 'revision', 'mgt', 'shell', 'release'].includes(tabId)) reviewTab = tabId;
      api.refresh();
      return api.getState();
    },
    previewMgtImport(text) {
      mgtCandidate = createPhase13MgtImportCandidate(bridge.getCurrentModel?.() || {}, text);
      mgtDraftRevision = null;
      api.refresh();
      return api.getState();
    },
    commitMgtDraft(revisionId) {
      const result = commitPhase13MgtDraftRevision(bridge.getCurrentModel?.() || {}, mgtCandidate, { revisionId });
      mgtDraftRevision = result.ok ? result.draftRevision : null;
      api.refresh();
      return api.getState();
    },
    evaluateShellLab(text, options = {}) {
      const rows = parseShellLabText(text);
      shellLab = buildPhase13ShellLab({ ...options, meshResults: rows, phase10EvidenceStatus: options.phase10EvidenceStatus || 'PASS' });
      api.refresh();
      return api.getState();
    },
    getMilestoneSnapshot() {
      return cloneValue(buildMilestoneSnapshot({ bridge, model: bridge.getCurrentModel?.() || {}, kdsSource, kdsProcedure, kdsApproval, shellLab, mgtCandidate, mgtDraftRevision }));
    },
    async runSelected() {
      if (busy) return api.getState();
      const analysisCase = selectedCase(bridge, selectedCaseId);
      if (!analysisCase) return api.getState();
      busy = true;
      state.setRunState({ execution: 'running', runId: null, current: false, stale: false });
      api.refresh();
      try {
        await bridge.runAnalysisCaseAsync?.({ caseId: analysisCase.id });
      } finally {
        busy = false;
        target.SStructuresElasticAnalysisRibbon?.refresh?.();
        api.refresh();
      }
      return api.getState();
    },
    async runAll() {
      if (busy) return api.getState();
      busy = true;
      state.setRunState({ execution: 'running', runId: null, current: false, stale: false });
      api.refresh();
      try {
        target.SStructuresElasticResultPopup?.close?.();
        target.SStructuresAnalysisCenter?.save?.();
        const cases = ensureElasticAnalysisCases(target);
        for (const item of cases) item.status = 'running';
        const computeTarget = target.SStructuresAnalysisCenter?.getState?.().computeTarget || 'auto';
        await bridge.runAnalysisCasesAsync?.({ cases, computeTarget });
        target.SStructuresElasticResultPopup?.close?.();
        target.SStructuresAnalysisCenter?.close?.();
        target.SStructuresElasticSetupWorkflow?.refresh?.();
        target.SStructuresElasticAnalysisRibbon?.refresh?.();
      } finally {
        busy = false;
        api.refresh();
      }
      return api.getState();
    },
    refresh() {
      const model = bridge.getCurrentModel?.() || {};
      const cases = elasticCases(bridge);
      if (!cases.some((item) => item.id === selectedCaseId)) {
        selectedCaseId = target.SStructuresAnalysisCenter?.getState?.().selectedCaseId || cases[0]?.id || null;
      }
      const analysisCase = selectedCase(bridge, selectedCaseId);
      const runState = deriveRunState(bridge, model, analysisCase, busy);
      state.setRunState(runState);
      const modelCheck = currentModelCheck(target, model);
      if (selectedIssueId && !modelCheck.issues.some((item) => item.issueId === selectedIssueId)) selectedIssueId = null;
      const modelCheckUi = {
        selectedIssueId, repairPreview, repairTransaction, issueFilters, modelCheckMessage, modelCheck,
        loadTab, loadPreview, loadTransaction, loadMessage, loadPasteReview,
        modelSurface, editorPreview, editorTransaction, editorMessage,
        kdsOpen, kdsSource, kdsProcedure, kdsApproval,
        resultTab, reviewTab, mgtCandidate, mgtDraftRevision, shellLab,
      };
      renderNavigation(navButtons, state.getState().workspace);
      renderTree(doc, tree, model, cases, selectedCaseId, api);
      renderCenter(doc, center, state.getState().workspace, model, analysisCase, bridge, runState, api, modelCheckUi);
      renderInspector(doc, inspector, model, analysisCase, bridge, runState, modelCheckUi);
      renderDrawer(doc, drawer, bridge, cases, runState);
      renderStatus(status, runState);
      runButton.disabled = busy || !analysisCase;
      runAllButton.disabled = busy || !bridge.getCurrentModel?.();
      launch.setAttribute('data-run-status', runState.execution);
      root.setAttribute('data-run-status', runState.execution);
      return api.getState();
    },
    getState() {
      const model = bridge.getCurrentModel?.() || {};
      const analysisCase = selectedCase(bridge, selectedCaseId);
      return {
        version: INDEX_PHASE13_ELASTIC_WORKSPACE_VERSION,
        open,
        busy,
        selectedCaseId: analysisCase?.id || null,
        elasticCaseCount: elasticCases(bridge).length,
        workspace: state.getState(),
        runState: deriveRunState(bridge, model, analysisCase, busy),
        modelCheck: {
          summary: currentModelCheck(target, model).summary,
          selectedIssueId,
          filters: { ...issueFilters },
          preview: repairPreview ? {
            ok: repairPreview.ok,
            changes: repairPreview.changes.length,
            issueDelta: repairPreview.issueDelta,
          } : null,
          canUndo: !!repairTransaction,
          message: modelCheckMessage ? { ...modelCheckMessage } : null,
          waiverCount: readIssueWaivers(target, model).length,
        },
        loadWorkspace: {
          tab: loadTab,
          preview: loadPreview ? {
            kind: loadPreview.kind,
            status: loadPreview.value?.status || null,
            changes: loadPreview.value?.changes?.length || 0,
          } : null,
          pasteReview: loadPasteReview ? {
            ok: loadPasteReview.ok,
            rows: loadPasteReview.rows.length,
            errors: loadPasteReview.errors.length,
            formulasExecuted: false,
            macrosExecuted: false,
          } : null,
          message: loadMessage ? { ...loadMessage } : null,
          canUndo: !!loadTransaction,
        },
        practicalEditors: {
          surface: modelSurface,
          preview: editorPreview ? { kind: editorPreview.kind, status: editorPreview.value?.status || null, changes: editorPreview.value?.changes?.length || 0 } : null,
          canUndo: !!editorTransaction,
          message: editorMessage ? { ...editorMessage } : null,
          diaphragmValidation: validatePhase13Diaphragms(model),
        },
        kds: {
          open: kdsOpen,
          sourceStatus: kdsSource.status,
          sourceErrors: kdsSource.errors.length,
          procedureId: kdsProcedure?.procedureId || null,
          procedureStatus: kdsProcedure?.status || null,
          approvalStatus: kdsApproval ? evaluatePhase13KdsApproval(kdsProcedure, kdsApproval, { projectId: phase13ProjectId(model), revisionId: model.meta?.revisionId || 'working' }).status : 'unapproved',
        },
        resultsDashboard: { tab: resultTab, available: !!api.getResultsDashboard() },
        reviewHub: {
          tab: reviewTab,
          mgtStatus: mgtCandidate?.status || null,
          draftRevisionId: mgtDraftRevision?.meta?.revisionId || null,
          shellStatus: shellLab.status,
          shellDesignTransferAllowed: false,
        },
        invariants: {
          openSeesRuntimeUsed: false,
          externalSolverRuntimeDependency: false,
          nonlinearInScope: false,
          shellDesignTransferAllowed: false,
        },
      };
    },
  };

  launch.addEventListener?.('click', () => api.open());
  target.SStructuresResultSelection?.subscribe?.(() => api.refresh());
  target.SStructuresPhase13Workspace = api;
  api.refresh();
  return api;
}

function renderNavigation(buttons, workspace) {
  for (const [id, button] of buttons) {
    const active = id === workspace;
    button.classList?.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  }
}

function renderTree(doc, root, model, cases, selectedCaseId, api) {
  clear(root);
  root.appendChild(sectionTitle(doc, '모델 / 케이스 트리', `${(model.nodes || []).length}절점 · ${(model.members || []).length}부재`));
  const modelGroup = element(doc, 'div', 'ss-p13-tree-group');
  modelGroup.appendChild(element(doc, 'h4', '', '모델'));
  modelGroup.appendChild(metricRow(doc, '절점', (model.nodes || []).length));
  modelGroup.appendChild(metricRow(doc, '부재', (model.members || []).length));
  modelGroup.appendChild(metricRow(doc, '하중', (model.loads || []).length));
  root.appendChild(modelGroup);
  const caseGroup = element(doc, 'div', 'ss-p13-tree-group');
  caseGroup.appendChild(element(doc, 'h4', '', '탄성해석 케이스'));
  if (!cases.length) caseGroup.appendChild(element(doc, 'p', 'ss-p13-empty', '탄성해석 케이스가 없습니다.'));
  for (const item of cases) {
    const button = element(doc, 'button', 'ss-p13-case', '');
    button.type = 'button';
    button.setAttribute('data-p13-case-id', item.id);
    button.setAttribute('data-testid', `p13-case-${item.id}`);
    button.classList?.toggle('active', item.id === selectedCaseId);
    button.appendChild(element(doc, 'span', '', item.name || item.id));
    button.appendChild(element(doc, 'small', `ss-p13-case-status is-${normalizeStatus(item.status)}`, statusLabel(item.status)));
    button.addEventListener?.('click', () => api.selectCase(item.id));
    caseGroup.appendChild(button);
  }
  root.appendChild(caseGroup);
}

function renderCenter(doc, root, workspace, model, analysisCase, bridge, runState, api, modelCheckUi) {
  clear(root);
  const renderers = {
    project: renderProject,
    model: renderModelCheck,
    loads: renderLoads,
    analysis: renderAnalysis,
    results: renderResults,
    report: renderReport,
  };
  (renderers[workspace] || renderProject)(doc, root, model, analysisCase, bridge, runState, api, modelCheckUi);
}

function renderProject(doc, root, model, analysisCase, bridge, runState) {
  root.appendChild(sectionTitle(doc, '프로젝트 개요', '실무 검토 흐름을 한 화면에서 추적합니다.'));
  const cards = element(doc, 'div', 'ss-p13-card-grid');
  cards.appendChild(summaryCard(doc, '모델', `${(model.nodes || []).length} 절점`, `${(model.members || []).length} 부재`));
  cards.appendChild(summaryCard(doc, '하중', `${(model.loadCases || []).length} 하중케이스`, `${(model.loadCombinations || []).length} 조합`));
  cards.appendChild(summaryCard(doc, '선택 해석', analysisCase?.name || '미선택', statusLabel(runState.execution)));
  cards.appendChild(summaryCard(doc, '해석 엔진', 'S-Structures 자체 엔진', '외부 Solver 미사용'));
  root.appendChild(cards);
  root.appendChild(notice(doc, 'Phase 13 원칙', '현재 범위는 탄성해석 실무화입니다. OpenSees와 외부 Solver 런타임은 사용하지 않으며, 비선형해석은 이 워크벤치 실행 대상에서 제외합니다.'));
}

function renderModelCheck(doc, root, model, _analysisCase, _bridge, _runState, api, ui = {}) {
  const surfaceTabs = element(doc, 'div', 'ss-p13-load-tabs');
  for (const [id, label] of [['model-check', '모델 검토'], ['practical-editors', '실무 편집기']]) {
    const button = element(doc, 'button', `ss-p13-load-tab${ui.modelSurface === id ? ' active' : ''}`, label);
    button.type = 'button';
    button.setAttribute('data-testid', `p13-model-surface-${id}`);
    button.addEventListener?.('click', () => api.setModelSurface(id));
    surfaceTabs.appendChild(button);
  }
  root.appendChild(surfaceTabs);
  if (ui.modelSurface === 'practical-editors') {
    renderPracticalEditors(doc, root, model, api, ui);
    return;
  }
  const check = ui.modelCheck || buildPhase13ModelCheck(model);
  const center = buildPhase13IssueCenterView(check, ui.issueFilters || {});
  root.appendChild(sectionTitle(doc, '모델 검토 센터', `Blocker ${check.summary.blockers} · Warning ${check.summary.warnings} · Repairable ${check.summary.repairable}`));
  const cards = element(doc, 'div', 'ss-p13-card-grid compact');
  cards.appendChild(summaryCard(doc, '분석 가능', check.ok ? '예' : '아니오', check.ok ? 'Blocker 없음' : '수정 필요'));
  cards.appendChild(summaryCard(doc, '자동수정 후보', String(check.summary.repairable), '미리보기 후 적용'));
  root.appendChild(cards);
  const toolbar = element(doc, 'div', 'ss-p13-issue-toolbar');
  const severity = selectControl(doc, 'p13IssueSeverity', '전체 심각도', [
    ['', '전체 심각도'], ['blocker', 'Blocker'], ['warning', 'Warning'],
  ], ui.issueFilters?.severity || '');
  severity.setAttribute('data-testid', 'p13-issue-severity');
  severity.addEventListener?.('change', () => api.setIssueFilters({ severity: severity.value }));
  const search = element(doc, 'input', 'ss-p13-input');
  search.id = 'p13IssueSearch';
  search.type = 'search';
  search.value = ui.issueFilters?.search || '';
  search.setAttribute('placeholder', '코드·객체·메시지 검색');
  search.setAttribute('aria-label', '모델 이슈 검색');
  search.setAttribute('data-testid', 'p13-issue-search');
  const searchButton = element(doc, 'button', 'ss-p13-secondary', '검색');
  searchButton.type = 'button';
  searchButton.addEventListener?.('click', () => api.setIssueFilters({ search: search.value }));
  const repairAll = element(doc, 'button', 'ss-p13-secondary', '수정 가능 항목 미리보기');
  repairAll.type = 'button';
  repairAll.disabled = check.summary.repairable === 0;
  repairAll.setAttribute('data-testid', 'p13-preview-all-repairs');
  repairAll.addEventListener?.('click', () => api.previewIssueRepair(check.issues.filter((item) => item.proposedFixId).map((item) => item.issueId)));
  const undo = element(doc, 'button', 'ss-p13-secondary', '마지막 수정 Undo');
  undo.type = 'button';
  undo.disabled = !ui.repairTransaction;
  undo.setAttribute('data-testid', 'p13-repair-undo');
  undo.addEventListener?.('click', () => api.undoIssueRepair());
  toolbar.appendChild(severity);
  toolbar.appendChild(search);
  toolbar.appendChild(searchButton);
  toolbar.appendChild(repairAll);
  toolbar.appendChild(undo);
  root.appendChild(toolbar);
  if (ui.modelCheckMessage) root.appendChild(notice(doc, ui.modelCheckMessage.title, ui.modelCheckMessage.text, ui.modelCheckMessage.tone));
  if (ui.repairPreview) root.appendChild(renderRepairPreview(doc, ui.repairPreview, api));
  const list = element(doc, 'div', 'ss-p13-list');
  if (!center.issues.length) list.appendChild(notice(doc, '모델 검사 완료', '현재 모델에서 표시할 이슈가 없습니다.', 'positive'));
  for (const issue of center.issues.slice(0, 30)) {
    const row = element(doc, 'article', `ss-p13-issue is-${issue.severity}${issue.issueId === ui.selectedIssueId ? ' is-selected' : ''}`);
    row.setAttribute('data-p13-issue-id', issue.issueId);
    row.setAttribute('data-testid', `p13-issue-${issue.issueId}`);
    const issueMain = element(doc, 'button', 'ss-p13-issue-main');
    issueMain.type = 'button';
    issueMain.setAttribute('aria-label', `${issue.code} 이슈 선택`);
    issueMain.appendChild(element(doc, 'strong', '', issue.code));
    issueMain.appendChild(element(doc, 'span', '', issue.message));
    issueMain.appendChild(element(doc, 'small', '', `${issue.category} · ${issue.fixability} · ${issue.waiverStatus}`));
    issueMain.addEventListener?.('click', () => api.selectIssue(issue.issueId));
    row.appendChild(issueMain);
    const issueActions = element(doc, 'div', 'ss-p13-issue-actions');
    if (issue.proposedFixId) {
      const preview = element(doc, 'button', 'ss-p13-secondary', '수정 미리보기');
      preview.type = 'button';
      preview.setAttribute('data-testid', `p13-preview-${issue.issueId}`);
      preview.addEventListener?.('click', () => api.previewIssueRepair(issue.issueId));
      issueActions.appendChild(preview);
    }
    if (issue.severity === 'warning' && issue.waiverStatus !== 'waived') {
      const reviewer = element(doc, 'input', 'ss-p13-mini-input');
      reviewer.type = 'text';
      reviewer.value = '';
      reviewer.setAttribute('placeholder', '검토자');
      reviewer.setAttribute('aria-label', `${issue.code} Waiver 검토자`);
      const reason = element(doc, 'input', 'ss-p13-mini-input');
      reason.type = 'text';
      reason.value = '';
      reason.setAttribute('placeholder', 'Waiver 사유');
      reason.setAttribute('aria-label', `${issue.code} Waiver 사유`);
      const waive = element(doc, 'button', 'ss-p13-secondary', 'Waiver 기록');
      waive.type = 'button';
      waive.setAttribute('data-testid', `p13-waive-${issue.issueId}`);
      waive.addEventListener?.('click', () => api.waiveIssue(issue.issueId, { reviewer: reviewer.value, reason: reason.value }));
      issueActions.appendChild(reviewer);
      issueActions.appendChild(reason);
      issueActions.appendChild(waive);
    }
    row.appendChild(issueActions);
    list.appendChild(row);
  }
  root.appendChild(list);
}

function renderPracticalEditors(doc, root, model, api, ui) {
  root.appendChild(sectionTitle(doc, '실무 모델·층·다이어프램 편집기', '선택 범위와 변경 내용을 먼저 검토한 뒤 한 transaction으로 적용합니다.'));
  const cards = element(doc, 'div', 'ss-p13-card-grid compact');
  cards.appendChild(summaryCard(doc, '층', String((model.stories || []).length), 'geometry 이동과 metadata 편집 분리'));
  const diaphragmValidation = validatePhase13Diaphragms(model);
  cards.appendChild(summaryCard(doc, '다이어프램', String((model.diaphragms || []).length), diaphragmValidation.ok ? '배정 검증 PASS' : `${diaphragmValidation.issues.length}개 blocker`));
  root.appendChild(cards);
  const history = element(doc, 'div', 'ss-p13-inline-actions');
  const undo = element(doc, 'button', 'ss-p13-secondary', '마지막 실무 편집 Undo');
  undo.type = 'button'; undo.disabled = !ui.editorTransaction; undo.setAttribute('data-testid', 'p13-editor-undo'); undo.addEventListener?.('click', () => api.undoEditorChange());
  history.appendChild(undo); root.appendChild(history);
  if (ui.editorMessage) root.appendChild(notice(doc, ui.editorMessage.title, ui.editorMessage.text, ui.editorMessage.tone));
  if (ui.editorPreview) root.appendChild(renderEditorPreview(doc, ui.editorPreview, api));

  const objectList = element(doc, 'div', 'ss-p13-inline-actions');
  for (const member of (model.members || []).slice(0, 20)) {
    const button = element(doc, 'button', 'ss-p13-secondary', member.id);
    button.type = 'button'; button.setAttribute('data-p13-editor-object-id', member.id); button.setAttribute('data-testid', `p13-editor-select-${member.id}`);
    button.addEventListener?.('click', () => api.selectEditorObjects('member', [member.id])); objectList.appendChild(button);
  }
  root.appendChild(objectList);

  const batch = element(doc, 'section', 'ss-p13-editor');
  batch.appendChild(element(doc, 'strong', '', '선택 객체 일괄 편집'));
  batch.appendChild(element(doc, 'p', 'ss-p13-help', '지원 필드만 적용하며 ID·version 변경과 비정상 숫자는 차단합니다.'));
  const batchRow = element(doc, 'div', 'ss-p13-form-grid');
  const collection = selectControl(doc, 'p13EditorCollection', '컬렉션', [['members', '부재'], ['nodes', '절점']], 'members');
  const ids = inputControl(doc, 'p13EditorIds', 'text', '객체 ID (쉼표 구분)', (model.members || []).slice(0, 2).map((row) => row.id).join(','));
  const field = inputControl(doc, 'p13EditorField', 'text', '필드', 'secId');
  const value = inputControl(doc, 'p13EditorValue', 'text', '새 값', model.members?.[0]?.secId || '');
  const preview = element(doc, 'button', 'ss-p13-primary', '일괄 편집 미리보기');
  preview.type = 'button'; preview.setAttribute('data-testid', 'p13-editor-batch-preview');
  preview.addEventListener?.('click', () => api.previewEditorEdit({ collection: collection.value, ids: ids.value.split(',').map((row) => row.trim()).filter(Boolean), patch: { [field.value.trim()]: parseEditorValue(value.value) } }));
  [collection, ids, field, value, preview].forEach((node) => batchRow.appendChild(node)); batch.appendChild(batchRow); root.appendChild(batch);

  const stories = element(doc, 'section', 'ss-p13-editor');
  stories.appendChild(element(doc, 'strong', '', '층 관리자'));
  stories.appendChild(element(doc, 'p', 'ss-p13-help', '한 줄에 층 ID, 이름, 기준고도를 입력합니다. 기준고도 순서와 중복 ID를 검사합니다.'));
  const storyText = element(doc, 'textarea', 'ss-p13-textarea compact');
  storyText.setAttribute('aria-label', '층 편집 입력'); storyText.setAttribute('data-testid', 'p13-story-editor-text');
  storyText.value = (model.stories || []).map((row) => `${row.id},${row.name || row.id},${row.elevation ?? row.z ?? row.level ?? ''}`).join('\n');
  const storyPreview = element(doc, 'button', 'ss-p13-secondary', '층 편집 미리보기');
  storyPreview.type = 'button'; storyPreview.setAttribute('data-testid', 'p13-story-preview'); storyPreview.addEventListener?.('click', () => api.previewStoryEditor(storyText.value));
  stories.appendChild(storyText); stories.appendChild(storyPreview); root.appendChild(stories);

  const diaphragm = element(doc, 'section', 'ss-p13-editor');
  diaphragm.appendChild(element(doc, 'strong', '', '다이어프램 관리자'));
  const diaphragmRow = element(doc, 'div', 'ss-p13-form-grid');
  const did = inputControl(doc, 'p13DiaphragmId', 'text', 'ID', 'D1');
  const master = inputControl(doc, 'p13DiaphragmMaster', 'text', 'Master 절점', model.nodes?.[0]?.id || '');
  const slaves = inputControl(doc, 'p13DiaphragmSlaves', 'text', 'Slave 절점 (쉼표)', (model.nodes || []).slice(1).map((row) => row.id).join(','));
  const diaphragmPreview = element(doc, 'button', 'ss-p13-secondary', '다이어프램 미리보기');
  diaphragmPreview.type = 'button'; diaphragmPreview.setAttribute('data-testid', 'p13-diaphragm-preview');
  diaphragmPreview.addEventListener?.('click', () => api.previewDiaphragmEditor({ id: did.value, masterNodeId: master.value, nodeIds: slaves.value.split(',').map((row) => row.trim()).filter(Boolean) }));
  [did, master, slaves, diaphragmPreview].forEach((node) => diaphragmRow.appendChild(node)); diaphragm.appendChild(diaphragmRow); root.appendChild(diaphragm);
}

function renderEditorPreview(doc, holder, api) {
  const preview = holder.value || {};
  const node = element(doc, 'section', 'ss-p13-repair-preview'); node.setAttribute('data-testid', 'p13-editor-preview');
  node.appendChild(element(doc, 'strong', '', `${holder.kind} · ${preview.status || 'blocked'} · ${preview.changes?.length || 0}개 변경`));
  if (preview.errors?.length) node.appendChild(element(doc, 'code', 'ss-p13-preview-error', preview.errors.map((row) => row.code).join(' · ')));
  const actions = element(doc, 'div', 'ss-p13-preview-actions');
  const apply = element(doc, 'button', 'ss-p13-primary', '검토한 편집 적용'); apply.type = 'button'; apply.disabled = preview.status !== 'ready'; apply.setAttribute('data-testid', 'p13-editor-apply'); apply.addEventListener?.('click', () => api.applyEditorPreview());
  const cancel = element(doc, 'button', 'ss-p13-secondary', '취소'); cancel.type = 'button'; cancel.addEventListener?.('click', () => api.clearEditorPreview());
  actions.appendChild(apply); actions.appendChild(cancel); node.appendChild(actions); return node;
}

function renderLoads(doc, root, model, analysisCase, bridge, _runState, api, ui = {}) {
  const workspace = buildPhase13LoadWorkspace(model, { result: analysisCase ? bridge.getAnalysisCaseResult?.(analysisCase.id) : null });
  root.appendChild(sectionTitle(doc, '하중·질량 워크스페이스', '하중 근거, 질량원, 조합 소유권을 함께 검토합니다.'));
  const cards = element(doc, 'div', 'ss-p13-card-grid');
  cards.appendChild(summaryCard(doc, '하중케이스', String(workspace.loadCases.length), `${workspace.loads.length}개 하중`));
  cards.appendChild(summaryCard(doc, '슬래브 패널', String(workspace.slabPanels.length), '변환 전 검토'));
  cards.appendChild(summaryCard(doc, '질량원', String(workspace.massSources.length), `${workspace.massSources.filter((row) => row.validation?.ok === false).length}개 검토`));
  cards.appendChild(summaryCard(doc, '하중조합', String(workspace.combinations.length), `${workspace.combinations.filter((row) => row.ownership === 'manual').length}개 수동`));
  root.appendChild(cards);
  const tabs = element(doc, 'div', 'ss-p13-load-tabs');
  for (const tabId of workspace.tabs) {
    const button = element(doc, 'button', `ss-p13-load-tab${tabId === ui.loadTab ? ' active' : ''}`, loadTabLabel(tabId));
    button.type = 'button';
    button.setAttribute('data-p13-load-tab', tabId);
    button.setAttribute('data-testid', `p13-load-tab-${tabId}`);
    button.addEventListener?.('click', () => api.setLoadTab(tabId));
    tabs.appendChild(button);
  }
  root.appendChild(tabs);
  const historyActions = element(doc, 'div', 'ss-p13-inline-actions');
  const undo = element(doc, 'button', 'ss-p13-secondary', '마지막 하중 변경 Undo');
  undo.type = 'button';
  undo.disabled = !ui.loadTransaction;
  undo.setAttribute('data-testid', 'p13-load-undo');
  undo.addEventListener?.('click', () => api.undoLoadChange());
  historyActions.appendChild(undo);
  const kds = element(doc, 'button', ui.kdsOpen ? 'ss-p13-primary' : 'ss-p13-secondary', ui.kdsOpen ? 'KDS 절차 닫기' : 'KDS 절차');
  kds.type = 'button'; kds.setAttribute('data-testid', 'p13-kds-open'); kds.addEventListener?.('click', () => api.openKdsProcedures(!ui.kdsOpen));
  historyActions.appendChild(kds);
  root.appendChild(historyActions);
  if (ui.kdsOpen) {
    renderKdsProcedures(doc, root, model, api, ui);
    return;
  }
  if (ui.loadMessage) root.appendChild(notice(doc, ui.loadMessage.title, ui.loadMessage.text, ui.loadMessage.tone));
  if (ui.loadPreview) root.appendChild(renderLoadPreview(doc, ui.loadPreview, api));

  const tab = ui.loadTab || 'load-cases';
  if (tab === 'load-cases') {
    root.appendChild(dataTable(doc, ['ID', '이름', '구분'], workspace.loadCases.slice(0, 100).map((row) => [row.id, row.name || '-', row.type || '-'])));
  } else if (tab === 'loads') {
    root.appendChild(dataTable(doc, ['ID', '형식', '대상', '방향', '케이스'], workspace.loads.slice(0, 100).map((row) => [row.id, row.type || '-', row.node || row.member || row.panel || '-', row.dir || row.direction || '-', row.case || '-'])));
    root.appendChild(renderLoadPasteReview(doc, ui.loadPasteReview, api));
  } else if (tab === 'slab-panels') {
    const actionBar = element(doc, 'div', 'ss-p13-inline-actions');
    const preview = element(doc, 'button', 'ss-p13-primary', '슬래브 하중 전달 미리보기');
    preview.type = 'button';
    preview.disabled = workspace.slabPanels.length === 0;
    preview.setAttribute('data-testid', 'p13-slab-preview');
    preview.addEventListener?.('click', () => api.previewSlabPanelLoads());
    actionBar.appendChild(preview);
    actionBar.appendChild(element(doc, 'span', 'ss-p13-help', 'qA, 전달합, centroid moment와 사용자 override 충돌을 적용 전에 검사합니다.'));
    root.appendChild(actionBar);
    root.appendChild(dataTable(doc, ['ID', '케이스', '분배', '면하중'], workspace.slabPanels.slice(0, 100).map((row) => [row.id, row.case || '-', row.distribution || '-', row.load ?? row.q ?? '-'])));
  } else if (tab === 'mass-sources') {
    root.appendChild(dataTable(doc, ['ID', '검증', '오류', '경고'], workspace.massSources.slice(0, 100).map((row) => [row.id, row.validation?.ok ? 'PASS' : 'REVIEW', row.validation?.errors?.length || 0, row.validation?.warnings?.length || 0])));
    root.appendChild(notice(doc, '질량원 안전 규칙', 'Modal/RSA는 선택된 질량원 snapshot을 참조합니다. self-weight와 물리 질량의 중복 후보는 Audit에서 확인하세요.'));
  } else if (tab === 'manual-combinations') {
    root.appendChild(renderManualCombinationEditor(doc, workspace, ui.loadPreview, api));
    root.appendChild(dataTable(doc, ['ID', '그룹', '소유권', '계수'], workspace.combinations.slice(0, 100).map((row) => [row.id, row.group || row.type || '-', row.ownership, formatFactors(row.factors)])));
  } else {
    const audit = workspace.audit || {};
    const summary = audit.summary || {};
    const auditCards = element(doc, 'div', 'ss-p13-card-grid compact');
    auditCards.appendChild(summaryCard(doc, 'Audit 상태', audit.status || '-', `${summary.issueCount || 0}개 이슈`));
    auditCards.appendChild(summaryCard(doc, '오류 / 경고', `${summary.errorCount || 0} / ${summary.warningCount || 0}`, `고아 ${summary.orphanCount || 0}`));
    root.appendChild(auditCards);
    const parity = element(doc, 'div', 'ss-p13-card-grid compact');
    parity.appendChild(summaryCard(doc, '하중 6-resultant', workspace.resultantAudit.status, `Residual ${workspace.resultantAudit.relativeResidual ?? '결과 필요'}`));
    parity.appendChild(summaryCard(doc, '질량 조립 Parity', workspace.massParity.status, `Residual ${workspace.massParity.relativeResidual ?? '결과 필요'}`));
    root.appendChild(parity);
    root.appendChild(dataTable(doc, ['심각도', '코드', '메시지'], (audit.issues || []).slice(0, 100).map((row) => [row.severity, row.code, row.message])));
  }
}

function renderKdsProcedures(doc, root, model, api, ui) {
  root.appendChild(sectionTitle(doc, 'Source-bound KDS 하중 절차', '공식 source hash·조항·fixture·검토 승인이 없으면 계산과 설계전이를 차단합니다.'));
  const source = ui.kdsSource || createPhase13KdsSourceSnapshot({});
  const statusCards = element(doc, 'div', 'ss-p13-card-grid compact');
  statusCards.appendChild(summaryCard(doc, 'Source', source.status, source.snapshotHash || 'snapshot 없음'));
  statusCards.appendChild(summaryCard(doc, '절차', ui.kdsProcedure?.status || '미실행', ui.kdsProcedure?.procedureId || '절차 선택 필요'));
  root.appendChild(statusCards);
  if (source.errors?.length) root.appendChild(notice(doc, '공식 Source 입력 필요', source.errors.join(' · '), 'warning'));

  const form = element(doc, 'section', 'ss-p13-editor');
  form.appendChild(element(doc, 'strong', '', '기준 Source와 검토 상태'));
  const grid = element(doc, 'div', 'ss-p13-form-grid');
  const sourceId = inputControl(doc, 'p13KdsSourceId', 'text', 'Source ID', source.sourceId || '');
  const code = inputControl(doc, 'p13KdsCode', 'text', '기준명', source.code || '');
  const edition = inputControl(doc, 'p13KdsEdition', 'text', '판본', source.edition || '');
  const effectiveDate = inputControl(doc, 'p13KdsEffectiveDate', 'text', '시행일', source.effectiveDate || '');
  const locator = inputControl(doc, 'p13KdsLocator', 'text', '원문 위치', source.sourceLocator || '');
  const sourceHash = inputControl(doc, 'p13KdsSourceHash', 'text', '원문 SHA-256', source.sourceHash || '');
  const fixtureHash = inputControl(doc, 'p13KdsFixtureHash', 'text', 'Fixture SHA-256', source.fixtureHash || '');
  const formulaVersion = inputControl(doc, 'p13KdsFormulaVersion', 'text', '계산식 버전', source.formulaVersion || '');
  const reviewer = inputControl(doc, 'p13KdsReviewer', 'text', 'Source 검토자', source.reviewer || '');
  const approvedAt = inputControl(doc, 'p13KdsApprovedAt', 'text', '승인 시각', source.approvedAt || '');
  const windClause = inputControl(doc, 'p13KdsWindClause', 'text', '풍 조항', source.clauseMap?.['wind-story-transfer'] || '');
  const seismicClause = inputControl(doc, 'p13KdsSeismicClause', 'text', '지진 조항', source.clauseMap?.['seismic-story-distribution'] || '');
  const snowClause = inputControl(doc, 'p13KdsSnowClause', 'text', '적설 조항', source.clauseMap?.['snow-project-input'] || '');
  const sourceReview = selectControl(doc, 'p13KdsReviewStatus', '검토 상태', [['candidate', 'Candidate'], ['approved', '승인됨']], source.reviewStatus || 'candidate');
  const branchCoverage = selectControl(doc, 'p13KdsBranchCoverage', '분기 fixture 검토', [['false', '미완료'], ['true', '완료']], source.branchCoverageApproved ? 'true' : 'false');
  const saveSource = element(doc, 'button', 'ss-p13-primary', 'Source Snapshot 검증');
  saveSource.type = 'button'; saveSource.setAttribute('data-testid', 'p13-kds-source-validate');
  saveSource.addEventListener?.('click', () => api.setKdsSource({
    packId: sourceId.value, sourceId: sourceId.value, authority: 'project-approved-authority', code: code.value, edition: edition.value,
    effectiveDate: effectiveDate.value, sourceLocator: locator.value, sourceHash: sourceHash.value, fixtureHash: fixtureHash.value,
    formulaVersion: formulaVersion.value, reviewer: reviewer.value, approvedAt: approvedAt.value, reviewStatus: sourceReview.value,
    branchCoverageApproved: branchCoverage.value === 'true', clauseMap: { 'wind-story-transfer': windClause.value, 'seismic-story-distribution': seismicClause.value, 'snow-project-input': snowClause.value },
  }));
  [sourceId, code, edition, effectiveDate, locator, sourceHash, fixtureHash, formulaVersion, reviewer, approvedAt, windClause, seismicClause, snowClause, sourceReview, branchCoverage, saveSource].forEach((node) => grid.appendChild(node));
  form.appendChild(grid); root.appendChild(form);

  const procedures = element(doc, 'section', 'ss-p13-editor');
  procedures.appendChild(element(doc, 'strong', '', '지원 절차 실행'));
  const params = element(doc, 'div', 'ss-p13-form-grid');
  const pressure = inputControl(doc, 'p13KdsPressure', 'number', '풍압/적설압', '1');
  const area = inputControl(doc, 'p13KdsArea', 'number', '적설 면적', '50');
  const baseShear = inputControl(doc, 'p13KdsBaseShear', 'number', '지진 밑면전단력', '100');
  const wind = element(doc, 'button', 'ss-p13-secondary', '풍 층전달 검토'); wind.type = 'button'; wind.addEventListener?.('click', () => api.runKdsProcedure('wind-story-transfer', { pressure: Number(pressure.value), direction: 'x', units: { pressure: 'project-force/area' } }));
  const seismic = element(doc, 'button', 'ss-p13-secondary', '지진 층분포 검토'); seismic.type = 'button'; seismic.addEventListener?.('click', () => api.runKdsProcedure('seismic-story-distribution', { baseShear: Number(baseShear.value), units: { baseShear: 'project-force' } }));
  const snow = element(doc, 'button', 'ss-p13-secondary', '적설 프로젝트값 검토'); snow.type = 'button'; snow.addEventListener?.('click', () => api.runKdsProcedure('snow-project-input', { pressure: Number(pressure.value), area: Number(area.value), units: { pressure: 'project-force/area', area: 'project-area' } }));
  [pressure, area, baseShear, wind, seismic, snow].forEach((node) => params.appendChild(node)); procedures.appendChild(params); root.appendChild(procedures);

  if (ui.kdsProcedure) {
    const procedure = ui.kdsProcedure;
    root.appendChild(notice(doc, `절차 ${procedure.status}`, procedure.status === 'blocked' ? procedure.blockers.join(' · ') : `${procedure.trace?.clause} · ${procedure.trace?.formula}`, procedure.status === 'blocked' ? 'warning' : 'positive'));
    const approvalForm = element(doc, 'section', 'ss-p13-editor');
    approvalForm.appendChild(element(doc, 'strong', '', '프로젝트 승인'));
    const approvalReviewer = inputControl(doc, 'p13KdsApprovalReviewer', 'text', '프로젝트 검토자', '');
    const approvalMemo = inputControl(doc, 'p13KdsApprovalMemo', 'text', '검토 메모', '');
    const approve = element(doc, 'button', 'ss-p13-primary', '현재 Revision에 승인'); approve.type = 'button'; approve.disabled = procedure.status !== 'review-ready'; approve.setAttribute('data-testid', 'p13-kds-approve');
    approve.addEventListener?.('click', () => api.approveKdsProcedure({ reviewer: approvalReviewer.value, memo: approvalMemo.value, approvedAt: new Date().toISOString() }));
    approvalForm.appendChild(approvalReviewer); approvalForm.appendChild(approvalMemo); approvalForm.appendChild(approve); root.appendChild(approvalForm);
  }
  if (ui.kdsApproval) {
    const approvalState = evaluatePhase13KdsApproval(ui.kdsProcedure, ui.kdsApproval, { projectId: phase13ProjectId(model), revisionId: model.meta?.revisionId || 'working' });
    root.appendChild(notice(doc, `프로젝트 승인 ${approvalState.status}`, approvalState.blockers.join(' · ') || `Approval ${ui.kdsApproval.approvalHash}`, approvalState.status === 'approved' ? 'positive' : 'warning'));
  }
}

function renderAnalysis(doc, root, _model, analysisCase, _bridge, runState) {
  root.appendChild(sectionTitle(doc, '탄성해석 실행', '선택 케이스와 불변 실행기록을 기준으로 상태를 판정합니다.'));
  if (!analysisCase) {
    root.appendChild(notice(doc, '해석 케이스 없음', '왼쪽 트리에서 케이스를 만들거나 기존 탄성해석 리본을 사용하세요.', 'warning'));
    return;
  }
  const cards = element(doc, 'div', 'ss-p13-card-grid');
  cards.appendChild(summaryCard(doc, '케이스', analysisCase.name || analysisCase.id, analysisCase.kind));
  cards.appendChild(summaryCard(doc, '실행 상태', statusLabel(runState.execution), runState.runId || '실행기록 없음'));
  cards.appendChild(summaryCard(doc, '검증 등급', runState.qualification || '미판정', runState.current ? '현재 모델과 일치' : '현재 결과 아님'));
  cards.appendChild(summaryCard(doc, '설계 전달', runState.designTransferAllowed ? '허용' : '차단', '검증 및 현재성 필요'));
  root.appendChild(cards);
  if (runState.staleReasons?.length) root.appendChild(notice(doc, '재해석 필요', runState.staleReasons.join(' · '), 'warning'));
}

function renderResults(doc, root, _model, analysisCase, bridge, runState, api, ui = {}) {
  root.appendChild(sectionTitle(doc, 'Elastic Results Dashboard', '동일 Run ID와 immutable result hash를 표·3D·API·보고서에서 공유합니다.'));
  const dashboard = currentResultsDashboard(bridge, analysisCase, runState, null);
  if (!dashboard) {
    root.appendChild(notice(doc, '표시할 결과 없음', '선택한 탄성해석 케이스를 실행하세요. Stale 또는 실패 결과를 정상 0으로 표시하지 않습니다.', 'warning'));
    return;
  }
  const cards = element(doc, 'div', 'ss-p13-card-grid');
  cards.appendChild(summaryCard(doc, '현재성', dashboard.statusPresentation.current.text, dashboard.displayEligibility));
  cards.appendChild(summaryCard(doc, 'Run ID', dashboard.runId, dashboard.resultHash));
  cards.appendChild(summaryCard(doc, '지배값', formatted(dashboard.governing.maxAbsolute?.value), dashboard.governing.maxAbsolute?.path || '수치 결과 없음'));
  cards.appendChild(summaryCard(doc, '설계 전달', dashboard.designTransferAllowed ? '허용' : '차단', dashboard.qualification || '미판정'));
  root.appendChild(cards);
  const tabs = element(doc, 'div', 'ss-p13-load-tabs');
  for (const tabId of dashboard.tabs) {
    const button = element(doc, 'button', `ss-p13-load-tab${ui.resultTab === tabId ? ' active' : ''}`, resultTabLabel(tabId));
    button.type = 'button'; button.setAttribute('data-testid', `p13-result-tab-${tabId}`); button.addEventListener?.('click', () => api.setResultTab(tabId)); tabs.appendChild(button);
  }
  root.appendChild(tabs);
  const csv = api.exportResultCsv();
  root.appendChild(notice(doc, '결과 출처', `${dashboard.runId} · ${dashboard.resultHash} · CSV formula injection escaped=${csv?.formulaInjectionEscaped === true}`, dashboard.historical ? 'warning' : 'neutral'));
  const rows = resultRows(dashboard, ui.resultTab || 'overview');
  root.appendChild(dataTable(doc, ['객체/항목', '성분', '값', '출처'], rows.slice(0, 500).map((row) => [row.id, row.component, row.value, dashboard.runId])));
}

function renderReport(doc, root, model, analysisCase, bridge, runState, api, ui = {}) {
  root.appendChild(sectionTitle(doc, '검토·보고서 Hub', 'Immutable package, Revision Diff, 제한 MGT, Experimental Shell과 Release Gate를 분리 관리합니다.'));
  const tabs = element(doc, 'div', 'ss-p13-load-tabs');
  for (const [id, label] of [['package', '검토 패키지'], ['revision', 'Revision Diff'], ['mgt', 'MGT Import'], ['shell', 'Shell Lab'], ['release', 'Release Gate']]) {
    const button = element(doc, 'button', `ss-p13-load-tab${ui.reviewTab === id ? ' active' : ''}`, label);
    button.type = 'button'; button.setAttribute('data-testid', `p13-review-tab-${id}`); button.addEventListener?.('click', () => api.setReviewTab(id)); tabs.appendChild(button);
  }
  root.appendChild(tabs);
  const tab = ui.reviewTab || 'package';
  if (tab === 'package') {
    const run = currentPhase13DashboardRun(bridge, analysisCase);
    const packageSnapshot = buildPhase13ReviewPackageSnapshot({ model, run, current: runState.current, reportHash: stableHash(bridge.getDetailedReport?.()?.data || {}).slice(0, 24), limitations: ['frame-elastic-scope', 'shell-design-unavailable'] });
    const cards = element(doc, 'div', 'ss-p13-card-grid');
    cards.appendChild(summaryCard(doc, 'Package', packageSnapshot.status, packageSnapshot.packageHash));
    cards.appendChild(summaryCard(doc, 'Run', packageSnapshot.runId || '없음', packageSnapshot.runIntegrityHash || '-'));
    cards.appendChild(summaryCard(doc, 'Revision', packageSnapshot.revisionId || 'working', packageSnapshot.modelHash));
    cards.appendChild(summaryCard(doc, '설계 전달', packageSnapshot.designTransferAllowed ? '허용' : '차단', packageSnapshot.blockers.join(' · ') || 'Run qualification 기준'));
    root.appendChild(cards);
    root.appendChild(notice(doc, 'Immutable Snapshot', '현재 모델·Run·보고서 hash를 한 snapshot으로 고정합니다. Stale run은 새 package 발행을 차단합니다.', packageSnapshot.status === 'ready' ? 'positive' : 'warning'));
  } else if (tab === 'revision') {
    const diff = buildPhase13RevisionDiff(model, ui.mgtDraftRevision || model);
    const rows = Object.entries(diff.collections).map(([collection, value]) => [collection, value.added.length, value.removed.length, value.changed.length]);
    root.appendChild(dataTable(doc, ['컬렉션', '추가', '삭제', '변경'], rows));
    root.appendChild(notice(doc, 'Revision hash', `${diff.beforeHash} → ${diff.afterHash}`, ui.mgtDraftRevision ? 'neutral' : 'positive'));
  } else if (tab === 'mgt') {
    renderMgtImport(doc, root, model, api, ui);
  } else if (tab === 'shell') {
    renderShellLab(doc, root, api, ui.shellLab);
  } else {
    renderReleaseGate(doc, root, api.getMilestoneSnapshot());
  }
}

function renderMgtImport(doc, root, _model, api, ui) {
  root.appendChild(notice(doc, '제한된 자체 MGT Parser', 'Node·Frame/Truss·Support·Material·Section·LoadCase·기본 Nodal Load만 지원합니다. 외부 application·subprocess·macro는 실행하지 않습니다.'));
  const editor = element(doc, 'section', 'ss-p13-editor');
  const input = element(doc, 'textarea', 'ss-p13-textarea'); input.setAttribute('aria-label', 'MGT subset 입력'); input.setAttribute('data-testid', 'p13-mgt-text');
  const preview = element(doc, 'button', 'ss-p13-primary', 'MGT Draft 미리보기'); preview.type = 'button'; preview.setAttribute('data-testid', 'p13-mgt-preview'); preview.addEventListener?.('click', () => api.previewMgtImport(input.value));
  editor.appendChild(input); editor.appendChild(preview); root.appendChild(editor);
  if (!ui.mgtCandidate) return;
  const parsed = ui.mgtCandidate.parsed;
  const cards = element(doc, 'div', 'ss-p13-card-grid');
  cards.appendChild(summaryCard(doc, '상태', parsed.status, parsed.importHash));
  cards.appendChild(summaryCard(doc, '매핑', String(parsed.audit.filter((row) => row.status === 'mapped').length), `${parsed.unsupported.length}개 unsupported`));
  cards.appendChild(summaryCard(doc, '보안', parsed.externalApplicationExecuted ? '실행됨' : '외부실행 0', `macro=${parsed.macroExecuted}`));
  cards.appendChild(summaryCard(doc, '현재 프로젝트', '변경 없음', ui.mgtCandidate.sourceModelHash)); root.appendChild(cards);
  if (parsed.blockers.length) root.appendChild(notice(doc, 'Import 차단', parsed.blockers.map((row) => row.code).join(' · '), 'warning'));
  const draft = element(doc, 'section', 'ss-p13-editor');
  const revisionId = inputControl(doc, 'p13MgtRevisionId', 'text', '새 Draft Revision ID', 'MGT-DRAFT-1');
  const commit = element(doc, 'button', 'ss-p13-secondary', '새 Draft Revision 생성'); commit.type = 'button'; commit.disabled = !ui.mgtCandidate.commitAllowed; commit.setAttribute('data-testid', 'p13-mgt-commit-draft'); commit.addEventListener?.('click', () => api.commitMgtDraft(revisionId.value));
  draft.appendChild(revisionId); draft.appendChild(commit); root.appendChild(draft);
  if (ui.mgtDraftRevision) root.appendChild(notice(doc, 'Draft 생성 완료', `${ui.mgtDraftRevision.meta.revisionId} · 현재 프로젝트는 변경하지 않았습니다.`, 'positive'));
}

function renderShellLab(doc, root, api, shell) {
  root.appendChild(notice(doc, 'Experimental Shell Lab', shell.reviewWatermark, 'warning'));
  const cards = element(doc, 'div', 'ss-p13-card-grid');
  cards.appendChild(summaryCard(doc, 'Capability', shell.capabilityMode, shell.status));
  cards.appendChild(summaryCard(doc, 'Mesh QA', shell.meshQa.status, `${shell.meshQa.issues.length}개 blocker`));
  cards.appendChild(summaryCard(doc, 'Convergence', shell.converged ? 'PASS' : 'REVIEW', `${shell.rows.length}개 mesh level`));
  cards.appendChild(summaryCard(doc, 'Shell 설계전이', '차단', 'UI·API·Agent·Report 공통 false')); root.appendChild(cards);
  const editor = element(doc, 'section', 'ss-p13-editor');
  editor.appendChild(element(doc, 'p', 'ss-p13-help', '한 줄에 mesh size, monitored quantity, element count를 입력합니다. 최소 3개 mesh level이 필요합니다.'));
  const input = element(doc, 'textarea', 'ss-p13-textarea compact'); input.setAttribute('aria-label', 'Shell convergence 입력'); input.setAttribute('data-testid', 'p13-shell-text'); input.value = shell.rows.map((row) => `${row.meshSize},${row.quantity},${row.elementCount}`).join('\n');
  const evaluate = element(doc, 'button', 'ss-p13-primary', 'Mesh convergence 검토'); evaluate.type = 'button'; evaluate.setAttribute('data-testid', 'p13-shell-evaluate'); evaluate.addEventListener?.('click', () => api.evaluateShellLab(input.value, { tolerance: 0.02, phase10EvidenceStatus: 'PASS', meshQa: { minDetJ: 1, invertedCount: 0, degenerateCount: 0, maxWarp: 0, maxAspect: 1 } }));
  editor.appendChild(input); editor.appendChild(evaluate); root.appendChild(editor);
  root.appendChild(dataTable(doc, ['Mesh size', 'Quantity', 'Δ', 'Mesh hash'], shell.rows.map((row, index) => [row.meshSize, row.quantity, index ? shell.deltas[index - 1] : '-', row.meshHash])));
}

function renderReleaseGate(doc, root, snapshot) {
  const gate = snapshot.releaseGate;
  const cards = element(doc, 'div', 'ss-p13-card-grid');
  cards.appendChild(summaryCard(doc, 'Workflow Release', gate.workflowReleaseQualified ? 'PASS' : 'BLOCKED', gate.claimProfile));
  cards.appendChild(summaryCard(doc, 'Office Pilot', gate.frameElasticOfficePilotAllowed ? '허용' : '차단', '외부 실무자 evidence 필요'));
  cards.appendChild(summaryCard(doc, '최종 설계전이', gate.finalDesignTransferAllowed ? '허용' : '차단', '독립 교차검증 필요'));
  cards.appendChild(summaryCard(doc, 'Shell 설계전이', '차단', '항상 false')); root.appendChild(cards);
  root.appendChild(dataTable(doc, ['Gate', '상태', '판정 내용'], gate.checks.map((row) => [row.id, row.status, row.label])));
  root.appendChild(notice(doc, '현재 Release 판정', gate.blockers.join(' · ') || '모든 자동 Gate 통과', gate.workflowReleaseQualified ? 'positive' : 'warning'));
  if (gate.externalInputsRequired.length) root.appendChild(notice(doc, 'Owner 입력 필요', gate.externalInputsRequired.join(' · '), 'warning'));
}

function renderInspector(doc, root, model, analysisCase, bridge, runState, modelCheckUi = {}) {
  clear(root);
  root.appendChild(sectionTitle(doc, 'Inspector', '선택 객체와 실행 출처'));
  const selectedIssue = modelCheckUi.modelCheck?.issues?.find((item) => item.issueId === modelCheckUi.selectedIssueId) || null;
  if (selectedIssue) {
    root.appendChild(detail(doc, 'Issue ID', selectedIssue.issueId));
    root.appendChild(detail(doc, '코드', selectedIssue.code));
    root.appendChild(detail(doc, '심각도', selectedIssue.severity));
    root.appendChild(detail(doc, '분류', selectedIssue.category));
    root.appendChild(detail(doc, '객체', selectedIssue.objectRefs.map((item) => `${item.type}:${item.id}`).join(', ') || '-'));
    root.appendChild(detail(doc, '규칙', selectedIssue.ruleRef));
    root.appendChild(detail(doc, '수정 방식', selectedIssue.fixability));
    root.appendChild(detail(doc, 'Waiver', selectedIssue.waiverStatus));
    root.appendChild(notice(doc, '조치 안내', selectedIssue.message, selectedIssue.severity === 'blocker' ? 'warning' : 'neutral'));
    return;
  }
  if (!analysisCase) {
    root.appendChild(element(doc, 'p', 'ss-p13-empty', '선택된 해석 케이스가 없습니다.'));
    return;
  }
  const record = bridge.getAnalysisRunRecord?.({ caseId: analysisCase.id }) || null;
  root.appendChild(detail(doc, 'Case ID', analysisCase.id));
  root.appendChild(detail(doc, '종류', analysisCase.kind));
  root.appendChild(detail(doc, '상태', statusLabel(runState.execution)));
  root.appendChild(detail(doc, 'Run ID', runState.runId || '-'));
  root.appendChild(detail(doc, 'Qualification', record?.qualification || '-'));
  root.appendChild(detail(doc, 'Model Hash', record?.modelHash || phase7ModelHash(model)));
  root.appendChild(detail(doc, 'Engine', record?.engine?.id || 's-structures-inhouse'));
  root.appendChild(detail(doc, 'OpenSees', '사용 안 함'));
  const foundation = buildFoundationInspector(model, bridge.getLastResult?.() || null);
  const foundationPanel = element(doc, 'section', 'ss-p13-foundation-inspector');
  foundationPanel.setAttribute('data-testid', 'p14-foundation-inspector');
  foundationPanel.appendChild(element(doc, 'h4', '', '분포 탄성지반'));
  foundationPanel.appendChild(detail(doc, '기초 속성', foundation.propertyCount));
  foundationPanel.appendChild(detail(doc, '배정 부재', foundation.assignedMemberCount));
  if (foundation.members.length) {
    foundationPanel.appendChild(dataTable(doc, ['부재', '속성', 'k-y', 'k-z', '결과'], foundation.members.slice(0, 30).map((row) => [
      row.memberId,
      row.propertyId,
      row.lineStiffness.localY,
      row.lineStiffness.localZ,
      row.response.status,
    ])));
    foundationPanel.appendChild(notice(doc, 'Local-axis glyph', `${foundation.glyphs.length}개 부재의 local-y/local-z 방향을 결과 오버레이 계약으로 제공합니다.`, 'neutral'));
  }
  root.appendChild(foundationPanel);
}

function renderDrawer(doc, root, bridge, cases, runState) {
  clear(root);
  const heading = element(doc, 'div', 'ss-p13-drawer-heading');
  heading.appendChild(element(doc, 'strong', '', 'Analysis Drawer'));
  heading.appendChild(element(doc, 'span', '', `전체 ${cases.length} · Current ${cases.filter((item) => deriveRunState(bridge, bridge.getCurrentModel?.() || {}, item, false).current).length}`));
  root.appendChild(heading);
  const rows = element(doc, 'div', 'ss-p13-run-list');
  const store = bridge.getAnalysisRunStore?.() || { attempts: {} };
  const attempts = Object.values(store.attempts || {}).flat().slice(-8).reverse();
  if (!attempts.length) rows.appendChild(element(doc, 'span', 'ss-p13-empty', '아직 실행기록이 없습니다.'));
  for (const record of attempts) {
    const row = element(doc, 'div', 'ss-p13-run-row');
    row.appendChild(element(doc, 'strong', '', record.caseId));
    row.appendChild(element(doc, 'span', '', record.runStatus));
    row.appendChild(element(doc, 'span', '', record.qualification || '-'));
    row.appendChild(element(doc, 'small', '', record.finishedAt || record.id));
    rows.appendChild(row);
  }
  root.appendChild(rows);
  root.setAttribute('data-current-run-id', runState.runId || '');
}

function renderRepairPreview(doc, preview, api) {
  const node = element(doc, 'section', 'ss-p13-repair-preview');
  node.setAttribute('data-testid', 'p13-repair-preview');
  const title = element(doc, 'div', 'ss-p13-repair-title');
  title.appendChild(element(doc, 'strong', '', '수정 미리보기'));
  title.appendChild(element(doc, 'span', '', `${preview.changes.length}개 변경 · ${preview.beforeModelHash} → ${preview.afterModelHash}`));
  node.appendChild(title);
  const summary = element(doc, 'div', 'ss-p13-repair-summary');
  summary.appendChild(metricRow(doc, '해결 예상', preview.issueDelta?.resolved?.length || 0));
  summary.appendChild(metricRow(doc, '잔여 이슈', preview.issueDelta?.remaining?.length || 0));
  summary.appendChild(metricRow(doc, '추가 이슈', preview.issueDelta?.added?.length || 0));
  node.appendChild(summary);
  const changes = element(doc, 'div', 'ss-p13-repair-changes');
  for (const change of preview.changes.slice(0, 12)) {
    changes.appendChild(element(doc, 'code', '', `${change.op} ${change.collection}:${change.id}`));
  }
  if (preview.changes.length > 12) changes.appendChild(element(doc, 'small', '', `외 ${preview.changes.length - 12}개`));
  node.appendChild(changes);
  const actions = element(doc, 'div', 'ss-p13-preview-actions');
  const apply = element(doc, 'button', 'ss-p13-primary', '검토한 수정 적용');
  apply.type = 'button';
  apply.disabled = !preview.ok || preview.changes.length === 0;
  apply.setAttribute('data-testid', 'p13-repair-apply');
  apply.addEventListener?.('click', () => api.applyIssueRepair());
  const cancel = element(doc, 'button', 'ss-p13-secondary', '취소');
  cancel.type = 'button';
  cancel.setAttribute('data-testid', 'p13-repair-cancel');
  cancel.addEventListener?.('click', () => api.clearRepairPreview());
  actions.appendChild(apply);
  actions.appendChild(cancel);
  node.appendChild(actions);
  return node;
}

function renderLoadPreview(doc, holder, api) {
  const preview = holder.value || {};
  const node = element(doc, 'section', 'ss-p13-repair-preview');
  node.setAttribute('data-testid', 'p13-load-preview');
  const title = element(doc, 'div', 'ss-p13-repair-title');
  title.appendChild(element(doc, 'strong', '', holder.kind === 'slab-panels' ? '슬래브 하중 전달 미리보기' : '수동 하중조합 미리보기'));
  title.appendChild(element(doc, 'span', '', `${preview.status || 'review'} · ${preview.changes?.length || 0}개 변경`));
  node.appendChild(title);
  if (holder.kind === 'slab-panels') {
    const summary = element(doc, 'div', 'ss-p13-repair-summary');
    summary.appendChild(metricRow(doc, '평형 PASS', `${preview.equilibrium?.filter((item) => item.status === 'PASS').length || 0}/${preview.equilibrium?.length || 0}`));
    summary.appendChild(metricRow(doc, '사용자 충돌', preview.conflicts?.length || 0));
    summary.appendChild(metricRow(doc, '중복 Key', preview.duplicateKeys?.length || 0));
    node.appendChild(summary);
  } else {
    const summary = element(doc, 'div', 'ss-p13-repair-summary');
    summary.appendChild(metricRow(doc, '수동 조합', preview.combinations?.length || 0));
    summary.appendChild(metricRow(doc, '보존 생성 조합', preview.locked?.length || 0));
    summary.appendChild(metricRow(doc, '오류', preview.errors?.length || 0));
    node.appendChild(summary);
  }
  if (preview.errors?.length) node.appendChild(element(doc, 'code', 'ss-p13-preview-error', preview.errors.map((item) => item.code).join(' · ')));
  const actions = element(doc, 'div', 'ss-p13-preview-actions');
  const apply = element(doc, 'button', 'ss-p13-primary', '검토한 하중 변경 적용');
  apply.type = 'button';
  apply.disabled = holder.kind === 'manual-combinations' ? preview.status !== 'ready' : preview.status === 'blocked';
  apply.setAttribute('data-testid', 'p13-load-apply');
  apply.addEventListener?.('click', () => api.applyLoadPreview());
  const cancel = element(doc, 'button', 'ss-p13-secondary', '취소');
  cancel.type = 'button';
  cancel.setAttribute('data-testid', 'p13-load-cancel');
  cancel.addEventListener?.('click', () => api.clearLoadPreview());
  actions.appendChild(apply);
  actions.appendChild(cancel);
  node.appendChild(actions);
  return node;
}

function renderManualCombinationEditor(doc, workspace, loadPreview, api) {
  const node = element(doc, 'section', 'ss-p13-editor');
  node.appendChild(element(doc, 'strong', '', '수동 조합 편집'));
  node.appendChild(element(doc, 'p', 'ss-p13-help', '한 줄에 ID, 이름, 그룹, CASE=계수 순서로 입력합니다. 생성 조합은 잠겨 있으며 자동 보존됩니다.'));
  const input = element(doc, 'textarea', 'ss-p13-textarea');
  input.id = 'p13ManualCombinationText';
  input.setAttribute('id', 'p13ManualCombinationText');
  input.setAttribute('aria-label', '수동 하중조합 입력');
  input.setAttribute('data-testid', 'p13-manual-combination-text');
  input.value = loadPreview?.kind === 'manual-combinations'
    ? loadPreview.sourceText || ''
    : workspace.combinations.filter((row) => row.ownership === 'manual').map((row) => [
      row.id, row.name || row.id, row.group || row.type || 'user',
      ...Object.entries(row.factors || {}).map(([caseId, factor]) => `${caseId}=${factor}`),
    ].join(',')).join('\n');
  const preview = element(doc, 'button', 'ss-p13-primary', '수동 조합 미리보기');
  preview.type = 'button';
  preview.setAttribute('data-testid', 'p13-manual-combination-preview');
  preview.addEventListener?.('click', () => api.previewManualCombinations(input.value));
  node.appendChild(input);
  node.appendChild(preview);
  return node;
}

function renderLoadPasteReview(doc, review, api) {
  const node = element(doc, 'section', 'ss-p13-editor');
  node.appendChild(element(doc, 'strong', '', 'CSV/클립보드 안전 검토'));
  node.appendChild(element(doc, 'p', 'ss-p13-help', '열 순서: ID, 형식, 대상, 값, 방향, 케이스. 수식·매크로는 실행하지 않습니다.'));
  const input = element(doc, 'textarea', 'ss-p13-textarea compact');
  input.id = 'p13LoadPasteText';
  input.setAttribute('id', 'p13LoadPasteText');
  input.setAttribute('aria-label', '하중 붙여넣기 검토 입력');
  input.setAttribute('data-testid', 'p13-load-paste-text');
  const button = element(doc, 'button', 'ss-p13-secondary', '붙여넣기 검토');
  button.type = 'button';
  button.setAttribute('data-testid', 'p13-load-paste-review');
  button.addEventListener?.('click', () => api.reviewLoadPaste(input.value));
  node.appendChild(input);
  node.appendChild(button);
  if (review) node.appendChild(element(doc, 'small', '', `행 ${review.rows.length} · 오류 ${review.errors.length} · formulasExecuted=false · macrosExecuted=false`));
  return node;
}

function parseManualCombinationText(text) {
  const errors = [];
  const combinations = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    if (/^[=+@]/.test(line)) errors.push({ code: 'FORMULA_OR_MACRO_FORBIDDEN', index });
    const cells = line.split(/\t|,/).map((cell) => cell.trim());
    const [id, name, group, ...factorCells] = cells;
    if (!id) errors.push({ code: 'COMBINATION_ID_REQUIRED', index });
    const factors = {};
    for (const cell of factorCells) {
      const match = /^([^=]+)=(-?(?:\d+\.?\d*|\.\d+))$/.exec(cell);
      if (!match) {
        errors.push({ code: 'COMBINATION_FACTOR_SYNTAX', index, value: cell });
        continue;
      }
      factors[match[1].trim()] = Number(match[2]);
    }
    if (!Object.keys(factors).length) errors.push({ code: 'COMBINATION_EMPTY', index, id });
    return { id, name: name || id, group: group || 'user', type: 'linear', factors };
  });
  return { ok: errors.length === 0, combinations, errors };
}

function dataTable(doc, headers, rows) {
  const table = element(doc, 'div', 'ss-p13-table ss-p13-data-table');
  table.style.setProperty?.('--p13-columns', String(headers.length));
  const header = element(doc, 'div', 'ss-p13-data-row is-header');
  header.style.gridTemplateColumns = `repeat(${headers.length},minmax(0,1fr))`;
  for (const value of headers) header.appendChild(element(doc, 'strong', '', value));
  table.appendChild(header);
  if (!rows.length) table.appendChild(element(doc, 'p', 'ss-p13-empty ss-p13-table-empty', '표시할 항목이 없습니다.'));
  for (const values of rows) {
    const row = element(doc, 'div', 'ss-p13-data-row');
    row.style.gridTemplateColumns = `repeat(${headers.length},minmax(0,1fr))`;
    for (const value of values) row.appendChild(element(doc, 'span', '', String(value ?? '-')));
    table.appendChild(row);
  }
  return table;
}

function loadTabLabel(id) {
  return ({
    'load-cases': '하중케이스', loads: '하중표', 'slab-panels': '슬래브 패널',
    'mass-sources': '질량원', 'manual-combinations': '수동 조합', audit: 'Audit',
  })[id] || id;
}

function formatFactors(factors = {}) {
  return Object.entries(factors).map(([id, value]) => `${id}×${value}`).join(' + ') || '-';
}

function inputControl(doc, id, type, label, value = '') {
  const input = element(doc, 'input', 'ss-p13-input');
  input.id = id;
  input.setAttribute('id', id);
  input.type = type;
  input.value = String(value ?? '');
  input.setAttribute('aria-label', label);
  input.setAttribute('placeholder', label);
  return input;
}

function parseEditorValue(value) {
  const text = String(value ?? '').trim();
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) return Number(text);
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null') return null;
  if (/^[{[]/.test(text)) {
    try { return JSON.parse(text); } catch { return text; }
  }
  return text;
}

function parseStoryEditorText(text) {
  const errors = [];
  const rows = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const [id, name, elevationText] = line.split(/\t|,/).map((cell) => cell.trim());
    const elevation = Number(elevationText);
    if (!id) errors.push({ code: 'STORY_ID_REQUIRED', index });
    if (!Number.isFinite(elevation)) errors.push({ code: 'STORY_ELEVATION_INVALID', index });
    return { id, name: name || id, elevation };
  });
  return { ok: errors.length === 0 && rows.length > 0, rows, errors: rows.length ? errors : [{ code: 'STORY_ROWS_REQUIRED' }] };
}

function parseShellLabText(text) {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [meshSize, quantity, elementCount] = line.split(/\t|,/).map(Number);
    return { meshSize, quantity, elementCount };
  });
}

function currentPhase13DashboardRun(bridge, analysisCase) {
  if (!analysisCase) return null;
  const result = bridge.getAnalysisCaseResult?.(analysisCase.id) || null;
  if (!result) return null;
  const record = bridge.getAnalysisRunRecord?.({ caseId: analysisCase.id }) || null;
  return {
    id: result.runId || result.runRecordId || record?.id || `${analysisCase.id}:current`,
    caseId: analysisCase.id,
    status: 'completed',
    qualification: result.qualification || record?.qualification || 'candidate',
    designTransferAllowed: result.designTransferAllowed === true || record?.designTransferAllowed === true,
    integrityHash: record?.recordHash || record?.integrityHash || stableHash({ analysisCase, result }).slice(0, 24),
    result: result.payload || result,
  };
}

function currentResultsDashboard(bridge, analysisCase, runState, selection) {
  const run = currentPhase13DashboardRun(bridge, analysisCase);
  if (!run) return null;
  try { return buildPhase13ElasticDashboard({ run, current: runState.current, selection }); } catch { return null; }
}

function resultRows(dashboard, tab) {
  const sourceKey = tab === 'member-forces' ? 'memberForces' : tab === 'time-history' ? 'timeHistory' : tab === 'p-delta' ? 'pDelta' : tab;
  const value = tab === 'overview' ? dashboard.summary : dashboard[sourceKey];
  const out = [];
  const visit = (item, path = '') => {
    if (item == null || typeof item !== 'object') {
      out.push({ id: path.split('.')[0] || '-', component: path || 'value', value: item ?? '-' });
      return;
    }
    if (Array.isArray(item)) {
      item.forEach((child, index) => visit(child, `${path}[${index}]`));
      return;
    }
    const id = item.id || item.nodeId || item.memberId || item.storyId || null;
    for (const [key, child] of Object.entries(item)) {
      if (key === 'id' || key.endsWith('Id')) continue;
      if (child && typeof child === 'object') visit(child, path ? `${path}.${key}` : key);
      else out.push({ id: id || path || '-', component: key, value: child ?? '-' });
    }
  };
  visit(value, tab);
  return out.length ? out : [{ id: '-', component: '상태', value: '표시할 데이터 없음' }];
}

function resultTabLabel(tab) {
  return ({ overview: '개요', deformation: '변형', reactions: '반력', 'member-forces': '부재력', story: '층', modal: '모달', rsa: 'RSA', 'p-delta': 'P-Delta', buckling: '좌굴', 'time-history': '선형 THA' })[tab] || tab;
}

function buildMilestoneSnapshot(input = {}) {
  const shellContainment = buildPhase13ShellContainmentAudit({
    ui: { shellDesignTransferAllowed: false },
    api: { shellDesignTransferAllowed: false },
    agent: { shellDesignTransferAllowed: false },
    report: { shellDesignTransferAllowed: false },
    calculationPackage: { shellDesignTransferAllowed: false },
    frameDesignLeakageAllowed: false,
    gpuVerifiedRouteAllowed: false,
  });
  const releaseGate = buildPhase13ReleaseGate({
    completedMilestones: Array.from({ length: 9 }, (_, index) => `P13-M${index}`),
    qualificationCompleteMilestones: ['P13-M0'],
    evidenceHashesComplete: false,
    reviewHashesComplete: false,
    fullRegressionPassed: false,
    regressionTimeoutCount: 0,
    flakyCount: 0,
    unapprovedSkipCount: 0,
    coreE2ESourceRunsPassed: 0,
    coreE2EReleaseRunsPassed: 0,
    officePilotPassed: false,
    runStatusValueReportParity: false,
    openCriticalHighCount: 0,
    performancePassed: false,
    accessibilityPassed: false,
    securityPassed: false,
    cleanInstallPassed: false,
    restartPassed: false,
    backupRestorePassed: false,
    rollbackNMinus1Passed: false,
    openSeesRuntimeUsed: false,
    externalSolverRuntimeDependency: false,
    externalSolverProcessCount: 0,
    unapprovedNetworkRequestCount: 0,
    shellContainmentPassed: shellContainment.status === 'PASS',
    shellDesignTransferAllowed: false,
    releaseManifestHashVerified: false,
    sourceBuildEvidenceArtifactHashesVerified: false,
    engineeringCrossValidationQualified: false,
  });
  const model = input.model || {};
  const parityCase = (model.analysisCases || []).find((row) => ['static', 'modal', 'responseSpectrum', 'buckling', 'linearTha'].includes(row.kind)) || null;
  const parityResult = parityCase ? input.bridge?.getAnalysisCaseResult?.(parityCase.id) : null;
  const approvalState = input.kdsApproval
    ? evaluatePhase13KdsApproval(input.kdsProcedure, input.kdsApproval, { projectId: phase13ProjectId(model), revisionId: model.meta?.revisionId || 'working' })
    : { status: 'unapproved', blockers: ['KDS_PROJECT_APPROVAL_REQUIRED'], designTransferAllowed: false };
  return {
    version: 'p13-m9-milestone-snapshot-v1',
    modelHash: phase7ModelHash(model),
    milestones: {
      M3: { status: 'implementation-complete', loadWorkspace: buildPhase13LoadWorkspace(model, { result: parityResult }) },
      M4: { status: input.kdsSource?.status === 'approved' ? 'source-ready' : 'source-blocked', source: input.kdsSource, procedure: input.kdsProcedure, approval: input.kdsApproval, approvalState },
      M5: { status: 'implementation-complete', diaphragmValidation: validatePhase13Diaphragms(model) },
      M6: { status: 'implementation-complete' },
      M7: { status: 'implementation-complete', mgtCandidate: input.mgtCandidate, draftRevisionId: input.mgtDraftRevision?.meta?.revisionId || null },
      M8: { status: 'implementation-complete', shellLab: input.shellLab, containment: shellContainment },
      M9: { status: 'gate-implemented-release-blocked' },
    },
    releaseGate,
    invariants: { openSeesRuntimeUsed: false, externalSolverRuntimeDependency: false, nonlinearInScope: false, shellDesignTransferAllowed: false },
  };
}

function currentModelCheck(target, model) {
  return buildPhase13ModelCheck(model, { waivers: readIssueWaivers(target, model) });
}

function readIssueWaivers(target, model) {
  try {
    const rows = JSON.parse(target?.localStorage?.getItem?.(ISSUE_WAIVER_STORAGE_KEY) || '[]');
    const projectId = phase13ProjectId(model);
    return Array.isArray(rows) ? rows.filter((item) => item?.projectId === projectId) : [];
  } catch (_error) {
    return [];
  }
}

function writeIssueWaivers(target, model, waiver) {
  let rows = [];
  try {
    const parsed = JSON.parse(target?.localStorage?.getItem?.(ISSUE_WAIVER_STORAGE_KEY) || '[]');
    if (Array.isArray(parsed)) rows = parsed;
  } catch (_error) {
    rows = [];
  }
  const projectId = phase13ProjectId(model);
  rows = rows.filter((item) => !(item?.projectId === projectId && item?.issueId === waiver.issueId));
  rows.push(waiver);
  target?.localStorage?.setItem?.(ISSUE_WAIVER_STORAGE_KEY, JSON.stringify(rows.slice(-500)));
  return waiver;
}

function phase13ProjectId(model) {
  return String(model?.meta?.id || model?.meta?.projectId || model?.id || 'LOCAL-PROJECT');
}

function deriveRunState(bridge, model, analysisCase, busy) {
  if (busy) return { execution: 'running', current: false, stale: false, runId: null, qualification: 'pending', designTransferAllowed: false, staleReasons: [] };
  if (!analysisCase) return { execution: 'not-run', current: false, stale: false, runId: null, qualification: null, designTransferAllowed: false, staleReasons: [] };
  const latest = bridge.getAnalysisRunRecord?.({ caseId: analysisCase.id, latestAttempt: true }) || null;
  const successful = bridge.getAnalysisRunRecord?.({ caseId: analysisCase.id }) || null;
  if (!successful) {
    const execution = latest?.runStatus === 'failed' ? 'failed' : analysisCase.status === 'running' ? 'running' : 'not-run';
    return { execution, current: false, stale: false, runId: latest?.id || null, qualification: latest?.qualification || null, designTransferAllowed: false, staleReasons: latest?.failure?.code ? [latest.failure.code] : [] };
  }
  const staleReasons = [];
  if (successful.modelHash !== phase7ModelHash(model)) staleReasons.push('모델이 실행 이후 변경됨');
  if (analysisCase.status === 'stale') staleReasons.push('케이스가 재해석 필요 상태임');
  const stale = staleReasons.length > 0;
  return {
    execution: stale ? 'stale' : 'current',
    current: !stale,
    stale,
    runId: successful.id,
    qualification: successful.qualification,
    designTransferAllowed: !stale && successful.designTransferAllowed === true,
    staleReasons,
  };
}

function elasticCases(bridge) {
  return (bridge.getAnalysisCases?.() || []).filter((item) => ELASTIC_KINDS.has(item.kind));
}

function selectedCase(bridge, selectedCaseId) {
  return elasticCases(bridge).find((item) => item.id === selectedCaseId) || elasticCases(bridge)[0] || null;
}

function renderStatus(node, runState) {
  node.textContent = statusLabel(runState.execution);
  node.className = `ss-p13-status is-${normalizeStatus(runState.execution)}`;
  node.setAttribute('title', runState.staleReasons?.join(' · ') || '');
}

function statusLabel(status) {
  const labels = { current: 'Current', stale: 'Stale · 재해석 필요', running: '실행 중', failed: '실패', 'not-run': '미실행', ok: '완료', review: '검토 필요' };
  return labels[String(status || '').toLowerCase()] || String(status || '미실행');
}

function normalizeStatus(status) {
  return String(status || 'not-run').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
}

function sectionTitle(doc, title, subtitle) {
  const node = element(doc, 'div', 'ss-p13-section-title');
  node.appendChild(element(doc, 'h2', '', title));
  if (subtitle) node.appendChild(element(doc, 'p', '', subtitle));
  return node;
}

function summaryCard(doc, label, value, detailText) {
  const node = element(doc, 'article', 'ss-p13-card');
  node.appendChild(element(doc, 'span', '', label));
  node.appendChild(element(doc, 'strong', '', value));
  node.appendChild(element(doc, 'small', '', detailText));
  return node;
}

function notice(doc, title, text, tone = 'neutral') {
  const node = element(doc, 'div', `ss-p13-notice is-${tone}`);
  node.appendChild(element(doc, 'strong', '', title));
  node.appendChild(element(doc, 'p', '', text));
  return node;
}

function metricRow(doc, label, value) {
  const node = element(doc, 'div', 'ss-p13-metric-row');
  node.appendChild(element(doc, 'span', '', label));
  node.appendChild(element(doc, 'strong', '', String(value)));
  return node;
}

function detail(doc, label, value) {
  const node = element(doc, 'div', 'ss-p13-detail');
  node.appendChild(element(doc, 'span', '', label));
  node.appendChild(element(doc, 'code', '', String(value ?? '-')));
  return node;
}

function tableRow(doc, values, header = false) {
  const row = element(doc, 'div', `ss-p13-table-row${header ? ' is-header' : ''}`);
  for (const value of values) row.appendChild(element(doc, header ? 'strong' : 'span', '', String(value ?? '-')));
  return row;
}

function selectControl(doc, id, label, options, value) {
  const select = element(doc, 'select', 'ss-p13-select');
  select.id = id;
  select.setAttribute('id', id);
  select.setAttribute('aria-label', label);
  for (const [optionValue, optionLabel] of options) {
    const option = element(doc, 'option', '', optionLabel);
    option.value = optionValue;
    select.appendChild(option);
  }
  select.value = value;
  return select;
}

function formatted(value, unit) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(3)} ${unit}` : '-';
}

function element(doc, tag, className = '', text = '') {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function cloneValue(value) {
  return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
}

function clear(node) {
  while (node.children?.length) node.removeChild(node.children[0]);
}

function injectStyle(doc) {
  if (doc.getElementById?.('ssPhase13WorkspaceStyle')) return;
  const style = doc.createElement('style');
  style.id = 'ssPhase13WorkspaceStyle';
  style.setAttribute('id', 'ssPhase13WorkspaceStyle');
  style.textContent = `
.ss-p13-launch{height:32px;border:1px solid rgba(255,255,255,.24);border-radius:7px;background:#0b6da8;color:#fff;padding:0 12px;font-weight:700;white-space:nowrap}
.ss-p13-launch:hover{background:#1283c7}.ss-p13-workspace{position:fixed;inset:0;z-index:9000;background:#f4f7fa;color:#172536;display:grid;grid-template-rows:auto minmax(0,1fr) 190px;font-family:Inter,Pretendard,"Noto Sans KR",sans-serif}
.ss-p13-workspace[hidden]{display:none}.ss-p13-header{min-height:84px;background:#102b46;color:#fff;display:grid;grid-template-columns:minmax(210px,280px) minmax(420px,1fr) auto;align-items:center;gap:14px;padding:10px 16px;border-bottom:3px solid #d9a72e}
.ss-p13-title{display:flex;flex-direction:column;gap:3px}.ss-p13-title strong{font-size:17px}.ss-p13-title span{font-size:11px;color:#b9cee0}
.ss-p13-nav{display:flex;align-items:center;justify-content:center;gap:4px;min-width:0}.ss-p13-nav-button{height:36px;border:1px solid rgba(255,255,255,.18);border-radius:7px;background:rgba(255,255,255,.06);color:#dce9f3;padding:0 11px;font-weight:650;white-space:nowrap}.ss-p13-nav-button.active{background:#d9a72e;color:#14283b;border-color:#d9a72e}
.ss-p13-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px}.ss-p13-actions button{height:34px;border-radius:7px;padding:0 11px;font-weight:700}.ss-p13-run,.ss-p13-run-all{border:1px solid #3b8fc3;background:#0875b8;color:#fff}.ss-p13-run-all{background:#fff;color:#17405f}.ss-p13-close{border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff}.ss-p13-actions button:disabled{opacity:.48}
.ss-p13-status{display:inline-flex;align-items:center;min-height:28px;border-radius:999px;padding:0 10px;background:#50657a;color:#fff;font-size:12px;font-weight:800;white-space:nowrap}.ss-p13-status.is-current,.ss-p13-status.is-ok{background:#16734a}.ss-p13-status.is-stale{background:#a36300}.ss-p13-status.is-running{background:#0b6da8}.ss-p13-status.is-failed{background:#a82d32}
.ss-p13-body{display:grid;grid-template-columns:260px minmax(0,1fr) 320px;min-width:0;min-height:0}.ss-p13-tree,.ss-p13-inspector,.ss-p13-center{min-width:0;overflow:auto;padding:16px}.ss-p13-tree{background:#fff;border-right:1px solid #dbe3ea}.ss-p13-inspector{background:#fff;border-left:1px solid #dbe3ea}.ss-p13-center{background:#f4f7fa;padding:22px}
.ss-p13-section-title{margin-bottom:15px}.ss-p13-section-title h2{margin:0;color:#153a5a;font-size:18px}.ss-p13-section-title p{margin:4px 0 0;color:#637587;font-size:12px;line-height:1.4}.ss-p13-tree .ss-p13-section-title h2,.ss-p13-inspector .ss-p13-section-title h2{font-size:15px}
.ss-p13-tree-group{margin:0 0 18px}.ss-p13-tree-group h4{margin:0 0 8px;color:#607487;font-size:11px;text-transform:uppercase;letter-spacing:.04em}.ss-p13-metric-row{display:flex;justify-content:space-between;padding:6px 2px;border-bottom:1px solid #edf1f4;font-size:12px}.ss-p13-case{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid transparent;border-radius:7px;background:transparent;padding:8px;text-align:left;color:#26394b}.ss-p13-case:hover{background:#f0f5f8}.ss-p13-case.active{border-color:#78add0;background:#e9f4fb}.ss-p13-case small{font-size:10px;border-radius:999px;background:#e3e9ee;padding:3px 6px;white-space:nowrap}.ss-p13-case-status.is-ok{background:#dff2e8;color:#156642}.ss-p13-case-status.is-stale{background:#fff0d1;color:#8d5700}
.ss-p13-card-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.ss-p13-card-grid.compact{grid-template-columns:repeat(2,minmax(0,1fr))}.ss-p13-card{min-height:104px;border:1px solid #dbe4eb;border-radius:10px;background:#fff;padding:14px;box-shadow:0 2px 8px rgba(23,48,70,.05);display:flex;flex-direction:column;gap:7px}.ss-p13-card>span{font-size:11px;color:#6b7e8f}.ss-p13-card>strong{font-size:17px;color:#153a5a;overflow:hidden;text-overflow:ellipsis}.ss-p13-card>small{margin-top:auto;color:#7d8d9a}
.ss-p13-notice{border-left:4px solid #3e88b7;border-radius:7px;background:#eaf4fa;padding:12px 14px;margin:12px 0}.ss-p13-notice.is-warning{border-color:#c27a00;background:#fff4dd}.ss-p13-notice.is-positive{border-color:#23815b;background:#e8f6ef}.ss-p13-notice strong{font-size:13px}.ss-p13-notice p{margin:5px 0 0;font-size:12px;line-height:1.5;color:#485d6f}
.ss-p13-issue-toolbar{display:grid;grid-template-columns:150px minmax(180px,1fr) auto auto auto;gap:7px;margin:0 0 12px}.ss-p13-input,.ss-p13-select,.ss-p13-mini-input{min-height:34px;border:1px solid #c9d6e0;border-radius:6px;background:#fff;padding:0 9px;color:#26394b}.ss-p13-secondary,.ss-p13-primary{min-height:34px;border-radius:6px;padding:0 10px;font-weight:700}.ss-p13-secondary{border:1px solid #a9bbc9;background:#fff;color:#254762}.ss-p13-primary{border:1px solid #0875b8;background:#0875b8;color:#fff}.ss-p13-secondary:disabled,.ss-p13-primary:disabled{opacity:.45}
.ss-p13-list{display:flex;flex-direction:column;gap:7px}.ss-p13-issue{display:grid;grid-template-columns:minmax(240px,1fr) auto;gap:10px;align-items:center;border:1px solid #dbe4eb;border-left:4px solid #c17a00;border-radius:7px;background:#fff;padding:9px}.ss-p13-issue.is-blocker{border-left-color:#b43137}.ss-p13-issue.is-selected{outline:2px solid #4e9dcc}.ss-p13-issue-main{display:grid;grid-template-columns:150px minmax(0,1fr) auto;gap:10px;align-items:center;border:0;background:transparent;padding:3px;text-align:left;color:#273b4d}.ss-p13-issue-main span{font-size:12px}.ss-p13-issue-main small{color:#748493}.ss-p13-issue-actions{display:flex;align-items:center;justify-content:flex-end;gap:5px}.ss-p13-mini-input{width:108px;min-height:32px}
.ss-p13-repair-preview{border:1px solid #84b6d4;border-radius:9px;background:#eef7fc;padding:13px;margin:0 0 13px}.ss-p13-repair-title{display:flex;justify-content:space-between;gap:10px}.ss-p13-repair-title span{font-size:11px;color:#587184}.ss-p13-repair-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:9px 0}.ss-p13-repair-changes{display:flex;flex-wrap:wrap;gap:5px}.ss-p13-repair-changes code{background:#fff;border:1px solid #d4e2eb;border-radius:5px;padding:4px 6px;font-size:10px}.ss-p13-preview-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:12px}
.ss-p13-load-tabs{display:flex;gap:5px;overflow:auto;margin:0 0 12px;padding-bottom:2px}.ss-p13-load-tab{min-height:34px;border:1px solid #c4d2dd;border-radius:7px;background:#fff;color:#36536b;padding:0 11px;font-weight:700;white-space:nowrap}.ss-p13-load-tab.active{border-color:#0875b8;background:#e7f3fa;color:#075b8d;box-shadow:inset 0 -2px 0 #0875b8}
.ss-p13-inline-actions{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin:10px 0}.ss-p13-help{margin:6px 0 10px;color:#637587;font-size:11px;line-height:1.5}.ss-p13-editor{border:1px solid #d8e2e9;border-radius:9px;background:#fff;padding:12px;margin-bottom:12px}.ss-p13-textarea{display:block;width:100%;min-height:150px;box-sizing:border-box;border:1px solid #bdcdd8;border-radius:7px;background:#fbfdff;color:#20384b;padding:10px;font:12px/1.5 ui-monospace,Consolas,monospace;resize:vertical}.ss-p13-textarea.compact{min-height:88px}
.ss-p13-form-grid{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:8px;align-items:end}.ss-p13-form-grid .ss-p13-input,.ss-p13-form-grid .ss-p13-select{width:100%;box-sizing:border-box}.ss-p13-form-grid button{min-height:34px}
.ss-p13-data-row{display:grid;grid-template-columns:repeat(var(--p13-columns,3),minmax(92px,1fr));border-top:1px solid #edf1f4}.ss-p13-data-row:first-child{border-top:0}.ss-p13-data-row.is-header{background:#eaf0f5;color:#29465e;font-weight:700}.ss-p13-data-row>span{min-width:0;padding:8px 10px;font-size:11px;overflow-wrap:anywhere}.ss-p13-table-empty{padding:14px;color:#718494;font-size:12px}.ss-p13-preview-error{display:block;margin-top:8px;color:#9b272d;white-space:pre-wrap}.ss-p13-editor .ss-p13-notice{margin-bottom:0}
.ss-p13-table{border:1px solid #dbe4eb;border-radius:9px;overflow:hidden;background:#fff}.ss-p13-table-row{display:grid;grid-template-columns:1fr 2fr 1fr;border-top:1px solid #edf1f4}.ss-p13-table-row:first-child{border-top:0}.ss-p13-table-row>*{padding:9px 12px;font-size:12px}.ss-p13-table-row.is-header{background:#eaf0f5;color:#29465e}
.ss-p13-detail{padding:9px 0;border-bottom:1px solid #e9eef2}.ss-p13-detail span{display:block;color:#6e8192;font-size:10px;margin-bottom:4px}.ss-p13-detail code{font-family:ui-monospace,Consolas,monospace;font-size:11px;overflow-wrap:anywhere;color:#1d405d}.ss-p13-empty{font-size:12px;color:#758594}
.ss-p13-drawer{min-width:0;background:#172d42;color:#dfeaf3;border-top:1px solid #0d2032;padding:12px 16px;overflow:auto}.ss-p13-drawer-heading{display:flex;justify-content:space-between;margin-bottom:9px}.ss-p13-drawer-heading span{font-size:11px;color:#a9bdce}.ss-p13-run-list{display:flex;flex-direction:column;gap:4px}.ss-p13-run-row{display:grid;grid-template-columns:140px 80px 110px minmax(0,1fr);gap:8px;align-items:center;background:rgba(255,255,255,.06);border-radius:5px;padding:6px 9px;font-size:11px}.ss-p13-run-row small{color:#9fb5c8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media(max-width:1180px){.ss-p13-header{grid-template-columns:1fr auto}.ss-p13-title{display:none}.ss-p13-nav{justify-content:flex-start;overflow:auto}.ss-p13-body{grid-template-columns:220px minmax(0,1fr)}.ss-p13-inspector{display:none}.ss-p13-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ss-p13-issue-toolbar{grid-template-columns:140px minmax(160px,1fr) auto}.ss-p13-issue-toolbar>*:nth-child(n+4){grid-row:2}.ss-p13-issue{grid-template-columns:1fr}.ss-p13-issue-actions{justify-content:flex-start;flex-wrap:wrap}.ss-p13-form-grid{grid-template-columns:repeat(2,minmax(140px,1fr))}}
@media(max-width:760px){.ss-p13-workspace{grid-template-rows:auto minmax(0,1fr) 150px}.ss-p13-header{grid-template-columns:1fr;padding:8px}.ss-p13-actions{justify-content:flex-start;overflow:auto}.ss-p13-body{grid-template-columns:1fr}.ss-p13-tree{display:none}.ss-p13-center{padding:14px}.ss-p13-card-grid,.ss-p13-card-grid.compact{grid-template-columns:1fr}.ss-p13-run-row{grid-template-columns:90px 60px 80px minmax(0,1fr)}.ss-p13-issue-toolbar{grid-template-columns:1fr}.ss-p13-issue-toolbar>*{grid-row:auto!important}.ss-p13-issue-main{grid-template-columns:1fr}.ss-p13-repair-summary{grid-template-columns:1fr}.ss-p13-data-row{min-width:620px}.ss-p13-table{overflow:auto}.ss-p13-form-grid{grid-template-columns:1fr}}
`;
  (doc.head || doc.documentElement || doc.body)?.appendChild?.(style);
}
