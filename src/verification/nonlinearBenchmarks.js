import { estimateCantileverLargeDisplacement, geometricStiffnessTrace } from '../nonlinear/elements/corotationalBeam.js';
import { solveNewtonRaphson } from '../nonlinear/control/newtonRaphson.js';

export const NONLINEAR_BENCHMARK_VERSION = 'p3-m14-nonlinear-benchmarks';

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

function result(id, name, reference, actual, tolerance, extra = {}) {
  const errorRatio = Math.abs(actual - reference) / Math.max(1e-12, Math.abs(reference));
  return { id, name, reference, actual, tolerance, errorRatio, ok: errorRatio <= tolerance, ...extra };
}
