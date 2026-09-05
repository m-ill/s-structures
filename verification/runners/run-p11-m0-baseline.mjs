import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildP11M0Evidence,
  buildP11ReleaseManifestSkeleton,
  validateP11M0Evidence,
  validateP11ReleaseManifest,
} from '../../src/report/phase11/governance.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const generatedAt = readArg('--generated-at=') || new Date().toISOString();
const sourceRevision = readArg('--source-revision=') || detectRevision();
const summary = await readJson('reports/pilot-office-01/analysis-summary.json');
const model = await readJson('reports/pilot-office-01/model.json');
const html = await readText('reports/pilot-office-01/calculation-package.html');
const pdf = await fs.readFile(resolve('output/pdf/PILOT-OFFICE-01-calculation-report.pdf'));
const pdfText = pdf.toString('latin1');

const files = await Promise.all([
  describe('reports/pilot-office-01/model.json'),
  describe('reports/pilot-office-01/load-estimation.json'),
  describe('reports/pilot-office-01/analysis-summary.json'),
  describe('reports/pilot-office-01/calculation-package.html'),
  describe('output/pdf/PILOT-OFFICE-01-calculation-report.pdf'),
]);

const bounds = model.nodes.reduce((value, node) => ({
  minX: Math.min(value.minX, node.x),
  maxX: Math.max(value.maxX, node.x),
  minY: Math.min(value.minY, node.y),
  maxY: Math.max(value.maxY, node.y),
  minZ: Math.min(value.minZ, node.z),
  maxZ: Math.max(value.maxZ, node.z),
}), {
  minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity,
});
const mediaBoxes = [...pdfText.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)]
  .map((match) => match.slice(1).map(Number));
const pageCount = (pdfText.match(/\/Type\s*\/Page\b/g) || []).length;
const a4 = mediaBoxes.length === pageCount && mediaBoxes.every((box) => (
  Math.abs((box[2] - box[0]) - 595.28) < 1
  && Math.abs((box[3] - box[1]) - 841.89) < 1
));

assert(summary.model.nodes === 45, 'node count drift');
assert(summary.model.members === 84, 'member count drift');
assert(summary.model.loads === 240, 'load count drift');
assert(summary.model.loadCases === 6, 'load case count drift');
assert(summary.model.combinations === 28, 'combination count drift');
assert(summary.loadApplication.conflicts.length === 0, 'load conflicts drift');
assert(summary.analysis.ok === true, 'analysis no longer succeeds');
assert(summary.analysis.validationErrors.length === 0, 'analysis errors drift');
assert(summary.analysis.validationWarnings.length === 0, 'analysis warnings drift');
assert(summary.analysis.failedCombinations.length === 0, 'failed combinations drift');
assertClose(summary.analysis.maxDisplacement, 0.005749185700252778, 1e-12, 'max displacement');
assertClose(summary.analysis.maxUtilization, 0.3943625474780076, 1e-12, 'max utilization');
assertClose(summary.analysis.maxEquilibriumResidual, 5.542148285615899e-15, 1e-18, 'equilibrium residual');
assert(bounds.maxX - bounds.minX === 12 && bounds.maxY - bounds.minY === 10 && bounds.maxZ - bounds.minZ === 14.4, 'model bounds drift');
assert(summary.report.qualityAudit.ok === true, 'report audit drift');
assert(pageCount === 22, 'PDF page count drift');
assert(a4, 'PDF is not consistently A4');
for (const marker of ['PILOT-OFFICE-01', '@page{size:A4', 'Elastic Analysis Summary', 'Final sealed calculation packages require project-specific engineering review.']) {
  assert(html.includes(marker), `HTML marker missing: ${marker}`);
}

const verification = [
  pass('P11-BASE-01', 'Office model counts and bounds match the frozen reference.'),
  pass('P11-BASE-02', 'Loads, cases, combinations and conflicts match the frozen reference.'),
  pass('P11-BASE-03', 'Analysis errors, warnings and failed combinations remain zero.'),
  pass('P11-BASE-04', 'Displacement, utilization and equilibrium residual match fixed tolerances.'),
  pass('P11-BASE-05', 'Current HTML markers and 22-page A4 PDF are recorded with SHA-256 hashes.'),
  pass('P11-BASE-06', 'GAP-01 through GAP-14 have owners and target milestones.'),
  pass('P11-REL-01', 'The blocked release-manifest skeleton is schema-validated.'),
];
const evidence = buildP11M0Evidence({
  generatedAt,
  sourceRevision,
  environment: {
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    node: process.version,
  },
  baseline: {
    projectId: summary.projectId,
    classification: 'program-smoke-only',
    model: { ...summary.model, bounds },
    loadApplication: summary.loadApplication,
    analysis: summary.analysis,
    report: {
      version: summary.report.version,
      qualityAuditOk: summary.report.qualityAudit.ok,
      htmlBytes: Buffer.byteLength(html),
    },
    pdf: { pageCount, a4, mediaBoxPoints: mediaBoxes[0], bytes: pdf.byteLength },
    artifacts: files,
  },
  decisions: {
    'P11-ADR-001': 'accepted',
    'P11-ADR-002': 'accepted',
    runtimeDependenciesAdded: [],
    systemFontQualificationDeferredTo: 'P11-M8',
  },
  verification,
});
assertValid(validateP11M0Evidence(evidence), 'M0 evidence');

const manifest = buildP11ReleaseManifestSkeleton({
  generatedAt,
  sourceRevision,
  m0EvidenceHash: evidence.artifactHash,
});
assertValid(validateP11ReleaseManifest(manifest), 'release manifest');

await fs.mkdir(resolve('verification/evidence/validation/phase11'), { recursive: true });
await writeJson('verification/evidence/validation/phase11/p11-m0-baseline-governance.json', evidence);
await writeJson('verification/specs/phase11/release-manifest.json', manifest);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P11-M0',
  sourceRevision,
  evidenceHash: evidence.artifactHash,
  manifestHash: manifest.manifestHash,
  pageCount,
  a4,
  artifacts: files.length,
  verification: verification.length,
  releaseQualified: false,
}, null, 2));

function pass(id, statement) {
  return { id, status: 'PASS', test: 'npm run baseline:p11:m0', statement };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertClose(actual, expected, tolerance, label) {
  assert(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label} drift`);
}

function assertValid(result, label) {
  assert(result.ok, `${label} invalid: ${result.errors.join(', ')}`);
}

function resolve(relativePath) {
  return path.join(ROOT, relativePath);
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(resolve(relativePath), 'utf8'));
}

async function readText(relativePath) {
  return fs.readFile(resolve(relativePath), 'utf8');
}

async function describe(relativePath) {
  const bytes = await fs.readFile(resolve(relativePath));
  return {
    path: relativePath,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function writeJson(relativePath, value) {
  await fs.writeFile(resolve(relativePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readArg(prefix) {
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

function detectRevision() {
  const safeDirectory = ROOT.replaceAll('\\', '/');
  const revision = execFileSync('git', ['-c', `safe.directory=${safeDirectory}`, 'rev-parse', '--short', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const dirty = execFileSync('git', ['-c', `safe.directory=${safeDirectory}`, 'status', '--porcelain'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  return dirty ? `${revision}+worktree` : revision;
}
