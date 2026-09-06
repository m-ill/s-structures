import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createAvailableWasmSparseBackend } from '../src/nonlinear/runtime/analysisWorker.js';
import {
  DENSE_REFERENCE_MAX_DOF,
  JS_SPARSE_REFERENCE_MAX_DOF,
  estimateRuntimeMemory,
  runRuntimePreflight,
} from '../src/nonlinear/runtime/preflight.js';
import {
  WORKER_PROTOCOL_VERSION,
  WORKER_RESPONSE_TYPES,
  collectTransferables,
  createCancelRequest,
  createRunRequest,
  validateWorkerRequest,
} from '../src/nonlinear/runtime/protocol.js';

assert.equal(validateWorkerRequest({
  type: 'RUN',
  requestId: 'missing-version',
  runToken: 'missing-version',
  task: { type: 'ECHO' },
}).error.code, 'PROTOCOL_VERSION_UNSUPPORTED');
assert.equal(validateWorkerRequest({
  protocolVersion: WORKER_PROTOCOL_VERSION,
  type: 'RUN',
  requestId: 'valid-version',
  runToken: 'valid-version',
  task: { type: 'ECHO' },
}).ok, true);
import { createWorkerCore } from '../src/nonlinear/runtime/workerCore.js';
import { createWorkerClient } from '../src/nonlinear/runtime/workerClient.js';

const estimate = estimateRuntimeMemory({
  dofCount: 120,
  nnz: 900,
  backendMode: 'js-sparse-reference',
  resultVectorCount: 6,
});
assert.ok(estimate.matrixBytes > 0);
assert.ok(estimate.stateBytes > 0);
assert.ok(estimate.resultBytes > 0);
assert.equal(estimate.totalBytes, estimate.matrixBytes + estimate.stateBytes + estimate.resultBytes);

assert.equal(runRuntimePreflight({
  dofCount: DENSE_REFERENCE_MAX_DOF,
  nnz: 1200,
  backendMode: 'dense-reference',
}).ok, true);
assert.equal(runRuntimePreflight({
  dofCount: DENSE_REFERENCE_MAX_DOF + 1,
  nnz: 1200,
  backendMode: 'dense-reference',
}).code, 'DENSE_REFERENCE_DOF_LIMIT');
assert.equal(runRuntimePreflight({
  dofCount: JS_SPARSE_REFERENCE_MAX_DOF,
  nnz: 12000,
  backendMode: 'js-sparse-reference',
}).ok, true);
assert.equal(runRuntimePreflight({
  dofCount: JS_SPARSE_REFERENCE_MAX_DOF + 1,
  nnz: 12000,
  backendMode: 'js-sparse-reference',
}).code, 'JS_SPARSE_REFERENCE_DOF_LIMIT');

const noProductionBackend = runRuntimePreflight({
  dofCount: 20,
  nnz: 80,
  backendMode: 'production',
});
assert.equal(noProductionBackend.ok, false);
assert.equal(noProductionBackend.code, 'PRODUCTION_BACKEND_UNAVAILABLE');
assert.equal(noProductionBackend.backend.fallbackUsed, false);

const referenceBackend = { id: 'dense-reference-test', production: false, solve() {} };
assert.equal(runRuntimePreflight({
  dofCount: 20,
  nnz: 80,
  backendMode: 'production',
  backend: referenceBackend,
}).code, 'PRODUCTION_BACKEND_UNAVAILABLE');

const memoryBlocked = runRuntimePreflight({
  dofCount: 20,
  nnz: 80,
  backendMode: 'dense-reference',
  configuredMemoryLimitBytes: 800,
  availableMemoryBytes: 1000,
});
assert.equal(memoryBlocked.memory.availableLimitBytes, 600);
assert.equal(memoryBlocked.memory.hardLimitBytes, 600);
assert.equal(memoryBlocked.code, 'PREFLIGHT_MEMORY_LIMIT_EXCEEDED');

