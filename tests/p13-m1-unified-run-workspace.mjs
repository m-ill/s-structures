import assert from 'node:assert/strict';
import {
  beginPhase13AnalysisRun,
  buildPhase13PublishedRunSet,
  cancelPhase13AnalysisRun,
  completePhase13AnalysisRun,
  createPhase13AnalysisRunStore,
  failPhase13AnalysisRun,
  getPhase13RunState,
  migrateLegacyAnalysisRunStore,
  updatePhase13AnalysisRunProgress,
} from '../src/core/phase13AnalysisRuns.js';
import { createUnifiedElasticRunService } from '../src/compute/product/unifiedElasticRunService.js';
import { createPhase13ElasticWorkspace } from '../src/ui/phase13ElasticWorkspace.js';

const model = {
  schemaVersion: 5,
  meta: { id: 'P13-M1', revisionId: 'R1' },
  nodes: [{ id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 4, y: 0, z: 0 }],
  members: [{ id: 'M1', nodeI: 'N1', nodeJ: 'N2', matId: 'MAT', secId: 'SEC' }],
  materials: [], sections: [], supports: [], loads: [], loadCombinations: [],
};
const analysisCase = { id: 'LC1', kind: 'LinearStatic', settings: { comboId: 'COMB1' } };

let store = createPhase13AnalysisRunStore();
let started = beginPhase13AnalysisRun(store, { model, analysisCase, runId: 'RUN-1', startedAt: '2026-08-05T00:00:00Z' });
store = started.store;
assert.equal(store.activeRunId, 'RUN-1');
assert.match(store.runs['RUN-1'].integrityHash, /^[0-9a-f]{24}$/);
store = updatePhase13AnalysisRunProgress(store, 'RUN-1', { stage: 'solve', ratio: 0.6 });
store = updatePhase13AnalysisRunProgress(store, 'RUN-1', { stage: 'assemble', ratio: 0.2 });
assert.equal(store.runs['RUN-1'].progress.ratio, 0.6, 'progress must be monotonic');
store = completePhase13AnalysisRun(store, 'RUN-1', {
  model, analysisCase, result: { status: 'ok', displacements: [0, 1] }, finishedAt: '2026-08-05T00:00:01Z',
});
assert.equal(store.lastSuccessfulByCase.LC1, 'RUN-1');
assert.equal(getPhase13RunState(store, { model, analysisCase }).execution, 'current');

started = beginPhase13AnalysisRun(store, { model, analysisCase, runId: 'RUN-2' });
store = failPhase13AnalysisRun(started.store, 'RUN-2', {
  model, analysisCase, result: { code: 'SINGULAR', message: 'singular matrix' },
});
const retained = getPhase13RunState(store, { model, analysisCase });
assert.equal(retained.execution, 'current');
assert.equal(retained.lastSuccessfulRunId, 'RUN-1');
assert.equal(retained.latestAttemptStatus, 'failed');

const editedModel = { ...model, nodes: [...model.nodes, { id: 'N3', x: 8, y: 0, z: 0 }] };
const stale = getPhase13RunState(store, { model: editedModel, analysisCase });
assert.equal(stale.execution, 'stale');
assert.deepEqual(stale.staleReasons, ['MODEL_HASH_CHANGED']);
assert.equal(getPhase13RunState(store, { model, analysisCase, camera: { eye: [1, 2, 3] } }).execution, 'current');
assert.equal(getPhase13RunState(store, { model, analysisCase: { ...analysisCase, settings: { comboId: 'COMB2' } } }).execution, 'stale');

const third = beginPhase13AnalysisRun(store, { model, analysisCase, runId: 'RUN-3' });
store = cancelPhase13AnalysisRun(third.store, 'RUN-3', { model, analysisCase });
assert.equal(store.lastSuccessfulByCase.LC1, 'RUN-1');
assert.throws(() => buildPhase13PublishedRunSet([store.runs['RUN-1'], store.runs['RUN-2']]), { code: 'P13_MIXED_RUN_SET' });

let race = createPhase13AnalysisRunStore();
race = beginPhase13AnalysisRun(race, { model, analysisCase, runId: 'OLD' }).store;
race = beginPhase13AnalysisRun(race, { model, analysisCase, runId: 'NEW' }).store;
race = completePhase13AnalysisRun(race, 'NEW', { model, analysisCase, result: { status: 'ok' } });
race = completePhase13AnalysisRun(race, 'OLD', { model, analysisCase, result: { status: 'ok' } });
assert.equal(race.lastSuccessfulByCase.LC1, 'NEW', 'late old worker result must not become current');

const legacy = migrateLegacyAnalysisRunStore({
  attempts: { LC1: [store.runs['RUN-1'].baseRecord] },
  lastSuccessful: { LC1: store.runs['RUN-1'].baseRecord },
});
assert.equal(legacy.lastSuccessfulByCase.LC1, 'RUN-1');
assert.equal(legacy.runs['RUN-1'].baseRecord.id, 'RUN-1');

const events = [];
const fakeElastic = {
  async run(_model, options) {
    options.onProgress({ stage: 'solve', ratio: 0.5 });
    return { ok: true, status: 'ok', caseId: options.caseId, values: [1] };
  },
  cancel: () => true,
  dispose: () => undefined,
};
const service = createUnifiedElasticRunService({ elasticService: fakeElastic });
service.subscribe((event) => events.push(event.event));
const serviceResult = await service.run(model, { id: 'SERVICE-1', kind: 'LinearStatic' }, { runId: 'SERVICE-RUN' });
assert.equal(serviceResult.run.status, 'completed');
assert.deepEqual(events, ['run-started', 'run-progress', 'run-completed']);

const workspace = createPhase13ElasticWorkspace();
workspace.setWorkspace('analysis');
workspace.selectObject('member', 'M1', 'tree');
workspace.setRunState(service.getCaseState(model, { id: 'SERVICE-1', kind: 'LinearStatic' }));
const view = workspace.buildViewModel({ width: 1280, height: 720 });
assert.equal(view.navigation.length, 6);
assert.equal(view.panes.center.selection.id, 'M1');
assert.equal(view.panes.right.selection.id, 'M1');
assert.equal(view.overflowX, false);
assert.ok(view.panes.center.width >= 600);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P13-M1',
  checks: ['run-lifecycle', 'stale', 'last-success', 'race', 'migration', 'workspace'],
}, null, 2));
