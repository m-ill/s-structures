import { stableHash } from '../core/stableHash.js';

export const PHASE13_MGT_IMPORT_VERSION = 'p13-m7-mgt-subset-v2';
const SUPPORTED = new Set(['NODE', 'ELEMENT', 'CONSTRAINT', 'MATERIAL', 'SECTION', 'LOADCASE', 'CONLOAD']);
const DEFAULT_LIMITS = Object.freeze({ maxBytes: 5_000_000, maxLines: 100_000, maxColumns: 64, maxCellLength: 4_096 });

export function importPhase13MgtSubset(text = '', options = {}) {
  const sourceText = String(text);
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  const model = { nodes: [], members: [], materials: [], sections: [], loadCases: [], loads: [] };
  const audit = [];
  const unsupported = [];
  const security = { externalApplicationExecuted: false, subprocessExecuted: false, macroExecuted: false, formulaExecuted: false, pathAccessed: false };
  const source = {
    parserVersion: PHASE13_MGT_IMPORT_VERSION,
    sourceHash: stableHash(sourceText),
    encoding: String(options.encoding || 'utf-8'),
    unitSystem: String(options.unitSystem || 'source-declared-or-review-required'),
    byteLength: new TextEncoder().encode(sourceText).length,
  };
  if (source.byteLength > limits.maxBytes) return blockedResult(model, source, security, [{ code: 'MGT_RESOURCE_BYTES_EXCEEDED' }]);
  const lines = sourceText.split(/\r?\n/);
  if (lines.length > limits.maxLines) return blockedResult(model, source, security, [{ code: 'MGT_RESOURCE_LINES_EXCEEDED' }]);
  let section = null;
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith(';')) return;
    if (line.length > limits.maxCellLength * limits.maxColumns) { audit.push({ line: index + 1, section, status: 'blocked', code: 'MGT_LINE_TOO_LONG' }); return; }
    if (line.startsWith('*')) {
      section = line.slice(1).split(',')[0].trim().toUpperCase();
      if (!SUPPORTED.has(section)) unsupported.push({ line: index + 1, section, raw });
      return;
    }
    if (!SUPPORTED.has(section)) { unsupported.push({ line: index + 1, section, raw }); return; }
    const values = line.split(',').map((value) => value.trim());
    if (values.length > limits.maxColumns || values.some((value) => value.length > limits.maxCellLength)) { audit.push({ line: index + 1, section, status: 'blocked', code: 'MGT_RECORD_LIMIT_EXCEEDED' }); return; }
    try {
      map(section, values, model, index + 1);
      audit.push({ line: index + 1, section, status: 'mapped' });
    } catch (error) {
      audit.push({ line: index + 1, section, status: 'blocked', code: error.code || 'MGT_MAPPING_FAILED', raw });
    }
  });
  const validation = validateImportedModel(model);
  const blockers = [...audit.filter((row) => row.status === 'blocked').map((row) => ({ code: row.code, line: row.line })), ...validation.blockers];
  const core = {
    version: PHASE13_MGT_IMPORT_VERSION,
    status: blockers.length ? 'blocked' : unsupported.length ? 'review-required' : 'ready',
    model,
    source,
    audit,
    unsupported,
    blockers,
    validation,
    limitations: ['nodes/frame/truss/support/material/section/load-case/basic nodal loads only'],
    ...security,
    security,
  };
  return { ...core, importHash: stableHash(core).slice(0, 24) };
}

export function createPhase13MgtImportCandidate(currentModel = {}, text = '', options = {}) {
  const parsed = importPhase13MgtSubset(text, options);
  return deepFreeze({
    version: 'p13-m7-mgt-import-candidate-v1',
    status: parsed.status,
    sourceModelHash: stableHash(currentModel).slice(0, 24),
    parsed,
    revisionDiff: buildPhase13RevisionDiff(currentModel, parsed.model),
    commitAllowed: parsed.status !== 'blocked',
    currentProjectMutationAllowed: false,
  });
}

