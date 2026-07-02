export const PHASE3_PRODUCTIZATION_MILESTONE_REVIEW_VERSION = 'p3-productization-milestone-review-v1';

const ROWS = [
  row('P3-M19', ['P3-T58', 'P3-T59', 'P3-T61', 'P3-T62'], [
    'integrated-result-postprocessing',
    'calculation-report-method-limitations',
    'workflow-lock',
    'benchmark-regression',
  ], [
    'tests/p3-m19-integrated-report.mjs',
    'npm run test:p3',
  ], [
    'final structural sign-off',
    'project-specific assumption review',
    'owner approval of workflow lock policy',
  ], {
    readApis: ['getP3IntegratedResults'],
    dataContracts: ['phase3IntegratedResults', 'phase3IntegratedResultsGate'],
    gatePath: 'integratedGate.integratedReview',
    finalApprovalField: 'finalStructuralSignoff',
  }),
  row('P3-M20', ['P3-T63', 'P3-T64', 'P3-T65', 'P3-T66', 'P3-T67'], [
    'packaging-smoke',
    'license-policy-record',
    'onboarding-manual-agent-contract',
    'performance-security-launch-gate',
    'beta-pilot-scenarios',
  ], [
    'tests/p3-launch-gate.mjs',
    'tests/p3-runner-contract.mjs',
    'tests/p3-doc-reference-integrity.mjs',
    'tests/p3-server-route-contract.mjs',
  ], [
    'owner license policy',
    'deployment target selection',
    'field pilot feedback acceptance',
    'backup restore owner acceptance',
  ], {
    readApis: ['getLaunchReadinessReport'],
    dataContracts: ['phase3LaunchReadiness', 'phase3LaunchReadinessGate'],
    gatePath: 'releaseGate.releaseReview',
    finalApprovalField: 'productionDeploymentApproved',
  }),
];

export function buildPhase3ProductizationMilestoneReview() {
  const rows = ROWS.map(copyRow);
  return {
    version: PHASE3_PRODUCTIZATION_MILESTONE_REVIEW_VERSION,
    scope: 'P3-M19 to P3-M20 integrated results and launch readiness',
    sourceDocs: [
      'docs/phase3/ROADMAP.md',
      'docs/phase3/IMPLEMENTATION_BACKLOG.md',
      'docs/phase3/QA_RELEASE_PLAN.md',
      'docs/phase3/PRODUCT_REQUIREMENTS.md',
    ],
    rows,
    summary: {
      milestoneCount: rows.length,
      productizationScopes: rows.flatMap((item) => item.productizationScopes),
      automatedEvidenceCount: rows.reduce((sum, item) => sum + item.automatedEvidence.length, 0),
      preliminaryCount: rows.length,
      productionReady: false,
      agentDecision: 'productization-owner-review-required',
    },
    agentUse: {
      readApi: 'getPhase3ProductizationMilestoneReview',
      primaryReviewApis: rows.flatMap((item) => item.contracts.readApis),
      rule: 'Use gate paths for integrated-result and launch review; final sign-off fields remain owner-controlled.',
    },
  };
}

function row(milestone, tickets, productizationScopes, automatedEvidence, remainingValidation, contracts) {
  return {
    milestone,
    tickets,
    productizationScopes,
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
    productizationScopes: [...item.productizationScopes],
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
