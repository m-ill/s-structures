import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { stableHash } from '../../src/core/stableHash.js';
import { analyzeModel, analyzeAll } from '../../src/solver/linear3d.js';
import { runSecondOrderPDelta } from '../../src/solver/pdelta/secondOrder.js';
import { analyzeDynamics } from '../../src/dynamics/modal.js';
import { estimateGlobalBucklingTrace } from '../../src/dynamics/globalBuckling.js';
import { validatePhase8EvidenceArtifact } from '../framework/registry.js';
import { WASM_SPARSE_BACKEND_ID } from '../../src/nonlinear/equilibrium/backends/wasmSparseBackend.js';
import {
  PHASE9_BASELINE_VERIFICATION_IDS,
  PHASE9_DEBT_ROWS,
  buildPhase9BaselineEvidence,
  buildPhase9DebtRegistry,
  buildPhase9ReleaseManifestSkeleton,
  validatePhase9BaselineEvidence,
  validatePhase9DebtRegistry,
  validatePhase9ReleaseManifestSkeleton,
} from '../../src/compute/governance/phase9Baseline.js';
import {
  PHASE9_GRID_FIXTURE_SPECS,
  createPhase9GridFixture,
} from '../../src/compute/governance/phase9Fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_ROOT = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase9');
const RELEASE_ROOT = path.join(ROOT, 'verification', 'specs', 'phase9');
const args = parseArgs(process.argv.slice(2));
const generatedAt = args.generatedAt || new Date().toISOString();
const sourceRevision = args.sourceRevision || process.env.P9_SOURCE_REVISION || detectSourceRevision();
const timings = [];
const latencyRows = [];
const memorySnapshots = [];
const totalStarted = performance.now();
sampleMemory('start');

const fixtures = [];
let elasticFixtureModel = null;
for (const spec of PHASE9_GRID_FIXTURE_SPECS) {
  const fixture = await timedStage(`fixture-${spec.tier.toLowerCase()}-materialization`, () => createPhase9GridFixture(spec.tier));
  if (spec.tier === 'S') elasticFixtureModel = fixture.model;
  fixtures.push({
    tier: spec.tier,
    version: fixture.version,
    generator: fixture.config,
    inputHash: fixture.inputHash,
    ...fixture.summary,
  });
}

const elasticModel = await timedStage('elastic-fixture-build', () => structuredClone(elasticFixtureModel));
elasticModel.analysisSettings = {
  ...elasticModel.analysisSettings,
  pDeltaMethod: 'off',
  includeGeometricStiffness: false,
  responseSpectrum: { enabled: false },
};
const elastic = await timedBlockingStage('elastic-static-s', () => analyzeModel(elasticModel));
if (!elastic.ok) throw baselineError('P9_M0_ELASTIC_FAILED', elastic.reason || 'Elastic baseline failed.');

const directModel = cantileverModel();
const directLinear = await timedBlockingStage('direct-pdelta-linear-reference-s', () => analyzeAll(directModel, { W: 1 }));
const direct = await timedBlockingStage('direct-pdelta-s', () => runSecondOrderPDelta(directModel, { W: 1 }, { loadSteps: 2 }));
if (!direct.ok) throw baselineError('P9_M0_DIRECT_PDELTA_FAILED', direct.reason || 'Direct P-Delta baseline failed.');

const modalModel = axialChainModel([10], 1000);
const modal = await timedBlockingStage('modal-rsa-s', () => analyzeDynamics(modalModel));
if (!modal.ok) throw baselineError('P9_M0_MODAL_FAILED', modal.reason || 'Modal/RSA baseline failed.');

const bucklingModel = pinnedColumnModel();
const memberResults = Object.fromEntries(bucklingModel.members.map((member) => [member.id, { N: [-1, -1] }]));
const buckling = await timedBlockingStage('buckling-s', () => estimateGlobalBucklingTrace(bucklingModel, {
  modeCount: 3,
  preloadCombinationId: 'PRELOAD',
  preloadResult: qualifiedPreload(memberResults),
}));
if (buckling.status !== 'available') throw baselineError('P9_M0_BUCKLING_FAILED', buckling.reason || 'Buckling baseline failed.');

