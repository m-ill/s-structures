import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPhase9M5Evidence,
  upgradePhase9ManifestToM5,
  validatePhase9M5Evidence,
  validatePhase9M5Manifest,
} from '../src/compute/governance/phase9M5.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_PATH = path.join(ROOT, 'reports', 'validation-evidence', 'phase9', 'p9-m5-browser-raw.json');
const EVIDENCE_PATH = path.join(ROOT, 'reports', 'validation-evidence', 'phase9', 'p9-m5-hybrid-elastic.json');
const MANIFEST_PATH = path.join(ROOT, 'docs', 'verification', 'phase9', 'release-manifest.json');
const PRIOR_PATH = path.join(ROOT, 'reports', 'validation-evidence', 'phase9', 'p9-m4-webgpu-foundation.json');

const browser = JSON.parse(await fs.readFile(RAW_PATH, 'utf8'));
if (browser.status !== 'PASS') throw new Error(`M5 browser numeric run is not PASS: ${browser.status}.`);
const previousManifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
const prior = JSON.parse(await fs.readFile(PRIOR_PATH, 'utf8'));
const spdMixed = runTest('tests/p9-m5-spd-mixed.mjs');
const elasticHybrid = runTest('tests/p9-m5-elastic-hybrid.mjs');
const pDeltaHybrid = runTest('tests/p9-m5-pdelta-hybrid.mjs');
const generatedAt = new Date().toISOString();
const sourceRevision = detectSourceRevision();
const evidence = buildPhase9M5Evidence({
  generatedAt,
  sourceRevision,
  priorEvidenceHash: prior.artifactHash,
  browser,
  spdMixed,
  elasticHybrid,
  pDeltaHybrid,
});
assertValid(validatePhase9M5Evidence(evidence), 'M5 evidence');
const manifest = upgradePhase9ManifestToM5(previousManifest, evidence, { generatedAt, sourceRevision });
assertValid(validatePhase9M5Manifest(manifest), 'M5 release manifest');
await fs.writeFile(RAW_PATH, JSON.stringify(browser, null, 2) + '\n');
await fs.writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

console.log(JSON.stringify({
  ok: true,
  implementation: 'complete',
  qualification: 'blocked',
  evidence: path.relative(ROOT, EVIDENCE_PATH),
  artifactHash: evidence.artifactHash,
  manifestHash: manifest.manifestHash,
  speedup: evidence.performance.endToEnd.speedup,
  threshold: evidence.performance.endToEnd.threshold,
  autoGpuAllowed: manifest.computeQualification.autoGpuAllowed,
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
