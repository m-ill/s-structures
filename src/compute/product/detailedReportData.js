import { materialOf, sectionOf } from '../../core/catalogs.js';
import { factorText } from '../../core/combinations.js';
import { buildConnectionFoundationReport } from '../../design/connectionFoundation.js';
import { buildDesignDemandPackage } from '../../design/designDemandPackage.js';
import { buildMemberDesignTraceReport } from '../../design/memberDesignTrace.js';
import { buildP3DetailedDesignReport } from '../../design/p3DetailedDesignReport.js';
import { buildRcDetailingReport } from '../../design/rcDetailing.js';
import { buildServiceabilityDriftReport } from '../../design/serviceability.js';
import { buildSteelDetailingReport } from '../../design/steelDetailing.js';
import { buildNonlinearAnalysisTrace } from '../../nonlinear/trace.js';
import { buildP3IntegratedResults } from '../../results/p3IntegratedResults.js';
import { buildAdvancedElasticTrace } from '../../results/advancedElasticTrace.js';
import { buildResultPostprocessing } from '../../results/resultPostprocessing.js';
import { buildWallSlabEquivalentTrace } from '../../solver/wallSlabEquivalent.js';
import { buildFoundationResponseReport } from '../../report/foundationResponse.js';
import { buildLinearThaReport } from '../../report/linearThaReport.js';
import { buildMembraneWorkflowReport } from '../../report/membraneWorkflowReport.js';
import { buildPlateWorkflowReport } from '../../report/plateWorkflowReport.js';
import { buildShellStabilizationReport } from '../../report/shellStabilizationReport.js';
import { buildPushoverQualificationReport } from '../../report/pushoverQualificationReport.js';
import { buildPracticePlatformReadiness } from '../../platform/practicePlatformReadiness.js';
import { buildPracticeValidationReport } from '../../platform/practiceValidationReport.js';
import { buildKdsLoadStandardAudit, defaultKdsCombinationLimitations, KDS_LOAD_COMBINATION_VERSION, KDS_LOAD_STANDARD_REGISTRY_VERSION, summarizeKdsLoadCombinationCoverage } from '../../core/kdsLoadCombinations.js';
import { analysisStatus, finiteNumber as finite, formatForce, formatLength, formatNumber as format, formatRatio } from '../../report/reportFormat.js';
export const DETAILED_REPORT_VERSION = 'm34-detailed-design-report';
export function buildDetailedReportData(model, analysis, options = {}) {
  const activeResult = pickResult(analysis, options.resultId);
  const loadCases = summarizeLoadCases(model);
  const combinations = summarizeCombinations(model);
  const combinationResults = summarizeCombinationResults(model, analysis);
  const memberChecks = summarizeMemberChecks(model, analysis, activeResult.result);
  const governingMembers = memberChecks
    .filter((row) => Number.isFinite(row.utilization))
    .sort((a, b) => b.utilization - a.utilization)
    .slice(0, options.governingLimit || 20);
  const analysisCaseResults = options.analysisResults || options.analysisCaseResults || {};

  return {
    version: DETAILED_REPORT_VERSION,
    generatedAt: options.generatedAt || new Date().toISOString(),
    title: options.title || model?.meta?.name || 'S-Structures Detailed Report',
    scope: {
      status: analysisStatus(analysis),
      phase: 'calculation-trace-scaffold',
      statement: 'This report traces the current elastic analysis and preliminary member checks. It is not a sealed final design package.',
      missingScopes: defaultMissingScopes(options.missingScopes),
    },
    codeBasis: {
      loadCombinationPresetVersion: KDS_LOAD_COMBINATION_VERSION,
      loadStandardRegistryVersion: KDS_LOAD_STANDARD_REGISTRY_VERSION,
      loadCombinationCoverage: summarizeKdsLoadCombinationCoverage(model),
      loadStandardAudit: buildKdsLoadStandardAudit(model),
      limitations: defaultKdsCombinationLimitations(),
    },
    model: summarizeModel(model),
    loadDerivation: summarizeLoadDerivation(model),
    loadCases,
    combinations,
    analysis: {
      ok: !!analysis?.ok,
      status: analysisStatus(analysis),
      resultId: activeResult.id,
      comboCount: analysis?.combos?.length || 0,
      errorCount: analysis?.validation?.errors?.length || 0,
      warningCount: analysis?.validation?.warnings?.length || 0,
      modelHealthScore: analysis?.validation?.modelHealthScore ?? null,
      auditOk: analysis?.audit?.ok ?? null,
      maxEquilibriumResidual: analysis?.audit?.maxEquilibriumResidual ?? null,
      maxDisplacement: activeResult.result?.dmax ?? analysis?.envelope?.dmax ?? null,
      maxUtilization: analysis?.design?.summary?.maxUtilization ?? analysis?.envelope?.maxRatio ?? null,
      governing: analysis?.design?.summary?.governing || analysis?.envelope?.governing?.maxUtilization || null,
    },
    analysisCases: summarizeAnalysisCases(model, analysisCaseResults),
    linearTha: buildLinearThaReport(analysisCaseResults),
    membraneWorkflow: buildMembraneWorkflowReport(options.membraneWorkflow || {}),
    plateWorkflow: buildPlateWorkflowReport(options.plateWorkflow || {}),
    shellStabilization: buildShellStabilizationReport(options.shellStabilization?.qualification || options.shellStabilization || null),
    pushoverQualification: buildPushoverQualificationReport(options.pushoverQualification || {}),
    combinationResults,
    foundationResponse: buildFoundationResponseReport(model, activeResult.result, analysis),
    advancedElasticTrace: buildAdvancedElasticTrace(model, analysis),
    equivalentShellTrace: buildWallSlabEquivalentTrace(model, analysis),
    designDemandPackage: analysis?.design?.demandPackage || buildDesignDemandPackage(model, analysis),
    serviceability: buildServiceabilityDriftReport(model, analysis, options.serviceability || {}),
    resultPostprocessing: buildResultPostprocessing(model, analysis, options.resultPostprocessing || {}),
    practicePlatform: buildPracticePlatformReadiness(model, analysis, options.workflow || {}),
    practiceValidation: buildPracticeValidationReport(model, analysis, options.practiceValidation || {}),
    memberChecks,
    governingMembers,
    memberDesignTrace: buildMemberDesignTraceReport(model, analysis),
    phase3IntegratedResults: buildP3IntegratedResults(model, analysis, options.phase3 || {}),
    phase3DetailedDesign: buildP3DetailedDesignReport(model, analysis, options.phase3Design || {}),
    nonlinearTrace: buildNonlinearAnalysisTrace(model, options.nonlinear || {}),
    rcDetailing: buildRcDetailingReport(model, analysis),
    steelDetailing: buildSteelDetailingReport(model, analysis),
    connectionFoundation: buildConnectionFoundationReport(model, analysis),
    messages: collectMessages(analysis),
    actionItems: buildActionItems(model, analysis, memberChecks),
  };
}


