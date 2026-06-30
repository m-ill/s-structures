export function envelopeReactionAudit(post) {
  const rows = (post?.foundationReactions || []).map((row) => ({
    nodeId: row.nodeId,
    reactions: row.reactions,
    uplift: row.uplift,
    governingVerticalCombo: row.governingVerticalCombo,
  }));
  return {
    rowCount: rows.length,
    upliftNodeCount: rows.filter((row) => row.uplift).length,
    rows,
  };
}
