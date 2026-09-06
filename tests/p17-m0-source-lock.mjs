import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalHash,
  extractHtmlEvidence,
  runP17M0,
  sha256File,
  verifyChecksumManifest,
  verifyExactRegularFileInventory,
} from '../verification/runners/run-p17-m0-source-lock.mjs';
import { assertJsonSchema } from '../verification/harnesses/json-schema-lite.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(readFileSync(path.join(ROOT, relative), 'utf8'));
const assertSchema = (value, schemaPath) => assertJsonSchema(readJson(schemaPath), value, schemaPath);
const officialIds = [
  'SB1', 'SB2', 'SB3', 'SB5', 'SB6', 'SB7', 'SB8', 'SB9', 'SB10', 'SB12', 'PD1',
  'SM5', 'SM5b', 'SM6', 'SR1', 'SR2', 'SR2b', 'P3S2', 'SP1', 'SH1', 'TH1',
];

const result = runP17M0();
assert.equal(result.status, 'COMPLETE_WITH_SOURCE_BLOCKERS');
assert.equal(result.m1EntryAllowed, true);
assert.equal(result.releaseAllowed, false);
assert.equal(result.officialCases, 21);
assert.equal(result.manifestVerified, '51/51');

const registry = readJson('verification/benchmarks/strix21/suite-source-registry-r2.json');
const evidence = readJson('verification/evidence/validation/phase17/p17-m0-baseline-source-lock-r2.json');
const discrepancies = readJson('verification/benchmarks/strix21/references/source-version-discrepancies-r2.json');
const vocabulary = readJson('verification/specs/phase17/reference-claim-vocabulary.json');
const pathPolicy = readJson('verification/specs/phase17/path-base-policy.json');
const contentAudit = readJson('verification/evidence/validation/phase17/p17-m0-source-value-presence-audit-r3.json');
const claimQualification = readJson('verification/evidence/validation/phase17/p17-m0-r2-claim-qualification-r1.json');

assertSchema(registry, 'verification/specs/phase17/suite-source-registry-schema.json');
assertSchema(evidence, 'verification/specs/phase17/p17-m0-baseline-schema.json');
assertSchema(discrepancies, 'verification/specs/phase17/source-version-discrepancy-schema.json');
assertSchema(contentAudit, 'verification/specs/phase17/p17-m0-content-audit-schema.json');
assertSchema(claimQualification, 'verification/specs/phase17/p17-m0-r2-claim-qualification-schema.json');
assert.equal(claimQualification.qualificationHash, canonicalHash(Object.fromEntries(Object.entries(claimQualification).filter(([key]) => key !== 'qualificationHash'))));
assert.equal(claimQualification.appliesTo.baselineHash, evidence.baselineHash);
assert.equal(claimQualification.appliesTo.sourceLockAggregateHash, evidence.sourceCustody.sourceLockAggregateHash);
assert.equal(claimQualification.replacementEvidence.auditHash, contentAudit.auditHash);
assert.equal(claimQualification.replacementEvidence.sha256, sha256File(path.join(ROOT, claimQualification.replacementEvidence.path)));
assert.equal(contentAudit.auditHash, canonicalHash(Object.fromEntries(Object.entries(contentAudit).filter(([key]) => key !== 'auditHash'))));
assert.deepEqual(contentAudit.cases.map((item) => item.caseId), officialIds);
assert.deepEqual(contentAudit.summary, {
  officialCaseCount: 21,
  catalogResultRowCount: 131,
  htmlMetadataPresenceAssertionCount: 42,
  htmlMetadataPresenceMatchedCount: 42,
  htmlScalarPresenceAssertionCount: 393,
  htmlScalarPresenceMatchedCount: 393,
  htmlResultRowOrderedSequenceAssertionCount: 131,
  htmlResultRowOrderedSequenceMatchedCount: 131,
  casePdfGlobalTextValuePresenceAssertionCount: 393,
  casePdfGlobalTextValuePresenceMatchedCount: 391,
  casePdfGlobalTextValuePresenceMissingCount: 2,
  manualLockedStartPageTitleAssertionCount: 21,
  manualLockedStartPageTitleMatchedCount: 21,
  sourceHashCheckCount: 42,
  sourceHashMatchedCount: 42,
});
assert.deepEqual(
  contentAudit.knownSourcePresentationDefects[0].textExtractionMissingScalarPresenceAssertions.map(({ caseId, rowIndex, field }) => ({ caseId, rowIndex, field })),
  [
    { caseId: 'SH1', rowIndex: 11, field: 'STRIX' },
    { caseId: 'SH1', rowIndex: 11, field: 'Reference' },
  ],
);

