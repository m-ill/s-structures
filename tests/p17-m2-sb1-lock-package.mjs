import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertP17M2ExecutionAuthorized } from '../verification/milestones/phase17/m2/framework/m2TerminalGate.mjs';
import { buildP17M2Sb1LockPackage, serializeP17M2Sb1Document } from '../verification/milestones/phase17/m2/framework/sb1LockPackage.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = buildP17M2Sb1LockPackage({ repoRoot: root });
assert.equal(result.status, 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL');
assert.equal(result.releaseAllowed, false);
assert.equal(result.productValidation.ok, true);
assert.equal(result.referenceByteAudit.status, 'PASS');
assert.equal(result.referenceByteAudit.sourceArtifacts.length, 3);
assert.equal(result.gateAssessment.requiredGateCount, 8);
assert.equal(result.gateAssessment.readyGateCount, 5);
assert.equal(result.gateAssessment.passedTerminalGateCount, 1);
assert.equal(result.gateAssessment.executionAuthorized, false);
assert.equal(result.gateAssessment.terminalAuthorization, false);
assert.equal(result.gateAssessment.status, 'BLOCKED_PRE_EXECUTION');
assert.equal(result.trustAudit.terminalEligible, false);
assert.deepEqual(result.casePackage.counters, {
  officialExecutionCount: 0,
  solverExecutionCount: 0,
  benchmarkExecutionCount: 0,
  engineeringResultCount: 0,
  caseReportCount: 0,
  officialPassCount: 0,
});
assert.throws(() => assertP17M2ExecutionAuthorized(result.gateAssessment), (error) => error.code === 'P17_M2_EXECUTION_NOT_AUTHORIZED');
for (const [repositoryPath, value] of Object.entries(result.documents)) {
  const committed = readFileSync(path.join(root, ...repositoryPath.split('/')));
  assert.equal(committed.toString('utf8'), serializeP17M2Sb1Document(value), repositoryPath);
  assert.equal(repositoryPath.includes('/runs/'), false);
  assert.equal(repositoryPath.includes('/results/'), false);
  assert.equal(repositoryPath.includes('/reports/'), false);
}
console.log(JSON.stringify({
  status: 'PASS',
  artifactCount: Object.keys(result.documents).length,
  readyGateCount: 5,
  passedTerminalGateCount: 1,
  referenceByteAudit: 'PASS_3_OF_3',
  officialExecutionCount: 0,
  solverExecutionCount: 0,
  benchmarkExecutionCount: 0,
  executionAuthorized: false,
  releaseAllowed: false,
}, null, 2));
