import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { stableHash } from '../../src/core/stableHash.js';
import {
  buildPhase14ReleaseManifest,
  createPhase14QualificationRecord,
  PHASE14_CAPABILITIES,
  validatePhase14ReleaseManifest,
} from '../framework/phase14/index.js';

const generatedAt = new Date().toISOString();
const sourceRevision = git(['rev-parse', 'HEAD']).trim();
const testCommands = [
  ['tools/run-phase14-tests.mjs', '--from=5', '--to=10'],
  ['tests/m2-linear3d.mjs'],
  ['tests/p6-sparse-solver.mjs'],
  ['tests/p10-m9a-wall-membrane.mjs'],
  ['tests/p10-m9b-slab-plate.mjs'],
  ['tests/p10-m9b-plate-qualification.mjs'],
  ['tests/p8-m5-production-pushover.mjs'],
  ['tests/p8-m7-production-arc.mjs'],
  ['tests/m34-detailed-report.mjs'],
];
for (const args of testCommands) execFileSync(process.execPath, args, { stdio: 'inherit' });

const productionFiles = [
  'src/solver/shell/shellElementMath.js',
  'src/solver/shell/wallMembraneQm6.js',
  'src/solver/shell/membraneWorkflow.js',
  'src/solver/shell/membraneRobustness.js',
  'src/solver/shell/slabPlateMitc4.js',
  'src/solver/shell/plateWorkflow.js',
  'src/solver/shell/thickPlateQualification.js',
  'src/solver/shell/unsupportedRotationFloor.js',
  'src/solver/shell/shellStabilization.js',
  'src/solver/linear3dAssembly.js',
  'src/nonlinear/equilibrium/loadControl.js',
  'src/nonlinear/pushover/productionPushover.js',
  'src/nonlinear/pushover/qualificationFixture.js',
  'src/report/membraneWorkflowReport.js',
  'src/report/plateWorkflowReport.js',
  'src/report/shellStabilizationReport.js',
  'src/report/pushoverQualificationReport.js',
  'tools/sstructures-membrane.mjs',
  'tools/sstructures-plate.mjs',
];
const buildHash = stableHash(Object.fromEntries(await Promise.all(productionFiles.map(async (path) => [path, await readFile(path, 'utf8')]))));
const priorPaths = [1, 2, 3, 4].map((milestone) => `verification/evidence/validation/phase14/p14-m${milestone}-${['winkler', 'linear-tha', 'modal-combination', 'six-dof-mass-rsa'][milestone - 1]}-implementation.json`);
const priorEvidence = await Promise.all(priorPaths.map(async (path) => JSON.parse(await readFile(path, 'utf8'))));
const priorByCapability = new Map(priorEvidence.map((item) => [item.qualificationRecord.capabilityId, item.qualificationRecord]));
const milestoneCapabilities = new Map([
  ['SB2', 'P14-M5'], ['SB3', 'P14-M6'], ['SB5', 'P14-M7'], ['SB6', 'P14-M8'], ['P3S2-SS', 'P14-M9'], ['SP1', 'P14-M10'],
]);
const qualifications = PHASE14_CAPABILITIES.map((capability) => {
  if (priorByCapability.has(capability.id)) return recreate(priorByCapability.get(capability.id));
  if (milestoneCapabilities.has(capability.id)) return createPhase14QualificationRecord(capability.id, {
    implemented: true,
    internallyVerified: true,
    hashes: { buildHash },
    limitations: limitations(capability.id),
  });
  return createPhase14QualificationRecord(capability.id);
});
const previous = JSON.parse(await readFile('verification/specs/phase14/release-manifest.json', 'utf8'));
const releaseManifest = buildPhase14ReleaseManifest({
  qualifications,
  generatedAt,
  sourceRevision,
  baselineHash: previous.baselineHash,
  requirementTraceComplete: true,
  fullRegressionPassed: false,
  mandatoryFailureCount: 0,
  unapprovedSkipCount: 0,
  openCriticalHighCount: 0,
  externalSolverRuntimeDependency: false,
  externalSolverProcessCount: 0,
  migrationRollbackPassed: false,
  surfaceParityPassed: false,
  performanceSecurityAccessibilityPassed: false,
  finalDesignTransferApproved: false,
});
const validation = validatePhase14ReleaseManifest(releaseManifest);
if (!validation.ok) throw new Error(`Phase 14 manifest invalid: ${validation.errors.join(', ')}`);