assert.deepEqual(registry.officialOrder, officialIds);
assert.equal(registry.officialCaseCount, 21);
assert.equal(registry.sourceRoot, pathPolicy.bases.DCR_VAULT_ROOT.logicalPrefix.replace(/\/$/, ''));
assert.equal(new Set(registry.officialOrder).size, 21);
assert.equal(registry.customExcluded[0].id, 'P3S2-SS');
assert.ok(!registry.officialOrder.includes('P3S2-SS'));
assert.notDeepEqual(registry.catalogOrder, registry.officialOrder, 'manual order must be explicit rather than inherited from catalog');
assert.equal(registry.registryHash, canonicalHash(Object.fromEntries(Object.entries(registry).filter(([key]) => key !== 'registryHash'))));

const locks = officialIds.map((caseId) => readJson(`verification/benchmarks/strix21/references/source-locks-r2/${caseId}.source-lock.json`));
assert.equal(locks.length, 21);
assert.deepEqual([...new Set(locks.map((lock) => lock.referenceLane.class))].sort(), [...vocabulary.referenceClasses].sort());
assert.deepEqual(registry.claimVocabulary.claimLevels, vocabulary.claimEvidenceLevels);
for (const [index, lock] of locks.entries()) {
  assertSchema(lock, 'verification/specs/phase17/source-lock-schema.json');
  assert.equal(lock.caseId, officialIds[index]);
  assert.equal(lock.ordinal, index + 1);
  assert.equal(lock.official, true);
  assert.equal(lock.sourceRoles.archivalNarrative.manual.engineVersion, '1.0.2');
  assert.ok(lock.sourceRoles.strixPublishedResult.file.path.startsWith(pathPolicy.bases.DCR_VAULT_ROOT.logicalPrefix));
  assert.ok(lock.sourceRoles.archivalNarrative.manual.path.startsWith(pathPolicy.bases.DCR_VAULT_ROOT.logicalPrefix));
  assert.ok(lock.sourceRoles.archivalNarrative.casePdf.path.startsWith(pathPolicy.bases.DCR_VAULT_ROOT.logicalPrefix));
  assert.equal(lock.sourceRoles.archivalNarrative.casePdf.engineVersion, '1.0.2');
  assert.equal(lock.runtimeProvenance.htmlEngineVersion, '1.0.4');
  assert.equal(lock.runtimeProvenance.rawRecordSha256, '(pending publish)');
  assert.equal(lock.referenceLane.sStructuresLane, 'NOT_RUN_IN_P17');
  assert.equal(lock.referenceLane.midasLane, 'NOT_AVAILABLE');
  assert.equal(lock.sourceLockHash, canonicalHash(Object.fromEntries(Object.entries(lock).filter(([key]) => key !== 'sourceLockHash'))));
}

assert.deepEqual(
  locks.filter((lock) => lock.runtimeProvenance.metadataConflict).map((lock) => lock.caseId),
  ['SB9', 'SB12', 'PD1', 'SP1', 'SH1', 'TH1'],
);
assert.equal(locks.find((lock) => lock.caseId === 'SB10').publishedAcceptanceDisplay.toleranceStatus, 'BLOCKED_TOLERANCE_PRECISION');
assert.ok(locks.find((lock) => lock.caseId === 'SH1').blockers.includes('INDIVIDUAL_PDF_RESULT_TABLE_CLIPPED_TWO_ROWS'));
assert.equal(locks.find((lock) => lock.caseId === 'P3S2').referenceLane.class, 'R5_INTERNAL_SPEC');

assert.equal(discrepancies.items.length, 9);
assert.equal(discrepancies.registerHash, canonicalHash(Object.fromEntries(Object.entries(discrepancies).filter(([key]) => key !== 'registerHash'))));
assert.ok(discrepancies.items.some((item) => item.id === 'P17-D007' && item.status === 'OPEN_HISTORICAL_PROVENANCE_GAP'));

assert.equal(evidence.status, 'COMPLETE_WITH_SOURCE_BLOCKERS');
assert.equal(evidence.phase17InheritedPassCount, 0);
assert.equal(evidence.externalRuntimeUsed, false);
assert.equal(evidence.strixActualR4Used, false);
assert.equal(evidence.midasActualR4Used, false);
assert.equal(evidence.releaseAllowed, false);
assert.equal(evidence.finalDesignTransferAllowed, false);
assert.equal(evidence.sourceCustody.declaredCount, 51);
assert.equal(evidence.sourceCustody.verifiedCount, 51);
assert.equal(evidence.sourceCustody.failureCount, 0);
assert.equal(evidence.phase15HistoricalSnapshot.provenance.pdf, 'CURRENT_PDF_REGENERATED_AFTER_BASELINE_CAPTURE');
assert.equal(evidence.phase15HistoricalSnapshot.provenance.markdown, 'P15_M0_MARKDOWN_NOT_CAPTURED');
assert.equal(evidence.phase15HistoricalSnapshot.provenance.recordedPdfBinaryPresent, false);
assert.equal(evidence.baselineHash, canonicalHash(Object.fromEntries(Object.entries(evidence).filter(([key]) => key !== 'baselineHash'))));
assert.deepEqual(evidence.gates.slice(0, 8).map((gate) => gate.status), Array(8).fill('PASS'));
assert.deepEqual(evidence.gates.slice(8).map((gate) => gate.status), ['BLOCKED_RELEASE_ONLY', 'BLOCKED_RELEASE_ONLY']);

