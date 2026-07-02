export const PHASE3_ELASTIC_MILESTONE_REVIEW_VERSION = 'p3-elastic-milestone-review-v1';

const ROWS = [
  row('P3-M10', ['P3-T46', 'P3-T47', 'P3-T48', 'P3-T49'], [
    'tests/p3-m10-materials.mjs',
    'tests/p3-section-properties.mjs',
  ], [
    'office-grade KS section database expansion',
    'owner-approved material catalog policy',
    'dedicated visual library panel hardening',
  ], {
    readApis: ['getMaterialSectionRegistry'],
    dataContracts: ['phase3MaterialSectionRegistry', 'phase3MaterialLibraryReport'],
  }),
  row('P3-M11', ['P3-T68', 'P3-T69', 'P3-T70', 'P3-T71', 'P3-T72'], [
    'tests/p3-m11-elastic-expansion.mjs',
  ], [
    'solver hardening for broader load-direction cases',
    'engineer review of unilateral-member envelope interpretation',
  ], {
    readApis: ['getElasticExpansionTrace'],
    dataContracts: ['phase3ElasticExpansionTrace', 'unilateralMemberTrace'],
  }),
  row('P3-M12', ['P3-T73', 'P3-T74', 'P3-T75'], [
    'tests/p3-m12-wall-slab.mjs',
  ], [
    'full 24-DOF shell finite-element stiffness assembly',
    'shell stress recovery and automatic meshing',
    'production wall/slab design validation',
  ], {
    readApis: ['getWallSlabEquivalentTrace'],
    dataContracts: ['phase3WallSlabEquivalentTrace', 'phase3WallSlabTrace', 'phase3ShellQuad4Trace'],
  }),
  row('P3-M13', ['P3-T76', 'P3-T77', 'P3-T78', 'P3-T79', 'P3-T80', 'P3-T81', 'P3-T82'], [
    'tests/p3-m13-loads-dynamics.mjs',
  ], [
    'project-specific KDS code exception review',
    'dynamic benchmark expansion with owner records',
    'shell buckling, follower load, and construction sequence exclusion review',
  ], {
    readApis: ['getLoadsV2Trace', 'getDynamicCompletenessTrace'],
    dataContracts: ['phase3LoadsV2Trace', 'phase3DynamicCompletenessTrace', 'globalBucklingTrace'],
  }),
];

