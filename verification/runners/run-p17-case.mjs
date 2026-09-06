#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertCaseDirectoryContract } from '../framework/phase17/manifestValidation.mjs';

export const P17_SINGLE_CASE_RUNNER_VERSION = 'p17-m1-single-case-runner-v1';

export async function runP17CaseCli(options = {}) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const parsed = parseArguments(process.argv.slice(2));
  const caseDirectory = options.invokedUrl
    ? path.resolve(path.dirname(fileURLToPath(options.invokedUrl)), '..')
    : resolveCaseDirectory(repoRoot, parsed.caseId || options.expectedCaseId);
  const caseId = parsed.caseId || options.expectedCaseId || path.basename(caseDirectory);
  if (options.expectedCaseId && caseId !== options.expectedCaseId) {
    throw runnerError('P17_CASE_WRAPPER_BINDING_MISMATCH', `Wrapper ${options.expectedCaseId} cannot run ${caseId}.`);
  }
  const contract = assertCaseDirectoryContract(caseDirectory, {
    repoRoot,
    expectedCaseId: caseId,
    m1Scaffold: true,
  });
  const operation = parsed.operation || 'contract';
  const common = {
    version: P17_SINGLE_CASE_RUNNER_VERSION,
    milestone: 'P17-M1',
    caseId,
    operation,
    contract,
    benchmarkExecuted: false,
    solverExecuted: false,
    externalRuntimeObservation: 'NOT_OBSERVED_CONTRACT_ONLY',
    releaseAllowed: false,
  };
  const result = operation === 'contract'
    ? { ...common, status: 'CONTRACT_VALIDATED', reasonCodes: [] }
    : {
      ...common,
      status: 'BLOCKED_M1_FRAMEWORK_ONLY',
      reasonCodes: [reasonForOperation(operation), 'P17_M1_FRAMEWORK_ONLY_NO_BENCHMARK_EXECUTION'],
    };
  if (options.emit !== false) process.stdout.write(`${JSON.stringify(result)}\n`);
  if (operation !== 'contract') process.exitCode = 2;
  return Object.freeze(result);
}

function parseArguments(args) {
  const supportedOperations = new Set(['contract', 'build', 'run', 'compare', 'report']);
  let caseId = null;
  let operation = 'contract';
  for (const argument of args) {
    if (argument.startsWith('--case=')) caseId = argument.slice('--case='.length);
    else if (argument.startsWith('--operation=')) operation = argument.slice('--operation='.length);
    else if (argument === '--contract-check') operation = 'contract';
    else throw runnerError('P17_CASE_ARGUMENT_INVALID', `Unknown argument: ${argument}`);
  }
  if (!supportedOperations.has(operation)) throw runnerError('P17_CASE_OPERATION_INVALID', `Unsupported operation: ${operation}`);
  return { caseId, operation };
}

function resolveCaseDirectory(repoRoot, caseId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,31}$/u.test(String(caseId || ''))) throw runnerError('P17_CASE_ID_REQUIRED', 'A valid --case=<ID> is required.');
  const lane = caseId === 'P3S2-SS' ? 'custom' : 'cases';
  return path.join(repoRoot, 'verification', 'benchmarks', 'strix21', lane, caseId);
}

function reasonForOperation(operation) {
  return ({
    build: 'P17_MODEL_NOT_BUILT',
    run: 'P17_REFERENCE_MODEL_AND_BUILD_LOCKS_REQUIRED',
    compare: 'P17_COMPARISON_EVIDENCE_NOT_AVAILABLE',
    report: 'P17_IMMUTABLE_CASE_EVIDENCE_NOT_AVAILABLE',
  })[operation] || 'P17_OPERATION_BLOCKED';
}

function runnerError(code, message) {
  return Object.assign(new Error(message), { code });
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invoked === import.meta.url) await runP17CaseCli();
