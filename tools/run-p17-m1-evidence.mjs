// Phase 16 compatibility launcher. Canonical implementation: verification/runners/run-p17-m1-evidence.mjs
await import('../verification/runners/run-p17-m1-evidence.mjs').then(({ runP17M1Evidence }) => {
  const evidence = runP17M1Evidence({ write: process.argv.includes('--write') });
  process.stdout.write(`${JSON.stringify({
    status: evidence.status,
    evidencePath: evidence.evidencePath,
    evidenceHash: evidence.evidenceHash,
    benchmarkExecutionCount: evidence.resultCounters.benchmarkExecutionCount,
    solverExecutionCount: evidence.resultCounters.solverExecutionCount,
    releaseAllowed: evidence.releaseAllowed,
  }, null, 2)}\n`);
});
