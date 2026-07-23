import assert from 'node:assert/strict';
import {
  assertReportSnapshotCurrent,
  buildReportVerdict,
  createReportSnapshot,
  validateReportSnapshot,
} from '../src/report/phase11/reportSnapshot.js';

const model = fixtureModel();
const analysis = fixtureAnalysis();
const input = {
  projectId: 'P11-M1-FIXTURE',
  sourceRevision: 'test-revision',
  qualityAudit: { ok: true, items: [{ name: 'audit', status: 'OK' }] },
  phase10Eligibility: { eligible: true, status: 'qualified' },
  externalValidation: { status: 'not-available' },
};
const snapshot = createReportSnapshot(model, analysis, input);
assert.deepEqual(validateReportSnapshot(snapshot), { ok: true, errors: [] });
assert.equal(snapshot.verdict.overall, 'CONDITIONAL_PASS');
assert.equal(snapshot.verdict.axes.operational.status, 'PASS');
assert.equal(snapshot.verdict.axes.numericalIntegrity.status, 'PASS');
assert.equal(snapshot.verdict.axes.engineeringValidation.status, 'NOT_VERIFIED');
assert.ok(snapshot.verdict.reasonCodes.includes('INDEPENDENT_REFERENCE_NOT_AVAILABLE'));
assert.ok(Object.isFrozen(snapshot));
assert.ok(Object.isFrozen(snapshot.analysis));
assert.throws(() => { snapshot.analysis.ok = false; }, TypeError);
assert.equal(assertReportSnapshotCurrent(snapshot, model, analysis), true);

const hashes = new Set(Array.from({ length: 100 }, (_item, index) => createReportSnapshot(model, analysis, {
  ...input,
  locale: index % 2 ? 'ko-KR' : 'en-US',
  generatedAt: new Date(index * 1000).toISOString(),
  outputPath: `C:/Users/example/report-${index}.pdf`,
}).reportSnapshotHash));
assert.equal(hashes.size, 1);

const verified = createReportSnapshot(model, analysis, {
  ...input,
  externalValidation: { status: 'verified', referenceId: 'REF-1', evidenceHash: 'a'.repeat(64) },
});
assert.equal(verified.verdict.overall, 'PASS');

const failedAnalysis = fixtureAnalysis();
failedAnalysis.ok = false;
failedAnalysis.validation.errors.push({ code: 'SINGULAR' });
const failed = createReportSnapshot(model, failedAnalysis, input);
assert.equal(failed.verdict.overall, 'FAIL');
assert.equal(failed.verdict.axes.operational.status, 'FAIL');

const auditFailed = createReportSnapshot(model, analysis, {
  ...input,
  qualityAudit: { ok: false, items: [{ name: 'audit', status: 'Missing' }] },
});
assert.equal(auditFailed.verdict.overall, 'REVIEW');
assert.equal(auditFailed.verdict.axes.numericalIntegrity.status, 'REVIEW');

const staleVerdict = buildReportVerdict({ snapshot, analysis, stale: true });
assert.equal(staleVerdict.overall, 'FAIL');
assert.ok(staleVerdict.reasonCodes.includes('STALE_SNAPSHOT'));
const changedModel = structuredClone(model);
changedModel.nodes[1].x = 2;
assert.throws(
  () => assertReportSnapshotCurrent(snapshot, changedModel, analysis),
  (error) => error.code === 'P11_REPORT_SNAPSHOT_STALE',
);

const changedAnalysis = structuredClone(analysis);
changedAnalysis.envelope.dmax = 0.2;
assert.throws(
  () => assertReportSnapshotCurrent(snapshot, model, changedAnalysis),
  (error) => error.code === 'P11_REPORT_SNAPSHOT_STALE',
);

for (const forbidden of ['locale', 'outputPath', 'displayPath', 'generatedAt', 'renderedAt']) {
  assert.equal(JSON.stringify(snapshot).includes(`"${forbidden}"`), false);
}

console.log(JSON.stringify({
  ok: true,
  milestone: 'P11-M1',
  deterministicRuns: 100,
  snapshotHash: snapshot.reportSnapshotHash,
  conditionalVerdict: snapshot.verdict.overall,
  verifiedVerdict: verified.verdict.overall,
  failedVerdict: failed.verdict.overall,
  staleBlocked: true,
}, null, 2));

function fixtureModel() {
  return {
    schemaVersion: 5,
    meta: { id: 'P11-M1-FIXTURE', name: 'Display name is outside the canonical identity.' },
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N2', x: 1, y: 0, z: 0 },
    ],
    members: [{ id: 'M1', n1: 'N1', n2: 'N2', matId: 'MAT', secId: 'SEC' }],
    materials: [{ id: 'MAT', E: 200000, G: 76923 }],
    sections: [{ id: 'SEC', A: 0.01, Iy: 1e-5, Iz: 1e-5, J: 1e-5 }],
    loads: [{ id: 'L1', type: 'nodal', node: 'N2', case: 'D', P: 10, dir: '+x' }],
    loadCases: [{ id: 'D', type: 'dead' }],
    loadCombinations: [{ id: 'C1', factors: { D: 1 } }],
  };
}

function fixtureAnalysis() {
  return {
    ok: true,
    validation: { errors: [], warnings: [] },
    audit: { ok: true, maxEquilibriumResidual: 1e-15 },
    envelope: { dmax: 0.001, maxRatio: 0.4 },
    design: {
      summary: {
        maxUtilization: 0.4,
        governing: { memberId: 'M1', checkId: 'steel-flexure', comboId: 'C1', ratio: 0.4, status: 'OK' },
      },
    },
    designEligibility: { eligible: true, status: 'qualified', limitationCodes: [] },
    combinationCompleteness: { rows: [{ comboId: 'C1', complete: true }] },
    byCombo: {
      C1: { ok: true, dmax: 0.001, maxRatio: 0.4, summary: { equilibriumResidual: 1e-15 } },
    },
  };
}