export function commitPhase13MgtDraftRevision(currentModel = {}, candidate, input = {}) {
  const errors = [];
  if (!candidate?.commitAllowed || candidate?.status === 'blocked') errors.push({ code: 'MGT_CANDIDATE_BLOCKED' });
  if (candidate?.sourceModelHash !== stableHash(currentModel).slice(0, 24)) errors.push({ code: 'MGT_CANDIDATE_STALE' });
  const revisionId = String(input.revisionId || '').trim();
  if (!revisionId) errors.push({ code: 'MGT_DRAFT_REVISION_ID_REQUIRED' });
  if (errors.length) return { ok: false, changed: false, currentModel, errors };
  const draft = clone(candidate.parsed.model);
  draft.meta = { ...(currentModel.meta || {}), ...(draft.meta || {}), revisionId, revisionStatus: 'draft', importedFrom: { parserVersion: candidate.parsed.version, sourceHash: candidate.parsed.source.sourceHash, importHash: candidate.parsed.importHash } };
  return deepFreeze({ ok: true, changed: true, currentModel, currentModelMutated: false, draftRevision: draft, revisionDiff: candidate.revisionDiff, errors: [] });
}

export function buildPhase13RevisionDiff(before = {}, after = {}) {
  const collections = ['nodes', 'members', 'materials', 'sections', 'loadCases', 'loads', 'massSources', 'loadCombinations', 'stories', 'diaphragms', 'analysisCases'];
  return {
    version: 'p13-m7-revision-diff-v2',
    beforeHash: stableHash(before).slice(0, 24),
    afterHash: stableHash(after).slice(0, 24),
    collections: Object.fromEntries(collections.map((key) => [key, diff(before[key] || [], after[key] || [])])),
  };
}

export function buildPhase13ReviewPackageSnapshot(input = {}) {
  const blockers = [];
  if (!input.run?.id || input.run.status !== 'completed') blockers.push('REVIEW_PACKAGE_CURRENT_RUN_REQUIRED');
  if (input.current !== true) blockers.push('REVIEW_PACKAGE_STALE_RUN_BLOCKED');
  if (!input.reportHash) blockers.push('REVIEW_PACKAGE_REPORT_HASH_REQUIRED');
  const core = {
    version: 'p13-m7-review-package-snapshot-v1',
    status: blockers.length ? 'blocked' : 'ready',
    blockers,
    projectId: input.model?.meta?.id || input.model?.id || null,
    revisionId: input.model?.meta?.revisionId || null,
    modelHash: stableHash(input.model || {}).slice(0, 24),
    runId: input.run?.id || null,
    runIntegrityHash: input.run?.integrityHash || null,
    reportHash: input.reportHash || null,
    limitationIds: [...new Set((input.limitations || []).map(String))].sort(),
    artifacts: (input.artifacts || []).map((row) => ({ id: row.id, format: row.format, hash: row.hash })),
    immutable: true,
    designTransferAllowed: blockers.length === 0 && input.run?.designTransferAllowed === true,
  };
  return deepFreeze({ ...core, packageHash: stableHash(core).slice(0, 24) });
}

export function exportPhase13MgtSubset(model = {}) {
  const lines = [];
  appendBlock(lines, 'NODE', (model.nodes || []).map((row) => [row.id, row.x, row.y, row.z]));
  appendBlock(lines, 'MATERIAL', (model.materials || []).map((row) => [row.id, row.name || row.id, row.E, row.G]));
  appendBlock(lines, 'SECTION', (model.sections || []).map((row) => [row.id, row.name || row.id, row.A, row.Iy, row.Iz, row.J]));
  appendBlock(lines, 'ELEMENT', (model.members || []).map((row) => [row.id, String(row.type || 'frame').toUpperCase(), row.n1, row.n2, row.matId, row.secId]));
  appendBlock(lines, 'CONSTRAINT', (model.nodes || []).filter((row) => row.support != null).map((row) => [row.id, ...supportVector(row.support).map((value) => value ? 1 : 0)]));
  appendBlock(lines, 'LOADCASE', (model.loadCases || []).map((row) => [row.id, row.type || 'other']));
  appendBlock(lines, 'CONLOAD', (model.loads || []).filter((row) => row.type === 'nodal').map((row) => [row.id, row.node, row.case, row.P ?? row.value, row.dir || row.direction || '-z']));
  const text = lines.join('\n');
  return { version: 'p13-m7-mgt-subset-export-v1', text, sourceHash: stableHash(text), unsupportedOmitted: (model.loads || []).filter((row) => row.type !== 'nodal').map((row) => row.id), externalApplicationExecuted: false };
}

