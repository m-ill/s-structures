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
  ['tools/run-phase14-tests.mjs', 'M2'],
  ['tests/p10-m7-dynamics-extension.mjs'],
  ['tests/p3-m13-loads-dynamics.mjs'],
  ['tests/p7-m10-buckling-tha-integrity.mjs'],
  ['tests/m34-detailed-report.mjs'],
];
for (const args of testCommands) execFileSync(process.execPath, args, { stdio: 'inherit' });

const productionFiles = [
  'src/dynamics/groundMotionSeries.js',
  'src/dynamics/modalDamping.js',
  'src/dynamics/dynamicCondensation.js',
  'src/dynamics/linearDirectIntegration.js',
  'src/dynamics/modal.js',
  'src/compute/product/analysisCaseEngine.js',
  'src/ui/analysisRunners.js',
  'src/report/linearThaReport.js',
  'tools/sstructures-linear-tha.mjs',
];
const buildHash = stableHash(Object.fromEntries(await Promise.all(
  productionFiles.map(async (path) => [path, await readFile(path, 'utf8')]),
)));
const m1Evidence = JSON.parse(await readFile('verification/evidence/validation/phase14/p14-m1-winkler-implementation.json', 'utf8'));
const qualifications = PHASE14_CAPABILITIES.map((capability) => {
  if (capability.id === 'SB7') return recreate(m1Evidence.qualificationRecord);
  if (capability.id === 'TH1') {
    return createPhase14QualificationRecord('TH1', {
      implemented: true,
      internallyVerified: true,
      hashes: { buildHash },
      limitations: [
        'TH1 independent benchmark and MIDAS/STRIX cross-solver comparison have not been run.',
        'Current production scope is linear direct Newmark average-acceleration with uniform resampling and Rayleigh or modal damping.',
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
const manifestValidation = validatePhase14ReleaseManifest(releaseManifest);
if (!manifestValidation.ok) throw new Error(`Phase 14 manifest invalid: ${manifestValidation.errors.join(', ')}`);

const verificationRecords = [
  record('P14-THA-01', true, 'canonical ground-motion validation, sign convention and linear resampling'),
  record('P14-THA-02', true, 'Newmark average-acceleration SDOF convergence and zero-response identity'),
  record('P14-THA-03', true, 'Rayleigh and exact modal damping matrix paths'),
  record('P14-THA-04', true, 'massless-DOF static condensation and full analysis-case integration'),
  record('P14-THA-05', true, 'checkpoint/restart parity and cancellation with zero partial publish'),
  record('P14-THA-06', true, 'factor resource disposal, energy trace, CLI and report contracts'),
  record('P14-TH1-01', false, 'NOT_RUN: benchmark execution is intentionally deferred until engine development is complete'),
];
const evidenceCore = {
  version: 'p14-m2-linear-tha-implementation-evidence-v1',
  phase: 'Phase 14',
  milestone: 'P14-M2',
  status: verificationRecords.slice(0, 6).every((row) => row.status === 'PASS') ? 'INTERNALLY_VERIFIED' : 'FAIL',
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
  qualificationRecord: qualifications.find((row) => row.capabilityId === 'TH1'),
  releaseManifestHash: releaseManifest.manifestHash,
};
const evidence = { ...evidenceCore, artifactHash: stableHash(evidenceCore) };
await mkdir('verification/evidence/validation/phase14', { recursive: true });
await writeJson('verification/specs/phase14/release-manifest.json', releaseManifest);
await writeJson('verification/evidence/validation/phase14/p14-m2-linear-tha-implementation.json', evidence);
console.log(JSON.stringify({
  ok: evidence.status === 'INTERNALLY_VERIFIED',
  milestone: evidence.milestone,
  status: evidence.status,
  buildHash,
  benchmarkExecutionStarted: false,
  releaseAllowed: false,
  manifestHash: releaseManifest.manifestHash,
}, null, 2));

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
