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

const CORE_SCENARIOS = ['S1-drawing-based-review', 'S2-point-cloud-existing-model', 'S3-custom-material-review', 'S4-nonlinear-safety-review', 'S5-workflow-approval'];

const FUNCTIONAL_REQUIREMENTS = [
  fr(1, ['P3-M2']), fr(2, ['P3-M1', 'P3-M2']), fr(3, ['P3-M3']), fr(4, ['P3-M3']),
  fr(5, ['P3-M6']), fr(6, ['P3-M7']), fr(7, ['P3-M7']), fr(8, ['P3-M7', 'P3-M9']),
  fr(9, ['P3-M8']), fr(10, ['P3-M9']), fr(11, ['P3-M10']), fr(12, ['P3-M10']),
  fr(13, ['P3-M10']), fr(14, ['P3-M14']), fr(15, ['P3-M15']), fr(16, ['P3-M19']),
  fr(17, ['P3-M19']), fr(18, ['P3-M20']), fr(19, ['P3-M20']), fr(20, ['P3-M0', 'P3-M20']),
  fr(21, ['P3-M11']), fr(22, ['P3-M11']), fr(23, ['P3-M12']), fr(24, ['P3-M13']),
  fr(25, ['P3-M13']), fr(26, ['P3-M13']), fr(27, ['P3-M16']), fr(28, ['P3-M16']),
  fr(29, ['P3-M17']), fr(30, ['P3-M18']), fr(31, ['P3-M18']), fr(32, ['P3-M18']),
];

const NON_FUNCTIONAL_REQUIREMENTS = [
  nfr(1, 'point-cloud-load-performance', ['P3-M8', 'P3-M20']),
  nfr(2, 'point-cloud-render-performance', ['P3-M8', 'P3-M20']),
  nfr(3, 'elastic-analysis-performance', ['P3-M13', 'P3-M20']),
  nfr(4, 'storage-round-trip', ['P3-M1', 'P3-M3']),
  nfr(5, 'security', ['P3-M2', 'P3-M20']),
  nfr(6, 'full-suite-green', ['P3-M20']),
  nfr(7, 'browser-node-portability', ['P3-M1', 'P3-M4']),
  nfr(8, 'zero-dependency-policy', ['P3-M0']),
];

const SUCCESS_CRITERIA = [
  success('drawing-import', ['P3-M6', 'P3-M7']),
  success('point-cloud-import', ['P3-M8', 'P3-M9']),
  success('custom-material-trace', ['P3-M10']),
  success('elastic-completeness', ['P3-M11', 'P3-M12', 'P3-M13']),
  success('nonlinear-benchmarks', ['P3-M14', 'P3-M15', 'P3-M16']),
  success('design-modules', ['P3-M17', 'P3-M18', 'P3-M19']),
  success('platform-e2e', ['P3-M1', 'P3-M2', 'P3-M3', 'P3-M4']),
  success('qa-release-gate', ['P3-M20']),
  success('pilot-reports', ['P3-M20']),
];

const RELEASE_GATES = Array.from({ length: 14 }, (_, index) => `G${index + 1}`);

const ARCHITECTURE_DECISIONS = [
  decision(1, 'language', 'javascript-esm'),
  decision(2, 'server-framework', 'node-http-router'),
  decision(3, 'password-hash', 'node-crypto-scrypt'),
  decision(4, 'session-token', 'hmac-sha256-token'),
  decision(5, 'storage-v1', 'file-json-blob-data'),
  decision(6, 'viewer', 'webgl2-module'),
  decision(7, 'dxf', 'ascii-dxf-parser'),
  decision(8, 'dwg', 'oda-cli-adapter'),
  decision(9, 'heavy-preprocess', 'web-worker-transferable'),
  decision(10, 'desktop-packaging', 'electron-wrapper-decision-at-m20'),
];

const MODULE_BOUNDARIES = [
  boundary('server-to-src', 'server may import core schema/migration only; analysis engine stays in browser'),
  boundary('app-to-ui', 'app shell mounts ui modules; ui does not own app routing'),
  boundary('import-to-core', 'importers output ImportCandidate; core factory confirms model'),
  boundary('viewer-readonly', 'viewer renders and selects; it does not mutate model'),
  boundary('nonlinear-to-solver', 'nonlinear owns state/control while sharing element and assembly contracts'),
];

