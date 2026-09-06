import {
  gridStoryChangeSet,
  planCopyStory,
  planGridStoryModel,
} from '../modeling/gridStory.js';
import {
  inspectModelGeometry,
  planModelRepairs,
} from '../modeling/repair.js';
import {
  selectMembersByFilter,
  selectNodesByFilter,
} from '../modeling/selection.js';
import {
  applyModelChangeSet,
  validateChangeSet,
} from '../modeling/transaction.js';
import { validatePhase7LibraryReferences } from './phase7LibraryWorkflow.js';

export const PHASE7_MODELING_WORKFLOW_VERSION = 'p7-m3-native-modeling-workflow-v1';

export function previewPhase7GridStory(model = {}, input = {}, options = {}) {
  const assignmentErrors = explicitRoleAssignmentErrors(input);
  const plan = planGridStoryModel(input);
  if (!plan.ok || assignmentErrors.length) {
    return failedPreview(model, [...assignmentErrors, ...(plan.errors || [])], { plan });
  }
  const references = validatePhase7LibraryReferences({ ...model, members: plan.members });
  if (!references.ok) {
    return failedPreview(model, references.errors, { plan, references, warnings: references.warnings });
  }
  const changeSet = gridStoryChangeSet(model, plan, options);
  const transactionValidation = validateChangeSet(model, changeSet.changes);
  if (!transactionValidation.ok) {
    return failedPreview(model, transactionValidation.errors, { plan, changeSet, references, warnings: references.warnings });
  }
  return {
    version: PHASE7_MODELING_WORKFLOW_VERSION,
    ok: true,
    changed: false,
    model,
    plan,
    changeSet,
    preview: changeSet.preview,
    references,
    warnings: references.warnings,
    errors: [],
  };
}

export function applyPhase7GridStory(model = {}, inputOrPreview = {}, options = {}) {
  const preview = inputOrPreview?.changeSet?.changes
    ? inputOrPreview
    : previewPhase7GridStory(model, inputOrPreview, options);
  if (!preview.ok) return { ...preview, changed: false, model };
  const result = applyModelChangeSet(model, preview.changeSet, options);
  return { ...result, preview, warnings: preview.warnings || [] };
}

export function previewPhase7CopyStory(model = {}, options = {}) {
  const changeSet = planCopyStory(model, options);
  if (!changeSet.ok) return failedPreview(model, changeSet.errors, { changeSet });
  const transactionValidation = validateChangeSet(model, changeSet.changes);
  if (!transactionValidation.ok) return failedPreview(model, transactionValidation.errors, { changeSet });
  const simulated = applyModelChangeSet(model, changeSet);
  const addedIds = new Set(changeSet.changes
    .filter((change) => change.collection === 'members' && change.op === 'add')
    .map((change) => change.id));
  const addedMembers = (simulated.model?.members || []).filter((member) => addedIds.has(member.id));
  const references = validatePhase7LibraryReferences({ ...simulated.model, members: addedMembers });
  if (!references.ok) return failedPreview(model, references.errors, { changeSet, references, warnings: references.warnings });
  return {
    version: PHASE7_MODELING_WORKFLOW_VERSION,
    ok: true,
    changed: false,
    model,
    changeSet,
    preview: changeSet.preview,
    references,
    warnings: references.warnings,
    errors: [],
  };
}

export function applyPhase7CopyStory(model = {}, inputOrPreview = {}, options = {}) {
  const preview = inputOrPreview?.changeSet?.changes
    ? inputOrPreview
    : previewPhase7CopyStory(model, inputOrPreview);
  if (!preview.ok) return { ...preview, changed: false, model };
  const result = applyModelChangeSet(model, preview.changeSet, options);
  return { ...result, preview, warnings: preview.warnings || [] };
}

export function selectPhase7ModelEntities(model = {}, options = {}) {
  const type = String(options.type || options.entityType || 'member').toLowerCase();
  const { type: _type, entityType: _entityType, ...filterOptions } = options;
  const filter = options.filter || filterOptions;
  const rows = type === 'node'
    ? selectNodesByFilter(model, filter)
    : selectMembersByFilter(model, filter);
  return {
    version: PHASE7_MODELING_WORKFLOW_VERSION,
    ok: true,
    changed: false,
    type: type === 'node' ? 'node' : 'member',
    count: rows.length,
    ids: rows.map((row) => row.id),
    items: clone(rows),
  };
}

export function previewPhase7ModelRepairs(model = {}, options = {}) {
  const inspection = inspectModelGeometry(model, options);
  const changeSet = planModelRepairs(model, options);
  const validation = validateChangeSet(model, changeSet.changes);
  return {
    version: PHASE7_MODELING_WORKFLOW_VERSION,
    ok: validation.ok,
    changed: false,
    model,
    inspection,
    changeSet,
    preview: changeSet.changes.reduce((summary, change) => {
      const key = `${change.collection}.${change.op}`;
      summary[key] = (summary[key] || 0) + 1;
      return summary;
    }, {}),
    errors: validation.errors,
    warnings: [],
  };
}

export function applyPhase7ModelRepairs(model = {}, inputOrOptions = {}, options = {}) {
  const preview = inputOrOptions?.changeSet?.changes
    ? inputOrOptions
    : previewPhase7ModelRepairs(model, inputOrOptions);
  if (!preview.ok) return { ...preview, changed: false, model };
  const result = applyModelChangeSet(model, preview.changeSet, options);
  return { ...result, preview };
}

function explicitRoleAssignmentErrors(input) {
  const errors = [];
  for (const role of ['column', 'beam']) {
    const defaults = input.roleDefaults?.[role];
    if (!defaults?.matId) errors.push(`roleDefaults.${role}.matId:required`);
    if (!defaults?.secId) errors.push(`roleDefaults.${role}.secId:required`);
  }
  return errors;
}

function failedPreview(model, errors = [], context = {}) {
  return {
    version: PHASE7_MODELING_WORKFLOW_VERSION,
    ok: false,
    changed: false,
    model,
    errors: (errors || []).map(normalizeError),
    warnings: context.warnings || [],
    ...context,
  };
}

function normalizeError(error) {
  if (typeof error === 'string') return error;
  if (error?.code) return error;
  return { code: 'PHASE7_MODELING_PREVIEW_FAILED', detail: clone(error) };
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
