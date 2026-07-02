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
  buildNonlinearFiberNlthGate,
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
assert.equal(pmm.contract.milestone, 'P3-M16');
const fallbackPmm = createPmmBackboneSet({ levels: [] });
assert.ok(fallbackPmm.levels.length >= 2);
const fallbackInterpolated = interpolatePmmBackbone(0.2, { levels: [] });
assert.equal(fallbackInterpolated.review.status, 'available');
assert.ok(fallbackInterpolated.points.length > 0);
const mid = interpolatePmmBackbone(0.45, pmm);
assert.equal(mid.version, PMM_HINGE_VERSION);
assert.ok(mid.contract.tickets.includes('P3-T83'));
assert.deepEqual(mid.source, [0.3, 0.6]);
assert.equal(mid.summary.pointCount, mid.points.length);
assert.ok(mid.points[1].moment < pmm.levels[1].backbone.points[1].moment);
assert.equal(mid.review.status, 'available');
const clampedPmm = interpolatePmmBackbone(1.2, pmm);
assert.equal(clampedPmm.requestedAxialRatio, 1.2);
assert.equal(clampedPmm.axialRatio, 1);
assert.equal(clampedPmm.clamped, true);
assert.equal(clampedPmm.review.warning, 'pmm-axial-ratio-out-of-range');

const section = buildRectangularFiberSection({ width: 0.4, depth: 0.6, strips: 8 });
assert.equal(section.version, FIBER_SECTION_VERSION);
assert.equal(section.contract.milestone, 'P3-M16');
assert.equal(section.summary.fiberCount, section.fibers.length);
const strained = applyFiberStrain(section, { curvature: 0.001 });
assert.ok(strained.fibers.some((fiber) => fiber.force !== 0));
assert.ok(strained.strainState.maxAbsStrain > 0);
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
assert.ok(mc.contract.tickets.includes('P3-T84'));
assert.ok(mc.rows.length > 2);
assert.equal(mc.summary.rowCount, mc.rows.length);
assert.equal(compareMomentCurvatureTheory(mc, { expectedMoment: mc.yieldMoment }).ok, true);

const rayleigh = solveRayleighDamping({ w1: 2, w2: 5, zeta1: 0.05, zeta2: 0.05 });
assert.equal(rayleigh.version, RAYLEIGH_DAMPING_VERSION);
assert.ok(Math.abs(dampingRatioAtFrequency(rayleigh, 2) - 0.05) < 1e-12);

const record = parseGroundMotionText('0 0.2 -0.1 0', { dt: 0.01, name: 'mini' });
assert.equal(record.version, GROUND_MOTION_VERSION);
assert.equal(record.contract.milestone, 'P3-M16');
assert.equal(record.pointCount, 4);
assert.equal(record.duration, 0.03);
assert.equal(record.review.status, 'available');
const scaled = scaleGroundMotion(record, { targetPga: 0.4 });
assert.ok(scaled.contract.tickets.includes('P3-T86'));
assert.equal(scaled.scaleFactor, 2);
assert.equal(scaled.review.status, 'available');
const scalingTrace = buildSpectrumScalingTrace(record, { targetPga: 0.4, periodRange: [0.2, 1.2] });
assert.equal(scalingTrace.scaled.targetPga, 0.4);
assert.equal(scalingTrace.pointCount, 4);
assert.deepEqual(scalingTrace.periodRange, [0.2, 1.2]);
assert.equal(scalingTrace.review.status, 'available');
const zeroPgaTrace = buildSpectrumScalingTrace(parseGroundMotionText('0 0 0', { dt: 0.01 }), { targetPga: 0.4 });
assert.equal(zeroPgaTrace.sourcePga, 0);
assert.ok(zeroPgaTrace.review.missing.includes('ground-motion-source-pga'));
const invalidDtRecord = parseGroundMotionText('0 0.2 -0.1', { dt: 0 });
assert.equal(invalidDtRecord.review.status, 'review-required');
assert.ok(invalidDtRecord.review.missing.includes('ground-motion-dt'));
const invalidDtScalingTrace = buildSpectrumScalingTrace(invalidDtRecord, { targetPga: 0.4 });
assert.equal(invalidDtScalingTrace.review.status, 'review-required');

