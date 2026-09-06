import { mkdir, writeFile } from 'node:fs/promises';
import { runStrix21FirstBatch } from '../framework/benchmarks/strix21FirstBatch.js';
import { runPhase15DeterminismQualification } from '../framework/phase15/determinismEvidence.js';
import { VERIFICATION_REPOSITORY_PATHS } from '../workspace-paths.mjs';

const evidenceDirectory = `${VERIFICATION_REPOSITORY_PATHS.validationEvidence}/phase15`;
const output = `${evidenceDirectory}/p15-m9-determinism-evidence.json`;
const evidence = runPhase15DeterminismQualification({ runBenchmark: runStrix21FirstBatch });
await mkdir(evidenceDirectory, { recursive: true });
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  ok: evidence.status === 'PASS',
  output,
  status: evidence.status,
  evidenceHash: evidence.evidenceHash,
  calculationHash: evidence.calculationHash,
  resultHash: evidence.resultHash,
  durationsMs: evidence.runs.map((run) => run.durationMs),
}, null, 2));

if (evidence.status !== 'PASS') process.exitCode = 1;
