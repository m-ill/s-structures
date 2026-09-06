export const PHASE3_NONLINEAR_MILESTONE_REVIEW_VERSION = 'p3-nonlinear-milestone-review-v1';

const ROWS = [
  row('P3-M14', ['P3-T50', 'P3-T51', 'P3-T52', 'P3-T53'], ['N1'], ['B1', 'B2'], [
    'tests/p3-m14-nonlinear-geometry.mjs',
  ], [
    'production global nonlinear frame solver certification',
    'full hinge-controlled global equilibrium loop',
  ], {
    readApis: ['getNonlinearAnalysisTrace'],
    dataContracts: ['phase3NonlinearGeometryTrace', 'phase3NonlinearGlobalEquilibriumTrace'],
    gatePath: 'geometryGate.solverReview',
    finalApprovalField: 'productionEquilibriumSolver',
  }),
  row('P3-M15', ['P3-T54', 'P3-T55', 'P3-T56'], ['N2', 'N3', 'N4'], ['B3', 'B4', 'B5'], [
    'tests/p3-m15-nonlinear-hinge-control.mjs',
  ], [
    'simultaneous hinge-controlled tangent equilibrium certification',
    'engineer review of pushover acceptance criteria',
  ], {
    readApis: ['getNonlinearAnalysisTrace', 'runPushover'],
    dataContracts: ['phase3NonlinearHingeControlTrace', 'preliminaryPushover'],
    gatePath: 'hingeControlGate.controlReview',
    finalApprovalField: 'productionHingeEquilibriumLoop',
  }),
  row('P3-M16', ['P3-T83', 'P3-T84', 'P3-T85', 'P3-T86'], ['N5', 'N6'], ['B6', 'B7', 'B8'], [
    'tests/p3-m16-nonlinear-fiber-nlth.mjs',
  ], [
    'distributed plasticity qualification',
    'field-calibrated nonlinear material library',
    'production seismic qualification and owner record review',
  ], {
    readApis: ['getNonlinearAnalysisTrace'],
    dataContracts: ['phase3NonlinearFiberNlthTrace', 'phase3FiberMaterialBackboneTrace'],
    gatePath: 'fiberNlthGate.fiberNlthReview',
    finalApprovalField: 'productionSeismicQualification',
  }),
];

const EXIT_CRITERIA = {
  'P3-M14': [
    criterion('N1-E1', 'AnalysisState snapshot, restart, hinge, event, step, lambda, and displacement state are path-safe.', 'tests/p3-m14-nonlinear-geometry.mjs', 'P3-T50'),
    criterion('N1-E2', 'Corotational beam and geometric stiffness tangent assembly traces are available.', 'tests/p3-m14-nonlinear-geometry.mjs', 'P3-T51'),
    criterion('N1-E3', 'Newton-Raphson, line search, convergence norms, load control, and failure rows are auditable.', 'tests/p3-m14-nonlinear-geometry.mjs', 'P3-T52'),
    criterion('N1-B1B2', 'B1 and B2 geometry benchmark gate is registered and green for trace review.', 'tests/p3-m14-nonlinear-geometry.mjs', 'P3-T53'),
  ],
  'P3-M15': [
    criterion('N2-E1', 'Moment-rotation hinge backbone, assignment, state transitions, and event trace are available.', 'tests/p3-m15-nonlinear-hinge-control.mjs', 'P3-T54'),
    criterion('N3-E1', 'Displacement-control and arc-length traces expose input review and post-peak tracking.', 'tests/p3-m15-nonlinear-hinge-control.mjs', 'P3-T55'),
    criterion('N4-E1', 'Formal pushover exposes capacity curve, hinge events, first-yield/ultimate, and stop reason.', 'tests/p3-m15-nonlinear-hinge-control.mjs', 'P3-T56'),
    criterion('N4-E2', 'Previous-step hinge secant stiffness degradation remains explicit as preliminary, not certified simultaneous equilibrium.', 'tests/p3-m15-nonlinear-hinge-control.mjs', 'P3-T56'),
    criterion('N2N3N4-B3B5', 'B3, B4, and B5 benchmark coverage is linked to hinge/control review.', 'tests/p3-m15-nonlinear-hinge-control.mjs', 'P3-T55/P3-T56'),
  ],
  'P3-M16': [
    criterion('N5-E1', 'PMM hinge interpolation records axial-ratio input, clamping review, and member-derived backbone source.', 'tests/p3-m16-nonlinear-fiber-nlth.mjs', 'P3-T83'),
    criterion('N5-E2', 'RC/steel fiber section, material backbone consumption, and moment-curvature trace are available.', 'tests/p3-m16-nonlinear-fiber-nlth.mjs', 'P3-T84'),
    criterion('N6-E1', 'Newmark NLTH records per-step Newton iteration, input review, convergence, and energy stability trace.', 'tests/p3-m16-nonlinear-fiber-nlth.mjs', 'P3-T85'),
    criterion('N6-E2', 'Rayleigh damping and ground-motion parsing, scaling, source PGA, target PGA, dt, and spectrum-scaling traces are auditable.', 'tests/p3-m16-nonlinear-fiber-nlth.mjs', 'P3-T86'),
    criterion('N5N6-B6B8', 'B6, B7, and B8 benchmark coverage is linked to fiber/NLTH review.', 'tests/p3-m16-nonlinear-fiber-nlth.mjs', 'P3-T83/P3-T85'),
  ],
};

