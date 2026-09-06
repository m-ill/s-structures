export const FOUNDATION_RESPONSE_REPORT_VERSION = 'p14-m1-foundation-response-report-v1';

export function buildFoundationResponseReport(model = {}, result = null, analysis = null) {
  const properties = new Map((model.foundationProperties || []).map((row) => [row.id, row]));
  const source = responseSource(result, analysis);
  const responses = source?.foundationResults || {};
  const rows = (model.members || [])
    .filter((member) => member.foundationId)
    .map((member) => {
      const property = properties.get(member.foundationId) || null;
      const response = responses[member.id] || source?.memberResults?.[member.id]?.foundation || null;
      return {
        memberId: member.id,
        propertyId: member.foundationId,
        propertyVersion: property?.version ?? null,
        behavior: property?.behavior || null,
        lineStiffness: {
          localY: finite(property?.localY?.lineStiffness, response?.lineStiffness?.localY),
          localZ: finite(property?.localZ?.lineStiffness, response?.lineStiffness?.localZ),
        },
        stationCount: response?.stations?.length || 0,
        resultant: clone(response?.resultant || null),
        centroid: clone(response?.centroid || null),
        globalForce: clone(response?.globalForce || null),
        globalMoment: clone(response?.globalMoment || null),
        strainEnergy: finite(response?.strainEnergy),
        actionConvention: response?.actionConvention || null,
        resultHash: response?.resultHash || null,
        status: response ? 'SOLVED' : 'NOT_RUN',
      };
    });
  return {
    version: FOUNDATION_RESPONSE_REPORT_VERSION,
    assignedMemberCount: rows.length,
    solvedMemberCount: rows.filter((row) => row.status === 'SOLVED').length,
    totalStrainEnergy: rows.reduce((sum, row) => sum + (row.strainEnergy || 0), 0),
    totalGlobalForce: sumVectors(rows.map((row) => row.globalForce)),
    totalGlobalMoment: sumVectors(rows.map((row) => row.globalMoment)),
    rows,
    limitations: [
      'Only linear bilateral distributed Winkler response is reported.',
      'Compression-only, gap/uplift, ground settlement and coupled soil behavior are outside P14-M1.',
    ],
  };
}

function responseSource(result, analysis) {
  if (result?.foundationResults && Object.keys(result.foundationResults).length) return result;
  return Object.values(analysis?.byCombo || {}).find((row) => row?.foundationResults && Object.keys(row.foundationResults).length) || result;
}

function finite(...values) {
  const value = values.find((item) => Number.isFinite(Number(item)));
  return value == null ? null : Number(value);
}
function sumVectors(values) {
  return [0, 1, 2].map((index) => values.reduce((sum, row) => sum + (Number(row?.[index]) || 0), 0));
}
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
