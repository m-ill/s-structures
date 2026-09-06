import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyzePhase15Architecture } from '../verification/harnesses/check-phase15-architecture.mjs';

const baseline = await analyzePhase15Architecture();
assert.equal(baseline.version, 'p16-m7-dual-root-architecture-audit-v1');
assert.match(baseline.sourceDigest, /^[a-f0-9]{64}$/);
assert.match(baseline.auditHash, /^[a-f0-9]{64}$/);
assert.ok(baseline.sourceFileCount > 0);
assert.ok(baseline.importEdgeCount > 0);
assert.equal(baseline.ok, Object.values(baseline.gate).every(Boolean));
assert.deepEqual(
  baseline.unresolvedRelativeImports,
  [],
  'all current relative source imports must resolve before ownership findings are interpreted',
);
for (const [owner, audit] of Object.entries(baseline.ownership)) {
  assert.equal(audit.canonicalPresent, true, `${owner} must resolve to its registered canonical module`);
  assert.equal(audit.ownerCount, 1, `${owner} must have exactly one implementation owner`);
  assert.deepEqual(audit.duplicateOwners, [], `${owner} must not have a duplicate implementation owner`);
}
assert.ok(baseline.compatibility.wrappers.every((wrapper) => Array.isArray(wrapper.consumers)));
assert.ok(baseline.publicApi.rootReexportModuleCount > 0);
assert.deepEqual(
  baseline.forbiddenImports.filter((row) => row.rule === 'internal-root-barrel'),
  [],
  'internal modules must import canonical owners directly; the root barrel is external-consumer-only',
);

const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'sstructures-p15-m8-'));
try {
  await writeFixture(fixtureRoot);
  const mutation = await analyzePhase15Architecture({ root: fixtureRoot });
  const repeatedMutation = await analyzePhase15Architecture({ root: fixtureRoot });
  assert.equal(repeatedMutation.sourceDigest, mutation.sourceDigest, 'unchanged source digest must be deterministic');
  assert.equal(repeatedMutation.auditHash, mutation.auditHash, 'unchanged architecture audit hash must be deterministic');
  assert.equal(mutation.ok, false, 'the architecture audit must fail closed on registered violations');
  assert.equal(mutation.cycles.length, 1, 'the import-cycle mutation must be detected');
  assert.ok(hasRule(mutation, 'internal-root-barrel'));
  assert.ok(hasRule(mutation, 'ui-numeric-core'));
  assert.ok(hasRule(mutation, 'production-verification'));
  assert.equal(mutation.ownership.sparseAssembler.duplicateOwners.length, 1);
  assert.equal(mutation.ownership.stabilizationClassifier.duplicateOwners.length, 1);
  assert.equal(mutation.gate.plateBoundaryOwner, false, 'an embedded workflow boundary owner is not the canonical module');
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

const ruleCounts = Object.fromEntries(
  [...new Set(baseline.forbiddenImports.map((row) => row.rule))]
    .sort()
    .map((rule) => [rule, baseline.forbiddenImports.filter((row) => row.rule === rule).length]),
);
console.log(JSON.stringify({
  ok: true,
  auditExecuted: true,
  qualificationStatus: baseline.ok ? 'PASS' : 'BLOCKED',
  verificationIds: ['P15-ARCH-01', 'P15-ARCH-02', 'P15-ARCH-03', 'P15-ARCH-04'],
  sourceFileCount: baseline.sourceFileCount,
  importEdgeCount: baseline.importEdgeCount,
  importCycles: baseline.cycles.length,
  ruleCounts,
  canonicalOwners: Object.fromEntries(Object.entries(baseline.ownership).map(([key, value]) => [key, {
    canonicalPresent: value.canonicalPresent,
    ownerCount: value.ownerCount,
    duplicateOwnerCount: value.duplicateOwners.length,
  }])),
  compatibilityWrappers: baseline.compatibility.wrapperCount,
  undocumentedWrappers: baseline.compatibility.undocumentedWrappers.length,
  overdueCompatibilityPolicies: baseline.compatibility.overduePolicies.length,
}, null, 2));

function hasRule(report, rule) {
  return report.forbiddenImports.some((row) => row.rule === rule);
}

async function writeFixture(root) {
  const files = {
    'src/index.js': "export { solveA } from './solver/a.js';\n",
    'src/solver/a.js': "import { solveB } from './b.js';\nimport '../verification/reference.js';\nimport '../index.js';\nexport function solveA() { return solveB(); }\n",
    'src/solver/b.js': "import { solveA } from './a.js';\nexport function solveB() { return typeof solveA; }\n",
    'src/ui/panel.js': "import { solveA } from '../solver/a.js';\nimport '../index.js';\nexport const panel = solveA;\n",
    'src/verification/reference.js': 'export const expected = 1;\n',
    'src/compute/sparse/assembly.js': 'export function createDeterministicSparseAssembler() {}\n',
    'src/solver/linear3dAssembly.js': 'function createSparseAccumulator() {}\nfunction stabilizeUnsupportedRotationsSparse() {}\n',
    'src/solver/shell/unsupportedRotationFloor.js': 'export function stabilizeUnsupportedRotations() {}\n',
    'src/solver/shell/plateWorkflow.js': 'export function buildPlateBoundaryTemplate() {}\n',
    'src/solver/foundation/foundationRecovery.js': 'export function buildFoundationEndActionContract() {}\n',
  };
  for (const [relative, source] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, source, 'utf8');
  }
}
