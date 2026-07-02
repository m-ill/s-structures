import assert from 'node:assert/strict';
import {
  ELASTIC_EXPANSION_VERSION,
  UNILATERAL_MEMBER_TRACE_VERSION,
  analyzeModel,
  buildAdvancedElasticTrace,
  createModel,
  expandAdvancedLoads,
  validateModel,
} from '../src/index.js';

const model = createModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0, support: 'spring', spring: { kz: 1000000 } },
  ],
  members: [{ id: 'M1', n1: 'A', n2: 'B', matId: 'steel', secId: 'h300' }],
  loads: [{ id: 'L1', type: 'udl-partial', member: 'M1', w: 10, dir: '-z', from: 0.25, to: 0.75, case: 'D' }],
});

assert.equal(validateModel(model).ok, true);
const expanded = expandAdvancedLoads(model.loads, model);
assert.equal(expanded.trace.version, ELASTIC_EXPANSION_VERSION);
assert.equal(expanded.loads.length, 8);
assert.equal(expanded.loads[0].type, 'point');
assert.equal(expanded.loads.reduce((sum, load) => sum + load.P, 0), 20);
assert.equal(expanded.loads[0].sourceRange.from, 0.25);
assert.equal(expanded.trace.features.partialDistributed, 1);
assert.equal(expanded.trace.features.springSupports, 1);
assert.equal(expanded.trace.supportTrace[0].node, 'B');
assert.equal(expanded.trace.supportTrace[0].spring.kz, 1000000);
assert.equal(expanded.trace.loadTrace[0].expandedPointCount, 8);
assert.equal(expanded.trace.handcalc[0].method, 'segmented-fixed-end-equivalent-point-loads');
assert.equal(expanded.trace.handcalc[0].totalLoad, 20);

const result = analyzeModel(model);
assert.equal(result.ok, true);
assert.equal(result.byCombo.CO1.elasticExpansion.version, ELASTIC_EXPANSION_VERSION);
assert.equal(result.byCombo.CO1.elasticExpansion.features.springSupports, 1);
assert.ok(result.byCombo.CO1.reactions.B);
const partialXs = result.byCombo.CO1.memberResults.M1.xs;
assert.ok(partialXs.some((x) => Math.abs(x - 1) < 1e-6));
assert.ok(partialXs.some((x) => Math.abs(x - 3) < 1e-6));

const settlementModel = createModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0, support: 'spring', spring: { kz: 1000000 }, settlement: { uz: -0.01 } },
  ],
  members: [{ id: 'M1', n1: 'A', n2: 'B', matId: 'steel', secId: 'h300' }],
});
const settlementExpanded = expandAdvancedLoads(settlementModel.loads, settlementModel);
assert.equal(settlementExpanded.trace.features.settlements, 1);
assert.equal(settlementExpanded.trace.supportTrace[0].settlement.uz, -0.01);
const settlementResult = analyzeModel(settlementModel);
assert.equal(settlementResult.ok, true);
assert.ok(Number.isFinite(settlementResult.byCombo.CO1.reactions.B.rz));

const badRange = createModel({
  ...model,
  loads: [{ ...model.loads[0], from: 0.8, to: 0.2 }],
});
assert.equal(validateModel(badRange).ok, false);

const unsupportedEffect = createModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0, support: 'fixed' },
  ],
  members: [{ id: 'M1', n1: 'A', n2: 'B', matId: 'steel', secId: 'h300' }],
  loads: [{ id: 'T1', type: 'temperature', member: 'M1', dT: 20, case: 'D' }],
});
assert.equal(validateModel(unsupportedEffect).ok, true);
const thermalResult = analyzeModel(unsupportedEffect);
assert.equal(thermalResult.ok, true);
assert.ok(Math.abs(thermalResult.byCombo.CO1.reactions.A.rx) > 0);
const thermalCalc = thermalResult.byCombo.CO1.elasticExpansion.handcalc.find((row) => row.type === 'temperature');
assert.equal(thermalCalc.method, 'N=E*A*alpha*dT');
assert.ok(thermalCalc.axialForce > 0);

const gradientModel = createModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0, support: 'fixed' },
  ],
  members: [{ id: 'M1', n1: 'A', n2: 'B', matId: 'steel', secId: 'h300' }],
  loads: [{ id: 'TG1', type: 'tgradient', member: 'M1', dTtop: 30, dTbot: 10, h: 0.3, case: 'D' }],
});
const gradientResult = analyzeModel(gradientModel);
assert.equal(gradientResult.ok, true);
const gradientCalc = gradientResult.byCombo.CO1.elasticExpansion.handcalc.find((row) => row.type === 'tgradient');
assert.equal(gradientCalc.method, 'M=E*Iz*alpha*(dTtop-dTbot)/h');
assert.ok(Number.isFinite(gradientCalc.moment));

