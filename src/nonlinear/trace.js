import { createAnalysisState, NONLINEAR_STATE_VERSION, snapshotAnalysisState } from './state.js';
import { buildNonlinearTangentAssembly, NONLINEAR_ASSEMBLY_VERSION } from './assembly.js';
import { NEWTON_RAPHSON_VERSION, solveNewtonRaphson } from './control/newtonRaphson.js';
import { ARC_LENGTH_CONTROL_VERSION, buildArcLengthTrace, createSnapThroughBenchmarkPath } from './control/arcLength.js';
import { buildDisplacementControlTrace, DISPLACEMENT_CONTROL_VERSION } from './control/displacementControl.js';
import { buildHingeStateTrace, createMomentRotationBackbone, MOMENT_HINGE_VERSION } from './hinges/momentHinge.js';
import { assignMemberHinges, HINGE_ASSIGNMENT_VERSION } from './hinges/hingeAssign.js';
import { createPmmBackboneSet, interpolatePmmBackbone, PMM_HINGE_VERSION } from './hinges/pmmHinge.js';
import { buildRectangularFiberSection, FIBER_SECTION_VERSION } from './fiber/fiberSection.js';
import { computeMomentCurvature, MOMENT_CURVATURE_VERSION } from './fiber/momentCurvature.js';
import { GROUND_MOTION_VERSION, parseGroundMotionText, scaleGroundMotion } from './dynamics/groundMotion.js';
import { NLTH_NEWMARK_VERSION, runNewmarkNlth } from './dynamics/newmark.js';
import { RAYLEIGH_DAMPING_VERSION, solveRayleighDamping } from './dynamics/rayleigh.js';
import { runFormalPushover } from './pushoverFormal.js';
import { runNonlinearFiberNlthBenchmarks, runNonlinearGeometryBenchmarks, runNonlinearHingeControlBenchmarks } from '../verification/nonlinearBenchmarks.js';

export const NONLINEAR_TRACE_VERSION = 'p3-m16-nonlinear-trace';
export const NONLINEAR_GEOMETRY_TRACE_VERSION = 'p3-m14-nonlinear-geometry-trace-v1';
export const NONLINEAR_HINGE_CONTROL_TRACE_VERSION = 'p3-m15-hinge-control-trace-v1';
export const NONLINEAR_FIBER_NLTH_TRACE_VERSION = 'p3-m16-fiber-nlth-trace-v1';

