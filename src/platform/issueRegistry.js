import { memberIssues } from './issueMemberSource.js';
import { qaIssues } from './issueQaSource.js';
import { summarizeIssues } from './issueSummary.js';
import { validationIssues } from './issueValidationSource.js';

export const ISSUE_REGISTRY_VERSION = 'p2-t43-issue-registry';

export function buildIssueRegistry(model, analysis, options = {}) {
  const raw = [
    ...validationIssues(analysis),
    ...qaIssues(model, analysis),
    ...memberIssues(model, analysis),
  ];
  const resolutions = options.resolutions || {};
  const issues = raw.map((issue, index) => ({
    id: issue.id || `IR-${index + 1}`,
    status: resolutions[issue.id]?.status || 'open',
    ...issue,
  }));
  return { version: ISSUE_REGISTRY_VERSION, issues, summary: summarizeIssues(issues) };
}
