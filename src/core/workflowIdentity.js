import { stableHash } from './stableHash.js';

export const WORKFLOW_INPUT_IDENTITY_VERSION = 'p19-input-v1';

// Do not rewrite older hashes: their projections are part of their contracts.
export function workflowModelInput(model) {
  const input = structuredClone(model);
  assertFiniteJson(input);
  for (const row of input.analysisCases || []) {
    delete row.status; delete row.lastRun; delete row.staleReason;
  }
  return input;
}

export function createWorkflowInputIdentity({ model, analysisCase = null, settings = null,
  designSettings = {}, rulePack = null, build = null, library = null } = {}) {
  if (!model || typeof model !== 'object' || Array.isArray(model)) throw new TypeError('MODEL_REQUIRED');
  const input = workflowModelInput(model);
  const caseInput = analysisCase ? workflowModelInput({ analysisCases: [analysisCase] }).analysisCases[0] : null;
  const parts = {
    model: input, analysisCase: caseInput,
    settings: settings ?? { model: input.analysisSettings || {}, case: caseInput?.settings || {} },
    designBasis: { basis: input.designBasis || null, setup: input.projectSetup || null, designSettings },
    materials: { records: input.materials || [], resolved: library?.materials || null },
    sections: { records: input.sections || [], resolved: library?.sections || null },
    rulePack, build,
  };
  assertFiniteJson(parts);
  const hashes = Object.fromEntries(Object.entries(parts).map(([key, value]) => [`${key}Hash`, stableHash(value)]));
  const identity = { inputIdentityVersion: WORKFLOW_INPUT_IDENTITY_VERSION, ...hashes };
  return Object.freeze({ ...identity, inputHash: stableHash(identity), buildBound: build != null, rulePackBound: rulePack != null });
}

export function sameWorkflowInput(left, right) {
  return validIdentity(left) && validIdentity(right) && left.inputHash === right.inputHash;
}

export function validIdentity(identity) {
  if (identity?.inputIdentityVersion !== WORKFLOW_INPUT_IDENTITY_VERSION) return false;
  const keys = ['modelHash', 'analysisCaseHash', 'settingsHash', 'designBasisHash', 'materialsHash', 'sectionsHash', 'rulePackHash', 'buildHash'];
  if (keys.some(key => !/^[a-f0-9]{64}$/.test(identity[key] || ''))) return false;
  if (identity.buildBound !== (identity.buildHash !== stableHash(null)) || identity.rulePackBound !== (identity.rulePackHash !== stableHash(null))) return false;
  return identity.inputHash === stableHash(Object.fromEntries(['inputIdentityVersion', ...keys].map(key => [key, identity[key]])));
}

export function legacyIdentityDecision(identity, legacy = {}) {
  return { compatible: false, code: 'LEGACY_INPUT_REBIND_REQUIRED',
    currentIdentity: identity, legacy: structuredClone(legacy),
    reason: 'A legacy hash alone cannot establish full input/settings/build identity. Retain the original record and rerun or explicitly rebind from its complete snapshot.' };
}

function assertFiniteJson(value, path = '$', seen = new Set()) {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError(`NONFINITE_INPUT:${path}`);
  if (['function', 'symbol', 'bigint'].includes(typeof value)) throw new TypeError(`NON_JSON_INPUT:${path}`);
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) throw new TypeError(`CYCLIC_INPUT:${path}`);
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`NON_JSON_INPUT:${path}`);
  seen.add(value);
  for (const [key, item] of Object.entries(value)) assertFiniteJson(item, `${path}.${key}`, seen);
  seen.delete(value);
}
