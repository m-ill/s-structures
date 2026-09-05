import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST_PATH = path.join(ROOT, 'verification', 'archive', 'p16-m2-m5-relocation-map.json');
const REWRITE_MARKER = path.join(ROOT, 'verification', 'archive', 'p16-relocation-rewrite-complete.json');
const mode = process.argv[2] || 'audit';

const PRODUCT_MOVES = Object.freeze({
  'src/verification/benchmarkGate.js': 'src/diagnostics/benchmarkGate.js',
  'src/verification/benchmarkGateCases.js': 'src/diagnostics/benchmarkGateCases.js',
  'src/verification/benchmarkGateChecks.js': 'src/diagnostics/benchmarkGateChecks.js',
  'src/verification/benchmarkGateRunCase.js': 'src/diagnostics/benchmarkGateRunCase.js',
  'src/verification/memberReleaseBenchmark.js': 'src/diagnostics/memberReleaseBenchmark.js',
  'src/verification/memberReleaseBenchmarkCases.js': 'src/diagnostics/memberReleaseBenchmarkCases.js',
  'src/verification/memberReleaseBenchmarkRunCase.js': 'src/diagnostics/memberReleaseBenchmarkRunCase.js',
  'src/verification/rigidDiaphragmBenchmark.js': 'src/diagnostics/rigidDiaphragmBenchmark.js',
  'src/verification/rigidDiaphragmBenchmarkModel.js': 'src/diagnostics/rigidDiaphragmBenchmarkModel.js',
  'src/verification/stabilizationHarness.js': 'src/diagnostics/stabilizationHarness.js',
  'src/verification/phase10ReleaseGate.js': 'src/platform/phase10ReleaseReadiness.js',
  'src/verification/phase13ReleaseGate.js': 'src/platform/phase13ReleaseReadiness.js',
});

const RUNNERS = Object.freeze([
  'generate-strix21-comparison-report.mjs', 'measure-p8-m6-pmm.mjs', 'measure-perf.mjs',
  'measure-scale-limits.mjs', 'refresh-p10-evidence.mjs', 'run-p10-m1-evidence.mjs',
  'run-p11-m0-baseline.mjs', 'run-p11-m1-evidence.mjs', 'run-p11-m2-evidence.mjs',
  'run-p11-m3-evidence.mjs', 'run-p11-m4-evidence.mjs', 'run-p11-m5-evidence.mjs',
  'run-p11-m6-evidence.mjs', 'run-p11-m7-evidence.mjs', 'run-p11-m8-qualification.mjs',
  'run-p11-m9-release.mjs', 'run-p13-m0-baseline.mjs', 'run-p13-m1-evidence.mjs',
  'run-p13-m2-evidence.mjs', 'run-p13-m3-evidence.mjs', 'run-p13-m4-m8-evidence.mjs',
  'run-p13-m9-evidence.mjs', 'run-p14-m0-baseline.mjs', 'run-p14-m1-evidence.mjs',
  'run-p14-m11-evidence.mjs', 'run-p14-m2-evidence.mjs', 'run-p14-m3-evidence.mjs',
  'run-p14-m4-evidence.mjs', 'run-p14-m5-m10-evidence.mjs', 'run-p15-determinism-evidence.mjs',
  'run-p15-full-regression-evidence.mjs', 'run-p15-m0-baseline.mjs', 'run-p15-m1-evidence.mjs',
  'run-p15-m9-release.mjs', 'run-p8-m11-qualification.mjs', 'run-p9-m0-baseline.mjs',
  'run-p9-m1-evidence.mjs', 'run-p9-m10-evidence.mjs', 'run-p9-m2-evidence.mjs',
  'run-p9-m3-evidence.mjs', 'run-p9-m4-evidence.mjs', 'run-p9-m5-evidence.mjs',
  'run-p9-m6-evidence.mjs', 'run-p9-m7-evidence.mjs', 'run-p9-m8-evidence.mjs',
  'run-p9-m9-evidence.mjs', 'run-stabilization-harness.mjs', 'run-strix21-first-batch.mjs',
  'sstructures-phase14-qualify.mjs',
]);

const HARNESSES = Object.freeze([
  'check-agent-contract.mjs', 'check-phase15-architecture.mjs',
  'create-verification-relocation-manifest.mjs', 'generate-test-inventory.mjs',
  'run-milestone-tests.mjs', 'run-phase7-tests.mjs', 'run-phase8-tests.mjs',
  'run-phase9-tests.mjs', 'run-phase10-tests.mjs', 'run-phase12-tests.mjs',
  'run-phase13-tests.mjs', 'run-phase14-tests.mjs', 'run-phase15-tests.mjs',
  'testInventory.mjs',
]);

