import { sha256Canonical } from '../../../../framework/phase17/canonical.mjs';
import { assertP17M2ExecutionAuthorized } from './m2TerminalGate.mjs';
import { createP17ProductAdapter } from '../../../../framework/phase17/productAdapter.mjs';

export const P17_OFFICIAL_EXECUTION_ORCHESTRATOR_VERSION = 'p17-official-execution-orchestrator-v1';

export function createP17OfficialExecutionIntent(input = {}) {
  assertP17M2ExecutionAuthorized(input.gateAssessment);
  const runId = String(input.runId || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/u.test(runId)) throw orchestratorError('P17_OFFICIAL_RUN_ID_INVALID', 'A stable official run ID is required.');
  const inputHashes = [...new Set(input.inputHashes || [])].sort();
  if (!inputHashes.length || inputHashes.some((hash) => !/^[a-f0-9]{64}$/u.test(hash))) {
    throw orchestratorError('P17_OFFICIAL_INPUT_HASH_SET_INVALID', 'Official intent requires locked input hashes.');
  }
  const core = {
    version: P17_OFFICIAL_EXECUTION_ORCHESTRATOR_VERSION,
    caseId: 'SB1',
    runId,
    gateAssessmentHash: input.gateAssessment.assessmentHash,
    inputHashes,
    productServiceVersion: 'p9-m9-product-analysis-service-v1',
    adapterVersion: 'p17-m1-product-adapter-v1',
    publicEntrypoint: 'src/index.js',
    computeTarget: 'cpu',
    fallbackPolicy: 'forbidden',
    externalRuntimeAllowed: false,
    networkFallbackAllowed: false,
  };
  return Object.freeze({ ...core, intentHash: sha256Canonical(core) });
}

export async function executeP17OfficialIntent(input = {}) {
  const intent = createP17OfficialExecutionIntent(input);
  const adapter = createP17ProductAdapter();
  const execution = await adapter.execute({
    runId: intent.runId,
    model: input.model,
    analysisCase: input.analysisCase,
    computeTarget: 'cpu',
    options: { fallbackPolicy: 'forbidden', externalRuntimeAllowed: false, networkFallbackAllowed: false },
  });
  return Object.freeze({ intent, execution });
}

function orchestratorError(code, message) {
  return Object.assign(new Error(message), { code });
}

