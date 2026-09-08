import { buildDetailedReportData } from './detailedReportData.js';
import { buildPhase7AnalysisRunSummary } from '../../report/phase7AnalysisRuns.js';
import { createReportSnapshot } from '../../report/phase11/reportSnapshot.js';
import { formatLength as length } from '../../report/reportFormat.js';
export const CALCULATION_PACKAGE_VERSION = 'm42-calculation-package';
export function buildCalculationPackageData(model, analysis, options = {}) {
  const detailed = buildDetailedReportData(model, analysis, options);
  const analysisRuns = buildPhase7AnalysisRunSummary(options);
  const qualityAudit = auditPackage(detailed, analysisRuns);
  const reportSnapshot = createReportSnapshot(model, analysis, {
    detailed,
    qualityAudit,
    analysisRuns,
    calculationPackageVersion: CALCULATION_PACKAGE_VERSION,
    projectId: options.projectId,
    sourceRevision: options.sourceRevision,
    buildId: options.buildId,
    externalValidation: options.externalValidation,
    phase10Eligibility: options.phase10Eligibility,
    limitationCodes: options.limitationCodes,
  });
  const sections = [
    { id: 'cover', title: 'Cover' },
    { id: 'toc', title: 'Table of Contents' },
    { id: 'basis', title: 'Design Basis And Loads' },
    { id: 'analysis', title: 'Elastic Analysis Summary' },
    { id: 'phase3', title: 'Phase 3 Integrated Results' },
    { id: 'members', title: 'Member Design Summary' },
    { id: 'detailing', title: 'Detailing And Foundation Summary' },
    { id: 'appendix', title: 'Appendix' },
  ];
  return {
    version: CALCULATION_PACKAGE_VERSION,
    generatedAt: options.generatedAt || detailed.generatedAt,
    title: options.title || detailed.title,
    project: {
      name: model?.meta?.name || options.projectName || detailed.title,
      engineer: options.engineer || '',
      reviewer: options.reviewer || '',
      purpose: options.purpose || 'Review issue',
    },
    sections,
    detailed,
    analysisRuns,
    resultSelection: options.resultSelection || null,
    qualityAudit,
    reportSnapshot,
    reportVerdict: reportSnapshot.verdict,
  };
}


export function auditPackage(detailed, analysisRuns) {
  const items = [
    { name: 'Load derivation attached', status: detailed.loadDerivation ? 'OK' : 'Missing' },
    { name: 'Combination results available', status: detailed.combinationResults.length ? 'OK' : 'Missing' },
    { name: 'Member checks available', status: detailed.memberChecks.length ? 'OK' : 'Missing' },
    { name: 'RC schedule available', status: detailed.rcDetailing.rows.length ? 'OK' : 'Not applicable' },
    { name: 'Steel schedule available', status: detailed.steelDetailing.rows.length ? 'OK' : 'Not applicable' },
    { name: 'Foundation review available', status: detailed.connectionFoundation.foundationRows.length ? 'OK' : 'Missing' },
    { name: 'Phase 3 integrated results available', status: detailed.phase3IntegratedResults ? 'OK' : 'Missing' },
    { name: 'Phase 5 analysis cases listed', status: detailed.analysisCases ? 'OK' : 'Missing' },
    { name: 'Analysis run provenance records', status: analysisRuns.rows.length ? 'OK' : 'Not applicable' },
    { name: 'Verified-only design transfer guard', status: analysisRuns.designTransferGuardOk ? 'OK' : 'Review' },
    { name: 'Phase 3 default not-checked cleanup', status: detailed.phase3IntegratedResults?.summary?.notCheckedCount === 0 ? 'OK' : 'Review' },
  ];
  return {
    items,
    ok: items.every((item) => item.status === 'OK' || item.status === 'Not applicable'),
    limitations: [
      'Print-ready HTML is intended for browser PDF output.',
      'Final sealed calculation packages require project-specific engineering review.',
      'Unsupported checks remain listed in the appendix rather than hidden.',
      ...(analysisRuns.summary.preliminaryOrCandidateCount
        ? ['Preliminary and candidate analysis runs are excluded from design transfer.']
        : []),
    ],
  };
}
