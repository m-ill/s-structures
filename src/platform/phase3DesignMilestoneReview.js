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

const EXIT_CRITERIA = {
  'P3-M17': [
    criterion('M17-T87', 'RC beam flexure, shear, torsion warning, serviceability, bar schedule, development, and splice trace are available.', 'tests/p3-design-rc.mjs', 'P3-T87'),
    criterion('M17-T88', 'RC column PM curve, slenderness, tie schedule, and column schedule are available.', 'tests/p3-design-rc.mjs', 'P3-T88'),
    criterion('M17-T89', 'RC wall pier PM, in-plane shear, reinforcement ratios, and boundary flag are available.', 'tests/p3-design-rc.mjs', 'P3-T89'),
    criterion('M17-T90', 'RC slab one-way/two-way mode, punching shear, and reinforcement schedule are available.', 'tests/p3-design-rc.mjs', 'P3-T90'),
    criterion('M17-GATE', 'RC gate exposes complete role coverage, formula trace, issue rows, analysis status, and final permit-design separation.', 'tests/p3-design-rc.mjs', 'P3-T87/P3-T90'),
  ],
  'P3-M18': [
    criterion('M18-T91', 'Steel classification, compression, flexure LTB, shear, and H1 interaction trace are available.', 'tests/p3-design-steel-foundation.mjs', 'P3-T91'),
    criterion('M18-T92', 'Brace, bolt, weld, base-plate, and connection demand traces are available.', 'tests/p3-design-steel-foundation.mjs', 'P3-T92'),
    criterion('M18-T93', 'Spread footing, combined footing, mat v1, and pile group v1 traces are available.', 'tests/p3-design-steel-foundation.mjs', 'P3-T93'),
    criterion('M18-T94', 'Integrated report links formulas, issue rows, status rows, and registered calculation trace references.', 'tests/p3-design-steel-foundation.mjs', 'P3-T94'),
    criterion('M18-T95', 'Serviceability evidence covers member deflection, story drift, and floor vibration hooks.', 'tests/p3-design-steel-foundation.mjs', 'P3-T95'),
    criterion('M18-GATE', 'Detailed design gate exposes ticket coverage, issue review, analysis status, and final permit-design separation.', 'tests/p3-design-steel-foundation.mjs', 'P3-T91/P3-T95'),
  ],
};

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
      exitCriteriaCount: rows.reduce((sum, item) => sum + item.exitCriteria.length, 0),
      exitCriteriaAutomatedCount: rows.reduce((sum, item) => sum + item.exitCriteria.filter((criteria) => criteria.status === 'automated').length, 0),
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
  const criteria = EXIT_CRITERIA[item.milestone] || [];
  return {
    ...item,
    tickets: [...item.tickets],
    designScopes: [...item.designScopes],
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
    source: 'docs/phase3/DESIGN_MODULES_PLAN.md',
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
