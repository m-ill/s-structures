import { stableHash, stableStringify } from '../../core/stableHash.js';
import {
  COMPUTE_BACKEND_CONTRACT_VERSION,
  describeComputeBackend,
  normalizeComputeTarget,
  preflightComputeBackend,
} from '../backends/contract.js';

export const ANALYSIS_EXECUTION_PLAN_VERSION = 'p9-analysis-execution-plan-v1';

export function createAnalysisExecutionPlan(input = {}) {
  const runId = requiredText(input.runId, 'runId');
  const caseId = requiredText(input.caseId, 'caseId');
  const domainHash = requiredHash(input.domainHash, 'domainHash');
  const userPolicy = normalizeComputeTarget(input.userPolicy || 'auto');
  const backends = Array.isArray(input.backends) ? input.backends : [];
  const requests = Array.isArray(input.operations) ? input.operations : [];
  if (!requests.length) throw planError('EXECUTION_OPERATION_REQUIRED', 'At least one operation is required.');
  const backendRows = backends.map((backend) => ({ backend, descriptor: describeComputeBackend(backend) }));
  const operations = requests.map((request, index) => routeOperation(request, index, backendRows, userPolicy, input));
  const settingsBytes = new TextEncoder().encode(stableStringify(input.settings || {}));
  const core = {
    version: ANALYSIS_EXECUTION_PLAN_VERSION,
    backendContractVersion: COMPUTE_BACKEND_CONTRACT_VERSION,
    runId,
    caseId,
    domainHash,
    workloadClass: String(input.workloadClass || 'S'),
    userPolicy,
    settingsHash: stableHash(Array.from(settingsBytes)),
    operations,
    correctionPolicy: clone(input.correctionPolicy || { mode: 'cpu-f64-audit' }),
    auditPolicy: clone(input.auditPolicy || { required: true, precision: 'f64' }),
    fallbackPolicy: 'forbidden',
  };
  return deepFreeze({ ...core, planHash: stableHash(core) });
}

export function validateAnalysisExecutionPlan(plan = {}) {
  const errors = [];
  if (!plan || typeof plan !== 'object') return { ok: false, errors: ['plan:not-object'] };
  if (plan.version !== ANALYSIS_EXECUTION_PLAN_VERSION) errors.push('plan:version');
  if (plan.backendContractVersion !== COMPUTE_BACKEND_CONTRACT_VERSION) errors.push('plan:backend-contract');
  for (const field of ['runId', 'caseId', 'domainHash', 'settingsHash']) if (!String(plan[field] || '')) errors.push('plan:' + field);
  if (plan.fallbackPolicy !== 'forbidden') errors.push('plan:fallback');
  if (!Array.isArray(plan.operations) || !plan.operations.length) errors.push('plan:operations');
  else {
    const ids = new Set();
    for (const row of plan.operations) {
      if (!row.id || ids.has(row.id)) errors.push('plan:operation-id');
      ids.add(row.id);
      if (!row.kind || !row.backendId || !row.backendBuildHash || !row.executionTarget || !row.precision) errors.push('plan:operation-route');
      if (row.preflight?.ok !== true || row.fallbackUsed !== false) errors.push('plan:operation-preflight');
    }
  }
  const copy = clone(plan);
  delete copy.planHash;
  if (plan.planHash !== stableHash(copy)) errors.push('plan:hash');
  return { ok: errors.length === 0, errors };
}

export function executionSettingsBytes(settings = {}) {
  return new TextEncoder().encode(stableStringify(settings));
}

function routeOperation(request = {}, index, backendRows, userPolicy, input) {
  const id = requiredText(request.id || 'operation-' + (index + 1), 'operation.id');
  const kind = requiredText(request.kind || request.operation, 'operation.kind');
  const candidates = backendRows
    .filter(({ descriptor }) => descriptor.operations.includes(kind))
    .filter(({ descriptor }) => policyAllows(descriptor, userPolicy))
    .sort((left, right) => candidateScore(right.descriptor) - candidateScore(left.descriptor));
  let selected = null;
  let preflight = null;
  for (const candidate of candidates) {
    const attempt = preflightComputeBackend(candidate.backend, {
      operation: kind,
      matrixClass: request.matrixClass,
      precision: request.precision,
      computeTarget: userPolicy,
      gpuEnabled: input.gpuEnabled === true,
      production: request.production !== false,
      estimatedBytes: request.estimatedBytes,
    });
    if (attempt.ok) {
      selected = candidate;
      preflight = attempt;
      break;
    }
  }
  if (!selected) {
    const code = userPolicy === 'gpu'
      ? 'GPU_BACKEND_UNAVAILABLE'
      : userPolicy === 'wasm' ? 'WASM_BACKEND_UNAVAILABLE' : 'COMPUTE_OPERATION_UNAVAILABLE';
    throw planError(code, 'No qualified backend route is available for ' + kind + '.');
  }
  const descriptor = selected.descriptor;
  return {
    id,
    kind,
    backendId: descriptor.id,
    backendBuildHash: descriptor.buildHash,
    executionTarget: descriptor.executionTarget,
    precision: request.precision || descriptor.numericPrecision,
    matrixClass: request.matrixClass || null,
    qualification: descriptor.qualification,
    estimatedBytes: nonnegativeInteger(request.estimatedBytes, 0),
    reason: userPolicy === 'auto' ? 'highest-qualified-compatible-route' : 'explicit-' + userPolicy + '-route',
    preflight: { ok: true, code: null },
    fallbackUsed: false,
  };
}

function policyAllows(descriptor, policy) {
  if (policy === 'gpu') return descriptor.targetFamily === 'gpu';
  if (policy === 'wasm') return descriptor.targetFamily === 'wasm';
  if (policy === 'cpu') return descriptor.targetFamily !== 'gpu';
  return true;
}

function candidateScore(descriptor) {
  let score = descriptor.production ? 100 : 0;
  if (descriptor.targetFamily === 'wasm') score += 30;
  else if (descriptor.targetFamily === 'cpu') score += 20;
  else if (descriptor.targetFamily === 'gpu') score += 10;
  if (descriptor.deterministic) score += 5;
  return score;
}

function requiredText(value, field) {
  const normalized = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (!normalized) throw planError('EXECUTION_PLAN_FIELD_REQUIRED', field + ' is required.');
  return normalized;
}

function requiredHash(value, field) {
  const normalized = requiredText(value, field);
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw planError('EXECUTION_PLAN_HASH_INVALID', field + ' must be a SHA-256 hash.');
  return normalized;
}

function nonnegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function planError(code, message) {
  return Object.assign(new Error(message), { code });
}
