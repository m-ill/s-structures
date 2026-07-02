export const PHASE3_PLAN_ALIGNMENT_VERSION = 'p3-plan-alignment-v1';

const CORE_DOCS = [
  'PRODUCT_REQUIREMENTS.md',
  'ROADMAP.md',
  'IMPLEMENTATION_BACKLOG.md',
  'ARCHITECTURE.md',
  'SERVER_API_PLAN.md',
  'AUTH_ACCOUNT_PLAN.md',
  'PERSISTENCE_PLAN.md',
  'FRONTEND_PLAN.md',
  'IMPORT_DXF_DWG_PLAN.md',
  'IMPORT_POINT_CLOUD_PLAN.md',
  'MATERIAL_SECTION_LIBRARY_PLAN.md',
  'NONLINEAR_ENGINE_PLAN.md',
  'QA_RELEASE_PLAN.md',
  'DEVELOPMENT_FILE_MAP.md',
];

const STAGES = [
  stage('A', 'platform-backbone', 'P3-M0', 'P3-M4'),
  stage('B', 'input-pipeline', 'P3-M5', 'P3-M9'),
  stage('C', 'elastic-completeness', 'P3-M10', 'P3-M13'),
  stage('D', 'nonlinear-engine', 'P3-M14', 'P3-M16'),
  stage('E', 'detailed-design', 'P3-M17', 'P3-M18'),
  stage('F', 'productization', 'P3-M19', 'P3-M20'),
];

const ABSORBED_TICKETS = [
  { ticket: 'P3-T57', absorbedBy: ['P3-T76', 'P3-T77'], reason: 'early load item absorbed by wind and seismic v2' },
  { ticket: 'P3-T60', absorbedBy: ['P3-T77'], reason: 'torsion Ax item absorbed by seismic v2' },
];

const MILESTONES = [
  ms('P3-M0', ['P3-T01', 'P3-T02'], ['docs/phase3/DEVELOPMENT_FILE_MAP.md'], ['tests/m0-smoke.mjs']),
  ms('P3-M1', t(3, 7), ['docs/phase3/SERVER_API_PLAN.md'], ['tests/p3-server-api.mjs']),
  ms('P3-M2', t(8, 12), ['docs/phase3/AUTH_ACCOUNT_PLAN.md'], ['tests/p3-auth.mjs']),
  ms('P3-M3', t(13, 16), ['docs/phase3/PERSISTENCE_PLAN.md'], ['tests/p3-persistence.mjs']),
  ms('P3-M4', t(17, 21), ['docs/phase3/FRONTEND_PLAN.md'], ['tests/p3-app-shell.mjs', 'tests/p3-viewer-core.mjs']),
  ms('P3-M5', t(22, 25), ['docs/phase3/IMPORT_DXF_DWG_PLAN.md'], ['tests/p3-import-geometry.mjs']),
  ms('P3-M6', t(26, 31), ['docs/verification/P3_M6_IMPORT_VERIFICATION.md'], ['tests/p3-m6-dxf-import.mjs']),
  ms('P3-M7', t(32, 35), ['docs/verification/P3_M7_IMPORT_REVIEW_VERIFICATION.md'], ['tests/p3-m7-dwg-plan.mjs', 'tests/p3-m7-import-review-ui.mjs']),
  ms('P3-M8', t(36, 40), ['docs/verification/P3_M8_POINTCLOUD_LOAD_VERIFICATION.md'], ['tests/p3-pointcloud-load.mjs']),
  ms('P3-M9', t(41, 45), ['docs/verification/P3_M9_POINTCLOUD_EXTRACTION_VERIFICATION.md'], ['tests/p3-pointcloud-extraction.mjs', 'tests/p3-pointcloud-e2e.mjs']),
  ms('P3-M10', t(46, 49), ['docs/verification/P3_M10_MATERIAL_LIBRARY_VERIFICATION.md'], ['tests/p3-m10-materials.mjs', 'tests/p3-section-properties.mjs']),
  ms('P3-M11', t(68, 72), ['docs/verification/P3_M11_ELASTIC_EXPANSION_VERIFICATION.md'], ['tests/p3-m11-elastic-expansion.mjs']),
  ms('P3-M12', t(73, 75), ['docs/verification/P3_M12_WALL_SLAB_VERIFICATION.md'], ['tests/p3-m12-wall-slab.mjs']),
  ms('P3-M13', t(76, 82), ['docs/verification/P3_M13_LOADS_DYNAMICS_VERIFICATION.md'], ['tests/p3-m13-loads-dynamics.mjs']),
  ms('P3-M14', t(50, 53), ['docs/verification/P3_M14_NONLINEAR_GEOMETRY_VERIFICATION.md'], ['tests/p3-m14-nonlinear-geometry.mjs']),
  ms('P3-M15', t(54, 56), ['docs/verification/P3_M15_HINGE_CONTROL_VERIFICATION.md'], ['tests/p3-m15-nonlinear-hinge-control.mjs']),
  ms('P3-M16', t(83, 86), ['docs/verification/P3_M16_FIBER_NLTH_VERIFICATION.md'], ['tests/p3-m16-nonlinear-fiber-nlth.mjs']),
  ms('P3-M17', t(87, 90), ['docs/verification/DESIGN_MODULE_VERIFICATION.md'], ['tests/p3-design-rc.mjs']),
  ms('P3-M18', t(91, 95), ['docs/verification/DESIGN_MODULE_VERIFICATION.md'], ['tests/p3-design-steel-foundation.mjs']),
  ms('P3-M19', ['P3-T58', 'P3-T59', 'P3-T61', 'P3-T62'], ['docs/verification/DESIGN_MODULE_VERIFICATION.md'], ['tests/p3-m19-integrated-report.mjs']),
  ms('P3-M20', t(63, 67), ['docs/verification/P3_M20_LAUNCH_READINESS_VERIFICATION.md'], ['tests/p3-launch-gate.mjs']),
];

export function buildPhase3PlanAlignmentReport(manifest = {}) {
  const manifestMilestones = new Set((manifest.milestones || []).map((row) => row.id));
  const readApis = new Set(manifest.readApis || []);
  const rows = MILESTONES.map((row) => ({
    ...row,
    manifestListed: manifestMilestones.has(row.id),
    evidenceReady: row.docs.length > 0 && row.tests.length > 0,
  }));
  const missing = rows.filter((row) => !row.manifestListed || !row.evidenceReady);
  return {
    version: PHASE3_PLAN_ALIGNMENT_VERSION,
    sourceDocs: CORE_DOCS.map((name) => `docs/phase3/${name}`),
    sourceDocCount: CORE_DOCS.length,
    stages: STAGES,
    milestones: rows,
    activeTicketCount: new Set(rows.flatMap((row) => row.tickets)).size,
    absorbedTickets: ABSORBED_TICKETS,
    plannedTicketCount: new Set([
      ...rows.flatMap((row) => row.tickets),
      ...ABSORBED_TICKETS.map((row) => row.ticket),
    ]).size,
    status: missing.length ? 'REVIEW' : 'OK',
    missing,
    agentReadable: readApis.has('getPhase3PlanAlignment'),
    notes: [
      'Report follows existing Phase 3 planning documents only.',
      'Preliminary rows still require engineer and owner review before production sign-off.',
    ],
  };
}

function ms(id, tickets, docs, tests) {
  return { id, tickets, docs, tests };
}

function stage(id, name, from, to) {
  return { id, name, from, to };
}

function t(from, to) {
  return Array.from({ length: to - from + 1 }, (_, index) => `P3-T${String(from + index).padStart(2, '0')}`);
}
