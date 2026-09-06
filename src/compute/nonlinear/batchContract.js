import { stableHash } from '../../core/stableHash.js';

export const NONLINEAR_BATCH_CONTRACT_VERSION = 'p9-m7-nonlinear-soa-batch-v1';
export const NONLINEAR_BATCH_HASH_SAMPLE_LIMIT = 64;

export function createNonlinearElementBatch(entries = [], options = {}) {
  if (!Array.isArray(entries)) throw batchError('NONLINEAR_BATCH_ENTRIES_INVALID', 'Element entries must be an array.');
  const normalized = entries.map(normalizeEntry);
  const elementIds = Object.freeze(normalized.map((entry) => entry.id));
  const elementTypes = Object.freeze(normalized.map((entry) => String(entry.kernel.type || 'unknown')));
  const stateVersions = Object.freeze(normalized.map((entry) => String(entry.kernel.stateVersion || 'unknown')));
  const matrixClasses = Object.freeze(normalized.map((entry) => entry.requiredMatrixClass === 'general' ? 'general' : 'spd'));
  const typeNames = Object.freeze([...new Set(elementTypes)].sort());
  const typeCodeByName = new Map(typeNames.map((name, index) => [name, index]));
  const typeCodes = Int32Array.from(elementTypes, (name) => typeCodeByName.get(name));
  const dofOffsets = prefixOffsets(normalized.map((entry) => entry.dofs.length));
  const matrixOffsets = prefixOffsets(normalized.map((entry) => entry.dofs.length ** 2));
  const dofIndices = new Int32Array(dofOffsets[dofOffsets.length - 1]);
  normalized.forEach((entry, index) => dofIndices.set(entry.dofs, dofOffsets[index]));

  const propertyKeys = Object.freeze(normalized.map((entry) => propertyKey(entry)));
  const groupMap = new Map();
  normalized.forEach((entry, index) => {
    const key = `${elementTypes[index]}\u0000${stateVersions[index]}\u0000${matrixClasses[index]}\u0000${propertyKeys[index]}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(index);
  });
  const groups = Object.freeze([...groupMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, indices], groupIndex) => Object.freeze({
      groupIndex,
      key,
      type: elementTypes[indices[0]],
      stateVersion: stateVersions[indices[0]],
      matrixClass: matrixClasses[indices[0]],
      propertyKey: propertyKeys[indices[0]],
      elementIndices: Int32Array.from(indices),
    })));
  const groupCodes = new Int32Array(normalized.length);
  groups.forEach((group) => group.elementIndices.forEach((index) => { groupCodes[index] = group.groupIndex; }));
  const evaluationOrder = Int32Array.from(groups.flatMap((group) => Array.from(group.elementIndices)));
  const owner = clean(options.owner) || 'nonlinear-equilibrium-assembler';
  const boundedIdentity = batchIdentity({
    owner, elementCount: normalized.length, elementIds, elementTypes, stateVersions,
    matrixClasses, propertyKeys, dofOffsets, dofIndices, matrixOffsets, groups,
  });
  const batchHash = stableHash(boundedIdentity);

  return Object.freeze({
    version: NONLINEAR_BATCH_CONTRACT_VERSION,
    owner,
    adapterExpiry: clean(options.adapterExpiry) || 'P9-M10',
    precision: 'f64',
    layout: 'soa',
    elementCount: normalized.length,
    entries: Object.freeze(normalized),
    elementIds,
    elementTypes,
    stateVersions,
    matrixClasses,
    typeNames,
    typeCodes,
    groupCodes,
    propertyKeys,
    dofOffsets,
    dofIndices,
    matrixOffsets,
    groups,
    evaluationOrder,
    totalElementDofs: dofIndices.length,
    totalMatrixValues: matrixOffsets[matrixOffsets.length - 1],
    hashPolicy: Object.freeze({ algorithm: 'sha256', bounded: true, sampleLimit: NONLINEAR_BATCH_HASH_SAMPLE_LIMIT }),
    batchHash,
  });
}

export function validateNonlinearElementBatch(batch = {}) {
  const errors = [];
  if (batch.version !== NONLINEAR_BATCH_CONTRACT_VERSION || batch.layout !== 'soa' || batch.precision !== 'f64') errors.push('batch:version');
  if (!Number.isInteger(batch.elementCount) || batch.elementCount < 0) errors.push('batch:element-count');
  if (!(batch.dofOffsets instanceof Int32Array) || batch.dofOffsets.length !== batch.elementCount + 1) errors.push('batch:dof-offsets');
  if (!(batch.matrixOffsets instanceof Int32Array) || batch.matrixOffsets.length !== batch.elementCount + 1) errors.push('batch:matrix-offsets');
  if (!(batch.dofIndices instanceof Int32Array) || batch.dofIndices.length !== batch.totalElementDofs) errors.push('batch:dof-indices');
  if (!(batch.typeCodes instanceof Int32Array) || batch.typeCodes.length !== batch.elementCount) errors.push('batch:type-codes');
  if (!(batch.groupCodes instanceof Int32Array) || batch.groupCodes.length !== batch.elementCount) errors.push('batch:group-codes');
  if (!(batch.evaluationOrder instanceof Int32Array) || batch.evaluationOrder.length !== batch.elementCount) errors.push('batch:evaluation-order');
  if (typeof batch.batchHash !== 'string' || !/^[a-f0-9]{64}$/.test(batch.batchHash)) errors.push('batch:hash');
  else if (batch.batchHash !== stableHash(batchIdentity(batch))) errors.push('batch:integrity');
  return Object.freeze({ ok: errors.length === 0, errors });
}

export function boundedBatchValueHash(value, options = {}) {
  const limit = positiveInteger(options.limit, NONLINEAR_BATCH_HASH_SAMPLE_LIMIT);
  return stableHash(boundedValue(value, { remaining: limit, depth: 0, maxDepth: 6 }));
}

function normalizeEntry(entry, index) {
  const id = clean(entry?.id || entry?.descriptor?.id || `element-${index + 1}`);
  const dofs = Int32Array.from(entry?.dofs || entry?.descriptor?.fullDofs || []);
  if (!id || !dofs.length || typeof entry?.kernel?.evaluate !== 'function') {
    throw batchError('NONLINEAR_BATCH_ENTRY_INVALID', `Element entry ${id || index} requires an ID, DOFs, and kernel.`);
  }
  if ([...dofs].some((dof) => !Number.isInteger(dof) || dof < 0)) {
    throw batchError('NONLINEAR_BATCH_DOF_INVALID', `Element entry ${id} contains an invalid DOF.`);
  }
  return Object.freeze({ ...entry, id, dofs });
}

function propertyKey(entry) {
  const descriptor = entry.descriptor || entry.element || {};
  return stableHash({
    behavior: descriptor.behavior || null,
    material: boundedValue(descriptor.material || descriptor.materialId || null, { remaining: 32, depth: 0, maxDepth: 4 }),
    section: boundedValue(descriptor.section || descriptor.sectionId || null, { remaining: 48, depth: 0, maxDepth: 4 }),
    nonlinearFormulation: descriptor.nonlinear?.formulation || null,
    releases: boundedValue(descriptor.releases || null, { remaining: 24, depth: 0, maxDepth: 4 }),
    hingeIds: boundedSample((entry.hingeAssignments || []).map((item) => item.id || item.hingeId || item.type || null)),
    fiberSectionId: entry.fiberSection?.id || entry.fiberSection?.version || null,
  }).slice(0, 24);
}

function batchIdentity(batch) {
  return {
    version: NONLINEAR_BATCH_CONTRACT_VERSION,
    owner: batch.owner,
    elementCount: batch.elementCount,
    elementIds: boundedSample(batch.elementIds),
    elementTypes: boundedSample(batch.elementTypes),
    stateVersions: boundedSample(batch.stateVersions),
    matrixClasses: boundedSample(batch.matrixClasses),
    propertyKeys: boundedSample(batch.propertyKeys),
    dofOffsets: boundedNumericSample(batch.dofOffsets),
    dofIndices: boundedNumericSample(batch.dofIndices),
    matrixOffsets: boundedNumericSample(batch.matrixOffsets),
    groups: Array.from(batch.groups || [], (group) => ({ key: group.key, count: group.elementIndices.length })),
  };
}

function prefixOffsets(lengths) {
  const offsets = new Int32Array(lengths.length + 1);
  for (let index = 0; index < lengths.length; index += 1) {
    const length = Number(lengths[index]);
    if (!Number.isInteger(length) || length < 0 || offsets[index] + length > 0x7fffffff) {
      throw batchError('NONLINEAR_BATCH_LAYOUT_TOO_LARGE', 'Batch layout exceeds Int32 indexing capacity.');
    }
    offsets[index + 1] = offsets[index] + length;
  }
  return offsets;
}

function boundedNumericSample(values) {
  return { length: values.length, sample: boundedSample(Array.from(values)) };
}

function boundedSample(values) {
  const list = Array.from(values || []);
  if (list.length <= NONLINEAR_BATCH_HASH_SAMPLE_LIMIT) return list;
  const half = NONLINEAR_BATCH_HASH_SAMPLE_LIMIT / 2;
  return [...list.slice(0, half), ...list.slice(-half), { omitted: list.length - NONLINEAR_BATCH_HASH_SAMPLE_LIMIT }];
}

function boundedValue(value, budget) {
  if (budget.remaining <= 0) return '[bounded]';
  budget.remaining -= 1;
  if (value == null || typeof value !== 'object') return value;
  if (budget.depth >= budget.maxDepth) return '[max-depth]';
  budget.depth += 1;
  if (ArrayBuffer.isView(value) || Array.isArray(value)) {
    const list = boundedSample(Array.from(value));
    const output = list.map((item) => boundedValue(item, budget));
    budget.depth -= 1;
    return output;
  }
  const output = {};
  const keys = Object.keys(value).sort();
  const sampledKeys = keys.length <= 16 ? keys : [...keys.slice(0, 8), ...keys.slice(-8)];
  for (const key of sampledKeys) {
    if (budget.remaining <= 0) break;
    output[key] = boundedValue(value[key], budget);
  }
  if (keys.length > sampledKeys.length) output['[omitted-keys]'] = keys.length - sampledKeys.length;
  budget.depth -= 1;
  return output;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function clean(value) { return value == null ? '' : String(value).trim(); }
function batchError(code, message) { return Object.assign(new TypeError(message), { code }); }
