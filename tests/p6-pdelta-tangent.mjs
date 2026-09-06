import assert from 'node:assert/strict';
import {
  GEOMETRIC_STIFFNESS_VERSION,
  NONLINEAR_COMBO_GUARD_VERSION,
  PDELTA_SECOND_ORDER_VERSION,
  analyzeModel,
  buildAdvancedElasticTrace,
  buildPDeltaTangentStiffness,
  createModel,
  estimateGlobalBucklingTrace,
  guardNonlinearCombinationSuperposition,
  localCompressionGeometricStiffness12,
  localTangentGeometricStiffness12,
  materialOf,
  runSecondOrderPDelta,
  sectionOf,
} from '../src/index.js';

const tangentKg = localTangentGeometricStiffness12(-100, 5);
const bucklingKg = localCompressionGeometricStiffness12(100, 5);
assert.ok(tangentKg[1][1] < 0, 'compression is negative in tension-positive tangent KG');
assert.ok(bucklingKg[1][1] > 0, 'buckling KG keeps compression-positive reference stiffness');

const model = createPDeltaColumnModel();
const linearAnalysis = analyzeModel(model);
assert.equal(linearAnalysis.ok, true, JSON.stringify(linearAnalysis.validation.errors, null, 2));

const tangent = buildPDeltaTangentStiffness(model, {
  results: linearAnalysis.byCombo.CO1.memberResults,
});
assert.equal(tangent.ok, true);
assert.equal(tangent.geometricVersion, GEOMETRIC_STIFFNESS_VERSION);
assert.equal(tangent.summary.compressionMemberCount, 1);
const topUx = tangent.assembly.idx.N2 * 6;
assert.ok(tangent.Kt[topUx][topUx] < tangent.assembly.K[topUx][topUx], 'compression KG should reduce lateral tangent stiffness');

const direct = runSecondOrderPDelta(model, { D: 1, L: 1 }, { loadSteps: 4 });
assert.equal(direct.version, PDELTA_SECOND_ORDER_VERSION);
assert.equal(direct.ok, true, direct.reason);
assert.equal(direct.method, 'geometric-stiffness-second-order-direct');
assert.ok(direct.amplification > 1, 'direct second-order result should amplify sway');
assert.ok(direct.result.summary.maxDisplacement > direct.linear.summary.maxDisplacement);
assert.ok(direct.iterations.length >= 2);
assert.equal(direct.split.version, 'p6-m5-pdelta-split-v1');
assert.equal(direct.split.summary.memberRowCount, 1);

const advanced = buildAdvancedElasticTrace(model, { pDeltaDirect: direct });
assert.equal(advanced.pDelta.direct.version, PDELTA_SECOND_ORDER_VERSION);
assert.equal(advanced.pDelta.direct.method, 'geometric-stiffness-second-order-direct');

const bucklingModel = createPinnedColumnBucklingModel();
const bucklingPreload = analyzeModel(bucklingModel);
assert.equal(bucklingPreload.ok, true, JSON.stringify(bucklingPreload.validation.errors, null, 2));
const buckling = estimateGlobalBucklingTrace(bucklingModel, {
  preloadResult: bucklingPreload,
  preloadCombinationId: 'P',
});
const material = materialOf(bucklingModel, 'steel');
const section = sectionOf(bucklingModel, 'h300');
const reference = (Math.PI ** 2 * material.E * section.Iy) / 3 ** 2;
assert.equal(buckling.status, 'available');
assert.ok(Math.abs(buckling.criticalLoadFactor - reference) / reference < 0.02);
assert.ok(buckling.referenceCompression.length > 0);

const guarded = createPDeltaColumnModel();
guarded.members[0].behavior = 'compressionOnly';
guarded.analysisSettings.pDeltaMethod = 'direct';
const blocked = guardNonlinearCombinationSuperposition(guarded, guarded.loadCombinations[0]);
assert.equal(blocked.version, NONLINEAR_COMBO_GUARD_VERSION);
assert.equal(blocked.blocked, true);
assert.ok(blocked.features.includes('unilateral-members'));
assert.ok(blocked.features.includes('p-delta-second-order'));
assert.ok(blocked.requiredExecution.includes('full factored combination'));

const allowed = guardNonlinearCombinationSuperposition(createPDeltaColumnModel(), { id: 'LIN', factors: { D: 1 } });
assert.equal(allowed.status, 'OK');
assert.equal(allowed.blocked, false);

console.log(JSON.stringify({
  ok: true,
  directVersion: PDELTA_SECOND_ORDER_VERSION,
  amplification: direct.amplification,
  directIterations: direct.iterations.length,
  bucklingError: Math.abs(buckling.criticalLoadFactor - reference) / reference,
  comboGuard: blocked.status,
}, null, 2));

function createPDeltaColumnModel() {
  const model = createModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4, support: null },
  ];
  model.members = [{
    id: 'M1',
    type: 'frame',
    n1: 'N1',
    n2: 'N2',
    matId: 'steel',
    secId: 'h300',
    localAxis: { roll: 0, strongAxis: 'z' },
    releases: { i: 'rigid', j: 'rigid' },
  }];
  model.loadCases = [
    { id: 'D', name: 'Dead', type: 'dead' },
    { id: 'L', name: 'Lateral', type: 'wind' },
  ];
  model.loadCombinations = [{ id: 'CO1', name: 'D + L', type: 'strength', factors: { D: 1, L: 1 } }];
  model.loads = [
    { id: 'P1', type: 'nodal', node: 'N2', P: 80, dir: '-z', case: 'D' },
    { id: 'H1', type: 'nodal', node: 'N2', P: 20, dir: '+x', case: 'L' },
  ];
  return model;
}

function createPinnedColumnBucklingModel() {
  const nodes = Array.from({ length: 9 }, (_item, index) => ({
    id: `N${index}`,
    x: 0,
    y: 0,
    z: (3 * index) / 8,
    support: index === 0 || index === 8 ? 'custom' : undefined,
    fix: index === 0
      ? [true, true, true, false, false, true]
      : index === 8
        ? [true, true, false, false, false, false]
        : undefined,
  }));
  const members = Array.from({ length: 8 }, (_item, index) => ({
    id: `C${index + 1}`,
    n1: `N${index}`,
    n2: `N${index + 1}`,
    matId: 'steel',
    secId: 'h300',
  }));
  return createModel({
    nodes,
    members,
    loadCases: [{ id: 'P', name: 'Unit compression', type: 'dead' }],
    loadCombinations: [{ id: 'P', name: '1.0P', type: 'strength', factors: { P: 1 } }],
    loads: [{ id: 'P-TOP', type: 'nodal', node: 'N8', P: 1, dir: '-z', case: 'P' }],
  });
}
