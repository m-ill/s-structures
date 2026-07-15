import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createPhase9GridFixture } from '../src/compute/governance/phase9Fixtures.js';
import {
  buildPhase9M3Evidence,
  phase9M3FactorPlan,
  upgradePhase9ManifestToM3,
  validatePhase9M3Evidence,
  validatePhase9M3Manifest,
} from '../src/compute/governance/phase9M3.js';
import { executeProductionElastic } from '../src/compute/adapters/elasticProductionAdapter.js';
import { analyzeModel } from '../src/solver/linear3d.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = path.join(ROOT, 'reports', 'validation-evidence', 'phase9', 'p9-m3-elastic-runtime.json');
const MANIFEST_PATH = path.join(ROOT, 'docs', 'verification', 'phase9', 'release-manifest.json');
const PRIOR_PATH = path.join(ROOT, 'reports', 'validation-evidence', 'phase9', 'p9-m2-cpu-wasm.json');
const generatedAt = new Date().toISOString();
const sourceRevision = detectSourceRevision();
const previousManifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
const prior = JSON.parse(await fs.readFile(PRIOR_PATH, 'utf8'));
const tolerances = {
  displacement: { absoluteMax: 1e-8, relativeL2: 1e-6 },
  forceAndMember: { absoluteMax: 1, relativeL2: 0.01 },
  designRatio: { absoluteMax: 1e-6 },
};

const small = createPhase9GridFixture('S');
const referenceStarted = performance.now();
const reference = analyzeModel(small.model);
const referenceMs = performance.now() - referenceStarted;
const productionStarted = performance.now();
const production = await executeProductionElastic({ model: small.model }, context());
const productionMs = performance.now() - productionStarted;
const parity = elasticParity(reference, production.result, tolerances);
if (parity.status !== 'PASS') throw new Error('M3 S-tier parity failed: ' + JSON.stringify(parity));

const medium = createPhase9GridFixture('M');
const mediumStages = [];
const mediumStarted = performance.now();
const mediumRun = await executeProductionElastic({ model: medium.model }, context((row) => {
  if (row.stage === 'combination-complete' && (row.combinationIndex === 0 || (row.combinationIndex + 1) % 5 === 0)) {
    mediumStages.push({ comboId: row.comboId, elapsedMs: round(performance.now() - mediumStarted) });
  }
}));
const mediumMs = performance.now() - mediumStarted;
if (!mediumRun.result.ok) throw new Error('M3 M-tier elastic run failed.');
const factorPlan = phase9M3FactorPlan(medium.model);
const mediumExecution = mediumRun.execution;

const blockers = [...new Set(previousManifest.blockers || [])].filter((value) => ![
  'M_TIER_ELASTIC_CURRENT_DENSE_PATH_NOT_EXECUTED',
  'P9_M3_ELASTIC_WORKER_MIGRATION_REQUIRED',
].includes(value));
const evidence = buildPhase9M3Evidence({
  generatedAt,
  sourceRevision,
  priorEvidenceHash: prior.artifactHash,
  tolerances,
  parity,
  performance: {
    small: {
      referenceSamplesMs: [round(referenceMs)],
      productionSamplesMs: [round(productionMs)],
      referenceMedianMs: round(referenceMs),
      productionMedianMs: round(productionMs),
      productionToReferenceRatio: productionMs / referenceMs,
      approvedRegressionRatio: 1.1,
    },
    medium: {
      totalMs: round(mediumMs),
      approvedBudgetMs: 240000,
      firstProductionBaseline: true,
      stages: mediumStages,
      fixture: medium.summary,
    },
  },
  execution: {
    small: executionSummary(production),
    medium: executionSummary(mediumRun),
  },
  resultStorage: {
    small: production.result.combinationStorage,
    medium: mediumRun.result.combinationStorage,
    mediumEnvelopeMemberCount: Object.keys(mediumRun.result.envelope?.memberResults || {}).length,
  },
  factorPlan: {
    version: factorPlan.version,
    combinationCount: factorPlan.combinationCount,
    groupCount: factorPlan.groupCount,
    planHash: factorPlan.planHash,
    rules: factorPlan.rules,
  },
  blockers,
});
assertValid(validatePhase9M3Evidence(evidence), 'M3 evidence');
const manifest = upgradePhase9ManifestToM3(previousManifest, evidence, { generatedAt, sourceRevision, blockers });
assertValid(validatePhase9M3Manifest(manifest), 'M3 release manifest');
await fs.writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({
  ok: true,
  evidence: path.relative(ROOT, EVIDENCE_PATH),
  artifactHash: evidence.artifactHash,
  manifestHash: manifest.manifestHash,
  small: evidence.performance.small,
  medium: evidence.performance.medium,
}, null, 2));

