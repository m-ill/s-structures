export function buildDesignDemandMembers(post) {
  return Object.fromEntries((post?.memberStationForces || []).map((row) => [row.memberId, {
    traceId: `MEM-DEMAND-${row.memberId}`,
    memberId: row.memberId,
    stationCount: row.stationCount,
    governing: row.governing || null,
    peaks: row.peaks || {},
  }]));
}