const EXIT_CRITERIA = {
  'P3-M10': [
    criterion('M10-E1', 'Material and section schemas validate required elastic, strength, nonlinear, damping, and source fields.', 'tests/p3-m10-materials.mjs', 'docs/phase3/MATERIAL_SECTION_LIBRARY_PLAN.md'),
    criterion('M10-E2', 'Versioned registry resolves id@version references with scope priority and legacy warnings.', 'tests/p3-m10-materials.mjs', 'docs/phase3/MATERIAL_SECTION_LIBRARY_PLAN.md'),
    criterion('M10-E3', 'Parametric and seeded KS section properties are checked against library records.', 'tests/p3-section-properties.mjs', 'docs/phase3/MATERIAL_SECTION_LIBRARY_PLAN.md'),
    criterion('M10-E4', 'Library actions remain exposed for AI agents through list/get/upsert contracts.', 'tests/p3-m10-materials.mjs', 'docs/phase3/MATERIAL_SECTION_LIBRARY_PLAN.md'),
  ],
  'P3-M11': [
    criterion('M11-G1', 'Spring supports and settlement load vectors are traceable.', 'tests/p3-m11-elastic-expansion.mjs', 'docs/phase3/ELASTIC_ENGINE_COMPLETENESS_PLAN.md'),
    criterion('M11-G3', 'Truss, tension-only, and compression-only member behavior records unilateral iteration traces.', 'tests/p3-m11-elastic-expansion.mjs', 'docs/phase3/ELASTIC_ENGINE_COMPLETENESS_PLAN.md'),
    criterion('M11-G4', 'Member end offsets and rigid-zone clear lengths are available for demand recovery.', 'tests/p3-m11-elastic-expansion.mjs', 'docs/phase3/ELASTIC_ENGINE_COMPLETENESS_PLAN.md'),
    criterion('M11-G5', 'Partial, trapezoid, member point, and member moment loads expose fixed-end and station recovery traces.', 'tests/p3-m11-elastic-expansion.mjs', 'docs/phase3/ELASTIC_ENGINE_COMPLETENESS_PLAN.md'),
    criterion('M11-G6', 'Uniform and gradient temperature loads expose preliminary handcalc trace rows.', 'tests/p3-m11-elastic-expansion.mjs', 'docs/phase3/ELASTIC_ENGINE_COMPLETENESS_PLAN.md'),
  ],
  'P3-M12': [
    criterion('M12-G7', 'Wall mid-pier equivalent contract and pier-force recovery trace are available.', 'tests/p3-m12-wall-slab.mjs', 'docs/phase3/ELASTIC_ENGINE_COMPLETENESS_PLAN.md'),
    criterion('M12-G8', 'Semi-rigid diaphragm equivalent-brace redistribution contract is available.', 'tests/p3-m12-wall-slab.mjs', 'docs/phase3/ELASTIC_ENGINE_COMPLETENESS_PLAN.md'),
    criterion('M12-G7G8', 'Shell frame-link and wall/slab equivalent traces expose preliminary validation boundaries.', 'tests/p3-m12-wall-slab.mjs', 'docs/phase3/P3_M10_M13_ELASTIC_COMPLETENESS.md'),
  ],
  'P3-M13': [
    criterion('M13-G9', 'Wind v2 trace records story force derivation for review.', 'tests/p3-m13-loads-dynamics.mjs', 'docs/phase3/ELASTIC_ENGINE_COMPLETENESS_PLAN.md'),
    criterion('M13-G10', 'Seismic v2, RSA base-shear scaling, and torsion Ax traces are explicit.', 'tests/p3-m13-loads-dynamics.mjs', 'docs/phase3/ELASTIC_ENGINE_COMPLETENESS_PLAN.md'),
    criterion('M13-G11', 'Snow, soil, water, and uplift loads are generated as preliminary review load cases.', 'tests/p3-m13-loads-dynamics.mjs', 'docs/phase3/ELASTIC_ENGINE_COMPLETENESS_PLAN.md'),
    criterion('M13-G12', 'CQC modal combination output includes close-mode review report.', 'tests/p3-m13-loads-dynamics.mjs', 'docs/phase3/ELASTIC_ENGINE_COMPLETENESS_PLAN.md'),
    criterion('M13-G13', 'Linear global buckling trace and Euler screening helper are available.', 'tests/p3-m13-loads-dynamics.mjs', 'docs/phase3/ELASTIC_ENGINE_COMPLETENESS_PLAN.md'),
    criterion('M13-G14', 'Linear modal-superposition time-history trace uses per-mode Newmark traces.', 'tests/p3-m13-loads-dynamics.mjs', 'docs/phase3/ELASTIC_ENGINE_COMPLETENESS_PLAN.md'),
    criterion('M13-G15', 'Mass source trace converts selected vertical loads into modal and story-mass rows.', 'tests/p3-m13-loads-dynamics.mjs', 'docs/phase3/ELASTIC_ENGINE_COMPLETENESS_PLAN.md'),
  ],
};

export function buildPhase3ElasticMilestoneReview() {
  const rows = ROWS.map(copyRow);
  return {
    version: PHASE3_ELASTIC_MILESTONE_REVIEW_VERSION,
    scope: 'P3-M10 to P3-M13 elastic engine completeness',
    sourceDocs: [
      'docs/phase3/MATERIAL_SECTION_LIBRARY_PLAN.md',
      'docs/phase3/ELASTIC_ENGINE_COMPLETENESS_PLAN.md',
      'docs/phase3/P3_M10_M13_ELASTIC_COMPLETENESS.md',
    ],
    rows,
    summary: {
      milestoneCount: rows.length,
      automatedEvidenceCount: rows.reduce((sum, item) => sum + item.automatedEvidence.length, 0),
      exitCriteriaCount: rows.reduce((sum, item) => sum + item.exitCriteria.length, 0),
      exitCriteriaAutomatedCount: rows.reduce((sum, item) => sum + item.exitCriteria.filter((criteria) => criteria.status === 'automated').length, 0),
      preliminaryCount: rows.length,
      productionReady: false,
      agentDecision: 'elastic-completeness-engineer-review-required',
    },
    agentUse: {
      readApi: 'getPhase3ElasticMilestoneReview',
      primaryReviewApis: rows.flatMap((item) => item.contracts.readApis),
      rule: 'Treat M10 to M13 as traceable preliminary cores until engineering validation closes each limitation.',
    },
  };
}

function row(milestone, tickets, automatedEvidence, remainingValidation, contracts) {
  return {
    milestone,
    tickets,
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
    automatedEvidence: [...item.automatedEvidence],
    remainingValidation: [...item.remainingValidation],
    finalUseBlockedBy: [...item.finalUseBlockedBy],
    exitCriteria: criteria.map((criteriaRow) => ({ ...criteriaRow })),
    exitCriteriaSummary: summarizeExitCriteria(criteria),
    contracts: {
      readApis: [...item.contracts.readApis],
      dataContracts: [...item.contracts.dataContracts],
    },
  };
}

function criterion(id, requirement, evidence, source) {
  return {
    id,
    requirement,
    evidence,
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