const nlth = runNewmarkNlth({ accelerations: scaled.accelerations, dt: scaled.dt, stiffness: 100, yieldForce: 0.00001 });
assert.equal(nlth.version, NLTH_NEWMARK_VERSION);
assert.ok(nlth.contract.tickets.includes('P3-T85'));
assert.equal(nlth.rows.length, scaled.accelerations.length);
assert.equal(nlth.converged, true);
assert.equal(nlth.summary.stepCount, nlth.rows.length);
assert.ok(nlth.contract.stabilityTrace.includes('energy'));
assert.equal(nlth.energyTrace.unstableStepCount, 0);
assert.equal(nlth.energyTrace.stepSplitRecommended, false);
assert.ok(Number.isFinite(nlth.energyTrace.maxTotalEnergy));
assert.ok(nlth.summary.maxResidualRatio >= 0);
assert.ok(nlth.rows.every((row) => row.iterations >= 1 && Array.isArray(row.iterationLog)));
assert.ok(nlth.rows.every((row) => row.energy && row.stability.reason === 'OK'));
assert.ok(nlth.rows.some((row) => row.hingeState === 'yielded'));
const cautiousNlth = runNewmarkNlth({ accelerations: scaled.accelerations, dt: scaled.dt, stiffness: 100, energyJumpLimit: 0.5 });
assert.equal(cautiousNlth.energyTrace.stepSplitRecommended, true);
assert.ok(cautiousNlth.energyTrace.unstableStepCount >= 1);

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
assert.equal(trace.fiberNlthGate.contract.milestone, 'P3-M16');
assert.deepEqual(trace.fiberNlthGate.contract.tickets, ['P3-T83', 'P3-T84', 'P3-T85', 'P3-T86']);
assert.equal(trace.fiberNlthGate.contract.featureTicketMap.pmmHinge, 'P3-T83');
assert.ok(trace.fiberNlthGate.contract.reviewFields.includes('summary.ticketCoverage'));
assert.equal(trace.fiberNlthGate.contract.maturity, 'preliminary-performance-trace');
assert.equal(trace.fiberNlthGate.summary.readyForAgentReview, true);
assert.equal(trace.fiberNlthGate.summary.nlthConverged, true);
assert.equal(trace.fiberNlthGate.fiberNlthReview.status, 'trace-ready');
assert.equal(trace.fiberNlthGate.fiberNlthReview.distributedPlasticity, false);
assert.equal(trace.fiberNlthGate.fiberNlthReview.productionSeismicQualification, false);
assert.equal(trace.fiberNlthGate.fiberNlthReview.concentratedPlasticityTrace, true);
assert.equal(trace.fiberNlthGate.fiberNlthReview.nlthEnergyTrace, true);
assert.equal(trace.fiberNlthGate.fiberNlthReview.stepSplitRecommended, false);
assert.equal(trace.fiberNlthGate.fiberNlthReview.groundMotionScalingTrace, true);
assert.equal(trace.fiberNlthGate.fiberNlthReview.agentDecision, 'm16-ready-for-integrated-results-review');
assert.deepEqual(trace.fiberNlthGate.fiberNlthReview.missing, []);
assert.deepEqual(trace.fiberNlthGate.summary.ticketCoverage.map((row) => row.ticket), ['P3-T83', 'P3-T84', 'P3-T85', 'P3-T86']);
assert.ok(trace.fiberNlthGate.summary.ticketCoverage.every((row) => row.covered));
assert.deepEqual(trace.fiberNlthGate.benchmarks.requiredCases, ['B6', 'B7', 'B8']);
assert.equal(trace.fiberNlthGate.contracts.rayleigh, RAYLEIGH_DAMPING_VERSION);
assert.ok(trace.fiberNlthGate.fiber.fiberCount > 0);
assert.ok(trace.fiberNlthGate.fiber.materialCount >= 2);
assert.equal(trace.fiberNlthGate.pmm.memberSource.memberId, model.members[0].id);
assert.ok(trace.fiberNlthGate.dynamics.nlthRows > 0);
assert.equal(trace.fiberNlthGate.dynamics.nlthConverged, true);
assert.ok(trace.fiberNlthGate.dynamics.maxIterations >= 1);
assert.equal(trace.fiberNlthGate.dynamics.energyTrace.unstableStepCount, 0);
assert.equal(trace.fiberNlthGate.summary.nlthUnstableStepCount, 0);
assert.equal(trace.fiberNlthGate.summary.stepSplitRecommended, false);
assert.ok(trace.fiberNlthGate.dynamics.spectrumScaling.pointCount > 0);
assert.ok(trace.spectrumScaling.scaleFactor > 0);
assert.equal(trace.benchmarks.fiberNlth.ok, true);
assert.ok(trace.pmm.interpolated.points.length > 0);
assert.ok(trace.fiber.momentCurvature.rows.length > 0);
assert.ok(trace.fiber.materials.M16_STEEL.backbone.length >= 2);
assert.equal(trace.rayleigh.version, RAYLEIGH_DAMPING_VERSION);
assert.ok(trace.nlth.rows.length > 0);

