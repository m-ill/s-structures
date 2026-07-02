import { createAnalysisState, NONLINEAR_STATE_VERSION, snapshotAnalysisState } from './state.js';
import { buildNonlinearTangentAssembly, NONLINEAR_ASSEMBLY_VERSION } from './assembly.js';
import { NEWTON_RAPHSON_VERSION, solveNewtonRaphson } from './control/newtonRaphson.js';
import { GLOBAL_EQUILIBRIUM_VERSION, runGlobalEquilibriumTrace } from './control/globalEquilibrium.js';
import { buildLoadControlTrace, LOAD_CONTROL_VERSION } from './control/loadControl.js';
import { NONLINEAR_CONVERGENCE_VERSION } from './control/convergence.js';
import { ARC_LENGTH_CONTROL_VERSION, buildArcLengthTrace, createSnapThroughBenchmarkPath } from './control/arcLength.js';
import { buildDisplacementControlTrace, DISPLACEMENT_CONTROL_VERSION } from './control/displacementControl.js';
import { buildHingeStateTrace, createMomentRotationBackbone, MOMENT_HINGE_VERSION } from './hinges/momentHinge.js';
import { assignMemberHinges, HINGE_ASSIGNMENT_VERSION } from './hinges/hingeAssign.js';
import { createPmmBackboneSet, createPmmBackboneSetFromMember, interpolatePmmBackbone, PMM_HINGE_VERSION } from './hinges/pmmHinge.js';
import { buildFiberMaterialMap, buildMemberFiberSection, buildRectangularFiberSection, FIBER_SECTION_VERSION } from './fiber/fiberSection.js';
import { computeMomentCurvature, MOMENT_CURVATURE_VERSION } from './fiber/momentCurvature.js';
import { GROUND_MOTION_VERSION, buildSpectrumScalingTrace, parseGroundMotionText, scaleGroundMotion } from './dynamics/groundMotion.js';
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
  const fiberMember = (model.members || [])[0] || null;
  const pmmSet = fiberMember && !options.pmm ? createPmmBackboneSetFromMember(model, fiberMember, options.pmmFromMember) : createPmmBackboneSet(options.pmm);
  const pmm = { set: pmmSet, interpolated: interpolatePmmBackbone(options.axialRatio ?? 0.3, pmmSet) };
  const fiberSection = options.fiberSection
    ? buildRectangularFiberSection(options.fiberSection)
    : buildMemberFiberSection(model, fiberMember || {}, options.memberFiberSection);
  const fiberMaterials = buildFiberMaterialMap(model, [fiberMember?.matId]);
  const fiber = {
    section: fiberSection,
    materials: fiberMaterials,
    momentCurvature: computeMomentCurvature(fiberSection, { materials: fiberMaterials, ...(options.momentCurvature || {}) }),
  };
  const rayleigh = solveRayleighDamping(options.rayleigh);
  const parsedRecord = parseGroundMotionText(options.groundMotionText || '0 0.1 -0.1 0', { dt: options.dt || 0.02, name: options.recordName });
  const spectrumScaling = buildSpectrumScalingTrace(parsedRecord, options.groundMotion);
  const record = scaleGroundMotion(parsedRecord, options.groundMotion);
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
    geometryGate: buildNonlinearGeometryGate(state, geometryBenchmarks, { ...options.geometryGate, assembly, model }),
    hingeControlGate: buildNonlinearHingeControlGate(hingeTrace, pushover, hingeControlBenchmarks, {
      displacementControl,
      arcLength,
      hingeAssignment,
      assembly,
    }),
    fiberNlthGate: buildNonlinearFiberNlthGate({ pmm, fiber, rayleigh, groundMotion: record, spectrumScaling, nlth }, fiberNlthBenchmarks),
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
    spectrumScaling,
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
  const fiberNlthReview = buildFiberNlthReview({ trace, fiberNlthBenchmarks });
  return {
    version: NONLINEAR_FIBER_NLTH_TRACE_VERSION,
    milestone: 'P3-M16',
    tickets: ['P3-T83', 'P3-T84', 'P3-T85', 'P3-T86'],
    contract: {
      milestone: 'P3-M16',
      tickets: ['P3-T83', 'P3-T84', 'P3-T85', 'P3-T86'],
      scope: 'Nonlinear fiber and NLTH v3 trace for PMM hinges, fiber section response, Newmark NLTH, Rayleigh damping, and ground-motion scaling.',
      featureTicketMap: {
        pmmHinge: 'P3-T83',
        fiberMomentCurvature: 'P3-T84',
        nlthNewmarkRayleigh: 'P3-T85',
        groundMotionScaling: 'P3-T86',
      },
      reviewFields: ['summary.ticketCoverage', 'pmm', 'fiber', 'dynamics', 'benchmarks.cases'],
      agentUse: 'Read-only gate for reports and AI-agent inspection of fiber/NLTH trace readiness.',
      maturity: 'preliminary-performance-trace',
    },
    contracts: {
      pmmHinge: PMM_HINGE_VERSION,
      fiberSection: FIBER_SECTION_VERSION,
      momentCurvature: MOMENT_CURVATURE_VERSION,
      newmark: NLTH_NEWMARK_VERSION,
      rayleigh: RAYLEIGH_DAMPING_VERSION,
      groundMotion: GROUND_MOTION_VERSION,
    },
    summary: {
      readyForAgentReview: true,
      benchmarkOk: fiberNlthBenchmarks?.ok ?? null,
      pmmPointCount: trace.pmm?.interpolated?.points?.length || 0,
      fiberCount: trace.fiber?.section?.fibers?.length || 0,
      curvatureRows: trace.fiber?.momentCurvature?.rows?.length || 0,
      groundMotionPoints: trace.groundMotion?.pointCount || 0,
      nlthConverged: trace.nlth?.converged ?? null,
      nlthYielded: (trace.nlth?.rows || []).some((row) => row.hingeState === 'yielded'),
      nlthUnstableStepCount: trace.nlth?.energyTrace?.unstableStepCount ?? null,
      stepSplitRecommended: !!trace.nlth?.energyTrace?.stepSplitRecommended,
      requiredBenchmarks: ['B6', 'B7', 'B8'],
      fiberNlthReview,
      ticketCoverage: buildFiberNlthTicketCoverage({ trace, fiberNlthBenchmarks }),
    },
    fiberNlthReview,
    pmm: {
      axialRatio: trace.pmm?.interpolated?.axialRatio ?? null,
      source: trace.pmm?.interpolated?.source || [],
      memberSource: trace.pmm?.set?.source || null,
      pointCount: trace.pmm?.interpolated?.points?.length || 0,
    },
    fiber: {
      sectionType: trace.fiber?.section?.type || null,
      fiberCount: trace.fiber?.section?.fibers?.length || 0,
      materialCount: Object.keys(trace.fiber?.materials || {}).length,
      curvatureRows: trace.fiber?.momentCurvature?.rows?.length || 0,
      yieldMoment: trace.fiber?.momentCurvature?.yieldMoment || 0,
    },
    dynamics: {
      rayleighTargets: trace.rayleigh?.targets || null,
      recordName: trace.groundMotion?.name || null,
      dt: trace.groundMotion?.dt || null,
      pointCount: trace.groundMotion?.pointCount || 0,
      duration: trace.groundMotion?.duration || 0,
      scaleFactor: trace.groundMotion?.scaleFactor || 1,
      spectrumScaling: trace.spectrumScaling ? {
        direction: trace.spectrumScaling.direction,
        periodRange: trace.spectrumScaling.periodRange,
        targetPga: trace.spectrumScaling.targetPga,
        sourcePga: trace.spectrumScaling.sourcePga,
        scaleFactor: trace.spectrumScaling.scaleFactor,
        pointCount: trace.spectrumScaling.pointCount,
        duration: trace.spectrumScaling.duration,
      } : null,
      nlthRows: trace.nlth?.rows?.length || 0,
      nlthConverged: trace.nlth?.converged ?? null,
      maxIterations: Math.max(0, ...(trace.nlth?.rows || []).map((row) => row.iterations || 0)),
      maxResidualRatio: trace.nlth?.summary?.maxResidualRatio ?? null,
      energyTrace: trace.nlth?.energyTrace || null,
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
      'Production seismic qualification requires owner review of material models, ground motions, damping, and acceptance criteria.',
      'Soil-structure interaction and final production seismic qualification remain outside this trace gate.',
    ],
  };
}

