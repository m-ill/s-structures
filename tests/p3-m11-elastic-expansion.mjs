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
assert.equal(expanded.trace.contract.milestone, 'P3-M11');
assert.deepEqual(expanded.trace.contract.tickets, ['P3-T68', 'P3-T69', 'P3-T70', 'P3-T71', 'P3-T72']);
assert.ok(expanded.trace.contract.scope.includes('spring-supports'));
assert.ok(expanded.trace.contract.scope.includes('advanced-member-loads'));
assert.equal(expanded.trace.contract.featureTicketMap.springSupports, 'P3-T68');
assert.equal(expanded.trace.contract.featureTicketMap.partialDistributed, 'P3-T71');
assert.ok(expanded.trace.contract.reviewFields.includes('handcalc'));
assert.equal(expanded.trace.contract.signConventionRef, 'src/core/signConvention.js');
assert.ok(expanded.trace.contract.limitations.includes('unilateral-member-state-is-load-combination-specific'));
assert.equal(expanded.loads.length, 8);
assert.equal(expanded.loads[0].type, 'point');
assert.equal(expanded.loads.reduce((sum, load) => sum + load.P, 0), 20);
assert.equal(expanded.loads[0].sourceRange.from, 0.25);
assert.equal(expanded.trace.features.partialDistributed, 1);
assert.equal(expanded.trace.features.springSupports, 1);
assert.equal(expanded.trace.supportTrace[0].node, 'B');
assert.equal(expanded.trace.supportTrace[0].spring.kz, 1000000);
assert.equal(expanded.trace.loadTrace[0].expandedPointCount, 8);
assert.equal(expanded.trace.loadTrace[0].direction, '-z');
assert.equal(expanded.trace.handcalc[0].method, 'segmented-fixed-end-equivalent-point-loads');
assert.equal(expanded.trace.handcalc[0].totalLoad, 20);
assert.deepEqual(expanded.trace.handcalc[0].range, { from: 0.25, to: 0.75 });
assert.equal(expanded.trace.handcalc[0].direction, '-z');
assert.equal(expanded.trace.review.traceReady, true);
assert.equal(expanded.trace.review.settlementForceTraceReady, true);
assert.equal(expanded.trace.review.advancedLoadHandcalcReady, true);
assert.equal(expanded.trace.review.engineerReviewRequired, true);
assert.equal(expanded.trace.review.productionReady, false);
assert.deepEqual(expanded.trace.review.blockers, []);
assert.equal(expanded.trace.review.agentDecision, 'elastic-expansion-ready-for-engineering-review');

const result = analyzeModel(model);
assert.equal(result.ok, true);
assert.equal(result.byCombo.SLS1.elasticExpansion.version, ELASTIC_EXPANSION_VERSION);
assert.equal(result.byCombo.SLS1.elasticExpansion.features.springSupports, 1);
assert.ok(result.byCombo.SLS1.reactions.B);
const partialXs = result.byCombo.SLS1.memberResults.M1.xs;
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
assert.equal(settlementExpanded.trace.supportTrace[0].settlementForce.kz, -10000);
assert.equal(settlementExpanded.trace.review.settlementForceTraceReady, true);
const settlementResult = analyzeModel(settlementModel);
assert.equal(settlementResult.ok, true);
assert.ok(Number.isFinite(settlementResult.byCombo.SLS1.reactions.B.rz));
const invalidSettlementSupport = createModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0, settlement: { uz: -0.01 } },
  ],
  members: [{ id: 'M1', n1: 'A', n2: 'B', matId: 'steel', secId: 'h300' }],
});
const invalidSettlementCheck = validateModel(invalidSettlementSupport);
assert.equal(invalidSettlementCheck.ok, false);
assert.ok(invalidSettlementCheck.errors.some((item) => item.message.includes('Settlement requires fixed or spring support')));

