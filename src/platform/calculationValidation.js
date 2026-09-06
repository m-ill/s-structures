import { buildMemberDesignTraceReport } from '../design/memberDesignTrace.js';
import { calculationChecks, calculationStatus } from './calculationChecks.js';
import { buildResultTableValidation } from './resultTableValidation.js';
import { buildIssueRegistry } from './issueRegistry.js';

export const CALC_VALIDATION_VERSION = 'p2-t41-t43-calculation-validation';

export function buildCalculationValidation(model, analysis, options = {}) {
  const resultTables = buildResultTableValidation(model, analysis, options.resultPostprocessing || {});
  const trace = buildMemberDesignTraceReport(model, analysis, options.memberTrace || {});
  const issues = buildIssueRegistry(model, analysis, options.issueRegistry || {});
  const checks = calculationChecks(model, analysis, resultTables, trace, issues);
  return {
    version: CALC_VALIDATION_VERSION,
    tickets: ['T41', 'T42', 'T43'],
    status: calculationStatus(checks, trace.summary, issues.summary),
    checks,
    traceSummary: trace.summary,
    issueSummary: issues.summary,
  };
}
