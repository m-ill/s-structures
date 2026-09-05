import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { arch, hostname, platform, release } from 'node:os';
import { dirname, resolve } from 'node:path';
import {
  createPhase15EvidenceBatch,
  validatePhase15EvidenceBatch,
} from '../framework/phase15/index.js';

const options = parseOptions(process.argv.slice(2));
if (!options.inputs.length) throw new Error('At least one --input=<evidence.json> is required.');
const startedAt = new Date().toISOString();
const artifacts = options.inputs.map((path) => JSON.parse(readFileSync(path, 'utf8')));
const batch = createPhase15EvidenceBatch({
  batchId: options.batchId,
  artifacts,
  run: {
    startedAt,
    completedAt: new Date().toISOString(),
    environment: { node: process.version, platform: platform(), release: release(), arch: arch() },
    runId: `${options.batchId}@${hostname()}`,
  },
});
const validation = validatePhase15EvidenceBatch(batch);
if (!validation.ok) throw new Error(`Generated evidence batch is malformed: ${validation.errors.join(', ')}`);

if (options.output) {
  const target = resolve(options.output);
  if (existsSync(target)) throw new Error(`Refusing to overwrite immutable evidence batch: ${target}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(batch, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}
console.log(JSON.stringify({
  ok: batch.status === 'PASS',
  batchId: batch.batchId,
  status: batch.status,
  attempted: batch.attempted,
  statusCounts: batch.statusCounts,
  batchCalculationHash: batch.batchCalculationHash,
  batchResultHash: batch.batchResultHash,
  batchRunRecordHash: batch.run.batchRunRecordHash,
  output: options.output || null,
}, null, 2));
if (batch.status !== 'PASS') process.exitCode = 1;

function parseOptions(args) {
  const result = { inputs: [], output: null, batchId: 'p15-m1-evidence-batch' };
  for (const arg of args) {
    if (arg.startsWith('--input=')) result.inputs.push(resolve(arg.slice(8)));
    else if (arg.startsWith('--output=')) result.output = arg.slice(9);
    else if (arg.startsWith('--batch-id=')) result.batchId = arg.slice(11).trim();
    else throw new Error(`Unsupported argument: ${arg}`);
  }
  return result;
}
