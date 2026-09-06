export function designDemandSummary(members, foundations) {
  const memberRows = Object.values(members);
  const foundationRows = Object.values(foundations);
  return {
    memberCount: memberRows.length,
    foundationCount: foundationRows.length,
    upliftNodeCount: foundationRows.filter((row) => row.uplift).length,
    governingMemberDemand: memberRows.reduce((best, row) => (
      !best || Math.abs(row.governing?.value || 0) > Math.abs(best.governing?.value || 0) ? row : best
    ), null),
  };
}
