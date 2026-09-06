import assert from 'node:assert/strict';
import {
  PHASE9_BASELINE_CONTRACT_VERSION,
  PHASE9_BASELINE_VERIFICATION_IDS,
  PHASE9_CODE_OWNERS,
  PHASE9_DEBT_ROWS,
  buildPhase9BaselineCatalog,
  buildPhase9DebtRegistry,
  validatePhase9DebtRegistry,
} from '../src/compute/governance/phase9Baseline.js';
import {
  PHASE9_FIXTURE_GENERATOR_VERSION,
  PHASE9_GRID_FIXTURE_SPECS,
  createPhase9GridFixture,
} from '../src/compute/governance/phase9Fixtures.js';

assert.equal(PHASE9_BASELINE_CONTRACT_VERSION, 'p9-m0-baseline-contract-v1');
assert.equal(PHASE9_FIXTURE_GENERATOR_VERSION, 'p9-m0-grid-fixture-v1');
assert.deepEqual(PHASE9_GRID_FIXTURE_SPECS.map((row) => row.tier), ['S', 'M', 'L']);
assert.equal(PHASE9_BASELINE_VERIFICATION_IDS.length, 11);
assert.equal(new Set(PHASE9_BASELINE_VERIFICATION_IDS).size, 11);
assert.equal(PHASE9_CODE_OWNERS.length, 10);
assert.equal(PHASE9_DEBT_ROWS.length, 12);

const ownerIds = new Set(PHASE9_CODE_OWNERS.map((row) => row.id));
for (const row of PHASE9_DEBT_ROWS) {
  assert.ok(ownerIds.has(row.owner), `Unknown owner for ${row.id}`);
  assert.match(row.targetMilestone, /^P9-M(?:[1-9]|10)$/);
  assert.ok(row.currentPaths.length > 0);
  assert.ok(row.replacement.length > 20);
}

const smallA = createPhase9GridFixture('S');
const smallB = createPhase9GridFixture('s');
assert.equal(smallA.inputHash, smallB.inputHash);
assert.deepEqual(smallA.summary, {
  tier: 'S',
  nodeCount: 64,
  memberCount: 174,
  loadCount: 32,
  combinationCount: 10,
  fixedNodeCount: 16,
  activeDof: 288,
});
assert.equal(new Set(smallA.model.members.map((row) => [row.n1, row.n2].sort().join('|'))).size, smallA.model.members.length);
assert.equal(smallA.model.analysisCriteria.criteria.audit.equilibriumRelative, 1e-6);

const medium = createPhase9GridFixture('M');
assert.equal(medium.summary.nodeCount, 1521);
assert.equal(medium.summary.memberCount, 8456);
assert.equal(medium.summary.activeDof, 8112);
assert.equal(medium.config.execution, 'materialize-and-preflight-only');

const catalog = buildPhase9BaselineCatalog([{ tier: 'S', inputHash: smallA.inputHash }]);
assert.equal(catalog.precision.canonical, 'f64');
assert.equal(catalog.precision.gpuQualification, 'G0');
assert.equal(catalog.nonlinearRegressionPolicy.rerun, false);

const registry = buildPhase9DebtRegistry({
  generatedAt: '2026-07-15T00:00:00.000Z',
  sourceRevision: 'test-revision',
  inventories: Object.fromEntries(PHASE9_DEBT_ROWS.map((row) => [row.id, []])),
});
assert.equal(validatePhase9DebtRegistry(registry).ok, true);
const tampered = structuredClone(registry);
tampered.rows[0].owner = 'unknown';
assert.equal(validatePhase9DebtRegistry(tampered).ok, false);

assert.throws(() => createPhase9GridFixture('XL'), /Unknown Phase 9 fixture tier/);

console.log(JSON.stringify({
  ok: true,
  verificationCount: PHASE9_BASELINE_VERIFICATION_IDS.length,
  ownerCount: PHASE9_CODE_OWNERS.length,
  debtCount: PHASE9_DEBT_ROWS.length,
  deterministicSmallHash: smallA.inputHash,
  mediumActiveDof: medium.summary.activeDof,
}, null, 2));
