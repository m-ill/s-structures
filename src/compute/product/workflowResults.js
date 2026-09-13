import {clearReusedDesignArtifacts} from './reusedAnalysisArtifacts.js';
import { BudgetMap, createResourceBudget } from '../../core/resourceBudget.js';
import { boundedResultSlice } from '../../core/boundedResultSlice.js';
import { stableHash } from '../../core/stableHash.js';
import { sameWorkflowInput, validIdentity } from '../../core/workflowIdentity.js';
import { analysisRunCanTransferToDesign } from '../../core/analysisRunRecord.js';
import { workflowResultProjection, WORKFLOW_RESULT_PROJECTION_VERSION } from '../../core/workflowResultProjection.js';
import { createDesignDependencyIdentity, DESIGN_DEPENDENCY_VERSION } from '../../core/designDependencyIdentity.js';
import { validateStoredDesignDetails } from '../../modeling/designDetailValidation.js';

export const WORKFLOW_RESULT_VERSION = 'p19-workflow-result-v1';
const copy = value => structuredClone(value);
export function freezeCheckpointValue(value,seen=new Set()) {
  if(!value||typeof value!=='object'||seen.has(value))return value;
  seen.add(value);for(const child of Object.values(value))freezeCheckpointValue(child,seen);
  if(!ArrayBuffer.isView(value))Object.freeze(value);
  return value;
}
const problem = (code, extra = {}) => ({ ok: false, code, designTransferAllowed: false, ...extra });

