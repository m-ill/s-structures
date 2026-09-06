import assert from 'node:assert/strict';
import { analyzeModel } from '../src/solver/linear3d.js';
import {
  classifyElasticFactorGroups,
  createCscFromTriplets,
  createElasticFactorSession,
  elasticPhysicalParityHash,
  executeProductionElastic,
  factorIncompleteCholesky,
  solveIccg,
} from '../src/compute/index.js';
import { p9M1CantileverModel } from './helpers/p9M1Fixture.mjs';
import { buildConstraintSystem } from '../src/solver/domain/constraintSystem.js';
import { resolvePhysicalControlCoordinate } from '../src/nonlinear/equilibrium/displacementControl.js';
import { buildPushoverLateralPattern } from '../src/nonlinear/pushover/loadPatterns.js';

const model = twoCombinationModel();
const legacy = analyzeModel(model);
const progress = [];
const boundaries = [];
const production = await executeProductionElastic({ model }, {
  signal: { aborted: false },
  throwIfCancelled() {},
  reportProgress(row) { progress.push(row); },
  commitBoundary(row) { boundaries.push(row); },
  yieldControl() { return Promise.resolve(); },
});

assert.equal(production.result.ok, legacy.ok, 'P9-ELA-03 overall status parity');
assert.equal(production.factorPlan.groupCount, 1, 'P9-ELA-01 common linear stiffness group');
assert.equal(production.execution.factorizationCount, 1, 'P9-PERF-01 one numeric factorization');
assert.equal(production.execution.solveCount, 2, 'P9-ELA-03 two RHS channels');
assert.equal(production.execution.reusedSolveCount, 1, 'P9-ELA-04 prepared factor reuse');
assert.equal(production.execution.resourceBalanced, true, 'P9-PERF-04 factor resources balanced');
assert.equal(production.resultSlices.length, 2, 'P9-API-04 bounded combination result slices');
assert.equal(boundaries.filter((row) => row.stage === 'combination-complete').length, 2);
assert.ok(progress.every((row, index) => index === 0 || row.value >= progress[index - 1].value), 'P9-ELA-13 monotonic progress');

compareElasticChannels(production.result, legacy, {
  displacementAbsolute: 1e-10,
  forceAbsolute: 1e-8,
  ratioAbsolute: 1e-10,
});
assert.deepEqual(
  production.result.combinationCompleteness,
  legacy.combinationCompleteness,
  'P9-ELA-05 combination completeness parity',
);
assert.equal(production.result.design?.summary?.ok, legacy.design?.summary?.ok, 'P9-ELA-07 design status parity');
assert.equal(production.result.designEligibility?.status, legacy.designEligibility?.status, 'P9-ELA-08 design eligibility parity');
assert.equal(production.result.audit?.ok, legacy.audit?.ok, 'P9-ELA-06 audit parity');
assert.match(production.resultHash, /^[a-f0-9]{64}$/, 'P9-API-06 physical result hash');
assert.equal(production.resultHash, elasticPhysicalParityHash(production.result));

const bounded = await executeProductionElastic({ model, retainDetailedCombinations: false }, noOpContext());
assert.equal(bounded.result.combinationStorage.mode, 'bounded-slices', 'P9-PERF-03 bounded result storage');
compareNumericTree(bounded.result.envelope, legacy.envelope, 1e-8, 'bounded.envelope');
assert.equal(bounded.result.design?.summary?.ok, legacy.design?.summary?.ok, 'P9-ELA-08 bounded design parity');

const spd = createCscFromTriplets(3, 3, [
  [0, 0, 4], [0, 1, 1], [1, 0, 1], [1, 1, 3], [1, 2, 1], [2, 1, 1], [2, 2, 2],
]);
const ic = factorIncompleteCholesky(spd);
const iccg = solveIccg(ic, [1, 2, 3], { tolerance: 1e-12 });
assert.equal(iccg.ok, true, 'P9-PERF-02 IC(0)-PCG solve');
assert.ok(iccg.diagnostics.relativeResidual <= 1e-12);

const disconnectedSession = createElasticFactorSession({ iccgThreshold: 99 });
assert.equal(disconnectedSession.solve([[2]], [2], { groupKey: 'FG1', componentKey: 'A' }).ok, true);
assert.equal(disconnectedSession.solve([[2]], [4], { groupKey: 'FG1', componentKey: 'B' }).ok, true);
const disconnectedSnapshot = disconnectedSession.snapshot();
assert.equal(disconnectedSnapshot.factorizationCount, 2);
assert.equal(disconnectedSnapshot.factorGroupCount, 2, 'factor units include connected components');
assert.equal(disconnectedSnapshot.combinationFactorGroupCount, 1, 'combination factor groups remain distinct');
assert.equal(disconnectedSession.dispose().backend.allocationBalanced, true);