export function buildPhase3NonlinearMilestoneReview() {
  const rows = ROWS.map(copyRow);
  return {
    version: PHASE3_NONLINEAR_MILESTONE_REVIEW_VERSION,
    scope: 'P3-M14 to P3-M16 nonlinear engine',
    sourceDocs: [
      'docs/phase3/NONLINEAR_ENGINE_PLAN.md',
      'docs/phase3/ROADMAP.md',
      'docs/phase3/IMPLEMENTATION_BACKLOG.md',
    ],
    rows,
    summary: {
      milestoneCount: rows.length,
      scopeLadder: rows.flatMap((item) => item.scopeLadder),
      benchmarkCases: rows.flatMap((item) => item.benchmarks),
      automatedEvidenceCount: rows.reduce((sum, item) => sum + item.automatedEvidence.length, 0),
      exitCriteriaCount: rows.reduce((sum, item) => sum + item.exitCriteria.length, 0),
      exitCriteriaAutomatedCount: rows.reduce((sum, item) => sum + item.exitCriteria.filter((criteria) => criteria.status === 'automated').length, 0),
      preliminaryCount: rows.length,
      productionReady: false,
      agentDecision: 'nonlinear-engine-review-required',
    },
    agentUse: {
      readApi: 'getPhase3NonlinearMilestoneReview',
      primaryReviewApi: 'getNonlinearAnalysisTrace',
      runApi: 'runPushover',
      rule: 'Use gate paths for staged review; final approval fields must remain false until engineering sign-off.',
    },
  };
}

function row(milestone, tickets, scopeLadder, benchmarks, automatedEvidence, remainingValidation, contracts) {
  return {
    milestone,
    tickets,
    scopeLadder,
    benchmarks,
    status: 'preliminary',
    automatedEvidence,
    remainingValidation,
    contracts,
    finalUseBlockedBy: remainingValidation,
  };
}

function copyRow(item) {
  const criteria = EXIT_CRITERIA[item.milestone] || [];
  return {
    ...item,
    tickets: [...item.tickets],
    scopeLadder: [...item.scopeLadder],
    benchmarks: [...item.benchmarks],
    automatedEvidence: [...item.automatedEvidence],
    remainingValidation: [...item.remainingValidation],
    finalUseBlockedBy: [...item.finalUseBlockedBy],
    exitCriteria: criteria.map((criteriaRow) => ({ ...criteriaRow })),
    exitCriteriaSummary: summarizeExitCriteria(criteria),
    contracts: {
      readApis: [...item.contracts.readApis],
      dataContracts: [...item.contracts.dataContracts],
      gatePath: item.contracts.gatePath,
      finalApprovalField: item.contracts.finalApprovalField,
    },
  };
}

function criterion(id, requirement, evidence, ticket) {
  return {
    id,
    requirement,
    evidence,
    ticket,
    source: 'docs/phase3/NONLINEAR_ENGINE_PLAN.md',
    status: 'automated',
  };
}

function summarizeExitCriteria(criteria = []) {
  const automated = criteria.filter((item) => item.status === 'automated').length;
  return {
    total: criteria.length,
    automated,
    reviewRequired: criteria.length - automated,
    status: criteria.length === automated ? 'automated-exit-criteria-covered' : 'exit-criteria-review-required',
  };
}
