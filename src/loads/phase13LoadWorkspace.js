import { stableHash } from '../core/stableHash.js';
import { applyModelChangeSet } from '../modeling/transaction.js';
import { buildLoadAudit } from './loadAudit.js';
import { validateMassSourceDefinition } from './massSource.js';
import { buildMassSourceTrace } from './loadsV2.js';
import { generateSlabPanelLoads } from './slabLoadGeneration.js';

export const PHASE13_LOAD_WORKSPACE_VERSION = 'p13-m3-load-workspace-v1';
export const PHASE13_SLAB_PANEL_CHANGE_SET_VERSION = 'p13-m3-slab-panel-change-set-v1';

export function buildPhase13LoadWorkspace(model = {}, options = {}) {
  const audit = buildLoadAudit(model, options.auditOptions);
  const massSources = (model.massSources || []).map((row) => ({
    id: row.id,
    validation: validateMassSourceDefinition(row),
  }));
  const combinations = (model.loadCombinations || []).map((row) => ({
    ...clone(row),
    ownership: row.origin === 'manual' || row.userModified === true ? 'manual' : 'generated',
    locked: row.origin !== 'manual' && row.userModified !== true,
  }));
  return deepFreeze({
    version: PHASE13_LOAD_WORKSPACE_VERSION,
    modelHash: stableHash(model).slice(0, 24),
    tabs: ['load-cases', 'loads', 'slab-panels', 'mass-sources', 'manual-combinations', 'audit'],
    loadCases: clone(model.loadCases || []),
    loads: clone(model.loads || []),
    slabPanels: clone(model.slabPanels || []),
    massSources,
    combinations,
    audit,
    resultantAudit: buildPhase13LoadResultantAudit(model, options.result),
    massParity: buildPhase13MassParityAudit(model, options.result),
    totals: clone(audit.totals),
  });
}

export function buildPhase13LoadResultantAudit(model = {}, result = null, options = {}) {
  const referencePoint = vector3(options.referencePoint || [0, 0, 0]);
  const nodes = new Map((model.nodes || []).map((row) => [String(row.id), row]));
  const members = new Map((model.members || []).map((row) => [String(row.id), row]));
  const total = [0, 0, 0, 0, 0, 0];
  const rows = [];
  const unsupported = [];
  for (const load of model.loads || []) {
    const row = loadResultant(load, nodes, members, referencePoint);
    if (!row.ok) {
      unsupported.push({ id: load.id || null, code: row.code, type: load.type || null });
      continue;
    }
    rows.push(row);
    row.resultant.forEach((value, index) => { total[index] += value; });
  }
  const solver = solverLoadResultant(result);
  const scale = Math.max(1, ...total.map(Math.abs), ...(solver || []).map(Math.abs));
  const residual = solver ? total.map((value, index) => value - Number(solver[index] || 0)) : null;
  const relativeResidual = residual ? Math.max(...residual.map(Math.abs)) / scale : null;
  const tolerance = Number(options.tolerance || 1e-9);
  return deepFreeze({
    version: 'p13-m3-load-resultant-audit-v1', referencePoint, totalResultant: total,
    solverResultant: solver, residual, relativeResidual, tolerance, rows, unsupported,
    status: unsupported.length ? 'review-required' : solver == null ? 'preview' : relativeResidual <= tolerance ? 'PASS' : 'FAIL',
    parity: solver == null ? null : relativeResidual <= tolerance,
  });
}

export function buildPhase13MassParityAudit(model = {}, result = null, options = {}) {
  const source = options.massSource || model.analysisSettings?.massSource || model.massSources?.[0] || null;
  if (!source) return deepFreeze({ version: 'p13-m3-mass-parity-v1', status: 'not-configured', trace: null, solverTotalMass: null, parity: null });
  const trace = buildMassSourceTrace(model, source, options);
  const solverTotalMass = solverMassTotal(result);
  const tolerance = Number(options.tolerance || 1e-9);
  const relativeResidual = solverTotalMass == null ? null : Math.abs(trace.totalMass - solverTotalMass) / Math.max(1, Math.abs(trace.totalMass), Math.abs(solverTotalMass));
  return deepFreeze({
    version: 'p13-m3-mass-parity-v1', status: trace.ignored.length ? 'review-required' : solverTotalMass == null ? 'preview' : relativeResidual <= tolerance ? 'PASS' : 'FAIL',
    trace, solverTotalMass, relativeResidual, tolerance, parity: solverTotalMass == null ? null : relativeResidual <= tolerance,
    physicalMemberMassDeduplicated: trace.physicalMemberMassDeduplicated,
    physicalShellMassDeduplicated: trace.physicalShellMassDeduplicated,
  });
}

