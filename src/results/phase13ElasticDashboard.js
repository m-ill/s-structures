import { buildPhase13PublishedRunSet } from '../core/phase13AnalysisRuns.js';
import { stableHash } from '../core/stableHash.js';

export const PHASE13_ELASTIC_DASHBOARD_VERSION = 'p13-m6-elastic-dashboard-v2';

export function buildPhase13ElasticDashboard(input = {}) {
  const run = input.run;
  buildPhase13PublishedRunSet([run]);
  const result = run.result || {};
  const selection = input.selection || null;
  const current = input.current !== false;
  const collections = {
    deformation: clone(result.displacements || result.deformation || []),
    reactions: clone(result.reactions || []),
    memberForces: clone(result.memberForces || result.forces || []),
    story: clone(result.story || result.storyResults || {}),
    modal: clone(result.modal || {}),
    rsa: clone(result.rsa || {}),
    pDelta: clone(result.pDelta || {}),
    buckling: clone(result.buckling || {}),
    timeHistory: clone(result.timeHistory || {}),
  };
  const resultHash = stableHash({ runId: run.id, caseId: run.caseId, result }).slice(0, 24);
  return deepFreeze({
    version: PHASE13_ELASTIC_DASHBOARD_VERSION,
    runId: run.id,
    resultHash,
    caseId: run.caseId,
    qualification: run.qualification,
    displayEligibility: current ? 'current' : 'historical-stale',
    designTransferAllowed: current && run.designTransferAllowed === true,
    tabs: ['overview', 'deformation', 'reactions', 'member-forces', 'story', 'modal', 'rsa', 'p-delta', 'buckling', 'time-history'],
    summary: clone(result.summary || {}),
    governing: buildGoverningIndex(collections),
    ...collections,
    selection,
    objectLinks: selection?.id ? [
      { surface: 'tree', objectId: selection.id },
      { surface: 'viewport', objectId: selection.id },
      { surface: 'inspector', objectId: selection.id },
    ] : [],
    statusPresentation: {
      current: { text: current ? 'Current' : 'Stale/Historical', icon: current ? 'check' : 'history', colorOnly: false },
      qualification: { text: run.qualification || 'unqualified', icon: 'shield', colorOnly: false },
    },
    historical: !current,
  });
}

export function buildPhase13ElasticResultQuery(dashboard, input = {}) {
  if (!dashboard?.runId || !dashboard?.resultHash) throw resultError('P13_RESULT_DASHBOARD_REQUIRED');
  const tab = String(input.tab || 'overview');
  if (!dashboard.tabs.includes(tab)) throw resultError('P13_RESULT_TAB_UNSUPPORTED');
  const sourceKey = tab === 'member-forces' ? 'memberForces' : tab === 'time-history' ? 'timeHistory' : tab === 'p-delta' ? 'pDelta' : tab;
  const value = clone(dashboard[sourceKey] ?? dashboard.summary);
  return deepFreeze({
    version: 'p13-m6-result-query-v1',
    runId: dashboard.runId,
    resultHash: dashboard.resultHash,
    tab,
    objectId: input.objectId ? String(input.objectId) : null,
    component: input.component ? String(input.component) : null,
    unit: input.unit ? String(input.unit) : null,
    coordinateSystem: input.coordinateSystem || 'global',
    signConvention: input.signConvention || 'solver-native-documented',
    value,
    qualification: dashboard.qualification,
    historical: dashboard.historical,
  });
}

export function exportPhase13DashboardCsv(query) {
  const rows = flattenRows(query?.value);
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(headers.map((header) => csvCell(row[header])).join(','));
  return { version: 'p13-m6-result-csv-v1', runId: query?.runId || null, resultHash: query?.resultHash || null, formulaInjectionEscaped: true, text: lines.join('\n') };
}

function buildGoverningIndex(collections) {
  const candidates = [];
  collectNumeric(candidates, collections.deformation, 'deformation');
  collectNumeric(candidates, collections.reactions, 'reactions');
  collectNumeric(candidates, collections.memberForces, 'member-forces');
  const sorted = candidates.sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.path.localeCompare(b.path));
  return { maxAbsolute: sorted[0] || null, candidateCount: sorted.length, tieCount: sorted.length && Math.abs(sorted[0].value) === Math.abs(sorted[1]?.value) ? sorted.filter((row) => Math.abs(row.value) === Math.abs(sorted[0].value)).length : 1 };
}

function collectNumeric(out, value, source, path = '') {
  if (typeof value === 'number' && Number.isFinite(value)) { out.push({ source, path, value }); return; }
  if (Array.isArray(value)) value.forEach((child, index) => collectNumeric(out, child, source, `${path}[${index}]`));
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) collectNumeric(out, child, source, path ? `${path}.${key}` : key);
}

function flattenRows(value) {
  if (Array.isArray(value)) return value.map((row, index) => row && typeof row === 'object' && !Array.isArray(row) ? row : { index, value: row });
  if (value && typeof value === 'object') return Object.entries(value).map(([key, row]) => row && typeof row === 'object' && !Array.isArray(row) ? { key, ...row } : { key, value: row });
  return [{ value }];
}

function csvCell(value) {
  const raw = typeof value === 'object' && value != null ? JSON.stringify(value) : String(value ?? '');
  const safe = /^[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function resultError(code) { return Object.assign(new Error(code), { code }); }
function clone(value) { return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
