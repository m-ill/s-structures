import { createAnalysisState, snapshotAnalysisState } from './state.js';
import { runNonlinearGeometryBenchmarks } from '../verification/nonlinearBenchmarks.js';

export const NONLINEAR_TRACE_VERSION = 'p3-m14-nonlinear-trace';

export function buildNonlinearAnalysisTrace(model = {}, options = {}) {
  const state = createAnalysisState({ u: (model.nodes || []).length * 6, lambda: options.lambda || 0 });
  const benchmarks = options.includeBenchmarks === false ? null : runNonlinearGeometryBenchmarks(options.benchmarks);
  return {
    version: NONLINEAR_TRACE_VERSION,
    method: {
      elements: 'corotational-beam-preliminary',
      control: 'load-control-newton-raphson',
      convergence: { force: 1e-4, displacement: 1e-4, energy: 1e-6 },
    },
    limitations: [
      'M14 covers geometric nonlinearity contracts only.',
      'Concentrated hinges, fiber sections, and nonlinear time-history are M15-M16 work.',
    ],
    state: snapshotAnalysisState(state),
    steps: [],
    capacityCurve: [],
    hingeStates: [],
    benchmarks,
  };
}