const nonlinearEvidence = await timedStage('phase8-nonlinear-evidence-freeze', loadNonlinearEvidence);
const inventories = await timedStage('debt-inventory-scan', buildDebtInventories);
const debtRegistry = buildPhase9DebtRegistry({ generatedAt, sourceRevision, inventories });
assertValid(validatePhase9DebtRegistry(debtRegistry), 'Phase 9 debt registry');

const directExpected = (10 * 3 ** 3) / (3 * 200_000_000 * 8e-5);
const modalExpectedPeriod = 2 * Math.PI * Math.sqrt(10 / 1000);
const bucklingExpected = Math.PI ** 2 * 205000000 * 508e-8 / 3 ** 2;
const elasticSummary = summarizeElastic(elastic);
const directSummary = summarizeDirect(direct, directLinear);
const modalSummary = summarizeModal(modal);
const bucklingSummary = summarizeBuckling(buckling);
const sumStageMs = timings.reduce((sum, row) => sum + row.rawSamplesMs.reduce((a, b) => a + b, 0), 0);
const measuredTotalMs = round(performance.now() - totalStarted);
const overheadMs = round(Math.max(0, measuredTotalMs - sumStageMs));
const stageAccountingMs = round(Math.abs(measuredTotalMs - (sumStageMs + overheadMs)));
const fixtureHash = stableHash(fixtures.map((row) => ({
  tier: row.tier,
  inputHash: row.inputHash,
  nodeCount: row.nodeCount,
  memberCount: row.memberCount,
  activeDof: row.activeDof,
  combinationCount: row.combinationCount,
})));
const blockers = [
  'M_TIER_ELASTIC_CURRENT_DENSE_PATH_NOT_EXECUTED',
  'M_TIER_PUSHOVER_END_TO_END_REQUIRED',
  'M_TIER_NLTH_END_TO_END_REQUIRED',
  'BROWSER_UI_LATENCY_EVIDENCE_REQUIRED',
];
const actual = {
  fixtures,
  timings,
  timerAccounting: {
    stageSumMs: round(sumStageMs),
    overheadMs,
    totalMs: measuredTotalMs,
  },
  memory: summarizeMemory(),
  mainThreadLatency: {
    method: 'zero-delay timer scheduled immediately before synchronous operation',
    rows: latencyRows,
    maximumMs: round(Math.max(0, ...latencyRows.flatMap((row) => row.rawSamplesMs))),
  },
  golden: {
    elastic: elasticSummary,
    directPDelta: directSummary,
    modalRsa: modalSummary,
    buckling: bucklingSummary,
  },
  operationCounts: {
    elasticMembers: elasticModel.members.length,
    elasticCombinations: Object.keys(elastic.byCombo || {}).length,
    directLoadSteps: direct.steps?.length || 0,
    directIterations: direct.convergence?.iterations || direct.iterations?.length || 0,
    modalModes: modal.modes?.length || 0,
    bucklingModes: buckling.modes?.length || 0,
  },
  syntheticKernelDistinction: {
    source: 'verification/evidence/validation/phase8/performance/p8-m11-reference-measurement.json',
    classification: 'synthetic-kernel-not-frame-total',
    usedAsPhase9FrameTiming: false,
  },
  currentPathPolicy: {
    S: 'measured actual solver paths',
    M: 'materialized and hashed; solve blocked before current dense path',
    L: 'materialized and hashed; solve blocked before current dense path',
    nonlinear: 'Phase 8 production evidence hash reuse; no nonlinear solver rerun',
  },
};
const reference = {
  independentSmall: {
    directPDelta: { expectedDisplacement: directExpected, actualDisplacement: direct.result.disp.N2[0] },
    modal: { expectedPeriod: modalExpectedPeriod, actualPeriod: modal.modes[0].period },
    buckling: { expectedCriticalLoad: bucklingExpected, actualCriticalLoad: buckling.criticalLoadFactor },
  },
  nonlinearEvidence,
  cpuF64GoldenHash: stableHash({ elasticSummary, directSummary, modalSummary, bucklingSummary }),
  debtRegistryHash: debtRegistry.artifactHash,
};
const tolerances = {
  directDisplacementAbsolute: 1e-8,
  modalPeriodAbsolute: 1e-10,
  bucklingRelative: 0.02,
  stageAccountingAbsoluteMs: 0.001,
};
const recomputedErrors = {
  directDisplacementAbsolute: Math.abs(direct.result.disp.N2[0] - directExpected),
  modalPeriodAbsolute: Math.abs(modal.modes[0].period - modalExpectedPeriod),
  bucklingRelative: Math.abs(buckling.criticalLoadFactor - bucklingExpected) / bucklingExpected,
  stageAccountingMs,
};
for (const [key, tolerance] of Object.entries(tolerances)) {
  if (recomputedErrors[key] > tolerance) throw baselineError('P9_M0_REFERENCE_MISMATCH', `${key} exceeds ${tolerance}.`);
}

