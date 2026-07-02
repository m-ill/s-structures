import { buildP3DetailedDesignReport } from '../design/p3DetailedDesignReport.js';
import { buildNonlinearAnalysisTrace } from '../nonlinear/trace.js';
import { buildWorkflowLockState } from '../platform/workflowLock.js';
import { buildResultPostprocessing } from './resultPostprocessing.js';

export const P3_INTEGRATED_RESULTS_VERSION = 'p3-m19-integrated-results';

export function buildP3IntegratedResults(model, analysis, options = {}) {
  const resultPostprocessing = buildResultPostprocessing(model, analysis, options.resultPostprocessing || {});
  const nonlinear = buildNonlinearAnalysisTrace(model, options.nonlinear || {});
  const design = buildP3DetailedDesignReport(model, analysis, options.design || {});
  const workflowLock = buildWorkflowLockState(model);
  return {
    version: P3_INTEGRATED_RESULTS_VERSION,
    summary: {
      analysisOk: !!analysis?.ok,
      nonlinearVersion: nonlinear.version,
      designItems: design.summary.itemCount,
      issueRows: design.issueRows.length,
      notCheckedCount: countNotChecked(design),
      workflowLocked: workflowLock.locked,
    },
    resultPostprocessing,
    nonlinear,
    design,
    workflowLock,
    methodLimitations: buildMethodLimitations(nonlinear, design),
  };
}

function countNotChecked(design) {
  return JSON.stringify(design).match(/not checked|Not checked|UNCK/g)?.length || 0;
}

function buildMethodLimitations(nonlinear, design) {
  return [
    ...(nonlinear.limitations || []),
    ...(design.limitations || []),
    ...Object.values(design.modules || {}).flatMap((module) => module.limitations || []),
  ];
}
