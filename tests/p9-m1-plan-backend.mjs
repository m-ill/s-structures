import assert from 'node:assert/strict';
import { stableHash } from '../src/core/stableHash.js';
import {
  describeComputeBackend,
  preflightComputeBackend,
} from '../src/compute/backends/contract.js';
import {
  createAnalysisExecutionPlan,
  executionSettingsBytes,
  validateAnalysisExecutionPlan,
} from '../src/compute/execution/executionPlan.js';
import { describeEquilibriumBackend } from '../src/nonlinear/equilibrium/referenceBackends.js';
import { p9M1Backend } from './helpers/p9M1Fixture.mjs';

const backend = p9M1Backend();
const settings = { tolerance: 1e-8, iterations: 20 };
const plan = createAnalysisExecutionPlan({
  runId: 'plan-run',
  caseId: 'case-1',
  domainHash: stableHash({ model: 1 }),
  settings,
  backends: [backend],
  operations: [{ id: 'assemble', kind: 'elementBatch', precision: 'f64' }],
  userPolicy: 'cpu',
});
assert.equal(validateAnalysisExecutionPlan(plan).ok, true, 'P9-CMP-07 plan schema');
assert.equal(Object.isFrozen(plan), true, 'P9-CMP-07 immutable plan');
assert.equal(plan.settingsHash, stableHash(Array.from(executionSettingsBytes(settings))), 'P9-API-01 settings byte parity');
assert.equal(plan.operations[0].backendBuildHash, describeComputeBackend(backend).buildHash, 'P9-CMP-08 backend build binding');
assert.equal(plan.fallbackPolicy, 'forbidden', 'P9-CMP-08 fail closed plan');
assert.throws(() => createAnalysisExecutionPlan({
  runId: 'gpu-run',
  caseId: 'case-1',
  domainHash: stableHash({ model: 1 }),
  backends: [backend],
  operations: [{ id: 'assemble', kind: 'elementBatch' }],
  userPolicy: 'gpu',
}), { code: 'GPU_BACKEND_UNAVAILABLE' }, 'P9-CMP-08 no silent GPU fallback');
assert.equal(preflightComputeBackend(backend, { operation: 'missing' }).ok, false, 'P9-CMP-08 unsupported operation blocked');
assert.equal(describeEquilibriumBackend(backend).targetFamily, describeComputeBackend(backend).targetFamily, 'P9-REF-02 shared backend policy');

console.log('P9-M1 ExecutionPlan/Backend contract: PASS');
