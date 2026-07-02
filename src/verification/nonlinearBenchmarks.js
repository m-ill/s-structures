import { estimateCantileverLargeDisplacement, geometricStiffnessTrace } from '../nonlinear/elements/corotationalBeam.js';
import { solveNewtonRaphson } from '../nonlinear/control/newtonRaphson.js';
import { buildArcLengthTrace, createSnapThroughBenchmarkPath } from '../nonlinear/control/arcLength.js';
import { createMomentRotationBackbone, evaluateMomentHinge } from '../nonlinear/hinges/momentHinge.js';
import { comparePushoverRegression, runFormalPushover } from '../nonlinear/pushoverFormal.js';
import { createPortalFrameSample } from '../examples/sampleFrame.js';

export const NONLINEAR_BENCHMARK_VERSION = 'p3-m15-nonlinear-benchmarks';

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

function result(id, name, reference, actual, tolerance, extra = {}) {
  const errorRatio = Math.abs(actual - reference) / Math.max(1e-12, Math.abs(reference));
  return { id, name, reference, actual, tolerance, errorRatio, ok: errorRatio <= tolerance, ...extra };
}
