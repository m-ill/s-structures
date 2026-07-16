import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PHASE9_COMPATIBILITY_REGISTRY,
  PHASE9_COMPATIBILITY_REGISTRY_VERSION,
  auditPhase9Compatibility,
} from '../src/compute/governance/compatibilityRegistry.js';
import { PHASE9_CODE_OWNERS, PHASE9_DEBT_ROWS, phase9ArtifactHash, phase9ManifestHash } from '../src/compute/governance/phase9Baseline.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const sourceFiles = await listFiles(SRC, '.js');
const sourceText = new Map(await Promise.all(sourceFiles.map(async (file) => [normalize(file), await readFile(file, 'utf8')])));
const compatibilityCallers = [];
for (const [file, text] of sourceText) {
  if (file.endsWith('/compute/product/legacyUiCompatibility.js')
    || file.endsWith('/compute/compatibility/syncFacade.js')
    || file.endsWith('/compute/governance/compatibilityRegistry.js')
    || file.endsWith('/compute/index.js')) continue;
  for (const symbol of ['analyzeLegacyUiSnapshot', 'runLegacyUiPushover', 'analyzeModelSyncCompatibility']) {
    if (new RegExp(`\\b${symbol}\\b`).test(text)) compatibilityCallers.push({ symbol, caller: relative(file) });
  }
}
const rootIndex = sourceText.get(normalize(path.join(SRC, 'index.js'))) || '';
const publicSymbols = extractLegacyNonlinearRootExports(rootIndex);
const compatibility = auditPhase9Compatibility({ callers: compatibilityCallers, publicSymbols });

const computeFiles = sourceFiles.filter((file) => normalize(file).includes('/src/compute/'));
const computeGraph = buildGraph(computeFiles, sourceText);
const cycles = findCycles(computeGraph);
const dependencyViolations = findDependencyViolations(sourceText);

const ownerIds = new Set(PHASE9_CODE_OWNERS.map((row) => row.id));
const ownerlessDebt = PHASE9_DEBT_ROWS.filter((row) => !row.owner || !ownerIds.has(row.owner) || !row.targetMilestone).map((row) => row.id);
const manifest = JSON.parse(await readFile(path.join(ROOT, 'docs/verification/phase9/release-manifest.json'), 'utf8'));
const evidenceFiles = [
  ['baseline', 'p9-m0-baseline.json'],
  ['debtRegistry', 'p9-m0-debt-inventory.json'],
  ['m1CommonCompute', 'p9-m1-common-compute.json'],
  ['m2CpuWasm', 'p9-m2-cpu-wasm.json'],
  ['m3ElasticRuntime', 'p9-m3-elastic-runtime.json'],
  ['m4WebGpuFoundation', 'p9-m4-webgpu-foundation.json'],
  ['m5HybridElastic', 'p9-m5-hybrid-elastic.json'],
  ['m6SparseEigen', 'p9-m6-sparse-eigen.json'],
  ['m7NonlinearBatch', 'p9-m7-nonlinear-batch.json'],
  ['m8HybridNonlinear', 'p9-m8-hybrid-nonlinear.json'],
  ['m9ProductWorkflow', 'p9-m9-product-workflow.json'],
];
const staleArtifacts = [];
for (const [key, file] of evidenceFiles) {
  const artifact = JSON.parse(await readFile(path.join(ROOT, 'reports/validation-evidence/phase9', file), 'utf8'));
  if (artifact.artifactHash !== phase9ArtifactHash(artifact) || manifest.evidence?.[key] !== artifact.artifactHash) staleArtifacts.push(file);
}
if (manifest.manifestHash !== phase9ManifestHash(manifest)) staleArtifacts.push('release-manifest.json');

const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const unapprovedDependencies = [...Object.keys(packageJson.dependencies || {}), ...Object.keys(packageJson.devDependencies || {})];

assert.equal(compatibility.ok, true, JSON.stringify(compatibility));
assert.equal(cycles.length, 0, JSON.stringify(cycles));
assert.equal(dependencyViolations.length, 0, JSON.stringify(dependencyViolations));
assert.equal(ownerlessDebt.length, 0, JSON.stringify(ownerlessDebt));
assert.equal(staleArtifacts.length, 0, JSON.stringify(staleArtifacts));
assert.equal(unapprovedDependencies.length, 0, JSON.stringify(unapprovedDependencies));

