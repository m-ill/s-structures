export function calculationChecks(model, analysis, resultTables, trace, issues) {
  return [
    check('load-derivation', !!model?.loadEstimation, 'WARN'),
    check('combination-results', !!analysis?.combos?.length),
    check('member-trace', trace.rows.length === (model?.members?.length || 0)),
    check('result-tables', resultTables.status !== 'NG'),
    check('issue-registry', !!issues.version),
  ];
}

export function calculationStatus(checks, trace, issues) {
  if (checks.some((row) => row.status === 'NG') || issues.ngCount) return 'NG';
  if (checks.some((row) => row.status === 'WARN') || trace.unimplementedCount || issues.warnCount) return 'WARN';
  return 'OK';
}

function check(id, ok, severity = 'NG') {
  return { id, status: ok ? 'OK' : severity };
}
