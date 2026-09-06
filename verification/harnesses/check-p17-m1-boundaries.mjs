import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const P17_M1_BOUNDARY_AUDIT_VERSION = 'p17-m1-boundary-audit-v2';
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC_PRODUCT_ENTRYPOINT = 'src/index.js';

export async function auditP17M1Boundaries(options = {}) {
  const root = path.resolve(options.root || DEFAULT_ROOT);
  const sourceFiles = await listModules(path.join(root, 'src'));
  const verificationFiles = [
    ...await listModules(path.join(root, 'verification', 'framework')),
    ...await listModules(path.join(root, 'verification', 'runners')),
    ...await listModules(path.join(root, 'verification', 'harnesses')),
    ...await listModules(path.join(root, 'verification', 'benchmarks', 'strix21', 'cases')),
    ...await listModules(path.join(root, 'verification', 'benchmarks', 'strix21', 'custom')),
  ];
  const files = [...new Set([...sourceFiles, ...verificationFiles])].sort();
  const known = new Set(files.map(normalize));
  known.add(normalize(path.join(root, 'src', 'index.js')));
  const sources = new Map(await Promise.all(files.map(async (file) => [normalize(file), await readFile(file, 'utf8')])));
  const imports = [];
  for (const [file, source] of sources) {
    for (const item of extractImports(source)) {
      const target = resolveImport(file, item.specifier, known);
      imports.push({
        source: relative(root, file),
        specifier: item.specifier,
        target: target ? relative(root, target) : null,
        line: lineAt(source, item.offset),
      });
    }
  }

  const activeFiles = imports.filter((item) => isP17Active(item.source));
  const productToVerification = imports.filter((item) => item.source.startsWith('src/') && isVerificationTarget(item));
  const activeProductImports = activeFiles.filter((item) => isProductTarget(item));
  const activeDeepProductImports = activeProductImports.filter((item) => item.target !== PUBLIC_PRODUCT_ENTRYPOINT);
  const activePublicProductImports = activeProductImports.filter((item) => item.target === PUBLIC_PRODUCT_ENTRYPOINT);
  const invalidPublicConsumers = activePublicProductImports.filter((item) => item.source !== 'verification/framework/phase17/productAdapter.mjs');
  const reportSolverImports = activeFiles.filter((item) => isReportModule(item.source) && isSolverExecutionTarget(item.target || item.specifier));
  const activeForbiddenRuntimeImports = activeFiles.filter((item) => isForbiddenRuntimeImport(item) && !isApprovedProcessIsolationImport(item));
  const productBoundaryExternalIo = findProductBoundaryExternalIo(sources, root);
  const p17ProductionReferenceLeakage = findP17ProductionReferenceLeakage(sources, root);
  const legacyProductImports = imports.filter((item) => item.source.startsWith('verification/') && !isP17Active(item.source) && isProductTarget(item));
  const legacyDeepProductImports = legacyProductImports.filter((item) => item.target !== PUBLIC_PRODUCT_ENTRYPOINT);
  const genericProductionExpectedDebt = await findGenericProductionExpectedDebt(root);
  const activeGraph = dependencyGraph(activeFiles, root);
  const cycles = findCycles(activeGraph);

  const gate = {
    productToVerificationImportCount: productToVerification.length === 0,
    phase17VerificationToProductDeepImportCount: activeDeepProductImports.length === 0,
    phase17ProductPublicEntrypointConsumerCount: activePublicProductImports.length === 1 && invalidPublicConsumers.length === 0,
    phase17ExpectedReferenceProductionLeakageCount: p17ProductionReferenceLeakage.length === 0,
    evidenceReportSolverImportCount: reportSolverImports.length === 0,
    phase17ForbiddenRuntimeImportCount: activeForbiddenRuntimeImports.length === 0,
    productBoundaryExternalIoCount: productBoundaryExternalIo.length === 0,
    phase17ImportCycleCount: cycles.length === 0,
  };
  const core = {
    version: P17_M1_BOUNDARY_AUDIT_VERSION,
    auditedScope: {
      production: 'src/**/*.{js,mjs}',
      phase17Active: [
        'verification/framework/phase17/**/*.{js,mjs}',
        'verification/runners/run-p17*.mjs',
        'verification/harnesses/*p17-m1*.mjs',
        'verification/benchmarks/strix21/{cases,custom}/**/*.{js,mjs}',
      ],
      historicalVerificationExcludedFromZeroClaim: true,
    },
    sourceFileCount: sourceFiles.length,
    verificationFileCount: verificationFiles.length,
    activeImportEdgeCount: activeFiles.length,
    gate,
    ok: Object.values(gate).every(Boolean),
    findings: {
      productToVerification,
      activeDeepProductImports,
      activePublicProductImports,
      invalidPublicConsumers,
      reportSolverImports,
      activeForbiddenRuntimeImports,
      productBoundaryExternalIo,
      p17ProductionReferenceLeakage,
      cycles,
    },
    historicalDebt: {
      status: legacyDeepProductImports.length || genericProductionExpectedDebt.length ? 'OPEN_RELEASE_DEBT' : 'NONE',
      legacyVerificationProductImportCount: legacyProductImports.length,
      legacyVerificationDeepProductImportCount: legacyDeepProductImports.length,
      legacyVerificationDeepProductFileCount: new Set(legacyDeepProductImports.map((item) => item.source)).size,
      representativeLegacyDeepImports: legacyDeepProductImports.slice(0, 25),
      genericProductionExpectedValueDebtCount: genericProductionExpectedDebt.length,
      genericProductionExpectedValueDebt: genericProductionExpectedDebt,
      claimBoundary: 'M1 proves zero deep imports and zero reference leakage only for the canonical Phase 17 runtime. Historical verification and generic production examples remain explicit release debt.',
    },
  };
  return { ...core, auditHash: hash(core) };
}

