import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOL_VERSION = 'p16-m7-dual-root-architecture-audit-v1';
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function analyzePhase15Architecture(options = {}) {
  const root = path.resolve(options.root || DEFAULT_ROOT);
  const srcRoot = path.join(root, 'src');
  const verificationRoot = path.join(root, 'verification', 'framework');
  const productionFiles = await listFiles(srcRoot, new Set(['.js', '.mjs']));
  const verificationFiles = await listFiles(verificationRoot, new Set(['.js', '.mjs']));
  const verificationIndex = path.join(root, 'verification', 'index.js');
  if (await fileExists(verificationIndex)) verificationFiles.push(normalize(verificationIndex));
  const files = [...productionFiles, ...verificationFiles].sort();
  const knownFiles = new Set(files.map(normalize));
  const sources = new Map(await Promise.all(files.map(async (file) => [normalize(file), await readFile(file, 'utf8')])));
  const imports = [];

  for (const file of files) {
    const normalizedFile = normalize(file);
    const source = sources.get(normalizedFile) || '';
    for (const dependency of extractDependencies(source)) {
      const target = resolveDependency(file, dependency.specifier, knownFiles);
      imports.push({
        source: relative(root, file),
        target: target ? relative(root, target) : null,
        specifier: dependency.specifier,
        line: lineAt(source, dependency.offset),
        kind: dependency.kind,
        relative: dependency.specifier.startsWith('.'),
      });
    }
  }

  const graph = buildGraph(files, imports, root);
  const cycles = findStronglyConnectedCycles(graph).map((cycle) => cycle.map((file) => relative(root, file)));
  const forbiddenImports = imports.flatMap((dependency) => classifyForbiddenImport(dependency));
  const ownership = auditCanonicalOwners(sources, root);
  const compatibility = auditCompatibilityWrappers(imports, sources, root);
  const publicApi = auditPublicApi(imports, sources, root);
  const unresolvedRelativeImports = imports.filter((dependency) => dependency.relative && !dependency.target);

  const gate = {
    importCycles: cycles.length === 0,
    internalRootBarrelImports: countRule(forbiddenImports, 'internal-root-barrel') === 0,
    uiNumericCoreImports: countRule(forbiddenImports, 'ui-numeric-core') === 0,
    productionVerificationImports: countRule(forbiddenImports, 'production-verification') === 0,
    solverUpwardImports: countRule(forbiddenImports, 'solver-upward') === 0,
    reportSolverImports: countRule(forbiddenImports, 'report-solver-reexecution-risk') === 0,
    sparseAssemblerOwner: ownership.sparseAssembler.ownerCount === 1
      && ownership.sparseAssembler.canonicalPresent
      && ownership.sparseAssembler.duplicateOwners.length === 0,
    plateBoundaryOwner: ownership.plateBoundary.ownerCount === 1 && ownership.plateBoundary.canonicalPresent,
    foundationRecoveryOwner: ownership.foundationRecovery.ownerCount === 1
      && ownership.foundationRecovery.canonicalPresent
      && ownership.foundationRecovery.duplicateOwners.length === 0,
    stabilizationClassifierOwner: ownership.stabilizationClassifier.ownerCount === 1
      && ownership.stabilizationClassifier.canonicalPresent
      && ownership.stabilizationClassifier.duplicateOwners.length === 0,
    compatibilityGoverned: compatibility.undocumentedWrappers.length === 0 && compatibility.overduePolicies.length === 0,
    relativeImportsResolved: unresolvedRelativeImports.length === 0,
    legacyVerificationSourceRemoved: !files.some((file) => relative(root, file).startsWith('src/verification/')),
    verificationFrameworkPresent: verificationFiles.length > 0,
    verificationPublicApiPresent: sources.has(normalize(verificationIndex)),
  };

  const sourceDigest = sha256([...sources.entries()]
    .map(([file, source]) => `${relative(root, file)}\0${source}`)
    .join('\0'));
  const report = {
    version: TOOL_VERSION,
    root: normalize(root),
    sourceDigest,
    sourceFileCount: files.length,
    productionFileCount: productionFiles.length,
    verificationFileCount: verificationFiles.length,
    importEdgeCount: imports.filter((dependency) => isAuditedModule(dependency.target)).length,
    gate,
    ok: Object.values(gate).every(Boolean),
    cycles,
    forbiddenImports,
    ownership,
    compatibility,
    publicApi,
    unresolvedRelativeImports,
  };
  return { ...report, auditHash: sha256(canonicalJson({ ...report, root: null })) };
}