const settlementModel = twoCombinationModel();
settlementModel.nodes[0].settlement = { ux: 0.001 };
const settlementPlan = classifyElasticFactorGroups(settlementModel, settlementModel.loadCombinations);
assert.equal(settlementPlan.groupCount, 1, 'P9-ELA-09 settlement remains RHS-only');
assert.ok(settlementPlan.rows.every((row) => row.settlementAffectsRhsOnly && row.shareable));
const settlement = await executeProductionElastic({ model: settlementModel }, noOpContext());
assert.equal(settlement.execution.factorizationCount, 1, 'P9-ELA-09 settlement factor reuse');

const unilateralModel = twoCombinationModel();
unilateralModel.members[0].behavior = 'tensionOnly';
const unilateralPlan = classifyElasticFactorGroups(unilateralModel, unilateralModel.loadCombinations);
assert.equal(unilateralPlan.groupCount, 2, 'P9-ELA-10 unilateral combinations isolated');
assert.ok(unilateralPlan.rows.every((row) => row.invalidation.includes('unilateral-active-set')));

const directModel = twoCombinationModel();
directModel.analysisSettings.pDeltaMethod = 'direct';
const directPlan = classifyElasticFactorGroups(directModel, directModel.loadCombinations);
assert.equal(directPlan.groupCount, 2, 'P9-ELA-11 Direct P-Delta tangent groups isolated');
assert.ok(directPlan.rows.every((row) => row.invalidation.includes('direct-pdelta-tangent')));

const largeNodes = Array.from({ length: 86 }, (_item, index) => ({
  id: `LN${index}`,
  x: index,
  y: 0,
  z: index === 0 ? 0 : 3,
  ...(index === 0 ? { support: 'fixed' } : {}),
}));
const largeConstraint = buildConstraintSystem(largeNodes);
assert.equal(largeConstraint.storage, 'sparse-rows', 'P9-ELA-12 large constraint storage');
const largeControl = resolvePhysicalControlCoordinate(
  { nodes: largeNodes, constraint: largeConstraint },
  { nodeId: 'LN85', component: 'ux' },
);
assert.equal(largeControl.reducedVector.filter(Boolean).length, 1, 'P9-ELA-12 sparse displacement control row');
const largePattern = buildPushoverLateralPattern({ nodes: largeNodes }, {
  type: 'uniform',
  direction: '+x',
  referenceBaseShear: 10,
  constraint: largeConstraint,
  constraintNodeIds: largeNodes.map((node) => node.id),
});
assert.equal(largePattern.nodes.length, 85, 'P9-ELA-12 sparse Pushover pattern rows');

console.log(JSON.stringify({
  ok: true,
  requirements: ['P9-ELA-01~12', 'P9-API-04', 'P9-API-06', 'P9-PERF-01', 'P9-PERF-04'],
  factorizationCount: production.execution.factorizationCount,
  rhsCount: production.execution.solveCount,
  resultHash: production.resultHash,
}, null, 2));

function twoCombinationModel() {
  const model = p9M1CantileverModel();
  model.loadCombinations = [
    { id: 'C1', name: 'Wind +', type: 'service', factors: { W: 1 } },
    { id: 'C2', name: 'Wind -', type: 'strength', factors: { W: -1.4 } },
  ];
  return model;
}

function noOpContext() {
  return {
    signal: { aborted: false },
    throwIfCancelled() {},
    reportProgress() {},
    commitBoundary() {},
    yieldControl() { return Promise.resolve(); },
  };
}

function compareElasticChannels(actual, expected, tolerances) {
  assert.deepEqual(Object.keys(actual.byCombo), Object.keys(expected.byCombo));
  for (const comboId of Object.keys(expected.byCombo)) {
    const left = actual.byCombo[comboId];
    const right = expected.byCombo[comboId];
    compareNumericTree(left.disp, right.disp, tolerances.displacementAbsolute, `${comboId}.disp`);
    compareNumericTree(left.reactions, right.reactions, tolerances.forceAbsolute, `${comboId}.reactions`);
    compareNumericTree(left.memberResults, right.memberResults, tolerances.forceAbsolute, `${comboId}.memberResults`);
    assert.ok(Math.abs(left.maxRatio - right.maxRatio) <= tolerances.ratioAbsolute, `${comboId}.maxRatio`);
  }
}

function compareNumericTree(actual, expected, tolerance, path) {
  if (typeof expected === 'number') {
    assert.ok(Number.isFinite(actual), `${path}: finite`);
    assert.ok(Math.abs(actual - expected) <= tolerance, `${path}: ${actual} vs ${expected}`);
    return;
  }
  if (expected == null || typeof expected !== 'object') return;
  if (Array.isArray(expected)) {
    assert.equal(actual.length, expected.length, `${path}.length`);
    expected.forEach((value, index) => compareNumericTree(actual[index], value, tolerance, `${path}[${index}]`));
    return;
  }
  for (const [key, value] of Object.entries(expected)) compareNumericTree(actual[key], value, tolerance, `${path}.${key}`);
}
