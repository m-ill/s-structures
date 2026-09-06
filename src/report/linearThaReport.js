export const LINEAR_THA_REPORT_VERSION = 'p14-m2-linear-tha-report-v1';

export function buildLinearThaReport(analysisResults = {}) {
  const rows = Object.entries(analysisResults || {}).map(([caseId, record]) => normalize(caseId, record)).filter(Boolean);
  return {
    version: LINEAR_THA_REPORT_VERSION,
    caseCount: rows.length,
    completedCount: rows.filter((row) => row.status === 'available' || row.status === 'ok').length,
    cancelledCount: rows.filter((row) => row.status === 'cancelled').length,
    rows,
    limitations: ['TH1 frozen-input qualification and commercial cross-solver comparison are not implied by this report.'],
  };
}

function normalize(caseId, record) {
  const payload = record?.payload || record?.result || record;
  const method = String(payload?.method || '');
  if (!method.includes('time') && !method.includes('tha') && payload?.integration == null) return null;
  return {
    caseId,
    status: payload.status || record?.status || null,
    integration: payload.integration || null,
    dampingType: payload.damping?.type || (payload.rayleigh ? 'rayleigh' : null),
    sampleCount: payload.record?.sampleCount || payload.rows?.length || 0,
    dt: payload.rows?.length > 1 ? payload.rows[1].time - payload.rows[0].time : null,
    maxDisplacement: payload.maxDisplacement ?? null,
    energyError: payload.energy?.maxRelativeError ?? null,
    energyQualified: payload.energy?.qualified ?? null,
    runHash: payload.runHash || null,
    seriesHash: payload.record?.seriesHash || null,
    partialPublish: payload.partialPublish ?? null,
    designBlocked: payload.designBlocked !== false,
  };
}
