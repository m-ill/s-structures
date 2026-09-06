import assert from 'node:assert/strict';
import { preflightProductionNonlinearCase } from '../src/nonlinear/product/preflight.js';
import {
  exportNonlinearHistory,
  getNonlinearResultSlice,
} from '../src/nonlinear/product/resultAccess.js';
import { installNonlinearResultPopup } from '../src/ui/indexNonlinearResultPopup.js';
import { installNonlinearWorkflow } from '../src/ui/indexNonlinearWorkflow.js';
import { createResultSelectionStore } from '../src/ui/resultSelectionStore.js';
import { byId, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';
import {
  createM10Model,
  createM10NlthCase,
  createM10PushoverCase,
  syntheticNlthResult,
  syntheticPushoverResult,
} from './helpers/p8M10Fixture.mjs';

let model = createM10Model();
const pushoverCase = createM10PushoverCase(model);
const nlthCase = createM10NlthCase(model);
model.analysisCases = [pushoverCase, nlthCase];
const document = createFakeIndexDocument();
document.body.appendChild(byId(document, 'topbar'));
const canvasWrap = byId(document, 'canvasWrap');
document.body.appendChild(canvasWrap);
const nonlinearPanel = document.createElement('section');
nonlinearPanel.setAttribute('data-ss-ribbon-panel', 'nonlinear');
document.body.appendChild(nonlinearPanel);

const localStorage = memoryStorage();
const runtimeListeners = new Map();
let drawCount = 0;
const selectionStore = createResultSelectionStore();
const jobs = new Map();
const subscribers = new Set();
const pushoverJob = completedJob('NLJOB-UI-PUSH', pushoverCase, 'pushover');
const nlthJob = completedJob('NLJOB-UI-NLTH', nlthCase, 'nlth');
const resultByJob = new Map([
  [pushoverJob.id, wrapper(pushoverJob, syntheticPushoverResult())],
  [nlthJob.id, wrapper(nlthJob, syntheticNlthResult())],
]);

const service = {
  validate(input = {}) {
    return preflightProductionNonlinearCase(model, input.analysisCase || input, {
      requireWorker: true,
      workerSupported: true,
      wasmSupported: true,
    });
  },
  subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
};
const bridge = {
  getCurrentModel: () => model,
  getResultSelectionStore: () => selectionStore,
  getNonlinearProductService: () => service,
  getNonlinearRunStatus: (id) => structuredClone(jobs.get(id) || null),
  listNonlinearRuns: (input = {}) => [...jobs.values()].filter((row) => !input.caseId || row.caseId === input.caseId).map((row, index, all) => ({ ...structuredClone(row), current: index === all.length - 1 })),
  getNonlinearRunGraph: () => ({ version: 'test', nodes: [...jobs.values()], edges: [], graphHash: 'UI-GRAPH' }),
  getNonlinearResultSlice: (id, query) => getNonlinearResultSlice(resultByJob.get(id), query),
  exportNonlinearHistory: (id, input) => exportNonlinearHistory(resultByJob.get(id), input),
  explainNonlinearFailure: () => ({ code: 'NONLINEAR_NONCONVERGENCE', title: '평형 반복 미수렴', failedStage: 'run', retryable: true, message: '증분을 줄이세요.' }),
  getNonlinearReport: (id) => ({ report: { case: { id: jobs.get(id)?.caseId } }, html: '<!doctype html><title>M10 report</title>' }),
  getAnalysisCaseResult: () => null,
  startNonlinearRun(input) {
    const row = { ...pushoverJob, id: 'NLJOB-UI-RUN', status: 'running', resultAvailable: false, progress: 0.25, analysisCase: input.analysisCase };
    jobs.set(row.id, row);
    return structuredClone(row);
  },
  pauseNonlinearRun(id) { const row = jobs.get(id); row.status = 'pausing'; return structuredClone(row); },
  cancelNonlinearRun(id) { const row = jobs.get(id); row.status = 'cancelling'; return structuredClone(row); },
  resumeNonlinearRun(id) { const row = { ...jobs.get(id), id: `${id}-R`, status: 'queued', predecessorJobId: id }; jobs.set(row.id, row); return structuredClone(row); },
  retryNonlinearRun(id) { const row = { ...jobs.get(id), id: `${id}-T`, status: 'queued', predecessorJobId: id }; jobs.set(row.id, row); return structuredClone(row); },
  applyNonlinearAssignments(preview) { return { applied: true, assignmentCount: preview.assignments.length, model }; },
};
const target = {
  document,
  model: () => model,
  SStructuresEngine: bridge,
  SStructuresResultSelection: selectionStore,
  localStorage,
  innerWidth: 1366,
  innerHeight: 768,
  requestAnimationFrame: (callback) => callback(),
  addEventListener(type, listener) {
    const rows = runtimeListeners.get(type) || [];
    rows.push(listener);
    runtimeListeners.set(type, rows);
  },
  getComputedStyle: (element) => ({ display: element.style.display || 'block', visibility: element.style.visibility || 'visible' }),
  draw: () => { drawCount += 1; },
  setTimeout,
};
document.defaultView = target;

const popup = installNonlinearResultPopup(target, { bridge, resultSelectionStore: selectionStore });
const workflow = installNonlinearWorkflow(target, { bridge });
assert.ok(popup);
assert.ok(workflow);
assert.equal(document.getElementById('ssNonlinearResultPopup').parentNode, canvasWrap);
assert.equal(document.getElementById('ssNonlinearWorkflow').parentNode, canvasWrap);
assert.ok(document.getElementById('ssRunNonlinearProduction'));
assert.ok(document.getElementById('ssOpenNonlinearSetup'));
assert.ok(document.getElementById('ssOpenNonlinearResults'));
workflow.openResults();
assert.equal(popup.getState().open, true);
assert.equal(popup.getState().jobId, null);
assert.match(allText(document.getElementById('ssNonlinearResultPopup')), /Production/);
popup.close();

workflow.open({ mode: 'pushover' });
assert.equal(workflow.getState().open, true);
assert.equal(workflow.getState().preflightStatus, 'ready');
assert.equal(document.querySelector('.ss-nl-steps').querySelectorAll('button').length, 7);
assert.match(allText(document.getElementById('ssNonlinearWorkflow')), /모델 검증/);
assert.match(allText(document.getElementById('ssNonlinearWorkflow')), /수치해석/);
workflow.go(2);
assert.ok(document.getElementById('ssNlApplyAssignments'));
assert.match(allText(document.getElementById('ssNonlinearWorkflow')), /프로젝트 가정|Auto capacity/);
workflow.go(5);
assert.match(allText(document.getElementById('ssNonlinearWorkflow')), /Reduced DOF/);
assert.match(allText(document.getElementById('ssNonlinearWorkflow')), /설계전달 차단/);

const running = workflow.run();
assert.equal(running.currentJobStatus, 'running');
const runId = running.currentJobId;
const completedRun = { ...pushoverJob, id: runId };
jobs.set(runId, completedRun);
resultByJob.set(runId, wrapper(completedRun, syntheticPushoverResult()));
emit(completedRun, 'completed');
assert.equal(workflow.getState().step, 6);
assert.equal(popup.getState().open, true);
assert.equal(popup.getState().jobId, runId);
assert.equal(document.getElementById('ssNonlinearResultPopup').getAttribute('data-ss-floating-panel'), '1');
assert.ok(document.getElementById('ssNonlinearResultPopup').querySelector('[data-ss-floating-resize]'));

popup.setTab('response');
assert.ok(document.getElementById('ssNlCapacityCurve'));
assert.match(document.getElementById('ssNlCapacityCurve').querySelector('.ss-nl-result-svg').innerHTML, /<path/);
popup.setStep(3);
assert.equal(selectionStore.getState().modeOrStep, 3);
assert.match(allText(document.getElementById('ssNlResultResponse')), /36/);
popup.setTab('spatial');
assert.equal(document.querySelectorAll('.ss-nl-entity-section').length, 3);
popup.selectEntity('member', 'C');
assert.deepEqual(selectionStore.getState().selectedEntity, { type: 'member', id: 'C' });
assert.ok(drawCount > 0);

jobs.set(nlthJob.id, nlthJob);
popup.openJob(nlthJob.id, { tab: 'response' });
assert.equal(popup.getState().kind, 'nlth');
assert.equal(selectionStore.getState().activeCaseId, nlthCase.id);
assert.equal(selectionStore.getState().activeResultId, nlthJob.id);
assert.ok(document.getElementById('ssNlTimeHistoryChart'));
assert.match(document.getElementById('ssNlTimeHistoryChart').querySelector('.ss-nl-result-svg').innerHTML, /<path/);
popup.setHistoryPath('energies.input');
assert.equal(selectionStore.getState().response, 'energies.input');
const exported = popup.exportRaw('csv', { download: false });
assert.equal(exported.rowCount, 240);
assert.equal(exported.raw, true);

popup.setTab('record');
assert.match(allText(document.getElementById('ssNlResultRecord')), /production-wasm-sparse/);
assert.match(allText(document.getElementById('ssNlResultRecord')), /설정 해시/);
assert.match(allText(document.getElementById('ssNonlinearResultPopup')), /candidate/);
const styleText = document.getElementById('ssNonlinearResultPopupStyles').textContent;
assert.match(styleText, /@media\(max-width:760px\)/);
assert.match(styleText, /position:fixed!important/);
assert.match(styleText, /grid-template-columns:1fr/);
popup.resetSize();
assert.equal(localStorage.getItem('s-structures:nonlinear-result-popup:user-sized'), '0');
target.innerWidth = 600;
for (const listener of runtimeListeners.get('resize') || []) listener({ type: 'resize' });
assert.equal(document.getElementById('ssNonlinearResultPopup').getAttribute('data-ss-floating-panel'), '1');

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-UI-01', 'NL-UI-05', 'NL-UI-07', 'NL-UI-08', 'NL-UI-09', 'NL-UI-10', 'NL-UI-11', 'NL-UI-12', 'NL-UI-13'],
  workflow: workflow.getState(),
  popup: popup.getState(),
  sharedSelection: selectionStore.getState(),
  rawExportRows: exported.rowCount,
  floating: document.getElementById('ssNonlinearResultPopup').getAttribute('data-ss-floating-panel'),
  mobileContract: true,
}, null, 2));