function map(section, values, model, line) {
  const id = requiredId(values[0], line);
  if (section === 'NODE') model.nodes.push({ id, x: number(values[1], line), y: number(values[2], line), z: number(values[3], line) });
  else if (section === 'ELEMENT') model.members.push({ id, type: (values[1] || 'frame').toLowerCase(), n1: values[2], n2: values[3], matId: values[4] || null, secId: values[5] || null });
  else if (section === 'CONSTRAINT') {
    const node = model.nodes.find((row) => row.id === id);
    if (!node) throw error('MGT_SUPPORT_NODE_MISSING');
    node.support = values.slice(1, 7).map((value) => value === '1');
  } else if (section === 'MATERIAL') model.materials.push({ id, name: values[1], E: number(values[2], line), G: number(values[3], line) });
  else if (section === 'SECTION') model.sections.push({ id, name: values[1], A: number(values[2], line), Iy: number(values[3], line), Iz: number(values[4], line), J: number(values[5], line) });
  else if (section === 'LOADCASE') model.loadCases.push({ id, type: values[1] || 'other' });
  else if (section === 'CONLOAD') model.loads.push({ id, type: 'nodal', node: values[1], case: values[2], P: number(values[3], line), dir: values[4] || '-z' });
  else throw error('MGT_SECTION_REQUIRED');
}

function validateImportedModel(model) {
  const blockers = [];
  const ids = {};
  for (const collection of ['nodes', 'members', 'materials', 'sections', 'loadCases', 'loads']) {
    ids[collection] = new Set();
    for (const row of model[collection]) {
      if (ids[collection].has(row.id)) blockers.push({ code: 'MGT_DUPLICATE_ID', collection, id: row.id });
      ids[collection].add(row.id);
    }
  }
  for (const member of model.members) {
    if (!ids.nodes.has(member.n1) || !ids.nodes.has(member.n2)) blockers.push({ code: 'MGT_MEMBER_NODE_UNRESOLVED', id: member.id });
    if (!ids.materials.has(member.matId)) blockers.push({ code: 'MGT_MEMBER_MATERIAL_UNRESOLVED', id: member.id, ref: member.matId });
    if (!ids.sections.has(member.secId)) blockers.push({ code: 'MGT_MEMBER_SECTION_UNRESOLVED', id: member.id, ref: member.secId });
  }
  for (const load of model.loads) {
    if (!ids.nodes.has(load.node)) blockers.push({ code: 'MGT_LOAD_NODE_UNRESOLVED', id: load.id, ref: load.node });
    if (!ids.loadCases.has(load.case)) blockers.push({ code: 'MGT_LOAD_CASE_UNRESOLVED', id: load.id, ref: load.case });
  }
  return { ok: blockers.length === 0, blockers };
}

function diff(before, after) {
  const a = new Map(before.map((row) => [row.id, row]));
  const b = new Map(after.map((row) => [row.id, row]));
  return {
    added: [...b.keys()].filter((id) => !a.has(id)),
    removed: [...a.keys()].filter((id) => !b.has(id)),
    changed: [...b.keys()].filter((id) => a.has(id) && stableHash(a.get(id)) !== stableHash(b.get(id))),
  };
}

function blockedResult(model, source, security, blockers) {
  const core = { version: PHASE13_MGT_IMPORT_VERSION, status: 'blocked', model, source, audit: [], unsupported: [], blockers, validation: { ok: false, blockers }, limitations: [], ...security, security };
  return { ...core, importHash: stableHash(core).slice(0, 24) };
}
function appendBlock(lines, section, rows) { if (!rows.length) return; lines.push(`*${section}`); for (const row of rows) lines.push(row.map((value) => String(value ?? '')).join(',')); }
function supportVector(value) { if (Array.isArray(value)) return Array.from({ length: 6 }, (_, index) => value[index] === true); if (value === 'fixed') return [true, true, true, true, true, true]; if (value === 'pin') return [true, true, true, false, false, false]; return [false, false, false, false, false, false]; }
function requiredId(value) { const id = String(value || '').trim(); if (!id) throw error('MGT_ID_REQUIRED'); return id; }
function number(value) { const parsed = Number(value); if (!Number.isFinite(parsed)) throw error('MGT_NUMBER_INVALID'); return parsed; }
function error(code) { return Object.assign(new Error(code), { code }); }
function clone(value) { return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
