import assert from 'node:assert/strict';
import { createNonlinearProductService } from '../src/nonlinear/product/jobManager.js';
import { createIndexAgentApi } from '../src/ui/indexAgentApi.js';
import {
  createM10Model,
  createM10NlthCase,
  createM10PushoverCase,
  syntheticNlthResult,
  syntheticPushoverResult,
} from './helpers/p8M10Fixture.mjs';

let model = createM10Model();
const analysisCase = createM10PushoverCase(model);
model.analysisCases = [analysisCase];
const snapshots = [];
const service = createNonlinearProductService({
  getModel: () => model,
  runner: deterministicRunner,
});
service.subscribe((job, event) => snapshots.push({ event, status: job.status, progress: job.progress, jobId: job.id }));

const immediate = service.start({ analysisCase });
assert.equal(immediate.status, 'queued');
assert.equal(immediate.resultAvailable, false);
assert.equal(immediate.settingsHash, analysisCase.settingsHash);
const completed = await service.wait(immediate.id);
assert.equal(completed.status, 'completed');
assert.equal(completed.progress, 1);
assert.equal(completed.qualification, 'candidate');
assert.equal(completed.designBlocked, true);
assert.equal(completed.runtime.mode, 'injected-runner');
assert.ok(snapshots.some((row) => row.event === 'progress'));
const progress = snapshots.filter((row) => row.jobId === immediate.id && row.progress != null).map((row) => row.progress);
assert.ok(progress.every((value, index) => index === 0 || value >= progress[index - 1]), JSON.stringify(progress));

const result = service.getResult(immediate.id);
assert.equal(result.settingsHash, analysisCase.settingsHash);
assert.equal(result.settingsBytes, completed.preflight?.settingsBytes || result.settingsBytes);
assert.equal(result.routing.executedEngineId, analysisCase.engineId);
assert.equal(result.routing.fallbackUsed, false);
const curve = service.getResultSlice(immediate.id, { slice: 'capacity', step: 4 });
assert.equal(curve.data.selected.baseShear, 48);

const repeat = service.start({ analysisCase });
const repeatCompleted = await service.wait(repeat.id);
assert.equal(repeatCompleted.status, 'completed');
assert.deepEqual(
  service.getResultSlice(repeat.id, { slice: 'capacity' }).data.points,
  service.getResultSlice(immediate.id, { slice: 'capacity' }).data.points,
);

model.analysisCases = [{
  ...structuredClone(model.analysisCases[0]),
  status: 'ok',
  lastRun: { at: '2026-07-14T00:00:00.000Z', resultKey: 'RUN-METADATA' },
}];
assert.equal(service.getStatus(immediate.id).stale, false, 'volatile run metadata must not stale its own result');

model = structuredClone(model);
model.nodes[1].x = 0.05;
const stale = service.getStatus(immediate.id);
assert.equal(stale.stale, true);
assert.equal(stale.designBlocked, true);
assert.equal(service.getResult(immediate.id).stale, true);
assert.equal(service.getResultSlice(immediate.id, { slice: 'overview' }).data.stale, true);
const staleReport = service.getReport(immediate.id);
assert.equal(staleReport.input.stale, true);
assert.equal(staleReport.qualification.stale, true);
assert.equal(service.listJobs({ caseId: analysisCase.id }).filter((row) => row.current).length, 1);
assert.equal(service.getRunGraph().nodes.length, 2);

model = createM10Model();
let nlthAttempt = 0;
let observedRestart = null;
const checkpoint = {
  integrityHash: 'CHECKPOINT-INTEGRITY',
  committedHash: 'CHECKPOINT-COMMITTED',
  revision: 7,
  committed: { time: 0.12 },
};
const resumable = createNonlinearProductService({
  getModel: () => model,
  runner: async ({ signal, onProgress, restartCheckpoint }) => {
    nlthAttempt += 1;
    observedRestart = restartCheckpoint;
    if (nlthAttempt === 1) {
      onProgress({ type: 'checkpoint', time: 0.12, checkpoint });
      await untilAborted(signal);
    }
    return syntheticNlthResult();
  },
});
const nlthJob = resumable.start({ analysisCase: createM10NlthCase(model) });
await started();
assert.equal(resumable.getStatus(nlthJob.id).status, 'running');
assert.equal(resumable.pause(nlthJob.id).status, 'pausing');
const paused = await resumable.wait(nlthJob.id);
assert.equal(paused.status, 'paused');
assert.equal(paused.checkpoint.integrityHash, checkpoint.integrityHash);
const resumed = resumable.resume(nlthJob.id);
assert.equal(resumed.predecessorJobId, nlthJob.id);
assert.equal(resumed.resumePolicy, 'checkpoint');
const resumedDone = await resumable.wait(resumed.id);
assert.equal(resumedDone.status, 'completed');
assert.equal(observedRestart.integrityHash, checkpoint.integrityHash);
assert.ok(resumable.getRunGraph().edges.some((row) => row.from === nlthJob.id && row.to === resumed.id && row.policy === 'checkpoint'));

