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
  const summary = buildIntegratedSummary({
    analysis,
    nonlinear,
    design,
    workflowLock,
    integratedGate,
  });
  return {
    version: P3_INTEGRATED_RESULTS_VERSION,
    contract: buildIntegratedContract(integratedGate),
    integratedGate,
    summary,
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
  const ticketCoverage = buildTicketCoverage(input);
  const coverage = buildCoverage(input);
  const workflow = buildWorkflowSummary(input.workflowLock);
  const ok = !!input.analysis?.ok
    && !!benchmarkEvidence.ok
    && (input.methodLimitations || []).length > 0
    && ticketCoverage.every((row) => row.covered);
  return {
    version: P3_INTEGRATED_RESULTS_GATE_VERSION,
    milestone: 'P3-M19',
    tickets: ['P3-T58', 'P3-T59', 'P3-T61', 'P3-T62'],
    contract: {
      milestone: 'P3-M19',
      tickets: ['P3-T58', 'P3-T59', 'P3-T61', 'P3-T62'],
      scope: 'Integrated result, report, workflow, and benchmark regression gate.',
      featureTicketMap: {
        integratedResultPostprocessing: 'P3-T58',
        calculationReportMethodLimitations: 'P3-T59',
        workflowLock: 'P3-T61',
        benchmarkRegression: 'P3-T62',
      },
      reviewFields: ['summary.ticketCoverage', 'ticketCoverage', 'coverage', 'workflow', 'benchmarkEvidence'],
      agentUse: 'Read-only gate for reports and AI-agent inspection of integrated Phase 3 result readiness.',
    },
    ok,
    resultContract: {
      postprocessingVersion: input.resultPostprocessing?.version || null,
      nonlinearVersion: input.nonlinear?.version || null,
      designVersion: input.design?.version || null,
      workflowLockVersion: input.workflowLock?.version || null,
    },
    summary: buildGateSummary({ ok, ticketCoverage, coverage, workflow, benchmarkEvidence }),
    ticketCoverage,
    coverage,
    workflow,
    benchmarkEvidence,
    reportChapters: ['detailed-report-phase3', 'calculation-package-phase3'],
    limitations: [
      'P3-M19 integrates trace contracts for review and launch-gate evidence.',
      'Final sign-off still requires owner review, project-specific assumptions, and engineer approval.',
    ],
  };
}

function buildIntegratedSummary(input) {
  return {
    analysisOk: !!input.analysis?.ok,
    nonlinearVersion: input.nonlinear.version,
    designItems: input.design.summary.itemCount,
    issueRows: input.design.issueRows.length,
    notCheckedCount: countNotChecked(input.design),
    workflowLocked: input.workflowLock.locked,
    gateOk: input.integratedGate.ok,
    readyForReviewer: input.integratedGate.summary.readyForReviewer,
    completeTicketCoverage: input.integratedGate.summary.completeTicketCoverage,
    benchmarkOk: input.integratedGate.summary.benchmarkOk,
    methodLimitationCount: input.integratedGate.summary.methodLimitationCount,
  };
}

function buildIntegratedContract(gate) {
  return {
    milestone: 'P3-M19',
    gateVersion: gate.version,
    tickets: gate.tickets,
    readApi: 'getP3IntegratedResults',
    reportSections: gate.reportChapters,
    reviewFields: [
      'summary.readyForReviewer',
      'integratedGate.ticketCoverage',
      'integratedGate.coverage',
      'integratedGate.workflow',
      'methodLimitations',
    ],
  };
}

function buildCoverage(input) {
  return {
    storyRows: input.resultPostprocessing?.summary?.storyRowCount || 0,
    memberRows: input.resultPostprocessing?.summary?.memberRowCount || 0,
    capacityPoints: input.nonlinear?.capacityCurve?.length || 0,
    nonlinearStepRows: input.nonlinear?.steps?.length || 0,
    designItems: input.design?.summary?.itemCount || 0,
    issueRows: input.design?.issueRows?.length || 0,
    methodLimitations: input.methodLimitations?.length || 0,
  };
}

function buildWorkflowSummary(workflowLock) {
  return {
    locked: !!workflowLock?.locked,
    editable: workflowLock?.editable !== false,
    approvalState: workflowLock?.approvalState || 'not-submitted',
    revocable: !!workflowLock && workflowLock.approvalState !== 'not-submitted',
  };
}

function buildGateSummary(input) {
  const completeTicketCoverage = input.ticketCoverage.every((row) => row.covered);
  return {
    ok: input.ok,
    readyForReviewer: input.ok && completeTicketCoverage,
    completeTicketCoverage,
    benchmarkOk: !!input.benchmarkEvidence.ok,
    ticketCount: input.ticketCoverage.length,
    coveredTicketCount: input.ticketCoverage.filter((row) => row.covered).length,
    methodLimitationCount: input.coverage.methodLimitations,
    nonlinearStepRows: input.coverage.nonlinearStepRows,
    capacityPoints: input.coverage.capacityPoints,
    designIssueRows: input.coverage.issueRows,
    workflowLocked: input.workflow.locked,
    workflowApprovalState: input.workflow.approvalState,
    ticketCoverage: input.ticketCoverage,
  };
}

function buildTicketCoverage(input) {
  const benchmarkEvidence = input.benchmarkEvidence || {};
  const methodLimitations = input.methodLimitations || [];
  return [
    {
      ticket: 'P3-T58',
      scope: 'integrated-result-postprocessing',
      covered: !!input.resultPostprocessing?.version && !!input.nonlinear?.version && !!input.design?.version,
      evidence: `${input.resultPostprocessing?.summary?.storyRowCount || 0} story rows, ${input.nonlinear?.capacityCurve?.length || 0} capacity points`,
    },
    {
      ticket: 'P3-T59',
      scope: 'calculation-report-method-limitations',
      covered: methodLimitations.length > 0,
      evidence: `${methodLimitations.length} method/limitation rows`,
    },
    {
      ticket: 'P3-T61',
      scope: 'workflow-lock',
      covered: !!input.workflowLock?.version,
      evidence: `${input.workflowLock?.approvalState || 'not-submitted'} / editable=${input.workflowLock?.editable !== false}`,
    },
    {
      ticket: 'P3-T62',
      scope: 'benchmark-regression',
      covered: !!benchmarkEvidence.ok,
      evidence: Object.entries(benchmarkEvidence.groups || {}).map(([key, ok]) => `${key}:${ok ? 'OK' : 'NG'}`).join(', '),
    },
  ];
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
    contract: {
      milestone: 'P3-M19',
      groups: Object.keys(groups),
      runner: 'full milestone regression',
    },
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
