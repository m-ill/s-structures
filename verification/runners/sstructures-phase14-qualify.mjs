import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildPlateWorkflowReport,
  buildPushoverQualificationReport,
  buildShellStabilizationReport,
  compareNeutralControlStrategies,
  createNeutralMomentHingeFixture,
  qualifyShellStabilization,
  runDrillingAlphaSweep,
  runThickPlateSweep,
  runUnsupportedRotationFloorSweep,
} from '../../src/index.js';

const [inputPath, ...rawArgs] = process.argv.slice(2);
if (!inputPath) usage();
const args = Object.fromEntries(rawArgs.map(argument));
const input = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
let artifact;
if (input.kind === 'thickPlate') {
  const sweep = runThickPlateSweep(input);
  const last = sweep.rows.at(-1);
  artifact = { version: 'p14-m11-qualification-cli-v1', kind: input.kind, sweep, report: buildPlateWorkflowReport({ mesh: last.mesh, run: last.run, qualification: last.qualification }) };
} else if (input.kind === 'shellStabilization') {
  const drillingSweep = runDrillingAlphaSweep(input.drilling);
  const floorSweep = runUnsupportedRotationFloorSweep(input.floor);
  const qualification = qualifyShellStabilization({ drillingSweep, floorSweep, modes: input.modes || [] }, input.options);
  artifact = { version: 'p14-m11-qualification-cli-v1', kind: input.kind, drillingSweep, floorSweep, qualification, report: buildShellStabilizationReport(qualification) };
} else if (input.kind === 'pushoverFixture') {
  const fixture = createNeutralMomentHingeFixture(input.fixture);
  const comparison = compareNeutralControlStrategies(fixture, input.rotations);
  artifact = { version: 'p14-m11-qualification-cli-v1', kind: input.kind, fixture, comparison, report: buildPushoverQualificationReport({ fixtureComparison: comparison }) };
} else {
  throw Object.assign(new Error(`Unsupported Phase 14 qualification kind: ${input.kind}`), { code: 'P14_QUALIFICATION_KIND_UNSUPPORTED' });
}
if (args.output) await writeFile(resolve(args.output), `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', flag: args.force === 'true' ? 'w' : 'wx' });
console.log(JSON.stringify({ version: artifact.version, kind: artifact.kind, status: artifact.qualification?.status || 'complete', outputPath: args.output ? resolve(args.output) : null }, null, 2));

function argument(value) { if (!value.startsWith('--') || !value.includes('=')) throw new Error(`Invalid argument: ${value}`); const index = value.indexOf('='); return [value.slice(2, index), value.slice(index + 1)]; }
function usage() { console.error('Usage: node tools/sstructures-phase14-qualify.mjs <input.json> [--output=result.json] [--force=true]'); process.exit(64); }
