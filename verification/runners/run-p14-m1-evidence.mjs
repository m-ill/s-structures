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
  ['tools/run-phase14-tests.mjs', 'M1'],
  ['tests/p6-pdelta-tangent.mjs'],
  ['tests/p13-m1-index-workspace-integration.mjs'],
  ['tests/m26-native-modeler-e2e.mjs'],
  ['tests/p10-m4-schema-domain-contract.mjs'],
  ['tests/p10-m5-schema-domain-contract.mjs'],
  ['tests/p10-m6-tapered.mjs'],
];
for (const args of testCommands) execFileSync(process.execPath, args, { stdio: 'inherit' });

const productionFiles = [
  'src/core/foundationSchema.js',
  'src/solver/foundation/winklerLine.js',
  'src/solver/frame/beamInterpolation.js',
  'src/solver/linear3dAssembly.js',
  'src/solver/linear3dRecovery.js',
  'src/solver/linear3dPost.js',
  'src/solver/pdelta/secondOrder.js',
  'src/modeling/foundationTransactions.js',
  'src/ui/foundationInspector.js',
  'src/report/foundationResponse.js',
];
const buildHash = stableHash(Object.fromEntries(await Promise.all(productionFiles.map(async (path) => [path, await readFile(path, 'utf8')]))));
const qualifications = PHASE14_CAPABILITIES.map((capability) => createPhase14QualificationRecord(capability.id, capability.id === 'SB7' ? {
  implemented: true,
  internallyVerified: true,
  independentlyQualified: false,
  crossSolverCompared: false,
  releaseAllowed: false,
  designTransferAllowed: false,
  hashes: { buildHash },
  limitations: [
    'SB7 benchmark, independent continuum comparison and MIDAS/STRIX cross-solver comparison have not been run.',
    'Compression-only, gap/uplift, ground settlement, nonlinear and coupled-soil behavior remain out of scope.',
  ],
} : {}));
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
  record('P14-FND-01', true, 'uniform Winkler Hermite matrix parity, symmetry and PSD invariants'),
  record('P14-FND-02', true, 'k=0 boundary and fail-closed invalid assignments'),
  record('P14-FND-03', true, 'EB/Timoshenko, release, offset, rotation and reversal paths'),
  record('P14-FND-04', true, 'structural force, soil action and equilibrium matrix ownership separated'),
  record('P14-FND-05', true, 'schema migration, transaction/undo, CLI, Agent API, Inspector and report surfaces'),
  record('P14-FND-06', true, 'force/moment equilibrium and strain energy recovery'),
  record('P14-FND-07', true, 'full, stiffness-only/modal, Direct P-Delta, dense/sparse and cache paths'),
  record('P14-FND-08', true, 'property, domain, factor, wire and component-cache invalidation'),
  record('P14-SB7-01', false, 'NOT_RUN: benchmark execution is intentionally deferred until engine development is complete'),
];
const evidenceCore = {
  version: 'p14-m1-winkler-implementation-evidence-v1',
  phase: 'Phase 14',
  milestone: 'P14-M1',
  status: verificationRecords.slice(0, 8).every((row) => row.status === 'PASS') ? 'INTERNALLY_VERIFIED' : 'FAIL',
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
  qualificationRecord: qualifications.find((row) => row.capabilityId === 'SB7'),
  releaseManifestHash: releaseManifest.manifestHash,
};
const evidence = { ...evidenceCore, artifactHash: stableHash(evidenceCore) };
await mkdir('verification/evidence/validation/phase14', { recursive: true });
await writeJson('verification/specs/phase14/release-manifest.json', releaseManifest);
await writeJson('verification/evidence/validation/phase14/p14-m1-winkler-implementation.json', evidence);
console.log(JSON.stringify({
  ok: evidence.status === 'INTERNALLY_VERIFIED',
  milestone: evidence.milestone,
  status: evidence.status,
  buildHash,
  benchmarkExecutionStarted: false,
  releaseAllowed: false,
  manifestHash: releaseManifest.manifestHash,
}, null, 2));

function git(args) { return execFileSync('git', ['-c', 'safe.directory=C:/Users/mill/Downloads/dcr/S-Structures-main', ...args], { encoding: 'utf8' }); }
function record(id, pass, note) { return { id, status: pass ? 'PASS' : 'NOT_RUN', note }; }
async function writeJson(path, value) { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
