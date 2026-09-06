import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = 'p16-verification-relocation-manifest-v1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = path.join(ROOT, 'verification', 'archive', 'legacy-layout-map.json');
const MAPPINGS = Object.freeze([
  ['specs', 'docs/verification', 'verification/specs'],
  ['validation-evidence', 'reports/validation-evidence', 'verification/evidence/validation'],
  ['strix21-runs', 'reports/benchmark-evidence/strix21', 'verification/benchmarks/strix21/runs'],
]);

const mappings = [];
for (const [id, source, target] of MAPPINGS) {
  const sourceRoot = path.join(ROOT, source);
  const files = await listFiles(sourceRoot);
  if (!files.length) throw new Error(`Relocation source is empty or missing: ${source}`);
  const entries = [];
  for (const file of files) {
    const body = await readFile(file);
    const relative = normalize(path.relative(sourceRoot, file));
    entries.push({
      source: `${source}/${relative}`,
      target: `${target}/${relative}`,
      bytes: body.byteLength,
      sha256: sha256(body),
    });
  }
  entries.sort((left, right) => left.source.localeCompare(right.source));
  mappings.push({
    id,
    source,
    target,
    fileCount: entries.length,
    byteCount: entries.reduce((sum, item) => sum + item.bytes, 0),
    treeHash: sha256(Buffer.from(entries.map((item) => `${item.source}\0${item.bytes}\0${item.sha256}`).join('\0'))),
    files: entries,
  });
}

const architecture = await readJson(path.join(ROOT, 'reports', 'validation-evidence', 'phase15', 'p15-m8-architecture-audit.json'));
const regression = await readJson(path.join(ROOT, 'reports', 'validation-evidence', 'phase15', 'p15-m9-full-regression-evidence.json'));
const release = await readJson(path.join(ROOT, 'reports', 'validation-evidence', 'phase15', 'p15-m9-release-manifest.json'));
const gitStatus = readGitStatus();

const manifest = {
  version: VERSION,
  createdAt: new Date().toISOString(),
  operation: 'byte-preserving-relocation',
  status: 'frozen-before-move',
  sourceOfTruth: 'current-working-tree',
  dirtyWorktree: gitStatus.trim().length > 0,
  gitStatusSha256: sha256(Buffer.from(gitStatus)),
  baseline: {
    sourceDigest: architecture.sourceDigest,
    architectureAuditHash: architecture.auditHash,
    fullRegressionHash: regression.fullRegressionHash,
    releaseManifestHash: release.manifestHash,
    releaseStatus: release.status,
  },
  policy: {
    evidenceContentMutationAllowed: false,
    duplicateCanonicalCopiesAllowed: false,
    legacyEvidenceMayQualifyNewLayout: false,
  },
  mappings,
};

await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  output: normalize(path.relative(ROOT, OUTPUT)),
  mappingCount: mappings.length,
  fileCount: mappings.reduce((sum, item) => sum + item.fileCount, 0),
  byteCount: mappings.reduce((sum, item) => sum + item.byteCount, 0),
  baseline: manifest.baseline,
}, null, 2));

async function listFiles(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const files = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const current = path.join(root, entry.name);
      if (entry.isDirectory()) files.push(...await listFiles(current));
      else if (entry.isFile() && (await stat(current)).isFile()) files.push(current);
    }
    return files;
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function readGitStatus() {
  try {
    return execFileSync('git', [
      '-c', `safe.directory=${normalize(ROOT)}`,
      '-C', ROOT,
      'status', '--short', '--untracked-files=all',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    throw new Error(`Unable to freeze git status: ${error?.stderr || error?.message || error}`);
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalize(value) {
  return value.replaceAll('\\', '/');
}