export function buildNonlinearAnalysisTrace(model = {}, options = {}) {
  const state = createAnalysisState({ u: (model.nodes || []).length * 6, lambda: options.lambda || 0 });
  const geometryBenchmarks = options.includeBenchmarks === false ? null : runNonlinearGeometryBenchmarks(options.benchmarks);
  const hingeControlBenchmarks = options.includeBenchmarks === false ? null : runNonlinearHingeControlBenchmarks(options.benchmarks);
  const fiberNlthBenchmarks = options.includeBenchmarks === false ? null : runNonlinearFiberNlthBenchmarks(options.benchmarks);
  const backbone = createMomentRotationBackbone(options.backbone);
  const hingeTrace = buildHingeStateTrace(options.hingeSteps || [{ rotation: 0 }, { rotation: backbone.points[1].theta * 1.1 }], backbone);
  const hingeAssignment = assignMemberHinges(model, options.hingeAssignment);
  const pushover = options.includePushover === false ? null : runFormalPushover(model, options.pushover || {});
  const displacementControl = buildDisplacementControlTrace(options.displacementTargets || [0.01, 0.02], options.displacementControl);
  const arcLength = buildArcLengthTrace(options.arcLengthPath || createSnapThroughBenchmarkPath(), options.arcLength);
  const pmmSet = createPmmBackboneSet(options.pmm);
  const pmm = { set: pmmSet, interpolated: interpolatePmmBackbone(options.axialRatio ?? 0.3, pmmSet) };
  const fiberSection = buildRectangularFiberSection(options.fiberSection);
  const fiber = { section: fiberSection, momentCurvature: computeMomentCurvature(fiberSection, options.momentCurvature) };
  const rayleigh = solveRayleighDamping(options.rayleigh);
  const record = scaleGroundMotion(parseGroundMotionText(options.groundMotionText || '0 0.1 -0.1 0', { dt: options.dt || 0.02 }), options.groundMotion);
  const nlth = runNewmarkNlth({ accelerations: record.accelerations, dt: record.dt, ...(options.nlth || {}) });
  const assembly = buildNonlinearTangentAssembly(model, state, {
    hinges: hingeAssignment.hinges,
    ...(options.assembly || {}),
  });
  return {
    version: NONLINEAR_TRACE_VERSION,
    method: {
      elements: 'corotational-beam-preliminary',
      assembly: 'KE+KG+hinge-tangent-trace',
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
    assembly,
    hingeAssignment,
    geometryGate: buildNonlinearGeometryGate(state, geometryBenchmarks, { ...options.geometryGate, assembly }),
    hingeControlGate: buildNonlinearHingeControlGate(hingeTrace, pushover, hingeControlBenchmarks, {
      displacementControl,
      arcLength,
      hingeAssignment,
      assembly,
    }),
    fiberNlthGate: buildNonlinearFiberNlthGate({ pmm, fiber, rayleigh, groundMotion: record, nlth }, fiberNlthBenchmarks),
    steps: pushover?.steps || [],
    capacityCurve: pushover?.capacityCurve || [],
    hingeStates: hingeTrace.rows,
    hingeTrace,
    displacementControl,
    arcLength,
    pmm,
    fiber,
    rayleigh,
    groundMotion: record,
    nlth,
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

export function buildNonlinearFiberNlthGate(trace = {}, fiberNlthBenchmarks = null) {
  return {
    version: NONLINEAR_FIBER_NLTH_TRACE_VERSION,
    milestone: 'P3-M16',
    tickets: ['P3-T83', 'P3-T84', 'P3-T85', 'P3-T86'],
    contracts: {
      pmmHinge: PMM_HINGE_VERSION,
      fiberSection: FIBER_SECTION_VERSION,
      momentCurvature: MOMENT_CURVATURE_VERSION,
      newmark: NLTH_NEWMARK_VERSION,
      rayleigh: RAYLEIGH_DAMPING_VERSION,
      groundMotion: GROUND_MOTION_VERSION,
    },
    pmm: {
      axialRatio: trace.pmm?.interpolated?.axialRatio ?? null,
      source: trace.pmm?.interpolated?.source || [],
      pointCount: trace.pmm?.interpolated?.points?.length || 0,
    },
    fiber: {
      sectionType: trace.fiber?.section?.type || null,
      fiberCount: trace.fiber?.section?.fibers?.length || 0,
      curvatureRows: trace.fiber?.momentCurvature?.rows?.length || 0,
      yieldMoment: trace.fiber?.momentCurvature?.yieldMoment || 0,
    },
    dynamics: {
      rayleighTargets: trace.rayleigh?.targets || null,
      recordName: trace.groundMotion?.name || null,
      dt: trace.groundMotion?.dt || null,
      scaleFactor: trace.groundMotion?.scaleFactor || 1,
      nlthRows: trace.nlth?.rows?.length || 0,
      yielded: (trace.nlth?.rows || []).some((row) => row.hingeState === 'yielded'),
    },
    benchmarks: fiberNlthBenchmarks ? {
      version: fiberNlthBenchmarks.version,
      ok: fiberNlthBenchmarks.ok,
      requiredCases: ['B6', 'B7', 'B8'],
      cases: fiberNlthBenchmarks.cases.map((item) => ({
        id: item.id,
        name: item.name,
        ok: item.ok,
        tolerance: item.tolerance,
        errorRatio: item.errorRatio,
      })),
    } : null,
    limitations: [
      'P3-M16 is a concentrated-plasticity trace core, not distributed plasticity.',
      'Soil-structure interaction and final production seismic qualification remain outside this trace gate.',
    ],
  };
}

export function buildNonlinearHingeControlGate(hingeTrace, pushover, hingeControlBenchmarks, options = {}) {
  const displacementControl = options.displacementControl || buildDisplacementControlTrace([0.01, 0.02]);
  const arcLength = options.arcLength || buildArcLengthTrace(createSnapThroughBenchmarkPath());
  return {
    version: NONLINEAR_HINGE_CONTROL_TRACE_VERSION,
    milestone: 'P3-M15',
    tickets: ['P3-T54', 'P3-T55', 'P3-T56'],
    contracts: {
      momentHinge: MOMENT_HINGE_VERSION,
      hingeAssignment: HINGE_ASSIGNMENT_VERSION,
      displacementControl: DISPLACEMENT_CONTROL_VERSION,
      arcLength: ARC_LENGTH_CONTROL_VERSION,
      formalPushover: pushover?.version || null,
    },
    hinge: summarizeHingeTrace(hingeTrace),
    assignment: options.hingeAssignment ? {
      version: options.hingeAssignment.version,
      summary: options.hingeAssignment.summary,
    } : null,
    tangentAssembly: options.assembly ? {
      version: options.assembly.version,
      hingeCorrectionCount: options.assembly.summary?.hingeCorrectionCount || 0,
    } : null,
    control: {
      displacementSteps: displacementControl.steps.length,
      arcLengthSteps: arcLength.steps.length,
      postPeakTracked: arcLength.steps.some((step) => step.dLambda < 0),
      arcLengthSatisfied: arcLength.steps.every((step) => step.satisfied),
    },
    pushover: {
      ok: !!pushover?.ok,
      steps: pushover?.steps?.length || 0,
      capacityPoints: pushover?.capacityCurve?.length || 0,
      hingeEvents: pushover?.hingeEvents || [],
      method: pushover?.method || null,
    },
    benchmarks: hingeControlBenchmarks ? {
      version: hingeControlBenchmarks.version,
      ok: hingeControlBenchmarks.ok,
      requiredCases: ['B3', 'B4', 'B5'],
      cases: hingeControlBenchmarks.cases.map((item) => ({
        id: item.id,
        name: item.name,
        ok: item.ok,
        tolerance: item.tolerance,
        errorRatio: item.errorRatio,
      })),
    } : null,
    limitations: [
      'P3-M15 assigns concentrated member-end hinges and records tangent assembly corrections.',
      'PMM interaction, fiber section response, and nonlinear time history remain P3-M16 scope.',
    ],
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
      assembly: NONLINEAR_ASSEMBLY_VERSION,
    },
    state: snapshotAnalysisState(state),
    assembly: options.assembly ? {
      version: options.assembly.version,
      ok: options.assembly.ok,
      ndof: options.assembly.ndof,
      summary: options.assembly.summary,
    } : null,
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

function summarizeHingeTrace(trace = {}) {
  const rows = trace.rows || [];
  return {
    version: trace.version || null,
    pointIds: (trace.backbone?.points || []).map((point) => point.id),
    states: [...new Set(rows.map((row) => row.state))],
    events: trace.events || [],
  };
}
