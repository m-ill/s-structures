import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { stableHash } from '../src/core/stableHash.js';
import {
  ANALYSIS_OPERATION_KINDS,
  createCurrentAnalysisComputeBackend,
  prepareAnalysisContracts,
} from '../src/compute/adapters/analysisAdapters.js';
import { createAnalysisExecutionPlan } from '../src/compute/execution/executionPlan.js';
import { COMPUTE_JOB_EVENT_TYPES } from '../src/compute/runtime/protocol.js';
import { createComputeWorkerCore } from '../src/compute/runtime/workerCore.js';
import { ComputeJobCancelledError, createComputeWorkerClient } from '../src/compute/runtime/workerClient.js';
import { p9M1Backend, p9M1CantileverModel } from './helpers/p9M1Fixture.mjs';

const events = [];
const listeners = new Set();
let core;
const worker = {
  postMessage(message) { queueMicrotask(() => core.handleMessage(message)); },
  addEventListener(type, handler) { if (type === 'message') listeners.add(handler); },
  removeEventListener(type, handler) { if (type === 'message') listeners.delete(handler); },
  terminate() {},
};
const emit = (message) => {
  events.push(message);
  queueMicrotask(() => { for (const listener of listeners) listener({ data: message }); });
};
core = createComputeWorkerCore({
  postMessage: emit,
  async executor(job, context) {
    for (let step = 1; step <= 4; step += 1) {
      await context.yieldControl();
      context.throwIfCancelled();
      context.commitBoundary({ step });
      context.reportProgress({ value: step / 4, step });
    }
    return { operation: job.operation.kind, ok: true };
  },
});
const client = createComputeWorkerClient({ worker });
const planFor = (runId) => createAnalysisExecutionPlan({
  runId,
  caseId: 'case-1',
  domainHash: stableHash({ runId }),
  backends: [p9M1Backend()],
  operations: [{ id: 'batch', kind: 'elementBatch' }],
  userPolicy: 'cpu',
});

const progress = [];
const result = await client.start(planFor('worker-success'), 'batch', null, { onProgress: (row) => progress.push(row.value) });
assert.deepEqual(progress, [0.25, 0.5, 0.75, 1], 'P9-CMP-09 monotonic progress');
assert.deepEqual(result, { operation: 'elementBatch', ok: true }, 'P9-API-02 Worker result parity');
const successTerminals = events.filter((row) => row.runId === 'worker-success' && [
  COMPUTE_JOB_EVENT_TYPES.result,
  COMPUTE_JOB_EVENT_TYPES.error,
  COMPUTE_JOB_EVENT_TYPES.cancelled,
].includes(row.type));
assert.equal(successTerminals.length, 1, 'P9-CMP-10 single terminal event');

const invalidPlan = { ...planFor('worker-invalid'), planHash: '0'.repeat(64) };
await assert.rejects(client.start(invalidPlan, 'batch'), { code: 'COMPUTE_PLAN_INVALID' }, 'P9-CMP-10 pre-run protocol error is preserved');

let cancelAck;
const cancelled = client.start(planFor('worker-cancel'), 'batch', null, {
  onProgress(row) {
    if (row.value === 0.25 && !cancelAck) cancelAck = client.cancel('worker-cancel');
  },
});
await assert.rejects(cancelled, (error) => error instanceof ComputeJobCancelledError && error.code === 'CANCELLED', 'P9-CMP-10 committed-boundary cancellation');
assert.equal((await cancelAck).accepted, true, 'P9-CMP-10 cancel acknowledgement');
const cancelTerminals = events.filter((row) => row.runId === 'worker-cancel' && [
  COMPUTE_JOB_EVENT_TYPES.result,
  COMPUTE_JOB_EVENT_TYPES.error,
  COMPUTE_JOB_EVENT_TYPES.cancelled,
].includes(row.type));
assert.equal(cancelTerminals.length, 1, 'P9-CMP-10 cancelled run terminal uniqueness');
client.dispose();

const actualModel = p9M1CantileverModel();
const actualContracts = prepareAnalysisContracts(actualModel);
const actualBackend = createCurrentAnalysisComputeBackend();
const actualPlan = createAnalysisExecutionPlan({
  runId: 'worker-thread-elastic',
  caseId: 'C1',
  domainHash: actualContracts.domain.domainHash,
  backends: [actualBackend],
  operations: [{ id: 'elastic', kind: ANALYSIS_OPERATION_KINDS.elasticStatic, production: false }],
  userPolicy: 'cpu',
});
const actualClient = createComputeWorkerClient({
  workerFactory: (url, options) => new NodeWorker(url, options),
});
const actualResult = await actualClient.start(actualPlan, 'elastic', {
  model: actualModel,
  expectedDomainHash: actualContracts.domain.domainHash,
});
assert.equal(actualResult.operation, ANALYSIS_OPERATION_KINDS.elasticStatic, 'P9-API-02 actual module Worker operation');
assert.equal(actualResult.domainHash, actualContracts.domain.domainHash, 'P9-API-02 actual module Worker domain parity');
await actualClient.dispose();

console.log('P9-M1 common Worker lifecycle: PASS');
