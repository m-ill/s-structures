const mode = String(process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) || 'pass');
const caseId = String(process.argv.find((value) => value.startsWith('--case='))?.slice('--case='.length) || 'FIXTURE');

if (process.env.P17_FRAMEWORK_CONTRACT_ONLY !== '1'
  || process.env.P17_EXTERNAL_RUNTIME_ALLOWED !== '0'
  || process.env.P17_NETWORK_FALLBACK_ALLOWED !== '0') {
  process.stderr.write('P17 fixture policy environment is invalid.\n');
  process.exitCode = 19;
} else if (mode === 'pass') {
  process.stdout.write(`${JSON.stringify({ caseId, status: 'CONTRACT_VALIDATED', solverExecuted: false })}\n`);
} else if (mode === 'missing-output') {
  // Deliberately exit zero without stdout. Generic process success is not a contract result.
} else if (mode === 'malformed-output') {
  process.stdout.write('{"incomplete":\n');
} else if (mode === 'invalid-contract') {
  process.stdout.write(`${JSON.stringify({
    version: 'p17-m1-single-case-runner-v1',
    milestone: 'P17-M1',
    caseId,
    operation: 'contract',
    contract: { caseId, officialSuiteMember: false, manifestHash: 'b'.repeat(64), requiredFileCount: 19 },
    benchmarkExecuted: false,
    solverExecuted: false,
    externalRuntimeObservation: 'NOT_OBSERVED_CONTRACT_ONLY',
    releaseAllowed: false,
    status: 'CONTRACT_VALIDATED',
    reasonCodes: [],
  })}\n`);
} else if (mode === 'canonical-contract') {
  process.stdout.write(`${JSON.stringify({
    version: 'p17-m1-single-case-runner-v1',
    milestone: 'P17-M1',
    caseId,
    operation: 'contract',
    contract: { caseId, officialSuiteMember: false, manifestHash: 'a'.repeat(64), requiredFileCount: 19 },
    benchmarkExecuted: false,
    solverExecuted: false,
    externalRuntimeObservation: 'NOT_OBSERVED_CONTRACT_ONLY',
    releaseAllowed: false,
    status: 'CONTRACT_VALIDATED',
    reasonCodes: [],
  })}\n`);
} else if (mode === 'fail') {
  process.stderr.write(`Intentional P17-M1 isolation failure for ${caseId}.\n`);
  process.exitCode = 17;
} else if (mode === 'timeout') {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  process.stdout.write(`${JSON.stringify({ caseId, status: 'UNEXPECTED_TIMEOUT_COMPLETION' })}\n`);
} else {
  process.stderr.write(`Unknown fixture mode: ${mode}\n`);
  process.exitCode = 18;
}
