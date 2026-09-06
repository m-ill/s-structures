import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import {
  buildPhase8M11EvidenceArtifact,
  buildPhase8ReleaseManifest,
  createWasmSparseBackend,
  executeAllPhase8PilotPackages,
  executePhase8PilotPackage,
  listPhase8PilotPackages,
  measurePhase8Performance,
  runPhase8IndependentReferenceQualification,
  summarizePhase8PilotArtifacts,
  validatePhase8M11EvidenceArtifact,
  validatePhase8PerformanceMeasurement,
  validatePhase8PilotArtifact,
  validatePhase8ReleaseManifest,
} from '../../src/index.js';
import { stableHash } from '../../src/core/stableHash.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVIDENCE_ROOT = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase8');
const PILOT_EVIDENCE_ROOT = path.join(EVIDENCE_ROOT, 'pilots');
const PERFORMANCE_EVIDENCE_ROOT = path.join(EVIDENCE_ROOT, 'performance');
const VERIFICATION_ROOT = path.join(ROOT, 'verification', 'specs', 'phase8');
const PILOT_DOC_ROOT = path.join(VERIFICATION_ROOT, 'pilots');
const PERFORMANCE_DOC_ROOT = path.join(VERIFICATION_ROOT, 'performance');
const args = parseArgs(process.argv.slice(2));
const generatedAt = args.generatedAt
  || (process.env.SOURCE_DATE_EPOCH ? sourceDate(process.env.SOURCE_DATE_EPOCH) : new Date().toISOString());
const sourceRevision = args.sourceRevision || process.env.P8_SOURCE_REVISION || 'working-tree';

await ensureDirectories();

if (args.pilotId) {
  const pilot = listPhase8PilotPackages().find((row) => row.id === args.pilotId);
  if (!pilot) throw cliError('P8_M11_PILOT_NOT_FOUND', `Unknown pilot ${args.pilotId}.`);
  const backend = await createWasmSparseBackend();
  const run = await executePhase8PilotPackage(pilot, { backend, generatedAt, sourceRevision });
  await writePilotOutputs(run);
  console.log(JSON.stringify(pilotConsoleSummary(run), null, 2));
  process.exitCode = run.artifact.reproducibility.status === 'PASS' ? 0 : 1;
} else {
  await runFullQualification();
}

async function runFullQualification() {
  const referenceProfile = await readJson(path.join(EVIDENCE_ROOT, 'p8-m0-reference-profile.json'));
  const independent = runPhase8IndependentReferenceQualification();
  const parallelEvidence = await measureParallelWorkerDeterminism(referenceProfile);
  const backend = await createWasmSparseBackend();
  const performance = await measurePhase8Performance({
    backend,
    referenceProfile,
    parallelEvidence,
    smallDof: args.quick ? 12 : 24,
    mediumDof: args.quick ? 256 : 10000,
    targetDof: args.quick ? 1000 : 50000,
    targetNnz: args.quick ? 3000 : 75000 * 144,
    pushoverKernelSteps: args.quick ? 4 : 100,
    historySteps: args.quick ? 600 : 20000,
    historyChunkSize: args.quick ? 50 : 200,
    warmupRuns: 1,
    measuredRuns: args.quick ? 2 : 5,
    availableMemoryBytes: referenceProfile.hardware?.memoryBytes || os.totalmem(),
  });
  assertValid(validatePhase8PerformanceMeasurement(performance.measurement), 'performance measurement');

  await writeJson(path.join(EVIDENCE_ROOT, 'p8-m11-independent-reference.json'), independent);
  await writeJson(path.join(PERFORMANCE_EVIDENCE_ROOT, 'p8-m11-reference-measurement.json'), performance);
  await writeText(path.join(PERFORMANCE_DOC_ROOT, 'REFERENCE_PROFILE.md'), performanceMarkdown(performance, parallelEvidence));

  if (args.performanceOnly) {
    console.log(JSON.stringify({
      ok: true,
      independentStatus: independent.status,
      performanceStatus: performance.status,
      performanceBlockers: performance.blockers,
      parallelWorkerStatus: parallelEvidence.status,
      measurementHash: performance.measurementHash,
    }, null, 2));
    return;
  }

  const pilots = listPhase8PilotPackages();
  const runs = await executeAllPhase8PilotPackages(pilots, {
    backend,
    generatedAt,
    sourceRevision,
    onProgress(event) {
      console.error(`[P8-M11] ${event.completed}/${event.total} ${event.pilotId}: ${event.status}`);
    },
  });
  for (const run of runs) await writePilotOutputs(run);
  const pilotArtifacts = runs.map((run) => run.artifact);
  const pilotSummary = summarizePhase8PilotArtifacts(pilotArtifacts);
  await writeJson(path.join(PILOT_EVIDENCE_ROOT, 'p8-m11-pilot-summary.json'), pilotSummary);

  const historicalEvidence = await loadHistoricalEvidence();
  const review = await loadCodeReview();
  const externalComparisons = await loadExternalComparisons();
  const releaseManifest = buildPhase8ReleaseManifest({
    independent,
    performance,
    pilotSummary,
    historicalEvidence,
    review,
    externalComparisons,
    generatedAt,
    sourceRevision,
  });
  assertValid(validatePhase8ReleaseManifest(releaseManifest), 'release manifest');
  const evidence = buildPhase8M11EvidenceArtifact({
    performance,
    pilotSummary,
    generatedAt,
    sourceRevision,
    independentHash: independent.qualificationHash,
    releaseManifestHash: releaseManifest.manifestHash,
    environment: environmentSummary(referenceProfile, backend),
  });
  assertValid(validatePhase8M11EvidenceArtifact(evidence), 'M11 evidence');

  await writeJson(path.join(VERIFICATION_ROOT, 'release-manifest.json'), releaseManifest);
  await writeJson(path.join(EVIDENCE_ROOT, 'p8-m11-qualification-release.json'), evidence);
  await writeText(path.join(VERIFICATION_ROOT, 'QUALIFICATION_RELEASE.md'), releaseMarkdown({
    independent,
    performance,
    pilotSummary,
    releaseManifest,
  }));

  console.log(JSON.stringify({
    ok: releaseManifest.implementation.status === 'complete',
    implementationStatus: releaseManifest.implementation.status,
    releaseStatus: releaseManifest.release.status,
    designTransferAllowed: releaseManifest.release.designTransferAllowed,
    cumulativeGrade: releaseManifest.release.cumulativeGrade,
    independentStatus: independent.status,
    performanceStatus: performance.status,
    performanceBlockers: performance.blockers,
    parallelWorkerStatus: parallelEvidence.status,
    pilotStatus: pilotSummary.status,
    verifiedPilotCount: pilotSummary.verifiedPilotCount,
    blockers: releaseManifest.blockers,
    manifestHash: releaseManifest.manifestHash,
    evidenceHash: evidence.artifactHash,
  }, null, 2));
}

