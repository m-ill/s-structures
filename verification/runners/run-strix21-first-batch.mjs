import { mkdir, writeFile } from 'node:fs/promises';
import { runStrix21FirstBatch } from '../framework/benchmarks/strix21FirstBatch.js';
import { VERIFICATION_REPOSITORY_PATHS } from '../workspace-paths.mjs';

const artifact = runStrix21FirstBatch();
const output = `${VERIFICATION_REPOSITORY_PATHS.strix21Runs}/first-batch-results.json`;
await mkdir(VERIFICATION_REPOSITORY_PATHS.strix21Runs, { recursive: true });
await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  output,
  calculationHash: artifact.calculationHash,
  resultHash: artifact.resultHash,
  runRecordHash: artifact.runRecordHash,
  artifactHash: artifact.artifactHash,
  summary: artifact.summary,
}, null, 2));
