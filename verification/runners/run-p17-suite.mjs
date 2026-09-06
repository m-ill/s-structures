#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runIsolatedSuite } from '../framework/phase17/isolatedSuiteRunner.mjs';
import { assertSuiteScaffold } from '../framework/phase17/manifestValidation.mjs';

export const P17_CONTRACT_SUITE_RUNNER_VERSION = 'p17-m1-contract-suite-runner-v1';
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function runP17M1ContractSuite(options = {}) {
  const validation = assertSuiteScaffold(REPOSITORY_ROOT, { m1Scaffold: true });
  const suite = validation.suite;
  const selected = options.includeCustom ? [...suite.cases, ...suite.customCases.map((row) => ({ ...row, ordinal: 22 }))] : suite.cases;
  const staticContracts = options.includeCustom ? [...validation.cases, ...validation.customCases] : validation.cases;
  const cases = selected.map((row) => ({
    caseId: row.caseId,
    ordinal: row.ordinal,
    entrypoint: path.join(REPOSITORY_ROOT, ...row.folder.split('/'), 'runner', 'run.mjs'),
    cwd: REPOSITORY_ROOT,
    args: ['--operation=contract'],
    timeoutMs: options.timeoutMs || 10_000,
  }));
  const isolated = await runIsolatedSuite(cases, {
    allowedEntrypointRoot: REPOSITORY_ROOT,
    cwd: REPOSITORY_ROOT,
    timeoutMs: options.timeoutMs || 10_000,
    maxOutputBytes: 1_048_576,
  });
  const qualified = qualifyP17M1ContractRows(isolated.results, staticContracts);
  const results = qualified.results;
  const summary = qualified.summary;
  const allChildrenQualified = summary.contractValidated === summary.total;
  return Object.freeze({
    ...isolated,
    results,
    summary,
    version: P17_CONTRACT_SUITE_RUNNER_VERSION,
    mode: 'RESULT_FREE_CONTRACT_SMOKE',
    isolatedRunnerVersion: isolated.version,
    milestone: 'P17-M1',
    officialCaseCount: suite.officialCaseCount,
    includeCustom: Boolean(options.includeCustom),
    officialBenchmarkExecuted: allChildrenQualified ? false : null,
    benchmarkExecuted: allChildrenQualified ? false : null,
    solverExecuted: allChildrenQualified ? false : null,
    executionObservation: allChildrenQualified
      ? 'QUALIFIED_CONTRACT_ONLY_ZERO_EXECUTION'
      : 'UNKNOWN_UNQUALIFIED_OR_FAILED_CHILD',
    releaseAllowed: false,
  });
}

export function qualifyP17M1ContractRows(rows, staticContracts) {
  if (!Array.isArray(rows) || !Array.isArray(staticContracts)) throw new TypeError('Rows and static contracts must be arrays.');
  const contractByCaseId = new Map(staticContracts.map((contract) => [contract?.caseId, contract]));
  const results = Object.freeze(rows.map((row) => qualifyContractOutput(row, contractByCaseId.get(row.caseId))));
  return Object.freeze({ results, summary: summarize(results) });
}

function qualifyContractOutput(row, expectedStaticContract) {
  if (row.status !== 'CHILD_SUCCEEDED_UNQUALIFIED') return row;
  const output = row.parsedOutput;
  const valid = isExactObject(output, [
    'benchmarkExecuted', 'caseId', 'contract', 'externalRuntimeObservation', 'milestone',
    'operation', 'reasonCodes', 'releaseAllowed', 'solverExecuted', 'status', 'version',
  ])
    && output?.version === 'p17-m1-single-case-runner-v1'
    && output?.milestone === 'P17-M1'
    && output?.caseId === row.caseId
    && output?.operation === 'contract'
    && output?.status === 'CONTRACT_VALIDATED'
    && isExactStaticContract(output?.contract, expectedStaticContract)
    && output?.benchmarkExecuted === false
    && output?.solverExecuted === false
    && output?.externalRuntimeObservation === 'NOT_OBSERVED_CONTRACT_ONLY'
    && Array.isArray(output?.reasonCodes)
    && output.reasonCodes.length === 0
    && output?.releaseAllowed === false;
  if (valid) {
    return Object.freeze({
      ...row,
      status: 'CONTRACT_VALIDATED',
      benchmarkExecuted: false,
      solverExecuted: false,
      executionObservation: 'QUALIFIED_CONTRACT_ONLY_ZERO_EXECUTION',
    });
  }
  return Object.freeze({
    ...row,
    status: 'FAILED',
    reasonCodes: ['P17_CHILD_CONTRACT_OUTPUT_INVALID'],
    benchmarkExecuted: null,
    solverExecuted: null,
    executionObservation: 'UNKNOWN_INVALID_CONTRACT_OUTPUT',
  });
}

function summarize(results) {
  const firstFailure = results.findIndex((row) => ['FAILED', 'TIMED_OUT', 'SPAWN_BLOCKED'].includes(row.status));
  const summary = {
    total: results.length,
    contractValidated: results.filter((row) => row.status === 'CONTRACT_VALIDATED').length,
    childSucceededUnqualified: results.filter((row) => row.status === 'CHILD_SUCCEEDED_UNQUALIFIED').length,
    failed: results.filter((row) => row.status === 'FAILED').length,
    timedOut: results.filter((row) => row.status === 'TIMED_OUT').length,
    spawnBlocked: results.filter((row) => row.status === 'SPAWN_BLOCKED').length,
    continuedAfterFailure: firstFailure >= 0 && firstFailure < results.length - 1,
  };
  const categorized = summary.contractValidated + summary.childSucceededUnqualified
    + summary.failed + summary.timedOut + summary.spawnBlocked;
  if (categorized !== summary.total) throw new Error(`P17 suite summary mismatch: ${categorized}/${summary.total}.`);
  summary.terminalCount = categorized;
  return Object.freeze(summary);
}

function isExactStaticContract(value, expected) {
  if (!isExactObject(expected, ['caseId', 'officialSuiteMember', 'manifestHash', 'requiredFileCount'])) return false;
  if (!isExactObject(value, ['caseId', 'officialSuiteMember', 'manifestHash', 'requiredFileCount'])) return false;
  return value.caseId === expected.caseId
    && value.officialSuiteMember === expected.officialSuiteMember
    && value.manifestHash === expected.manifestHash
    && value.requiredFileCount === expected.requiredFileCount;
}

function isExactObject(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return actualKeys.length === sortedExpected.length
    && actualKeys.every((key, index) => key === sortedExpected[index]);
}

async function main() {
  const result = await runP17M1ContractSuite({ includeCustom: process.argv.includes('--include-custom') });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.summary.contractValidated !== result.results.length) process.exitCode = 1;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invoked === import.meta.url) await main();