const evidence = buildPhase9BaselineEvidence({
  generatedAt,
  sourceRevision,
  environment: environmentSummary(),
  backendBuilds: {
    elastic: { id: 'linear-static-3d-frame', target: 'javascript-cpu', precision: 'f64' },
    nonlinear: { id: WASM_SPARSE_BACKEND_ID, target: 'wasm-cpu', precision: 'f64', evidenceMode: 'reused' },
    gpu: { id: null, implemented: false, qualification: 'G0' },
  },
  executionPlan: {
    profile: args.profile,
    measuredRuns: args.runs,
    elasticDynamicPolicy: 'actual-small-reference',
    mediumLargePolicy: 'materialize-hash-preflight-only',
    nonlinearPolicy: 'reuse-phase8-evidence-no-rerun',
  },
  fixtureHash,
  actual,
  reference,
  tolerances,
  recomputedErrors,
  results: verificationResults(),
  blockers,
  qualificationImpact: 'G0-baseline-only-no-design-transfer',
});
assertValid(validatePhase9BaselineEvidence(evidence), 'Phase 9 M0 evidence');
const manifest = buildPhase9ReleaseManifestSkeleton({
  generatedAt,
  sourceRevision,
  evidence: {
    baseline: evidence.artifactHash,
    debtRegistry: debtRegistry.artifactHash,
  },
  blockers,
});
assertValid(validatePhase9ReleaseManifestSkeleton(manifest), 'Phase 9 release manifest');

await fs.mkdir(OUT_ROOT, { recursive: true });
await fs.mkdir(RELEASE_ROOT, { recursive: true });
await writeJson(path.join(OUT_ROOT, 'p9-m0-baseline.json'), evidence);
await writeJson(path.join(OUT_ROOT, 'p9-m0-debt-inventory.json'), debtRegistry);
await writeJson(path.join(RELEASE_ROOT, 'release-manifest.json'), manifest);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P9-M0',
  profile: args.profile,
  fixtureHash,
  tiers: fixtures.map((row) => ({ tier: row.tier, activeDof: row.activeDof, members: row.memberCount })),
  measuredOperations: timings.map((row) => row.id),
  nonlinearTestsRerun: false,
  blockers,
  evidenceHash: evidence.artifactHash,
  debtRegistryHash: debtRegistry.artifactHash,
  manifestHash: manifest.manifestHash,
}, null, 2));

async function timedStage(id, fn) {
  const samples = [];
  let value;
  for (let run = 0; run < args.runs; run += 1) {
    const started = performance.now();
    value = await fn();
    samples.push(round(performance.now() - started));
  }
  timings.push({ id, rawSamplesMs: samples, medianMs: median(samples), runCount: samples.length });
  sampleMemory(id);
  return value;
}

async function timedBlockingStage(id, fn) {
  const samples = [];
  const latency = [];
  let value;
  for (let run = 0; run < args.runs; run += 1) {
    const probeStarted = performance.now();
    const probe = new Promise((resolve) => setTimeout(() => resolve(round(performance.now() - probeStarted)), 0));
    const started = performance.now();
    value = fn();
    samples.push(round(performance.now() - started));
    latency.push(await probe);
  }
  timings.push({ id, rawSamplesMs: samples, medianMs: median(samples), runCount: samples.length });
  latencyRows.push({ operation: id, rawSamplesMs: latency, p95Ms: percentile(latency, 0.95) });
  sampleMemory(id);
  return value;
}