const zeroPgaGate = buildNonlinearFiberNlthGate({
  ...trace.fiberNlthGate,
  pmm: trace.pmm,
  fiber: trace.fiber,
  rayleigh: trace.rayleigh,
  groundMotion: { ...trace.groundMotion, pointCount: 3, sourcePga: 0 },
  spectrumScaling: zeroPgaTrace,
  nlth: trace.nlth,
}, trace.benchmarks.fiberNlth);
assert.equal(zeroPgaGate.fiberNlthReview.status, 'review-required');
assert.equal(zeroPgaGate.summary.readyForAgentReview, false);
assert.equal(zeroPgaGate.fiberNlthReview.groundMotionScalingTrace, false);
assert.ok(zeroPgaGate.fiberNlthReview.missing.includes('ground-motion-scaling'));
assert.equal(zeroPgaGate.summary.ticketCoverage.find((row) => row.ticket === 'P3-T86').covered, false);
const invalidDtGate = buildNonlinearFiberNlthGate({
  ...trace.fiberNlthGate,
  pmm: trace.pmm,
  fiber: trace.fiber,
  rayleigh: trace.rayleigh,
  groundMotion: invalidDtRecord,
  spectrumScaling: invalidDtScalingTrace,
  nlth: trace.nlth,
}, trace.benchmarks.fiberNlth);
assert.equal(invalidDtGate.fiberNlthReview.status, 'review-required');
assert.equal(invalidDtGate.fiberNlthReview.groundMotionScalingTrace, false);
assert.ok(invalidDtGate.fiberNlthReview.missing.includes('ground-motion-scaling'));
assert.equal(invalidDtGate.summary.ticketCoverage.find((row) => row.ticket === 'P3-T86').covered, false);
const clampedPmmGate = buildNonlinearFiberNlthGate({
  pmm: { ...trace.pmm, interpolated: clampedPmm },
  fiber: trace.fiber,
  rayleigh: trace.rayleigh,
  groundMotion: trace.groundMotion,
  spectrumScaling: trace.spectrumScaling,
  nlth: trace.nlth,
}, trace.benchmarks.fiberNlth);
assert.equal(clampedPmmGate.pmm.requestedAxialRatio, 1.2);
assert.equal(clampedPmmGate.pmm.clamped, true);
assert.equal(clampedPmmGate.pmm.review.warning, 'pmm-axial-ratio-out-of-range');
assert.equal(clampedPmmGate.fiberNlthReview.status, 'review-required');
assert.equal(clampedPmmGate.summary.readyForAgentReview, false);
assert.ok(clampedPmmGate.fiberNlthReview.missing.includes('pmm-axial-ratio-input-review'));
assert.equal(clampedPmmGate.summary.ticketCoverage.find((row) => row.ticket === 'P3-T83').covered, false);

const stepSplitGate = buildNonlinearFiberNlthGate({
  pmm: trace.pmm,
  fiber: trace.fiber,
  rayleigh: trace.rayleigh,
  groundMotion: trace.groundMotion,
  spectrumScaling: trace.spectrumScaling,
  nlth: cautiousNlth,
}, trace.benchmarks.fiberNlth);
assert.equal(stepSplitGate.fiberNlthReview.status, 'review-required');
assert.equal(stepSplitGate.summary.readyForAgentReview, false);
assert.ok(stepSplitGate.fiberNlthReview.missing.includes('nlth-step-split-review'));
assert.equal(stepSplitGate.summary.ticketCoverage.find((row) => row.ticket === 'P3-T85').covered, false);

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, { getLastResult: () => null });
const apiTrace = agent.getNonlinearAnalysisTrace();
assert.equal(apiTrace.version, NONLINEAR_TRACE_VERSION);
assert.equal(apiTrace.fiberNlthGate.milestone, 'P3-M16');
assert.equal(apiTrace.benchmarks.fiberNlth.ok, true);
assert.ok(agent.getCapabilities().milestones.some((item) => item.id === 'P3-M16'));
assert.ok(agent.getCapabilities().dataContracts.includes('phase3NonlinearFiberNlthTrace'));

console.log(JSON.stringify({ ok: true, version: 'p3-m16-nonlinear-fiber-nlth' }, null, 2));
