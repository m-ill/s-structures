import assert from 'node:assert/strict';
import {
  ANALYSIS_CASE_VERSION,
  LEGACY_PUSHOVER_ENGINE_ID,
  LEGACY_SDOF_NLTH_ENGINE_ID,
  NONLINEAR_REGISTRY_COLLECTIONS,
  SCHEMA_VERSION,
  buildAnalysisDomainHashes,
  changedAnalysisDomainHashes,
  createModel,
  migrateModel,
  validateModel,
} from '../src/index.js';

assert.equal(SCHEMA_VERSION, 5);
assert.equal(ANALYSIS_CASE_VERSION, 'p8-analysis-case-v2');

const v4 = createModel({
  nodes: [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed', customNodeMeta: { owner: 'v4' } },
    { id: 'N2', x: 1, y: 0, z: 3, support: null },
  ],
  members: [{
    id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300',
    releases: { i: 'rigid', j: 'rigid' }, localAxis: { roll: 0, strongAxis: 'z' },
    customMemberMeta: { retained: true },
  }],
  loadCases: [{ id: 'D', name: 'Dead', type: 'dead' }, { id: 'L', name: 'Live', type: 'live' }],
  loadCombinations: [{ id: 'CO1', name: 'Imported v4 unity', type: 'strength', factors: { D: 1, L: 1 }, custom: 'keep' }],
  loads: [{ id: 'P1', type: 'nodal', node: 'N2', P: 10, dir: '-z', case: 'D', customLoadMeta: 7 }],
  analysisCases: [],
});
v4.schemaVersion = 4;
v4.analysisCases = [
  {
    id: 'PO-V4', name: 'Legacy pushover', kind: 'pushover', status: 'ok',
    settings: { steps: 7, control: 'load-factor', nested: { preserve: 1 } },
    input: { factors: { D: 1 } },
    lastRun: { status: 'ok', summary: { maxBaseShear: 12.3 }, customRunMeta: 'keep' },
    customCaseMeta: { keep: true },
  },
  {
    id: 'NLTH-V4', name: 'Legacy SDOF', kind: 'nlth', status: 'not-run',
    settings: { mass: 2, stiffness: 150, accelerations: [0, 0.1, 0] }, input: {}, lastRun: null,
  },
];
for (const key of NONLINEAR_REGISTRY_COLLECTIONS) delete v4[key];

const losslessKeys = [
  'nodes', 'members', 'materials', 'sections', 'loads', 'loadCases', 'loadCombinations',
  'massSources', 'sourceRegistry', 'stories', 'diaphragms', 'designBasis', 'projectSetup',
];
const before = Object.fromEntries(losslessKeys.map((key) => [key, structuredClone(v4[key])]));
const migrated = migrateModel(v4);
assert.equal(migrated.model.schemaVersion, 5);
for (const key of losslessKeys) assert.deepEqual(migrated.model[key], before[key], `v4 ${key} must migrate additively`);
assert.deepEqual(migrated.model.loadCombinations, v4.loadCombinations, 'unmarked v4 CO1 must not be modernized during v5 migration');
for (const key of NONLINEAR_REGISTRY_COLLECTIONS) assert.deepEqual(migrated.model[key], [], `${key} default`);

const migratedPushover = migrated.model.analysisCases.find((item) => item.id === 'PO-V4');
const migratedNlth = migrated.model.analysisCases.find((item) => item.id === 'NLTH-V4');
assert.equal(migratedPushover.engineId, LEGACY_PUSHOVER_ENGINE_ID);
assert.equal(migratedNlth.engineId, LEGACY_SDOF_NLTH_ENGINE_ID);
assert.equal(migratedPushover.migration.automaticProductionUpgrade, false);
assert.deepEqual(migratedPushover.settings, v4.analysisCases[0].settings);
assert.deepEqual(migratedPushover.input, v4.analysisCases[0].input);
assert.deepEqual(migratedPushover.customCaseMeta, v4.analysisCases[0].customCaseMeta);
assert.equal(migratedPushover.lastRun.customRunMeta, 'keep');
assert.deepEqual(migratedPushover.lastRun.summary, v4.analysisCases[0].lastRun.summary);
assert.equal(validateModel(migrated.model).ok, true, JSON.stringify(validateModel(migrated.model).errors, null, 2));