async function measureParallelWorkerDeterminism(referenceProfile) {
  const config = { dofCount: args.quick ? 128 : 1024, solveCount: args.quick ? 3 : 12 };
  const started = performance.now();
  const results = await Promise.all([runParallelWorker(config), runParallelWorker(config)]);
  const durationMs = performance.now() - started;
  const deterministic = results.every((row) => row.ok)
    && results.every((row) => row.resultHash === results[0].resultHash);
  const eventOrderingEquivalent = results.every((row) => row.eventOrderingHash === results[0].eventOrderingHash);
  const profileId = stableHash({
    hardware: referenceProfile.hardware,
    os: referenceProfile.os,
    runtime: process.version,
  }).slice(0, 24);
  const sourceCore = {
    config,
    resultHashes: results.map((row) => row.resultHash),
    eventOrderingHashes: results.map((row) => row.eventOrderingHash),
    backends: results.map((row) => row.backend),
  };
  return {
    status: deterministic && eventOrderingEquivalent ? 'PASS' : 'BLOCKED',
    kind: 'deterministic-parallel-worker',
    coverage: 'two-independent-node-worker-threads-production-wasm-sparse-kernel',
    profileId,
    sourceHash: stableHash(sourceCore).slice(0, 24),
    reproducible: true,
    metrics: {
      deterministic,
      eventOrderingEquivalent,
      workerCount: results.length,
      dofCount: config.dofCount,
      solveCountPerWorker: config.solveCount,
      durationMs,
      maximumRelativeResidual: Math.max(...results.map((row) => finiteOrInfinity(row.maximumRelativeResidual))),
      resultHashes: results.map((row) => row.resultHash),
      eventOrderingHashes: results.map((row) => row.eventOrderingHash),
    },
  };
}

function runParallelWorker(workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./p8-m11-parallel-worker.mjs', import.meta.url), {
      type: 'module',
      workerData,
    });
    worker.once('message', (message) => {
      if (message?.ok) resolve(message);
      else reject(cliError(message?.code || 'P8_M11_PARALLEL_WORKER_FAILED', message?.message || 'Parallel Worker failed.'));
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(cliError('P8_M11_PARALLEL_WORKER_EXIT', `Parallel Worker exited with code ${code}.`));
    });
  });
}

