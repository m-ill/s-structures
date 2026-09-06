import { stableHash } from '../core/stableHash.js';
import { validateModel } from '../core/validation.js';
import { modelHash } from '../core/modelHash.js';
import { inspectModelGeometry, planModelRepairs } from './repair.js';
import { applyModelChangeSet, undoModelTransaction } from './transaction.js';

export const PHASE13_MODEL_CHECK_VERSION = 'p13-m2-model-check-v1';
export const PHASE13_REPAIR_PREVIEW_VERSION = 'p13-m2-repair-preview-v1';

export function buildPhase13ModelCheck(model = {}, options = {}) {
  const detectedAtModelHash = modelHash(model);
  const validation = options.validation || validateModel(model);
  const geometry = inspectModelGeometry(model, options);
  const raw = [
    ...(validation.errors || []).map((row) => normalizeIssue(row, 'blocker', detectedAtModelHash, model)),
    ...(validation.warnings || []).map((row) => normalizeIssue(row, 'warning', detectedAtModelHash, model)),
    ...geometry.isolatedNodes.map((id) => normalizeIssue({
      code: 'ISOLATED_NODE', message: `Node ${id} is not connected to the structural model.`, target: id,
    }, 'warning', detectedAtModelHash, model)),
  ];
  const unique = new Map(raw.map((issue) => [issue.issueId, issue]));
  const waivers = new Map((options.waivers || []).map((row) => [row.issueId, row]));
  const issues = [...unique.values()].map((issue) => {
    const waiver = waivers.get(issue.issueId);
    const waiverCurrent = waiver?.modelHash === detectedAtModelHash && issue.severity === 'warning';
    return deepFreeze({
      ...issue,
      waiverStatus: waiverCurrent ? 'waived' : waiver ? 'stale' : 'none',
      waiver: waiverCurrent ? clone(waiver) : null,
    });
  }).sort(compareIssues);
  return deepFreeze({
    version: PHASE13_MODEL_CHECK_VERSION,
    modelHash: detectedAtModelHash,
    ok: issues.every((row) => row.severity !== 'blocker' || row.waiverStatus === 'waived'),
    issues,
    summary: summarize(issues),
  });
}

export function previewPhase13ModelRepair(model, issueIds = [], options = {}) {
  const before = buildPhase13ModelCheck(model, options);
  const selected = new Set(issueIds.length ? issueIds : before.issues.map((row) => row.issueId));
  const repairable = before.issues.filter((row) => selected.has(row.issueId) && row.proposedFixId === 'repair-model-geometry');
  const plan = planModelRepairs(model, options);
  const changes = repairable.length ? plan.changes : [];
  const transaction = applyModelChangeSet(model, { ...plan, changes }, { validate: options.validate });
  const after = transaction.ok ? buildPhase13ModelCheck(transaction.model, options) : null;
  return deepFreeze({
    version: PHASE13_REPAIR_PREVIEW_VERSION,
    ok: transaction.ok,
    beforeModelHash: before.modelHash,
    afterModelHash: transaction.ok ? modelHash(transaction.model) : before.modelHash,
    selectedIssueIds: [...selected],
    changes: clone(changes),
    transaction: transaction.ok ? clone(transaction.transaction) : null,
    errors: clone(transaction.errors || []),
    issueDelta: transaction.ok ? issueDelta(before.issues, after.issues) : null,
    previewModel: transaction.ok ? clone(transaction.model) : clone(model),
  });
}

export function applyPhase13RepairPreview(model, preview, options = {}) {
  if (!preview?.ok || preview.beforeModelHash !== modelHash(model)) {
    return { ok: false, changed: false, model, errors: [{ code: 'P13_REPAIR_PREVIEW_STALE' }] };
  }
  const applied = applyModelChangeSet(model, {
    id: 'p13-model-check-repair',
    name: 'Apply Model Check repair',
    changes: preview.changes,
  }, { validate: options.validate });
  if (!applied.ok) return applied;
  return {
    ...applied,
    transaction: {
      ...applied.transaction,
      beforeModel: clone(model),
      beforeModelHash: modelHash(model),
    },
  };
}

export function undoPhase13Repair(model, transaction, options = {}) {
  if (transaction?.beforeModel && transaction.beforeModelHash === modelHash(transaction.beforeModel)) {
    const validation = options.validate?.(transaction.beforeModel) || { ok: true, errors: [] };
    if (validation.ok === false) return { ok: false, changed: false, model, errors: clone(validation.errors || []) };
    return { ok: true, changed: true, model: clone(transaction.beforeModel), transaction: null, errors: [] };
  }
  return undoModelTransaction(model, transaction, { validate: options.validate });
}