let cancelCheckpoint = null;
const cancellable = createNonlinearProductService({
  getModel: () => model,
  runner: async ({ signal, onProgress }) => {
    cancelCheckpoint = { ...checkpoint, integrityHash: 'CANCEL-CHECKPOINT' };
    onProgress({ type: 'checkpoint', time: 0.12, checkpoint: cancelCheckpoint });
    await untilAborted(signal);
  },
});
const cancelJob = cancellable.start({ analysisCase: createM10NlthCase(model) });
await started();
assert.equal(cancellable.cancel(cancelJob.id).status, 'cancelling');
const cancelled = await cancellable.wait(cancelJob.id);
assert.equal(cancelled.status, 'cancelled');
assert.equal(cancelled.checkpoint.integrityHash, cancelCheckpoint.integrityHash);

const bridge = bridgeFor(service, model);
const target = { __SStructuresAgentState: {}, __SStructuresAnalysisResults: {} };
const agent = createIndexAgentApi(target, bridge, { bridgeVersion: 'p8-m10-test-bridge' });
const agentValidation = agent.validateNonlinearCase({ analysisCase, model });
assert.equal(agentValidation.settingsHash, service.validate({ analysisCase, model }).settingsHash);
assert.equal(agentValidation.analysisCase.engineId, analysisCase.engineId);
assert.equal(agent.validateProductionNonlinearCase({ analysisCase, model }).settingsHash, agentValidation.settingsHash);
const agentRawResult = agent.getNonlinearResult({ jobId: immediate.id });
assert.equal(agentRawResult.settingsHash, analysisCase.settingsHash);
const agentSlice = agent.getNonlinearResultSlice({ jobId: immediate.id, slice: 'capacity', step: 2 });
assert.equal(agentSlice.data.selected.baseShear, 24);
const agentResult = agent.execute('getNonlinearResultSlice', { jobId: immediate.id, slice: 'capacity', step: 5 });
assert.equal(agentResult.resultSlice.data.selected.baseShear, 43);

console.log(JSON.stringify({
  ok: true,
  verificationIds: [
    'NL-UI-05',
    'NL-API-03', 'NL-API-04', 'NL-API-05', 'NL-API-09', 'NL-API-10',
  ],
  completedJob: completed.id,
  deterministicJob: repeatCompleted.id,
  progressEventCount: progress.length,
  stale: stale.stale,
  resumedJob: resumedDone.id,
  resumePolicy: resumedDone.resumePolicy,
  cancelledCheckpoint: cancelled.checkpoint.integrityHash,
  agentSettingsHash: agentValidation.settingsHash,
}, null, 2));

async function deterministicRunner({ analysisCase: currentCase, onProgress }) {
  onProgress({ type: 'pmm-preprocess', completed: 1, total: 2 });
  if (currentCase.kind === 'nonlinearTimeHistory') {
    onProgress({ type: 'dynamic-output-step', time: 0.04, endTime: 0.08 });
    onProgress({ type: 'dynamic-output-step', time: 0.08, endTime: 0.08 });
    return syntheticNlthResult();
  }
  for (let step = 1; step <= currentCase.settings.steps; step += 1) {
    onProgress({ type: 'displacement-step-accepted', step, total: currentCase.settings.steps });
  }
  return syntheticPushoverResult();
}

function untilAborted(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(cancelledError());
    signal.addEventListener('abort', () => reject(cancelledError()), { once: true });
  });
}

function cancelledError() {
  return Object.assign(new Error('cancelled at committed boundary'), { code: 'CANCELLED' });
}

function started() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function bridgeFor(productService, currentModel) {
  return {
    validateProductionNonlinearCase: (input) => productService.validate(input),
    createProductionNonlinearCase: (input) => productService.createCase(input),
    previewNonlinearAssignments: (input) => productService.previewAssignments(input),
    applyNonlinearAssignments: (changeSet, input) => productService.applyAssignments(changeSet, input),
    startNonlinearRun: (input) => productService.start(input),
    pauseNonlinearRun: (id) => productService.pause(id),
    cancelNonlinearRun: (id) => productService.cancel(id),
    resumeNonlinearRun: (id, input) => productService.resume(id, input),
    retryNonlinearRun: (id, input) => productService.retry(id, input),
    getNonlinearRunStatus: (id, input) => productService.getStatus(id, input),
    listNonlinearRuns: (input) => productService.listJobs(input),
    getNonlinearRunGraph: (input) => productService.getRunGraph(input),
    getNonlinearResult: (id) => productService.getResult(id),
    getNonlinearResultSlice: (id, query) => productService.getResultSlice(id, query),
    explainNonlinearFailure: (id) => productService.explainFailure(id),
    exportNonlinearHistory: (id, input) => productService.exportHistory(id, input),
    getNonlinearReport: (id, input) => productService.getReport(id, input),
    getCurrentModel: () => currentModel,
  };
}
