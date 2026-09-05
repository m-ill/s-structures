export const MODEL_TRANSACTION_VERSION = 'p8-m4-model-transaction-v2';

const COLLECTIONS = new Set([
  'nodes', 'members', 'links', 'loads', 'stories', 'diaphragms', 'materials', 'sections',
  'loadCases', 'loadCombinations', 'analysisCases', 'massSources', 'sourceRegistry',
  'shells', 'slabs', 'slabPanels', 'nonlinearMaterials', 'nonlinearSections', 'hingeProperties',
  'linkProperties', 'timeHistoryFunctions', 'analysisStates',
  'foundationProperties',
]);

export function applyModelChangeSet(model, changeSet = {}, options = {}) {
  const changes = Array.isArray(changeSet) ? changeSet : changeSet.changes || [];
  const validation = validateChangeSet(model, changes);
  if (!validation.ok) return { ok: false, errors: validation.errors, model, changed: false };

  const next = clone(model);
  const inverse = [];
  for (const change of changes) applyChange(next, change, inverse);
  inverse.reverse();

  const domainValidation = typeof options.validate === 'function' ? options.validate(next) : { ok: true, errors: [] };
  if (domainValidation?.ok === false) {
    return {
      ok: false,
      errors: (domainValidation.errors || []).map((item) => normalizeError(item, 'MODEL_TRANSACTION_VALIDATION_FAILED')),
      model,
      changed: false,
    };
  }

  return {
    ok: true,
    changed: changes.length > 0,
    model: next,
    transaction: {
      version: MODEL_TRANSACTION_VERSION,
      id: changeSet.id || null,
      name: changeSet.name || 'Model change',
      changes: clone(changes),
      inverse,
      summary: summarizeChanges(changes),
    },
    errors: [],
  };
}

export function undoModelTransaction(model, transaction, options = {}) {
  return applyModelChangeSet(model, {
    id: transaction?.id ? `${transaction.id}:undo` : null,
    name: `Undo ${transaction?.name || 'model change'}`,
    changes: transaction?.inverse || [],
  }, options);
}

export function commitModelTransaction(target, result) {
  if (!result?.ok || !result.model || result.model === target) return false;
  const previous = clone(target);
  const next = clone(result.model);
  try {
    replaceObject(target, next);
    return true;
  } catch (error) {
    replaceObject(target, previous);
    throw error;
  }
}

export function validateChangeSet(model, changes = []) {
  const errors = [];
  const simulated = new Map();
  const rows = (collection) => {
    if (!simulated.has(collection)) {
      const map = new Map();
      for (const item of model?.[collection] || []) {
        const itemId = String(item?.id || '').trim();
        if (!itemId) errors.push(error('EXISTING_MISSING_ID', -1, collection));
        else if (map.has(itemId)) errors.push(error('EXISTING_DUPLICATE_ID', -1, `${collection}:${itemId}`));
        else map.set(itemId, item);
      }
      simulated.set(collection, map);
    }
    return simulated.get(collection);
  };

  if (!Array.isArray(changes)) return { ok: false, errors: [error('BAD_CHANGES', -1, 'changes')] };

  changes.forEach((change, index) => {
    const collection = change?.collection;
    const operation = change?.op;
    const explicitId = String(change?.id || '').trim();
    const valueId = String(change?.value?.id || change?.patch?.id || '').trim();
    const id = explicitId || valueId;
    if (!COLLECTIONS.has(collection)) {
      errors.push(error('BAD_COLLECTION', index, collection));
      return;
    }
    if (!['add', 'update', 'remove', 'replace'].includes(operation)) {
      errors.push(error('BAD_OPERATION', index, operation));
      return;
    }
    if (!id) {
      errors.push(error('MISSING_ID', index, collection));
      return;
    }
    if (explicitId && valueId && explicitId !== valueId) {
      errors.push(error('ID_MISMATCH', index, `${explicitId}:${valueId}`));
      return;
    }
    if (['add', 'replace'].includes(operation) && (!change.value || typeof change.value !== 'object' || Array.isArray(change.value))) {
      errors.push(error('MISSING_VALUE', index, `${collection}:${id}`));
      return;
    }
    const map = rows(collection);
    if (operation === 'add') {
      if (map.has(id)) errors.push(error('DUPLICATE_ID', index, `${collection}:${id}`));
      else map.set(id, { ...change.value, id });
    } else if (!map.has(id)) {
      errors.push(error('MISSING_TARGET', index, `${collection}:${id}`));
    } else if (operation === 'remove') map.delete(id);
    else if (operation === 'replace') map.set(id, { ...change.value, id });
    else map.set(id, { ...map.get(id), ...(change.patch || change.value || {}), id });
  });
  return { ok: errors.length === 0, errors };
}

function applyChange(model, change, inverse) {
  model[change.collection] ||= [];
  const rows = model[change.collection];
  const id = String(change.id || change.value?.id);
  const index = rows.findIndex((item) => item.id === id);
  if (change.op === 'add') {
    rows.push({ ...clone(change.value), id });
    inverse.push({ op: 'remove', collection: change.collection, id });
  } else if (change.op === 'remove') {
    const [removed] = rows.splice(index, 1);
    inverse.push({ op: 'add', collection: change.collection, id, value: clone(removed) });
  } else if (change.op === 'replace') {
    const previous = clone(rows[index]);
    rows[index] = { ...clone(change.value), id };
    inverse.push({ op: 'replace', collection: change.collection, id, value: previous });
  } else {
    const previous = clone(rows[index]);
    rows[index] = { ...rows[index], ...clone(change.patch || change.value || {}), id };
    inverse.push({ op: 'replace', collection: change.collection, id, value: previous });
  }
}

function summarizeChanges(changes) {
  return changes.reduce((out, change) => {
    const key = `${change.collection}.${change.op}`;
    out[key] = (out[key] || 0) + 1;
    return out;
  }, {});
}

function error(code, index, target) {
  return { code, index, target };
}

function normalizeError(item, fallback) {
  if (typeof item === 'string') return { code: fallback, message: item };
  return item?.code ? item : { code: fallback, ...(item || {}) };
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function replaceObject(target, value) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, value);
}
