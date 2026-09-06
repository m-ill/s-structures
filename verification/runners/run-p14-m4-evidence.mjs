import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { stableHash } from '../../src/core/stableHash.js';
import {
  buildPhase14ReleaseManifest,
  createPhase14QualificationRecord,
  PHASE14_CAPABILITIES,
  validatePhase14ReleaseManifest,
} from '../framework/phase14/index.js';

const sourceRevision = git(['rev-parse', 'HEAD']).trim();
const generatedAt = new Date().toISOString();
const testCommands = [
  ['tools/run-phase14-tests.mjs', 'M4'],
  ['tests/p8-m8-dynamic-domain.mjs'],
  ['tests/p7-m9-member-forces.mjs'],
  ['tests/p7-m9-modal-normalization.mjs'],
  ['tests/p10-m7-dynamics-extension.mjs'],
  ['tests/p5-analysis-runners.mjs'],
  ['tests/m34-detailed-report.mjs'],
];
for (const args of testCommands) execFileSync(process.execPath, args, { stdio: 'inherit' });

const productionFiles = [
  'src/core/massSchema.js',
  'src/core/validation.js',
  'src/dynamics/mass6dof.js',
  'src/dynamics/modalDiaphragm.js',
  'src/dynamics/modal.js',
  'src/nonlinear/dynamics/massDomain.js',
  'src/results/rsa/baseShearScale.js',
  'src/results/rsaTrace.js',
  'src/compute/product/analysisCaseEngine.js',
  'src/ui/indexAgentActions.js',
  'src/report/detailedReport.js',
  'tools/sstructures-modal-rsa.mjs',
];
const buildHash = stableHash(Object.fromEntries(await Promise.all(
  productionFiles.map(async (path) => [path, await readFile(path, 'utf8')]),
)));
const priorEvidence = await Promise.all([
  'verification/evidence/validation/phase14/p14-m1-winkler-implementation.json',
  'verification/evidence/validation/phase14/p14-m2-linear-tha-implementation.json',
  'verification/evidence/validation/phase14/p14-m3-modal-combination-implementation.json',
].map(async (path) => JSON.parse(await readFile(path, 'utf8'))));
const priorByCapability = new Map(priorEvidence.map((item) => [item.qualificationRecord.capabilityId, item.qualificationRecord]));
const qualifications = PHASE14_CAPABILITIES.map((capability) => {
  if (priorByCapability.has(capability.id)) return recreate(priorByCapability.get(capability.id));
  if (capability.id === 'SR2B') {
    return createPhase14QualificationRecord('SR2B', {
      implemented: true,
      internallyVerified: true,
      hashes: { buildHash },
      limitations: [
        'SR2b independent benchmark and MIDAS/STRIX cross-solver comparison have not been run.',
        'Rigid diaphragm implementation constrains Ux, Uy and Rz; out-of-plane rigid-floor kinematics are outside this milestone.',
      ],
    });
  }
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

const verificationRecords = [
  record('P14-MASS-01', true, 'shared finite nonnegative 3/6-component node-mass schema and Agent validation'),
  record('P14-MASS-02', true, 'full six-DOF diagonal lumped mass and mass-source translation deduplication'),
  record('P14-MASS-03', true, 'rigid-diaphragm transpose(T)-M-T coupling and polar-inertia conservation'),
  record('P14-MASS-04', true, 'direct rotational inertia plus translational offset ownership audit'),
  record('P14-MASS-05', true, 'rotational modal DOFs, mass normalization and coordinate-vector scaling'),
  record('P14-RSA-6D-01', true, 'Ux/Uy/Rz, inertia moment and frame member-force recovery through RSA'),
  record('P14-MASS-06', true, 'CLI, Agent, result trace and detailed-report surface parity'),
  record('P14-SR2B-01', false, 'NOT_RUN: benchmark execution is intentionally deferred until engine development is complete'),
];
const evidenceCore = {
  version: 'p14-m4-six-dof-mass-rsa-implementation-evidence-v1',
  phase: 'Phase 14',
  milestone: 'P14-M4',
  status: verificationRecords.slice(0, 7).every((row) => row.status === 'PASS') ? 'INTERNALLY_VERIFIED' : 'FAIL',
  generatedAt,
  sourceRevision,
  buildHash,
  benchmarkExecutionStarted: false,
  externalSolverRuntimeDependency: false,
  capabilityState: 'internally-verified',
  independentQualification: 'NOT_RUN',
  crossSolverComparison: 'NOT_RUN',
  releaseAllowed: false,
  designTransferAllowed: false,
  productionFiles,
  testCommands: testCommands.map((args) => [process.execPath, ...args]),
  verificationRecords,
  qualificationRecord: qualifications.find((row) => row.capabilityId === 'SR2B'),
  releaseManifestHash: releaseManifest.manifestHash,
};
const evidence = { ...evidenceCore, artifactHash: stableHash(evidenceCore) };
await mkdir('verification/evidence/validation/phase14', { recursive: true });
await writeJson('verification/specs/phase14/release-manifest.json', releaseManifest);
await writeJson('verification/evidence/validation/phase14/p14-m4-six-dof-mass-rsa-implementation.json', evidence);
console.log(JSON.stringify({ ok: evidence.status === 'INTERNALLY_VERIFIED', milestone: evidence.milestone, status: evidence.status, buildHash, benchmarkExecutionStarted: false, releaseAllowed: false, manifestHash: releaseManifest.manifestHash }, null, 2));

function recreate(previousRecord = {}) {
  return createPhase14QualificationRecord(previousRecord.capabilityId, {
    implemented: previousRecord.implemented,
    internallyVerified: previousRecord.internallyVerified,
    independentlyQualified: previousRecord.independentlyQualified,
    crossSolverCompared: previousRecord.crossSolverCompared,
    releaseAllowed: false,
    designTransferAllowed: false,
    hashes: previousRecord.hashes,
    limitations: previousRecord.limitations,
    invalidated: previousRecord.invalidated,
    invalidationReasons: previousRecord.invalidationReasons,
  });
}
function git(args) { return execFileSync('git', ['-c', 'safe.directory=C:/Users/mill/Downloads/dcr/S-Structures-main', ...args], { encoding: 'utf8' }); }
function record(id, pass, note) { return { id, status: pass ? 'PASS' : 'NOT_RUN', note }; }
async function writeJson(path, value) { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