function classifyForbiddenImport(dependency) {
  const rows = [];
  const source = dependency.source;
  const target = dependency.target || dependency.specifier.replaceAll('\\', '/');
  const finding = (rule, severity, detail) => ({
    rule,
    severity,
    source,
    line: dependency.line,
    target,
    specifier: dependency.specifier,
    detail,
  });

  if (source.startsWith('src/') && source !== 'src/index.js' && target === 'src/index.js') {
    rows.push(finding('internal-root-barrel', 'High', 'Internal source modules must import the canonical owner, not the root public barrel.'));
  }

  if (isUi(source) && isNumericCore(target)) {
    rows.push(finding('ui-numeric-core', 'High', 'UI/app code must consume an approved product service or immutable result contract.'));
  }

  if (source.startsWith('src/') && (
    target.startsWith('verification/framework/')
      || target.startsWith('verification/runners/')
      || target.startsWith('verification/harnesses/')
      || target.startsWith('src/verification/')
      || /(?:^|\/)tests\/references(?:\/|$)/.test(target)
      || /(?:^|\/)tests\/references(?:\/|$)/.test(dependency.specifier.replaceAll('\\', '/'))
  )) {
    rows.push(finding('production-verification', 'High', 'Production code must not depend on verification runners, benchmark gates, or test references.'));
  }

  if (source.startsWith('src/solver/') && /^(?:src\/(?:verification|report|ui|app)\/|verification\/)/.test(target)) {
    rows.push(finding('solver-upward', 'Critical', 'Solver code must not depend on verification, report, UI, or app layers.'));
  }

  if (source.startsWith('src/report/') && isSolverExecutionTarget(target)) {
    rows.push(finding('report-solver-reexecution-risk', 'High', 'Report modules must consume immutable results/evidence and must not import solver execution owners.'));
  }

  return rows;
}

function isUi(source) {
  return source.startsWith('src/ui/') || source.startsWith('src/app/');
}

function isNumericCore(target) {
  return /^(?:src\/(?:solver|dynamics)\/|src\/compute\/(?:sparse|elastic|eigen|backends|hybrid)\/|src\/nonlinear\/(?:control|dynamics|elements|equilibrium|fiber|math)\/)/.test(target);
}

function isSolverExecutionTarget(target) {
  return /^(?:src\/(?:solver|dynamics)\/|src\/compute\/(?:adapters|backends|elastic|eigen|hybrid|nonlinear|runtime)\/|src\/nonlinear\/(?:analysisRouter|assembly|control|dynamics|elements|equilibrium|fiber|product|pushover|runtime))/i.test(target);
}

