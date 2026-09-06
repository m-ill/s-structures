import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { arch, hostname, platform, release } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPhase15ReleaseManifest,
  validatePhase15ReleaseManifest,
} from '../framework/phase15/index.js';
import { analyzePhase15Architecture } from '../harnesses/check-phase15-architecture.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const options = parseOptions(process.argv.slice(2));
const input = readJsonIfPresent(options.input) || {};
const benchmarkArtifact = readRequiredJson(options.benchmark, 'benchmark artifact');
const architectureAudit = options.architecture
  ? readRequiredJson(options.architecture, 'architecture audit')
  : await analyzePhase15Architecture({ root: ROOT });
const baselineArtifact = options.baseline
  ? readRequiredJson(options.baseline, 'governance baseline')
  : input.governance?.baselineArtifact || null;
const fullRegressionArtifact = options.fullRegression
  ? readRequiredJson(options.fullRegression, 'full-regression evidence')
  : input.execution?.fullRegressionArtifact || null;

const manifest = buildPhase15ReleaseManifest({
  sourceRevision: input.sourceRevision || gitRevision(),
  benchmarkArtifact,
  architectureAudit,
  governance: { ...(input.governance || {}), baselineArtifact },
  execution: { ...(input.execution || {}), fullRegressionArtifact },
  review: input.review || {},
  crossSolver: input.crossSolver || {},
  run: {
    generatedAt: options.generatedAt || new Date().toISOString(),
    environment: {
      runtime: process.version,
      platform: platform(),
      release: release(),
      architecture: arch(),
      host: hostname(),
    },
    invocationId: input.run?.invocationId || null,
  },
});
const validation = validatePhase15ReleaseManifest(manifest);
if (!validation.ok) throw new Error(`Generated Phase 15 release manifest is invalid: ${validation.errors.join(', ')}`);

if (options.output) {
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  ok: manifest.releaseAllowed,
  status: manifest.status,
  output: options.output ? relativeToRoot(options.output) : null,
  manifestHash: manifest.manifestHash,
  runRecordHash: manifest.run.runRecordHash,
  benchmarkResultHash: manifest.benchmark.resultHash,
  publishedPass: manifest.benchmark.summary.PASS,
  customPass: manifest.benchmark.summary.CUSTOM_PASS,
  openCriticalHigh: manifest.architecture.openCriticalHighCount + manifest.review.openCriticalHighCount,
  crossSolverCompared: manifest.crossSolver.crossSolverCompared,
  finalDesignTransferAllowed: manifest.finalDesignTransferAllowed,
  blockers: manifest.blockers,
  limitations: manifest.limitations,
}, null, 2));

if (options.requireRelease && !manifest.releaseAllowed) process.exitCode = 1;

function parseOptions(args) {
  const result = {
    input: null,
    benchmark: resolve(ROOT, 'verification/benchmarks/strix21/runs/first-batch-results.json'),
    architecture: null,
    baseline: null,
    fullRegression: null,
    output: resolve(ROOT, 'verification/evidence/validation/phase15/p15-m9-release-manifest.json'),
    generatedAt: null,
    requireRelease: false,
  };
  for (const argument of args) {
    if (argument.startsWith('--input=')) result.input = resolvePath(argument.slice(8));
    else if (argument.startsWith('--benchmark=')) result.benchmark = resolvePath(argument.slice(12));
    else if (argument.startsWith('--architecture=')) result.architecture = resolvePath(argument.slice(15));
    else if (argument.startsWith('--baseline=')) result.baseline = resolvePath(argument.slice(11));
    else if (argument.startsWith('--full-regression=')) result.fullRegression = resolvePath(argument.slice('--full-regression='.length));
    else if (argument.startsWith('--output=')) result.output = resolvePath(argument.slice(9));
    else if (argument.startsWith('--generated-at=')) result.generatedAt = argument.slice(15);
    else if (argument === '--no-output') result.output = null;
    else if (argument === '--require-release') result.requireRelease = true;
    else throw new Error(`Unsupported argument: ${argument}`);
  }
  return result;
}

function readRequiredJson(path, label) {
  if (!existsSync(path)) throw new Error(`Missing ${label}: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readJsonIfPresent(path) {
  if (!path) return null;
  return readRequiredJson(path, 'release input');
}

function gitRevision() {
  return execFileSync('git', ['-c', `safe.directory=${ROOT.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
}

function resolvePath(value) {
  return resolve(ROOT, value);
}

function relativeToRoot(path) {
  return path.replace(`${ROOT}\\`, '').replaceAll('\\', '/');
}
