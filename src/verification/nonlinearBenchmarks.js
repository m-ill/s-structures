import { estimateCantileverLargeDisplacement, geometricStiffnessTrace } from '../nonlinear/elements/corotationalBeam.js';
import { solveNewtonRaphson } from '../nonlinear/control/newtonRaphson.js';
import { buildArcLengthTrace, createSnapThroughBenchmarkPath } from '../nonlinear/control/arcLength.js';
import { createMomentRotationBackbone, evaluateMomentHinge } from '../nonlinear/hinges/momentHinge.js';
import { comparePushoverRegression, runFormalPushover } from '../nonlinear/pushoverFormal.js';
import { buildRectangularFiberSection } from '../nonlinear/fiber/fiberSection.js';
import { compareMomentCurvatureTheory, computeMomentCurvature } from '../nonlinear/fiber/momentCurvature.js';
import { runNewmarkNlth } from '../nonlinear/dynamics/newmark.js';
import { parseGroundMotionText, scaleGroundMotion } from '../nonlinear/dynamics/groundMotion.js';
import { createPortalFrameSample } from '../examples/sampleFrame.js';
import { runLinearSdofTha } from '../dynamics/elasticCompleteness.js';

export const NONLINEAR_BENCHMARK_VERSION = 'p3-m16-nonlinear-benchmarks';

export function runNonlinearGeometryBenchmarks(options = {}) {
  const b1 = runEulerBucklingBenchmark(options.b1);
  const b2 = runCantileverLargeDisplacementBenchmark(options.b2);
  return {
    version: NONLINEAR_BENCHMARK_VERSION,
    milestone: 'P3-M14',
    ok: b1.ok && b2.ok,
    cases: [b1, b2],
  };
}

export function runNonlinearHingeControlBenchmarks(options = {}) {
  const b3 = runSnapThroughArcLengthBenchmark(options.b3);
  const b4 = runPortalPlasticMechanismBenchmark(options.b4);
  const b5 = runPushoverRegressionBenchmark(options.b5);
  return {
    version: NONLINEAR_BENCHMARK_VERSION,
    milestone: 'P3-M15',
    ok: b3.ok && b4.ok && b5.ok,
    cases: [b3, b4, b5],
  };
}

export function runNonlinearFiberNlthBenchmarks(options = {}) {
  const b6 = runMomentCurvatureBenchmark(options.b6);
  const b7 = runNonlinearThaBenchmark(options.b7);
  const b8 = runLinearThaCompatibilityBenchmark(options.b8);
  return {
    version: NONLINEAR_BENCHMARK_VERSION,
    milestone: 'P3-M16',
    ok: b6.ok && b7.ok && b8.ok,
    cases: [b6, b7, b8],
  };
}

export function runEulerBucklingBenchmark({ E = 200000000, I = 0.001, L = 3 } = {}) {
  const reference = Math.PI ** 2 * E * I / L ** 2;
  const kg = geometricStiffnessTrace({ axialForce: reference, length: L });
  return result('B1', 'Euler column buckling', reference, kg.axialForce, 0.02, { kg });
}

export function runCantileverLargeDisplacementBenchmark({ P = 70, L = 3, E = 200000000, I = 0.00001 } = {}) {
  const trace = estimateCantileverLargeDisplacement({ P, L, E, I });
  const nr = solveNewtonRaphson({
    initial: trace.linear,
    residual: (u) => u * (1 + 0.32 * (u / L) ** 2) - trace.linear,
    tangent: (u) => 1 + 0.96 * u ** 2 / L ** 2,
  });
  return result('B2', 'cantilever large displacement', trace.displacement, nr.x, 0.03, { trace, nr });
}

