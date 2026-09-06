import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { VERIFICATION_PATHS, REPOSITORY_ROOT } from '../workspace-paths.mjs';

const strict = process.argv.includes('--strict');
const manifest = JSON.parse(await readFile(VERIFICATION_PATHS.relocationManifest, 'utf8'));
const codeRelocationManifest = await readOptionalJson(path.join(VERIFICATION_PATHS.archive, 'p16-m2-m5-relocation-map.json'), { mappings: [] });
const exceptionRegister = await readOptionalJson(path.join(VERIFICATION_PATHS.archive, 'post-move-exceptions.json'), { exceptions: [] });
const exceptionByPath = new Map((exceptionRegister.exceptions || []).map((item) => [item.path, item]));
const failures = [];
const acceptedHashExceptions = [];
let checkedFiles = 0;
let checkedBytes = 0;
let exactHashMatches = 0;
let relocatedModuleCount = 0;
let compatibilityWrapperCount = 0;

for (const mapping of manifest.mappings || []) {
  for (const item of mapping.files || []) {
    const target = path.join(REPOSITORY_ROOT, item.target);
    try {
      const body = await readFile(target);
      const actual = sha256(body);
      if (actual === item.sha256) {
        exactHashMatches += 1;
      } else {
        const exception = exceptionByPath.get(item.target);
        if (exception?.frozenSha256 === item.sha256 && exception?.currentSha256 === actual) {
          acceptedHashExceptions.push({ path: item.target, classification: exception.classification, frozenSha256: item.sha256, currentSha256: actual });
        } else {
          failures.push({ code: 'HASH_MISMATCH', path: item.target, expected: item.sha256, actual });
        }
      }
      checkedFiles += 1;
      checkedBytes += body.byteLength;
    } catch (error) {
      failures.push({ code: 'TARGET_MISSING', path: item.target, detail: error?.code || String(error) });
    }
  }
  if (await exists(path.join(REPOSITORY_ROOT, mapping.source))) {
    failures.push({ code: 'LEGACY_SOURCE_STILL_EXISTS', path: mapping.source });
  }
}

for (const required of [
  VERIFICATION_PATHS.specs,
  VERIFICATION_PATHS.framework,
  VERIFICATION_PATHS.tests,
  VERIFICATION_PATHS.taxonomy,
  VERIFICATION_PATHS.validationEvidence,
  VERIFICATION_PATHS.phase16Evidence,
  VERIFICATION_PATHS.phase17Specs,
  VERIFICATION_PATHS.phase17Framework,
  VERIFICATION_PATHS.phase17Evidence,
  VERIFICATION_PATHS.strix21SuiteManifest,
  VERIFICATION_PATHS.strix21Cases,
  VERIFICATION_PATHS.strix21Custom,
  VERIFICATION_PATHS.strix21References,
  VERIFICATION_PATHS.strix21Reporting,
  VERIFICATION_PATHS.strix21Runs,
  path.join(VERIFICATION_PATHS.root, 'RETENTION_POLICY.md'),
  path.join(VERIFICATION_PATHS.deliverables, 'README.md'),
]) {
  if (!await exists(required)) failures.push({ code: 'CANONICAL_ROOT_MISSING', path: normalize(path.relative(REPOSITORY_ROOT, required)) });
}

