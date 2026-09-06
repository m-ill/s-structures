import { buildAiQaChecklist } from './aiQaChecklist.js';
import { issueRow } from './issueRow.js';

export function qaIssues(model, analysis) {
  return buildAiQaChecklist(model, analysis).items
    .filter((item) => item.status !== 'OK')
    .map((item) => issueRow('qa', item.status, item.label, item.id));
}