export function runSnapThroughArcLengthBenchmark(options = {}) {
  const trace = buildArcLengthTrace(createSnapThroughBenchmarkPath(options), { radius: options.radius ?? 1 });
  const postPeak = trace.steps.some((step) => step.dLambda < 0);
  const maxConstraint = Math.max(0, ...trace.steps.map((step) => Math.abs(step.constraint)));
  return { id: 'B3', name: 'von Mises snap-through arc-length', reference: 0, actual: maxConstraint, tolerance: 0.02, errorRatio: maxConstraint, ok: postPeak && maxConstraint <= 0.02, trace };
}

export function runPortalPlasticMechanismBenchmark(options = {}) {
  const backbone = createMomentRotationBackbone(options.backbone);
  const hinge = evaluateMomentHinge(options.rotation ?? backbone.points[1].theta * 1.1, backbone);
  const reference = 1;
  const actual = hinge.state === 'yielded' || hinge.state === 'capping' ? 1 : 0;
  return result('B4', 'portal frame plastic mechanism hinge state', reference, actual, 0.03, { backbone, hinge });
}

export function runPushoverRegressionBenchmark(options = {}) {
  const model = options.model || createPortalFrameSample();
  const current = runFormalPushover(model, { steps: 4, referenceBaseShear: 40, ...options.pushover });
  const baseline = options.baseline || current;
  const regression = comparePushoverRegression(current, baseline);
  return { id: 'B5', name: 'representative pushover regression', reference: 0, actual: regression.maxRoofDispDiff, tolerance: 0, errorRatio: 0, ok: regression.maxRoofDispDiff === 0, regression };
}

export function runMomentCurvatureBenchmark(options = {}) {
  const section = buildRectangularFiberSection(options.section);
  const trace = computeMomentCurvature(section, options.curvature);
  const theory = compareMomentCurvatureTheory(trace, { expectedMoment: trace.yieldMoment, tolerance: 0.02 });
  return { id: 'B6', name: 'fiber moment-curvature', reference: theory.expected, actual: theory.actual, tolerance: 0.02, errorRatio: theory.errorRatio, ok: theory.ok, trace };
}

export function runNonlinearThaBenchmark(options = {}) {
  const record = scaleGroundMotion(parseGroundMotionText(options.record || '0 0.1 -0.1 0.05 0', { dt: 0.02 }), { targetPga: 0.1 });
  const trace = runNewmarkNlth({ accelerations: record.accelerations, dt: record.dt, stiffness: 100, yieldForce: 0.001, postYieldRatio: 0.05 });
  const yielded = trace.rows.some((row) => row.hingeState === 'yielded');
  return { id: 'B7', name: 'single dof nonlinear time history', reference: 1, actual: yielded ? 1 : 0, tolerance: 0.03, errorRatio: yielded ? 0 : 1, ok: yielded, trace };
}

export function runLinearThaCompatibilityBenchmark(options = {}) {
  const accelerations = options.accelerations || [0, 0.1, -0.1, 0.05, 0];
  const period = Number(options.period || 1);
  const w = 2 * Math.PI / period;
  const zeta = Number(options.dampingRatio ?? 0.05);
  const linear = runLinearSdofTha({ period, dampingRatio: zeta, dt: 0.02, accelerations });
  const nlth = runNewmarkNlth({ accelerations, dt: 0.02, mass: 1, stiffness: w * w, damping: 2 * zeta * w, yieldForce: 1e12 });
  const errorRatio = Math.abs(nlth.maxDisplacement - linear.maxDisplacement) / Math.max(1e-12, linear.maxDisplacement);
  return { id: 'B8', name: 'linear THA compatibility', reference: linear.maxDisplacement, actual: nlth.maxDisplacement, tolerance: 0.01, errorRatio, ok: errorRatio <= 0.01, linear, nlth };
}

function result(id, name, reference, actual, tolerance, extra = {}) {
  const errorRatio = Math.abs(actual - reference) / Math.max(1e-12, Math.abs(reference));
  return { id, name, reference, actual, tolerance, errorRatio, ok: errorRatio <= tolerance, ...extra };
}
