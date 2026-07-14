import assert from 'node:assert/strict';
import {
  buildNonlinearCalculationReport,
  createNonlinearCalculationReportHtml,
  downsampleNonlinearHistory,
  explainNonlinearFailure,
  exportNonlinearHistory,
  getNonlinearResultSlice,
  paginateNonlinearHistory,
  preflightProductionNonlinearCase,
} from '../src/nonlinear/product/index.js';
import {
  createM10Model,
  createM10PushoverCase,
  syntheticNlthResult,
  syntheticPushoverResult,
} from './helpers/p8M10Fixture.mjs';

const large = Array.from({ length: 10001 }, (_, index) => ({
  index,
  x: index * 0.01,
  y: Math.sin(index / 17),
}));
large[437].y = -25;
large[8831].y = 40;
const downsampled = downsampleNonlinearHistory(large, { maxPoints: 240 });
assert.ok(downsampled.length <= 240);
assert.equal(downsampled[0].index, 0);
assert.equal(downsampled.at(-1).index, large.length - 1);
assert.ok(downsampled.some((row) => row.index === 437 && row.y === -25));
assert.ok(downsampled.some((row) => row.index === 8831 && row.y === 40));

const page = paginateNonlinearHistory(large, { page: 3, pageSize: 125 });
assert.equal(page.page, 3);
assert.equal(page.offset, 250);
assert.equal(page.rows.length, 125);
assert.equal(page.hasPrevious, true);
assert.equal(page.hasNext, true);

const pushWrapper = {
  caseId: 'PUSH-PROD-01',
  kind: 'pushover',
  status: 'ok',
  qualification: 'candidate',
  designBlocked: true,
  settings: { steps: 6, targetDisplacement: 0.06 },
  settingsHash: 'PUSH-SETTINGS',
  payload: syntheticPushoverResult(),
};
const curve = getNonlinearResultSlice(pushWrapper, { slice: 'capacity', step: 3 });
assert.equal(curve.data.pointCount, 6);
assert.equal(curve.data.selected.step, 3);
assert.equal(curve.data.selected.baseShear, 36);
const story = getNonlinearResultSlice(pushWrapper, { slice: 'story', step: 3, storyId: 'S1' });
const member = getNonlinearResultSlice(pushWrapper, { slice: 'member', step: 3, memberId: 'C' });
const node = getNonlinearResultSlice(pushWrapper, { slice: 'node', step: 3, nodeId: 'T' });
const hinge = getNonlinearResultSlice(pushWrapper, { slice: 'hinge', step: 3, hingeId: 'C:i:z' });
assert.equal(story.data.selected.id, 'S1');
assert.equal(member.data.selected.id, 'C');
assert.equal(node.data.selected.id, 'T');
assert.equal(hinge.data.selected.state, 'yielded');
assert.equal(hinge.data.stateCounts.yielded, 1);
assert.equal(getNonlinearResultSlice(pushWrapper, { slice: 'convergence', step: 3 }).data.selected.iterations, 3);

const nlth = syntheticNlthResult();
const nlthWrapper = {
  caseId: 'NLTH-PROD-01',
  kind: 'nonlinearTimeHistory',
  status: 'ok',
  qualification: 'candidate',
  designBlocked: true,
  settings: { massSourceId: 'MS' },
  settingsHash: 'NLTH-SETTINGS',
  payload: nlth,
};
const history = getNonlinearResultSlice(nlthWrapper, {
  slice: 'history', path: 'q[0]', maxPoints: 90, page: 2, pageSize: 30,
});
assert.equal(history.data.rawRowCount, 240);
assert.ok(history.data.plottedPointCount <= 90);
assert.equal(history.data.downsampled, true);
assert.equal(history.data.algorithm, 'deterministic-min-max-buckets');
assert.equal(history.data.page, 2);
assert.equal(history.data.rows.length, 30);
const rawMinimum = Math.min(...nlth.history.retainedChunks.flatMap((chunk) => chunk.rows.map((row) => row.q[0])));
const rawMaximum = Math.max(...nlth.history.retainedChunks.flatMap((chunk) => chunk.rows.map((row) => row.q[0])));
assert.equal(history.data.extrema.minimum.y, rawMinimum);
assert.equal(history.data.extrema.maximum.y, rawMaximum);

const csv = exportNonlinearHistory(nlthWrapper, { format: 'csv', path: 'q[0]' });
const json = exportNonlinearHistory(nlthWrapper, { format: 'json', path: 'q[0]' });
assert.equal(csv.raw, true);
assert.equal(csv.rowCount, 240);
assert.equal(csv.content.split('\n').length, 241);
assert.equal(JSON.parse(json.content).values.length, 240);
assert.ok(csv.contentHash);
assert.ok(json.contentHash);

const failure = explainNonlinearFailure({ code: 'NONLINEAR_NONCONVERGENCE' });
assert.equal(failure.failedStage, 'run');
assert.equal(failure.retryable, true);
assert.ok(failure.remediation.some((row) => row.action === 'inspect-convergence'));

const model = createM10Model();
const analysisCase = createM10PushoverCase(model);
const preflight = preflightProductionNonlinearCase(model, analysisCase, {
  requireWorker: true,
  workerSupported: true,
  wasmSupported: true,
});
const job = {
  id: 'NLJOB-REPORT', caseId: analysisCase.id, status: 'completed', qualification: 'candidate',
  designBlocked: true, modelHash: 'MODEL-HASH', settingsHash: analysisCase.settingsHash, runtime: { mode: 'module-worker', backend: 'production-wasm-sparse' },
};
const report = buildNonlinearCalculationReport({ model, analysisCase, job, preflight, result: pushWrapper });
const html = createNonlinearCalculationReportHtml(report);
assert.equal(report.qualification.value, 'candidate');
assert.equal(report.qualification.designBlocked, true);
assert.equal(report.case.id, analysisCase.id);
assert.equal(report.case.settingsByteEquivalent, true);
assert.equal(report.input.modelHash, preflight.modelHash);
assert.match(html, /PUSH-PROD-01/);
assert.match(html, /candidate/);
assert.match(html, new RegExp(analysisCase.settingsHash));

console.log(JSON.stringify({
  ok: true,
  verificationIds: [
    'NL-UI-06', 'NL-UI-07', 'NL-UI-08', 'NL-UI-09', 'NL-UI-10', 'NL-UI-13', 'NL-UI-14',
    'NL-API-06', 'NL-API-07',
  ],
  rawRows: history.data.rawRowCount,
  plottedPoints: history.data.plottedPointCount,
  extrema: history.data.extrema,
  csvHash: csv.contentHash,
  reportHash: report.reportHash,
}, null, 2));
