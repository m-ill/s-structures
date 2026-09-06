import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStrictJson, sha256Canonical } from '../../../../framework/phase17/canonical.mjs';
import { assertJsonSchema } from '../../../../framework/phase17/jsonSchemaStrict.mjs';

export const P17_M2_TERMINAL_GATE_VERSION = 'p17-m2-terminal-gate-v1';
export const P17_M2_GATE_IDS = Object.freeze([
  'OFFICIAL_EXECUTION_ORCHESTRATOR_AND_RECEIPT',
  'PINNED_EXTERNAL_EXECUTION_CUSTODIAN_TRUST_REGISTRY',
  'REFERENCE_ARTIFACT_BYTE_AUDIT',
  'EXTRACTION_AND_COMPARISON_REPLAY',
  'PHYSICS_AND_MUTATION_REPLAY',
  'THREE_INDEPENDENT_EXTERNALLY_CUSTODIED_RUNS',
  'DETERMINISTIC_PDF_REPRODUCTION_AND_VISUAL_PARITY_AUDIT',
  'SCOPED_INDEPENDENT_REVIEWER_ATTESTATIONS',
]);

const schemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'specs', 'phase17', 'm2-terminal-gate-schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const lockKeys = Object.freeze(['source', 'reference', 'probe', 'tolerance', 'canonicalModel', 'nativeModel', 'modelEquivalence', 'productBuild']);

export function buildP17M2GateAssessment(input = {}) {
  assertStrictJson(input, 'P17-M2 gate input');
  const byId = new Map((input.gates || []).map((row) => [row.id, row]));
  if (byId.size !== P17_M2_GATE_IDS.length || P17_M2_GATE_IDS.some((id) => !byId.has(id))) {
    throw gateError('P17_M2_GATE_SET_INVALID', 'The exact eight P17-M2 gate IDs are required.');
  }
  const gates = P17_M2_GATE_IDS.map((id) => normalizeGate(byId.get(id), id));
  const lockSummary = normalizeLockSummary(input.lockSummary || {});
  const counters = normalizeCounters(input.counters || {});
  const readyGateCount = gates.filter((row) => row.readinessStatus === 'READY').length;
  const passedTerminalGateCount = gates.filter((row) => row.terminalEvidenceStatus === 'PASS').length;
  const locksApproved = Object.values(lockSummary).every((status) => status === 'APPROVED');
  const executionAuthorized = readyGateCount === 8 && locksApproved;
  const terminalAuthorization = executionAuthorized
    && passedTerminalGateCount === 8
    && counters.officialExecutionCount >= 3
    && counters.externallyCustodiedRunCount >= 3
    && counters.solverExecutionCount >= 3
    && counters.benchmarkExecutionCount >= 3;
  const status = terminalAuthorization
    ? 'TERMINAL_EVIDENCE_COMPLETE'
    : executionAuthorized ? 'READY_FOR_OFFICIAL_EXECUTION' : 'BLOCKED_PRE_EXECUTION';
  const core = {
    version: 'p17-m2-terminal-gate-assessment-v1',
    phase: 17,
    milestone: 'P17-M2',
    caseId: 'SB1',
    status,
    executionAuthorized,
    terminalAuthorization,
    requiredGateCount: 8,
    readyGateCount,
    passedTerminalGateCount,
    gates,
    lockSummary,
    counters,
    externalDependencies: [...new Set(input.externalDependencies || [])].sort(),
    releaseAllowed: false,
  };
  const assessment = { ...core, assessmentHash: sha256Canonical(core) };
  assertJsonSchema(schema, assessment, 'P17-M2 gate assessment');
  return deepFreeze(assessment);
}

export function assertP17M2ExecutionAuthorized(assessment) {
  assertJsonSchema(schema, assessment, 'P17-M2 gate assessment');
  if (assessment.assessmentHash !== sha256Canonical(without(assessment, ['assessmentHash']))) {
    throw gateError('P17_M2_GATE_ASSESSMENT_HASH_MISMATCH', 'P17-M2 assessment self-hash is invalid.');
  }
  if (assessment.executionAuthorized !== true) {
    const blocked = assessment.gates.filter((row) => row.readinessStatus !== 'READY').map((row) => row.id);
    const locks = Object.entries(assessment.lockSummary).filter(([, status]) => status !== 'APPROVED').map(([key]) => key);
    throw gateError('P17_M2_EXECUTION_NOT_AUTHORIZED', `Blocked gates: ${blocked.join(', ') || '(none)'}; unapproved locks: ${locks.join(', ') || '(none)'}.`);
  }
  return true;
}

function normalizeGate(row, expectedId) {
  if (!row || row.id !== expectedId) throw gateError('P17_M2_GATE_ROW_INVALID', `Invalid gate row ${expectedId}.`);
  const readinessStatus = row.readinessStatus === 'READY' ? 'READY' : 'BLOCKED';
  const terminalEvidenceStatus = ['PASS', 'PENDING', 'BLOCKED'].includes(row.terminalEvidenceStatus) ? row.terminalEvidenceStatus : 'BLOCKED';
  const artifactHashes = [...new Set(row.artifactHashes || [])].sort();
  if (artifactHashes.some((hash) => !/^[a-f0-9]{64}$/u.test(hash))) throw gateError('P17_M2_GATE_ARTIFACT_HASH_INVALID', `Invalid artifact hash in ${expectedId}.`);
  const reasonCodes = [...new Set(row.reasonCodes || [])].sort();
  if (readinessStatus === 'READY' && !artifactHashes.length) throw gateError('P17_M2_READY_GATE_EVIDENCE_REQUIRED', `${expectedId} requires implementation evidence.`);
  if (readinessStatus === 'BLOCKED' && !reasonCodes.length) throw gateError('P17_M2_BLOCKED_GATE_REASON_REQUIRED', `${expectedId} requires a reason code.`);
  if (terminalEvidenceStatus === 'PASS' && readinessStatus !== 'READY') throw gateError('P17_M2_TERMINAL_GATE_NOT_READY', `${expectedId} cannot PASS before readiness.`);
  return { id: expectedId, readinessStatus, terminalEvidenceStatus, artifactHashes, reasonCodes };
}

function normalizeLockSummary(input) {
  const allowed = new Set(['NOT_PREPARED', 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL', 'APPROVED']);
  const output = {};
  for (const key of lockKeys) {
    const value = input[key] || 'NOT_PREPARED';
    if (!allowed.has(value)) throw gateError('P17_M2_LOCK_STATUS_INVALID', `Invalid ${key} status: ${value}.`);
    output[key] = value;
  }
  if (Object.keys(input).some((key) => !lockKeys.includes(key))) throw gateError('P17_M2_LOCK_KEY_INVALID', 'Unknown P17-M2 lock key.');
  return output;
}

function normalizeCounters(input) {
  const keys = ['officialExecutionCount', 'externallyCustodiedRunCount', 'officialPassCount', 'solverExecutionCount', 'benchmarkExecutionCount', 'caseReportCount'];
  return Object.fromEntries(keys.map((key) => {
    const value = input[key] ?? 0;
    if (!Number.isInteger(value) || value < 0) throw gateError('P17_M2_COUNTER_INVALID', `Invalid ${key}: ${value}.`);
    return [key, value];
  }));
}

function without(value, keys) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

function gateError(code, message) {
  return Object.assign(new Error(message), { code });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

