import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildConsistentMembraneEdgeTraction,
  buildMembraneWorkflowReport,
  compareMembraneMeshLevels,
  createStructuredQuadMesh,
  probeMembraneStress,
  recoverMembraneField,
} from '../src/index.js';

const [inputPath, ...rawArgs] = process.argv.slice(2);
if (!inputPath) usage();
const args = Object.fromEntries(rawArgs.map(argument));
const input = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
const mesh = createStructuredQuadMesh(input.mesh);
const field = recoverMembraneField(mesh, input.displacements, input.properties, input.options);
const probes = (input.probes || []).map((probe) => probeMembraneStress(mesh, field, probe));
const loads = (input.edgeTractions || []).map((load) => buildConsistentMembraneEdgeTraction(mesh, load));
const comparison = input.comparison ? compareMembraneMeshLevels(input.comparison.levels, input.comparison) : null;
const report = buildMembraneWorkflowReport({ mesh, field, probes, loads, comparison });
const artifact = { version: 'p14-m5-membrane-cli-v1', mesh, field, probes, loads, comparison, report };
if (args.output) await writeFile(resolve(args.output), `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', flag: args.force === 'true' ? 'w' : 'wx' });
console.log(JSON.stringify({
  version: artifact.version,
  meshHash: mesh.meshHash,
  resultHash: field.resultHash,
  nodeCount: mesh.nodes.length,
  elementCount: mesh.elements.length,
  probeHashes: probes.map((row) => row.probeHash),
  loadHashes: loads.map((row) => row.loadHash),
  outputPath: args.output ? resolve(args.output) : null,
}, null, 2));

function argument(value) {
  if (!value.startsWith('--') || !value.includes('=')) throw new Error(`Invalid argument: ${value}`);
  const index = value.indexOf('=');
  return [value.slice(2, index), value.slice(index + 1)];
}
function usage() {
  console.error('Usage: node tools/sstructures-membrane.mjs <workflow.json> [--output=result.json] [--force=true]');
  process.exit(64);
}