async function loadNonlinearEvidence() {
  const rows = [];
  for (const relativePath of [
    'verification/evidence/validation/phase8/p8-m5-formal-pushover.json',
    'verification/evidence/validation/phase8/p8-m8-mdof-nlth.json',
  ]) {
    const artifact = JSON.parse(await fs.readFile(path.join(ROOT, relativePath), 'utf8'));
    assertValid(validatePhase8EvidenceArtifact(artifact), relativePath);
    rows.push({
      kind: artifact.milestone === 'P8-M5' ? 'pushover' : 'nlth',
      sourcePath: relativePath,
      sourceRevision: artifact.sourceRevision,
      suiteId: artifact.suiteId,
      status: artifact.status,
      evidenceHash: stableHash(artifact),
      verificationCount: artifact.verificationIds.length,
      rerun: false,
    });
  }
  return rows;
}

async function buildDebtInventories() {
  const inventories = {};
  for (const debt of PHASE9_DEBT_ROWS) {
    inventories[debt.id] = await Promise.all(debt.currentPaths.map(describePath));
  }
  inventories['P9-DEBT-09'] = await scanCallers('analyzeModel');
  inventories['P9-DEBT-10'] = await scanLegacyExports();
  inventories['P9-DEBT-11'] = await Promise.all([
    'src/nonlinear/runtime/protocol.js',
    'src/nonlinear/runtime/analysisWorker.js',
    'src/nonlinear/runtime/workerClient.js',
    'src/nonlinear/runtime/workerCore.js',
  ].map(describePath));
  return inventories;
}

async function describePath(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  const stats = await fs.stat(absolute);
  if (stats.isFile()) {
    const content = await fs.readFile(absolute, 'utf8');
    return { path: relativePath.replaceAll('\\', '/'), type: 'file', bytes: stats.size, contentHash: stableHash(content) };
  }
  const files = await walk(absolute);
  return {
    path: relativePath.replaceAll('\\', '/'),
    type: 'directory',
    fileCount: files.length,
    contentHash: stableHash(await Promise.all(files.map(async (file) => ({
      path: path.relative(ROOT, file).replaceAll('\\', '/'),
      content: await fs.readFile(file, 'utf8'),
    })))),
  };
}

async function scanCallers(symbol) {
  const files = [
    ...(await walk(path.join(ROOT, 'src'))),
    ...(await walk(path.join(ROOT, 'tests'))),
    ...(await walk(path.join(ROOT, 'tools'))),
  ];
  const matcher = new RegExp(`\\b${symbol}\\s*\\(`, 'g');
  const rows = [];
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const occurrences = [...content.matchAll(matcher)].length;
    if (!occurrences) continue;
    const relativePath = path.relative(ROOT, file).replaceAll('\\', '/');
    rows.push({ path: relativePath, occurrences, scope: relativePath.startsWith('src/') ? 'production' : 'verification-tooling' });
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path));
}

async function scanLegacyExports() {
  const index = await fs.readFile(path.join(ROOT, 'src', 'index.js'), 'utf8');
  return ['analyzePDelta', 'runPushover', 'runNewmarkNlth'].map((symbol) => ({
    symbol,
    publicExport: new RegExp(`\\b${symbol}\\b`).test(index),
    targetMilestone: 'P9-M10',
  }));
}

async function walk(directory) {
  const output = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(item));
    else if (/\.(?:js|mjs)$/.test(entry.name)) output.push(item);
  }
  return output;
}

