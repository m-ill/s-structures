import assert from 'node:assert/strict';
import {
  GRAVITY_PRELOAD_VERSION,
  MDOF_DISPLACEMENT_CONTROL_VERSION,
  NONLINEAR_ENGINE_IDS,
  NONLINEAR_INITIAL_STATE_VERSION,
  PRODUCTION_PUSHOVER_RESULT_VERSION,
  PRODUCTION_PUSHOVER_VERSION,
  PUSHOVER_LOAD_PATTERN_VERSION,
  buildPushoverLateralPattern,
  createAnalysisCase,
  createModel,
  getNonlinearCapability,
  resolvePhysicalControlCoordinate,
  runAnalysisCase,
  runAnalysisCaseAsync,
  runNonlinearAnalysisCase,
  runNonlinearAnalysisCaseAsync,
  runProductionPushover,
  runPushover,
  validateNonlinearInitialStateDependency,
} from '../src/index.js';

const model = frameModel();
const capability = getNonlinearCapability(NONLINEAR_ENGINE_IDS.productionPushover);
assert.equal(capability.available, true);
assert.equal(capability.production, true);
assert.equal(capability.qualification, 'candidate');
assert.equal(capability.executionMode, 'async');
assert.deepEqual(capability.supportedControls, ['displacement', 'arcLength']);

assert.equal(typeof buildPushoverLateralPattern, 'function');
assert.equal(typeof resolvePhysicalControlCoordinate, 'function');
assert.equal(typeof validateNonlinearInitialStateDependency, 'function');
assert.equal(typeof runProductionPushover, 'function');
assert.match(MDOF_DISPLACEMENT_CONTROL_VERSION, /^p8-m5-/);
assert.match(PUSHOVER_LOAD_PATTERN_VERSION, /^p8-m5-/);
assert.match(NONLINEAR_INITIAL_STATE_VERSION, /^p8-m5-/);
assert.match(GRAVITY_PRELOAD_VERSION, /^p8-m5-/);
assert.match(PRODUCTION_PUSHOVER_RESULT_VERSION, /^p8-m7-/);
assert.match(PRODUCTION_PUSHOVER_VERSION, /^p8-m7-/);

const directLegacy = runPushover(model, {
  controlNodeId: 'N2', direction: '+x', referenceBaseShear: 20, maxLoadFactor: 1, steps: 1,
});
assert.equal(directLegacy.engine.id, NONLINEAR_ENGINE_IDS.legacyPushover);
assert.equal(directLegacy.qualification, 'legacy-preliminary');

const legacyCase = createAnalysisCase({
  id: 'P8-M5-LEGACY-SYNC',
  kind: 'pushover',
  settings: { control: 'load-factor', controlNodeId: 'N2', direction: '+x', referenceBaseShear: 20, steps: 1 },
});
const legacyHandle = runAnalysisCase(model, legacyCase);
assert.equal(typeof legacyHandle?.then, 'undefined', 'legacy analysis runner must remain synchronous');
assert.equal(legacyHandle.engine.id, NONLINEAR_ENGINE_IDS.legacyPushover);

const productionCase = createAnalysisCase({
  id: 'P8-M5-PRODUCTION-ASYNC',
  kind: 'pushover',
  engineId: NONLINEAR_ENGINE_IDS.productionPushover,
  settings: { control: 'displacement', targetDisplacement: 0.02 },
  control: { type: 'displacement', nodeId: 'N2', direction: '+x', targetDisplacement: 0.02 },
});
const syncBlocked = runNonlinearAnalysisCase(model, productionCase, productionCase.settings);
assert.equal(typeof syncBlocked?.then, 'undefined', 'sync nonlinear API must not change return type');
assert.equal(syncBlocked.reason, 'NONLINEAR_ASYNC_RUNNER_REQUIRED');
assert.equal(syncBlocked.asyncRequired, true);
assert.equal(syncBlocked.routing.fallbackUsed, false);

