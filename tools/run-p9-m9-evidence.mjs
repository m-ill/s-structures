import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPhase9M9Evidence,
  upgradePhase9ManifestToM9,
  validatePhase9M9Evidence,
  validatePhase9M9Manifest,
} from '../src/compute/governance/phase9M9.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = path.join(ROOT, 'reports', 'validation-evidence', 'phase9', 'p9-m9-product-workflow.json');
const MANIFEST_PATH = path.join(ROOT, 'docs', 'verification', 'phase9', 'release-manifest.json');
const PRIOR_PATH = path.join(ROOT, 'reports', 'validation-evidence', 'phase9', 'p9-m8-hybrid-nonlinear.json');

const previousManifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
const prior = JSON.parse(await fs.readFile(PRIOR_PATH, 'utf8'));
const product = runTest('tests/p9-m9-product-workflow.mjs');
const uiAgent = runTest('tests/p9-m9-ui-agent.mjs');
const generatedAt = new Date().toISOString();
const sourceRevision = detectSourceRevision();
const evidence = buildPhase9M9Evidence({ generatedAt, sourceRevision, priorEvidenceHash: prior.artifactHash, product, uiAgent });
assertValid(validatePhase9M9Evidence(evidence), 'M9 evidence');
const manifest = upgradePhase9ManifestToM9(previousManifest, evidence, { generatedAt, sourceRevision });
assertValid(validatePhase9M9Manifest(manifest), 'M9 release manifest');
await fs.writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

console.log(JSON.stringify({
  ok: true,
  milestone: 'P9-M9',
  status: evidence.status,
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