export function summarizeAnalysisCases(model, analysisResults = {}) {
  const cases = model?.analysisCases || [];
  const results = analysisResults || {};
  const rows = cases.map((item) => {
    const result = results[item.id] || null;
    const summary = result?.summary || item.lastRun?.summary || {};
    return {
      id: item.id,
      name: item.name || item.id,
      kind: item.kind,
      status: item.status || 'not-run',
      lastRunStatus: result?.status || item.lastRun?.status || null,
      view: result?.view || null,
      engineId: result?.engine?.id || result?.payload?.engine?.id || item.engineId || item.lastRun?.engineId || null,
      qualification: result?.qualification || item.lastRun?.qualification || null,
      modelBound: result?.modelBound ?? result?.payload?.modelBound ?? item.lastRun?.modelBound ?? null,
      designBlocked: result?.designBlocked === true || result?.payload?.designBlocked === true || item.lastRun?.designBlocked === true,
      summaryText: formatAnalysisCaseSummary(item.kind, summary),
      detail: formatAnalysisCaseDetail(item, result),
    };
  });
  return {
    caseCount: cases.length,
    resultCount: Object.keys(results).length,
    notRunCount: rows.filter((row) => row.detail.status === 'not-run').length,
    rows,
  };
}


export function formatAnalysisCaseSummary(kind, summary = {}) {
  if (!summary || !Object.keys(summary).length) return '-';
  if (kind === 'static') return `combos ${summary.comboCount ?? '-'}, pDelta ${summary.pDelta ? 'yes' : 'no'}`;
  if (kind === 'modal') return `modes ${summary.modeCount ?? '-'}, T1 ${format(summary.firstPeriod)}`;
  if (kind === 'responseSpectrum') return `${summary.method || '-'} ${Array.isArray(summary.directions) ? summary.directions.join('/') : '-'}, mass ${formatRatio(summary.maxParticipatingMassRatio)}`;
  if (kind === 'buckling') return `CLF ${format(summary.criticalLoadFactor)}, ${summary.status || '-'}`;
  if (kind === 'linearTha' || kind === 'nlth') return `rows ${summary.rowCount ?? '-'}, max d ${formatLength(summary.maxDisplacement)}`;
  if (kind === 'pushover') return `steps ${summary.stepCount ?? '-'}, max V ${formatForce(summary.maxBaseShear)}`;
  return JSON.stringify(summary);
}


