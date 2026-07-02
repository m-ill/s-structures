import assert from 'node:assert/strict';
import {
  ARC_LENGTH_CONTROL_VERSION,
  DISPLACEMENT_CONTROL_VERSION,
  FORMAL_PUSHOVER_VERSION,
  MOMENT_HINGE_VERSION,
  NONLINEAR_BENCHMARK_VERSION,
  NONLINEAR_HINGE_CONTROL_TRACE_VERSION,
  NONLINEAR_TRACE_VERSION,
  buildArcLengthTrace,
  buildDisplacementControlTrace,
  buildHingeStateTrace,
  buildNonlinearAnalysisTrace,
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

const yielded = evaluateMomentHinge(0.011, backbone);
assert.equal(yielded.version, MOMENT_HINGE_VERSION);
assert.ok(['yielded', 'capping'].includes(yielded.state));
assert.ok(yielded.moment > 0);

const hingeTrace = buildHingeStateTrace([{ rotation: 0 }, { rotation: 0.011 }, { rotation: 0.06 }], backbone);
assert.equal(hingeTrace.events.length >= 1, true);
assert.ok(hingeTrace.rows.some((row) => row.state !== 'elastic'));

const dc = buildDisplacementControlTrace([0.01, 0.02], { influence: 2, controlDof: 'N3:UX' });
assert.equal(dc.version, DISPLACEMENT_CONTROL_VERSION);
assert.equal(dc.steps[0].dLambda, 0.005);

const arc = buildArcLengthTrace(createSnapThroughBenchmarkPath(), { radius: 1 });
assert.equal(arc.version, ARC_LENGTH_CONTROL_VERSION);
assert.ok(arc.steps.some((step) => step.dLambda < 0));
assert.ok(arc.steps.every((step) => step.satisfied));

const model = createPortalFrameSample();
const pushover = runFormalPushover(model, { steps: 4, referenceBaseShear: 30 });
assert.equal(pushover.version, FORMAL_PUSHOVER_VERSION);
assert.ok(pushover.capacityCurve.length > 0);
assert.equal(pushover.method.hinges, 'concentrated-M-theta-preliminary');
assert.ok(pushover.steps.every((step) => Array.isArray(step.hingeEvents)));
assert.equal(pushover.hingeEvents.length, pushover.steps.reduce((sum, step) => sum + step.hingeEvents.length, 0));

const benchmarks = runNonlinearHingeControlBenchmarks({ b5: { model } });
assert.equal(benchmarks.version, NONLINEAR_BENCHMARK_VERSION);
assert.equal(benchmarks.ok, true);
assert.deepEqual(benchmarks.cases.map((item) => item.id), ['B3', 'B4', 'B5']);

const trace = buildNonlinearAnalysisTrace(model, { pushover: { steps: 3, referenceBaseShear: 20 } });
assert.equal(trace.version, NONLINEAR_TRACE_VERSION);
assert.equal(trace.hingeControlGate.version, NONLINEAR_HINGE_CONTROL_TRACE_VERSION);
assert.deepEqual(trace.hingeControlGate.tickets, ['P3-T54', 'P3-T55', 'P3-T56']);
assert.deepEqual(trace.hingeControlGate.benchmarks.requiredCases, ['B3', 'B4', 'B5']);
assert.equal(trace.hingeControlGate.control.postPeakTracked, true);
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
