import assert from 'node:assert/strict';
import {
  solveLinearDetailed,
} from '../src/index.js';
import {
  PATHOLOGICAL_MODEL_CASE_IDS,
  runPathologicalModelBattery,
} from '../verification/index.js';

const report = runPathologicalModelBattery();
assert.equal(report.status, 'OK', JSON.stringify(report.rows.filter((row) => row.status !== 'PASS'), null, 2));
assert.deepEqual(report.rows.map((row) => row.caseId), PATHOLOGICAL_MODEL_CASE_IDS);
assert.equal(new Set(report.rows.map((row) => row.caseId)).size, 10);
assert.equal(report.summary.total, 10);
assert.equal(report.summary.pass, 10);
assert.equal(report.summary.ng, 0);
assert.deepEqual(report.summary.duplicateCaseIds, []);
assert.deepEqual(report.summary.missingCaseIds, []);
assert.match(report.artifactHash, /^[0-9a-f]{24}$/);

for (const row of report.rows) {
  assert.equal(row.status, 'PASS', row.caseId);
  assert.equal(row.actualCode, row.expectedCode, row.caseId);
  assert.ok(row.locations.length > 0, `${row.caseId} must expose a diagnostic location`);
  assert.equal(row.record.status, 'OK');
  assert.equal(row.record.reference, 1);
  assert.equal(row.record.computed, 1);
  assert.equal(row.record.relError, 0);
  assert.equal(row.record.tolerance, 0);
  assert.match(row.record.modelHash, /^[0-9a-f]{16}$/);
  assert.ok(row.record.solverVersion);
}

const byId = Object.fromEntries(report.rows.map((row) => [row.caseId, row]));
assert.deepEqual(byId['BM-02'].details.issue.memberIds, ['M1', 'M2']);
assert.equal(byId['BM-03'].locations[0].memberId, 'M1');
assert.equal(byId['BM-04'].locations[0].nodeId, 'N2');
assert.equal(byId['BM-04'].locations[0].component, 'uz');
assert.equal(byId['BM-04'].details.analysisOk, false);
assert.equal(byId['BM-04'].details.validationHealth.ok, false);
assert.equal(byId['BM-04'].details.validationHealth.status, 'ERROR');
assert.ok(byId['BM-04'].details.validationHealth.issueCount > 0);
assert.ok(byId['BM-04'].details.validationHealth.errorCodes.includes('MECHANISM_DOF'));
assert.deepEqual(byId['BM-05'].locations.map((row) => row.component), ['rx', 'ry', 'rz']);
assert.equal(byId['BM-06'].details.condensation.status, 'available');
assert.ok(byId['BM-06'].details.condensation.residualDofCount > 0);
assert.ok(byId['BM-07'].details.conditionEstimate > 1e12);
assert.equal(byId['BM-07'].details.fixtureLevel, 'assembled-product-model');
assert.equal(byId['BM-07'].details.analysisOk, false);
assert.equal(byId['BM-07'].details.failureReason, 'SINGULAR');
assert.ok(byId['BM-08'].details.strainDifference < 1e-9);
assert.ok(byId['BM-08'].details.reactionRatioDifference < 1e-9);
assert.equal(byId['BM-08'].details.fixtureLevel, 'assembled-product-model-after-explicit-normalization');
assert.equal(byId['BM-08'].details.metreKilonewton.result.ok, true);
assert.equal(byId['BM-08'].details.millimetreNewton.result.ok, true);
assert.equal(byId['BM-09'].details.componentCount, 2);
assert.ok(byId['BM-10'].details.pivotRatio < 1e-8);
assert.ok(byId['BM-10'].details.pivotRatio > 1e-12);
assert.ok(byId['BM-10'].locations.some((row) => row.label === 'B.uy'));
assert.equal(byId['BM-10'].details.fixtureLevel, 'assembled-product-model');
assert.equal(byId['BM-10'].details.analysisOk, true);
assert.equal(byId['BM-10'].details.validationHealth.ok, true);
assert.equal(byId['BM-10'].details.validationHealth.status, 'WARN');
assert.ok(byId['BM-10'].details.validationHealth.warningCodes.includes('SOLVER_PIVOT_NEAR_SINGULAR'));

const coupledNearMechanism = [
  [1, 1 - 1e-9],
  [1 - 1e-9, 1],
];
const coupledVariants = [
  ['dense', {}],
  ['sparse-ldlt', { sparse: true }],
  ['sparse-cg', { sparse: true, method: 'cg' }],
].map(([name, options]) => {
  const solved = solveLinearDetailed(coupledNearMechanism, [1, 1], {
    ...options,
    labels: ['A.ux', 'B.ux'],
  });
  const warning = solved.diagnostics?.diagnostics?.warnings
    ?.find((item) => item.code === 'SOLVER_PIVOT_NEAR_SINGULAR');
  assert.equal(solved.ok, true, `${name} coupled near-mechanism must remain solvable`);
  assert.ok(solved.diagnostics.pivotRatio < 1e-8, `${name} pivot warning band`);
  assert.ok(solved.diagnostics.pivotRatio > 1e-12, `${name} singular boundary`);
  assert.equal(solved.diagnostics.pivotMinOriginalIndex, 1, `${name} original pivot DOF`);
  assert.equal(warning?.code, 'SOLVER_PIVOT_NEAR_SINGULAR', `${name} warning code`);
  assert.ok(warning.dofs.includes('B.ux'), `${name} warning must localize the coupled pivot DOF`);
  return { name, method: solved.diagnostics.method, pivotRatio: solved.diagnostics.pivotRatio, dofs: warning.dofs };
});

console.log(JSON.stringify({
  ok: true,
  artifactHash: report.artifactHash,
  pass: report.summary.pass,
  bm04: byId['BM-04'].locations[0],
  bm10PivotRatio: byId['BM-10'].details.pivotRatio,
  coupledVariants,
}, null, 2));
