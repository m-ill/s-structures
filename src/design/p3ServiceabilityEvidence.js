import { buildServiceabilityDriftReport } from './serviceability.js';

export const P3_SERVICEABILITY_EVIDENCE_VERSION = 'p3-m18-serviceability-evidence-v1';

export function buildP3ServiceabilityEvidence(model, analysis, modules = {}, options = {}) {
  const drift = options.driftReport || buildServiceabilityDriftReport(model, analysis, options.serviceability || {});
  const deflectionRows = collectDeflectionRows(modules);
  const vibrationRows = normalizeRows(options.vibrationRows || options.vibration || []);
  const rows = [
    evidenceRow('member-deflection', deflectionRows.length, deflectionRows.every((row) => row.status !== 'NG')),
    evidenceRow('story-drift', drift.rows?.length || 0, drift.summary?.status !== 'NG'),
    evidenceRow('floor-vibration', vibrationRows.length, vibrationRows.every((row) => row.status !== 'NG')),
  ];
  return {
    version: P3_SERVICEABILITY_EVIDENCE_VERSION,
    rows,
    deflectionRows,
    drift,
    vibrationRows,
    summary: {
      covered: rows.every((row) => row.covered),
      missing: rows.filter((row) => !row.covered).map((row) => row.id),
      issueCount: rows.filter((row) => row.status !== 'OK').length,
    },
  };
}

function collectDeflectionRows(modules) {
  return [
    ...rowsOf(modules.rc).filter((row) => row.serviceability),
    ...rowsOf(modules.steel).filter((row) => row.deflection),
  ].map((row) => ({
    itemId: row.memberId || row.id || row.role || null,
    status: row.serviceability?.status || row.deflection?.status || row.summary?.serviceabilityStatus || 'NA',
    demandToLimit: row.serviceability?.ratio || row.deflection?.ratio || row.deflection?.demandToLimit || 0,
  }));
}

function evidenceRow(id, count, clean) {
  return {
    id,
    count,
    covered: count > 0 && clean,
    status: count <= 0 ? 'MISSING' : clean ? 'OK' : 'NG',
  };
}

function normalizeRows(value) {
  if (!Array.isArray(value)) return value?.rows || [];
  return value;
}

function rowsOf(module = {}) {
  const schedules = module.schedules || {};
  return [
    ...(module.rows || []),
    ...(schedules.beams || []),
    ...(schedules.columns || []),
    ...(schedules.walls || []),
    ...(schedules.slabs || []),
  ];
}