export function createPhase13IssueWaiver(issue, input = {}) {
  if (issue?.severity !== 'warning') throw issueError('P13_BLOCKER_WAIVER_FORBIDDEN', 'Only warning issues can be waived.');
  if (!String(input.reason || '').trim()) throw issueError('P13_WAIVER_REASON_REQUIRED', 'A waiver reason is required.');
  return deepFreeze({
    version: 'p13-m2-issue-waiver-v1',
    issueId: issue.issueId,
    modelHash: issue.detectedAtModelHash,
    reviewer: String(input.reviewer || 'unspecified'),
    reason: String(input.reason).trim(),
    createdAt: input.createdAt || null,
  });
}

export function buildPhase13IssueCenterView(check, filters = {}) {
  const search = String(filters.search || '').trim().toLowerCase();
  const issues = (check?.issues || []).filter((row) => (
    (!filters.severity || row.severity === filters.severity)
    && (!filters.category || row.category === filters.category)
    && (!filters.storyId || row.storyId === filters.storyId)
    && (!search || `${row.code} ${row.message} ${row.objectRefs.map((item) => item.id).join(' ')}`.toLowerCase().includes(search))
  ));
  return deepFreeze({
    version: 'p13-m2-issue-center-view-v1',
    modelHash: check?.modelHash || null,
    count: issues.length,
    issues: issues.map((row) => ({
      ...clone(row),
      clickTarget: row.objectRefs[0] || (row.geometryHint ? { type: 'geometry', id: row.issueId } : null),
      actions: [row.objectRefs.length ? 'select' : null, row.geometryHint ? 'zoom' : null, row.proposedFixId ? 'preview-fix' : null]
        .filter(Boolean),
    })),
  });
}

function normalizeIssue(row = {}, severity, detectedAtModelHash, model) {
  const code = String(row.code || 'MODEL_REVIEW');
  const objectRefs = objectReferences(row, model);
  const category = categoryOf(code);
  const issueKey = { code, category, objectRefs: objectRefs.map((item) => `${item.type}:${item.id}`).sort() };
  const proposedFixId = /DUPLICATE|ZERO_LENGTH|ISOLATED_NODE/.test(code) ? 'repair-model-geometry' : null;
  return {
    issueId: `P13-${stableHash(issueKey).slice(0, 16)}`,
    code,
    severity,
    category,
    source: 's-structures-model-check',
    objectRefs,
    storyId: row.storyId || null,
    geometryHint: geometryHint(objectRefs, model),
    message: String(row.message || code),
    parameters: clone(row.details || null),
    ruleRef: `internal:${code}`,
    detectedAtModelHash,
    fixability: proposedFixId ? 'preview-required' : 'manual',
    proposedFixId,
    blockerFor: severity === 'blocker' ? ['analysis', 'report', 'design-transfer'] : [],
  };
}

function objectReferences(row, model) {
  const ids = new Set([
    row.target,
    ...(row.nodeIds || []),
    ...(row.memberIds || []),
  ].filter((value) => typeof value === 'string' && value && !['model', 'nodes', 'members'].includes(value)));
  return [...ids].map((id) => ({ type: objectType(id, model), id })).sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
}

function objectType(id, model) {
  for (const [type, collection] of [['node', 'nodes'], ['member', 'members'], ['load', 'loads'], ['story', 'stories']]) {
    if ((model[collection] || []).some((row) => row.id === id)) return type;
  }
  return 'model-object';
}

function geometryHint(refs, model) {
  const nodes = refs.filter((row) => row.type === 'node')
    .map((row) => (model.nodes || []).find((node) => node.id === row.id)).filter(Boolean);
  if (!nodes.length) return refs.length ? { objectRefs: clone(refs) } : null;
  return { points: nodes.map((node) => [Number(node.x), Number(node.y), Number(node.z || 0)]) };
}

function categoryOf(code) {
  if (/LOAD|COMBO|MASS/.test(code)) return 'load-mass';
  if (/SUPPORT|CONSTRAINT|DIAPHRAGM|MPC|MECHANISM/.test(code)) return 'constraint';
  if (/SECTION|MATERIAL|RELEASE|OFFSET|PANEL_ZONE/.test(code)) return 'property';
  if (/STORY|ELEVATION/.test(code)) return 'story';
  return 'geometry';
}

function compareIssues(left, right) {
  const rank = { blocker: 0, warning: 1 };
  return (rank[left.severity] - rank[right.severity]) || left.category.localeCompare(right.category) || left.issueId.localeCompare(right.issueId);
}

function summarize(issues) {
  return {
    total: issues.length,
    blockers: issues.filter((row) => row.severity === 'blocker').length,
    warnings: issues.filter((row) => row.severity === 'warning').length,
    waived: issues.filter((row) => row.waiverStatus === 'waived').length,
    repairable: issues.filter((row) => row.proposedFixId).length,
  };
}

function issueDelta(before, after) {
  const a = new Set(before.map((row) => row.issueId));
  const b = new Set(after.map((row) => row.issueId));
  return { resolved: [...a].filter((id) => !b.has(id)), added: [...b].filter((id) => !a.has(id)), remaining: [...a].filter((id) => b.has(id)) };
}

function issueError(code, message) { return Object.assign(new Error(message), { code }); }
function clone(value) { return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
