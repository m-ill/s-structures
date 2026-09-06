import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { hostname, platform, release, arch } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import {
  PHASE15_DISCREPANCY_IDS,
  buildPhase15CorrectiveBaseline,
  strictCanonicalHash,
  validatePhase15CorrectiveBaseline,
} from '../framework/phase15/index.js';

const options = parseOptions(process.argv.slice(2));
const governanceInput = options.input ? JSON.parse(readFileSync(options.input, 'utf8')) : {};
const sourceRevision = git(['rev-parse', 'HEAD']).trim();
const dirtyEntries = git(['status', '--porcelain=v1', '--untracked-files=all']).split(/\r?\n/).filter(Boolean);
const preservedArtifacts = collectArtifacts([
  ['first-batch-json', 'benchmark-json', 'verification/benchmarks/strix21/runs/first-batch-results.json'],
  ['first-batch-pdf', 'benchmark-pdf', 'output/pdf/S-Structures_STRIX21_1차_비교보고서.pdf'],
  ['phase14-release-manifest', 'release-manifest', 'verification/specs/phase14/release-manifest.json'],
  ['phase14-m0-baseline', 'governance-evidence', 'verification/evidence/validation/phase14/p14-m0-governance-baseline.json'],
]);
const expectedImportAudit = auditProductionExpectedImports('src');
const phase14StatusPath = 'docs/phase14/IMPLEMENTATION_STATUS.md';
const phase14Status = readFileSync(phase14StatusPath, 'utf8');
const phase14M0Test = readFileSync('tests/p14-m0-governance-baseline.mjs', 'utf8');
const artifact = buildPhase15CorrectiveBaseline({
  sourceRevision,
  dirtyEntries,
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    arch: arch(),
  },
  preservedArtifacts,
  referenceManifests: governanceInput.referenceManifests || [],
  toleranceManifests: governanceInput.toleranceManifests || [],
  probeManifests: governanceInput.probeManifests || [],
  discrepancyIds: governanceInput.discrepancyIds || PHASE15_DISCREPANCY_IDS,
  reviewers: governanceInput.reviewers || {},
  expectedImportAudit,
  phase14StatusAudit: {
    benchmarkExecutionStarted: /benchmark_execution_started:\s*true/.test(phase14Status),
    staleAssertionCount: (phase14M0Test.match(/assert\.match\(\s*status,\s*\/benchmark_execution_started:\\s\*false/g) || []).length,
    statusDocumentHash: sha256File(phase14StatusPath),
  },
  traceCoverage: governanceInput.traceCoverage ?? 0,
  performanceBaseline: governanceInput.performanceBaseline || {},
  run: { capturedAt: new Date().toISOString(), host: hostname() },
});
const validation = validatePhase15CorrectiveBaseline(artifact);
if (!validation.ok) throw new Error(`Generated Phase 15 baseline is malformed: ${validation.errors.join(', ')}`);

if (options.output) {
  const target = resolve(options.output);
  if (existsSync(target)) throw new Error(`Refusing to overwrite immutable baseline artifact: ${target}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}
console.log(JSON.stringify({
  ok: artifact.status === 'PASS',
  status: artifact.status,
  output: options.output || null,
  baselineHash: artifact.baselineHash,
  runRecordHash: artifact.run.runRecordHash,
  blockers: artifact.gates.filter((row) => row.status !== 'PASS').map((row) => row.id),
}, null, 2));

function parseOptions(args) {
  const result = { input: null, output: null };
  for (const arg of args) {
    if (arg.startsWith('--input=')) result.input = resolve(arg.slice(8));
    else if (arg.startsWith('--output=')) result.output = arg.slice(9);
    else throw new Error(`Unsupported argument: ${arg}`);
  }
  return result;
}

function git(args) {
  return execFileSync('git', ['-c', 'safe.directory=C:/Users/mill/Downloads/dcr/S-Structures-main', ...args], { encoding: 'utf8' });
}

function collectArtifacts(definitions) {
  return definitions.flatMap(([id, kind, path]) => existsSync(path) ? [{
    id,
    kind,
    path,
    sha256: sha256File(path),
    byteLength: statSync(path).size,
  }] : []);
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function auditProductionExpectedImports(root) {
  const files = walk(root).filter((path) => ['.js', '.mjs'].includes(extname(path)) && !path.replaceAll('\\', '/').startsWith('src/verification/'));
  const violations = [];
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    if (/from\s+['"][^'"]*(?:tests\/references|verification\/phase15)/.test(text)) violations.push(path.replaceAll('\\', '/'));
  }
  const core = { scannedFileCount: files.length, violations: violations.sort() };
  return { ...core, auditHash: strictCanonicalHash(core, 'production expected import audit') };
}

function walk(root) {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...walk(path));
    else result.push(path);
  }
  return result;
}
