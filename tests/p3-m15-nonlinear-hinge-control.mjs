import assert from 'node:assert/strict';
import {
  ARC_LENGTH_CONTROL_VERSION,
  DISPLACEMENT_CONTROL_VERSION,
  FORMAL_PUSHOVER_VERSION,
  HINGE_ASSIGNMENT_VERSION,
  MOMENT_HINGE_VERSION,
  NONLINEAR_BENCHMARK_VERSION,
  NONLINEAR_HINGE_CONTROL_TRACE_VERSION,
  NONLINEAR_TRACE_VERSION,
  PUSHOVER_SOURCE_VERSION,
  buildArcLengthTrace,
  buildDisplacementControlTrace,
  buildHingeDegradedModel,
  buildHingeStateTrace,
  buildPushoverControlTrace,
  buildNonlinearAnalysisTrace,
  assignMemberHinges,
  comparePushoverRegression,
  createMomentRotationBackbone,
  createPortalFrameSample,
  createSnapThroughBenchmarkPath,
  evaluateMomentHinge,
  runFormalPushover,
  runNonlinearHingeControlBenchmarks,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const backbone = createMomentRotationBackbone({ My: 120, thetaY: 0.01 });
assert.equal(backbone.version, MOMENT_HINGE_VERSION);
assert.equal(backbone.points.length, 5);

const elastic = evaluateMomentHinge(0, backbone);
assert.equal(elastic.state, 'elastic');
assert.equal(elastic.point, 'A');
assert.equal(elastic.moment, 0);
const yielded = evaluateMomentHinge(0.011, backbone);
assert.equal(yielded.version, MOMENT_HINGE_VERSION);
assert.ok(['yielded', 'capping'].includes(yielded.state));
assert.ok(yielded.moment > 0);

const hingeTrace = buildHingeStateTrace([{ rotation: 0 }, { rotation: 0.011 }, { rotation: 0.06 }], backbone);
assert.equal(hingeTrace.rows[0].state, 'elastic');
assert.equal(hingeTrace.events.length >= 1, true);
assert.equal(hingeTrace.events[0].type, 'yielded');
assert.ok(hingeTrace.rows.some((row) => row.state !== 'elastic'));

const dc = buildDisplacementControlTrace([0.01, 0.02], { influence: 2, controlDof: 'N3:UX' });
assert.equal(dc.version, DISPLACEMENT_CONTROL_VERSION);
assert.equal(dc.contract.milestone, 'P3-M15');
assert.ok(dc.contract.tickets.includes('P3-T55'));
assert.equal(dc.steps[0].dLambda, 0.005);
assert.equal(dc.summary.stepCount, 2);
assert.equal(dc.summary.finalTarget, 0.02);

const arc = buildArcLengthTrace(createSnapThroughBenchmarkPath(), { radius: 1 });
assert.equal(arc.version, ARC_LENGTH_CONTROL_VERSION);
assert.equal(arc.contract.control, 'arc-length');
assert.ok(arc.steps.some((step) => step.dLambda < 0));
assert.ok(arc.steps.every((step) => step.satisfied));
assert.equal(arc.summary.postPeakTracked, true);

const model = createPortalFrameSample();
model.materials = [{
  id: 'HINGE_STEEL',
  version: 1,
  E: 205000,
  G: 79000,
  Fy: 275,
  nonlinear: { backbone: [{ rotation: 0, moment: 0 }, { rotation: 0.008, moment: 55 }], hardeningRatio: 0.03 },
}];
model.members[0].matId = 'HINGE_STEEL@1';
const assigned = assignMemberHinges(model);
assert.equal(assigned.version, HINGE_ASSIGNMENT_VERSION);
assert.ok(assigned.summary.hingeCount >= model.members.length * 2);
assert.ok(assigned.summary.materialBackboneCount >= 2);
assert.equal(assigned.hinges[0].My, 55);
assert.equal(assigned.hinges[0].thetaY, 0.008);
const pushover = runFormalPushover(model, { steps: 4, referenceBaseShear: 30 });
assert.equal(pushover.version, FORMAL_PUSHOVER_VERSION);
assert.equal(pushover.sourceVersion, PUSHOVER_SOURCE_VERSION);
assert.equal(pushover.contract.milestone, 'P3-M15');
assert.ok(pushover.contract.tickets.includes('P3-T56'));
assert.ok(pushover.capacityCurve.length > 0);
assert.equal(pushover.method.hinges, 'concentrated-M-theta-secant-update');
assert.equal(pushover.method.stiffnessUpdate, 'previous-step-hinge-secant-stiffness');
assert.equal(pushover.hingeDegradation.enabled, true);
assert.equal(pushover.hingeDegradation.trace.length, pushover.capacityCurve.length);
assert.ok(pushover.steps.every((step) => Number.isFinite(step.minStiffnessFactor)));
assert.equal(pushover.control.type, 'load-control');
assert.equal(pushover.steps[0].controlType, 'load-control');
assert.ok(pushover.steps.every((step) => Array.isArray(step.hingeEvents)));
assert.equal(pushover.hingeEvents.length, pushover.steps.reduce((sum, step) => sum + step.hingeEvents.length, 0));
assert.equal(pushover.summary.capacityPointCount, pushover.capacityCurve.length);
assert.equal(pushover.summary.stopReason, 'COMPLETED');

const stoppedPushover = runFormalPushover(model, { steps: 8, referenceBaseShear: 3000, targetDisplacement: 0.05 });
assert.equal(stoppedPushover.control.stopReason, 'TARGET_DISPLACEMENT');
assert.ok(stoppedPushover.steps.some((step) => step.targetReached));
const controlTrace = buildPushoverControlTrace(stoppedPushover, { targetDisplacement: 0.05 });
assert.equal(controlTrace.stopReason, 'TARGET_DISPLACEMENT');
const regression = comparePushoverRegression(pushover, { capacityCurve: pushover.capacityCurve });
assert.equal(regression.maxBaseShearDiff, 0);
const pushoverWithBaseline = runFormalPushover(model, { steps: 4, referenceBaseShear: 30, baseline: pushover });
assert.equal(pushoverWithBaseline.regression.maxRoofDispDiff, 0);
const degradedModel = buildHingeDegradedModel(model, {
  [model.members[0].id]: { overall: 'yielded', i: { ratio: 1.25 }, j: { ratio: 0 } },
});
assert.equal(degradedModel.summary.degradedMemberCount, 1);
assert.ok(degradedModel.summary.minFactor < 1);
assert.ok(degradedModel.model.members[0].secId.includes('__p3hinge_'));
const versionedSectionModel = { ...model, members: model.members.map((member, index) => (index === 0 ? { ...member, secId: 'h300@1' } : member)) };
const versionedDegradedModel = buildHingeDegradedModel(versionedSectionModel, {
  [model.members[0].id]: { overall: 'yielded', i: { ratio: 1.25 }, j: { ratio: 0 } },
});
assert.equal(versionedDegradedModel.summary.degradedMemberCount, 1);
assert.equal(versionedDegradedModel.model.members[0].secId.includes('@'), false);
assert.equal(versionedDegradedModel.model.sections.at(-1).source.sourceSection, 'h300@1');

const benchmarks = runNonlinearHingeControlBenchmarks({ b5: { model } });
assert.equal(benchmarks.version, NONLINEAR_BENCHMARK_VERSION);
assert.equal(benchmarks.ok, true);
assert.deepEqual(benchmarks.cases.map((item) => item.id), ['B3', 'B4', 'B5']);

const trace = buildNonlinearAnalysisTrace(model, { pushover: { steps: 3, referenceBaseShear: 20 } });
assert.equal(trace.version, NONLINEAR_TRACE_VERSION);
assert.equal(trace.hingeControlGate.version, NONLINEAR_HINGE_CONTROL_TRACE_VERSION);
assert.deepEqual(trace.hingeControlGate.tickets, ['P3-T54', 'P3-T55', 'P3-T56']);
assert.equal(trace.hingeControlGate.contract.milestone, 'P3-M15');
assert.deepEqual(trace.hingeControlGate.contract.tickets, ['P3-T54', 'P3-T55', 'P3-T56']);
assert.equal(trace.hingeControlGate.contract.featureTicketMap.momentHingeState, 'P3-T54');
assert.ok(trace.hingeControlGate.contract.reviewFields.includes('summary.ticketCoverage'));
assert.equal(trace.hingeControlGate.contract.maturity, 'preliminary-formal-contract');
assert.equal(trace.hingeControlGate.summary.readyForAgentReview, true);
assert.equal(trace.hingeControlGate.summary.pushoverOk, true);
assert.equal(trace.hingeControlGate.controlReview.status, 'trace-ready');
assert.equal(trace.hingeControlGate.controlReview.productionHingeEquilibriumLoop, false);
assert.equal(trace.hingeControlGate.controlReview.hingeTangentCorrectionExposed, true);
assert.equal(trace.hingeControlGate.controlReview.agentDecision, 'm15-ready-for-m16-review');
assert.deepEqual(trace.hingeControlGate.controlReview.missing, []);
assert.deepEqual(trace.hingeControlGate.summary.ticketCoverage.map((row) => row.ticket), ['P3-T54', 'P3-T55', 'P3-T56']);
assert.ok(trace.hingeControlGate.summary.ticketCoverage.every((row) => row.covered));
assert.deepEqual(trace.hingeControlGate.benchmarks.requiredCases, ['B3', 'B4', 'B5']);
assert.equal(trace.hingeControlGate.control.postPeakTracked, true);
assert.equal(trace.hingeControlGate.contracts.hingeAssignment, HINGE_ASSIGNMENT_VERSION);
assert.ok(trace.hingeControlGate.assignment.summary.hingeCount >= model.members.length * 2);
assert.ok(trace.hingeControlGate.tangentAssembly.hingeCorrectionCount >= 1);
assert.equal(trace.hingeControlGate.pushover.control.type, 'load-control');
assert.equal(trace.hingeControlGate.pushover.method.hinges, 'concentrated-M-theta-secant-update');
assert.equal(trace.benchmarks.hingeControl.ok, true);
assert.ok(trace.hingeStates.length > 0);
assert.ok(trace.capacityCurve.length > 0);

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, { getLastResult: () => null });
const apiTrace = agent.getNonlinearAnalysisTrace();
assert.equal(apiTrace.version, NONLINEAR_TRACE_VERSION);
assert.equal(apiTrace.hingeControlGate.milestone, 'P3-M15');
assert.equal(apiTrace.benchmarks.hingeControl.ok, true);
assert.ok(agent.getCapabilities().milestones.some((item) => item.id === 'P3-M15'));
assert.ok(agent.getCapabilities().dataContracts.includes('phase3NonlinearHingeControlTrace'));

console.log(JSON.stringify({ ok: true, version: 'p3-m15-nonlinear-hinge-control' }, null, 2));