function buildFiberNlthReview({ trace, fiberNlthBenchmarks }) {
  const missing = [];
  if (!((trace.pmm?.interpolated?.points || []).length > 0)) missing.push('pmm-interpolation');
  if (!((trace.fiber?.section?.fibers || []).length > 0)) missing.push('fiber-section');
  if (!((trace.fiber?.momentCurvature?.rows || []).length > 0)) missing.push('moment-curvature');
  if (!trace.rayleigh?.version) missing.push('rayleigh-damping');
  if (!trace.spectrumScaling?.scaleFactor) missing.push('ground-motion-scaling');
  if (!trace.nlth?.converged) missing.push('nlth-convergence');
  if (trace.nlth?.energyTrace?.stepSplitRecommended) missing.push('nlth-step-split-review');
  if (!fiberNlthBenchmarks?.ok) missing.push('B6-B8-benchmark');
  return {
    status: missing.length ? 'review-required' : 'trace-ready',
    maturity: 'preliminary',
    distributedPlasticity: false,
    productionSeismicQualification: false,
    concentratedPlasticityTrace: true,
    groundMotionScalingTrace: !!trace.spectrumScaling?.scaleFactor,
    nlthEnergyTrace: !!trace.nlth?.energyTrace,
    stepSplitRecommended: !!trace.nlth?.energyTrace?.stepSplitRecommended,
    missing,
    agentDecision: missing.length ? 'hold-before-integrated-results' : 'm16-ready-for-integrated-results-review',
  };
}

