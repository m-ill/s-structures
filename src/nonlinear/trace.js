import { createAnalysisState, snapshotAnalysisState } from './state.js';
import { buildArcLengthTrace, createSnapThroughBenchmarkPath } from './control/arcLength.js';
import { buildDisplacementControlTrace } from './control/displacementControl.js';
import { buildHingeStateTrace, createMomentRotationBackbone } from './hinges/momentHinge.js';
import { runFormalPushover } from './pushoverFormal.js';
import { runNonlinearGeometryBenchmarks, runNonlinearHingeControlBenchmarks } from '../verification/nonlinearBenchmarks.js';

export const NONLINEAR_TRACE_VERSION = 'p3-m15-nonlinear-trace';

export function buildNonlinearAnalysisTrace(model = {}, options = {}) {
  const state = createAnalysisState({ u: (model.nodes || []).length * 6, lambda: options.lambda || 0 });
  const geometryBenchmarks = options.includeBenchmarks === false ? null : runNonlinearGeometryBenchmarks(options.benchmarks);
  const hingeControlBenchmarks = options.includeBenchmarks === false ? null : runNonlinearHingeControlBenchmarks(options.benchmarks);
  const backbone = createMomentRotationBackbone(options.backbone);
  const hingeTrace = buildHingeStateTrace(options.hingeSteps || [{ rotation: 0 }, { rotation: backbone.points[1].theta * 1.1 }], backbone);
  const pushover = options.includePushover === false ? null : runFormalPushover(model, options.pushover || {});
  return {
    version: NONLINEAR_TRACE_VERSION,
    method: {
      elements: 'corotational-beam-preliminary',
      hinges: 'concentrated-M-theta',
      control: 'load/displacement/arc-length',
      convergence: { force: 1e-4, displacement: 1e-4, energy: 1e-6 },
    },
    limitations: [
      'M15 formalizes hinge and control trace contracts around the current solver path.',
      'PMM interaction, fiber sections, and nonlinear time-history remain P3-M16 scope.',
    ],
    state: snapshotAnalysisState(state),
    steps: pushover?.steps || [],
    capacityCurve: pushover?.capacityCurve || [],
    hingeStates: hingeTrace.rows,
    hingeTrace,
    displacementControl: buildDisplacementControlTrace(options.displacementTargets || [0.01, 0.02], options.displacementControl),
    arcLength: buildArcLengthTrace(options.arcLengthPath || createSnapThroughBenchmarkPath(), options.arcLength),
    pushover,
    benchmarks: {
      version: NONLINEAR_TRACE_VERSION,
      geometry: geometryBenchmarks,
      hingeControl: hingeControlBenchmarks,
      ok: (geometryBenchmarks?.ok ?? true) && (hingeControlBenchmarks?.ok ?? true),
    },
  };
}