async function writePilotOutputs(run) {
  assertValid(validatePhase8PilotArtifact(run.artifact, run.pilot), `${run.pilot.id} artifact`);
  await writeJson(path.join(PILOT_EVIDENCE_ROOT, `${run.pilot.id}.package.json`), run.pilot);
  await writeJson(path.join(PILOT_EVIDENCE_ROOT, `${run.pilot.id}.run.json`), {
    version: run.version,
    pilotId: run.pilot.id,
    packageHash: run.pilot.packageHash,
    execution: run.execution,
    report: run.report,
    resultSummaries: run.resultSummaries,
    durationMs: run.durationMs,
  });
  await writeJson(path.join(PILOT_EVIDENCE_ROOT, `${run.pilot.id}.artifact.json`), run.artifact);
  await writeText(path.join(PILOT_DOC_ROOT, `${run.pilot.id}.md`), pilotMarkdown(run));
}

async function loadHistoricalEvidence() {
  const files = [
    'p8-m0-governance.json',
    'p8-m1-domain-state.json',
    'p8-m2-equilibrium.json',
    'p8-m3-corotational.json',
    'p8-m4-concentrated-hinge.json',
    'p8-m5-formal-pushover.json',
    'p8-m6-fiber-pmm.json',
    'p8-m6-pmm-runtime.json',
    'p8-m7-arc-cyclic.json',
    'p8-m8-mdof-nlth.json',
    'p8-m9-integration-recovery.json',
    'p8-m10-ui-api.json',
  ];
  return Promise.all(files.map((file) => readJson(path.join(EVIDENCE_ROOT, file))));
}