for (const mapping of codeRelocationManifest.mappings || []) {
  relocatedModuleCount += 1;
  const source = path.join(REPOSITORY_ROOT, mapping.source);
  const target = path.join(REPOSITORY_ROOT, mapping.target);
  if (!await exists(target)) {
    failures.push({ code: 'RELOCATED_TARGET_MISSING', path: mapping.target, source: mapping.source });
    continue;
  }
  if (mapping.source.startsWith('tools/')) {
    if (!await exists(source)) {
      failures.push({ code: 'COMPATIBILITY_WRAPPER_MISSING', path: mapping.source, target: mapping.target });
      continue;
    }
    const wrapper = await readFile(source, 'utf8');
    if (!wrapper.includes('Phase 16 compatibility launcher.') || !wrapper.includes('runCompatibilityCli') || !wrapper.includes(mapping.target.replace(/^verification\//u, '../verification/'))) {
      failures.push({ code: 'INVALID_COMPATIBILITY_WRAPPER', path: mapping.source, target: mapping.target });
    } else {
      compatibilityWrapperCount += 1;
    }
  } else if (mapping.source.startsWith('src/verification/') && await exists(source)) {
    failures.push({ code: 'LEGACY_VERIFICATION_SOURCE_STILL_EXISTS', path: mapping.source });
  }
}

const legacyVerificationSourceFiles = await listFiles(path.join(REPOSITORY_ROOT, 'src', 'verification')).catch((error) => {
  if (error?.code === 'ENOENT') return [];
  throw error;
});
for (const file of legacyVerificationSourceFiles) {
  failures.push({ code: 'UNMAPPED_LEGACY_VERIFICATION_SOURCE', path: normalize(path.relative(REPOSITORY_ROOT, file)) });
}

const productionVerificationImports = await findProductionVerificationImports();
for (const finding of productionVerificationImports) failures.push({ code: 'PRODUCTION_IMPORTS_VERIFICATION', ...finding });

const unresolvedVerificationImports = await findUnresolvedVerificationImports();
for (const finding of unresolvedVerificationImports) failures.push({ code: 'UNRESOLVED_VERIFICATION_IMPORT', ...finding });

const legacyReferences = await findActiveLegacyReferences();
for (const finding of legacyReferences) failures.push({ code: 'ACTIVE_LEGACY_PATH_REFERENCE', ...finding });

const result = {
  version: 'p16-verification-layout-check-v2',
  ok: failures.length === 0,
  checkedFiles,
  checkedBytes,
  exactHashMatches,
  acceptedHashExceptionCount: acceptedHashExceptions.length,
  acceptedHashExceptions,
  baseline: manifest.baseline,
  activeLegacyReferenceCount: legacyReferences.length,
  relocatedModuleCount,
  compatibilityWrapperCount,
  legacyVerificationSourceFileCount: legacyVerificationSourceFiles.length,
  productionVerificationImportCount: productionVerificationImports.length,
  unresolvedVerificationImportCount: unresolvedVerificationImports.length,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (strict && !result.ok) process.exitCode = 1;

async function exists(value) {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}

async function findProductionVerificationImports() {
  const sourceRoot = path.join(REPOSITORY_ROOT, 'src');
  const findings = [];
  for (const file of await listFiles(sourceRoot)) {
    if (!['.js', '.mjs'].includes(path.extname(file).toLowerCase())) continue;
    const source = await readFile(file, 'utf8');
    const expression = /(?:from\s*|import\s*\()\s*['"]([^'"]*verification(?:\/|['"]))/gu;
    for (const match of source.matchAll(expression)) {
      findings.push({
        path: normalize(path.relative(REPOSITORY_ROOT, file)),
        line: source.slice(0, match.index).split(/\r?\n/u).length,
        specifier: match[1],
      });
    }
  }
  return findings;
}

async function findUnresolvedVerificationImports() {
  const roots = [VERIFICATION_PATHS.framework, VERIFICATION_PATHS.runners, VERIFICATION_PATHS.harnesses];
  const findings = [];
  for (const root of roots) {
    for (const file of await listFiles(root)) {
      if (!['.js', '.mjs'].includes(path.extname(file).toLowerCase())) continue;
      const source = await readFile(file, 'utf8');
      const expressions = [
        /\b(?:import|export)\s+(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/gu,
        /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
      ];
      for (const expression of expressions) {
        for (const match of source.matchAll(expression)) {
          const specifier = match[1];
          if (!specifier.startsWith('.')) continue;
          const target = path.resolve(path.dirname(file), specifier);
          if (!await moduleTargetExists(target)) {
            findings.push({
              path: normalize(path.relative(REPOSITORY_ROOT, file)),
              line: source.slice(0, match.index).split(/\r?\n/u).length,
              specifier,
            });
          }
        }
      }
    }
  }
  return findings;
}

async function moduleTargetExists(target) {
  for (const candidate of [target, `${target}.js`, `${target}.mjs`, path.join(target, 'index.js'), path.join(target, 'index.mjs')]) {
    if (await exists(candidate)) return true;
  }
  return false;
}

async function readOptionalJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalize(value) {
  return value.replaceAll('\\', '/');
}

async function findActiveLegacyReferences() {
  const roots = ['package.json', 'README.md', 'help.html', 'src', 'tests', 'tools', 'docs', 'reports', 'server', 'desktop'];
  const excluded = [
    'docs/phase16/',
    'tools/create-verification-relocation-manifest.mjs',
    'verification/archive/',
    'verification/harnesses/phase16-relocation.mjs',
  ];
  const extensions = new Set(['.js', '.mjs', '.json', '.md', '.html', '.txt', '.ps1', '.bat', '.yml', '.yaml']);
  const legacyPatterns = [
    { legacyPath: 'docs/verification', expression: /docs\/verification|["']docs["']\s*,\s*["']verification["']/gu },
    { legacyPath: 'reports/validation-evidence', expression: /reports\/validation-evidence|["']reports["']\s*,\s*["']validation-evidence["']/gu },
    { legacyPath: 'reports/benchmark-evidence/strix21', expression: /reports\/benchmark-evidence\/strix21|["']reports["']\s*,\s*["']benchmark-evidence["']\s*,\s*["']strix21["']/gu },
  ];
  const findings = [];
  for (const root of roots) {
    const absolute = path.join(REPOSITORY_ROOT, root);
    if (!await exists(absolute)) continue;
    const files = await listFiles(absolute);
    for (const file of files) {
      const relative = normalize(path.relative(REPOSITORY_ROOT, file));
      if (excluded.some((prefix) => relative === prefix || relative.startsWith(prefix))) continue;
      if (!extensions.has(path.extname(file).toLowerCase())) continue;
      const source = await readFile(file, 'utf8');
      for (const pattern of legacyPatterns) {
        pattern.expression.lastIndex = 0;
        for (const match of source.matchAll(pattern.expression)) {
          const line = source.slice(0, match.index).split(/\r?\n/u).length;
          findings.push({ path: relative, line, legacyPath: pattern.legacyPath });
        }
      }
    }
  }
  return findings;
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOTDIR') return null;
    throw error;
  });
  if (entries === null) return [root];
  const files = [];
  for (const entry of entries) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}
