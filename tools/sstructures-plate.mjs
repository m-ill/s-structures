import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildPlateWorkflowReport,
  comparePlateMeshLevels,
  createRectangularPlateMesh,
  solveRectangularPlate,
} from '../src/index.js';

const [inputPath, ...rawArgs] = process.argv.slice(2);
if (!inputPath) usage();
const args = Object.fromEntries(rawArgs.map(argument));
const input = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
const mesh = createRectangularPlateMesh(input.mesh);
const run = solveRectangularPlate(mesh, input.properties, input.load, input.options);
const comparison = input.comparison ? comparePlateMeshLevels(input.comparison.levels, input.comparison) : null;
const report = buildPlateWorkflowReport({ mesh, run, comparison });
const artifact = { version: 'p14-m7-plate-cli-v1', mesh, run, comparison, report };
if (args.output) await writeFile(resolve(args.output), `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', flag: args.force === 'true' ? 'w' : 'wx' });
console.log(JSON.stringify({
  version: artifact.version,
  meshHash: mesh.meshHash,
  runHash: run.runHash,
  centerW: run.center.w,
  coefficient: run.dimensionlessCoefficient,
  energyPassed: run.energy.passed,
  outputPath: args.output ? resolve(args.output) : null,
}, null, 2));

function argument(value) {
  if (!value.startsWith('--') || !value.includes('=')) throw new Error(`Invalid argument: ${value}`);
  const index = value.indexOf('=');
  return [value.slice(2, index), value.slice(index + 1)];
}
function usage() {
  console.error('Usage: node tools/sstructures-plate.mjs <workflow.json> [--output=result.json] [--force=true]');
  process.exit(64);
}
