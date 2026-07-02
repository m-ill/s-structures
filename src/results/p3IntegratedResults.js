import { buildP3DetailedDesignReport } from '../design/p3DetailedDesignReport.js';
import { buildNonlinearAnalysisTrace } from '../nonlinear/trace.js';
import { buildWorkflowLockState } from '../platform/workflowLock.js';
import { buildResultPostprocessing } from './resultPostprocessing.js';

export const P3_INTEGRATED_RESULTS_VERSION = 'p3-m19-integrated-results';
export const P3_INTEGRATED_RESULTS_GATE_VERSION = 'p3-m19-integrated-results-gate-v1';

export function buildP3IntegratedResults(model, analysis, options = {}) {
  const resultPostprocessing = buildResultPostprocessing(model, analysis, options.resultPostprocessing || {});
  const nonlinear = buildNonlinearAnalysisTrace(model, options.nonlinear || {});
  const design = buildP3DetailedDesignReport(model, analysis, options.design || {});
  const workflowLock = buildWorkflowLockState(model);
  const benchmarkEvidence = buildBenchmarkEvidence(nonlinear, options.benchmarkEvidence);
  const methodLimitations = buildMethodLimitations(nonlinear, design);
  const integratedGate = buildP3IntegratedResultsGate({
    analysis,
    resultPostprocessing,
    nonlinear,
    design,
    workflowLock,
    benchmarkEvidence,
    methodLimitations,
  });
  return {
    version: P3_INTEGRATED_RESULTS_VERSION,
    integratedGate,
    summary: {
      analysisOk: !!analysis?.ok,
      nonlinearVersion: nonlinear.version,
      designItems: design.summary.itemCount,
      issueRows: design.issueRows.length,
      notCheckedCount: countNotChecked(design),
      workflowLocked: workflowLock.locked,
      gateOk: integratedGate.ok,
    },
    resultPostprocessing,
    nonlinear,
    design,
    workflowLock,
    benchmarkEvidence,
    methodLimitations,
  };
}

export function buildP3IntegratedResultsGate(input = {}) {
  const benchmarkEvidence = input.benchmarkEvidence || {};
  return {
    version: P3_INTEGRATED_RESULTS_GATE_VERSION,
    milestone: 'P3-M19',
    tickets: ['P3-T58', 'P3-T59', 'P3-T61', 'P3-T62'],
    ok: !!input.analysis?.ok && !!benchmarkEvidence.ok && (input.methodLimitations || []).length > 0,
    resultContract: {
      postprocessingVersion: input.resultPostprocessing?.version || null,
      nonlinearVersion: input.nonlinear?.version || null,
      designVersion: input.design?.version || null,
      workflowLockVersion: input.workflowLock?.version || null,
    },
    coverage: {
      storyRows: input.resultPostprocessing?.summary?.storyRowCount || 0,
      memberRows: input.resultPostprocessing?.summary?.memberRowCount || 0,
      capacityPoints: input.nonlinear?.capacityCurve?.length || 0,
      nonlinearStepRows: input.nonlinear?.steps?.length || 0,
      designItems: input.design?.summary?.itemCount || 0,
      issueRows: input.design?.issueRows?.length || 0,
      methodLimitations: input.methodLimitations?.length || 0,
    },
    workflow: {
      locked: !!input.workflowLock?.locked,
      editable: input.workflowLock?.editable !== false,
      approvalState: input.workflowLock?.approvalState || 'not-submitted',
      revocable: !!input.workflowLock && input.workflowLock.approvalState !== 'not-submitted',
    },
    benchmarkEvidence,
    reportChapters: ['detailed-report-phase3', 'calculation-package-phase3'],
    limitations: [
      'P3-M19 integrates trace contracts for review and launch-gate evidence.',
      'Final sign-off still requires owner review, project-specific assumptions, and engineer approval.',
    ],
  };
}

function buildBenchmarkEvidence(nonlinear, evidence = {}) {
  const groups = {
    geometry: nonlinear?.benchmarks?.geometry?.ok ?? false,
    hingeControl: nonlinear?.benchmarks?.hingeControl?.ok ?? false,
    fiberNlth: nonlinear?.benchmarks?.fiberNlth?.ok ?? false,
    ...(evidence.groups || {}),
  };
  return {
    version: evidence.version || 'p3-m19-benchmark-evidence-v1',
    ok: Object.values(groups).every(Boolean),
    groups,
    runner: evidence.runner || 'tests/p3-m19-integrated-report.mjs plus milestone regression',
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