function wrapper(job, payload) {
  return {
    caseId: job.caseId,
    kind: job.kind,
    status: 'ok',
    qualification: 'candidate',
    designBlocked: true,
    settings: job.analysisCase.settings,
    settingsHash: job.settingsHash,
    engine: { id: job.analysisCase.engineId },
    routing: { executedEngineId: job.analysisCase.engineId, fallbackUsed: false },
    payload,
  };
}

function completedJob(id, analysisCase, mode) {
  return {
    id,
    sequence: mode === 'pushover' ? 1 : 2,
    caseId: analysisCase.id,
    kind: analysisCase.kind,
    mode,
    status: 'completed',
    stage: 'results',
    progress: 1,
    progressMessage: '해석 완료',
    resultAvailable: true,
    resultSummary: mode === 'pushover' ? { stepCount: 6 } : { outputStepCount: 240 },
    qualification: 'candidate',
    designBlocked: true,
    stale: false,
    modelHash: 'UI-MODEL',
    settingsHash: analysisCase.settingsHash,
    runtime: { mode: 'module-worker', backend: 'production-wasm-sparse' },
    analysisCase,
    createdAt: '2026-07-14T00:00:00.000Z',
    completedAt: '2026-07-14T00:01:00.000Z',
  };
}

function emit(job, event) {
  for (const listener of subscribers) listener(structuredClone(job), event);
}

function allText(element) {
  if (!element) return '';
  return [element.textContent, ...element.children.map(allText)].join(' ');
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