function buildFiberNlthTicketCoverage({ trace, fiberNlthBenchmarks }) {
  const cases = fiberNlthBenchmarks?.cases || [];
  return [
    {
      ticket: 'P3-T83',
      scope: 'PMM interaction hinge interpolation',
      covered: (trace.pmm?.interpolated?.points?.length || 0) > 0,
      evidence: `${trace.pmm?.interpolated?.points?.length || 0} PMM points, source=${(trace.pmm?.interpolated?.source || []).join('-') || 'default'}`,
    },
    {
      ticket: 'P3-T84',
      scope: 'fiber section and moment-curvature trace',
      covered: (trace.fiber?.section?.fibers?.length || 0) > 0 && (trace.fiber?.momentCurvature?.rows?.length || 0) > 0,
      evidence: `${trace.fiber?.section?.fibers?.length || 0} fibers, ${trace.fiber?.momentCurvature?.rows?.length || 0} curvature rows`,
    },
    {
      ticket: 'P3-T85',
      scope: 'Newmark NLTH with Rayleigh damping and step trace',
      covered: !!trace.nlth?.converged && (trace.nlth?.rows?.length || 0) > 0 && !!trace.rayleigh?.version && !!trace.nlth?.energyTrace,
      evidence: `${trace.nlth?.rows?.length || 0} NLTH rows, converged=${!!trace.nlth?.converged}, unstable=${trace.nlth?.energyTrace?.unstableStepCount ?? 'n/a'}`,
    },
    {
      ticket: 'P3-T86',
      scope: 'ground-motion record parsing and scaling trace',
      covered: (trace.groundMotion?.pointCount || 0) > 0 && !!trace.spectrumScaling?.scaleFactor,
      evidence: `${trace.groundMotion?.pointCount || 0} record points, scale=${trace.spectrumScaling?.scaleFactor || 0}`,
    },
  ].map((row) => ({
    ...row,
    benchmarkEvidence: cases.map((item) => `${item.id}:${item.ok ? 'OK' : 'NG'}`).join(',') || null,
  }));
}