export function previewPhase13SlabPanelChangeSet(model = {}, panels = null, options = {}) {
  const generated = generateSlabPanelLoads(model, { ...options, panels: panels || model.slabPanels || [] });
  const existing = model.loads || [];
  const generatedByKey = new Map(generated.loads.map((row) => [row.generatedKey, row]));
  const conflicts = [];
  const preserved = [];
  const next = [];
  for (const row of existing) {
    if (!row.generatedKey || !generatedByKey.has(row.generatedKey)) {
      next.push(clone(row));
      continue;
    }
    const proposed = generatedByKey.get(row.generatedKey);
    if (row.userModified === true || row.origin === 'manual') {
      preserved.push(row.id);
      conflicts.push({ code: 'SLAB_GENERATED_USER_OVERRIDE', generatedKey: row.generatedKey, existing: clone(row), proposed: clone(proposed) });
      next.push(clone(row));
    } else {
      next.push(clone(proposed));
    }
    generatedByKey.delete(row.generatedKey);
  }
  next.push(...[...generatedByKey.values()].map(clone));
  const duplicateKeys = duplicateValues(next.map((row) => row.generatedKey).filter(Boolean));
  const equilibrium = buildPanelEquilibriumAudit(model, generated.trace);
  const changes = diffLoads(existing, next);
  const blocked = duplicateKeys.length > 0 || equilibrium.some((row) => row.status !== 'PASS');
  return deepFreeze({
    version: PHASE13_SLAB_PANEL_CHANGE_SET_VERSION,
    status: blocked ? 'blocked' : conflicts.length ? 'review-required' : 'ready',
    sourceModelHash: stableHash(model).slice(0, 24),
    generated,
    equilibrium,
    changes,
    nextLoads: next,
    conflicts,
    preserved,
    duplicateKeys,
  });
}

export function applyPhase13SlabPanelChangeSet(model, preview, options = {}) {
  if (preview?.version !== PHASE13_SLAB_PANEL_CHANGE_SET_VERSION || preview.status === 'blocked') {
    return { ok: false, changed: false, model, errors: [{ code: 'P13_SLAB_PANEL_CHANGE_SET_BLOCKED' }] };
  }
  if (preview.sourceModelHash !== stableHash(model).slice(0, 24)) {
    return { ok: false, changed: false, model, errors: [{ code: 'P13_SLAB_PANEL_CHANGE_SET_STALE' }] };
  }
  return applyModelChangeSet(model, {
    id: 'p13-slab-panel-loads', name: 'Apply slab panel loads', changes: preview.changes,
  }, { validate: options.validate });
}

export function previewPhase13ManualCombinationChangeSet(model, combinations = []) {
  const errors = [];
  const seen = new Set();
  const loadCases = new Set((model.loadCases || []).map((row) => row.id));
  const locked = (model.loadCombinations || []).filter((row) => row.origin !== 'manual' && row.userModified !== true).map(clone);
  const lockedIds = new Set(locked.map((row) => row.id));
  const normalized = combinations.map((row, index) => {
    const id = String(row.id || '').trim();
    if (!id) errors.push({ code: 'COMBINATION_ID_REQUIRED', index });
    if (seen.has(id)) errors.push({ code: 'COMBINATION_ID_DUPLICATE', id });
    if (lockedIds.has(id)) errors.push({ code: 'COMBINATION_LOCKED_ID_CONFLICT', id });
    seen.add(id);
    const factors = Object.fromEntries(Object.entries(row.factors || {}).map(([caseId, factor]) => [caseId, Number(factor)]));
    if (!Object.keys(factors).length) errors.push({ code: 'COMBINATION_EMPTY', id });
    for (const [caseId, factor] of Object.entries(factors)) {
      if (!loadCases.has(caseId)) errors.push({ code: 'COMBINATION_CASE_ORPHAN', id, caseId });
      if (!Number.isFinite(factor)) errors.push({ code: 'COMBINATION_FACTOR_INVALID', id, caseId });
    }
    return { ...clone(row), id, factors, origin: 'manual', userModified: true };
  });
  const next = [...locked, ...normalized];
  const changes = diffCollection(model.loadCombinations || [], next, 'loadCombinations');
  return deepFreeze({ version: 'p13-m3-manual-combination-change-set-v1', status: errors.length ? 'blocked' : 'ready', errors, locked, combinations: normalized, nextCombinations: next, changes });
}

