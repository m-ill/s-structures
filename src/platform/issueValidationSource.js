import { issueRow } from './issueRow.js';

export function validationIssues(analysis) {
  const rows = [];
  for (const item of analysis?.validation?.errors || []) rows.push(issueRow('validation', 'NG', item));
  for (const item of analysis?.validation?.warnings || []) rows.push(issueRow('validation', 'WARN', item));
  return rows;
}
