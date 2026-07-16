import assert from 'node:assert/strict';
import { createAnalysisProductService } from '../src/compute/product/analysisProductService.js';

const model = {
  meta: { id: 'P9-M9-PRODUCT' },
  nodes: [{ id: 'N1' }, { id: 'N2' }],
  members: [{ id: 'M1', n1: 'N1', n2: 'N2' }],
  analysisCases: [
    { id: 'STATIC-1', kind: 'static', settings: { pDeltaMethod: 'off', comboId: 'D1' } },
    { id: 'STATIC-CANCEL', kind: 'static', settings: { pDeltaMethod: 'off' } },
  ],
};

const service = createAnalysisProductService({
  getModel: () => model,
  environment: {
    webgpuSupported: true,
    workerSupported: true,
    wasmSupported: true,
    secureContext: true,
    hardwareConcurrency: 8,
    deviceMemory: 16,
    browser: 'P9-M9 fixture',
  },
  normalizeSettings: (_kind, settings, input) => ({ ...settings, ...input }),
  async caseRunner(_model, analysisCase, execution = {}) {
    if (analysisCase.id === 'STATIC-CANCEL') {
      await new Promise((resolve, reject) => {
        execution.signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { code: 'CANCELLED' })), { once: true });
      });
    }
    execution.onProgress?.({ value: 0.4, stage: 'solve', message: 'fixture solve' });
    return {
      caseId: analysisCase.id,
      kind: analysisCase.kind,
      ok: true,
      status: 'ok',
      qualification: 'production-cpu-f64',
      designBlocked: false,
      summary: { rowCount: 4 },
      payload: { rows: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], audit: { ok: true } },
    };
  },
});

const capability = service.getCapabilities({ kind: 'static' });
assert.equal(capability.profile.webgpuSupported, true, 'P9-UI-01 hardware profile');
assert.equal(capability.targets.find((row) => row.id === 'auto').available, true, 'P9-UI-02 auto control');
assert.equal(capability.targets.find((row) => row.id === 'cpu').available, true, 'P9-UI-03 CPU precise control');
const gpu = capability.targets.find((row) => row.id === 'gpu');
assert.equal(gpu.available, false, 'P9-UI-04 unsupported GPU disabled');
assert.equal(gpu.reason, 'ELASTIC_GPU_PRODUCTION_QUALIFICATION_PENDING');
assert.ok(gpu.remediation);

const planA = service.plan({ caseId: 'STATIC-1', computeTarget: 'cpu' });
const planB = service.plan({ caseId: 'STATIC-1', computeTarget: 'cpu' });
assert.deepEqual(planA.settingsBytes, planB.settingsBytes, 'P9-API-07 canonical settings bytes');
assert.equal(planA.planHash, planB.planHash, 'P9-API-08 stable plan hash');
assert.equal(planA.operationRoute.executedTarget, 'cpu');
assert.equal(planA.operationRoute.fallbackUsed, false);

const blocked = service.start({ caseId: 'STATIC-1', computeTarget: 'gpu', jobId: 'GPU-BLOCKED' });
assert.equal(blocked.status, 'blocked', 'P9-API-09 explicit GPU fails closed');
assert.equal(blocked.error.code, 'ELASTIC_GPU_PRODUCTION_QUALIFICATION_PENDING');

const retried = service.retry(blocked.id, { computeTarget: 'cpu', jobId: 'GPU-RETRY-CPU' });
await service.wait(retried.id);
const completed = service.getStatus(retried.id);
assert.equal(completed.status, 'completed', 'P9-API-10 retry through qualified route');
assert.equal(completed.executedTarget, 'cpu');
assert.equal(completed.operationRoute.fallbackUsed, false);
assert.equal(completed.progress, 1, 'P9-UI-05 progress completion');

const result = service.getResult(retried.id);
assert.equal(result.productProvenance.planHash, completed.planHash, 'P9-UI-07 result provenance');
assert.equal(result.productProvenance.executedTarget, 'cpu');
assert.deepEqual(result.productProvenance.audit, { ok: true });
const slice = service.getResultSlice(retried.id, { path: 'payload.rows', limit: 2 });
assert.equal(slice.data.length, 2, 'P9-API-11 bounded result slice');
assert.equal(slice.truncated, true);
const report = service.getReport(retried.id);
assert.equal(report.provenance.planHash, completed.planHash, 'P9-API-12 calculation report provenance');
const telemetry = service.exportTelemetry(retried.id, { format: 'json' });
assert.match(telemetry.contentHash, /^[a-f0-9]{64}$/, 'P9-API-13 telemetry integrity');
assert.ok(telemetry.rowCount >= 1);

const cancelling = service.start({ caseId: 'STATIC-CANCEL', computeTarget: 'cpu', jobId: 'CANCEL-ME' });
await Promise.resolve();
const cancelled = service.cancel(cancelling.id);
assert.equal(cancelled.status, 'cancelled', 'P9-UI-06/P9-API-14 cancellation');

console.log(JSON.stringify({
  ok: true,
  requirements: ['P9-UI-01~07', 'P9-API-07~14'],
  capabilityHash: capability.capabilityHash,
  settingsHash: planA.settingsHash,
  planHash: planA.planHash,
  completedJob: completed.id,
  telemetryRows: telemetry.rowCount,
}, null, 2));