for (const snapshot of Object.values(evidence.artifacts.contentAddressedSnapshots)) {
  const snapshotPath = path.join(ROOT, snapshot.path);
  assert.ok(existsSync(snapshotPath));
  assert.equal(sha256File(snapshotPath), snapshot.sha256);
}

const negativeRoot = mkdtempSync(path.join(os.tmpdir(), 'p17-m0-negative-'));
try {
  const scopedEvidence = path.join(negativeRoot, 'scoped-evidence.html');
  writeFileSync(scopedEvidence, [
    '<dl><dt>Engine</dt><dd>v9.9.9 footer</dd></dl>',
    '<dl class="summary bm-evidence compact">',
    '<dt>Engine</dt><dd>v1.0.4 (opensees.pyd)</dd>',
    '<dt>Run date</dt><dd>2026-08-08</dd>',
    '<dt>Record</dt><dd>records/SB1.json</dd>',
    '<dt>Evidence archive</dt><dd>verif-evidence-eng1.0.4-win-x64.zip &middot; SB1/</dd>',
    '<dt>sha256</dt><dd>(pending publish)</dd>',
    '</dl>',
    '<footer><dl><dt>Engine</dt><dd>v8.8.8 appendix</dd></dl></footer>',
  ].join(''));
  assert.deepEqual(extractHtmlEvidence(scopedEvidence), {
    engine: 'v1.0.4 (opensees.pyd)',
    engineVersion: '1.0.4',
    runDate: '2026-08-08',
    record: 'records/SB1.json',
    archive: 'verif-evidence-eng1.0.4-win-x64.zip · SB1/',
    archiveVersion: '1.0.4',
    sha256: '(pending publish)',
  });

  const payload = path.join(negativeRoot, 'payload.txt');
  writeFileSync(payload, 'tampered\n');
  writeFileSync(path.join(negativeRoot, 'checksums.sha256'), `${'0'.repeat(64)}  payload.txt\n`);
  const mismatch = verifyChecksumManifest(negativeRoot);
  assert.ok(mismatch.failures.some((item) => item.code === 'HASH_MISMATCH'));

  const actual = createHash('sha256').update('tampered\n').digest('hex');
  writeFileSync(path.join(negativeRoot, 'checksums.sha256'), `${actual}  ../outside.txt\n`);
  const escape = verifyChecksumManifest(negativeRoot);
  assert.ok(escape.failures.some((item) => item.code === 'PATH_ESCAPE'));

  writeFileSync(path.join(negativeRoot, 'checksums.sha256'), `${actual}  payload.txt\n${actual}  payload.txt\n`);
  const duplicate = verifyChecksumManifest(negativeRoot);
  assert.ok(duplicate.failures.some((item) => item.code === 'DUPLICATE_ENTRY'));

  writeFileSync(path.join(negativeRoot, 'extra.txt'), 'not declared\n');
  writeFileSync(path.join(negativeRoot, 'checksums.sha256'), `${actual}  payload.txt\n`);
  const unknownUnlisted = verifyChecksumManifest(negativeRoot);
  assert.ok(unknownUnlisted.failures.some((item) => item.code === 'UNKNOWN_UNLISTED_FILES'));

  const inventoryRoot = path.join(negativeRoot, 'source-locks');
  mkdirSync(inventoryRoot);
  writeFileSync(path.join(inventoryRoot, 'SB1.source-lock.json'), '{}\n');
  assert.deepEqual(verifyExactRegularFileInventory(inventoryRoot, ['SB1.source-lock.json'], 'test-lock'), {
    entryCount: 1,
    names: ['SB1.source-lock.json'],
  });
  mkdirSync(path.join(inventoryRoot, 'unexpected-directory'));
  assert.throws(
    () => verifyExactRegularFileInventory(inventoryRoot, ['SB1.source-lock.json'], 'test-lock'),
    /Unexpected test-lock entries/,
  );
  rmSync(path.join(inventoryRoot, 'unexpected-directory'), { recursive: true, force: true });
  writeFileSync(path.join(inventoryRoot, 'unexpected.source-lock.json'), '{}\n');
  assert.throws(
    () => verifyExactRegularFileInventory(inventoryRoot, ['SB1.source-lock.json'], 'test-lock'),
    /test-lock inventory drift/,
  );
} finally {
  rmSync(negativeRoot, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  suite: 'P17-M0 source custody',
  status: 'PASS',
  assertions: {
    officialCaseLocks: 21,
    checksumEntries: 51,
    provenanceConflictCases: 6,
    discrepancyItems: 9,
    negativePaths: ['HASH_MISMATCH', 'PATH_ESCAPE', 'DUPLICATE_ENTRY', 'UNKNOWN_UNLISTED_FILES', 'EXTRA_LOCK_DIRECTORY', 'EXTRA_LOCK_FILE'],
  },
  releaseAllowed: false,
  baselineHash: evidence.baselineHash,
}, null, 2)}\n`);
