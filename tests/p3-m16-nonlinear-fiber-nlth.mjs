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
  buildFiberMaterialMap,
  buildMemberFiberSection,
  buildNonlinearAnalysisTrace,
  buildRectangularFiberSection,
  buildSpectrumScalingTrace,
  compareMomentCurvatureTheory,
  computeMomentCurvature,
  createPmmBackboneSet,
  createPmmBackboneSetFromMember,
  createPortalFrameSample,
  fiberMaterialFromRecord,
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
const customFiberMaterial = fiberMaterialFromRecord({
  E: 200000000,
  Fy: 400000,
  nonlinear: { backbone: [{ strain: 0, stress: 0 }, { strain: 0.001, stress: 200 }, { strain: 0.003, stress: 260 }] },
});
assert.equal(customFiberMaterial.backbone[1].stress, 200000);
const customStress = applyFiberStrain(
  { version: FIBER_SECTION_VERSION, type: 'single-fiber', fibers: [{ id: 'F1', material: 'custom', area: 1, y: -1 }] },
  { curvature: 0.001, materials: { custom: customFiberMaterial } },
);
assert.equal(customStress.fibers[0].stress, 200000);

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
assert.equal(nlth.converged, true);
assert.ok(nlth.rows.every((row) => row.iterations >= 1 && Array.isArray(row.iterationLog)));
assert.ok(nlth.rows.some((row) => row.hingeState === 'yielded'));

const benchmarks = runNonlinearFiberNlthBenchmarks();
assert.equal(benchmarks.ok, true);
assert.deepEqual(benchmarks.cases.map((item) => item.id), ['B6', 'B7', 'B8']);

const model = createPortalFrameSample();
model.materials = [{
  id: 'M16_STEEL',
  version: 1,
  E: 205000,
  G: 79000,
  Fy: 325,
  nonlinear: { backbone: [{ strain: 0, stress: 0 }, { strain: 0.0015, stress: 325 }, { strain: 0.004, stress: 390 }] },
}];
model.members[0].matId = 'M16_STEEL@1';
const memberFiber = buildMemberFiberSection(model, model.members[0]);
assert.equal(memberFiber.version, FIBER_SECTION_VERSION);
assert.ok(memberFiber.fibers.some((fiber) => fiber.material === 'M16_STEEL'));
const materialMap = buildFiberMaterialMap(model, [model.members[0].matId]);
assert.ok(materialMap.M16_STEEL.backbone.length >= 2);
const pmmFromMember = createPmmBackboneSetFromMember(model, model.members[0]);
assert.equal(pmmFromMember.version, PMM_HINGE_VERSION);
assert.equal(pmmFromMember.source.memberId, model.members[0].id);
const trace = buildNonlinearAnalysisTrace(model);
assert.equal(trace.version, NONLINEAR_TRACE_VERSION);
assert.equal(trace.fiberNlthGate.version, NONLINEAR_FIBER_NLTH_TRACE_VERSION);
assert.deepEqual(trace.fiberNlthGate.tickets, ['P3-T83', 'P3-T84', 'P3-T85', 'P3-T86']);
assert.deepEqual(trace.fiberNlthGate.benchmarks.requiredCases, ['B6', 'B7', 'B8']);
assert.equal(trace.fiberNlthGate.contracts.rayleigh, RAYLEIGH_DAMPING_VERSION);
assert.ok(trace.fiberNlthGate.fiber.fiberCount > 0);
assert.ok(trace.fiberNlthGate.fiber.materialCount >= 2);
assert.equal(trace.fiberNlthGate.pmm.memberSource.memberId, model.members[0].id);
assert.ok(trace.fiberNlthGate.dynamics.nlthRows > 0);
assert.equal(trace.fiberNlthGate.dynamics.nlthConverged, true);
assert.ok(trace.fiberNlthGate.dynamics.maxIterations >= 1);
assert.equal(trace.benchmarks.fiberNlth.ok, true);
assert.ok(trace.pmm.interpolated.points.length > 0);
assert.ok(trace.fiber.momentCurvature.rows.length > 0);
assert.ok(trace.fiber.materials.M16_STEEL.backbone.length >= 2);
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
