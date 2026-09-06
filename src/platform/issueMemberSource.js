import { buildMemberDesignTraceReport } from '../design/memberDesignTrace.js';
import { issueRow } from './issueRow.js';

export function memberIssues(model, analysis) {
  return buildMemberDesignTraceReport(model, analysis).rows
    .filter((row) => row.status !== 'OK')
    .map((row) => issueRow('member-design', row.status, `${row.memberId} ${row.status}`, row.memberId));
}
