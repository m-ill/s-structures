import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPhase9M8Evidence,
  upgradePhase9ManifestToM8,
  validatePhase9M8Evidence,
  validatePhase9M8Manifest,
} from '../../src/compute/governance/phase9M8.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVIDENCE_PATH = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase9', 'p9-m8-hybrid-nonlinear.json');
const MANIFEST_PATH = path.join(ROOT, 'verification', 'specs', 'phase9', 'release-manifest.json');
const PRIOR_PATH = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase9', 'p9-m7-nonlinear-batch.json');

const previousManifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
const prior = JSON.parse(await fs.readFile(PRIOR_PATH, 'utf8'));
const resident = runTest('tests/p9-m8-resident-session.mjs');
const hybrid = runTest('tests/p9-m8-hybrid-nonlinear.mjs');
const generatedAt = new Date().toISOString();
const sourceRevision = detectSourceRevision();
const evidence = buildPhase9M8Evidence({ generatedAt, sourceRevision, priorEvidenceHash: prior.artifactHash, resident, hybrid });
assertValid(validatePhase9M8Evidence(evidence), 'M8 evidence');
const manifest = upgradePhase9ManifestToM8(previousManifest, evidence, { generatedAt, sourceRevision });
assertValid(validatePhase9M8Manifest(manifest), 'M8 release manifest');
await fs.writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

console.log(JSON.stringify({
  ok: true,
  milestone: 'P9-M8',
  implementation: 'complete',
  qualification: 'blocked',
  evidence: path.relative(ROOT, EVIDENCE_PATH),
  artifactHash: evidence.artifactHash,
  manifestHash: manifest.manifestHash,
  nextMilestone: manifest.implementation.activeMilestone,
}, null, 2));

function runTest(relativePath) {
  const output = execFileSync(process.execPath, [path.join(ROOT, relativePath)], { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  return JSON.parse(output.trim());
}
function detectSourceRevision() {
  try {
    const safeRoot = ROOT.split(path.sep).join('/');
    return execFileSync('git', ['-c', `safe.directory=${safeRoot}`, 'rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim() + '+worktree';
  } catch { return 'unknown+worktree'; }
}
function assertValid(validation, label) { if (!validation.ok) throw new Error(`${label} invalid: ${validation.errors.join(', ')}`); }