export function formatAnalysisCaseDetail(item, result) {
  if (!result) {
    return {
      status: 'not-run',
      headline: 'not run',
      rows: [['Result', 'not run']],
      limitations: ['Analysis case is defined but has not been executed in the current result set.'],
    };
  }
  if (result.status === 'failed' || result.error?.message) {
    return {
      status: result.status || 'failed',
      headline: result.error?.message || result.message || 'failed',
      rows: [['Message', result.error?.message || result.message || 'failed']],
      limitations: [],
    };
  }
  const payload = result.payload || {};
  const summary = result.summary || {};
  const base = {
    status: result.status || 'ok',
    headline: formatAnalysisCaseSummary(item.kind, summary),
    rows: [],
    limitations: [],
  };
  if (item.kind === 'modal') {
    const modes = payload.modes || [];
    base.rows = modes.slice(0, 8).map((mode) => [
      `Mode ${mode.index ?? mode.id ?? '-'}`,
      `T ${format(mode.period)} s, Hz ${format(mode.frequencyHz)}, mass X ${formatRatio(mode.participatingMassRatioX ?? mode.participatingMassRatio)}, mass Y ${formatRatio(mode.participatingMassRatioY)}`,
    ]);
    if (!base.rows.length) base.rows = [['Modes', 'No modal rows available']];
    return base;
  }
  if (item.kind === 'responseSpectrum') {
    const combined = Object.entries(payload.combined || {});
    base.rows = combined.map(([direction, row]) => [
      direction,
      `mass ${formatRatio(row.participatingMassRatio)}, max modal d ${formatLength(row.maxModalDisplacement)}, combined d ${formatLength(row.combinedDisplacement ?? row.displacement)}`,
    ]);
    if (!base.rows.length) base.rows = [['Response spectrum', payload.review?.missing?.join(', ') || 'No combined response rows available']];
    if (payload.review?.status) base.limitations.push(`Review status: ${payload.review.status}`);
    return base;
  }
  if (item.kind === 'buckling') {
    base.rows = [
      ['Critical load factor', format(payload.criticalLoadFactor)],
      ['Reference compression rows', String((payload.referenceCompression || []).length)],
      ['Status', payload.status || result.status || '-'],
    ];
    if (!payload.modeShape) base.limitations.push('Buckling mode shape is not available in the current trace.');
    return base;
  }
  if (item.kind === 'pushover') {
    base.rows = [
      ...nonlinearGovernanceRows(result, payload),
      ['Steps', String(payload.summary?.stepCount || (payload.curve || []).length || 0)],
      ['Max base shear', formatForce(payload.summary?.maxBaseShear)],
      ['Max control displacement', formatLength(payload.summary?.maxControlDisplacement)],
      ['Yielded / ultimate members', `${payload.summary?.yieldedMemberCount || 0} / ${payload.summary?.ultimateMemberCount || 0}`],
    ];
    base.limitations.push('Pushover case is preliminary and requires engineering review before design acceptance.');
    return base;
  }
  if (item.kind === 'nlth' || item.kind === 'linearTha') {
    const rowCount = summary.rowCount ?? ((payload.rows || []).length || 0);
    const maxDisplacement = summary.maxDisplacement ?? (payload.maxDisplacement ?? payload.summary?.maxAbsDisplacement);
    base.rows = [
      ...(item.kind === 'nlth' ? nonlinearGovernanceRows(result, payload) : []),
      ['Rows', String(rowCount)],
      ['Max displacement', formatLength(maxDisplacement)],
      ['dt', format(payload.dt)],
      ['Converged', payload.converged == null ? '-' : payload.converged ? 'yes' : 'review'],
    ];
    base.limitations.push(item.kind === 'nlth'
      ? 'NLTH case uses the current preliminary SDOF/bilinear trace.'
      : 'Linear THA case uses modal superposition trace rows.');
    return base;
  }
  if (item.kind === 'static') {
    const comboCount = summary.comboCount ?? (Object.keys(payload.byCombo || {}).length || 0);
    base.rows = [
      ['Combos', String(comboCount)],
      ['P-Delta', summary.pDelta ? 'yes' : 'no'],
      ['Envelope', payload.envelope ? 'available' : 'not available'],
    ];
    return base;
  }
  base.rows = [['Summary', base.headline || '-']];
  return base;
}