function auditCanonicalOwners(sources, root) {
  const candidates = {
    sparseAssembler: findDefinitions(sources, root, [
      /(?:export\s+)?function\s+createDeterministicSparseAssembler\s*\(/g,
      /(?:export\s+)?function\s+createSparseAccumulator\s*\(/g,
    ]),
    plateBoundary: findDefinitions(sources, root, [
      /(?:export\s+)?function\s+(?:resolvePlateBoundary|buildPlateBoundaryTemplate)\s*\(/g,
    ]),
    foundationRecovery: findDefinitions(sources, root, [
      /(?:export\s+)?function\s+(?:buildFoundationEndActionContract|recoverFoundationMember)\s*\(/g,
    ]),
    stabilizationClassifier: findDefinitions(sources, root, [
      /(?:export\s+)?function\s+(?:stabilizeUnsupportedRotations|stabilizeUnsupportedRotationsSparse|classifyUnsupportedRotations)\s*\(/g,
    ]),
  };

  const canonical = {
    sparseAssembler: 'src/compute/sparse/assembly.js',
    plateBoundary: 'src/solver/shell/plateBoundary.js',
    foundationRecovery: 'src/solver/foundation/foundationRecovery.js',
    stabilizationClassifier: 'src/solver/shell/unsupportedRotationFloor.js',
  };

  return Object.fromEntries(Object.entries(candidates).map(([key, rows]) => {
    const ownerFiles = [...new Set(rows.map((row) => row.file))];
    return [key, {
      canonical: canonical[key],
      ownerCount: ownerFiles.length,
      ownerFiles,
      definitions: rows,
      canonicalPresent: ownerFiles.includes(canonical[key]),
      duplicateOwners: ownerFiles.filter((file) => file !== canonical[key]),
      embeddedLegacyOwner: key === 'plateBoundary' && ownerFiles.includes('src/solver/shell/plateWorkflow.js'),
    }];
  }));
}

function findDefinitions(sources, root, patterns) {
  const rows = [];
  for (const [file, source] of sources) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const name = match[0].match(/function\s+([A-Za-z0-9_$]+)/)?.[1] || 'unknown';
        rows.push({ file: relative(root, file), line: lineAt(source, match.index), symbol: name });
      }
    }
  }
  return rows.sort(compareLocation);
}

function auditCompatibilityWrappers(imports, sources, root) {
  const wrappers = [];
  const overduePolicies = [];
  for (const [file, source] of sources) {
    const rel = relative(root, file);
    if (!/(?:compatib|legacy|deprecated)/i.test(rel) && !/(?:Compatibility facade|compatibility wrapper|legacy wrapper)/i.test(source)) continue;
    const consumers = imports
      .filter((dependency) => dependency.target === rel)
      .map(({ source: consumer, line, specifier }) => ({ source: consumer, line, specifier }))
      .sort(compareLocation);
    wrappers.push({
      file: rel,
      hasPolicy: /(?:POLICY|policy|removalGate|deprecat|Compatibility facade)/.test(source),
      consumerCount: consumers.length,
      consumers,
    });
    for (const match of source.matchAll(/\b(reviewBy|expires|deleteBy)\s*:\s*['"](Phase\d+|P\d+-M\d+)['"]/g)) {
      const phase = Number(/\d+/.exec(match[2])?.[0]);
      if (Number.isInteger(phase) && phase < 16) {
        overduePolicies.push({
          file: rel,
          line: lineAt(source, match.index),
          field: match[1],
          value: match[2],
          currentPhase: 'Phase16',
        });
      }
    }
  }
  return {
    wrapperCount: wrappers.length,
    undocumentedWrappers: wrappers.filter((wrapper) => !wrapper.hasPolicy),
    overduePolicies: overduePolicies.sort(compareLocation),
    wrappers: wrappers.sort((left, right) => left.file.localeCompare(right.file)),
  };
}

function auditPublicApi(imports, sources, root) {
  const rootIndex = sources.get(normalize(path.join(root, 'src', 'index.js'))) || '';
  const computeIndex = sources.get(normalize(path.join(root, 'src', 'compute', 'index.js'))) || '';
  const verificationIndex = awaitSource(sources, path.join(root, 'verification', 'index.js'));
  const rootReexportTargets = extractDependencies(rootIndex)
    .filter((dependency) => dependency.kind === 'export')
    .map((dependency) => dependency.specifier);
  const computeReexportTargets = extractDependencies(computeIndex)
    .filter((dependency) => dependency.kind === 'export')
    .map((dependency) => dependency.specifier);
  const verificationReexportTargets = extractDependencies(verificationIndex)
    .filter((dependency) => dependency.kind === 'export')
    .map((dependency) => dependency.specifier);
  return {
    rootBarrel: 'src/index.js',
    rootReexportModuleCount: new Set(rootReexportTargets).size,
    computeBarrel: 'src/compute/index.js',
    computeReexportModuleCount: new Set(computeReexportTargets).size,
    verificationBarrel: 'verification/index.js',
    verificationReexportModuleCount: new Set(verificationReexportTargets).size,
    productionVerificationReexports: rootReexportTargets.filter((target) => target.includes('verification/')),
    internalRootConsumers: imports.filter((dependency) => dependency.source !== 'src/index.js' && dependency.target === 'src/index.js'),
  };
}

function buildGraph(files, imports, root) {
  const graph = new Map(files.map((file) => [normalize(file), []]));
  for (const dependency of imports) {
    if (!isAuditedModule(dependency.target)) continue;
    const source = normalize(path.join(root, dependency.source));
    const target = normalize(path.join(root, dependency.target));
    if (graph.has(source) && graph.has(target)) graph.get(source).push(target);
  }
  for (const [file, targets] of graph) graph.set(file, [...new Set(targets)].sort());
  return graph;
}

function findStronglyConnectedCycles(graph) {
  let index = 0;
  const stack = [];
  const indices = new Map();
  const lowLinks = new Map();
  const onStack = new Set();
  const cycles = [];

  function visit(node) {
    indices.set(node, index);
    lowLinks.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const target of graph.get(node) || []) {
      if (!indices.has(target)) {
        visit(target);
        lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(target)));
      } else if (onStack.has(target)) {
        lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(target)));
      }
    }

    if (lowLinks.get(node) !== indices.get(node)) return;
    const component = [];
    let current;
    do {
      current = stack.pop();
      onStack.delete(current);
      component.push(current);
    } while (current !== node);
    if (component.length > 1 || (graph.get(node) || []).includes(node)) cycles.push(component.sort());
  }

  for (const node of [...graph.keys()].sort()) if (!indices.has(node)) visit(node);
  return cycles.sort((left, right) => left[0].localeCompare(right[0]));
}

