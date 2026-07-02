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

const EXIT_CRITERIA = {
  'P3-M19': [
    criterion('M19-T58', 'Integrated result postprocessing exposes result rows, nonlinear capacity/step rows, detailed-design rows, analysis status, and trace readiness.', 'tests/p3-m19-integrated-report.mjs', 'P3-T58', 'docs/phase3/ROADMAP.md'),
    criterion('M19-T59', 'Calculation package reports method, limitation, ticket coverage, and detailed-design review state without hiding unresolved issues.', 'tests/p3-m19-integrated-report.mjs', 'P3-T59', 'docs/phase3/ROADMAP.md'),
    criterion('M19-T61', 'Workflow approval, lock, revoke, and editability consistency are exposed as reviewable state.', 'tests/p3-m19-integrated-report.mjs', 'P3-T61', 'docs/phase3/IMPLEMENTATION_BACKLOG.md'),
    criterion('M19-T62', 'Benchmark and representative regression evidence remains connected to the integrated result gate.', 'npm.cmd run test:p3', 'P3-T62', 'docs/phase3/QA_RELEASE_PLAN.md'),
    criterion('M19-GATE', 'Integrated gate keeps final structural sign-off separate from trace-ready integrated results.', 'tests/p3-productization-milestone-review.mjs', 'P3-T58/P3-T62', 'docs/phase3/PRODUCT_REQUIREMENTS.md'),
  ],
  'P3-M20': [
    criterion('M20-T63', 'Packaging smoke covers web/server launch path and install mode evidence.', 'tests/p3-launch-gate.mjs', 'P3-T63', 'docs/phase3/QA_RELEASE_PLAN.md'),
    criterion('M20-T64', 'License policy record is present and reviewable before release.', 'tests/p3-launch-gate.mjs', 'P3-T64', 'docs/phase3/QA_RELEASE_PLAN.md'),
    criterion('M20-T65', 'Manual, onboarding, and agent-contract references match the runtime manifest.', 'tests/p3-launch-gate.mjs', 'P3-T65', 'docs/phase3/QA_RELEASE_PLAN.md'),
    criterion('M20-T66', 'Performance, security, backup/restore, and design-verification launch evidence records are present.', 'tests/p3-launch-gate.mjs', 'P3-T66', 'docs/phase3/QA_RELEASE_PLAN.md'),
    criterion('M20-T67', 'Ten named beta-pilot scenario reports are present for launch review.', 'tests/p3-launch-gate.mjs', 'P3-T67', 'docs/phase3/QA_RELEASE_PLAN.md'),
    criterion('M20-GATE', 'Launch readiness keeps owner deployment approval separate from green automated launch evidence.', 'tests/p3-productization-milestone-review.mjs', 'P3-T63/P3-T67', 'docs/phase3/QA_RELEASE_PLAN.md'),
  ],
};

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
      exitCriteriaCount: rows.reduce((sum, item) => sum + item.exitCriteria.length, 0),
      exitCriteriaAutomatedCount: rows.reduce((sum, item) => sum + item.exitCriteria.filter((criteria) => criteria.status === 'automated').length, 0),
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
  const criteria = EXIT_CRITERIA[item.milestone] || [];
  return {
    ...item,
    tickets: [...item.tickets],
    productizationScopes: [...item.productizationScopes],
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

function criterion(id, requirement, evidence, ticket, source) {
  return {
    id,
    requirement,
    evidence,
    ticket,
    source,
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
