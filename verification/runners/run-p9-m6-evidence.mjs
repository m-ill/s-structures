import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPhase9M6Evidence,
  upgradePhase9ManifestToM6,
  validatePhase9M6Evidence,
  validatePhase9M6Manifest,
} from '../../src/compute/governance/phase9M6.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVIDENCE_PATH = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase9', 'p9-m6-sparse-eigen.json');
const MANIFEST_PATH = path.join(ROOT, 'verification', 'specs', 'phase9', 'release-manifest.json');
const PRIOR_PATH = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase9', 'p9-m5-hybrid-elastic.json');

const previousManifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
const prior = JSON.parse(await fs.readFile(PRIOR_PATH, 'utf8'));
const dynamics = runTest('tests/p9-m6-eigen-dynamics.mjs');
const product = runTest('tests/p9-m6-worker-product.mjs');
const generatedAt = new Date().toISOString();
const sourceRevision = detectSourceRevision();
const evidence = buildPhase9M6Evidence({
  generatedAt,
  sourceRevision,
  priorEvidenceHash: prior.artifactHash,
  dynamics,
  product,
});
assertValid(validatePhase9M6Evidence(evidence), 'M6 evidence');
const manifest = upgradePhase9ManifestToM6(previousManifest, evidence, { generatedAt, sourceRevision });
assertValid(validatePhase9M6Manifest(manifest), 'M6 release manifest');
await fs.writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

console.log(JSON.stringify({
  ok: true,
  milestone: 'P9-M6',
  evidence: path.relative(ROOT, EVIDENCE_PATH),
  artifactHash: evidence.artifactHash,
  manifestHash: manifest.manifestHash,
  durationMs: evidence.performance.durationMs,
  nextMilestone: manifest.implementation.activeMilestone,
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