let productionCalls = 0;
const adapters = {
  [NONLINEAR_ENGINE_IDS.productionPushover]: async (_model, settings, context) => {
    productionCalls += 1;
    await Promise.resolve();
    assert.equal(settings.requestedControl, 'displacement');
    assert.equal(context.analysisCase.id, productionCase.id);
    return {
      ok: true,
      status: 'ok',
      qualification: 'candidate',
      designBlocked: true,
      modelBound: true,
      engine: { id: NONLINEAR_ENGINE_IDS.productionPushover, version: 'test-adapter-v1' },
      summary: { stepCount: 2, maxBaseShear: 10, maxControlDisplacement: 0.02 },
      curve: [{ step: 0 }, { step: 1 }],
    };
  },
};
const routed = await runNonlinearAnalysisCaseAsync(model, productionCase, productionCase.settings, {
  nonlinearAdapters: adapters,
});
assert.equal(routed.ok, true);
assert.equal(routed.qualification, 'candidate');
assert.equal(routed.routing.requestedEngineId, NONLINEAR_ENGINE_IDS.productionPushover);
assert.equal(routed.routing.executedEngineId, NONLINEAR_ENGINE_IDS.productionPushover);
assert.equal(routed.routing.executionMode, 'async');
assert.equal(routed.routing.fallbackUsed, false);

const defaultAdapterCase = createAnalysisCase({
  id: 'P8-M5-PRODUCTION-DEFAULT-ADAPTER',
  kind: 'pushover',
  engineId: NONLINEAR_ENGINE_IDS.productionPushover,
  settings: { control: 'displacement' },
  control: { type: 'displacement', nodeId: 'N2', direction: '+x' },
});
const defaultAdapterResult = await runNonlinearAnalysisCaseAsync(
  model,
  defaultAdapterCase,
  defaultAdapterCase.settings,
  { backend: { id: 'routing-test-backend' } },
);
assert.equal(defaultAdapterResult.reason, 'PUSHOVER_TARGET_DISPLACEMENT_REQUIRED');
assert.equal(defaultAdapterResult.routing.requestedEngineId, NONLINEAR_ENGINE_IDS.productionPushover);
assert.equal(defaultAdapterResult.routing.executedEngineId, null);
assert.equal(defaultAdapterResult.routing.executionMode, 'async');
assert.equal(defaultAdapterResult.routing.fallbackUsed, false);

const handlePromise = runAnalysisCaseAsync(model, productionCase, { nonlinearAdapters: adapters });
assert.equal(typeof handlePromise.then, 'function');
const productionHandle = await handlePromise;
assert.equal(productionHandle.status, 'ok');
assert.equal(productionHandle.qualification, 'candidate');
assert.equal(productionHandle.engine.id, NONLINEAR_ENGINE_IDS.productionPushover);
assert.equal(productionHandle.routing.executionMode, 'async');
assert.equal(productionCalls, 2);

const controlOnlyCase = createAnalysisCase({
  id: 'P8-M5-CONTROL-ONLY', kind: 'pushover', engineId: NONLINEAR_ENGINE_IDS.productionPushover,
  inputRefs: { gravityCombinationId: 'D1', lateralPattern: { type: 'uniform' } },
  control: { type: 'displacement', nodeId: 'N2', direction: '+x', targetDisplacement: 0.015 },
});
const controlOnly = await runAnalysisCaseAsync(model, controlOnlyCase, {
  nonlinearAdapters: {
    [NONLINEAR_ENGINE_IDS.productionPushover]: async (_model, settings) => ({
      ok: settings.requestedControl === 'displacement'
        && settings.targetDisplacement === 0.015
        && settings.gravityCombinationId === 'D1'
        && settings.pattern === 'uniform',
      status: 'ok', qualification: 'candidate', designBlocked: true, modelBound: true,
      engine: { id: NONLINEAR_ENGINE_IDS.productionPushover, version: 'control-only-test' },
    }),
  },
});
assert.equal(controlOnly.ok, true, JSON.stringify(controlOnly.payload));

console.log(JSON.stringify({
  ok: true,
  legacyEngine: directLegacy.engine.id,
  productionEngine: productionHandle.engine.id,
  productionQualification: capability.qualification,
  syncProductionReason: syncBlocked.reason,
}, null, 2));

function frameModel() {
  const model = createModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4, support: null, mass: [10, 10, 10] },
  ];
  model.members = [{
    id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300',
    localAxis: { roll: 0, strongAxis: 'z' }, releases: { i: 'rigid', j: 'rigid' },
  }];
  model.loadCases = [{ id: 'D', name: 'Dead', type: 'dead' }];
  model.loadCombinations = [{ id: 'D1', name: 'Dead', type: 'service', factors: { D: 1 } }];
  model.loads = [{ id: 'P1', type: 'nodal', node: 'N2', P: 100, dir: '-z', case: 'D' }];
  return model;
}
