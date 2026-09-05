import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCpuSparseBackend } from '../../src/compute/backends/cpuSparseBackend.js';
import { createWasmSparseBackend } from '../../src/compute/backends/wasmCpuBackend.js';
import { createCscFromTriplets } from '../../src/compute/sparse/matrix.js';
import {
  buildPhase9M2Evidence,
  upgradePhase9ManifestToM2,
  validatePhase9M2Evidence,
  validatePhase9M2Manifest,
} from '../../src/compute/governance/phase9M2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVIDENCE_PATH = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase9', 'p9-m2-cpu-wasm.json');
const MANIFEST_PATH = path.join(ROOT, 'verification', 'specs', 'phase9', 'release-manifest.json');
const PRIOR_PATH = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase9', 'p9-m1-common-compute.json');
const generatedAt = new Date().toISOString();
const sourceRevision = detectSourceRevision();
const previousManifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
const prior = JSON.parse(await fs.readFile(PRIOR_PATH, 'utf8'));
const matrix = createCscFromTriplets(3, 3, [
  [0, 0, 4], [0, 1, 1], [1, 0, 1], [1, 1, 3], [1, 2, 1], [2, 1, 1], [2, 2, 2],
]);
const rhs = [[1, 2, 3], [3, 2, 1]];
const cpu = createCpuSparseBackend();
const cpuResult = cpu.solveMultiple(matrix, rhs, { matrixClass: 'spd' });
if (!cpuResult.ok) throw new Error('CPU evidence solve failed: ' + cpuResult.reason);
const cpuMemory = cpu.dispose();
const wasm = await createWasmSparseBackend();
const wasmResult = wasm.solveMultiple(matrix, rhs, { matrixClass: 'spd', relativeTolerance: 1e-12 });
if (!wasmResult.ok) throw new Error('WASM evidence solve failed: ' + wasmResult.reason);
const wasmMemory = wasm.snapshot();
const blockers = [...new Set(previousManifest.blockers || [])].filter((value) => value !== 'P9_M2_CPU_WASM_RUNTIME_REQUIRED');
const evidence = buildPhase9M2Evidence({
  generatedAt,
  sourceRevision,
  priorEvidenceHash: prior.artifactHash,
  snapshot: {
    rowCount: matrix.rowCount,
    nnz: matrix.nnz,
    rhsCount: rhs.length,
    cpuResidualMax: Math.max(...cpuResult.results.map((row) => row.diagnostics.relativeResidual)),
    wasmResidualMax: Math.max(...wasmResult.results.map((row) => row.diagnostics.relativeResidual)),
    wasmAbiVersion: wasm.p9Preflight().wasmAbiVersion,
  },
  memory: { cpu: cpuMemory, wasm: wasmMemory },
  results: {
    cpu: cpuResult.x.map((values) => Array.from(values)),
    wasm: wasmResult.x.map((values) => Array.from(values)),
  },
  blockers,
});
assertValid(validatePhase9M2Evidence(evidence), 'M2 evidence');
const manifest = upgradePhase9ManifestToM2(previousManifest, evidence, { generatedAt, sourceRevision, blockers });
assertValid(validatePhase9M2Manifest(manifest), 'M2 release manifest');
await fs.writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, evidence: path.relative(ROOT, EVIDENCE_PATH), artifactHash: evidence.artifactHash, manifestHash: manifest.manifestHash }, null, 2));

function detectSourceRevision() {
  try {
    const safeRoot = ROOT.split(path.sep).join('/');
    return execFileSync('git', ['-c', `safe.directory=${safeRoot}`, 'rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim() + '+worktree';
  } catch {
    return 'unknown+worktree';
  }
}

function assertValid(validation, label) {
  if (!validation.ok) throw new Error(label + ' invalid: ' + validation.errors.join(', '));
}
