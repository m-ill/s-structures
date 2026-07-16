import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPhase9M10Evidence,
  buildPhase9M10DebtStatus,
  upgradePhase9ManifestToM10,
  validatePhase9M10DebtStatus,
  validatePhase9M10Evidence,
  validatePhase9M10Manifest,
} from '../src/compute/governance/phase9M10.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = path.join(ROOT, 'reports', 'validation-evidence', 'phase9', 'p9-m10-release-gate.json');
const DEBT_PATH = path.join(ROOT, 'reports', 'validation-evidence', 'phase9', 'p9-m10-final-debt.json');
const MANIFEST_PATH = path.join(ROOT, 'docs', 'verification', 'phase9', 'release-manifest.json');
const PRIOR_PATH = path.join(ROOT, 'reports', 'validation-evidence', 'phase9', 'p9-m9-product-workflow.json');

const previousManifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
const prior = JSON.parse(await fs.readFile(PRIOR_PATH, 'utf8'));
const cleanup = runJson('tests/p9-m10-cleanup-audit.mjs');
const focusedRegression = runJson('tests/p9-m10-focused-regression.mjs');
const releasePolicy = runJson('tests/p9-m10-release-policy.mjs');
const releaseBuild = runJson('tools/build-release.mjs');
const generatedAt = new Date().toISOString();
const sourceRevision = detectSourceRevision();
const finalDebt = buildPhase9M10DebtStatus({ generatedAt, sourceRevision });
assertValid(validatePhase9M10DebtStatus(finalDebt), 'M10 debt status');
cleanup.finalDebtHash = finalDebt.artifactHash;
const evidence = buildPhase9M10Evidence({
  generatedAt,
  sourceRevision,
  priorEvidenceHash: prior.artifactHash,
  cleanup,
  focusedRegression,
  releasePolicy,
  releaseBuild,
});
assertValid(validatePhase9M10Evidence(evidence), 'M10 evidence');
const manifest = upgradePhase9ManifestToM10(previousManifest, evidence, { generatedAt, sourceRevision });
assertValid(validatePhase9M10Manifest(manifest), 'M10 release manifest');
await fs.writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
await fs.writeFile(DEBT_PATH, JSON.stringify(finalDebt, null, 2) + '\n');
await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

console.log(JSON.stringify({
  ok: true,
  milestone: 'P9-M10',
  implementationStatus: evidence.implementationStatus,
  releaseStatus: evidence.status,
  grade: manifest.computeQualification.grade,
  evidence: path.relative(ROOT, EVIDENCE_PATH),
  finalDebt: path.relative(ROOT, DEBT_PATH),
  artifactHash: evidence.artifactHash,
  manifestHash: manifest.manifestHash,
  nextGate: manifest.implementation.activeMilestone,
}, null, 2));

function runJson(relativePath) {
  const output = execFileSync(process.execPath, [path.join(ROOT, relativePath)], { cwd: ROOT, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
  return JSON.parse(output.trim());
}
function detectSourceRevision() {
  try {
    const safeRoot = ROOT.split(path.sep).join('/');
    return execFileSync('git', ['-c', `safe.directory=${safeRoot}`, 'rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim() + '+worktree';
  } catch { return 'unknown+worktree'; }
}
function assertValid(validation, label) { if (!validation.ok) throw new Error(`${label} invalid: ${validation.errors.join(', ')}`); }
