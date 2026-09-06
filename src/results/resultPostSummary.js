export function resultPostSummary(stories, members, foundations) {
  return {
    storyRowCount: stories.length,
    memberRowCount: members.length,
    foundationRowCount: foundations.length,
    governingStoryDrift: maxByAbs(stories, 'driftRatio'),
    governingMemberForce: maxMemberForce(members),
    upliftNodeCount: foundations.filter((row) => row.uplift).length,
  };
}

function maxByAbs(rows, key) {
  return rows.reduce((best, row) => (
    !best || Math.abs(row[key] || 0) > Math.abs(best[key] || 0) ? row : best
  ), null);
}

function maxMemberForce(rows) {
  return rows.reduce((best, row) => (
    !best || Math.abs(row.governing?.value || 0) > Math.abs(best.governing?.value || 0) ? row : best
  ), null);
}