// Immutable result catalog, not a scheduler or a second solver. Existing run
// records remain the authority for numerical qualification.
export function createWorkflowResultStore({budget=createResourceBudget()} = {}) {
  const reuseRuntimeSession=globalThis.crypto.randomUUID();
  const analyses = new BudgetMap(budget,'analysis-catalog'), designs = new BudgetMap(budget,'design-catalog',{maxEntries:64}), plans = new BudgetMap(budget,'design-plans',{maxEntries:64});
  let sequence = 0;
  const designSourcesStale=record=>!record.sourceResultHashes||record.sourceAnalysisRunIds.some(id=>!analyses.has(id)||analyses.get(id).resultHash!==record.sourceResultHashes[id]);
  function read(map, id, identity) {
    const record = map.get(id);
    if (!record) return problem('RESULT_REQUIRED');
    const stale = !sameWorkflowInput(record.identity, identity)||(map===designs&&designSourcesStale(record));
    return { ok: true, ...copy(record), stale, designTransferAllowed: !stale && record.designTransferAllowed };
  }
  return Object.freeze({
    dispose(){analyses.clear();designs.clear();plans.clear();},
    getResourceState:()=>({analyses:analyses.size,designs:designs.size,plans:plans.size,budget:budget.snapshot()}),
    exportState({shareImmutable=false}={}){const state={version:WORKFLOW_RESULT_VERSION,analyses:[...analyses.values()].map(row=>{const {result,...legacyRecord}=row.legacyRecord;return {...row,legacyRecord};}),designs:[...designs.values()]};return shareImmutable?freezeCheckpointValue(state):copy(state);},
    restoreState(state,{shareImmutable=false}={}) {
      if(state?.version!==WORKFLOW_RESULT_VERSION||!Array.isArray(state.analyses)||!Array.isArray(state.designs))throw new Error('CHECKPOINT_CATALOG_INVALID');
      for(const row of state.analyses)if(!validIdentity(row.identity)||stableHash(row.result)!==row.resultHash||row.analysisRunId!==row.legacyRecord?.id)throw new Error('CHECKPOINT_ANALYSIS_HASH_INVALID');
      for(const row of state.designs)if(!validIdentity(row.identity)||stableHash(row.result)!==row.resultHash||row.sourceAnalysisRunIds.some(id=>!state.analyses.some(a=>a.analysisRunId===id)))throw new Error('CHECKPOINT_DESIGN_HASH_INVALID');
      const stagedAnalyses=new BudgetMap(budget,'restore-analysis'),stagedDesigns=new BudgetMap(budget,'restore-design',{maxEntries:64});
      try {
        for(const row of state.analyses){const value={...row,legacyRecord:{...row.legacyRecord,result:row.result},designTransferAllowed:false};if(shareImmutable)stagedAnalyses.set(row.analysisRunId,freezeCheckpointValue(value));else stagedAnalyses.setCopy(row.analysisRunId,value);}
        for(const row of state.designs){const value={...row,designTransferAllowed:false};if(shareImmutable)stagedDesigns.set(row.designRunId,freezeCheckpointValue(value));else stagedDesigns.setCopy(row.designRunId,value);}
      } catch(error){stagedAnalyses.clear();stagedDesigns.clear();throw error;}
      const a=[...stagedAnalyses],d=[...stagedDesigns];stagedAnalyses.clear();stagedDesigns.clear();
      analyses.clear();designs.clear();plans.clear();
      for(const [id,row] of a)analyses.set(id,row);
      for(const [id,row] of d)designs.set(id,row);
      sequence=Math.max(sequence,...d.map(([id])=>Number(id.replace('design-',''))||0));
      return {ok:true,analysisCount:a.length,designCount:d.length,designTransferAllowed:false};
    },
    recordAnalysis(record, identity, {shareImmutable=false,model=null}={}) {
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
        result: record.result, legacyRecord: record,
        ...(model?{dependencyIdentity:{...createDesignDependencyIdentity(model,identity),runtimeSession:reuseRuntimeSession}}:{}) };
      if (analyses.has(record.id)) {
        if (stableHash(analyses.get(record.id)) !== stableHash(value)) throw new Error('RUN_ID_CONFLICT');
      } else if(shareImmutable && Object.isFrozen(record) && Object.isFrozen(record.result))analyses.set(record.id,value);
      else analyses.setCopy(record.id,value);
      return read(analyses, record.id, identity);
    },
    reuseAnalysis(sourceId,identity,model) {
      const source=analyses.get(sourceId);
      if(!source)return problem('RESULT_REQUIRED');
      if(sameWorkflowInput(source.identity,identity))return read(analyses,sourceId,identity);
      const proof=source.dependencyIdentity;
      if(!proof||proof.version!==DESIGN_DEPENDENCY_VERSION||proof.sourceInputHash!==source.identity.inputHash||(!source.identity.buildBound&&proof.runtimeSession!==reuseRuntimeSession))return problem('REUSE_PROOF_REQUIRED');
      const method=source.legacyRecord?.provenance?.analysisCase?.settings?.pDeltaMethod||'off';
      if(source.kind!=='static'||source.executionStatus!=='completed'||!['off','direct'].includes(method))return problem('REUSE_SCOPE_UNSUPPORTED');
      const next=createDesignDependencyIdentity(model,identity);
      if(next.analysisHash!==proof.analysisHash)return problem('REANALYSIS_REQUIRED');
      if(validateStoredDesignDetails(model).length)return problem('DESIGN_DETAIL_INVALID');
      const id=`reuse-${stableHash({sourceId,inputHash:identity.inputHash,version:DESIGN_DEPENDENCY_VERSION})}`;
      if(analyses.has(id))return read(analyses,id,identity);
      const result=copy(source.result);
      const artifactInvalidation=clearReusedDesignArtifacts(result);
      if(result.payload?.model)result.payload.model=copy(model);
      const derivation={version:DESIGN_DEPENDENCY_VERSION,artifactInvalidation,sourceAnalysisRunId:sourceId,sourceResultHash:source.resultHash,sourceInputHash:source.identity.inputHash,targetInputHash:identity.inputHash,analysisHash:next.analysisHash,reason:'provided-reinforcement-only; unchanged gross elastic input'};
      const value={...source,analysisRunId:id,identity:copy(identity),dependencyIdentity:{...next,runtimeSession:reuseRuntimeSession},derivation,
        qualification:'preliminary',designTransferAllowed:false,designReviewStatus:'not-run',result,
        resultHash:stableHash(result),canonicalResultHash:stableHash(workflowResultProjection(result)),
        legacyRecord:{...copy(source.legacyRecord),id,result,qualification:'preliminary',designTransferAllowed:false,derivation}};
      analyses.setCopy(id,value);
      return read(analyses,id,identity);
    },
    getAnalysis: (id, identity) => read(analyses, id, identity),
    getAnalysisSlice(id,identity,query) {
      const row=analyses.get(id);if(!row)return problem('RESULT_REQUIRED');
      return {ok:true,analysisRunId:id,stale:!sameWorkflowInput(row.identity,identity),slice:boundedResultSlice(row.result,query),designTransferAllowed:false};
    },
    getAnalysisMetadata(id) {
      const row=analyses.get(id);if(!row)return problem('RESULT_REQUIRED');
      const {result,legacyRecord,...metadata}=row;const {result:omitted,...legacyMetadata}=legacyRecord;
      return {ok:true,...copy(metadata),legacyRecord:copy(legacyMetadata),retainedSizeEstimateBytes:analyses.sizes.get(id)};
    },
    listAnalysisMetadata(){return [...analyses.keys()].map(id=>this.getAnalysisMetadata(id));},
    planDesign({ sources = [], currentIdentities = {}, demandContract = null } = {}) {
      if (!sources.length) return problem('RESULT_REQUIRED');
      if (!demandContract || !['elastic-static', 'elastic-pdelta'].includes(demandContract.kind)
        || !['length', 'force', 'moment', 'stress', 'displacement'].every(key => typeof demandContract.units?.[key] === 'string' && demandContract.units[key].length > 0) || demandContract.axes !== 'member-local'
        || demandContract.signConvention !== 'solver-native') return problem('DESIGN_DEMAND_MAPPING_REQUIRED');
      const rows = [];
      for (const source of sources) {
        const row = this.getAnalysisMetadata(source.analysisRunId);
        if(row.ok)row.stale=!sameWorkflowInput(row.identity,currentIdentities[source.analysisRunId]);
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
        sources: copy(sources), sourceResultHashes:Object.fromEntries(rows.map(row=>[row.analysisRunId,row.resultHash])), demandContract: copy(demandContract),
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
      if(plan.sourceAnalysisRunIds.some(id=>analyses.get(id).resultHash!==issued.plan.sourceResultHashes?.[id]))throw new Error('DESIGN_SOURCE_CHANGED');
      const id = `design-${++sequence}`;
      designs.set(id, { version: WORKFLOW_RESULT_VERSION, designRunId: id, identity: copy(identity),
        sourceResultHashes:copy(issued.plan.sourceResultHashes), sourceAnalysisRunIds: copy(plan.sourceAnalysisRunIds), sources: copy(plan.sources),
        demandContract: copy(plan.demandContract), executionStatus, qualification: 'preliminary',
        designReviewStatus: 'review-required', designTransferAllowed: false,
        resultHash: stableHash(result), result: copy(result) });
      return read(designs, id, identity);
    },
    getDesign: (id, identity) => read(designs, id, identity),
    getDesignMetadata(id, identity) {
      const record=designs.get(id);if(!record)return problem('RESULT_REQUIRED');
      const {result,...metadata}=record;
      return {ok:true,...copy(metadata),stale:!sameWorkflowInput(record.identity,identity)||designSourcesStale(record)};
    },
    assertCurrent(id, identity) {
      const value = read(analyses.has(id) ? analyses : designs, id, identity);
      return !value.ok ? value : value.stale ? problem('STALE_INPUT') : value;
    },
  });
}
