import { buildResultPostprocessing } from '../results/resultPostprocessing.js';

export const RESULT_TABLE_VALIDATION_VERSION = 'p2-t30-t31-result-table-validation';

export function buildResultTableValidation(model, analysis, options = {}) {
  const post = buildResultPostprocessing(model, analysis, options);
  const checks = [
    check('story-results', post.summary.storyRowCount > 0),
    check('member-stations', post.summary.memberRowCount === (model?.members?.length || 0)),
    check('foundation-reactions', post.summary.foundationRowCount > 0),
    check('governing-member', !!post.summary.governingMemberForce),
  ];
  return {
    version: RESULT_TABLE_VALIDATION_VERSION,
    tickets: ['T30', 'T31'],
    status: checks.some((row) => row.status === 'NG') ? 'NG' : 'OK',
    checks,
    summary: post.summary,
  };
}

function check(id, ok) {
  return { id, status: ok ? 'OK' : 'NG' };
}