const productionBackend = {
  id: 'test-wasm-sparse',
  production: true,
  matrixClasses: ['spd'],
  preflight({ dofCount }) {
    return { ok: dofCount <= 1000, backendId: this.id };
  },
  solve(_matrix, rhs) {
    return { ok: true, x: Float64Array.from(rhs, (value) => Number(value) / 2) };
  },
};
const productionReady = runRuntimePreflight({
  dofCount: 2,
  nnz: 4,
  backendMode: 'production',
  backend: productionBackend,
});
assert.equal(productionReady.ok, true);
assert.equal(productionReady.backend.backendId, 'test-wasm-sparse');
assert.equal(runRuntimePreflight({
  dofCount: 2,
  nnz: 4,
  backendMode: 'production',
  matrixClass: 'general',
  backend: productionBackend,
}).code, 'BACKEND_MATRIX_CLASS_UNSUPPORTED');
const loadedBackend = await createAvailableWasmSparseBackend({
  loadModule: false,
  createWasmSparseBackend: async () => productionBackend,
});
assert.equal(loadedBackend, productionBackend);

const sharedBuffer = new ArrayBuffer(32);
const viewA = new Float64Array(sharedBuffer, 0, 2);
const viewB = new Int32Array(sharedBuffer, 16, 2);
viewA.set([3, 4]);
const transferables = collectTransferables({ viewA, nested: [viewB, viewA] });
assert.deepEqual(transferables, [sharedBuffer], 'shared typed-array buffers must be transferred once');
const transferredClone = structuredClone({ viewA, viewB }, { transfer: transferables });
assert.equal(sharedBuffer.byteLength, 0);
assert.deepEqual(Array.from(transferredClone.viewA), [3, 4]);

await verifyPureWorkerCore();
await verifyBuiltInBackendDispatch(productionBackend);
await verifyWorkerThreadClient();
await verifyAnalysisWorkerBackendSelection();

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-WORKER-01', 'NL-WORKER-02', 'NL-WORKER-03', 'NL-WORKER-04', 'NL-WORKER-05', 'NL-WORKER-06'],
  memoryEstimateBytes: estimate.totalBytes,
  denseReferenceLimit: DENSE_REFERENCE_MAX_DOF,
  jsSparseReferenceLimit: JS_SPARSE_REFERENCE_MAX_DOF,
}, null, 2));

async function verifyPureWorkerCore() {
  const events = [];
  let committedState = 0;
  let releaseBoundary;
  const boundaryGate = new Promise((resolveGate) => {
    releaseBoundary = resolveGate;
  });
  const core = createWorkerCore({
    postMessage(message, transfer) {
      events.push({ message, transfer });
    },
    async taskHandler(task, context) {
      if (task.type === 'ORDER_TEST') {
        context.reportProgress({ step: 1 });
        await context.yieldControl();
        context.reportProgress({ step: 2 });
        context.commitBoundary(() => {
          committedState = 1;
        });
        return { values: Float64Array.from([2, 4, 6]) };
      }
      if (task.type === 'CANCEL_TEST') {
        context.commitBoundary(() => {
          committedState = 10;
        });
        context.reportProgress({ step: 1 });
        await boundaryGate;
        context.commitBoundary(() => {
          committedState = 20;
        });
        return null;
      }
      throw Object.assign(new Error(`Unexpected task ${task.type}`), { code: 'TEST_TASK_UNEXPECTED' });
    },
  });

  const orderedResult = await core.handleMessage(createRunRequest({
    requestId: 'pure-order-request',
    runToken: 'pure-order-token',
    task: { type: 'ORDER_TEST', payload: null },
  }));
  assert.equal(orderedResult.ok, true);
  const orderedEvents = events.filter(({ message }) => message.runToken === 'pure-order-token');
  assert.deepEqual(orderedEvents.map(({ message }) => message.type), [
    WORKER_RESPONSE_TYPES.accepted,
    WORKER_RESPONSE_TYPES.progress,
    WORKER_RESPONSE_TYPES.progress,
    WORKER_RESPONSE_TYPES.result,
  ]);
  assert.deepEqual(orderedEvents.map(({ message }) => message.sequence), [0, 1, 2, 3]);
  assert.deepEqual(
    orderedEvents.filter(({ message }) => message.type === WORKER_RESPONSE_TYPES.progress).map(({ message }) => message.progressSequence),
    [1, 2],
  );
  const resultEvent = orderedEvents.at(-1);
  assert.ok(resultEvent.message.result.values instanceof Float64Array);
  assert.deepEqual(resultEvent.transfer, [resultEvent.message.result.values.buffer]);
  assert.equal(committedState, 1);

  const running = core.handleMessage(createRunRequest({
    requestId: 'pure-cancel-run-request',
    runToken: 'pure-cancel-token',
    task: { type: 'CANCEL_TEST', payload: null },
  }));
  await waitFor(() => events.some(({ message }) => (
    message.runToken === 'pure-cancel-token' && message.type === WORKER_RESPONSE_TYPES.progress
  )));
  const acknowledgement = await core.handleMessage(createCancelRequest({
    requestId: 'pure-cancel-request',
    runToken: 'pure-cancel-token',
  }));
  assert.equal(acknowledgement.acknowledged, true);
  const ackEvent = events.find(({ message }) => message.requestId === 'pure-cancel-request');
  assert.equal(ackEvent.message.type, WORKER_RESPONSE_TYPES.cancelAcknowledged);
  assert.equal(ackEvent.message.effectiveAt, 'committed-boundary');
  releaseBoundary();
  const cancelled = await running;
  assert.equal(cancelled.code, 'CANCELLED');
  assert.equal(committedState, 10, 'cancelled trial must not cross the next committed boundary');
  const cancelEvents = events.filter(({ message }) => message.runToken === 'pure-cancel-token');
  assert.deepEqual(cancelEvents.map(({ message }) => message.sequence), [0, 1, 2, 3]);
  assert.equal(cancelEvents.at(-1).message.type, WORKER_RESPONSE_TYPES.cancelled);
  assert.equal(cancelEvents.at(-1).message.committedBoundary, 1);
  assert.equal(cancelEvents.at(-1).message.discardedUncommitted, true);

  const staleCancel = await core.handleMessage(createCancelRequest({
    requestId: 'pure-stale-cancel-request',
    runToken: 'pure-cancel-token',
  }));
  assert.equal(staleCancel.code, 'STALE_RUN_TOKEN');
  const staleRun = await core.handleMessage(createRunRequest({
    requestId: 'pure-stale-run-request',
    runToken: 'pure-cancel-token',
    task: { type: 'ORDER_TEST', payload: null },
  }));
  assert.equal(staleRun.code, 'STALE_RUN_TOKEN');
}