if (mode === 'audit') await audit();
else if (mode === 'snapshot') await snapshot();
else if (mode === 'rewrite') await rewrite();
else if (mode === 'repair-second-pass') await repairSecondPass();
else if (mode === 'normalize-destinations') await normalizeDestinations();
else throw new Error(`Unsupported mode: ${mode}`);

async function snapshot() {
  if (await exists(MANIFEST_PATH)) throw new Error('Phase 16 relocation manifest already exists; refusing to replace the frozen source snapshot.');
  const mappings = [];
  const sourceFiles = await listFiles(path.join(ROOT, 'src', 'verification'));
  for (const absolute of sourceFiles) {
    const source = relative(absolute);
    const target = PRODUCT_MOVES[source]
      || `verification/framework/${path.posix.relative('src/verification', source)}`;
    mappings.push(await record(source, target, PRODUCT_MOVES[source] ? 'product-responsibility' : 'verification-framework'));
  }
  for (const name of RUNNERS) mappings.push(await record(`tools/${name}`, `verification/runners/${name}`, 'verification-runner'));
  for (const name of HARNESSES) mappings.push(await record(`tools/${name}`, `verification/harnesses/${name}`, 'verification-harness'));
  mappings.sort((left, right) => left.source.localeCompare(right.source));
  const manifest = {
    version: 'p16-m2-m5-relocation-map-v1',
    createdAt: '2026-08-28',
    policy: 'move-original-create-governed-tool-wrapper-rewrite-relative-imports',
    fileCount: mappings.length,
    byteCount: mappings.reduce((sum, item) => sum + item.bytes, 0),
    mappings,
  };
  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, mode, manifest: relative(MANIFEST_PATH), fileCount: manifest.fileCount, byteCount: manifest.byteCount }, null, 2));
}

async function rewrite() {
  if (await exists(REWRITE_MARKER)) throw new Error('Phase 16 relocation rewrite is already complete; refusing a non-idempotent replay.');
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const mapping = new Map(manifest.mappings.map((item) => [absolute(item.source), absolute(item.target)]));
  const destinations = new Set([...mapping.values()]);
  let rewrittenFiles = 0;
  let rewrittenSpecifiers = 0;
  for (const item of manifest.mappings) {
    const destination = absolute(item.target);
    const result = await rewriteModule(destination, path.dirname(absolute(item.source)), mapping);
    rewrittenFiles += Number(result.changed);
    rewrittenSpecifiers += result.count;
  }
  const activeRoots = ['src', 'tests', 'tools', 'server', 'desktop', 'verification'];
  for (const root of activeRoots) {
    const files = await listFiles(absolute(root));
    for (const file of files) {
      if (destinations.has(file) || !/\.(?:m?js)$/iu.test(file)) continue;
      if (normalize(file).includes('/verification/archive/')) continue;
      const result = await rewriteModule(file, path.dirname(file), mapping);
      rewrittenFiles += Number(result.changed);
      rewrittenSpecifiers += result.count;
    }
  }
  let wrappers = 0;
  for (const item of manifest.mappings.filter((row) => row.source.startsWith('tools/'))) {
    const source = absolute(item.source);
    const target = absolute(item.target);
    const specifier = moduleSpecifier(path.dirname(source), target);
    const launcher = moduleSpecifier(path.dirname(source), absolute('verification/harnesses/compatibility-launcher.mjs'));
    const body = `/**\n * Phase 16 compatibility launcher.\n * Canonical owner: ${item.target}\n * Removal gate: package-command-major-version-migration\n */\nimport { runCompatibilityCli } from '${launcher}';\nawait runCompatibilityCli(new URL('${specifier}', import.meta.url));\n`;
    await writeFile(source, body, 'utf8');
    wrappers += 1;
  }
  await writeFile(REWRITE_MARKER, `${JSON.stringify({ version: 'p16-relocation-rewrite-marker-v1', completedAt: '2026-08-28', manifest: relative(MANIFEST_PATH) }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, mode, rewrittenFiles, rewrittenSpecifiers, wrappers }, null, 2));
}

async function repairSecondPass() {
  if (await exists(REWRITE_MARKER)) throw new Error('Phase 16 relocation is complete; refusing to replay the non-idempotent repair.');
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  let repairedFiles = 0;
  let repairedSpecifiers = 0;
  for (const item of manifest.mappings) {
    const file = absolute(item.target);
    const source = await readFile(file, 'utf8');
    const oldDirectory = path.dirname(absolute(item.source));
    const currentDirectory = path.dirname(file);
    let count = 0;
    const repair = (match, prefix, quote, specifier) => {
      if (!specifier.startsWith('.')) return match;
      const secondPassTarget = path.resolve(currentDirectory, specifier);
      const priorSpecifier = moduleSpecifier(oldDirectory, secondPassTarget);
      if (priorSpecifier === specifier) return match;
      count += 1;
      return `${prefix}${quote}${priorSpecifier}${quote}`;
    };
    let updated = source.replace(/(\b(?:import|export)\s+(?:[^'";]*?\sfrom\s*)?)(['"])([^'"]+)\2/gu, repair);
    updated = updated.replace(/(\bimport\s*\(\s*)(['"])([^'"]+)\2/gu, repair);
    if (updated !== source) {
      await writeFile(file, updated, 'utf8');
      repairedFiles += 1;
      repairedSpecifiers += count;
    }
  }
  await writeFile(REWRITE_MARKER, `${JSON.stringify({ version: 'p16-relocation-rewrite-marker-v1', completedAt: '2026-08-28', repairedSecondPass: true, manifest: relative(MANIFEST_PATH) }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, mode, repairedFiles, repairedSpecifiers }, null, 2));
}