export function buildNonlinearHingeControlGate(hingeTrace, pushover, hingeControlBenchmarks, options = {}) {
  const displacementControl = options.displacementControl || buildDisplacementControlTrace([0.01, 0.02]);
  const arcLength = options.arcLength || buildArcLengthTrace(createSnapThroughBenchmarkPath());
  const controlReview = buildHingeControlReview({ hingeTrace, pushover, hingeControlBenchmarks, options, displacementControl, arcLength });
  return {
    version: NONLINEAR_HINGE_CONTROL_TRACE_VERSION,
    milestone: 'P3-M15',
    tickets: ['P3-T54', 'P3-T55', 'P3-T56'],
    contract: {
      milestone: 'P3-M15',
      tickets: ['P3-T54', 'P3-T55', 'P3-T56'],
      scope: 'Nonlinear hinge and control v2 trace for moment hinges, displacement/arc-length control, and formal pushover review.',
      featureTicketMap: {
        momentHingeState: 'P3-T54',
        displacementArcLengthControl: 'P3-T55',
        formalPushover: 'P3-T56',
      },
      reviewFields: ['summary.ticketCoverage', 'hinge', 'assignment.summary', 'control', 'pushover', 'benchmarks.cases'],
      agentUse: 'Read-only gate for reports and AI-agent inspection of hinge/control readiness before P3-M16 fiber and NLTH workflows.',
      maturity: 'preliminary-formal-contract',
    },
    contracts: {
      momentHinge: MOMENT_HINGE_VERSION,
      hingeAssignment: HINGE_ASSIGNMENT_VERSION,
      displacementControl: DISPLACEMENT_CONTROL_VERSION,
      arcLength: ARC_LENGTH_CONTROL_VERSION,
      formalPushover: pushover?.version || null,
    },
    summary: {
      readyForAgentReview: true,
      benchmarkOk: hingeControlBenchmarks?.ok ?? null,
      hingeEventCount: hingeTrace?.events?.length || 0,
      assignedHingeCount: options.hingeAssignment?.summary?.hingeCount || 0,
      postPeakTracked: arcLength.steps.some((step) => step.dLambda < 0),
      pushoverOk: !!pushover?.ok,
      pushoverStopReason: pushover?.control?.stopReason || null,
      requiredBenchmarks: ['B3', 'B4', 'B5'],
      controlReview,
      ticketCoverage: buildHingeControlTicketCoverage({
        hingeTrace,
        hingeAssignment: options.hingeAssignment,
        displacementControl,
        arcLength,
        pushover,
        hingeControlBenchmarks,
      }),
    },
    controlReview,
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
      control: pushover?.control || null,
      regression: pushover?.regression ? {
        comparedSteps: pushover.regression.comparedSteps,
        maxBaseShearDiff: pushover.regression.maxBaseShearDiff,
        maxRoofDispDiff: pushover.regression.maxRoofDispDiff,
      } : null,
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
      'Formal pushover still exposes the source path until hinge-degraded tangent equilibrium is fully integrated.',
      'PMM interaction, fiber section response, and nonlinear time history remain P3-M16 scope.',
    ],
  };
}

function buildHingeControlReview({ hingeTrace, pushover, hingeControlBenchmarks, options, displacementControl, arcLength }) {
  const missing = [];
  if (!(hingeTrace?.rows?.length > 0)) missing.push('hinge-state-trace');
  if (!(options.hingeAssignment?.summary?.hingeCount > 0)) missing.push('hinge-assignment');
  if (!(displacementControl?.steps?.length > 0)) missing.push('displacement-control');
  if (!(arcLength?.steps || []).some((step) => step.dLambda < 0)) missing.push('arc-length-post-peak');
  if (!pushover?.ok) missing.push('formal-pushover');
  if (!hingeControlBenchmarks?.ok) missing.push('B3-B5-benchmark');
  return {
    status: missing.length ? 'review-required' : 'trace-ready',
    maturity: 'preliminary',
    productionHingeEquilibriumLoop: false,
    hingeTangentCorrectionExposed: (options.assembly?.summary?.hingeCorrectionCount || 0) > 0,
    formalPushoverSourcePolicy: pushover?.contract?.sourcePolicy || null,
    missing,
    agentDecision: missing.length ? 'hold-before-m16' : 'm15-ready-for-m16-review',
  };
}

