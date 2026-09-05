// Compatibility entry point. The canonical implementation lives under verification/runners.
await import('../verification/runners/run-p17-m0-source-lock.mjs').then(({ runP17M0 }) => {
  const result = runP17M0({ write: process.argv.includes('--write') });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
});
