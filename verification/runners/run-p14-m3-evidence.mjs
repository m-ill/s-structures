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
  ['tools/run-phase14-tests.mjs', 'M3'],
  ['tests/p7-m9-rsa-cqc-base-shear.mjs'],
  ['tests/p7-m9-member-forces.mjs'],
  ['tests/p7-m9-story-response.mjs'],
  ['tests/p6-rsa-diaphragm-story.mjs'],
  ['tests/p7-m11-elastic-analysis-ui.mjs'],
  ['tests/m34-detailed-report.mjs'],
];
for (const args of testCommands) execFileSync(process.execPath, args, { stdio: 'inherit' });

const productionFiles = [
  'src/dynamics/modalCombination.js',
  'src/dynamics/modal.js',
  'src/results/rsa/baseShearScale.js',
  'src/results/rsa/memberForces.js',
  'src/results/rsa/signedResponse.js',
  'src/results/story/rsaResponse.js',
  'src/results/rsaTrace.js',
  'src/ui/analysisRunners.js',
  'src/ui/indexAnalysisCenter.js',
  'src/report/detailedReport.js',
  'tools/sstructures-modal-combination.mjs',
];
const buildHash = stableHash(Object.fromEntries(await Promise.all(
  productionFiles.map(async (path) => [path, await readFile(path, 'utf8')]),
)));
const priorEvidence = await Promise.all([
  'verification/evidence/validation/phase14/p14-m1-winkler-implementation.json',
  'verification/evidence/validation/phase14/p14-m2-linear-tha-implementation.json',
].map(async (path) => JSON.parse(await readFile(path, 'utf8'))));
const priorByCapability = new Map(priorEvidence.map((item) => [item.qualificationRecord.capabilityId, item.qualificationRecord]));
const qualifications = PHASE14_CAPABILITIES.map((capability) => {
  if (priorByCapability.has(capability.id)) return recreate(priorByCapability.get(capability.id));
  if (capability.id === 'SR2') {
    return createPhase14QualificationRecord('SR2', {
      implemented: true,
      internallyVerified: true,
      hashes: { buildHash },
      limitations: [
        'SR2 independent benchmark and MIDAS/STRIX cross-solver comparison have not been run.',
        'All four modal-combination methods produce unsigned magnitudes; signed design envelopes remain a separate policy.',
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
  record('P14-MC-01', true, 'canonical SRSS/CQC/ABS/NRC10 enum, aliases, formulas and policy trace'),
  record('P14-MC-02', true, 'single-mode identity, exact synthetic values and CQC repeated-frequency behavior'),
  record('P14-MC-03', true, 'NRC inclusive 10 percent close-mode boundary and permutation invariance'),
  record('P14-MC-04', true, 'nodal displacement, inertia force, base shear and member-force propagation'),
  record('P14-MC-05', true, 'base-shear scaling, story trace and signed-response policy integration'),
  record('P14-MC-06', true, 'CLI, Agent analysis settings, UI selector and detailed-report parity'),
  record('P14-SR2-01', false, 'NOT_RUN: benchmark execution is intentionally deferred until engine development is complete'),
];
const evidenceCore = {
  version: 'p14-m3-modal-combination-implementation-evidence-v1',
  phase: 'Phase 14',
  milestone: 'P14-M3',
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
  qualificationRecord: qualifications.find((row) => row.capabilityId === 'SR2'),
  releaseManifestHash: releaseManifest.manifestHash,
};
const evidence = { ...evidenceCore, artifactHash: stableHash(evidenceCore) };
await mkdir('verification/evidence/validation/phase14', { recursive: true });
await writeJson('verification/specs/phase14/release-manifest.json', releaseManifest);
await writeJson('verification/evidence/validation/phase14/p14-m3-modal-combination-implementation.json', evidence);
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
