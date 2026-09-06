import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { migrateModel, runAnalysisCase } from '../src/index.js';
import { stableHash } from '../src/core/stableHash.js';

const [inputPath, ...rawArgs] = process.argv.slice(2);
if (!inputPath) usage();
const args = Object.fromEntries(rawArgs.map(argument));
const modelPath = resolve(inputPath);
const model = migrateModel(JSON.parse(await readFile(modelPath, 'utf8'))).model;
let analysisCase;
if (args['case-file']) analysisCase = JSON.parse(await readFile(resolve(args['case-file']), 'utf8'));
else analysisCase = (model.analysisCases || []).find((row) => row.id === args.case && row.kind === 'linearTha');
if (!analysisCase) throw Object.assign(new Error('A linearTha case is required through --case=<id> or --case-file=<json>.'), { code: 'LINEAR_THA_CASE_REQUIRED' });
const result = runAnalysisCase(model, analysisCase);
const artifact = {
  version: 'p14-m2-linear-tha-cli-v1',
  modelPath,
  modelHash: stableHash(model),
  caseId: analysisCase.id,
  status: result.status,
  result,
};
if (args.output) await writeFile(resolve(args.output), `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', flag: args.force === 'true' ? 'w' : 'wx' });
console.log(JSON.stringify({
  version: artifact.version,
  modelHash: artifact.modelHash,
  caseId: artifact.caseId,
  status: artifact.status,
  integration: result.payload?.integration || null,
  damping: result.payload?.damping?.type || null,
  sampleCount: result.payload?.record?.sampleCount || 0,
  maxDisplacement: result.payload?.maxDisplacement ?? null,
  runHash: result.payload?.runHash || null,
  outputPath: args.output ? resolve(args.output) : null,
}, null, 2));
process.exit(result.status === 'ok' ? 0 : 2);

function argument(value) {
  if (!value.startsWith('--') || !value.includes('=')) throw new Error(`Invalid argument: ${value}`);
  const index = value.indexOf('=');
  return [value.slice(2, index), value.slice(index + 1)];
}
function usage() {
  console.error('Usage: node tools/sstructures-linear-tha.mjs <model.json> (--case=<id>|--case-file=<case.json>) [--output=result.json] [--force=true]');
  process.exit(64);
}
