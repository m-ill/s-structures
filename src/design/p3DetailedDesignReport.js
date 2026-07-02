import { buildConnectionDetailedDesignReport } from './connection/detailedReport.js';
import { buildFoundationDetailedDesignReport } from './foundation/detailedReport.js';
import { buildP3ServiceabilityEvidence } from './p3ServiceabilityEvidence.js';
import { buildRcDetailedDesignReport } from './rc/detailedReport.js';
import { buildSteelDetailedDesignReport } from './steel/detailedReport.js';
import {
  DESIGN_FORMULA_REGISTRY_VERSION,
  collectDesignFormulaReferences,
} from '../standards/designFormulaRegistry.js';

export const P3_DETAILED_DESIGN_REPORT_VERSION = 'p3-m18-detailed-design-integration';
export const P3_DETAILED_DESIGN_GATE_VERSION = 'p3-m18-detailed-design-gate-v1';

export function buildP3DetailedDesignReport(model, analysis, options = {}) {
  const analysisStatus = buildAnalysisStatus(analysis);
  const rc = buildRcDetailedDesignReport(model, analysis, options.rc || options);
  const steel = buildSteelDetailedDesignReport(model, analysis, options.steel || options);
  const connection = buildConnectionDetailedDesignReport(model, analysis, options.connection || options);
  const foundation = buildFoundationDetailedDesignReport(model, analysis, options.foundation || options);
  const modules = { rc, steel, connection, foundation };
  const serviceability = buildP3ServiceabilityEvidence(model, analysis, modules, options.serviceabilityEvidence || options);
  const issueRows = buildIssueRows(modules);
  const formulaTrace = Object.values(modules).flatMap((module) => module.formulaTrace || []);
  return {
    version: P3_DETAILED_DESIGN_REPORT_VERSION,
    contract: {
      milestone: 'P3-M18',
      tickets: ['P3-T91', 'P3-T92', 'P3-T93', 'P3-T94', 'P3-T95'],
      scope: 'Integrated RC, steel, connection, foundation, issue, formula, and serviceability-hook detailed-design trace.',
      reportUse: 'Top-level issueRows and formulaTrace are the single navigation source for reports and AI-agent review.',
    },
    modelName: model?.meta?.name || null,
    analysisStatus,
    summary: summarize(modules),
    modules,
    serviceability,
    designGate: buildP3DetailedDesignGate(modules, { issueRows, formulaTrace, serviceability, analysisStatus }),
    issueRows,
    formulaTrace,
    formulaRegistryVersion: DESIGN_FORMULA_REGISTRY_VERSION,
    limitations: ['P3-M18 integrates RC, steel, connection, and foundation detailed-design trace modules for agent/report consumption.'],
  };
}

