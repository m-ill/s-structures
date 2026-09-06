import assert from 'node:assert/strict';
import {
  VERIFICATION_MATRIX_RECORD_VERSION,
  VERIFICATION_MATRIX_VERSION,
  runVerificationMatrix,
} from '../verification/index.js';

const expectedCaseIds = [
  'E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10', 'E11',
  'A01', 'A02', 'A03', 'A04', 'A05', 'A06',
  'D01', 'D02', 'D03', 'D04', 'D05', 'D06',
  'S01', 'S02', 'S03', 'S04', 'S05',
];

const report = runVerificationMatrix();
assert.equal(report.version, VERIFICATION_MATRIX_VERSION);
assert.equal(report.recordVersion, VERIFICATION_MATRIX_RECORD_VERSION);
assert.equal(report.ok, true, JSON.stringify(report.records.filter((record) => record.status !== 'OK'), null, 2));
assert.equal(report.summary.caseCount, expectedCaseIds.length);
assert.equal(report.summary.recordCount, expectedCaseIds.length);
assert.equal(report.summary.failedCount, 0);
assert.deepEqual(report.coverage.missingCaseIds, []);

for (const caseId of expectedCaseIds) {
  assert.ok(report.coverage.recordedCaseIds.includes(caseId), `missing verification case: ${caseId}`);
}

assert.equal(report.summary.byTier.element.total, 11);
assert.equal(report.summary.byTier.assembly.total, 6);
assert.equal(report.summary.byTier.dynamic.total, 6);
assert.equal(report.summary.byTier.stability.total, 5);

for (const record of report.records) {
  assert.equal(record.version, VERIFICATION_MATRIX_RECORD_VERSION);
  assert.ok(record.caseId, 'record must include caseId');
  assert.ok(record.tier, `${record.caseId} must include tier`);
  assert.ok(record.name, `${record.caseId} must include name`);
  assert.ok(record.referenceSource, `${record.caseId} must include referenceSource`);
  assert.ok(record.solverVersion, `${record.caseId} must include solverVersion`);
  assert.equal(record.status, 'OK', `${record.caseId} should pass`);
  assert.equal(typeof record.modelHash, 'string');
  assert.equal(record.modelHash.length, 16);
  assert.equal(Number.isFinite(record.relError), true, `${record.caseId} relError should be finite`);
  assert.ok(record.tolerance > 0, `${record.caseId} tolerance should be positive`);
}

const elementOnly = runVerificationMatrix({ tiers: ['element'] });
assert.equal(elementOnly.summary.recordCount, 11);
assert.deepEqual(elementOnly.coverage.tiers, ['element']);
assert.equal(elementOnly.ok, true);

const criteriaModel = {
  analysisCriteria: {
    preset: 'custom',
    criteria: {
      tolerance: {
        element: { max: 1e-4 },
        smallFrame: { max: 2e-4 },
        modal: { max: 3e-4 },
        modalParticipation: { max: 4e-4 },
        rsa: { max: 5e-4 },
        pdelta: { max: 6e-4 },
      },
    },
  },
};

const overridden = runVerificationMatrix({
  criteriaModel,
  caseIds: ['E01', 'A01', 'D02', 'D03', 'D04', 'S04'],
});
assert.equal(overridden.ok, true);
assert.equal(toleranceOf(overridden, 'E01'), 1e-4);
assert.equal(toleranceOf(overridden, 'A01'), 2e-4);
assert.equal(toleranceOf(overridden, 'D02'), 3e-4);
assert.equal(toleranceOf(overridden, 'D03'), 4e-4);
assert.equal(toleranceOf(overridden, 'D04'), 5e-4);
assert.equal(toleranceOf(overridden, 'S04'), 6e-4);

console.log(JSON.stringify({
  ok: true,
  version: VERIFICATION_MATRIX_VERSION,
  recordCount: report.summary.recordCount,
  maxRelError: report.summary.maxRelError,
  tiers: report.coverage.tiers,
}, null, 2));

function toleranceOf(report, caseId) {
  return report.records.find((record) => record.caseId === caseId)?.tolerance;
}
