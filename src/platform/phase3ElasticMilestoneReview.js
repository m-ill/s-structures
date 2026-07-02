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
  return {
    ...item,
    tickets: [...item.tickets],
    automatedEvidence: [...item.automatedEvidence],
    remainingValidation: [...item.remainingValidation],
    finalUseBlockedBy: [...item.finalUseBlockedBy],
    contracts: {
      readApis: [...item.contracts.readApis],
      dataContracts: [...item.contracts.dataContracts],
    },
  };
}
