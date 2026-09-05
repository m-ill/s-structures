import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCaseDirectoryContract } from '../../framework/phase17/manifestValidation.mjs';

export const P17_CASE_CONTRACT_TEST_VERSION = 'p17-m1-case-contract-test-v1';

export async function runP17CaseContract(options = {}) {
  if (!options.invokedUrl || !options.expectedCaseId) throw new Error('runP17CaseContract requires invokedUrl and expectedCaseId.');
  const caseDirectory = path.resolve(path.dirname(fileURLToPath(options.invokedUrl)), '..');
  const repoRoot = path.resolve(caseDirectory, '..', '..', '..', '..', '..');
  const contract = assertCaseDirectoryContract(caseDirectory, {
    repoRoot,
    expectedCaseId: options.expectedCaseId,
    m1Scaffold: true,
  });
  const result = {
    version: P17_CASE_CONTRACT_TEST_VERSION,
    caseId: options.expectedCaseId,
    status: 'CONTRACT_VALIDATED',
    benchmarkExecuted: false,
    solverExecuted: false,
    contract,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return Object.freeze(result);
}
