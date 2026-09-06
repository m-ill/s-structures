import { stableHash } from '../../../src/core/stableHash.js';

export const PHASE15_DETERMINISM_EVIDENCE_VERSION = 'p15-m9-determinism-evidence-v1';
export const PHASE15_DETERMINISM_RUN_COUNT = 3;

export function runPhase15DeterminismQualification({ runBenchmark, now = () => new Date().toISOString(), timer = defaultTimer } = {}) {
  if (typeof runBenchmark !== 'function') throw new TypeError('runBenchmark must be a function.');

  const runs = [];
  for (let index = 0; index < PHASE15_DETERMINISM_RUN_COUNT; index += 1) {
    const started = timer();
    const artifact = runBenchmark();
    const durationMs = timer() - started;
    validateBenchmarkArtifact(artifact, index);
    runs.push({
      runId: `run-${index + 1}`,
      calculationHash: artifact.calculationHash,
      resultHash: artifact.resultHash,
      runRecordHash: artifact.runRecordHash,
      artifactHash: artifact.artifactHash,
      durationMs,
      summary: artifact.summary,
    });
  }

  const calculationHashes = [...new Set(runs.map((run) => run.calculationHash))];
  const resultHashes = [...new Set(runs.map((run) => run.resultHash))];
  const summaryHashes = [...new Set(runs.map((run) => stableHash(run.summary)))];
  const deterministic = calculationHashes.length === 1 && resultHashes.length === 1 && summaryHashes.length === 1;
  const deterministicRecord = {
    version: PHASE15_DETERMINISM_EVIDENCE_VERSION,
    expectedRunCount: PHASE15_DETERMINISM_RUN_COUNT,
    runCount: runs.length,
    deterministic,
    calculationHash: calculationHashes.length === 1 ? calculationHashes[0] : null,
    resultHash: resultHashes.length === 1 ? resultHashes[0] : null,
    summaryHash: summaryHashes.length === 1 ? summaryHashes[0] : null,
    runs: runs.map(({ runId, calculationHash, resultHash, summary }) => ({ runId, calculationHash, resultHash, summary })),
  };

  return Object.freeze({
    ...deterministicRecord,
    status: deterministic ? 'PASS' : 'BLOCKED',
    evidenceHash: stableHash(deterministicRecord),
    completedAt: now(),
    runs,
    m9ExecutionInputFragment: {
      determinismRuns: runs.map(({ runId, calculationHash, resultHash }) => ({ runId, calculationHash, resultHash })),
    },
  });
}

function validateBenchmarkArtifact(artifact, index) {
  if (!artifact || typeof artifact !== 'object') throw new TypeError(`Run ${index + 1} did not return an artifact.`);
  for (const field of ['calculationHash', 'resultHash', 'runRecordHash', 'artifactHash']) {
    if (!/^[a-f0-9]{64}$/u.test(artifact[field] || '')) throw new TypeError(`Run ${index + 1} has an invalid ${field}.`);
  }
  if (!artifact.summary || typeof artifact.summary !== 'object') throw new TypeError(`Run ${index + 1} has no summary.`);
}

function defaultTimer() {
  return globalThis.performance?.now?.() ?? Date.now();
}
