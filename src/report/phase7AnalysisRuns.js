import { analysisRunCanTransferToDesign } from '../core/analysisRunRecord.js';

export const PHASE7_ANALYSIS_RUN_REPORT_VERSION = 'p7-m11-analysis-run-report-v1';

export function buildPhase7AnalysisRunSummary(options = {}) {
  const store = options.analysisRunStore || options.runStore || { attempts: {}, lastSuccessful: {} };
  const currentModelHash = options.currentModelHash || null;
  const rows = Object.entries(store.attempts || {}).flatMap(([caseId, attempts]) => (attempts || []).map((record, index) => {
    const recordDesignTransferAllowed = record.designTransferAllowed === true;
    const recordEligible = analysisRunCanTransferToDesign(record);
    const currentModelMatches = currentModelHash == null || currentModelHash === record.modelHash;
    return {
      id: record.id || `${caseId}:${index + 1}`,
      caseId: record.caseId || caseId,
      kind: record.kind || record.provenance?.analysisCase?.kind || null,
      runStatus: record.runStatus || 'unknown',
      qualification: record.qualification || 'unknown',
      recordDesignTransferAllowed,
      recordEligible,
      designTransferAllowed: recordEligible && currentModelMatches,
      currentModelMatches,
      startedAt: record.startedAt || null,
      finishedAt: record.finishedAt || null,
      modelHash: record.modelHash || null,
      warningCount: record.warnings?.length || 0,
      failureCode: record.failure?.code || null,
      provenance: summarizeProvenance(record.provenance),
    };
  }));
  const successful = rows.filter((row) => row.runStatus === 'ok');
  const verified = successful.filter((row) => row.qualification === 'verified');
  const blocked = successful.filter((row) => row.qualification !== 'verified');
  const invalidTransfers = rows.filter((row) => row.recordDesignTransferAllowed && !row.recordEligible);
  return {
    version: PHASE7_ANALYSIS_RUN_REPORT_VERSION,
    rows,
    lastSuccessful: Object.fromEntries(Object.entries(store.lastSuccessful || {}).map(([caseId, record]) => [caseId, record?.id || null])),
    summary: {
      attemptCount: rows.length,
      successfulCount: successful.length,
      failedCount: rows.filter((row) => row.runStatus === 'failed').length,
      verifiedCount: verified.length,
      preliminaryOrCandidateCount: blocked.length,
      designTransferAllowedCount: rows.filter((row) => row.designTransferAllowed).length,
      staleModelCount: rows.filter((row) => !row.currentModelMatches).length,
      invalidTransferCount: invalidTransfers.length,
    },
    designTransferGuardOk: invalidTransfers.length === 0,
  };
}

function summarizeProvenance(provenance = {}) {
  return {
    schemaVersion: provenance.schemaVersion ?? null,
    units: provenance.units || provenance.unitSystem || null,
    analysisCaseId: provenance.analysisCase?.id || null,
    combinationId: provenance.combination?.id || provenance.analysisCase?.settings?.comboId || null,
    materialRefs: provenance.referencedMaterials?.length
      ? provenance.referencedMaterials.map((item) => item.resolved || item.reference)
      : (provenance.materials || []).map((item) => `${item.id || '?'}@${item.version || 1}`),
    sectionRefs: provenance.referencedSections?.length
      ? provenance.referencedSections.map((item) => item.resolved || item.reference)
      : (provenance.sections || []).map((item) => `${item.id || '?'}@${item.version || 1}`),
    sourceIds: (provenance.sourceRegistry || []).map((item) => item.id).filter(Boolean),
    solver: provenance.solver?.method || provenance.solver?.name || null,
    convergence: provenance.convergence || null,
  };
}