async function verifyBuiltInBackendDispatch(backend) {
  const events = [];
  const core = createWorkerCore({
    backend,
    postMessage(message, transfer) {
      events.push({ message, transfer });
    },
  });
  const solved = await core.handleMessage(createRunRequest({
    requestId: 'solve-request',
    runToken: 'solve-token',
    task: {
      type: 'SOLVE_SYSTEM',
      payload: {
        matrix: [[2, 0], [0, 2]],
        rhs: Float64Array.from([4, 8]),
        options: { production: true, matrixClass: 'spd' },
      },
    },
    preflight: { dofCount: 2, nnz: 2, backendMode: 'production' },
  }));
  assert.equal(solved.ok, true);
  assert.deepEqual(Array.from(solved.result.x), [2, 4]);
  assert.equal(events[0].message.type, WORKER_RESPONSE_TYPES.accepted);
  assert.equal(events.at(-1).message.committedBoundary, 1);
  assert.deepEqual(events.at(-1).transfer, [events.at(-1).message.result.x.buffer]);

  const echoValues = Float64Array.from([7, 9]);
  const echoed = await core.handleMessage(createRunRequest({
    requestId: 'echo-request',
    runToken: 'echo-token',
    task: { type: 'ECHO', payload: { values: echoValues } },
  }));
  assert.equal(echoed.ok, true);
  assert.equal(echoed.result.values, echoValues);
  const echoResult = events.find(({ message }) => (
    message.runToken === 'echo-token' && message.type === WORKER_RESPONSE_TYPES.result
  ));
  assert.deepEqual(echoResult.transfer, [echoValues.buffer]);

  const unavailableEvents = [];
  const unavailableCore = createWorkerCore({
    postMessage(message) {
      unavailableEvents.push(message);
    },
  });
  const unavailable = await unavailableCore.handleMessage(createRunRequest({
    requestId: 'unavailable-request',
    runToken: 'unavailable-token',
    task: {
      type: 'SOLVE_SYSTEM',
      payload: { matrix: [[1]], rhs: Float64Array.from([1]), options: { production: true } },
    },
  }));
  assert.equal(unavailable.code, 'PRODUCTION_BACKEND_UNAVAILABLE');
  assert.equal(unavailableEvents.length, 1);
  assert.equal(unavailableEvents[0].type, WORKER_RESPONSE_TYPES.error);
  assert.equal(unavailableEvents[0].code, 'PRODUCTION_BACKEND_UNAVAILABLE');
  assert.equal(unavailableEvents[0].preflight.backend.fallbackUsed, false);

  const noBackendEchoEvents = [];
  const noBackendEchoCore = createWorkerCore({
    postMessage(message) {
      noBackendEchoEvents.push(message);
    },
  });
  const noBackendEcho = await noBackendEchoCore.handleMessage(createRunRequest({
    requestId: 'no-backend-echo-request',
    runToken: 'no-backend-echo-token',
    task: { type: 'ECHO', payload: 'not-dispatched' },
  }));
  assert.equal(noBackendEcho.code, 'WORKER_TASK_HANDLER_UNAVAILABLE');
  assert.deepEqual(noBackendEchoEvents.map((message) => message.type), [
    WORKER_RESPONSE_TYPES.accepted,
    WORKER_RESPONSE_TYPES.error,
  ]);
}