const descriptors = [
  ['P14-M5', 'SB2', 'p14-m5-membrane-stress-implementation.json', ['structured mesh lineage and geometry QA', 'raw/extrapolated/averaged membrane stress trace', 'consistent edge traction equilibrium and convergence']],
  ['P14-M6', 'SB3', 'p14-m6-distorted-membrane-implementation.json', ['Cook membrane generation and distortion criteria', 'compatible/enhanced/drilling energy decomposition', 'coordinate transform and mesh convergence guards']],
  ['P14-M7', 'SB5', 'p14-m7-thin-plate-implementation.json', ['MITC4 plate workflow and boundary templates', 'pressure and exact central point load recovery', 'center displacement/moment/shear and mesh convergence']],
  ['P14-M8', 'SB6', 'p14-m8-thick-plate-implementation.json', ['bending/transverse-shear stiffness and energy split', 'a/t, aspect and mesh qualification envelope', 'shear-factor sensitivity and thin-limit recovery']],
  ['P14-M9', 'P3S2-SS', 'p14-m9-shell-stabilization-implementation.json', ['drilling alpha independent sweep', 'rigid-null unsupported rotation floor', 'MAC and physical/stabilization mode classifier']],
  ['P14-M10', 'SP1', 'p14-m10-production-pushover-implementation.json', ['load/displacement/arc-length control routing', 'adaptive cutback and rollback audit', 'neutral explicit M-theta fixture and result/report trace']],
];
await mkdir('verification/evidence/validation/phase14', { recursive: true });
for (const [milestone, capabilityId, filename, checks] of descriptors) {
  const verificationRecords = [
    ...checks.map((note, index) => ({ id: `${milestone}-INT-${String(index + 1).padStart(2, '0')}`, status: 'PASS', note })),
    { id: `${milestone}-BENCH`, status: 'NOT_RUN', note: 'Independent benchmark execution is intentionally deferred until engine development is complete.' },
  ];
  const core = {
    version: `p14-${milestone.toLowerCase()}-implementation-evidence-v1`,
    phase: 'Phase 14', milestone, status: 'INTERNALLY_VERIFIED', generatedAt, sourceRevision, buildHash,
    benchmarkExecutionStarted: false,
    externalSolverRuntimeDependency: false,
    capabilityState: 'internally-verified',
    independentQualification: 'NOT_RUN',
    crossSolverComparison: capabilityId === 'P3S2-SS' ? 'NOT_APPLICABLE-CUSTOM-CRITERION' : 'NOT_RUN',
    releaseAllowed: false,
    designTransferAllowed: false,
    productionFiles,
    testCommands: testCommands.map((args) => [process.execPath, ...args]),
    verificationRecords,
    qualificationRecord: qualifications.find((row) => row.capabilityId === capabilityId),
    releaseManifestHash: releaseManifest.manifestHash,
  };
  await writeJson(`verification/evidence/validation/phase14/${filename}`, { ...core, artifactHash: stableHash(core) });
}
await writeJson('verification/specs/phase14/release-manifest.json', releaseManifest);
console.log(JSON.stringify({ ok: true, milestones: descriptors.map((row) => row[0]), status: 'INTERNALLY_VERIFIED', buildHash, benchmarkExecutionStarted: false, releaseAllowed: false, manifestHash: releaseManifest.manifestHash }, null, 2));

function recreate(record) { return createPhase14QualificationRecord(record.capabilityId, { ...record, releaseAllowed: false, designTransferAllowed: false }); }
function limitations(id) {
  const common = 'Independent benchmark and MIDAS/STRIX cross-solver comparison have not been run.';
  if (id === 'P3S2-SS') return ['P3S2-SS is a custom S-Structures criterion and is not an identical STRIX P3S2 claim.', 'Independent custom stabilization qualification has not been run.'];
  if (id === 'SP1') return [common, 'Post-peak external corpus and final design-transfer approval remain blocked.'];
  return [common, 'Model-level mesh convergence and final design-transfer approval remain blocked.'];
}
function git(args) { return execFileSync('git', ['-c', 'safe.directory=C:/Users/mill/Downloads/dcr/S-Structures-main', ...args], { encoding: 'utf8' }); }
async function writeJson(path, value) { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