const FILE_ROUTING = [
  route('server/', 'node server routes auth store', 'docs/phase3/SERVER_API_PLAN.md'),
  route('src/app/', 'app shell routes api client views', 'docs/phase3/FRONTEND_PLAN.md'),
  route('src/viewer/', 'WebGL2 point cloud and model viewer', 'docs/phase3/FRONTEND_PLAN.md'),
  route('src/import/', 'ImportCandidate geometry pipeline', 'docs/phase3/IMPORT_DXF_DWG_PLAN.md'),
  route('src/import/pointcloud/', 'point-cloud loader preprocess extraction worker', 'docs/phase3/IMPORT_POINT_CLOUD_PLAN.md'),
  route('src/materials/', 'material and section registry', 'docs/phase3/MATERIAL_SECTION_LIBRARY_PLAN.md'),
  route('src/nonlinear/', 'nonlinear state elements hinges fiber control dynamics', 'docs/phase3/NONLINEAR_ENGINE_PLAN.md'),
  route('src/design/', 'rc steel connection foundation design modules', 'docs/phase3/DESIGN_MODULES_PLAN.md'),
  route('src/standards/', 'code formula and load standard registry', 'docs/phase3/DEVELOPMENT_FILE_MAP.md'),
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
  const milestoneIds = new Set(rows.map((row) => row.id));
  const requirementCoverage = FUNCTIONAL_REQUIREMENTS.map((row) => ({
    ...row,
    covered: row.milestones.every((id) => milestoneIds.has(id)),
  }));
  const nfrCoverage = NON_FUNCTIONAL_REQUIREMENTS.map((row) => ({
    ...row,
    covered: row.milestones.every((id) => milestoneIds.has(id)),
  }));
  const successCoverage = SUCCESS_CRITERIA.map((row) => ({
    ...row,
    covered: row.milestones.every((id) => milestoneIds.has(id)),
  }));
  const requirementsOk = requirementCoverage.every((row) => row.covered) &&
    nfrCoverage.every((row) => row.covered) &&
    successCoverage.every((row) => row.covered) &&
    RELEASE_GATES.length >= 12;
  const architectureOk = ARCHITECTURE_DECISIONS.length === 10 &&
    MODULE_BOUNDARIES.length >= 5 &&
    FILE_ROUTING.length >= 8;
  return {
    version: PHASE3_PLAN_ALIGNMENT_VERSION,
    sourceDocs: CORE_DOCS.map((name) => `docs/phase3/${name}`),
    sourceDocCount: CORE_DOCS.length,
    scenarios: CORE_SCENARIOS,
    stages: STAGES,
    milestones: rows,
    requirements: {
      functional: requirementCoverage,
      nonFunctional: nfrCoverage,
      successCriteria: successCoverage,
      launchGates: RELEASE_GATES,
      ok: requirementsOk,
    },
    architecture: {
      decisions: ARCHITECTURE_DECISIONS,
      moduleBoundaries: MODULE_BOUNDARIES,
      fileRouting: FILE_ROUTING,
      ok: architectureOk,
    },
    activeTicketCount: new Set(rows.flatMap((row) => row.tickets)).size,
    absorbedTickets: ABSORBED_TICKETS,
    plannedTicketCount: new Set([
      ...rows.flatMap((row) => row.tickets),
      ...ABSORBED_TICKETS.map((row) => row.ticket),
    ]).size,
    status: missing.length || !requirementsOk || !architectureOk ? 'REVIEW' : 'OK',
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

function fr(number, milestones) {
  return { id: `FR-${String(number).padStart(2, '0')}`, milestones };
}

function nfr(number, name, milestones) {
  return { id: `NFR-${String(number).padStart(2, '0')}`, name, milestones };
}

function success(id, milestones) {
  return { id, milestones };
}

function decision(number, topic, choice) {
  return { id: `D${number}`, topic, choice, source: 'docs/phase3/ARCHITECTURE.md' };
}

function boundary(id, rule) {
  return { id, rule, source: 'docs/phase3/ARCHITECTURE.md' };
}

function route(path, role, source) {
  return { path, role, source };
}

function t(from, to) {
  return Array.from({ length: to - from + 1 }, (_, index) => `P3-T${String(from + index).padStart(2, '0')}`);
}