async function verifyWorkerThreadClient() {
  const coreUrl = pathToFileURL(resolve('src/nonlinear/runtime/workerCore.js')).href;
  const workerSource = String.raw`
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const { createWorkerCore } = await import(workerData.coreUrl);
      const backend = {
        id: 'thread-wasm-backend',
        production: true,
        matrixClasses: ['spd'],
        preflight() { return { ok: true, backendId: this.id }; },
        solve(_matrix, rhs) { return { ok: true, x: Float64Array.from(rhs) }; },
      };
      const core = createWorkerCore({
        backend,
        postMessage(message, transfer) { parentPort.postMessage(message, transfer); },
        async taskHandler(task, context) {
          if (task.type === 'COUNT') {
            const output = Float64Array.from(task.payload.input, (value) => Number(value) * 2);
            for (let step = 1; step <= task.payload.steps; step += 1) {
              await new Promise((resolveDelay) => setTimeout(resolveDelay, task.payload.delayMs));
              context.commitBoundary();
              context.reportProgress({ step });
            }
            return { output };
          }
          if (task.type === 'CANCEL_TEST') {
            context.commitBoundary();
            context.reportProgress({ step: 1 });
            await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
            context.commitBoundary();
            return { shouldNotCommit: true };
          }
          throw Object.assign(new Error('Unknown test task.'), { code: 'TEST_TASK_UNKNOWN' });
        },
      });
      parentPort.on('message', (message) => { void core.handleMessage(message); });
    })().catch((error) => { setImmediate(() => { throw error; }); });
  `;
  const client = createWorkerClient({
    workerFactory: () => new Worker(workerSource, { eval: true, workerData: { coreUrl } }),
  });
  try {
    const input = Float64Array.from([1, 2, 3, 4]);
    const progress = [];
    let mainThreadTicks = 0;
    const timer = setInterval(() => {
      mainThreadTicks += 1;
    }, 2);
    const result = await client.run('COUNT', {
      input,
      steps: 3,
      delayMs: 15,
    }, {
      requestId: 'thread-count-request',
      runToken: 'thread-count-token',
      preflight: { dofCount: 4, nnz: 8, backendMode: 'production' },
      onProgress(value) {
        progress.push(value.step);
      },
    });
    clearInterval(timer);
    assert.equal(input.byteLength, 0, 'client must transfer typed-array ownership to the worker');
    assert.ok(mainThreadTicks >= 5, `main thread made only ${mainThreadTicks} timer ticks`);
    assert.deepEqual(progress, [1, 2, 3]);
    assert.ok(result.output instanceof Float64Array);
    assert.deepEqual(Array.from(result.output), [2, 4, 6, 8]);

    let cancelAcknowledgement = null;
    const cancelRun = client.run('CANCEL_TEST', null, {
      requestId: 'thread-cancel-run-request',
      runToken: 'thread-cancel-token',
      onProgress() {
        cancelAcknowledgement ||= client.cancel('thread-cancel-token', { requestId: 'thread-cancel-request' });
      },
    });
    const cancellationRejection = assert.rejects(
      cancelRun,
      (error) => error.code === 'CANCELLED' && error.committedBoundary === 1,
    );
    await waitFor(() => cancelAcknowledgement !== null);
    const ack = await cancelAcknowledgement;
    assert.equal(ack.type, WORKER_RESPONSE_TYPES.cancelAcknowledged);
    assert.equal(ack.accepted, true);
    await cancellationRejection;

    await assert.rejects(
      client.run('COUNT', { input: Float64Array.from([1]), steps: 1, delayMs: 1 }, {
        requestId: 'thread-stale-run-request',
        runToken: 'thread-cancel-token',
      }),
      (error) => error.code === 'STALE_RUN_TOKEN',
    );
  } finally {
    await Promise.resolve(client.dispose());
  }
}