export function nonlinearGovernanceRows(result = {}, payload = {}) {
  return [
    ['Engine', result.engine?.id || payload.engine?.id || '-'],
    ['Qualification', result.qualification || payload.qualification || 'legacy-preliminary'],
    ['Model bound', String(result.modelBound ?? payload.modelBound ?? '-')],
    ['Design blocked', (result.designBlocked || payload.designBlocked) ? 'yes' : 'no'],
  ];
}


export function summarizeModel(model) {
  const bounds = modelBounds(model);
  return {
    schemaVersion: model?.schemaVersion || null,
    units: model?.units || {},
    unitsText: Object.entries(model?.units || {}).map(([key, value]) => `${key}:${value}`).join(', ') || '-',
    nodeCount: model?.nodes?.length || 0,
    memberCount: model?.members?.length || 0,
    loadCount: model?.loads?.length || 0,
    loadCaseCount: model?.loadCases?.length || 0,
    combinationCount: model?.loadCombinations?.length || 0,
    bounds,
    boundsText: `${format(bounds.size.x)} / ${format(bounds.size.y)} / ${format(bounds.size.z)}`,
  };
}


export function modelBounds(model) {
  const nodes = model?.nodes || [];
  if (!nodes.length) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, size: { x: 0, y: 0, z: 0 } };
  const min = {
    x: Math.min(...nodes.map((node) => finite(node.x, 0))),
    y: Math.min(...nodes.map((node) => finite(node.y, 0))),
    z: Math.min(...nodes.map((node) => finite(node.z, 0))),
  };
  const max = {
    x: Math.max(...nodes.map((node) => finite(node.x, 0))),
    y: Math.max(...nodes.map((node) => finite(node.y, 0))),
    z: Math.max(...nodes.map((node) => finite(node.z, 0))),
  };
  return { min, max, size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z } };
}


export function summarizeLoadCases(model) {
  return (model?.loadCases || []).map((loadCase) => {
    const loads = (model?.loads || []).filter((load) => (load.case || model.loadCases?.[0]?.id) === loadCase.id);
    const total = [0, 0, 0];
    const moment = [0, 0, 0];
    for (const load of loads) {
      const vector = loadVector(model, load);
      for (let i = 0; i < 3; i += 1) {
        total[i] += vector.force[i];
        moment[i] += vector.moment[i];
      }
    }
    return {
      id: loadCase.id,
      name: loadCase.name || loadCase.id,
      type: loadCase.type || 'other',
      loadCount: loads.length,
      total,
      moment,
    };
  });
}


