import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPhase9GridFixture } from '../src/compute/governance/phase9Fixtures.js';
import {
  buildPhase9M1ContractSnapshot,
  buildPhase9M1Evidence,
  upgradePhase9ManifestToM1,
  validatePhase9M1Evidence,
  validatePhase9M1Manifest,
} from '../src/compute/governance/phase9M1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = path.join(ROOT, 'reports', 'validation-evidence', 'phase9', 'p9-m1-common-compute.json');
const MANIFEST_PATH = path.join(ROOT, 'docs', 'verification', 'phase9', 'release-manifest.json');
const BASELINE_PATH = path.join(ROOT, 'reports', 'validation-evidence', 'phase9', 'p9-m0-baseline.json');
const generatedAt = new Date().toISOString();
const sourceRevision = detectSourceRevision();
const baseline = JSON.parse(await fs.readFile(BASELINE_PATH, 'utf8'));
const previousManifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
const fixture = createPhase9GridFixture('S');
const snapshot = buildPhase9M1ContractSnapshot(fixture.model);
const blockers = [
  ...new Set([
    ...(previousManifest.blockers || []),
    'P9_M2_CPU_WASM_RUNTIME_REQUIRED',
    'P9_M3_ELASTIC_WORKER_MIGRATION_REQUIRED',
    'P9_M4_TO_M8_GPU_QUALIFICATION_REQUIRED',
    'P9_M9_PRODUCT_MIGRATION_REQUIRED',
    'P9_M10_RELEASE_GATE_REQUIRED',
  ]),
];
const evidence = buildPhase9M1Evidence({
  generatedAt,
  sourceRevision,
  baselineEvidenceHash: baseline.artifactHash,
  snapshot,
  blockers,
});
assertValid(validatePhase9M1Evidence(evidence), 'M1 evidence');
const manifest = upgradePhase9ManifestToM1(previousManifest, evidence, { generatedAt, sourceRevision, blockers });
assertValid(validatePhase9M1Manifest(manifest), 'M1 release manifest');
await fs.writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, evidence: path.relative(ROOT, EVIDENCE_PATH), artifactHash: evidence.artifactHash, manifestHash: manifest.manifestHash }, null, 2));

function detectSourceRevision() {
  try {
    const safeRoot = ROOT.split(path.sep).join('/');
    const revision = execFileSync('git', ['-c', `safe.directory=${safeRoot}`, 'rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    return revision + '+worktree';
  } catch {
    return 'unknown+worktree';
  }
}

function assertValid(validation, label) {
  if (!validation.ok) throw new Error(label + ' invalid: ' + validation.errors.join(', '));
}
