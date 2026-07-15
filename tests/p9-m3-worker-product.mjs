import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import {
  ComputeJobCancelledError,
  analyzeModelSyncCompatibility,
  createElasticAnalysisService,
} from '../src/compute/index.js';
import { p9M1CantileverModel } from './helpers/p9M1Fixture.mjs';

const service = createElasticAnalysisService({
  worker: { workerFactory: (url, options) => new NodeWorker(url, options) },
});
const model = manyCombinationModel(4);
const progress = [];
const completed = await service.run(model, {
  runId: 'p9-m3-product-success',
  caseId: 'elastic-success',
  onProgress: (row) => progress.push(row),
});
assert.equal(completed.operation, 'elasticStatic', 'P9-API-04 product service route');
assert.equal(completed.result.ok, true);
assert.equal(completed.execution.factorizationCount, 1);
assert.equal(completed.execution.solveCount, 4);
assert.equal(completed.execution.resourceBalanced, true);
assert.ok(progress.some((row) => row.stage === 'combination-complete' && row.resultSlice), 'P9-ELA-13 result slice progress');
assert.ok(progress.every((row) => !row.result), 'P9-ELA-13 partial full result is never current');
const detailedCombo = await service.runCombination(model, 'C2', {
  runId: 'p9-m3-product-combination-detail',
});
assert.equal(detailedCombo.result.combinationStorage.mode, 'detailed', 'P9-API-04 on-demand detailed combination');
assert.ok(detailedCombo.result.byCombo.C2.memberResults.M1);

let cancelAcknowledgement = null;
let cancelRequested = false;
const cancelledRunId = 'p9-m3-product-cancel';
const cancelled = service.run(manyCombinationModel(20), {
  runId: cancelledRunId,
  caseId: 'elastic-cancel',
  onProgress(row) {
    if (row.stage === 'combination-complete' && !cancelRequested) {
      cancelRequested = true;
      cancelAcknowledgement = service.cancel(cancelledRunId);
    }
  },
});
await assert.rejects(cancelled, (error) => error instanceof ComputeJobCancelledError && error.code === 'CANCELLED', 'P9-ELA-14 committed-boundary cancellation');
assert.equal((await cancelAcknowledgement).accepted, true);

const warningRows = [];
analyzeModelSyncCompatibility(p9M1CantileverModel(), {
  caller: 'tests/p9-m3-worker-product',
  onWarning: (row) => warningRows.push(row),
});
assert.equal(warningRows[0]?.warning, 'DEPRECATED_S_TIER_SYNC_COMPATIBILITY', 'P9-ELA-15 sync warning');
assert.throws(() => analyzeModelSyncCompatibility(p9M1CantileverModel(), {
  caller: 'product-ui',
  productUi: true,
}), { code: 'SYNC_COMPATIBILITY_UI_FORBIDDEN' });
assert.throws(() => analyzeModelSyncCompatibility(p9M1CantileverModel(), {
  caller: 'gpu-route',
  computeTarget: 'gpu',
}), { code: 'SYNC_COMPATIBILITY_GPU_FORBIDDEN' }, 'P9-ELA-16 GPU bypass forbidden');

const productSource = await readFile(new URL('../src/compute/product/elasticAnalysisService.js', import.meta.url), 'utf8');
assert.doesNotMatch(productSource, /analyzeModel\s*\(/, 'P9-API-05 product service has no sync solver call');
await service.dispose();

console.log(JSON.stringify({
  ok: true,
  requirements: ['P9-ELA-13~16', 'P9-API-04~06'],
  successProgressEvents: progress.length,
  cancellationAcknowledged: true,
}, null, 2));

function manyCombinationModel(count) {
  const model = p9M1CantileverModel();
  model.loadCombinations = Array.from({ length: count }, (_item, index) => ({
    id: `C${index + 1}`,
    name: `Combination ${index + 1}`,
    type: index % 2 ? 'strength' : 'service',
    factors: { W: 0.5 + index * 0.05 },
  }));
  return model;
}