export function loadVector(model, load) {
  const dir = directionVector(load.direction || load.dir);
  const force = [0, 0, 0];
  const moment = [0, 0, 0];
  if (load.type === 'moment' || load.M != null) {
    const value = finite(load.M, 0);
    for (let i = 0; i < 3; i += 1) moment[i] += dir[i] * value;
    return { force, moment };
  }
  const magnitude = load.w != null
    ? finite(load.w, 0) * memberLength(model, load.member)
    : finite(load.P, 0);
  for (let i = 0; i < 3; i += 1) force[i] += dir[i] * magnitude;
  return { force, moment };
}


export function directionVector(value) {
  if (Array.isArray(value)) return [finite(value[0], 0), finite(value[1], 0), finite(value[2], 0)];
  const dir = String(value || '-z').toLowerCase();
  const sign = dir.startsWith('-') ? -1 : 1;
  const axis = dir.replace(/^[+-]/, '');
  if (axis === 'x') return [sign, 0, 0];
  if (axis === 'y') return [0, sign, 0];
  return [0, 0, sign];
}


export function memberLength(model, memberId) {
  const member = (model?.members || []).find((item) => item.id === memberId);
  const n1 = (model?.nodes || []).find((node) => node.id === member?.n1);
  const n2 = (model?.nodes || []).find((node) => node.id === member?.n2);
  if (!n1 || !n2) return 1;
  return Math.hypot(finite(n2.x, 0) - finite(n1.x, 0), finite(n2.y, 0) - finite(n1.y, 0), finite(n2.z, 0) - finite(n1.z, 0));
}


export function summarizeLoadDerivation(model) {
  const estimation = model?.loadEstimation;
  if (!estimation) return null;
  return {
    version: estimation.version || null,
    occupancy: estimation.basis?.occupancy || null,
    occupancyLabel: estimation.basis?.occupancyLabel || null,
    summary: estimation.summary || null,
    gravity: estimation.storyLoads?.gravity || [],
    lateral: estimation.storyLoads?.lateral || [],
    derivationTrace: estimation.derivationTrace || null,
    limitations: estimation.limitations || [],
  };
}


export function summarizeCombinations(model) {
  return (model?.loadCombinations || []).map((combo) => ({
    id: combo.id,
    name: combo.name || combo.id,
    type: combo.type || 'strength',
    factors: { ...(combo.factors || {}) },
    factorsText: factorText(combo.factors || {}),
    basis: combo.basis || combo.codeReference || combo.generatedBy || null,
    ruleText: combo.ruleTrace
      ? [combo.ruleTrace.sourcePreset, combo.ruleTrace.lateralCaseId, combo.ruleTrace.sign].filter(Boolean).join(' / ')
      : null,
  }));
}


export function summarizeCombinationResults(model, analysis) {
  return (analysis?.combos || model?.loadCombinations || []).map((combo) => {
    const result = analysis?.byCombo?.[combo.id] || null;
    return {
      id: combo.id,
      name: combo.name || combo.id,
      type: combo.type || 'strength',
      ok: !!result?.ok && !!result?.anyOk,
      maxDisplacement: result?.dmax ?? null,
      maxUtilization: result?.maxRatio ?? null,
      totalLoad: result?.summary?.totalLoad || null,
      totalReaction: result?.summary?.totalReaction || null,
      equilibriumResidual: result?.summary?.equilibriumResidual ?? null,
    };
  });
}


