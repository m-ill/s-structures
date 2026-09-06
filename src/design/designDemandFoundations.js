export function buildDesignDemandFoundations(post) {
  return Object.fromEntries((post?.foundationReactions || []).map((row) => [row.nodeId, {
    traceId: `FND-DEMAND-${row.nodeId}`,
    nodeId: row.nodeId,
    reactions: row.reactions,
    uplift: !!row.uplift,
    governingVerticalCombo: row.governingVerticalCombo || null,
  }]));
}