export function buildP3DetailedDesignGate(modules = {}, evidence = {}) {
  const issueRows = evidence.issueRows || buildIssueRows(modules);
  const formulaTrace = evidence.formulaTrace || Object.values(modules).flatMap((module) => module.formulaTrace || []);
  const serviceability = evidence.serviceability || buildP3ServiceabilityEvidence(null, null, modules, evidence);
  const analysisStatus = evidence.analysisStatus || null;
  const coverage = buildTicketCoverage(modules, issueRows, formulaTrace, serviceability);
  const designReview = buildIntegratedDesignReview({ modules, issueRows, formulaTrace, coverage, serviceability, analysisStatus });
  return {
    version: P3_DETAILED_DESIGN_GATE_VERSION,
    milestone: 'P3-M18',
    tickets: ['P3-T91', 'P3-T92', 'P3-T93', 'P3-T94', 'P3-T95'],
    contract: {
      milestone: 'P3-M18',
      tickets: ['P3-T91', 'P3-T92', 'P3-T93', 'P3-T94', 'P3-T95'],
      scope: 'Integrated steel, connection, foundation, formula, issue, and serviceability detailed-design trace gate.',
      featureTicketMap: {
        steelMember: 'P3-T91',
        connectionBasePlate: 'P3-T92',
        foundation: 'P3-T93',
        reportIssueFormula: 'P3-T94',
        serviceabilityHook: 'P3-T95',
      },
      reviewFields: ['summary.ticketCoverage', 'coverage', 'modules', 'issueCount', 'formulaCount', 'unregisteredFormulaCount'],
      agentUse: 'Read-only gate for reports and AI-agent inspection of P3-M18 detailed-design integration.',
      maturity: 'preliminary-integrated-schedule',
    },
    coverage,
    summary: {
      readyForAgentReview: designReview.status === 'trace-ready',
      completeCoverage: coverage.every((row) => row.covered),
      issueCount: issueRows.length,
      formulaCount: formulaTrace.length,
      unregisteredFormulaCount: formulaTrace.filter((row) => row.standard === 'UNREGISTERED').length,
      serviceabilityStatus: serviceability.summary?.covered ? 'trace-ready' : 'review-required',
      analysisStatus,
      moduleStatuses: summarizeModuleStatuses(modules),
      designReview,
      ticketCoverage: coverage,
    },
    modules: Object.fromEntries(Object.entries(modules).map(([id, module]) => [id, {
      version: module.version || null,
      itemCount: module.summary?.itemCount || module.summary?.memberCount || rowsOf(module).length,
      warnCount: module.summary?.warnCount || 0,
      ngCount: module.summary?.ngCount || 0,
    }])),
    issueCount: issueRows.length,
    formulaCount: formulaTrace.length,
    ticketCoverage: coverage,
    designReview,
    serviceability,
    analysisStatus,
    formulaRegistryVersion: DESIGN_FORMULA_REGISTRY_VERSION,
    unregisteredFormulaCount: formulaTrace.filter((row) => row.standard === 'UNREGISTERED').length,
    serviceabilityStatus: serviceability.summary?.covered ? 'trace-ready' : 'review-required',
    limitations: [
      'P3-M18 is a preliminary integrated detailed-design trace gate.',
      'Complete coverage means trace rows and formula links are present; fabrication, geotechnical, permit, and drawing approval remain engineer review scope.',
      'Fabrication detailing, geotechnical settlement, final permits, and construction drawings remain engineer review scope.',
    ],
  };
}

function buildIntegratedDesignReview({ modules, issueRows, formulaTrace, coverage, serviceability, analysisStatus }) {
  const unregisteredFormulaCount = formulaTrace.filter((row) => row.standard === 'UNREGISTERED').length;
  const moduleStatuses = summarizeModuleStatuses(modules);
  const unlinkedIssueCount = issueRows.filter((row) => !(row.formulaIds || []).length).length;
  const missing = [];
  if (analysisStatus && analysisStatus.ok !== true) missing.push('analysis-status');
  if (!coverage.every((row) => row.covered)) missing.push('ticket-coverage');
  if (!formulaTrace.length) missing.push('formula-trace');
  if (unregisteredFormulaCount) missing.push('formula-registry');
  if (unlinkedIssueCount) missing.push('issue-formula-links');
  if (!serviceability?.summary?.covered) missing.push('serviceability-evidence');
  if (issueRows.length) missing.push('design-issues');
  return {
    status: missing.length ? 'review-required' : 'trace-ready',
    maturity: 'preliminary',
    finalPermitDesign: false,
    fabricationReady: false,
    geotechnicalCertified: false,
    analysisOk: analysisStatus?.ok ?? null,
    completeCoverage: coverage.every((row) => row.covered),
    issueCount: issueRows.length,
    unlinkedIssueCount,
    formulaCount: formulaTrace.length,
    unregisteredFormulaCount,
    serviceabilityMissing: serviceability?.summary?.missing || [],
    moduleStatuses,
    missing,
    agentDecision: missing.length ? 'resolve-detailed-design-review-items' : 'm18-ready-for-m19-integrated-results-review',
  };
}

function buildAnalysisStatus(analysis) {
  if (!analysis) return { ok: false, reason: 'analysis-missing' };
  return {
    ok: analysis.ok === true,
    reason: analysis.ok === true ? null : analysis.reason || analysis.error || 'analysis-not-ok',
  };
}

