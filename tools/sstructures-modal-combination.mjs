import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { combineModalScalars, normalizeModalCombinationMethod } from '../src/dynamics/modalCombination.js';
import { stableHash } from '../src/core/stableHash.js';

const [inputPath, ...rawArgs] = process.argv.slice(2);
if (!inputPath) usage();
const args = Object.fromEntries(rawArgs.map(argument));
const resolvedInput = resolve(inputPath);
const input = JSON.parse(await readFile(resolvedInput, 'utf8'));
const method = normalizeModalCombinationMethod(args.method || input.method || 'SRSS');
const result = combineModalScalars(input.responses || input.modalResponses || [], {
  method,
  dampingRatio: args.damping == null ? input.dampingRatio : Number(args.damping),
  closeModeRatio: args['close-mode-ratio'] == null ? input.closeModeRatio : Number(args['close-mode-ratio']),
});
const artifact = {
  version: 'p14-m3-modal-combination-cli-v1',
  inputPath: resolvedInput,
  inputHash: stableHash(input),
  result,
};
if (args.output) {
  await writeFile(resolve(args.output), `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: 'utf8',
    flag: args.force === 'true' ? 'w' : 'wx',
  });
}
console.log(JSON.stringify({
  version: artifact.version,
  inputHash: artifact.inputHash,
  method: result.method,
  modeCount: result.modeCount,
  value: result.value,
  trace: result.trace,
  outputPath: args.output ? resolve(args.output) : null,
}, null, 2));

function argument(value) {
  if (!value.startsWith('--') || !value.includes('=')) throw new Error(`Invalid argument: ${value}`);
  const index = value.indexOf('=');
  return [value.slice(2, index), value.slice(index + 1)];
}
function usage() {
  console.error('Usage: node tools/sstructures-modal-combination.mjs <responses.json> [--method=SRSS|CQC|ABS|NRC10] [--damping=0.05] [--close-mode-ratio=0.1] [--output=result.json] [--force=true]');
  process.exit(64);
}