function verificationResults() {
  const statements = {
    'P9-BASE-01': 'S/M/L fixture descriptors and generated inputs are present.',
    'P9-BASE-02': 'Canonical fixture hashes and counts are recorded.',
    'P9-BASE-03': 'CPU f64 elastic and dynamic golden channels are recorded.',
    'P9-BASE-04': 'Phase 8 Pushover and MDOF NLTH evidence hashes are frozen without rerunning nonlinear suites.',
    'P9-BASE-05': 'Raw operation and total timer samples are recorded.',
    'P9-BASE-06': 'Stage, overhead and total accounting is recomputed.',
    'P9-BASE-07': 'Synchronous main-thread timer latency samples are recorded.',
    'P9-BASE-08': 'Process memory snapshots and peak values are recorded.',
    'P9-BASE-09': 'Sync caller, sparse, Worker and legacy inventories are frozen.',
    'P9-BASE-10': 'Every debt row has an owner, target milestone and replacement.',
    'P9-REF-01': 'Current and target module ownership is explicit.',
  };
  return PHASE9_BASELINE_VERIFICATION_IDS.map((id) => ({
    id,
    status: 'PASS',
    test: 'npm run baseline:p9:m0',
    statement: statements[id],
  }));
}

function summarizeElastic(result) {
  const combos = Object.entries(result.byCombo || {}).map(([id, row]) => ({
    id,
    ok: row.ok,
    equilibriumStatus: row.summary?.equilibriumStatus || null,
    maxDisplacement: finite(row.summary?.maxDisplacement ?? row.dmax),
    maxRatio: finite(row.maxRatio),
  }));
  return {
    ok: result.ok,
    comboCount: combos.length,
    complete: result.combinationCompleteness?.allComplete === true,
    auditStatus: result.audit?.status || null,
    combos,
    resultHash: stableHash(combos),
  };
}

function summarizeDirect(result, linear) {
  const summary = {
    ok: result.ok,
    method: result.method,
    converged: result.convergence?.converged === true,
    amplification: finite(result.amplification),
    displacementX: finite(result.result?.disp?.N2?.[0]),
    linearDisplacementX: finite(linear?.disp?.N2?.[0]),
    reactionX: finite(result.result?.reactions?.N1?.rx),
  };
  return { ...summary, resultHash: stableHash(summary) };
}

function summarizeModal(result) {
  const summary = {
    ok: result.ok,
    modeCount: result.modes?.length || 0,
    periods: (result.modes || []).map((mode) => finite(mode.period)),
    rsaBaseShearX: finite(result.rsa?.combined?.x?.baseShear),
  };
  return { ...summary, resultHash: stableHash(summary) };
}

function summarizeBuckling(result) {
  const summary = {
    status: result.status,
    criticalLoadFactor: finite(result.criticalLoadFactor),
    modeCount: result.modes?.length || 0,
    residuals: (result.modes || []).map((mode) => finite(mode.residual)),
  };
  return { ...summary, resultHash: stableHash(summary) };
}

function sampleMemory(stage) {
  const usage = process.memoryUsage();
  memorySnapshots.push({
    stage,
    rssBytes: usage.rss,
    heapUsedBytes: usage.heapUsed,
    heapTotalBytes: usage.heapTotal,
    externalBytes: usage.external,
    arrayBuffersBytes: usage.arrayBuffers,
  });
}

function summarizeMemory() {
  return {
    snapshots: memorySnapshots,
    peakRssBytes: Math.max(...memorySnapshots.map((row) => row.rssBytes)),
    peakHeapUsedBytes: Math.max(...memorySnapshots.map((row) => row.heapUsedBytes)),
    peakArrayBuffersBytes: Math.max(...memorySnapshots.map((row) => row.arrayBuffersBytes)),
  };
}

function environmentSummary() {
  return {
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    node: process.version,
    cpu: os.cpus()[0]?.model || 'unknown',
    logicalCores: os.cpus().length,
    memoryBytes: os.totalmem(),
    powerMode: 'not-measured',
  };
}

function cantileverModel() {
  return {
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N2', x: 0, y: 0, z: 3 },
    ],
    members: [{ id: 'M1', n1: 'N1', n2: 'N2', matId: 'MAT', secId: 'SEC', releases: { i: 'rigid', j: 'rigid' } }],
    materials: [{ id: 'MAT', E: 200000, G: 76923, Fy: 250, density: 0, allow: { fb: 150, ft: 150, fc: 150, fv: 90 } }],
    sections: [{ id: 'SEC', type: 'direct', A: 0.02, Iy: 8e-5, Iz: 8e-5, J: 1e-5, Zy: 5e-4, Zz: 5e-4 }],
    loads: [{ id: 'H', type: 'nodal', node: 'N2', P: 10, dir: '+x', case: 'W' }],
    loadCases: [{ id: 'W', name: 'Wind', type: 'wind' }],
    loadCombinations: [{ id: 'C1', name: 'Wind', factors: { W: 1 } }],
    analysisSettings: { responseSpectrum: { enabled: false }, validateBeforeSolve: false },
  };
}

