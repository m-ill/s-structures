import { buildCalculationValidation } from './calculationValidation.js';
import { buildIssueRegistry } from './issueRegistry.js';
import { buildPDeltaPracticeValidation } from './pDeltaPracticeValidation.js';
import { buildResultTableValidation } from './resultTableValidation.js';

export const PRACTICE_VALIDATION_REPORT_VERSION = 'p2-t25-t50-practice-validation';

export function buildPracticeValidationReport(model, analysis, options = {}) {
  const pDelta = buildPDeltaPracticeValidation(model, analysis);
  const resultTables = buildResultTableValidation(model, analysis, options.resultPostprocessing || {});
  const calculation = buildCalculationValidation(model, analysis, options.calculation || {});
  const issues = buildIssueRegistry(model, analysis, options.issueRegistry || {});
  return {
    version: PRACTICE_VALIDATION_REPORT_VERSION,
    tickets: ['T25', 'T26', 'T30', 'T31', 'T41', 'T42', 'T43'],
    status: statusOf([pDelta, resultTables, calculation]),
    pDelta,
    resultTables,
    calculation,
    issues,
  };
}

function statusOf(parts) {
  if (parts.some((item) => item.status === 'NG')) return 'NG';
  if (parts.some((item) => item.status === 'WARN')) return 'WARN';
  return 'OK';
}