export function applyPhase13ManualCombinationChangeSet(model, preview, options = {}) {
  if (preview?.status !== 'ready') return { ok: false, changed: false, model, errors: clone(preview?.errors || []) };
  return applyModelChangeSet(model, { id: 'p13-manual-combinations', name: 'Apply manual combinations', changes: preview.changes }, { validate: options.validate });
}

export function parsePhase13LoadPaste(text, columns = []) {
  const rows = String(text || '').trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(/\t|,/));
  const errors = [];
  const data = rows.map((values, rowIndex) => Object.fromEntries(columns.map((column, columnIndex) => {
    const raw = String(values[columnIndex] ?? '').trim();
    if (/^[=+@]/.test(raw)) errors.push({ code: 'FORMULA_OR_MACRO_FORBIDDEN', row: rowIndex, column });
    return [column, raw];
  })));
  return { ok: errors.length === 0, rows: data, errors, formulasExecuted: false, macrosExecuted: false };
}

function buildPanelEquilibriumAudit(model, trace) {
  const nodes = new Map((model.nodes || []).map((row) => [String(row.id), row]));
  return (trace.panels || []).map((panel) => {
    let transferred = 0;
    let mx = 0;
    let my = 0;
    for (const edge of panel.edgeTrace || []) {
      const a = nodes.get(String(edge.nodeIds[0]));
      const b = nodes.get(String(edge.nodeIds[1]));
      if (!a || !b) continue;
      for (const segment of edge.segments || []) {
        const resultant = (segment.w1 + segment.w2) * 0.5 * (segment.to - segment.from) * edge.length;
        const local = Math.abs(segment.w1 + segment.w2) < 1e-15 ? 0.5 : (segment.w1 + 2 * segment.w2) / (3 * (segment.w1 + segment.w2));
        const t = segment.from + (segment.to - segment.from) * local;
        const x = Number(a.x) + (Number(b.x) - Number(a.x)) * t;
        const y = Number(a.y) + (Number(b.y) - Number(a.y)) * t;
        transferred += resultant; mx += y * resultant; my -= x * resultant;
      }
    }
    const panelNodes = [...new Set((panel.edgeTrace || []).flatMap((edge) => edge.nodeIds))].map((id) => nodes.get(String(id))).filter(Boolean);
    const centroid = panelNodes.length ? {
      x: panelNodes.reduce((sum, row) => sum + Number(row.x), 0) / panelNodes.length,
      y: panelNodes.reduce((sum, row) => sum + Number(row.y), 0) / panelNodes.length,
    } : { x: 0, y: 0 };
    const expectedMx = centroid.y * panel.totalLoad;
    const expectedMy = -centroid.x * panel.totalLoad;
    const forceError = Math.abs(transferred - panel.totalLoad) / Math.max(panel.totalLoad, 1);
    const momentError = Math.hypot(mx - expectedMx, my - expectedMy) / Math.max(Math.hypot(expectedMx, expectedMy), panel.totalLoad, 1);
    return { panelId: panel.panelId, forceError, momentError, status: forceError <= 1e-10 && momentError <= 1e-10 ? 'PASS' : 'FAIL' };
  });
}