const memberMomentModel = createModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0, support: 'fixed' },
  ],
  members: [{ id: 'M1', n1: 'A', n2: 'B', matId: 'steel', secId: 'h300' }],
  loads: [{ id: 'MM1', type: 'mmoment', member: 'M1', M: 12, axis: 'z', at: 0.5, case: 'D' }],
});
const memberMomentResult = analyzeModel(memberMomentModel);
assert.equal(memberMomentResult.ok, true);
const momentMember = memberMomentResult.byCombo.CO1.memberResults.M1;
assert.ok(momentMember.Mz.every(Number.isFinite));
assert.ok(momentMember.xs.some((x) => Math.abs(x - 2) < 1e-6));
assert.ok(memberMomentResult.byCombo.CO1.elasticExpansion.loadTrace.some((row) => row.type === 'mmoment'));

const trussModel = createModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 3, y: 0, z: 0 },
  ],
  members: [{ id: 'T1', type: 'truss', n1: 'A', n2: 'B', matId: 'steel', secId: 'h300' }],
  loads: [{ id: 'P1', type: 'nodal', node: 'B', P: 10, dir: '+x', case: 'D' }],
});
const trussResult = analyzeModel(trussModel);
assert.equal(trussResult.ok, true);
assert.equal(trussResult.byCombo.CO1.elasticExpansion.features.trussMembers, 1);
assert.ok(trussResult.byCombo.CO1.memberResults.T1.Nmax > 0);

const braceModel = createModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0, support: 'fixed' },
    { id: 'C', x: 0, y: 0, z: 3 },
    { id: 'D', x: 4, y: 0, z: 3 },
  ],
  members: [
    { id: 'C1', n1: 'A', n2: 'C', matId: 'steel', secId: 'h300' },
    { id: 'C2', n1: 'B', n2: 'D', matId: 'steel', secId: 'h300' },
    { id: 'B1', n1: 'C', n2: 'D', matId: 'steel', secId: 'h300' },
    { id: 'X1', type: 'tensionOnly', n1: 'A', n2: 'D', matId: 'steel', secId: 'h300' },
    { id: 'X2', type: 'tensionOnly', n1: 'B', n2: 'C', matId: 'steel', secId: 'h300' },
  ],
  loads: [{ id: 'P1', type: 'nodal', node: 'D', P: 50, dir: '+x', case: 'D' }],
});
const braceResult = analyzeModel(braceModel);
assert.equal(braceResult.ok, true);
const unilateral = braceResult.byCombo.CO1.unilateral;
assert.equal(unilateral.version, 'p3-m11-unilateral-member-iteration');
assert.equal(unilateral.converged, true);
assert.ok(unilateral.iterationCount >= 2);
assert.ok(unilateral.inactiveMemberIds.includes('X2'));
assert.equal(braceResult.byCombo.CO1.memberResults.X2, undefined);
const braceTrace = buildAdvancedElasticTrace(braceModel, braceResult);
assert.equal(braceTrace.unilateral.version, UNILATERAL_MEMBER_TRACE_VERSION);
assert.equal(braceTrace.unilateral.comboCount, braceModel.loadCombinations.length);
assert.equal(braceTrace.unilateral.convergedCount, braceModel.loadCombinations.length);
assert.ok(braceTrace.summary.unilateralInactiveMemberCount >= 1);
const limitedBraceResult = analyzeModel(createModel({
  ...braceModel,
  analysisSettings: { ...braceModel.analysisSettings, unilateralMaxIterations: 1 },
}));
assert.equal(limitedBraceResult.byCombo.CO1.unilateral.converged, false);
assert.equal(limitedBraceResult.byCombo.CO1.memberResults.X2, undefined);
assert.ok(limitedBraceResult.audit.warnings.some((warning) => warning.code === 'UNILATERAL_NOT_CONVERGED'));

const cantilever = createModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0 },
  ],
  members: [{ id: 'M1', n1: 'A', n2: 'B', matId: 'steel', secId: 'h300' }],
  loads: [{ id: 'P1', type: 'nodal', node: 'B', P: 10, dir: '-z', case: 'D' }],
});
const clearSpan = createModel({ ...cantilever, members: [{ ...cantilever.members[0], endOffset: { i: 0.5, j: 0.5 } }] });
const cantileverResult = analyzeModel(cantilever);
const clearSpanResult = analyzeModel(clearSpan);
assert.equal(clearSpanResult.ok, true);
assert.equal(expandAdvancedLoads(clearSpan.loads, clearSpan).trace.features.memberOffsets, 1);
assert.ok(clearSpanResult.byCombo.CO1.summary.maxDisplacement < cantileverResult.byCombo.CO1.summary.maxDisplacement);

console.log(JSON.stringify({ ok: true, version: 'p3-m11-elastic-expansion' }, null, 2));
