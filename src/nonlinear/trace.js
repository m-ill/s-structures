import { createAnalysisState, snapshotAnalysisState } from './state.js';
import { buildArcLengthTrace, createSnapThroughBenchmarkPath } from './control/arcLength.js';
import { buildDisplacementControlTrace } from './control/displacementControl.js';
import { buildHingeStateTrace, createMomentRotationBackbone } from './hinges/momentHinge.js';
import { createPmmBackboneSet, interpolatePmmBackbone } from './hinges/pmmHinge.js';
import { buildRectangularFiberSection } from './fiber/fiberSection.js';
import { computeMomentCurvature } from './fiber/momentCurvature.js';
import { parseGroundMotionText, scaleGroundMotion } from './dynamics/groundMotion.js';
import { runNewmarkNlth } from './dynamics/newmark.js';
import { runFormalPushover } from './pushoverFormal.js';
import { runNonlinearFiberNlthBenchmarks, runNonlinearGeometryBenchmarks, runNonlinearHingeControlBenchmarks } from '../verification/nonlinearBenchmarks.js';

export const NONLINEAR_TRACE_VERSION = 'p3-m16-nonlinear-trace';

export function buildNonlinearAnalysisTrace(model = {}, options = {}) {
  const state = createAnalysisState({ u: (model.nodes || []).length * 6, lambda: options.lambda || 0 });
  const geometryBenchmarks = options.includeBenchmarks === false ? null : runNonlinearGeometryBenchmarks(options.benchmarks);
  const hingeControlBenchmarks = options.includeBenchmarks === false ? null : runNonlinearHingeControlBenchmarks(options.benchmarks);
  const fiberNlthBenchmarks = options.includeBenchmarks === false ? null : runNonlinearFiberNlthBenchmarks(options.benchmarks);
  const backbone = createMomentRotationBackbone(options.backbone);
  const hingeTrace = buildHingeStateTrace(options.hingeSteps || [{ rotation: 0 }, { rotation: backbone.points[1].theta * 1.1 }], backbone);
  const pushover = options.includePushover === false ? null : runFormalPushover(model, options.pushover || {});
  const pmmSet = createPmmBackboneSet(options.pmm);
  const fiberSection = buildRectangularFiberSection(options.fiberSection);
  const record = scaleGroundMotion(parseGroundMotionText(options.groundMotionText || '0 0.1 -0.1 0', { dt: options.dt || 0.02 }), options.groundMotion);
  return {
    version: NONLINEAR_TRACE_VERSION,
    method: {
      elements: 'corotational-beam-preliminary',
      hinges: 'concentrated-M-theta',
      control: 'load/displacement/arc-length/newmark',
      fiber: 'hinge-location-fiber-section',
      convergence: { force: 1e-4, displacement: 1e-4, energy: 1e-6 },
    },
    limitations: [
      'M16 adds PMM, fiber, and NLTH trace contracts around concentrated plasticity.',
      'Distributed plasticity and soil-structure interaction are out of scope.',
    ],
    state: snapshotAnalysisState(state),
    steps: pushover?.steps || [],
    capacityCurve: pushover?.capacityCurve || [],
    hingeStates: hingeTrace.rows,
    hingeTrace,
    displacementControl: buildDisplacementControlTrace(options.displacementTargets || [0.01, 0.02], options.displacementControl),
    arcLength: buildArcLengthTrace(options.arcLengthPath || createSnapThroughBenchmarkPath(), options.arcLength),
    pmm: { set: pmmSet, interpolated: interpolatePmmBackbone(options.axialRatio ?? 0.3, pmmSet) },
    fiber: { section: fiberSection, momentCurvature: computeMomentCurvature(fiberSection, options.momentCurvature) },
    groundMotion: record,
    nlth: runNewmarkNlth({ accelerations: record.accelerations, dt: record.dt, ...(options.nlth || {}) }),
    pushover,
    benchmarks: {
      version: NONLINEAR_TRACE_VERSION,
      geometry: geometryBenchmarks,
      hingeControl: hingeControlBenchmarks,
      fiberNlth: fiberNlthBenchmarks,
      ok: (geometryBenchmarks?.ok ?? true) && (hingeControlBenchmarks?.ok ?? true) && (fiberNlthBenchmarks?.ok ?? true),
    },
  };
}
