import assert from 'node:assert/strict';
import {
  BASELINE_CONTRACT_VERSION,
  SCHEMA_CONTRACT_VERSION,
  SIGN_CONVENTION_VERSION,
  UNIT_SYSTEM_VERSION,
  buildBaselineContract,
  buildSchemaContract,
  createIndexStartupSampleModel,
  createModel,
  getSignConvention,
  migrateModel,
  normalizeUnitSystem,
  validateModel,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createModel();
assert.equal(model.unitSystem.version, UNIT_SYSTEM_VERSION);
assert.equal(model.unitSystem.internal.force, 'kN');
assert.equal(model.unitSystem.display.displacement, 'mm');

const custom = normalizeUnitSystem({ display: { length: 'm' } }, { force: 'kN' });
assert.equal(custom.version, UNIT_SYSTEM_VERSION);
assert.equal(custom.display.length, 'm');

const legacy = migrateModel({ schemaVersion: 1, nodes: [], members: [], loads: [] });
assert.equal(legacy.model.unitSystem.version, UNIT_SYSTEM_VERSION);
assert.ok(legacy.migrations.some((item) => item.to === 'unitSystem'));

const suspicious = createModel({ unitSystem: { internal: { force: 'N' } } });
const validation = validateModel(suspicious);
assert.ok(validation.warnings.some((item) => item.target === 'unitSystem.internal.force'));

const sign = getSignConvention();
assert.equal(sign.version, SIGN_CONVENTION_VERSION);
assert.ok(sign.memberForces.some((item) => item.includes('M2/M3')));

const schema = buildSchemaContract();
assert.equal(schema.version, SCHEMA_CONTRACT_VERSION);
assert.ok(schema.requiredCollections.includes('loadCombinations'));

const sample = createIndexStartupSampleModel();
const contract = buildBaselineContract(sample);
assert.equal(contract.version, BASELINE_CONTRACT_VERSION);
assert.equal(contract.phase, 'P2-MVP-S1');
assert.equal(contract.unitSystem.version, UNIT_SYSTEM_VERSION);

const agent = createIndexAgentApi({ model: () => sample, reanalyze: () => {} }, {
  getLastResult: () => null,
});
assert.equal(agent.getBaselineContract().version, BASELINE_CONTRACT_VERSION);
assert.ok(agent.getCapabilities().readApis.includes('getBaselineContract'));
assert.equal(agent.getCapabilities().modules.baselineContract, BASELINE_CONTRACT_VERSION);

console.log(JSON.stringify({
  ok: true,
  version: BASELINE_CONTRACT_VERSION,
  unitSystem: UNIT_SYSTEM_VERSION,
  signConvention: SIGN_CONVENTION_VERSION,
}, null, 2));