async function verifyAnalysisWorkerBackendSelection() {
  const workerUrl = new URL('../src/nonlinear/runtime/analysisWorker.js', import.meta.url).href;
  const defaultClient = createWorkerClient({
    workerFactory: () => new Worker(new URL(workerUrl), { type: 'module' }),
  });
  try {
    const result = await defaultClient.run('SOLVE_SYSTEM', {
      matrix: {
        format: 'csr',
        rowCount: 1,
        colCount: 1,
        rowPtr: Uint32Array.from([0, 1]),
        colIdx: Uint32Array.from([0]),
        values: Float64Array.from([2]),
        nnz: 1,
      },
      rhs: Float64Array.from([4]),
      options: { production: true, matrixClass: 'spd' },
    }, {
      requestId: 'default-worker-production-request',
      runToken: 'default-worker-production-token',
      preflight: { dofCount: 1, nnz: 1, backendMode: 'production' },
    });
    assert.equal(result.ok, true, result.reason);
    assert.deepEqual(Array.from(result.x), [2]);
    assert.equal(result.diagnostics.backendId, 'p8-wasm-sparse-v1');
  } finally {
    await Promise.resolve(defaultClient.dispose());
  }

  const workerSource = String.raw`
    const { workerData } = require('node:worker_threads');
    globalThis.createWasmSparseBackend = async () => workerData.backendAvailable ? {
      id: 'injected-analysis-worker-wasm',
      production: true,
      matrixClasses: ['spd'],
      preflight() { return { ok: true, backendId: this.id }; },
      solve(_matrix, rhs) {
        return { ok: true, x: Float64Array.from(rhs, (value) => Number(value) * 3) };
      },
    } : null;
    import(workerData.workerUrl).catch((error) => { setImmediate(() => { throw error; }); });
  `;
  const availableClient = createWorkerClient({
    workerFactory: () => new Worker(workerSource, {
      eval: true,
      workerData: { workerUrl, backendAvailable: true },
    }),
  });
  try {
    const result = await availableClient.run('SOLVE_SYSTEM', {
      matrix: [[1]],
      rhs: Float64Array.from([2]),
      options: { production: true },
    }, {
      requestId: 'available-worker-production-request',
      runToken: 'available-worker-production-token',
      preflight: { dofCount: 1, nnz: 1, backendMode: 'production' },
    });
    assert.deepEqual(Array.from(result.x), [6]);
  } finally {
    await Promise.resolve(availableClient.dispose());
  }

  const unavailableClient = createWorkerClient({
    workerFactory: () => new Worker(workerSource, {
      eval: true,
      workerData: { workerUrl, backendAvailable: false },
    }),
  });
  try {
    await assert.rejects(
      unavailableClient.run('SOLVE_SYSTEM', {
        matrix: [[1]],
        rhs: Float64Array.from([1]),
        options: { production: true },
      }, {
        requestId: 'default-worker-production-request',
        runToken: 'default-worker-production-token',
        preflight: { dofCount: 1, nnz: 1, backendMode: 'production' },
      }),
      (error) => error.code === 'PRODUCTION_BACKEND_UNAVAILABLE' && error.preflight.backend.fallbackUsed === false,
    );
  } finally {
    await Promise.resolve(unavailableClient.dispose());
  }
}

async function waitFor(predicate, timeoutMs = 2000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('Timed out waiting for worker test condition.');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2));
  }
}
