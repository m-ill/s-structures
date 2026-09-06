export function envelopeMemberAudit(analysis) {
  const rows = Object.entries(analysis?.envelope?.memberResults || {}).map(([memberId, result]) => ({
    memberId,
    utilization: result.governing?.utilization || null,
    deformation: result.governing?.deformation || null,
    quantities: result.governing?.quantities || {},
  }));
  return {
    rowCount: rows.length,
    governing: analysis?.envelope?.governing?.maxUtilization || null,
    rows,
  };
}
