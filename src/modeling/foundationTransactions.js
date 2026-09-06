import { createWinklerLineFoundationProperty } from '../core/foundationSchema.js';
import { validateModel } from '../core/validation.js';
import { applyModelChangeSet } from './transaction.js';

export const FOUNDATION_TRANSACTION_VERSION = 'p14-m1-foundation-transaction-v1';

export function upsertFoundationPropertyTransaction(model = {}, input = {}, options = {}) {
  const property = createWinklerLineFoundationProperty(input.property || input);
  const exists = (model.foundationProperties || []).some((row) => row.id === property.id);
  return execute(model, {
    id: options.transactionId || `foundation-property:${property.id}`,
    name: `${exists ? 'Update' : 'Create'} foundation property ${property.id}`,
    changes: [{ op: exists ? 'replace' : 'add', collection: 'foundationProperties', id: property.id, value: property }],
  }, options);
}

export function assignFoundationTransaction(model = {}, input = {}, options = {}) {
  const foundationId = clean(input.foundationId || input.propertyId);
  if (!foundationId || !(model.foundationProperties || []).some((row) => row.id === foundationId)) {
    return failed('FOUNDATION_PROPERTY_REFERENCE_MISSING');
  }
  const memberIds = ids(input.memberIds || input.memberId);
  if (!memberIds.length) return failed('FOUNDATION_MEMBER_SELECTION_REQUIRED');
  const changes = [];
  for (const memberId of memberIds) {
    const member = (model.members || []).find((row) => String(row.id) === memberId);
    if (!member) return failed('FOUNDATION_MEMBER_REFERENCE_MISSING', { memberId });
    if ((member.behavior || member.type || 'frame') !== 'frame') return failed('FOUNDATION_MEMBER_BEHAVIOR_UNSUPPORTED', { memberId });
    changes.push({ op: 'update', collection: 'members', id: member.id, patch: { foundationId } });
  }
  return execute(model, {
    id: options.transactionId || `foundation-assign:${foundationId}`,
    name: `Assign foundation ${foundationId}`,
    changes,
  }, options);
}

export function removeFoundationTransaction(model = {}, input = {}, options = {}) {
  const memberIds = ids(input.memberIds || input.memberId);
  if (!memberIds.length) return failed('FOUNDATION_MEMBER_SELECTION_REQUIRED');
  const changes = [];
  for (const memberId of memberIds) {
    const member = (model.members || []).find((row) => String(row.id) === memberId);
    if (!member) return failed('FOUNDATION_MEMBER_REFERENCE_MISSING', { memberId });
    const value = { ...member };
    delete value.foundationId;
    changes.push({ op: 'replace', collection: 'members', id: member.id, value });
  }
  return execute(model, {
    id: options.transactionId || 'foundation-remove',
    name: 'Remove member foundation assignment',
    changes,
  }, options);
}

export function deleteFoundationPropertyTransaction(model = {}, input = {}, options = {}) {
  const foundationId = clean(input.foundationId || input.id);
  if (!foundationId) return failed('FOUNDATION_PROPERTY_REFERENCE_MISSING');
  const assigned = (model.members || []).filter((member) => member.foundationId === foundationId);
  if (assigned.length && input.force !== true) return failed('FOUNDATION_PROPERTY_IN_USE', { memberIds: assigned.map((row) => row.id) });
  const changes = assigned.map((member) => {
    const value = { ...member };
    delete value.foundationId;
    return { op: 'replace', collection: 'members', id: member.id, value };
  });
  changes.push({ op: 'remove', collection: 'foundationProperties', id: foundationId });
  return execute(model, {
    id: options.transactionId || `foundation-delete:${foundationId}`,
    name: `Delete foundation property ${foundationId}`,
    changes,
  }, options);
}

function execute(model, changeSet, options) {
  const result = applyModelChangeSet(model, changeSet, { validate: options.validate || validateModel });
  return { ...result, version: FOUNDATION_TRANSACTION_VERSION };
}
function failed(code, details = {}) { return { version: FOUNDATION_TRANSACTION_VERSION, ok: false, changed: false, errors: [{ code, ...details }] }; }
function ids(value) { return [...new Set((Array.isArray(value) ? value : value == null ? [] : [value]).map(String).map((row) => row.trim()).filter(Boolean))]; }
function clean(value) { return value == null ? null : String(value).trim() || null; }
