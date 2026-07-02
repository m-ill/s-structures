import { createAnalysisState, NONLINEAR_STATE_VERSION, snapshotAnalysisState } from './state.js';
import { NEWTON_RAPHSON_VERSION, solveNewtonRaphson } from './control/newtonRaphson.js';
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
export const NONLINEAR_GEOMETRY_TRACE_VERSION = 'p3-m14-nonlinear-geometry-trace-v1';

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
    geometryGate: buildNonlinearGeometryGate(state, geometryBenchmarks, options.geometryGate),
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

export function buildNonlinearGeometryGate(state, geometryBenchmarks, options = {}) {
  const convergenceSample = solveNewtonRaphson({
    initial: options.initial ?? 1,
    residual: options.residual || ((x) => x * x - 4),
    tangent: options.tangent || ((x) => 2 * x),
    maxIterations: options.maxIterations || 30,
    lineSearch: options.lineSearch,
  });
  return {
    version: NONLINEAR_GEOMETRY_TRACE_VERSION,
    milestone: 'P3-M14',
    tickets: ['P3-T50', 'P3-T51', 'P3-T52', 'P3-T53'],
    contracts: {
      state: NONLINEAR_STATE_VERSION,
      newtonRaphson: NEWTON_RAPHSON_VERSION,
    },
    state: snapshotAnalysisState(state),
    convergence: {
      version: convergenceSample.version,
      converged: convergenceSample.converged,
      iterations: convergenceSample.iterations,
      lineSearchEnabled: convergenceSample.lineSearchEnabled,
      reason: convergenceSample.convergenceReason,
      log: convergenceSample.log,
    },
    benchmarks: geometryBenchmarks ? {
      version: geometryBenchmarks.version,
      ok: geometryBenchmarks.ok,
      requiredCases: ['B1', 'B2'],
      cases: geometryBenchmarks.cases.map((item) => ({
        id: item.id,
        name: item.name,
        ok: item.ok,
        tolerance: item.tolerance,
        errorRatio: item.errorRatio,
      })),
    } : null,
    limitations: [
      'P3-M14 is a geometry trace core, not a production nonlinear frame solver.',
      'Material hinges, displacement control, arc-length, PMM, fiber, and NLTH are handled by later Phase 3 milestones.',
    ],
  };
}
