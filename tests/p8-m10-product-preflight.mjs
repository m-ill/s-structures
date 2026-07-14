import assert from 'node:assert/strict';
import { stableHash, stableStringify } from '../src/core/stableHash.js';
import {
  NONLINEAR_PRODUCT_DEFAULT_HINGE_RULE_VERSION,
  NONLINEAR_PRODUCT_STAGES,
  createNonlinearProductService,
  preflightProductionNonlinearCase,
} from '../src/nonlinear/product/index.js';
import {
  createM10Model,
  createM10NlthCase,
  createM10PushoverCase,
} from './helpers/p8M10Fixture.mjs';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';

const model = createM10Model();
const originalHash = stableHash(model);
const pushoverCase = createM10PushoverCase(model);
const pushover = preflightProductionNonlinearCase(model, pushoverCase, runtimeOptions());
assert.equal(pushover.ok, true, JSON.stringify(pushover.blocking, null, 2));
assert.equal(pushover.analysisCase.engineId, 'p8-production-mdof-pushover');
assert.equal(pushover.analysisCase.settings.control, 'displacement');
assert.equal(pushover.analysisCase.settings.gravityCombinationId, 'GRAV');
assert.equal(pushover.stages.length, 7);
assert.deepEqual(pushover.stages.map((row) => row.id), NONLINEAR_PRODUCT_STAGES.map((row) => row.id));
assert.equal(pushover.stages.find((row) => row.id === 'groundMotion').status, 'not-applicable');
assert.equal(pushover.settingsBytes, stableStringify(pushover.executionSettings));
assert.equal(pushover.settingsHash, pushover.analysisCase.settingsHash);
assert.equal(pushover.runtime.thread.mode, 'module-worker');
assert.equal(pushover.runtime.backend.fallbackPolicy, 'forbidden');
assert.ok(pushover.runtime.dofCount > 0);
assert.ok(pushover.runtime.nnz > 0);
assert.ok(pushover.domainDiff.current.domainHash);
assert.equal(pushover.assignment.preview.status, 'ready');
assert.equal(pushover.assignment.preview.assignments.length, 4);
assert.ok(pushover.assignment.preview.properties.every((row) => row.qualification === 'assumed'));
assert.ok(pushover.assignment.preview.properties.every((row) => row.source.assumption));
assert.equal(stableHash(model), originalHash, 'preview must not mutate the model');

const nlthCase = createM10NlthCase(model);
const nlth = preflightProductionNonlinearCase(model, nlthCase, runtimeOptions());
assert.equal(nlth.ok, true, JSON.stringify(nlth.blocking, null, 2));
assert.equal(nlth.analysisCase.engineId, 'p8-production-mdof-nlth');
assert.equal(nlth.mass.sourceId, 'MS');
assert.equal(nlth.groundMotion.componentCount, 1);
assert.equal(nlth.groundMotion.duration, 0.08);
assert.equal(nlth.runtime.thread.mode, 'module-worker');
assert.equal(nlth.qualification, 'candidate');
assert.equal(nlth.designBlocked, true);

const noProperties = structuredClone(model);
delete noProperties.members[0].nonlinear;
noProperties.hingeProperties = [];
const blocked = preflightProductionNonlinearCase(noProperties, createM10PushoverCase(noProperties), runtimeOptions());
assert.equal(blocked.ok, false);
assert.ok(blocked.blocking.some((row) => row.code === 'NONLINEAR_PROPERTY_ASSIGNMENT_REQUIRED'));
assert.equal(blocked.assignment.preview.status, 'ready');
assert.equal(blocked.assignment.preview.assignments.length, 4);

let replacement = null;
const service = createNonlinearProductService({
  getModel: () => noProperties,
  onReplaceModel: (next) => { replacement = next; },
});
const applied = service.applyAssignments(blocked.assignment.preview);
assert.equal(applied.applied, true);
assert.equal(applied.model.members[0].nonlinear.hinges.length, 4);
assert.equal(applied.model.hingeProperties.length, 2);
assert.equal(replacement.members[0].nonlinear.hinges.length, 4);
assert.equal(noProperties.members[0].nonlinear, undefined, 'transaction result replaces the model explicitly');

const workerBlocked = preflightProductionNonlinearCase(model, pushoverCase, {
  ...runtimeOptions(),
  workerSupported: false,
});
assert.ok(workerBlocked.blocking.some((row) => row.code === 'NONLINEAR_WORKER_UNAVAILABLE'));
assert.equal(workerBlocked.blocking.find((row) => row.code === 'NONLINEAR_WORKER_UNAVAILABLE').stage, 'run');

const legacyHostedModel = structuredClone(model);
for (const key of [
  'schemaVersion',
  'unitSystem',
  'analysisCases',
  'analysisStates',
  'diaphragms',
  'linkProperties',
  'massSources',
  'sourceRegistry',
  'timeHistoryFunctions',
]) delete legacyHostedModel[key];
const legacyBridge = installIndexEngineBridge({ model: () => legacyHostedModel });
const migratedPreflight = legacyBridge.validateProductionNonlinearCase({
  analysisCase: pushoverCase,
  requireWorker: false,
  workerSupported: true,
  wasmSupported: true,
});
assert.equal(legacyHostedModel.schemaVersion, 5);
assert.ok(legacyHostedModel.unitSystem);
assert.ok(['analysisCases', 'analysisStates', 'diaphragms', 'linkProperties', 'massSources', 'sourceRegistry', 'timeHistoryFunctions']
  .every((key) => Array.isArray(legacyHostedModel[key])));
assert.ok(!migratedPreflight.blocking.some((row) => row.code === 'BAD_COLLECTION'));
assert.ok(!migratedPreflight.blocking.some((row) => row.code === 'BAD_SCHEMA_VERSION'));
assert.ok(!migratedPreflight.blocking.some((row) => row.code === 'NO_UNIT_SYSTEM'));

console.log(JSON.stringify({
  ok: true,
  verificationIds: [
    'NL-UI-01', 'NL-UI-02', 'NL-UI-03', 'NL-UI-04',
    'NL-API-01', 'NL-API-02', 'NL-API-08',
  ],
  defaultRuleVersion: NONLINEAR_PRODUCT_DEFAULT_HINGE_RULE_VERSION,
  stages: pushover.stages.map((row) => `${row.id}:${row.status}`),
  pushoverSettingsHash: pushover.settingsHash,
  nlthSettingsHash: nlth.settingsHash,
  runtime: pushover.runtime,
  autoAssignmentCount: blocked.assignment.preview.assignments.length,
  legacyModelSchemaVersion: legacyHostedModel.schemaVersion,
  unsupportedCode: 'NONLINEAR_WORKER_UNAVAILABLE',
}, null, 2));

function runtimeOptions() {
  return {
    requireWorker: true,
    workerSupported: true,
    wasmSupported: true,
    availableMemoryBytes: 2 * 1024 ** 3,
  };
}