const second = migrateModel(migrated.model);
assert.equal(second.changed, false, 'v5 migration must be idempotent');
assert.deepEqual(second.model, migrated.model);
assert.throws(
  () => migrateModel({ ...migrated.model, schemaVersion: 6 }),
  (error) => error.code === 'FUTURE_SCHEMA_VERSION',
);

const validRegistry = createModel({
  nonlinearMaterials: [{
    id: 'NL-MAT-1', modelId: 'steel-bilinear-v1', parameters: { Fy: 275 }, units: { stress: 'MPa' },
    qualification: 'candidate', contentHash: 'sha256:fixture', source: { sourceId: 'SRC-NIST-01' }, calibration: {},
  }],
  analysisStates: [{
    id: 'STATE-1', caseId: 'CASE-1', runRecordId: 'RUN-1', domainHashes: { domainHash: 'abc' },
    status: 'accepted', immutable: true, checkpointManifestRef: 'checkpoint:1',
  }],
});
assert.equal(validateModel(validRegistry).ok, true);
const invalidState = structuredClone(validRegistry);
invalidState.analysisStates[0].elementStates = [{ id: 'M1' }];
assert.ok(validateModel(invalidState).errors.some((item) => item.code === 'BAD_ANALYSIS_STATE'));
const duplicateRegistry = structuredClone(validRegistry);
duplicateRegistry.nonlinearMaterials.push(structuredClone(duplicateRegistry.nonlinearMaterials[0]));
assert.ok(validateModel(duplicateRegistry).errors.some((item) => item.code === 'DUPLICATE_NONLINEAR_RECORD_ID'));

const hashCase = migratedPushover;
const baseHashes = buildAnalysisDomainHashes(migrated.model, hashCase);
const topologyChanged = structuredClone(migrated.model);
topologyChanged.nodes[1].x += 0.25;
assert.deepEqual(changedAnalysisDomainHashes(baseHashes, buildAnalysisDomainHashes(topologyChanged, hashCase)), ['topologyHash']);
const propertyChanged = structuredClone(migrated.model);
propertyChanged.materials[0].E = Number(propertyChanged.materials[0].E || 200000) * 1.01;
assert.deepEqual(changedAnalysisDomainHashes(baseHashes, buildAnalysisDomainHashes(propertyChanged, hashCase)), ['propertyHash']);
const loadChanged = structuredClone(migrated.model);
loadChanged.loads[0].P *= 2;
assert.deepEqual(changedAnalysisDomainHashes(baseHashes, buildAnalysisDomainHashes(loadChanged, hashCase)), ['loadHash']);
const nonlinearChanged = structuredClone(migrated.model);
nonlinearChanged.hingeProperties.push({ id: 'H1' });
assert.deepEqual(changedAnalysisDomainHashes(baseHashes, buildAnalysisDomainHashes(nonlinearChanged, hashCase)), ['nonlinearHash']);
const outputChanged = { ...hashCase, outputPolicy: { saveEvery: 2 } };
assert.deepEqual(changedAnalysisDomainHashes(baseHashes, buildAnalysisDomainHashes(migrated.model, outputChanged)), ['outputHash']);

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-GOV-04', 'NL-MEI-01'],
  schemaVersion: migrated.model.schemaVersion,
  registries: NONLINEAR_REGISTRY_COLLECTIONS,
  pushoverEngine: migratedPushover.engineId,
  nlthEngine: migratedNlth.engineId,
  domainHash: baseHashes.domainHash,
}, null, 2));
