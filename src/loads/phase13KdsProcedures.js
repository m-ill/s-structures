import { stableHash } from '../core/stableHash.js';
import { previewLoadCombinationChangeSet } from './loadCombinationChangeSet.js';
import { deriveWindStoryTransfers } from './slabLoadGeneration.js';

export const PHASE13_KDS_PROCEDURE_VERSION = 'p13-m4-kds-procedure-v1';

export function createPhase13KdsSourceSnapshot(input = {}) {
  const snapshot = {
    version: 'p13-m4-kds-source-snapshot-v1',
    packId: text(input.packId || input.sourceId), sourceId: text(input.sourceId), authority: text(input.authority), code: text(input.code), edition: text(input.edition),
    effectiveDate: text(input.effectiveDate), sourceLocator: text(input.sourceLocator), sourceHash: text(input.sourceHash).toLowerCase(),
    amendmentIds: [...new Set((input.amendmentIds || []).map(text).filter(Boolean))].sort(),
    clauseMap: clone(input.clauseMap || {}), formulaVersion: text(input.formulaVersion), fixtureHash: text(input.fixtureHash).toLowerCase(),
    applicability: clone(input.applicability || {}), exclusions: clone(input.exclusions || []), supersedes: text(input.supersedes), supersededBy: text(input.supersededBy),
    reviewer: text(input.reviewer), approvedAt: text(input.approvedAt), reviewStatus: text(input.reviewStatus || 'candidate'), branchCoverageApproved: input.branchCoverageApproved === true,
  };
  const errors = [];
  for (const field of ['packId', 'sourceId', 'authority', 'code', 'edition', 'effectiveDate', 'sourceLocator', 'formulaVersion', 'reviewer', 'approvedAt']) if (!snapshot[field]) errors.push(`KDS_SOURCE_${field.toUpperCase()}_REQUIRED`);
  if (!/^[0-9a-f]{64}$/.test(snapshot.sourceHash)) errors.push('KDS_SOURCE_HASH_REQUIRED');
  if (!/^[0-9a-f]{64}$/.test(snapshot.fixtureHash)) errors.push('KDS_FIXTURE_HASH_REQUIRED');
  if (!Object.keys(snapshot.clauseMap).length) errors.push('KDS_SOURCE_CLAUSE_MAP_REQUIRED');
  if (!snapshot.branchCoverageApproved) errors.push('KDS_BRANCH_COVERAGE_APPROVAL_REQUIRED');
  if (snapshot.reviewStatus !== 'approved') errors.push('KDS_SOURCE_REVIEW_APPROVAL_REQUIRED');
  if (snapshot.supersededBy) errors.push('KDS_SOURCE_SUPERSEDED');
  const core = { ...snapshot, status: errors.length ? 'blocked' : 'approved', errors };
  return deepFreeze({ ...core, snapshotHash: stableHash(core).slice(0, 24) });
}

export function executePhase13KdsProcedure(input = {}) {
  const source = input.source?.version ? input.source : createPhase13KdsSourceSnapshot(input.source || {});
  const procedureId = text(input.procedureId);
  const blockers = [...(source.errors || [])];
  if (!['load-combinations', 'wind-story-transfer', 'seismic-story-distribution', 'snow-project-input'].includes(procedureId)) blockers.push('KDS_PROCEDURE_UNSUPPORTED');
  if (procedureId && !source.clauseMap?.[procedureId]) blockers.push('KDS_PROCEDURE_CLAUSE_REQUIRED');
  if (blockers.length) return blocked(procedureId, source, blockers);
  let output;
  if (procedureId === 'load-combinations') {
    output = previewLoadCombinationChangeSet(input.model || {}, input.rulePack || {}, input.options || {});
    if (!output.guard?.applyAllowed) blockers.push(...(output.guard?.applyBlockers || ['KDS_RULE_PACK_APPLY_BLOCKED']));
  } else if (procedureId === 'wind-story-transfer') {
    if (!Number.isFinite(Number(input.parameters?.pressure))) blockers.push('KDS_WIND_PRESSURE_REQUIRED');
    else output = deriveWindStoryTransfers(input.model || {}, input.parameters || {});
  } else if (procedureId === 'seismic-story-distribution') {
    output = seismicDistribution(input.model || {}, input.parameters || {}, blockers);
  } else {
    output = snowProjectInput(input.model || {}, input.parameters || {}, blockers);
  }
  if (blockers.length) return blocked(procedureId, source, [...new Set(blockers)], output);
  const core = {
    version: PHASE13_KDS_PROCEDURE_VERSION, procedureId, status: 'review-ready', sourceSnapshot: clone(source),
    inputHash: stableHash({ model: input.model || {}, parameters: input.parameters || {}, options: input.options || {} }).slice(0, 24),
    output: clone(output), trace: buildProcedureTrace(procedureId, source, input.parameters || {}, output),
    approvalStatus: 'unapproved', engineerReviewRequired: true, automaticDesignApproval: false, designTransferAllowed: false,
  };
  return deepFreeze({ ...core, traceHash: stableHash(core).slice(0, 24) });
}