function buildHingeControlTicketCoverage({ hingeTrace, hingeAssignment, displacementControl, arcLength, pushover, hingeControlBenchmarks }) {
  const cases = hingeControlBenchmarks?.cases || [];
  return [
    {
      ticket: 'P3-T54',
      scope: 'moment-rotation hinge backbone, assignment, and state trace',
      covered: (hingeTrace?.rows?.length || 0) > 0 && (hingeAssignment?.summary?.hingeCount || 0) > 0,
      evidence: `${hingeTrace?.rows?.length || 0} hinge rows, ${hingeAssignment?.summary?.hingeCount || 0} assigned hinges`,
    },
    {
      ticket: 'P3-T55',
      scope: 'displacement-control and arc-length control traces',
      covered: (displacementControl?.steps?.length || 0) > 0 && (arcLength?.steps || []).some((step) => step.dLambda < 0),
      evidence: `${displacementControl?.steps?.length || 0} displacement steps, postPeak=${(arcLength?.steps || []).some((step) => step.dLambda < 0)}`,
    },
    {
      ticket: 'P3-T56',
      scope: 'formal pushover result contract and B4/B5 benchmark link',
      covered: !!pushover?.ok && ['B4', 'B5'].every((id) => cases.some((item) => item.id === id && item.ok)),
      evidence: `${pushover?.capacityCurve?.length || 0} capacity points, ${cases.map((item) => `${item.id}:${item.ok ? 'OK' : 'NG'}`).join(',') || 'benchmarks disabled'}`,
    },
  ];
}

export function buildNonlinearGeometryGate(state, geometryBenchmarks, options = {}) {
  const convergenceSample = solveNewtonRaphson({
    initial: options.initial ?? 1,
    residual: options.residual || ((x) => x * x - 4),
    tangent: options.tangent || ((x) => 2 * x),
    maxIterations: options.maxIterations || 30,
    lineSearch: options.lineSearch,
  });
  const loadControl = buildLoadControlTrace(options.loadControl);
  const globalEquilibrium = runGlobalEquilibriumTrace(options.model || {}, state, {
    assembly: options.assembly,
    loads: options.globalEquilibrium?.loads || [{ dof: options.assembly?.freeDofs?.[0] ?? 0, value: 1 }],
    maxIterations: options.globalEquilibrium?.maxIterations || 6,
    tolerances: options.globalEquilibrium?.tolerances,
  });
  const solverReview = buildGeometrySolverReview({ geometryBenchmarks, convergenceSample, loadControl, assembly: options.assembly, globalEquilibrium });
  return {
    version: NONLINEAR_GEOMETRY_TRACE_VERSION,
    milestone: 'P3-M14',
    tickets: ['P3-T50', 'P3-T51', 'P3-T52', 'P3-T53'],
    contract: {
      milestone: 'P3-M14',
      tickets: ['P3-T50', 'P3-T51', 'P3-T52', 'P3-T53'],
      scope: 'Nonlinear geometry v1 trace for state snapshots, corotational tangent assembly, Newton convergence, load control, and B1/B2 benchmarks.',
      featureTicketMap: {
        stateSnapshot: 'P3-T50',
        corotationalBeamKg: 'P3-T51',
        newtonLineSearchConvergence: 'P3-T52',
        geometryBenchmarks: 'P3-T53',
      },
      reviewFields: ['summary.ticketCoverage', 'state', 'assembly.summary', 'globalEquilibrium.rows', 'convergence.log', 'loadControl.rows', 'benchmarks.cases'],
      agentUse: 'Read-only gate for reports and AI-agent inspection before running later hinge, fiber, or NLTH workflows.',
      maturity: 'preliminary-trace-core',
    },
    contracts: {
      state: NONLINEAR_STATE_VERSION,
      convergence: NONLINEAR_CONVERGENCE_VERSION,
      newtonRaphson: NEWTON_RAPHSON_VERSION,
      globalEquilibrium: GLOBAL_EQUILIBRIUM_VERSION,
      loadControl: LOAD_CONTROL_VERSION,
      assembly: NONLINEAR_ASSEMBLY_VERSION,
    },
    summary: {
      readyForAgentReview: true,
      benchmarkOk: geometryBenchmarks?.ok ?? null,
      convergenceOk: convergenceSample.converged,
      globalEquilibriumOk: globalEquilibrium.converged,
      loadControlOk: loadControl.converged,
      tangentAssemblyOk: options.assembly?.ok ?? null,
      requiredBenchmarks: ['B1', 'B2'],
      solverReview,
      ticketCoverage: buildGeometryTicketCoverage({ state, options, convergenceSample, globalEquilibrium, loadControl, geometryBenchmarks }),
    },
    solverReview,
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
    globalEquilibrium,
    loadControl,
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
      'Global frame residual assembly is now exposed as a reduced-DOF Newton trace, but it is not yet certified as a production nonlinear solver.',
      'Material hinges, displacement control, arc-length, PMM, fiber, and NLTH are handled by later Phase 3 milestones.',
    ],
  };
}

