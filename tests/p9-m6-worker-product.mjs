import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PRODUCTION_EIGEN_BACKEND_ID,
  PRODUCTION_EIGEN_OPERATIONS,
  createEigenAnalysisService,
  createProductionEigenComputeBackend,
  createComputeAnalysisExecutor,
  executeProductionEigen,
  prepareAnalysisContracts,
} from '../src/compute/index.js';

const model = columnModel();
const contracts = prepareAnalysisContracts(model);
const context = {
  signal: { aborted: false },
  throwIfCancelled() {},
  reportProgress() {},
  commitBoundary() {},
  async yieldControl() {},
};
const direct = await executeProductionEigen(PRODUCTION_EIGEN_OPERATIONS.modalRsa, {
  model,
  expectedDomainHash: contracts.domain.domainHash,
}, context);
assert.equal(direct.operation, 'modalRsa');
assert.equal(direct.result.ok, true);
assert.equal(direct.execution.target, 'cpu');
assert.equal(direct.execution.precisionMode, 'f64');
assert.equal(direct.execution.fallbackUsed, false);
assert.equal(direct.result.eigen.diagnostics.fullDenseEigenMatrixAllocated, false);

const backend = createProductionEigenComputeBackend();
assert.equal(backend.id, PRODUCTION_EIGEN_BACKEND_ID);
assert.equal(backend.preflight({ operation: 'modalRsa', matrixClass: 'spd' }).ok, true);
assert.equal(backend.preflight({ operation: 'modalRsa', matrixClass: 'general' }).ok, false);
const executor = createComputeAnalysisExecutor();
const routed = await executor({
  plan: { domainHash: contracts.domain.domainHash },
  operation: { kind: 'modalRsa', backendId: PRODUCTION_EIGEN_BACKEND_ID },
  payload: { model, expectedDomainHash: contracts.domain.domainHash },
}, context);
assert.equal(routed.operation, 'modalRsa');
assert.equal(routed.resultHash, direct.resultHash);

let serviceCall = null;
const fakeClient = {
  activeRunId: null,
  start(plan, operationId, payload, options) {
    serviceCall = { plan, operationId, payload, options };
    return Promise.resolve(serviceCall);
  },
  cancel() { return true; },
  dispose() { return { disposed: true }; },
};
const service = createEigenAnalysisService({ client: fakeClient, backend });
await service.runModalRsa(model, { runId: 'm6-product', computeTarget: 'auto' });
assert.equal(serviceCall.plan.operations[0].backendId, PRODUCTION_EIGEN_BACKEND_ID);
assert.equal(serviceCall.plan.operations[0].kind, 'modalRsa');
assert.equal(serviceCall.plan.operations[0].precision, 'f64');
assert.equal(serviceCall.payload.expectedDomainHash, contracts.domain.domainHash);
await assert.rejects(
  service.runModalRsa(model, { computeTarget: 'gpu' }),
  (error) => error.code === 'EIGEN_GPU_NOT_QUALIFIED',
);
service.dispose();

const modalSource = await readFile(new URL('../src/dynamics/modal.js', import.meta.url), 'utf8');
const bucklingSource = await readFile(new URL('../src/dynamics/globalBuckling.js', import.meta.url), 'utf8');
const eigenSource = await readFile(new URL('../src/compute/eigen/requestedModes.js', import.meta.url), 'utf8');
assert.ok(!modalSource.includes('function choleskyLower'));
assert.ok(!modalSource.includes('function jacobiEigen'));
assert.ok(!bucklingSource.includes('function factorCholesky'));
assert.ok(!bucklingSource.includes('function jacobiSymmetric'));
assert.ok(eigenSource.includes('fullDenseEigenMatrixAllocated: false'));
assert.ok(!eigenSource.includes('cscToDense'));

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['P9-REF-06', 'P9-FR-ELA-06'],
  backendId: PRODUCTION_EIGEN_BACKEND_ID,
  workerOperation: routed.operation,
  resultHash: routed.resultHash,
  gpuFailClosed: true,
}, null, 2));

function columnModel() {
  return {
    units: { length: 'm', force: 'kN', moment: 'kN.m' },
    materials: [{ id: 'MAT', E: 200000000, G: 77000000, density: 0 }],
    sections: [{ id: 'SEC', A: 0.01, Iy: 5e-6, Iz: 8e-6, J: 1e-6 }],
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 0, y: 0, z: 4, mass: [10, 0, 0] },
    ],
    members: [{ id: 'C1', type: 'frame', n1: 'N0', n2: 'N1', matId: 'MAT', secId: 'SEC' }],
    analysisSettings: {
      modalModeCount: 1,
      responseSpectrum: {
        enabled: true,
        method: 'SRSS',
        directions: ['x'],
        scale: 1,
        points: [{ period: 0, sa: 1 }, { period: 10, sa: 1 }],
      },
    },
  };
}