function isP17Active(value) {
  return value.startsWith('verification/framework/phase17/')
    || /^verification\/runners\/run-p17/iu.test(value)
    || /^verification\/harnesses\/.*p17-m1/iu.test(value)
    || /^verification\/benchmarks\/strix21\/(?:cases|custom)\//u.test(value);
}

function isVerificationTarget(item) {
  const value = item.target || item.specifier.replaceAll('\\', '/');
  return value.startsWith('verification/') || value.startsWith('src/verification/');
}

function isProductTarget(item) {
  const value = item.target || '';
  return value.startsWith('src/');
}

function isReportModule(value) {
  return /(?:evidenceReport|reportRenderer|reportContract|reporting)/iu.test(value);
}

function isSolverExecutionTarget(value) {
  return /^(?:src\/|.*\/src\/)(?:solver|compute|dynamics|nonlinear)\//iu.test(String(value || '').replaceAll('\\', '/'));
}

function isForbiddenRuntimeImport(item) {
  return /^(?:node:)?(?:http|https|http2|net|tls|dgram|dns|cluster|worker_threads)$/u.test(item.specifier)
    || /^(?:node:)?child_process$/u.test(item.specifier);
}

function isApprovedProcessIsolationImport(item) {
  if (!/^(?:node:)?child_process$/u.test(item.specifier)) return false;
  return [
    'verification/framework/phase17/isolatedSuiteRunner.mjs',
    'verification/runners/run-p17-m1-evidence.mjs',
    'verification/harnesses/finalize-p17-m1.mjs',
  ].includes(item.source);
}