function buildGeometrySolverReview({ geometryBenchmarks, convergenceSample, loadControl, assembly, globalEquilibrium }) {
  const missing = [];
  if (!assembly?.ok) missing.push('tangent-assembly');
  if (!convergenceSample?.converged) missing.push('newton-convergence');
  if (!globalEquilibrium?.converged) missing.push('global-equilibrium-trace');
  if (!loadControl?.converged) missing.push('load-control');
  if (!geometryBenchmarks?.ok) missing.push('B1-B2-benchmark');
  return {
    status: missing.length ? 'review-required' : 'trace-ready',
    maturity: 'preliminary',
    productionEquilibriumSolver: false,
    globalResidualAssembly: 'reduced-dof-newton-trace',
    globalEquilibriumConverged: !!globalEquilibrium?.converged,
    missing,
    agentDecision: missing.length ? 'hold-before-m15' : 'm14-ready-for-m15-review',
  };
}

function buildGeometryTicketCoverage({ state, options, convergenceSample, globalEquilibrium, loadControl, geometryBenchmarks }) {
  const cases = geometryBenchmarks?.cases || [];
  return [
    {
      ticket: 'P3-T50',
      scope: 'nonlinear state and restart-safe snapshot',
      covered: !!state?.version,
      evidence: `step ${state?.step ?? 0}, lambda ${state?.lambda ?? 0}`,
    },
    {
      ticket: 'P3-T51',
      scope: 'corotational beam and KE/KG tangent assembly trace',
      covered: !!options.assembly?.summary && options.assembly.summary.elasticMemberCount > 0,
      evidence: `${options.assembly?.summary?.elasticMemberCount || 0} elastic members, ${options.assembly?.summary?.geometricMemberCount || 0} KG members`,
    },
    {
      ticket: 'P3-T52',
      scope: 'Newton-Raphson, global residual trace, line search, convergence log, and load control',
      covered: !!convergenceSample?.converged && !!globalEquilibrium?.converged && !!loadControl?.converged,
      evidence: `${convergenceSample?.iterations || 0} scalar NR iterations, ${globalEquilibrium?.rows?.length || 0} global iterations, ${loadControl?.rows?.length || 0} load steps`,
    },
    {
      ticket: 'P3-T53',
      scope: 'B1/B2 geometry benchmark gate',
      covered: !!geometryBenchmarks?.ok && ['B1', 'B2'].every((id) => cases.some((item) => item.id === id && item.ok)),
      evidence: cases.map((item) => `${item.id}:${item.ok ? 'OK' : 'NG'}`).join(',') || 'benchmarks disabled',
    },
  ];
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
