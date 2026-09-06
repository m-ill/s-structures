export function attachMemberDemandTrace(check, demandPackage, memberId) {
  const row = demandPackage?.members?.[memberId];
  if (!row) return check;
  check.demandTrace = {
    version: demandPackage.version,
    traceId: row.traceId,
    governing: row.governing,
    stationCount: row.stationCount,
  };
  return check;
}

export function demandPackageHeader(demandPackage) {
  return demandPackage ? {
    version: demandPackage.version,
    source: demandPackage.source,
    summary: demandPackage.summary,
  } : null;
}
