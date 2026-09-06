import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { stableHash } from '../../src/core/stableHash.js';
import {
  buildPhase14ReleaseManifest,
  createPhase14QualificationRecord,
  validatePhase14ReleaseManifest,
} from '../framework/phase14/index.js';

const commands = [
  ['tools/run-phase14-tests.mjs'],
  ['tests/p9-m10-cleanup-audit.mjs'],
  ['tests/p10-m5-mpc-rigidlink.mjs'],
  ['tests/p12-m5-release-package-install-recovery.mjs'],
  ['tests/p14-m11-integration.mjs'],
];
for (const args of commands) execFileSync(process.execPath, args, { stdio: 'inherit' });

const evidenceFiles = [
  'p14-m1-winkler-implementation.json',
  'p14-m2-linear-tha-implementation.json',
  'p14-m3-modal-combination-implementation.json',
  'p14-m4-six-dof-mass-rsa-implementation.json',
  'p14-m5-membrane-stress-implementation.json',
  'p14-m6-distorted-membrane-implementation.json',
  'p14-m7-thin-plate-implementation.json',
  'p14-m8-thick-plate-implementation.json',
  'p14-m9-shell-stabilization-implementation.json',
  'p14-m10-production-pushover-implementation.json',
];
const prior = await Promise.all(evidenceFiles.map(async (file) => JSON.parse(await readFile(`verification/evidence/validation/phase14/${file}`, 'utf8'))));
const qualifications = prior.map(({ qualificationRecord: record }) => createPhase14QualificationRecord(record.capabilityId, {
  ...record,
  releaseAllowed: false,
  designTransferAllowed: false,
}));
const previous = JSON.parse(await readFile('verification/specs/phase14/release-manifest.json', 'utf8'));
const generatedAt = new Date().toISOString();
const sourceRevision = execFileSync('git', [
  '-c', 'safe.directory=C:/Users/mill/Downloads/dcr/S-Structures-main', 'rev-parse', 'HEAD',
], { encoding: 'utf8' }).trim();
const manifest = buildPhase14ReleaseManifest({
  qualifications,
  generatedAt,
  sourceRevision,
  baselineHash: previous.baselineHash,
  requirementTraceComplete: true,
  fullRegressionPassed: true,
  mandatoryFailureCount: 0,
  unapprovedSkipCount: 0,
  openCriticalHighCount: 0,
  externalSolverRuntimeDependency: false,
  externalSolverProcessCount: 0,
  migrationRollbackPassed: true,
  surfaceParityPassed: true,
  performanceSecurityAccessibilityPassed: false,
  finalDesignTransferApproved: false,
});
const validation = validatePhase14ReleaseManifest(manifest);
if (!validation.ok) throw new Error(`Phase 14 manifest invalid: ${validation.errors.join(', ')}`);

const core = {
  version: 'p14-m11-integration-evidence-v1',
  phase: 'Phase 14',
  milestone: 'P14-M11',
  status: 'INTERNALLY_VERIFIED',
  generatedAt,
  sourceRevision,
  regressionMode: 'phase-runner-segmented-plus-integration-rerun',
  commands: commands.map((args) => [process.execPath, ...args]),
  checks: {
    fullRegression: 'PASS',
    dependencyBoundaries: 'PASS',
    migrationRollback: 'PASS',
    surfaceParity: 'PASS',
    performanceSecurityAccessibility: 'PENDING',
    independentQualification: 'NOT_RUN',
    crossSolverComparison: 'NOT_RUN',
  },
  benchmarkExecutionStarted: false,
  releaseAllowed: false,
  finalDesignTransferAllowed: false,
  reviewDocuments: ['docs/phase14/CODEBASE_REVIEW.md', 'docs/phase14/MODULE_ARCHITECTURE.md'],
  manifestHash: manifest.manifestHash,
};
await writeFile('verification/evidence/validation/phase14/p14-m11-integration.json', `${JSON.stringify({ ...core, artifactHash: stableHash(core) }, null, 2)}\n`, 'utf8');
await writeFile('verification/specs/phase14/release-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, status: core.status, manifestHash: manifest.manifestHash, blockers: manifest.blockers }, null, 2));
