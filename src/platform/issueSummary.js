export function summarizeIssues(issues) {
  const open = issues.filter((item) => item.status === 'open');
  return {
    totalCount: issues.length,
    openCount: open.length,
    ngCount: open.filter((item) => item.severity === 'NG').length,
    warnCount: open.filter((item) => item.severity === 'WARN').length,
  };
}