function elasticParity(reference, actual, limits) {
  const displacement = numericError(
    collectResultValues(reference, ['disp']),
    collectResultValues(actual, ['disp']),
  );
  const forceAndMember = numericError(
    collectResultValues(reference, ['reactions', 'memberResults']),
    collectResultValues(actual, ['reactions', 'memberResults']),
  );
  const designRatioAbsoluteMax = Math.abs(
    Number(reference.design?.summary?.maxUtilization || 0) - Number(actual.design?.summary?.maxUtilization || 0),
  );
  const statusesEqual = reference.ok === actual.ok
    && reference.audit?.status === actual.audit?.status
    && reference.designEligibility?.status === actual.designEligibility?.status
    && reference.design?.summary?.ok === actual.design?.summary?.ok;
  const pass = statusesEqual
    && displacement.absoluteMax <= limits.displacement.absoluteMax
    && displacement.relativeL2 <= limits.displacement.relativeL2
    && forceAndMember.absoluteMax <= limits.forceAndMember.absoluteMax
    && forceAndMember.relativeL2 <= limits.forceAndMember.relativeL2
    && designRatioAbsoluteMax <= limits.designRatio.absoluteMax;
  return {
    status: pass ? 'PASS' : 'FAIL',
    displacement,
    forceAndMember,
    designRatioAbsoluteMax,
    statusesEqual,
    combinationIdsEqual: JSON.stringify(Object.keys(reference.byCombo || {})) === JSON.stringify(Object.keys(actual.byCombo || {})),
    envelopeSourceIdsEqual: JSON.stringify(reference.envelope?.sources?.map((row) => row.id)) === JSON.stringify(actual.envelope?.sources?.map((row) => row.id)),
    governingTiePolicy: 'strict-greater-preserves-first-combination-order',
  };
}

function collectResultValues(analysis, fields) {
  const values = [];
  for (const comboId of Object.keys(analysis.byCombo || {}).sort()) {
    const result = analysis.byCombo[comboId];
    for (const field of fields) collectResultField(result, field, values);
  }
  for (const field of fields) collectResultField(analysis.envelope, field, values);
  return values;
}

function collectResultField(result, field, output) {
  if (field !== 'memberResults') {
    collectNumbers(result?.[field], output);
    return;
  }
  for (const memberId of Object.keys(result?.memberResults || {}).sort()) {
    const member = result.memberResults[memberId];
    for (const key of ['end', 'N', 'Vy', 'Vz', 'Tq', 'My', 'Mz', 'Nmax', 'Vymax', 'Vzmax', 'Tmax', 'Mymax', 'Mzmax']) {
      collectNumbers(member?.[key], output);
    }
    collectNumbers(member?.check?.ratio, output);
  }
}

function collectNumbers(value, output) {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) output.push(value);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (ArrayBuffer.isView(value) || Array.isArray(value)) {
    for (const item of value) collectNumbers(item, output);
    return;
  }
  for (const key of Object.keys(value).sort()) collectNumbers(value[key], output);
}

function numericError(reference, actual) {
  if (reference.length !== actual.length) return { absoluteMax: Infinity, relativeL2: Infinity, referenceCount: reference.length, actualCount: actual.length };
  let absoluteMax = 0;
  let differenceSquared = 0;
  let referenceSquared = 0;
  for (let index = 0; index < reference.length; index += 1) {
    const difference = actual[index] - reference[index];
    absoluteMax = Math.max(absoluteMax, Math.abs(difference));
    differenceSquared += difference * difference;
    referenceSquared += reference[index] * reference[index];
  }
  return {
    absoluteMax,
    relativeL2: Math.sqrt(differenceSquared) / Math.max(1e-12, Math.sqrt(referenceSquared)),
    valueCount: reference.length,
  };
}

function executionSummary(run) {
  return {
    factorizationCount: run.execution.factorizationCount,
    factorGroupCount: run.execution.factorGroupCount,
    solveCount: run.execution.solveCount,
    reusedSolveCount: run.execution.reusedSolveCount,
    componentCacheEntryCount: run.execution.componentCacheEntryCount,
    resourceBalanced: run.execution.resourceBalanced,
    peakFactorBytes: run.execution.sessionBeforeDispose?.backend?.peakBytes || 0,
    factorModes: run.execution.sessionBeforeDispose?.rows?.map((row) => row.mode) || [],
  };
}

function context(onProgress = null) {
  return {
    signal: { aborted: false },
    throwIfCancelled() {},
    reportProgress(row) { onProgress?.(row); },
    commitBoundary() {},
    yieldControl() { return Promise.resolve(); },
  };
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
  if (!validation.ok) throw new Error(label + ' invalid: ' + validation.errors.join(', '));
}

function round(value) {
  return Math.round(Number(value) * 10000) / 10000;
}
