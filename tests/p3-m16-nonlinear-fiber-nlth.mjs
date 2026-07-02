import assert from 'node:assert/strict';
import {
  FIBER_SECTION_VERSION,
  GROUND_MOTION_VERSION,
  MOMENT_CURVATURE_VERSION,
  NLTH_NEWMARK_VERSION,
  NONLINEAR_FIBER_NLTH_TRACE_VERSION,
  NONLINEAR_TRACE_VERSION,
  PMM_HINGE_VERSION,
  RAYLEIGH_DAMPING_VERSION,
  applyFiberStrain,
  buildNonlinearAnalysisTrace,
  buildRectangularFiberSection,
  buildSpectrumScalingTrace,
  compareMomentCurvatureTheory,
  computeMomentCurvature,
  createPmmBackboneSet,
  createPortalFrameSample,
  dampingRatioAtFrequency,
  interpolatePmmBackbone,
  parseGroundMotionText,
  runNewmarkNlth,
  runNonlinearFiberNlthBenchmarks,
  scaleGroundMotion,
  solveRayleighDamping,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const pmm = createPmmBackboneSet();
assert.equal(pmm.version, PMM_HINGE_VERSION);
const mid = interpolatePmmBackbone(0.45, pmm);
assert.equal(mid.version, PMM_HINGE_VERSION);
assert.deepEqual(mid.source, [0.3, 0.6]);
assert.ok(mid.points[1].moment < pmm.levels[1].backbone.points[1].moment);

const section = buildRectangularFiberSection({ width: 0.4, depth: 0.6, strips: 8 });
assert.equal(section.version, FIBER_SECTION_VERSION);
const strained = applyFiberStrain(section, { curvature: 0.001 });
assert.ok(strained.fibers.some((fiber) => fiber.force !== 0));

const mc = computeMomentCurvature(section);
assert.equal(mc.version, MOMENT_CURVATURE_VERSION);
assert.ok(mc.rows.length > 2);
assert.equal(compareMomentCurvatureTheory(mc, { expectedMoment: mc.yieldMoment }).ok, true);

const rayleigh = solveRayleighDamping({ w1: 2, w2: 5, zeta1: 0.05, zeta2: 0.05 });
assert.equal(rayleigh.version, RAYLEIGH_DAMPING_VERSION);
assert.ok(Math.abs(dampingRatioAtFrequency(rayleigh, 2) - 0.05) < 1e-12);

const record = parseGroundMotionText('0 0.2 -0.1 0', { dt: 0.01, name: 'mini' });
assert.equal(record.version, GROUND_MOTION_VERSION);
const scaled = scaleGroundMotion(record, { targetPga: 0.4 });
assert.equal(scaled.scaleFactor, 2);
assert.equal(buildSpectrumScalingTrace(record, { targetPga: 0.4 }).scaled.targetPga, 0.4);

const nlth = runNewmarkNlth({ accelerations: scaled.accelerations, dt: scaled.dt, stiffness: 100, yieldForce: 0.00001 });
assert.equal(nlth.version, NLTH_NEWMARK_VERSION);
assert.equal(nlth.rows.length, scaled.accelerations.length);
assert.ok(nlth.rows.some((row) => row.hingeState === 'yielded'));

const benchmarks = runNonlinearFiberNlthBenchmarks();
assert.equal(benchmarks.ok, true);
assert.deepEqual(benchmarks.cases.map((item) => item.id), ['B6', 'B7', 'B8']);

const model = createPortalFrameSample();
const trace = buildNonlinearAnalysisTrace(model);
assert.equal(trace.version, NONLINEAR_TRACE_VERSION);
assert.equal(trace.fiberNlthGate.version, NONLINEAR_FIBER_NLTH_TRACE_VERSION);
assert.deepEqual(trace.fiberNlthGate.tickets, ['P3-T83', 'P3-T84', 'P3-T85', 'P3-T86']);
assert.deepEqual(trace.fiberNlthGate.benchmarks.requiredCases, ['B6', 'B7', 'B8']);
assert.equal(trace.fiberNlthGate.contracts.rayleigh, RAYLEIGH_DAMPING_VERSION);
assert.ok(trace.fiberNlthGate.fiber.fiberCount > 0);
assert.ok(trace.fiberNlthGate.dynamics.nlthRows > 0);
assert.equal(trace.benchmarks.fiberNlth.ok, true);
assert.ok(trace.pmm.interpolated.points.length > 0);
assert.ok(trace.fiber.momentCurvature.rows.length > 0);
assert.equal(trace.rayleigh.version, RAYLEIGH_DAMPING_VERSION);
assert.ok(trace.nlth.rows.length > 0);

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, { getLastResult: () => null });
const apiTrace = agent.getNonlinearAnalysisTrace();
assert.equal(apiTrace.version, NONLINEAR_TRACE_VERSION);
assert.equal(apiTrace.fiberNlthGate.milestone, 'P3-M16');
assert.equal(apiTrace.benchmarks.fiberNlth.ok, true);
assert.ok(agent.getCapabilities().milestones.some((item) => item.id === 'P3-M16'));
assert.ok(agent.getCapabilities().dataContracts.includes('phase3NonlinearFiberNlthTrace'));

console.log(JSON.stringify({ ok: true, version: 'p3-m16-nonlinear-fiber-nlth' }, null, 2));
