import { assertStrictJson, sha256Canonical } from './canonical.mjs';
import { validateManifestDocument } from './manifestValidation.mjs';
import { P17_PRODUCT_MODEL_SCHEMA_VERSION, validateP17ProductModel } from './productAdapter.mjs';

export const P17_CASE_MODEL_BUILDER_VERSION = 'p17-m1-case-model-builder-v1';

/**
 * Binds reviewed case artifacts into a product input. It does not infer geometry,
 * defaults, loads, masses, or element formulations from benchmark prose.
 */
export function prepareCaseModel(input = {}) {
  const canonicalInput = strictClone(input.canonicalInput, 'canonicalInput');
  const sstructuresInput = strictClone(input.sstructuresInput, 'sstructuresInput');
  const modelEquivalence = strictClone(input.modelEquivalence, 'modelEquivalence');
  validateManifestDocument('canonicalInput', canonicalInput);
  validateManifestDocument('sstructuresInput', sstructuresInput);
  validateManifestDocument('modelEquivalence', modelEquivalence);
  const caseIds = new Set([canonicalInput?.caseId, sstructuresInput?.caseId, modelEquivalence?.caseId]);
  if (caseIds.size !== 1 || !clean([...caseIds][0])) throw builderError('P17_MODEL_CASE_BINDING_MISMATCH', 'All model artifacts must bind the same case ID.');
  const artifactHashes = {
    canonicalInput: sha256Canonical(canonicalInput),
    sstructuresInput: sha256Canonical(sstructuresInput),
    modelEquivalence: sha256Canonical(modelEquivalence),
  };
  const reasons = [];
  if (canonicalInput.artifactStatus !== 'MODEL_LOCKED') reasons.push('P17_CANONICAL_MODEL_NOT_LOCKED');
  if (sstructuresInput.artifactStatus !== 'MODEL_LOCKED') reasons.push('P17_NATIVE_MODEL_NOT_LOCKED');
  if (modelEquivalence.artifactStatus !== 'LOCKED') reasons.push('P17_MODEL_EQUIVALENCE_NOT_LOCKED');
  if (reasons.length) {
    const core = {
      version: P17_CASE_MODEL_BUILDER_VERSION,
      caseId: [...caseIds][0],
      status: 'BLOCKED_MODEL',
      payloadAbsent: true,
      artifactHashes,
      reasonCodes: reasons.sort(),
    };
    return deepFreeze({ ...core, buildBindingHash: sha256Canonical(core) });
  }
  if (canonicalInput.payloadAbsent || sstructuresInput.payloadAbsent || modelEquivalence.payloadAbsent) {
    throw builderError('P17_LOCKED_MODEL_PAYLOAD_ABSENT', 'Locked model artifacts cannot declare payloadAbsent.');
  }
  if (!canonicalInput.releaseAllowed || canonicalInput.silentDefaults.status !== 'LOCKED' || canonicalInput.reasonCodes.length) {
    throw builderError('P17_CANONICAL_MODEL_NOT_RELEASED', 'Canonical model and every silent default must be locked before execution.');
  }
  if (!sstructuresInput.releaseAllowed || sstructuresInput.productProjectSchemaVersion !== String(P17_PRODUCT_MODEL_SCHEMA_VERSION) || sstructuresInput.reasonCodes.length) {
    throw builderError('P17_NATIVE_MODEL_NOT_RELEASED', `Native model must bind public product schema ${P17_PRODUCT_MODEL_SCHEMA_VERSION} and be released without blockers.`);
  }
  if (modelEquivalence.modelBindings?.canonicalInputHash !== artifactHashes.canonicalInput
    || modelEquivalence.modelBindings?.sstructuresInputHash !== artifactHashes.sstructuresInput) {
    throw builderError('P17_MODEL_ARTIFACT_BINDING_MISMATCH', 'Model equivalence does not bind the supplied canonical and native model artifacts.');
  }
  if (modelEquivalence.approval?.status !== 'APPROVED' || !sha(modelEquivalence.approval?.approvalHash)) {
    throw builderError('P17_MODEL_APPROVAL_REQUIRED', 'Independent model-equivalence approval is required before execution.');
  }
  const unresolved = (modelEquivalence.dimensions || []).filter((row) => row.mandatory && ![
    'IDENTICAL_SPECIFICATION',
    'ENGINEERING_EQUIVALENT',
  ].includes(row.status));
  if (unresolved.length) throw builderError('P17_MODEL_EQUIVALENCE_UNRESOLVED', `Unresolved dimensions: ${unresolved.map((row) => row.id).join(', ')}`);
  if (!['IDENTICAL_SPECIFICATION', 'ENGINEERING_EQUIVALENT'].includes(modelEquivalence.overallStatus)
    || (modelEquivalence.knownDifferences || []).some((row) => row.classification !== 'KNOWN_EQUIVALENT')) {
    throw builderError('P17_MODEL_EQUIVALENCE_NOT_QUALIFIABLE', 'Analogous or blocking model differences cannot enter a benchmark qualification run.');
  }
  const productModel = sstructuresInput.payload;
  if (!productModel || typeof productModel !== 'object' || Array.isArray(productModel)) throw builderError('P17_PRODUCT_MODEL_PAYLOAD_REQUIRED', 'The locked native input has no product model.');
  const productValidation = validateP17ProductModel(productModel);
  if (productModel.schemaVersion !== P17_PRODUCT_MODEL_SCHEMA_VERSION || productValidation.ok !== true) {
    throw builderError('P17_PRODUCT_MODEL_SCHEMA_INVALID', `Locked native payload failed public validateModel: ${(productValidation.errors || []).map((row) => row.code).join(', ') || 'schema version mismatch'}.`);
  }
  const core = {
    version: P17_CASE_MODEL_BUILDER_VERSION,
    caseId: [...caseIds][0],
    status: 'READY',
    payloadAbsent: false,
    artifactHashes,
    productModelHash: sha256Canonical(productModel),
    reasonCodes: [],
  };
  return deepFreeze({ ...core, productModel: strictClone(productModel, 'productModel'), buildBindingHash: sha256Canonical(core) });
}

function strictClone(value, label) {
  assertStrictJson(value, label);
  return JSON.parse(JSON.stringify(value));
}

function builderError(code, message) {
  return Object.assign(new Error(message), { code });
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sha(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
