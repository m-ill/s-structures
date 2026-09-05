import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analysisRunCanTransferToDesign,
  createAnalysisRunRecord,
} from '../src/core/analysisRunRecord.js';
import { createPracticeModel } from '../src/core/modelFactory.js';
import { modelHash } from '../src/core/modelHash.js';
import { validateAnalysisEvidenceAcceptance } from '../src/core/analysisEvidenceAcceptance.js';
import {
  adaptVerificationEvidenceForAnalysis,
  validateVerificationEvidenceForAnalysis,
} from '../verification/framework/analysisEvidenceAdapter.js';
import { VERIFICATION_MATRIX_RECORD_VERSION } from '../verification/framework/matrix/record.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const coreFiles = await listJavaScriptFiles(path.join(root, 'src', 'core'));
const coreVerificationImports = [];
for (const file of coreFiles) {
  const source = await readFile(file, 'utf8');
  if (/\b(?:import|export)\b[^'";]*['"][^'"]*verification\//.test(source)) {
    coreVerificationImports.push(path.relative(root, file).replaceAll('\\', '/'));
  }
}
assert.deepEqual(coreVerificationImports, [], 'production core must not import verification modules');

const model = createPracticeModel();
const analysisCase = { id: 'P15-F01-STATIC', kind: 'static', settings: { comboId: null } };
const expectedModelHash = modelHash(model);
const rawEvidence = {
  modelHash: expectedModelHash,
  audit: {
    version: 'p7-m11-run-record-audit-v1',
    ok: true,
    status: 'PASS',
    rows: [{
      version: VERIFICATION_MATRIX_RECORD_VERSION,
      caseId: analysisCase.id,
      tier: 'L1',
      name: 'P15 F01 independent comparison',
      modelHash: expectedModelHash,
      referenceSource: 'p15-f01-independent-reference',
      solverVersion: 'p15-f01-fixture-v1',
      status: 'OK',
      relError: 1e-10,
      tolerance: 1e-8,
    }],
  },
};
const acceptedEvidence = adaptVerificationEvidenceForAnalysis(rawEvidence, { model, analysisCase });
assert.equal(validateVerificationEvidenceForAnalysis(rawEvidence, { model, analysisCase }).ok, true);
assert.equal(validateAnalysisEvidenceAcceptance(acceptedEvidence, acceptedEvidence.acceptance.subject).ok, true);

const verified = recordWithEvidence(acceptedEvidence, 'VALID');
assert.equal(verified.qualification, 'verified');
assert.equal(verified.designTransferAllowed, true);
assert.equal(analysisRunCanTransferToDesign(verified, model), true);
const genericFieldRecord = createAnalysisRunRecord({
  model,
  analysisCase,
  attemptId: `${analysisCase.id}:GENERIC-FIELD`,
  result: { ok: true, status: 'ok', analysisEvidence: acceptedEvidence },
});
assert.equal(genericFieldRecord.qualification, 'verified', 'the core-owned generic evidence field must be accepted');

const rawOnly = recordWithEvidence(rawEvidence, 'RAW');
assert.equal(rawOnly.qualification, 'candidate', 'unadapted legacy evidence is not a production trust decision');
assert.equal(analysisRunCanTransferToDesign(rawOnly, model), false);

const untrustedAudit = structuredClone(rawEvidence);
untrustedAudit.audit.version = 'self-declared-audit-v999';
const rejectedEvidence = adaptVerificationEvidenceForAnalysis(untrustedAudit, { model, analysisCase });
assert.equal(rejectedEvidence.acceptance.decision, 'REJECTED');
assert.equal(recordWithEvidence(rejectedEvidence, 'UNTRUSTED').designTransferAllowed, false);

for (const mutation of [
  {
    id: 'producer',
    apply: (evidence) => { evidence.acceptance.producer.id = 'untrusted-producer'; },
  },
  {
    id: 'subject',
    apply: (evidence) => { evidence.acceptance.subject.caseHash = 'forged-case-hash'; },
  },
  {
    id: 'source',
    apply: (evidence) => { evidence.audit.rows[0].relError = 1; },
  },
  {
    id: 'assertion',
    apply: (evidence) => { evidence.acceptance.assertions[0].tolerance = 10; },
  },
]) {
  const evidence = structuredClone(acceptedEvidence);
  mutation.apply(evidence);
  const record = recordWithEvidence(evidence, mutation.id.toUpperCase());
  assert.equal(record.qualification, 'candidate', `${mutation.id} mutation must lose verified qualification`);
  assert.equal(record.designTransferAllowed, false, `${mutation.id} mutation must block design transfer`);
  assert.equal(analysisRunCanTransferToDesign(record, model), false, `${mutation.id} mutation must remain fail closed`);
}

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['P15-ARCH-02', 'P15-M8-F01'],
  coreFileCount: coreFiles.length,
  coreVerificationImports,
  validQualification: verified.qualification,
  invalidEvidenceBlocked: true,
  mutationKills: 4,
}, null, 2));

function recordWithEvidence(verificationEvidence, suffix) {
  return createAnalysisRunRecord({
    model,
    analysisCase,
    attemptId: `${analysisCase.id}:${suffix}`,
    result: { ok: true, status: 'ok', verificationEvidence },
  });
}

async function listJavaScriptFiles(directory) {
  const rows = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await listJavaScriptFiles(target));
    else if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) rows.push(target);
  }
  return rows.sort();
}
