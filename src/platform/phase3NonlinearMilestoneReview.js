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
  return {
    ...item,
    tickets: [...item.tickets],
    scopeLadder: [...item.scopeLadder],
    benchmarks: [...item.benchmarks],
    automatedEvidence: [...item.automatedEvidence],
    remainingValidation: [...item.remainingValidation],
    finalUseBlockedBy: [...item.finalUseBlockedBy],
    contracts: {
      readApis: [...item.contracts.readApis],
      dataContracts: [...item.contracts.dataContracts],
      gatePath: item.contracts.gatePath,
      finalApprovalField: item.contracts.finalApprovalField,
    },
  };
}