function extractDependencies(source) {
  const rows = [];
  const staticPattern = /\b(import|export)\s+(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/g;
  const dynamicPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(staticPattern)) rows.push({ kind: match[1], specifier: match[2], offset: match.index });
  for (const match of source.matchAll(dynamicPattern)) rows.push({ kind: 'dynamic-import', specifier: match[1], offset: match.index });
  return rows.sort((left, right) => left.offset - right.offset);
}

function resolveDependency(sourceFile, specifier, knownFiles) {
  if (!specifier.startsWith('.')) return null;
  const raw = normalize(path.resolve(path.dirname(sourceFile), specifier));
  const candidates = [raw, `${raw}.js`, `${raw}.mjs`, `${raw}/index.js`, `${raw}/index.mjs`];
  return candidates.find((candidate) => knownFiles.has(candidate)) || null;
}

async function listFiles(directory, extensions) {
  const rows = [];
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await listFiles(target, extensions));
    else if (entry.isFile() && extensions.has(path.extname(entry.name))) rows.push(normalize(target));
  }
  return rows.sort();
}

async function fileExists(file) {
  try { await readFile(file); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
}

function awaitSource(sources, file) {
  return sources.get(normalize(file)) || '';
}

function isAuditedModule(value) {
  return typeof value === 'string'
    && (value.startsWith('src/') || value.startsWith('verification/framework/'));
}

function lineAt(source, offset) {
  return source.slice(0, offset).split(/\r?\n/).length;
}

function countRule(rows, rule) {
  return rows.filter((row) => row.rule === rule).length;
}

function relative(root, file) {
  return normalize(path.relative(root, file));
}

function normalize(file) {
  return file.replaceAll('\\', '/');
}

function compareLocation(left, right) {
  return left.file?.localeCompare(right.file) || left.source?.localeCompare(right.source) || (left.line || 0) - (right.line || 0);
}

async function main() {
  const report = await analyzePhase15Architecture();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const outputArgument = process.argv.find((argument) => argument.startsWith('--output='));
  if (outputArgument) {
    const output = path.resolve(DEFAULT_ROOT, outputArgument.slice('--output='.length));
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, serialized, 'utf8');
  }
  process.stdout.write(serialized);
  if (process.argv.includes('--fail-on-findings') && !report.ok) process.exitCode = 1;
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await main();
