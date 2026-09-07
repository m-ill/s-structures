import { stableHash } from '../../core/stableHash.js';
import { sameWorkflowInput, validIdentity } from '../../core/workflowIdentity.js';
import { analysisRunCanTransferToDesign } from '../../core/analysisRunRecord.js';
import { workflowResultProjection, WORKFLOW_RESULT_PROJECTION_VERSION } from '../../core/workflowResultProjection.js';

export const WORKFLOW_RESULT_VERSION = 'p19-workflow-result-v1';
const copy = value => structuredClone(value);
const problem = (code, extra = {}) => ({ ok: false, code, designTransferAllowed: false, ...extra });

// Immutable result catalog, not a scheduler or a second solver. Existing run
// records remain the authority for numerical qualification.
export function createWorkflowResultStore() {
  const analyses = new Map(), designs = new Map(), plans = new Map();
  let sequence = 0;
  function read(map, id, identity) {
    const record = map.get(id);
    if (!record) return problem('RESULT_REQUIRED');
    const stale = !sameWorkflowInput(record.identity, identity);
    return { ok: true, ...copy(record), stale, designTransferAllowed: !stale && record.designTransferAllowed };
  }
  return Object.freeze({
    recordAnalysis(record, identity) {
      if (!validIdentity(identity)) throw new TypeError('INPUT_IDENTITY_INVALID');
      if (!record?.id || record.result == null) throw new TypeError('ANALYSIS_RECORD_REQUIRED');
      const value = { version: WORKFLOW_RESULT_VERSION, analysisRunId: record.id,
        identity: copy(identity), caseId: record.caseId, kind: record.kind,
        executionStatus: ['cancelled', 'blocked', 'unsupported'].includes(record.result?.status)
          ? record.result.status : record.runStatus === 'ok' ? 'completed' : 'failed',
        qualification: record.qualification, designReviewStatus: 'not-run',
        designTransferAllowed: identity.buildBound && identity.rulePackBound && analysisRunCanTransferToDesign(record),
        resultHash: stableHash(record.result),
        canonicalResultHash: stableHash(workflowResultProjection(record.result)),
        resultProjectionVersion: WORKFLOW_RESULT_PROJECTION_VERSION,
        result: copy(record.result), legacyRecord: copy(record) };
      if (analyses.has(record.id)) {
        if (stableHash(analyses.get(record.id)) !== stableHash(value)) throw new Error('RUN_ID_CONFLICT');
      } else analyses.set(record.id, value);
      return read(analyses, record.id, identity);
    },
    getAnalysis: (id, identity) => read(analyses, id, identity),
    planDesign({ sources = [], currentIdentities = {}, demandContract = null } = {}) {
      if (!sources.length) return problem('RESULT_REQUIRED');
      if (!demandContract || !['elastic-static', 'elastic-pdelta'].includes(demandContract.kind)
        || !['length', 'force', 'moment', 'stress', 'displacement'].every(key => typeof demandContract.units?.[key] === 'string' && demandContract.units[key].length > 0) || demandContract.axes !== 'member-local'
        || demandContract.signConvention !== 'solver-native') return problem('DESIGN_DEMAND_MAPPING_REQUIRED');
      const rows = [];
      for (const source of sources) {
        const row = read(analyses, source.analysisRunId, currentIdentities[source.analysisRunId]);
        if (!row.ok) return row;
        if (row.stale) return problem('STALE_INPUT');
        if (row.executionStatus !== 'completed') return problem('ANALYSIS_NOT_COMPLETED');
        if (row.kind !== 'static') return problem('DESIGN_DEMAND_MAPPING_UNSUPPORTED');
        if (!source.comboId || !Array.isArray(demandContract.comboIds) || !demandContract.comboIds.includes(source.comboId)) return problem('COMBINATION_PROVENANCE_REQUIRED');
        const provenance = row.legacyRecord.provenance;
        if (provenance?.combination?.id !== source.comboId
          || provenance?.analysisCase?.settings?.comboId !== source.comboId) return problem('COMBINATION_PROVENANCE_REQUIRED');
        if (stableHash(provenance?.units) !== stableHash(demandContract.units)) return problem('DESIGN_DEMAND_UNITS_MISMATCH');
        rows.push(row);
      }
      const plan = { ok: true, sourceAnalysisRunIds: rows.map(row => row.analysisRunId),
        sources: copy(sources), demandContract: copy(demandContract),
        qualification: rows.every(row => row.designTransferAllowed) ? 'verified' : 'preliminary',
        designTransferAllowed: false, designReviewStatus: 'not-run' };
      const planHash = stableHash({ plan, currentIdentities });
      plans.set(planHash, { plan: copy(plan), currentIdentities: copy(currentIdentities) });
      return { ...plan, planHash };
    },
    recordDesign({ identity, plan, currentIdentities, result, executionStatus = 'completed' } = {}) {
      if (!validIdentity(identity) || !plan?.ok || result == null) throw new TypeError('DESIGN_RECORD_INPUT_INVALID');
      const issued = plans.get(plan.planHash);
      const { planHash, ...body } = plan;
      if (!issued || stableHash(body) !== stableHash(issued.plan)) throw new Error('DESIGN_PLAN_INVALID');
      if (!['completed', 'failed', 'cancelled'].includes(executionStatus)) throw new Error('EXECUTION_STATUS_INVALID');
      for (const id of plan.sourceAnalysisRunIds) {
        if (!sameWorkflowInput(issued.currentIdentities[id], currentIdentities?.[id])) throw new Error('STALE_INPUT');
        for (const key of ['modelHash','materialsHash','sectionsHash','buildHash','rulePackHash']) {
          if (identity[key] !== issued.currentIdentities[id][key]) throw new Error('DESIGN_SOURCE_INPUT_MISMATCH');
        }
      }
      // Revalidate source identities at commit; a caller cannot forge a plan's
      // qualification or authorize a final design transfer through this API.
      for (const id of plan.sourceAnalysisRunIds || []) if (!analyses.has(id)) throw new Error('ANALYSIS_RECORD_REQUIRED');
      if (!plan.sourceAnalysisRunIds?.length) throw new Error('ANALYSIS_RECORD_REQUIRED');
      const id = `design-${++sequence}`;
      designs.set(id, { version: WORKFLOW_RESULT_VERSION, designRunId: id, identity: copy(identity),
        sourceAnalysisRunIds: copy(plan.sourceAnalysisRunIds), sources: copy(plan.sources),
        demandContract: copy(plan.demandContract), executionStatus, qualification: 'preliminary',
        designReviewStatus: 'review-required', designTransferAllowed: false,
        resultHash: stableHash(result), result: copy(result) });
      return read(designs, id, identity);
    },
    getDesign: (id, identity) => read(designs, id, identity),
    assertCurrent(id, identity) {
      const value = read(analyses.has(id) ? analyses : designs, id, identity);
      return !value.ok ? value : value.stale ? problem('STALE_INPUT') : value;
    },
  });
}