const fixedSettlementModel = createModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0, support: 'fixed', settlement: { uz: -0.01 } },
  ],
  members: [{ id: 'M1', n1: 'A', n2: 'B', matId: 'steel', secId: 'h300' }],
});
assert.equal(validateModel(fixedSettlementModel).ok, true);
const fixedSettlementTrace = expandAdvancedLoads(fixedSettlementModel.loads, fixedSettlementModel).trace;
assert.equal(fixedSettlementTrace.features.settlements, 1);
assert.equal(fixedSettlementTrace.review.settlementForceTraceReady, false);
assert.ok(fixedSettlementTrace.review.blockers.includes('settlement-force-trace-missing'));
assert.equal(fixedSettlementTrace.review.traceReady, false);
assert.equal(fixedSettlementTrace.review.agentDecision, 'fix-elastic-expansion-trace-before-review');

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
assert.ok(Math.abs(thermalResult.byCombo.SLS1.reactions.A.rx) > 0);
const thermalCalc = thermalResult.byCombo.SLS1.elasticExpansion.handcalc.find((row) => row.type === 'temperature');
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
const gradientCalc = gradientResult.byCombo.SLS1.elasticExpansion.handcalc.find((row) => row.type === 'tgradient');
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
const momentMember = memberMomentResult.byCombo.SLS1.memberResults.M1;
assert.ok(momentMember.Mz.every(Number.isFinite));
assert.ok(momentMember.xs.some((x) => Math.abs(x - 2) < 1e-6));
assert.ok(memberMomentResult.byCombo.SLS1.elasticExpansion.loadTrace.some((row) => row.type === 'mmoment'));
const memberMomentCalc = memberMomentResult.byCombo.SLS1.elasticExpansion.handcalc.find((row) => row.type === 'mmoment');
assert.equal(memberMomentCalc.method, 'fixed-end-member-moment-split');
assert.equal(memberMomentCalc.axis, 'z');
assert.equal(memberMomentCalc.endMoments.i, 6);
assert.equal(memberMomentCalc.endMoments.j, 6);
assert.equal(memberMomentResult.byCombo.SLS1.elasticExpansion.review.advancedLoadHandcalcReady, true);

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
assert.equal(trussResult.byCombo.SLS1.elasticExpansion.features.trussMembers, 1);
assert.ok(trussResult.byCombo.SLS1.memberResults.T1.Nmax > 0);

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
const unilateral = braceResult.byCombo.SLS1.unilateral;
assert.equal(unilateral.version, 'p3-m11-unilateral-member-iteration');
assert.equal(unilateral.converged, true);
assert.ok(unilateral.iterationCount >= 2);
assert.ok(unilateral.inactiveMemberIds.includes('X2'));
assert.equal(braceResult.byCombo.SLS1.memberResults.X2, undefined);
const braceTrace = buildAdvancedElasticTrace(braceModel, braceResult);
assert.equal(braceTrace.unilateral.version, UNILATERAL_MEMBER_TRACE_VERSION);
assert.equal(braceTrace.unilateral.comboCount, braceModel.loadCombinations.length);
assert.equal(braceTrace.unilateral.convergedCount, braceModel.loadCombinations.length);
assert.ok(braceTrace.summary.unilateralInactiveMemberCount >= 1);
const limitedBraceResult = analyzeModel(createModel({
  ...braceModel,
  analysisSettings: { ...braceModel.analysisSettings, unilateralMaxIterations: 1 },
}));
assert.equal(limitedBraceResult.byCombo.SLS1.unilateral.converged, false);
assert.equal(limitedBraceResult.byCombo.SLS1.memberResults.X2, undefined);
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
assert.equal(validateModel(clearSpan).ok, true);
assert.equal(clearSpanResult.ok, true);
const clearTrace = expandAdvancedLoads(clearSpan.loads, clearSpan).trace;
assert.equal(clearTrace.features.memberOffsets, 1);
assert.equal(clearTrace.memberTrace[0].grossLength, 4);
assert.equal(clearTrace.memberTrace[0].clearLength, 3);
assert.deepEqual(clearTrace.memberTrace[0].offset, { i: 0.5, j: 0.5, rigidFactor: 1 });
assert.equal(clearTrace.review.memberOffsetReviewRequired, true);
assert.ok(clearSpanResult.byCombo.SLS1.summary.maxDisplacement < cantileverResult.byCombo.SLS1.summary.maxDisplacement);

const invalidOffsetModel = createModel({
  ...cantilever,
  members: [{ ...cantilever.members[0], endOffset: { i: 2.5, j: 2 } }],
});
const invalidOffsetValidation = validateModel(invalidOffsetModel);
assert.equal(invalidOffsetValidation.ok, false);
assert.ok(invalidOffsetValidation.errors.some((item) => item.code === 'BAD_MEMBER_OFFSET'));
const invalidOffsetTrace = expandAdvancedLoads(invalidOffsetModel.loads, invalidOffsetModel).trace;
assert.equal(invalidOffsetTrace.memberTrace[0].clearLength, 0);
assert.ok(invalidOffsetTrace.warnings.some((warning) => warning.code === 'MEMBER_OFFSET_CLEAR_LENGTH_ZERO'));
assert.ok(invalidOffsetTrace.review.blockers.includes('member-offset-clear-length-invalid'));
assert.equal(invalidOffsetTrace.review.traceReady, false);
assert.equal(invalidOffsetTrace.review.agentDecision, 'fix-elastic-expansion-trace-before-review');

const negativeOffsetModel = createModel({
  ...cantilever,
  members: [{ ...cantilever.members[0], endOffset: { i: -0.1, j: 0, rigidFactor: 1 } }],
});
assert.ok(validateModel(negativeOffsetModel).errors.some((item) => item.code === 'BAD_MEMBER_OFFSET'));
const badRigidFactorModel = createModel({
  ...cantilever,
  members: [{ ...cantilever.members[0], endOffset: { i: 0.1, j: 0, rigidFactor: 0 } }],
});
assert.ok(validateModel(badRigidFactorModel).errors.some((item) => item.code === 'BAD_MEMBER_OFFSET'));

console.log(JSON.stringify({ ok: true, version: 'p3-m11-elastic-expansion' }, null, 2));