function summarize(modules) {
  const items = Object.values(modules).map((module) => module.summary || {});
  return {
    itemCount: items.reduce((sum, item) => sum + (item.itemCount || item.memberCount || 0), 0),
    warnCount: items.reduce((sum, item) => sum + (item.warnCount || 0), 0),
    ngCount: items.reduce((sum, item) => sum + (item.ngCount || 0), 0),
  };
}

function summarizeModuleStatuses(modules) {
  return Object.entries(modules).map(([id, module]) => ({
    moduleId: id,
    itemCount: module.summary?.itemCount || module.summary?.memberCount || rowsOf(module).length,
    warnCount: module.summary?.warnCount || 0,
    ngCount: module.summary?.ngCount || 0,
    version: module.version || null,
  }));
}

function buildIssueRows(modules) {
  return Object.entries(modules).flatMap(([moduleId, module]) => {
    const rows = module.issueRows || rowsOf(module).filter((row) => row.status && row.status !== 'OK').map((row) => ({
      moduleId,
      itemId: row.memberId || row.nodeId || row.wallId || row.slabId || row.version || row.role || moduleId,
      status: row.status,
      action: `${moduleId} item requires review.`,
    }));
    return rows.map((row) => ({
      moduleId: row.moduleId || moduleId,
      itemId: row.itemId || row.memberId || row.nodeId || row.wallId || row.slabId || moduleId,
      role: row.role || null,
      status: row.status,
      formulaIds: row.formulaIds || collectIssueFormulaIds(module, row),
      action: row.action || `${moduleId} item requires review.`,
    }));
  });
}

function buildTicketCoverage(modules, issueRows, formulaTrace, serviceability) {
  const steelRows = rowsOf(modules.steel || {});
  const connectionRows = rowsOf(modules.connection || {});
  const foundationRows = rowsOf(modules.foundation || {});
  const linkedIssueCount = issueRows.filter((row) => (row.formulaIds || []).length > 0).length;
  return [
    { ticket: 'P3-T91', scope: 'steel', count: steelRows.length, covered: steelRows.length > 0, evidence: `${steelRows.length} steel rows` },
    { ticket: 'P3-T92', scope: 'connection', count: connectionRows.length, covered: connectionRows.length > 0, evidence: `${connectionRows.length} connection rows` },
    { ticket: 'P3-T93', scope: 'foundation', count: foundationRows.length, covered: foundationRows.length > 0, evidence: `${foundationRows.length} foundation rows` },
    {
      ticket: 'P3-T94',
      scope: 'report-issue-formula-link',
      count: linkedIssueCount,
      covered: formulaTrace.length > 0 && (issueRows.length === 0 || linkedIssueCount === issueRows.length),
      evidence: `${formulaTrace.length} formula rows, ${linkedIssueCount}/${issueRows.length} linked issue rows`,
    },
    {
      ticket: 'P3-T95',
      scope: 'serviceability-integration',
      count: serviceability?.rows?.reduce((sum, row) => sum + row.count, 0) || 0,
      covered: !!serviceability?.summary?.covered,
      evidence: `missing ${serviceability?.summary?.missing?.join(', ') || 'none'}`,
    },
  ];
}

function collectIssueFormulaIds(module, issue) {
  const itemId = issue.itemId || issue.memberId || issue.nodeId || issue.wallId || issue.slabId;
  if (!itemId) return (module.formulaTrace || []).map((row) => row.formulaId).filter(Boolean);
  const match = rowsOf(module).find((row) => [row.memberId, row.nodeId, row.wallId, row.slabId, row.version, row.role].includes(itemId));
  if (!match) return [];
  return (match.formulaTrace || collectDesignFormulaReferences(match, {
    id: match.memberId || match.nodeId || match.wallId || match.slabId || match.role,
    role: match.role,
  })).map((row) => row.formulaId).filter(Boolean);
}

function rowsOf(module) {
  const schedules = module.schedules || {};
  return [
    ...(module.rows || []),
    ...(schedules.beams || []),
    ...(schedules.columns || []),
    ...(schedules.walls || []),
    ...(schedules.slabs || []),
    ...(module.footings || []),
    ...(module.piles || []),
    ...(module.basePlates || []),
    ...(module.combined ? [module.combined] : []),
    ...(module.mat ? [module.mat] : []),
  ];
}