function findProductBoundaryExternalIo(sources, root) {
  const targets = new Set([
    'src/compute/product/analysisProductService.js',
    'src/ui/analysisRunners.js',
  ]);
  const patterns = [
    { code: 'NETWORK_FETCH_API', expression: /\bfetch\s*\(/gu },
    { code: 'NETWORK_SOCKET_API', expression: /\b(?:WebSocket|XMLHttpRequest|EventSource)\b/gu },
    { code: 'EXTERNAL_PROCESS_API', expression: /\b(?:spawn|spawnSync|exec|execFile|fork|Worker)\s*\(/gu },
    { code: 'ABSOLUTE_NETWORK_URL', expression: /https?:\/\//gu },
  ];
  const findings = [];
  for (const [file, source] of sources) {
    const repositoryPath = relative(root, file);
    if (!targets.has(repositoryPath)) continue;
    for (const { code, expression } of patterns) {
      expression.lastIndex = 0;
      for (const match of source.matchAll(expression)) findings.push({ path: repositoryPath, line: lineAt(source, match.index), code });
    }
  }
  return findings;
}

function findP17ProductionReferenceLeakage(sources, root) {
  const patterns = [
    /verification\/benchmarks\/strix21\/(?:cases|custom|references)/giu,
    /verification\/specs\/phase17\/(?:reference|tolerance|probe|expected)/giu,
    /STRIX21_EXPECTED_VALUES/gu,
  ];
  const findings = [];
  for (const [file, source] of sources) {
    const rel = relative(root, file);
    if (!rel.startsWith('src/')) continue;
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) findings.push({ path: rel, line: lineAt(source, match.index), value: match[0] });
    }
  }
  return findings;
}

async function findGenericProductionExpectedDebt(root) {
  const example = path.join(root, 'src', 'examples', 'verification.js');
  const index = path.join(root, 'src', 'index.js');
  const findings = [];
  try {
    const source = await readFile(example, 'utf8');
    const expectedCount = [...source.matchAll(/\bexpected\s*:/gu)].length;
    if (expectedCount) findings.push({ path: 'src/examples/verification.js', code: 'GENERIC_EXPECTED_VALUES_IN_PRODUCTION', occurrenceCount: expectedCount });
    const barrel = await readFile(index, 'utf8');
    if (/\.\/examples\/verification\.js/gu.test(barrel)) findings.push({ path: 'src/index.js', code: 'GENERIC_VERIFICATION_EXAMPLE_PUBLICLY_EXPORTED', occurrenceCount: 1 });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return findings;
}

function dependencyGraph(imports, root) {
  const nodes = new Set(imports.map((item) => item.source));
  const graph = new Map([...nodes].map((node) => [node, []]));
  for (const item of imports) {
    if (item.target && nodes.has(item.target)) graph.get(item.source).push(item.target);
  }
  for (const [key, values] of graph) graph.set(key, [...new Set(values)].sort());
  return graph;
}

function findCycles(graph) {
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];
  const stack = [];
  const visit = (node) => {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      cycles.push([...stack.slice(start), node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const target of graph.get(node) || []) visit(target);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of [...graph.keys()].sort()) visit(node);
  return cycles;
}

function extractImports(source) {
  const rows = [];
  for (const expression of [
    /\b(?:import|export)\s+(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/gu,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
  ]) {
    for (const match of source.matchAll(expression)) rows.push({ specifier: match[1], offset: match.index });
  }
  return rows.sort((left, right) => left.offset - right.offset);
}

function resolveImport(sourceFile, specifier, known) {
  if (!specifier.startsWith('.')) return null;
  const base = normalize(path.resolve(path.dirname(sourceFile), specifier));
  return [base, `${base}.js`, `${base}.mjs`, `${base}/index.js`, `${base}/index.mjs`].find((item) => known.has(item)) || null;
}

async function listModules(root) {
  const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });
  const rows = [];
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) rows.push(...await listModules(target));
    else if (entry.isFile() && ['.js', '.mjs'].includes(path.extname(entry.name))) rows.push(normalize(target));
  }
  return rows.sort();
}

function lineAt(source, offset) {
  return source.slice(0, offset).split(/\r?\n/u).length;
}

function relative(root, value) {
  return normalize(path.relative(root, value));
}

function normalize(value) {
  return String(value).replaceAll('\\', '/');
}

function hash(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function main() {
  const report = await auditP17M1Boundaries();
  const outputArgument = process.argv.find((value) => value.startsWith('--output='));
  if (outputArgument) {
    const output = path.resolve(DEFAULT_ROOT, outputArgument.slice('--output='.length));
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (process.argv.includes('--fail-on-findings') && !report.ok) process.exitCode = 1;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invoked === import.meta.url) await main();