function diffLoads(before, after) { return diffCollection(before, after, 'loads'); }
function diffCollection(before, after, collection) {
  const a = new Map(before.map((row) => [row.id, row])); const b = new Map(after.map((row) => [row.id, row])); const changes = [];
  for (const [id, row] of a) if (!b.has(id)) changes.push({ op: 'remove', collection, id });
  for (const [id, row] of b) {
    if (!a.has(id)) changes.push({ op: 'add', collection, id, value: clone(row) });
    else if (JSON.stringify(a.get(id)) !== JSON.stringify(row)) changes.push({ op: 'replace', collection, id, value: clone(row) });
  }
  return changes;
}
function duplicateValues(values) { const seen = new Set(); const duplicates = new Set(); for (const value of values) { if (seen.has(value)) duplicates.add(value); seen.add(value); } return [...duplicates].sort(); }
function loadResultant(load, nodes, members, referencePoint) {
  const type = String(load.type || '').toLowerCase();
  if (['moment', 'mload', 'nodal-moment'].includes(type)) {
    const moment = directionVector(load.dir || load.direction, Number(load.M ?? load.value ?? load.moment));
    if (!moment) return { ok: false, code: 'LOAD_DIRECTION_OR_VALUE_UNSUPPORTED' };
    return { ok: true, id: load.id || null, type, resultant: [0, 0, 0, ...moment], source: 'model-load' };
  }
  const location = loadLocation(load, nodes, members);
  if (!location) return { ok: false, code: 'LOAD_TARGET_GEOMETRY_UNRESOLVED' };
  const magnitude = loadForceMagnitude(load, members, nodes);
  const force = directionVector(load.dir || load.direction, magnitude);
  if (!force) return { ok: false, code: 'LOAD_DIRECTION_OR_VALUE_UNSUPPORTED' };
  const arm = location.map((value, index) => value - referencePoint[index]);
  const moment = cross(arm, force);
  return { ok: true, id: load.id || null, type, location, resultant: [...force, ...moment], source: 'model-load' };
}
function loadForceMagnitude(load, members, nodes) {
  const type = String(load.type || '').toLowerCase();
  if (['nodal', 'point', 'pload', 'force'].includes(type)) return finite(load.P ?? load.value ?? load.force);
  if (!['udl', 'udl-partial', 'trapezoid', 'member-udl'].includes(type)) return null;
  const member = members.get(String(load.member));
  const a = member ? nodes.get(String(member.n1)) : null; const b = member ? nodes.get(String(member.n2)) : null;
  if (!a || !b) return null;
  const length = Math.hypot(Number(b.x) - Number(a.x), Number(b.y) - Number(a.y), Number(b.z) - Number(a.z));
  const from = bounded01(load.from ?? 0); const to = bounded01(load.to ?? 1);
  const loadedLength = Math.max(0, to - from) * length;
  const w1 = finite(load.w1 ?? load.w ?? load.value); const w2 = finite(load.w2 ?? load.w ?? load.value);
  return w1 == null || w2 == null ? null : (w1 + w2) * 0.5 * loadedLength;
}
function loadLocation(load, nodes, members) {
  if (load.node) {
    const node = nodes.get(String(load.node));
    return node ? [Number(node.x) || 0, Number(node.y) || 0, Number(node.z) || 0] : null;
  }
  const member = members.get(String(load.member));
  const a = member ? nodes.get(String(member.n1)) : null; const b = member ? nodes.get(String(member.n2)) : null;
  if (!a || !b) return null;
  const from = bounded01(load.from ?? load.t ?? 0); const to = bounded01(load.to ?? load.t ?? 1);
  const w1 = Math.abs(finite(load.w1 ?? load.w ?? 1) ?? 1); const w2 = Math.abs(finite(load.w2 ?? load.w ?? 1) ?? 1);
  const local = Math.abs(w1 + w2) < 1e-15 ? 0.5 : (w1 + 2 * w2) / (3 * (w1 + w2));
  const t = from + (to - from) * local;
  return [0, 1, 2].map((index) => {
    const key = ['x', 'y', 'z'][index]; return (Number(a[key]) || 0) + ((Number(b[key]) || 0) - (Number(a[key]) || 0)) * t;
  });
}
function directionVector(direction, magnitude) {
  if (!Number.isFinite(magnitude)) return null;
  const key = String(direction || '-z').trim().toLowerCase();
  const vectors = { x: [1, 0, 0], '+x': [1, 0, 0], '-x': [-1, 0, 0], y: [0, 1, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], z: [0, 0, 1], '+z': [0, 0, 1], '-z': [0, 0, -1] };
  return vectors[key]?.map((value) => value * magnitude) || null;
}
function solverLoadResultant(result) {
  const source = result?.equilibrium || result?.summary?.equilibrium || result?.payload?.equilibrium || result?.summary || result?.payload?.summary || {};
  const value = source.totalLoadResultant || source.totalLoadSixResultant || null;
  return Array.isArray(value) && value.length === 6 && value.every(Number.isFinite) ? value.map(Number) : null;
}
function solverMassTotal(result) {
  const source = result?.mass || result?.summary?.mass || result?.payload?.mass || result?.modal || result?.payload?.modal || {};
  const value = source.totalMass ?? source.assembledTotalMass ?? source.total;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
function vector3(value) { return [0, 1, 2].map((index) => Number(value?.[index]) || 0); }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function finite(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function bounded01(value) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0; }
function clone(value) { return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