async function normalizeDestinations() {
  if (await exists(REWRITE_MARKER)) throw new Error('Phase 16 relocation is complete; refusing to replay destination normalization.');
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const mapping = new Map(manifest.mappings.map((item) => [absolute(item.source), absolute(item.target)]));
  let rewrittenFiles = 0;
  let rewrittenSpecifiers = 0;
  for (const item of manifest.mappings) {
    const result = await rewriteModule(absolute(item.target), path.dirname(absolute(item.source)), mapping);
    rewrittenFiles += Number(result.changed);
    rewrittenSpecifiers += result.count;
  }
  await writeFile(REWRITE_MARKER, `${JSON.stringify({ version: 'p16-relocation-rewrite-marker-v1', completedAt: '2026-08-28', normalizedFromOriginalBases: true, manifest: relative(MANIFEST_PATH) }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, mode, rewrittenFiles, rewrittenSpecifiers }, null, 2));
}

async function audit() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const missingTargets = [];
  for (const item of manifest.mappings || []) {
    if (!await exists(absolute(item.target))) missingTargets.push(item.target);
  }
  const result = {
    ok: missingTargets.length === 0 && await exists(REWRITE_MARKER),
    mode,
    manifest: relative(MANIFEST_PATH),
    fileCount: manifest.fileCount,
    rewriteMarkerPresent: await exists(REWRITE_MARKER),
    missingTargets,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

async function rewriteModule(file, originalDirectory, mapping) {
  if (!await exists(file)) throw new Error(`Relocated module missing: ${relative(file)}`);
  const source = await readFile(file, 'utf8');
  let count = 0;
  const replace = (match, prefix, quote, specifier) => {
    if (!specifier.startsWith('.')) return match;
    const oldTarget = path.resolve(originalDirectory, specifier);
    const target = mapping.get(oldTarget) || oldTarget;
    const next = moduleSpecifier(path.dirname(file), target);
    if (next === specifier) return match;
    count += 1;
    return `${prefix}${quote}${next}${quote}`;
  };
  let updated = source.replace(/(\b(?:import|export)\s+(?:[^'";]*?\sfrom\s*)?)(['"])([^'"]+)\2/gu, replace);
  updated = updated.replace(/(\bimport\s*\(\s*)(['"])([^'"]+)\2/gu, replace);
  if (updated !== source) await writeFile(file, updated, 'utf8');
  return { changed: updated !== source, count };
}

async function record(source, target, classification) {
  const file = absolute(source);
  const body = await readFile(file);
  return { source, target, classification, bytes: body.byteLength, sha256: sha256(body) };
}

async function listFiles(root) {
  if (!await exists(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

async function exists(value) {
  try { await access(value); return true; } catch { return false; }
}

function absolute(value) { return path.resolve(ROOT, value); }
function relative(value) { return normalize(path.relative(ROOT, value)); }
function normalize(value) { return value.replaceAll('\\', '/'); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function moduleSpecifier(from, to) {
  let value = normalize(path.relative(from, to));
  if (!value.startsWith('.')) value = `./${value}`;
  return value;
}