function axialChainModel(masses, targetStiffness) {
  const E = 1;
  const A = targetStiffness / 1000;
  return {
    units: { length: 'm', force: 'kN', moment: 'kN.m' },
    materials: [{ id: 'TEST', E, G: E / 2.6, density: 0 }],
    sections: [{ id: 'AXIAL', A, Iy: 1, Iz: 1, J: 1 }],
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      ...masses.map((mass, index) => ({
        id: `N${index + 1}`,
        x: index + 1,
        y: 0,
        z: 0,
        support: 'custom',
        fix: [false, true, true, true, true, true],
        mass: [mass, 0, 0],
      })),
    ],
    members: masses.map((_mass, index) => ({ id: `M${index + 1}`, type: 'truss', n1: `N${index}`, n2: `N${index + 1}`, matId: 'TEST', secId: 'AXIAL' })),
    analysisSettings: {
      modalModeCount: masses.length,
      responseSpectrum: { enabled: true, method: 'SRSS', directions: ['x'], scale: 1, points: [{ period: 0, sa: 2 }, { period: 5, sa: 2 }] },
    },
  };
}

function pinnedColumnModel() {
  return {
    nodes: Array.from({ length: 9 }, (_item, index) => ({ id: `N${index}`, x: 0, y: 0, z: (3 * index) / 8, support: index === 0 || index === 8 ? 'pin' : undefined })),
    members: Array.from({ length: 8 }, (_item, index) => ({ id: `C${index + 1}`, n1: `N${index}`, n2: `N${index + 1}`, matId: 'steel', secId: 'h300' })),
  };
}

function qualifiedPreload(qualifiedMemberResults) {
  const combo = {
    ok: true,
    anyOk: true,
    combo: { id: 'PRELOAD' },
    memberResults: qualifiedMemberResults,
    failedComponents: [],
    unstableMembers: new Set(),
    summary: { equilibriumStatus: 'PASS', equilibriumOk: true, designBlocked: false },
  };
  return {
    ok: true,
    version: 'linear-static-result-v1',
    analysisEligibility: { eligible: true, status: 'qualified', reason: null },
    combinationCompleteness: { allComplete: true, rows: [{ comboId: 'PRELOAD', complete: true, status: 'complete', reasons: [] }] },
    audit: { ok: true, status: 'PASS', designBlocked: false, rows: [{ comboId: 'PRELOAD', ok: true, equilibriumStatus: 'PASS', designBlocked: false }] },
    byCombo: { PRELOAD: combo },
  };
}

function parseArgs(values) {
  const parsed = { profile: 'ci-minimal', runs: 1, generatedAt: null, sourceRevision: null };
  for (const value of values) {
    if (value.startsWith('--profile=')) parsed.profile = value.slice('--profile='.length);
    else if (value.startsWith('--runs=')) parsed.runs = Math.max(1, Number.parseInt(value.slice('--runs='.length), 10) || 1);
    else if (value.startsWith('--generated-at=')) parsed.generatedAt = value.slice('--generated-at='.length);
    else if (value.startsWith('--source-revision=')) parsed.sourceRevision = value.slice('--source-revision='.length);
    else throw baselineError('P9_M0_ARGUMENT_UNSUPPORTED', `Unsupported argument: ${value}`);
  }
  return parsed;
}

function detectSourceRevision() {
  try {
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
  } catch {
    throw baselineError('P9_M0_SOURCE_REVISION_REQUIRED', 'Pass --source-revision when Git revision detection is unavailable.');
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return round(sorted[Math.floor(sorted.length / 2)] || 0);
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return round(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] || 0);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value) {
  return Number(Number(value).toFixed(6));
}

function assertValid(validation, label) {
  if (!validation.ok) throw baselineError('P9_M0_ARTIFACT_INVALID', `${label}: ${validation.errors.join(', ')}`);
}

function baselineError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