export function createPhase13KdsApproval(procedure, input = {}) {
  const errors = [];
  if (procedure?.status !== 'review-ready') errors.push('KDS_APPROVAL_PROCEDURE_NOT_READY');
  const reviewer = text(input.reviewer); const memo = text(input.memo); const approvedAt = text(input.approvedAt);
  const projectId = text(input.projectId); const revisionId = text(input.revisionId);
  for (const [field, value] of Object.entries({ reviewer, memo, approvedAt, projectId, revisionId })) if (!value) errors.push(`KDS_APPROVAL_${field.toUpperCase()}_REQUIRED`);
  const core = {
    version: 'p13-m4-kds-project-approval-v1', status: errors.length ? 'blocked' : 'approved', errors,
    procedureId: procedure?.procedureId || null, traceHash: procedure?.traceHash || null,
    sourceSnapshotHash: procedure?.sourceSnapshot?.snapshotHash || null, reviewer, memo, approvedAt, projectId, revisionId,
  };
  return deepFreeze({ ...core, approvalHash: stableHash(core).slice(0, 24) });
}

export function evaluatePhase13KdsApproval(procedure, approval, context = {}) {
  const blockers = [];
  if (approval?.status !== 'approved') blockers.push('KDS_PROJECT_APPROVAL_REQUIRED');
  if (approval?.traceHash !== procedure?.traceHash) blockers.push('KDS_APPROVAL_TRACE_STALE');
  if (approval?.sourceSnapshotHash !== procedure?.sourceSnapshot?.snapshotHash) blockers.push('KDS_APPROVAL_SOURCE_STALE');
  if (context.projectId && approval?.projectId !== String(context.projectId)) blockers.push('KDS_APPROVAL_PROJECT_MISMATCH');
  if (context.revisionId && approval?.revisionId !== String(context.revisionId)) blockers.push('KDS_APPROVAL_REVISION_STALE');
  return deepFreeze({ status: blockers.length ? 'blocked' : 'approved', blockers, designTransferAllowed: blockers.length === 0 });
}

function buildProcedureTrace(procedureId, source, parameters, output) {
  const formula = procedureId === 'seismic-story-distribution' ? 'V*wi*hi/sum(wi*hi)'
    : procedureId === 'snow-project-input' ? 'pressure*area'
      : procedureId === 'wind-story-transfer' ? 'pressure*tributary-area' : 'rule-pack-factor-matrix';
  return { procedureId, clause: clone(source.clauseMap?.[procedureId]), formulaVersion: source.formulaVersion, formula, units: clone(parameters.units || null), inputs: clone(parameters), intermediate: clone(output), roundingUsedForSolverInput: false };
}

function seismicDistribution(model, parameters, blockers) {
  const baseShear = Number(parameters.baseShear);
  if (!Number.isFinite(baseShear) || baseShear <= 0) { blockers.push('KDS_SEISMIC_BASE_SHEAR_REQUIRED'); return null; }
  const stories = model.stories || [];
  const rows = stories.map((story) => ({ storyId: story.id, height: Number(story.z ?? story.elevation), weight: Number(story.seismicWeight ?? story.weight) }));
  if (!rows.length || rows.some((row) => !Number.isFinite(row.height) || !Number.isFinite(row.weight) || row.height < 0 || row.weight <= 0)) { blockers.push('KDS_SEISMIC_STORY_INPUT_INVALID'); return null; }
  const sumWh = rows.reduce((sum, row) => sum + row.weight * row.height, 0);
  if (!(sumWh > 0)) { blockers.push('KDS_SEISMIC_SUM_WH_INVALID'); return null; }
  return { baseShear, sumWh, rows: rows.map((row) => ({ ...row, force: baseShear * row.weight * row.height / sumWh, formula: 'V*wi*hi/sum(wi*hi)' })) };
}

function snowProjectInput(model, parameters, blockers) {
  const pressure = Number(parameters.pressure); const area = Number(parameters.area);
  if (!(pressure >= 0) || !(area > 0)) { blockers.push('KDS_SNOW_PROJECT_INPUT_REQUIRED'); return null; }
  return { pressure, area, totalLoad: pressure * area, caseId: text(parameters.caseId) || 'S', source: 'project-approved-input', generatedAutomaticallyFromCodeMap: false };
}
function blocked(procedureId, source, blockers, output = null) { return deepFreeze({ version: PHASE13_KDS_PROCEDURE_VERSION, procedureId, status: 'blocked', sourceSnapshot: clone(source), blockers, output: clone(output), approvalStatus: 'unapproved', engineerReviewRequired: true, automaticDesignApproval: false, designTransferAllowed: false }); }
function text(value) { return String(value || '').trim(); }
function clone(value) { return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