export function summarizeMemberChecks(model, analysis, resultSet) {
  const demands = resultSet?.memberResults || analysis?.envelope?.memberResults || {};
  const design = {
    ...(analysis?.design?.steel?.memberResults || {}),
    ...(analysis?.design?.concrete?.memberResults || {}),
  };
  return (model?.members || []).map((member) => {
    const demand = demands[member.id] || {};
    const check = design[member.id] || demand;
    const material = materialOf(model, member.matId);
    const section = sectionOf(model, member.secId);
    return {
      memberId: member.id,
      role: check.role || member.type || 'member',
      material: material?.name || member.matId || '-',
      section: section?.name || member.secId || '-',
      status: check.status || demand.check?.status || 'UNCK',
      utilization: finite(check.utilization, demand.check?.ratio, null),
      governingCheck: check.governingCheck || demand.check?.governing || null,
      comboId: check.comboId || demand.check?.comboId || demand.governing?.utilization?.comboId || null,
      station: finite(check.x, demand.governing?.utilization?.x, null),
      demands: {
        N: finite(check.demands?.N, demand.Nmax, null),
        Vy: finite(check.demands?.Vy, demand.Vymax, null),
        Vz: finite(check.demands?.Vz, demand.Vzmax, null),
        My: finite(check.demands?.My, demand.Mymax, null),
        Mz: finite(check.demands?.Mz, demand.Mzmax, null),
      },
      method: check.method || demand.check?.method || null,
      messages: check.messages || [],
    };
  });
}


export function buildActionItems(model, analysis, memberChecks) {
  const out = [];
  if (!model?.loadCases?.length) out.push('Define load cases before issuing a calculation report.');
  if (!model?.loadCombinations?.length) out.push('Define load combinations before issuing a calculation report.');
  if (analysis?.validation?.errors?.length) out.push('Resolve model validation errors before relying on analysis results.');
  if (memberChecks.some((row) => row.status === 'NG')) out.push('Review members with NG status and revise size, material, or load path.');
  if (!analysis?.design?.summary?.checkedMembers) out.push('No implemented member design checks were completed for this model.');
  if (!out.length) out.push('Review project-specific design basis, load derivation, detailing, connections, and foundation design.');
  return out;
}


export function collectMessages(analysis) {
  const messages = [];
  for (const item of analysis?.validation?.errors || []) messages.push({ level: 'error', code: item.code, message: item.message });
  for (const item of analysis?.validation?.warnings || []) messages.push({ level: 'warning', code: item.code, message: item.message });
  for (const section of [analysis?.design?.steel, analysis?.design?.concrete]) {
    for (const item of section?.warnings || []) {
      messages.push({ level: item.level || 'warning', code: item.code || section.type, message: item.message, target: item.memberId || null });
    }
  }
  return messages;
}


export function defaultMissingScopes(extra = []) {
  return [
    'Project design basis: occupancy, importance factor, site class, exposure, wind/seismic procedure, and serviceability criteria.',
    'Load derivation: dead, live, wind, seismic, snow, rain, soil, temperature, and construction load calculation sheets.',
    'Full KDS equation trace for every generated load combination and project-specific exception.',
    'RC member detailing: longitudinal bars, stirrups, development length, lap splice, anchorage, and constructability checks.',
    'Steel member detailing: compactness, lateral torsional buckling, connection forces, base plates, and weld/bolt checks.',
    'Foundation design: soil bearing, pile/footing design, settlement, uplift, sliding, overturning, and reinforcement.',
    'Drawing import and vision-assisted modeling audit trail for future CAD/image/MGT workflows.',
    ...extra,
  ];
}


export function pickResult(analysis, resultId) {
  if (!analysis) return { id: null, result: null };
  if (resultId && resultId !== 'ENVELOPE') return { id: resultId, result: analysis.byCombo?.[resultId] || analysis.envelope || null };
  if (analysis.pDelta?.envelope) return { id: 'PDELTA_ENVELOPE', result: analysis.pDelta.envelope };
  if (analysis.envelope) return { id: 'ENVELOPE', result: analysis.envelope };
  const firstId = Object.keys(analysis.byCombo || {})[0] || null;
  return { id: firstId, result: firstId ? analysis.byCombo[firstId] : null };
}