async function loadCodeReview() {
  const reviewPath = path.join(EVIDENCE_ROOT, 'p8-m11-code-review.json');
  try {
    return await readJson(reviewPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return {
      completed: false,
      findings: [],
      reportPath: 'verification/evidence/validation/phase8/p8-m11-code-review.md',
    };
  }
}

async function loadExternalComparisons() {
  const root = path.join(EVIDENCE_ROOT, 'external-comparisons');
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
    return Promise.all(files.map((entry) => readJson(path.join(root, entry.name))));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function pilotMarkdown(run) {
  const artifact = run.artifact;
  const cases = run.resultSummaries.map((row, index) => [
    String(index + 1),
    row.status,
    row.terminationReason || row.reason || '-',
    row.resultHash || '-',
  ]);
  return `# ${run.pilot.id} - ${run.pilot.title}\n\n`
    + `- Package hash: \`${run.pilot.packageHash}\`\n`
    + `- Input hash: \`${run.pilot.inputHash}\`\n`
    + `- Engine: \`${artifact.execution.engineId}\`\n`
    + `- Execution: \`${artifact.execution.status}\` / \`${artifact.execution.terminationReason}\`\n`
    + `- Reproducibility: \`${artifact.reproducibility.status}\`\n`
    + `- Qualification: \`${artifact.qualification.status}\`, design blocked: \`${artifact.qualification.designBlocked}\`\n`
    + `- Duration: \`${run.durationMs.toFixed(3)} ms\`\n\n`
    + `${markdownTable(['Case', 'Status', 'Termination', 'Result hash'], cases)}\n\n`
    + `## Workflow\n\n${run.pilot.workflow.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n\n`
    + `## Qualification Boundary\n\n`
    + `This run proves deterministic production-solver input-to-report execution. Independent external comparison and owner sign-off are missing, so design transfer remains blocked.\n`;
}

function performanceMarkdown(qualification, parallelEvidence) {
  const measurement = qualification.measurement;
  const rows = qualification.results.map((row) => [row.id, row.status, row.blockerCode || '-', row.statement]);
  return `# Phase 8 M11 Reference Performance Profile\n\n`
    + `- Status: \`${qualification.status}\`\n`
    + `- Measurement hash: \`${qualification.measurementHash}\`\n`
    + `- Qualification hash: \`${qualification.qualificationHash}\`\n`
    + `- Backend: \`${measurement.backend.id}\`, \`${measurement.backend.numericPrecision}\`, deterministic \`${measurement.backend.deterministic}\`\n`
    + `- Sparse kernel: ${measurement.mediumKernel.dofCount} DOF, ${measurement.mediumKernel.solveCount} solves, median ${measurement.mediumKernel.medianMs.toFixed(3)} ms\n`
    + `- Streaming: ${measurement.streaming.outputStepCount} outputs, ${measurement.streaming.retainedBytes} retained bytes\n`
    + `- Parallel Worker: \`${parallelEvidence.status}\`, ${parallelEvidence.metrics.workerCount} workers\n\n`
    + `${markdownTable(['ID', 'Status', 'Blocker', 'Scope'], rows)}\n\n`
    + `Kernel timing is not an end-to-end frame timing. M-tier Pushover/NLTH and browser input-latency evidence remain blocked until measured with the approved fixtures.\n`;
}

function releaseMarkdown(input) {
  const grades = input.releaseManifest.grades.map((row) => [row.id, row.name, row.status, row.blockers.join(', ') || '-']);
  const pilots = input.pilotSummary.results.map((row) => [row.pilotId, row.status, row.qualification, String(row.designBlocked)]);
  return `# Phase 8 M11 Qualification and Release Decision\n\n`
    + `- Implementation: \`${input.releaseManifest.implementation.status}\`\n`
    + `- Release: \`${input.releaseManifest.release.status}\`\n`
    + `- Design transfer allowed: \`${input.releaseManifest.release.designTransferAllowed}\`\n`
    + `- Cumulative grade: \`${input.releaseManifest.release.cumulativeGrade}\`\n`
    + `- Manifest hash: \`${input.releaseManifest.manifestHash}\`\n`
    + `- Independent in-repository references: \`${input.independent.status}\`\n`
    + `- Performance qualification: \`${input.performance.status}\`\n\n`
    + `## Qualification Grades\n\n${markdownTable(['Grade', 'Name', 'Status', 'Blockers'], grades)}\n\n`
    + `## Pilot Packages\n\n${markdownTable(['Pilot', 'Artifact', 'Qualification', 'Design blocked'], pilots)}\n\n`
    + `## Decision\n\n`
    + `${input.releaseManifest.release.statement}\n\n`
    + `No external commercial-solver result is synthesized by this repository. Missing external comparisons, approved M-tier end-to-end measurements, browser latency, and independent pilot sign-off remain explicit release blockers.\n`;
}

function environmentSummary(referenceProfile, backend) {
  return {
    referenceProfileVersion: referenceProfile.version,
    platform: process.platform,
    release: os.release(),
    architecture: process.arch,
    node: process.version,
    cpu: os.cpus()[0]?.model || null,
    logicalCores: os.cpus().length,
    memoryBytes: os.totalmem(),
    backend: {
      id: backend.id,
      executionTarget: backend.executionTarget,
      numericPrecision: backend.numericPrecision,
      deterministic: backend.deterministic === true,
    },
  };
}

function pilotConsoleSummary(run) {
  return {
    ok: run.artifact.reproducibility.status === 'PASS',
    pilotId: run.pilot.id,
    status: run.execution.status,
    terminationReason: run.execution.terminationReason,
    resultHash: run.execution.resultHash,
    reproducibility: run.artifact.reproducibility.status,
    qualification: run.artifact.qualification.status,
    designBlocked: run.artifact.qualification.designBlocked,
    durationMs: run.durationMs,
  };
}

function markdownTable(headers, rows) {
  const line = (values) => `| ${values.map((value) => String(value).replaceAll('|', '\\|')).join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

function parseArgs(values) {
  const result = {
    pilotId: null,
    quick: false,
    performanceOnly: false,
    generatedAt: null,
    sourceRevision: null,
  };
  for (const value of values) {
    if (value === '--quick') result.quick = true;
    else if (value === '--performance-only') result.performanceOnly = true;
    else if (value.startsWith('--pilot=')) result.pilotId = value.slice('--pilot='.length).trim();
    else if (value.startsWith('--generated-at=')) result.generatedAt = value.slice('--generated-at='.length).trim();
    else if (value.startsWith('--source-revision=')) result.sourceRevision = value.slice('--source-revision='.length).trim();
    else throw cliError('P8_M11_ARGUMENT_INVALID', `Unknown argument ${value}.`);
  }
  return result;
}

function sourceDate(value) {
  if (!value) return new Date().toISOString();
  const number = Number(value);
  if (Number.isFinite(number)) return new Date(number * 1000).toISOString();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw cliError('P8_M11_SOURCE_DATE_INVALID', 'SOURCE_DATE_EPOCH is invalid.');
  return date.toISOString();
}

function finiteOrInfinity(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Infinity;
}

async function ensureDirectories() {
  await Promise.all([
    fs.mkdir(PILOT_EVIDENCE_ROOT, { recursive: true }),
    fs.mkdir(PERFORMANCE_EVIDENCE_ROOT, { recursive: true }),
    fs.mkdir(PILOT_DOC_ROOT, { recursive: true }),
    fs.mkdir(PERFORMANCE_DOC_ROOT, { recursive: true }),
  ]);
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeText(file, value) {
  await fs.writeFile(file, value.endsWith('\n') ? value : `${value}\n`, 'utf8');
}

function assertValid(validation, label) {
  if (validation.ok) return;
  throw cliError('P8_M11_ARTIFACT_INVALID', `${label} is invalid: ${validation.errors.join(', ')}`);
}

function cliError(code, message) {
  const error = new Error(message);
  error.name = 'Phase8M11QualificationCliError';
  error.code = code;
  return error;
}
