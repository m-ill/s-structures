import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPhase9M4Evidence,
  upgradePhase9ManifestToM4,
  validatePhase9M4Evidence,
  validatePhase9M4Manifest,
} from '../src/compute/governance/phase9M4.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_PATH = path.join(ROOT, 'reports', 'validation-evidence', 'phase9', 'p9-m4-browser-raw.json');
const EVIDENCE_PATH = path.join(ROOT, 'reports', 'validation-evidence', 'phase9', 'p9-m4-webgpu-foundation.json');
const MANIFEST_PATH = path.join(ROOT, 'docs', 'verification', 'phase9', 'release-manifest.json');
const PRIOR_PATH = path.join(ROOT, 'reports', 'validation-evidence', 'phase9', 'p9-m3-elastic-runtime.json');
const browser = JSON.parse(await fs.readFile(RAW_PATH, 'utf8'));
const previousManifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
const prior = JSON.parse(await fs.readFile(PRIOR_PATH, 'utf8'));
if (browser.status !== 'PASS') throw new Error(`M4 browser qualification is not PASS: ${browser.status}.`);

const platformTests = runTest('tests/p9-m4-platform.mjs');
const numericTests = runTest('tests/p9-m4-numeric.mjs');
const routingTests = runTest('tests/p9-m4-routing-architecture.mjs');
const generatedAt = new Date().toISOString();
const sourceRevision = detectSourceRevision();
const evidence = buildPhase9M4Evidence({
  generatedAt,
  sourceRevision,
  priorEvidenceHash: prior.artifactHash,
  browser,
  platformTests,
  numericTests,
  routingTests,
});
assertValid(validatePhase9M4Evidence(evidence), 'M4 evidence');
const manifest = upgradePhase9ManifestToM4(previousManifest, evidence, { generatedAt, sourceRevision });
assertValid(validatePhase9M4Manifest(manifest), 'M4 release manifest');
await fs.writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

console.log(JSON.stringify({
  ok: true,
  evidence: path.relative(ROOT, EVIDENCE_PATH),
  artifactHash: evidence.artifactHash,
  manifestHash: manifest.manifestHash,
  qualification: manifest.computeQualification,
  localProfile: evidence.profileMatrix.localPrimaryProfile,
  performance: evidence.performance,
  deferred: ['P9-GPU-PLT-12'],
}, null, 2));

function runTest(relativePath) {
  const output = execFileSync(process.execPath, [path.join(ROOT, relativePath)], { cwd: ROOT, encoding: 'utf8' });
  return JSON.parse(output.trim());
}

function detectSourceRevision() {
  try {
    const safeRoot = ROOT.split(path.sep).join('/');
    return execFileSync('git', ['-c', `safe.directory=${safeRoot}`, 'rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim() + '+worktree';
  } catch {
    return 'unknown+worktree';
  }
}

function assertValid(validation, label) {
  if (!validation.ok) throw new Error(`${label} invalid: ${validation.errors.join(', ')}`);
}
