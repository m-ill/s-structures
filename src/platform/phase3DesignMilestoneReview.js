export const PHASE3_DESIGN_MILESTONE_REVIEW_VERSION = 'p3-design-milestone-review-v1';

const ROWS = [
  row('P3-M17', ['P3-T87', 'P3-T88', 'P3-T89', 'P3-T90'], [
    'rc-beam',
    'rc-column',
    'rc-wall',
    'rc-slab',
  ], [
    'tests/p3-design-rc.mjs',
  ], [
    'final code clause selection',
    'seismic detailing and constructability review',
    'reinforcement drawing production',
  ], {
    readApis: ['getRcDetailedDesignReport'],
    dataContracts: ['phase3RcDetailedDesignReport', 'phase3RcDesignGate', 'phase3DesignFormulaTrace'],
    gatePath: 'rcDesignGate.rcReview',
    finalApprovalField: 'finalPermitDesign',
  }),
  row('P3-M18', ['P3-T91', 'P3-T92', 'P3-T93', 'P3-T94', 'P3-T95'], [
    'steel-member',
    'connection-base-plate',
    'foundation',
    'issue-formula-integration',
    'serviceability-hook',
  ], [
    'tests/p3-design-steel-foundation.mjs',
  ], [
    'fabrication detailing and construction drawing approval',
    'geotechnical settlement and bearing certification',
    'final permit calculation approval',
  ], {
    readApis: ['getP3DetailedDesignReport'],
    dataContracts: ['phase3DetailedDesignIntegration', 'phase3DetailedDesignGate', 'phase3DesignFormulaTrace'],
    gatePath: 'designGate.designReview',
    finalApprovalField: 'finalPermitDesign',
  }),
];

export function buildPhase3DesignMilestoneReview() {
  const rows = ROWS.map(copyRow);
  return {
    version: PHASE3_DESIGN_MILESTONE_REVIEW_VERSION,
    scope: 'P3-M17 to P3-M18 detailed design modules',
    sourceDocs: [
      'docs/phase3/DESIGN_MODULES_PLAN.md',
      'docs/phase3/ROADMAP.md',
      'docs/phase3/IMPLEMENTATION_BACKLOG.md',
    ],
    rows,
    summary: {
      milestoneCount: rows.length,
      designScopes: rows.flatMap((item) => item.designScopes),
      automatedEvidenceCount: rows.reduce((sum, item) => sum + item.automatedEvidence.length, 0),
      preliminaryCount: rows.length,
      productionReady: false,
      agentDecision: 'detailed-design-engineer-review-required',
    },
    agentUse: {
      readApi: 'getPhase3DesignMilestoneReview',
      primaryReviewApis: rows.flatMap((item) => item.contracts.readApis),
      rule: 'Use gate paths for detailed-design review; final permit and construction approval remain engineer-controlled.',
    },
  };
}

function row(milestone, tickets, designScopes, automatedEvidence, remainingValidation, contracts) {
  return {
    milestone,
    tickets,
    designScopes,
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
    designScopes: [...item.designScopes],
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