console.log(JSON.stringify({
  ok: true,
  requirements: ['P9-REF-11~14', 'P9-REL-09~10'],
  registryVersion: PHASE9_COMPATIBILITY_REGISTRY_VERSION,
  approvedCompatibilityCallers: compatibility.approvedCallerCount,
  expiredProductionCompatibilityCallers: compatibility.expiredCallers.length,
  unexpectedCompatibilityCallers: compatibility.unexpectedCallers.length,
  unregisteredLegacyExports: compatibility.unregisteredPublicSymbols.length,
  ownerlessDebt: ownerlessDebt.length,
  dependencyCycles: cycles.length,
  dependencyViolations: dependencyViolations.length,
  staleArtifacts: staleArtifacts.length,
  evidenceArtifactsChecked: evidenceFiles.length,
  unapprovedDependencies: unapprovedDependencies.length,
}, null, 2));

async function listFiles(root, extension) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(full, extension));
    else if (entry.isFile() && entry.name.endsWith(extension)) out.push(full);
  }
  return out;
}
function buildGraph(files, texts) {
  const known = new Set(files.map(normalize));
  const graph = new Map([...known].map((file) => [file, []]));
  const pattern = /(?:import|export)\s+(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/g;
  for (const file of known) {
    const text = texts.get(file) || '';
    for (const match of text.matchAll(pattern)) {
      if (!match[1].startsWith('.')) continue;
      let target = normalize(path.resolve(path.dirname(file), match[1]));
      if (!path.extname(target)) target += '.js';
      if (known.has(target)) graph.get(file).push(target);
    }
  }
  return graph;
}
function findCycles(graph) {
  const cycles = [];
  const state = new Map();
  const stack = [];
  const visit = (node) => {
    state.set(node, 1); stack.push(node);
    for (const next of graph.get(node) || []) {
      if (!state.has(next)) visit(next);
      else if (state.get(next) === 1) cycles.push(stack.slice(stack.indexOf(next)).map(relative));
    }
    stack.pop(); state.set(node, 2);
  };
  for (const node of graph.keys()) if (!state.has(node)) visit(node);
  return cycles;
}
function findDependencyViolations(texts) {
  const rows = [];
  for (const [file, text] of texts) {
    const rel = relative(file);
    if (rel.startsWith('src/compute/backends/') && /from\s+['"][^'"]*(?:\/ui\/|\/reports?\/|\/persistence\/|\/catalog\/)/.test(text)) rows.push(`${rel}:backend-upward-import`);
    if (rel.startsWith('src/compute/product/') && /from\s+['"][^'"]*\/ui\//.test(text)) rows.push(`${rel}:product-ui-import`);
    if (rel.startsWith('src/ui/') && !rel.endsWith('agentManifest.js') && /from\s+['"][^'"]*(?:compute\/backends|solver\/linear3d)/.test(text)) rows.push(`${rel}:ui-numeric-import`);
  }
  return rows;
}
function extractLegacyNonlinearRootExports(text) {
  const legacyModules = new Set([
    './nonlinear/pushover.js',
    './nonlinear/dynamics/newmark.js',
    './nonlinear/legacy/preliminaryPushover.js',
    './nonlinear/legacy/sdofNewmarkTrace.js',
    './nonlinear/pushoverFormal.js',
  ]);
  const symbols = [];
  const exportBlock = /export\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g;
  for (const match of text.matchAll(exportBlock)) {
    if (!legacyModules.has(match[2])) continue;
    for (const raw of match[1].split(',')) {
      const symbol = raw.trim().split(/\s+as\s+/)[1] || raw.trim().split(/\s+as\s+/)[0];
      if (/^run[A-Z]/.test(symbol)) symbols.push(symbol);
    }
  }
  return [...new Set(symbols)];
}
function relative(file) { return normalize(path.relative(ROOT, file)); }
function normalize(file) { return file.split(path.sep).join('/'); }
