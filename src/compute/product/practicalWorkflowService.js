import {filterPracticalChecks} from './practicalCheckFilter.js';
import {prepareRemainingDesignRepairs} from './remainingDesignRepairs.js';
import {connectedGeometryChanges} from './connectedGeometryChanges.js';
import {sectionJointCommands,coupleSectionJoints} from './sectionJointCoupling.js';
import {sectionFoundationCommands,coupleSectionFoundations} from './sectionFoundationCoupling.js';
import {rcSpliceWorkingBytes} from '../../metadata/rcSplicePolicy.js';
import {spliceRefinementState,classALengthDeficits,MAX_SPLICE_REFINEMENT_PASSES} from './spliceRefinementState.js';
import {estimateCandidateProposalWorkingSet} from './candidateProposalWorkingSet.js';
import {rebindDifferentialPeerCommands} from '../../design/foundation/differentialDependencies.js';
import {createCandidateStageTiming,candidateStageSnapshot} from './candidateStageTiming.js';
import {createCandidateDetailReader} from './candidateDetailReader.js';
import {jointRepairProposal} from './jointRepairProposal.js';
import {relatedLongitudinalQuantity} from './relatedLongitudinalQuantity.js';
import {connectionCandidateQuantity} from './connectionCandidateQuantity.js';
import {validJointBarPairs,validJointHookSides} from '../../design/connection/jointBarPairs.js';
import {validJointPlaneOffsets} from '../../design/connection/jointPlaneOffsets.js';
import {changedDetailCommands} from './changedDetailCommands.js';
import {designRepairOutcome} from './designRepairOutcome.js';
import {automaticDependentProposals} from './automaticDependentProposals.js';
import {foundationRepairProposal} from './foundationRepairProposal.js';
import {isCandidateWorkerFailure,recordCandidateWorkerFailure} from './candidateWorkerFailure.js';
import {proposalProvenance} from './proposalProvenance.js';
import {memberReinforcementProposal} from './memberReinforcementProposal.js';
import {candidateCompletionBlockers} from './candidateCompletionBlockers.js';
import {candidateEngineeringSeverity,candidateScore} from './candidateScore.js';
import {runCandidateAutoApplication} from './candidateAutoApplication.js';
import {compareDesignChecks} from './designCheckComparison.js';
import {applicationComparisonSummary,compactApplicationComparisonSummary} from './applicationComparisonSummary.js';
import {assessCandidateScope} from './candidateScope.js';
import {estimateCandidateEvaluationWorkingSet} from './candidateEvaluationWorkingSet.js';
import {estimateRcIterationWorkingSet} from './rcIterationWorkingSet.js';
import {selectDrawingSnapshot} from '../../report/phase24/drawingSnapshot.js';
import {jsonTextWindow} from '../../core/jsonTextWindow.js';
import {practicalResultCacheKey} from './practicalResultCache.js';
import {requireCurrentDesignSources} from './designSourceGuard.js';
import {candidateQuerySummary} from './candidateQuery.js';
import {validateDependentCandidates,dependentCandidateVariants,validateDetailCandidateProducts} from '../../design/rc/dependentCandidates.js';
import {validateRegionConstraints,regionCandidateVariants} from '../../design/rc/regionCandidateConstraints.js';
import {rebarCatalogProduct} from '../../materials/rebarProductCatalog.js';
import {profileLoadScopeHash,evaluateProjectProfile} from '../../design/evaluation/projectProfile.js';
import {PRACTICAL_RULE_PACK_HASH} from '../../metadata/practicalRuleImplementations.js';
import {BudgetMap,createResourceBudget,retainedBytes} from '../../core/resourceBudget.js';
import {stableHash} from '../../core/stableHash.js';
import {validIdentity} from '../../core/workflowIdentity.js';
import {validateModel} from '../../core/validation.js';
import {designInputImpact} from '../../core/designDependencyIdentity.js';
import {evaluatePracticalDesign,latestDetails,summarizePracticalChecks,designCombinationCoverage,PRACTICAL_EVALUATION_VERSION} from '../../design/evaluation/practicalEvaluation.js';
import {practicalCommandFromRecord} from '../../modeling/practicalInputContract.js';
import {DESIGN_INPUT_UNITS,finiteJson,object,stageDesignInputCommand} from '../../modeling/designInputCommands.js';
import {runCandidateSpliceRefinement,runCandidateGeometry,runCandidateAnalysis,runCandidateEvaluation,runRcServiceWorker,runRcSpliceWorker} from './candidateAnalysisClient.js';
import {designSetSnapshot} from './candidateAnalysisSnapshot.js';
import {normalizeProductAnalysisCaseSettings} from './analysisCaseSettings.js';
import {resolveSectionRecord} from '../../materials/registry.js';
import {selectDesignCombination} from './designCombinationSource.js';
import {PRACTICAL_DESIGN_LIMITS as limits} from '../../metadata/practicalDesignLimits.js';

export const PRACTICAL_WORKFLOW_VERSION='p24-practical-workflow-v1';
const CANDIDATE_STRATEGY_VERSION='p25-candidate-strategy-v165-joint-layer-repair';
const reject=(code,details={})=>{throw Object.assign(new Error(code),{code,...details});};
const clone=x=>structuredClone(x);
const invalidatedSource=error=>['STALE_INPUT','DESIGN_SOURCE_CHANGED','COMPLETED_STATIC_RESULT_REQUIRED'].includes(error?.code);
export function createPracticalWorkflowService({bridge,budget=createResourceBudget(),sharedPracticalCache=null}) {
 const evaluations=new BudgetMap(budget,'practical-evaluations',{maxEntries:limits.maxEvaluationEntries}),plans=new BudgetMap(budget,'practical-plans',{maxEntries:limits.maxPlanEntries}),jobs=new BudgetMap(budget,'practical-jobs',{maxEntries:limits.maxJobEntries,measure:entry=>Math.max(16384,retainedBytes(entry))});
 // Reserve the bounded receipt slot before committing any model mutation.
 const applications=new BudgetMap(budget,'practical-applications',{maxEntries:limits.maxApplicationEntries,measure:entry=>Math.max(16384,retainedBytes(entry))});
 const candidateDetailReader=createCandidateDetailReader({budget});
 let disposed=false,busy=false,generation=0;
 let evaluationController=null;
 const candidateControllers=new Map(),applicationReviews=new Map();
 const identity=()=>bridge.getWorkflowInputIdentity();
 const current=hash=>{if(disposed)reject('SESSION_DISPOSED');if(hash!==identity().inputHash)reject('STALE_INPUT');};
 const read=id=>{const row=evaluations.get(id);if(!row)reject('EVALUATION_REQUIRED');return row;};
 const currentness=row=>{
  const staleReasons=[];
  try{requireCurrentDesignSources(bridge,row.sets||[]);}catch{staleReasons.push('SOURCE_NOT_CURRENT');}
  if(row.evaluatorVersion!==PRACTICAL_EVALUATION_VERSION)staleReasons.push('EVALUATOR_VERSION_CHANGED');
  if(row.rulePackHash!==PRACTICAL_RULE_PACK_HASH)staleReasons.push('RULE_PACK_CHANGED');
  if(row.restoredWithoutBuild===true)staleReasons.push('RESTORED_BUILD_UNBOUND');
  if(row.inputHash!==identity().inputHash)staleReasons.push('INPUT_CHANGED');
  return {stale:staleReasons.length>0,staleReasons};
 };
 const stale=row=>currentness(row).stale;
 async function evaluate(input) {
  finiteJson(input);object(input,['inputHash','sources','mechanicsLaw']);current(input.inputHash);
  if(!Array.isArray(input.sources)||!input.sources.length||input.sources.length>limits.maxSources)reject('RESULT_REQUIRED');
  if(evaluationController)reject('EVALUATION_BUSY');
  const controller=new AbortController(),atGeneration=generation,owner=budget.nextOwner('practical-evaluation-transient');evaluationController=controller;
  try{
  budget.reserve(owner,retainedBytes(bridge.getCurrentModel())*3);
  const model=clone(bridge.getCurrentModel());if(!validateModel(model).ok)reject('MODEL_VALIDATION_FAILED');
  const sets=[],rawSets=[],checks=[],demands=[],seen=new Set();
  let sourceAdmissionBytes=retainedBytes(model)*3;
  for(const source of input.sources) {
   object(source,['analysisRunId','rcIterationId','rcSpliceId','comboId']);if([source.analysisRunId,source.rcIterationId,source.rcSpliceId].filter(Boolean).length!==1)reject('SINGLE_DESIGN_SOURCE_REQUIRED');if(seen.has(source.comboId))reject('DUPLICATE_COMBINATION');seen.add(source.comboId);
   if(source.rcSpliceId){
    const meta=bridge.getRcSpliceSourceMetadata(source.rcSpliceId);
    if(!meta.ok||meta.stale||!meta.converged||!meta.elasticRangeSatisfied)reject('RC_SPLICE_SOURCE_NOT_CURRENT');
    if(!Number.isSafeInteger(meta.retainedSizeEstimateBytes)||meta.retainedSizeEstimateBytes<0)reject('SOURCE_MEMORY_ESTIMATE_REQUIRED');
    sourceAdmissionBytes+=meta.retainedSizeEstimateBytes*3;budget.reserve(owner,sourceAdmissionBytes);
    const set=bridge.readRcSpliceCombination(source.rcSpliceId,source.comboId);rawSets.push(set);
    if((model.members||[]).length>limits.maxMembers||Object.values(set.memberResults||{}).reduce((n,r)=>n+(r.xs?.length||0),0)>limits.maxStationsPerSet)reject('FOCUSED_DESIGN_SIZE_LIMIT');
    sets.push({source:clone(source),set,resultHash:meta.resultHash,method:meta.pDeltaMethod??'off',splicePolicy:meta.policySettings,analysisProof:meta.analysisProof,globalMethodQualified:false});continue;
   }
   if(source.rcIterationId){
    const meta=bridge.getRcServiceIterationMetadata(source.rcIterationId);
    if(!meta.ok||meta.stale||!meta.converged)reject('RC_ITERATION_SOURCE_NOT_CURRENT');
    sourceAdmissionBytes+=meta.retainedSizeEstimateBytes*3;budget.reserve(owner,sourceAdmissionBytes);
    const set=bridge.readRcServiceIterationCombination(source.rcIterationId,source.comboId);rawSets.push(set);
    sets.push({source:clone(source),set,resultHash:meta.resultHash,method:meta.pDeltaMethod??'off',iterationPolicy:meta.policySettings,globalMethodQualified:false});
    continue;
   }
   const meta=bridge.getWorkflowAnalysisMetadata(source.analysisRunId);
   if(!meta.ok)reject(meta.code);
   if(!Number.isSafeInteger(meta.retainedSizeEstimateBytes)||meta.retainedSizeEstimateBytes<0)reject('SOURCE_MEMORY_ESTIMATE_REQUIRED');
   sourceAdmissionBytes+=meta.retainedSizeEstimateBytes*3;budget.reserve(owner,sourceAdmissionBytes);
   const row=bridge.getWorkflowAnalysisResult(source.analysisRunId);
   if(!row.ok)reject(row.code);if(row.stale)reject('STALE_INPUT');
   if(row.kind!=='static'||row.executionStatus!=='completed')reject('COMPLETED_STATIC_RESULT_REQUIRED');
   const method=row.legacyRecord?.provenance?.analysisCase?.settings?.pDeltaMethod||'off';
   if(!['off','direct'].includes(method))reject('PDELTA_COMPARISON_ONLY');
   const set=selectDesignCombination(row.result.payload,source.comboId,method);
   if(!set?.ok||!set.anyOk||row.legacyRecord?.provenance?.combination?.id!==source.comboId)reject('CONCURRENT_COMBINATION_REQUIRED');
   if((model.members||[]).length>limits.maxMembers||Object.values(set.memberResults||{}).reduce((n,r)=>n+(r.xs?.length||0),0)>limits.maxStationsPerSet)reject('FOCUSED_DESIGN_SIZE_LIMIT');
   rawSets.push(set);
   budget.reserve(owner,retainedBytes(model)*3+rawSets.reduce((n,x)=>n+retainedBytes(x)*3,0));
   sets.push({source:clone(source),set:designSetSnapshot(set),resultHash:row.resultHash,analysisCase:clone(row.legacyRecord?.provenance?.analysisCase)});
  }
  const id=`evaluation-${stableHash({inputHash:input.inputHash,sources:sets.map(x=>({source:x.source,resultHash:x.resultHash})),mechanicsLaw:input.mechanicsLaw||null,version:PRACTICAL_WORKFLOW_VERSION,evaluatorVersion:PRACTICAL_EVALUATION_VERSION,rulePackHash:PRACTICAL_RULE_PACK_HASH})}`;
  // Validate every source before reuse; identical requests must not repeat section scans.
  requireCurrentDesignSources(bridge,sets);
  const cached=evaluations.get(id);
  if(cached&&!stale(cached))return getEvaluation({evaluationId:id});
  const sharedKey=practicalResultCacheKey(input.inputHash,sets,input.mechanicsLaw),shared=sharedPracticalCache?.get(sharedKey);
  const compute=signal=>runCandidateEvaluation({budget,workerReservationBytes:budget.snapshot().owners[owner],model,sets,mechanicsLaw:input.mechanicsLaw,timeoutMs:limits.maxEvaluationMillis,signal});
  const result=shared||await (sharedPracticalCache?sharedPracticalCache.compute(sharedKey,compute,controller.signal):compute(controller.signal));
  current(input.inputHash);if(atGeneration!==generation||controller.signal.aborted)reject('CANCELLED');
  requireCurrentDesignSources(bridge,sets);
  checks.push(...result.checks);demands.push(...result.demands);
  const row={id,evaluatorVersion:PRACTICAL_EVALUATION_VERSION,rulePackHash:PRACTICAL_RULE_PACK_HASH,inputHash:input.inputHash,inputIdentity:identity(),model,sets,mechanicsLaw:clone(input.mechanicsLaw||null),checks,demands,preparedDetails:result.preparedDetails,summary:result.summary,designTransferAllowed:false};
  row.remainingRepairs=prepareRemainingDesignRepairs({model,checks,evaluationId:id,inputHash:row.inputHash});
  row.remainingRepairsHash=stableHash(row.remainingRepairs);
  evaluations.set(id,row);
  if(!shared)sharedPracticalCache?.put(sharedKey,result);
  return getEvaluation({evaluationId:id});
  }finally{budget.release(owner);if(evaluationController===controller)evaluationController=null;}
 }
 function getEvaluationStatus({evaluationId}) {const row=read(evaluationId);return {ok:true,evaluationId,inputHash:row.inputHash,...currentness(row)};}
 function getEvaluation({evaluationId,offset=0,limit=20,filter}) {
  const row=read(evaluationId),visible=filterPracticalChecks(row.checks,filter);
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>limits.maxChecksPerPage)reject('PAGINATION_INVALID');
  const result={ok:true,evaluationId,offset,limit,inputHash:row.inputHash,...currentness(row),summary:clone(row.summary),checks:[],total:row.checks.length,...(filter!==undefined?{filteredTotal:visible.length,filter:clone(filter)}:{}),nextOffset:null,designTransferAllowed:false};
  if(row.remainingRepairs)result.remainingRepairs={ngCheckCount:row.remainingRepairs.ngCheckCount,incompleteCheckCount:row.remainingRepairs.incompleteCheckCount,targetCount:row.remainingRepairs.targets.length,truncated:row.remainingRepairs.truncated,detailQuery:{tool:'get_practical_design_check',evaluationId,checkId:row.remainingRepairsHash}};
  if(row.designComparison)result.postApplication={evaluationId,comparison:clone(row.designComparison)};
  for(const check of visible.slice(offset,offset+limit)){
   let item;
   if(jsonTextWindow(check,{limit:1}).totalChars>30000)item={id:check.id,entityId:check.entityId,comboId:check.comboId,checkId:check.checkId,status:check.status,ratio:check.ratio,reason:check.reason,codeBasis:{status:check.codeBasis?.status,wholeDesignQualified:false},detailQuery:{tool:'get_practical_design_check',evaluationId,checkId:check.id},detailsPaged:true};
   else item=clone(check);
   result.checks.push(item);
   if(JSON.stringify(result).length>limits.maxResultChars){result.checks.pop();break;}
  }
  if(offset<visible.length&&!result.checks.length)reject('EVALUATION_SUMMARY_SIZE_LIMIT');
  const end=offset+result.checks.length;result.nextOffset=end<visible.length?end:null;
  return result;
 }
 function releaseEvaluation(input){
  finiteJson(input);object(input,['evaluationId']);const {evaluationId}=input;
  if(typeof evaluationId!=='string'||!evaluationId||evaluationId.length>128)reject('EVALUATION_ID_REQUIRED');
  if(evaluationController||applicationReviews.size)reject('EVALUATION_RESOURCES_IN_USE');
  if([...plans.values()].some(plan=>plan.evaluationId===evaluationId))reject('EVALUATION_PLAN_REFERENCED');
  const row=evaluations.get(evaluationId),before=budget.snapshot().totalBytes;
  let releasedEvaluations=0,releasedSharedResults=0;
  if(row){
   // Legacy/restored rows may lack complete source identity; freeing their
   // owned records must not depend on a reusable cache key being available.
   let sharedKey;try{sharedKey=practicalResultCacheKey(row.inputHash,row.sets,row.mechanicsLaw);}catch(error){if(error.message!=='SHARED_RESULT_SOURCE_REQUIRED')throw error;}
   if(sharedKey)releasedSharedResults=sharedPracticalCache?.evict?.(sharedKey)?1:0;
   evaluations.delete(evaluationId);releasedEvaluations=1;
  }
  return {ok:true,evaluationId,releasedEvaluations,releasedSharedResults,releasedManagedBytes:before-budget.snapshot().totalBytes,accounting:'conservative-retained-data-estimate',modelChanged:false,analysisSourcesPreserved:true,applicationReceiptsPreserved:true,designTransferAllowed:false};
 }
 function getCheckDetail({evaluationId,checkId,offset=0,limit=8000}){
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>limits.maxCheckChunkChars)reject('PAGINATION_INVALID');
  const row=read(evaluationId),check=checkId===row.remainingRepairsHash?row.remainingRepairs:checkId===row.designComparison?.detailHash?row.designComparisonDetails:row.checks.find(x=>x.id===checkId);if(!check)reject('CHECK_REQUIRED');
  const window=jsonTextWindow(check,{offset,limit});
  return {ok:true,evaluationId,checkId,inputHash:row.inputHash,...currentness(row),checkHash:stableHash(check),encoding:'json-text-utf16',offset,...window};
 }
 function planCandidates(input) {
  finiteJson(input);object(input,['repairSpliceLengths','dependentCandidates','regionConstraints','evaluationId','memberId','foundationId','connectionId','detailCandidates','spacings','diameters','barsPerFace','covers','sectionCandidates','maxCandidates','maxMillis','autoApply']);
  if(input.repairSpliceLengths!==undefined&&typeof input.repairSpliceLengths!=='boolean')reject('SPLICE_REFINEMENT_OPTION_INVALID');
  if(input.autoApply!==undefined&&typeof input.autoApply!=='boolean')reject('CANDIDATE_AUTO_APPLY_INVALID');
  if(input.covers!==undefined&&(!Array.isArray(input.covers)||!input.covers.length||input.covers.length>8||input.covers.some(x=>!Number.isFinite(x)||x<.005||x>.2)))reject('COVER_CANDIDATE_CONSTRAINT_INVALID');
  if(input.barsPerFace!==undefined&&(!Array.isArray(input.barsPerFace)||!input.barsPerFace.length||input.barsPerFace.length>8||input.barsPerFace.some(n=>!Number.isInteger(n)||n<2||n>20)))reject('BAR_LAYOUT_CONSTRAINT_INVALID');
  const row=read(input.evaluationId);current(row.inputHash);if(stale(row))reject('STALE_INPUT');
  const proposalOwner=budget.nextOwner('candidate-proposal-transient');
  try{
   budget.reserve(proposalOwner,estimateCandidateProposalWorkingSet({model:row.model,checks:row.checks,input}).estimatedBytes);
  if(['memberId','foundationId','connectionId'].filter(k=>input[k]!==undefined).length!==1)reject('SINGLE_CANDIDATE_TARGET_REQUIRED');
  rcIterationPolicy(row.sets);
  const type=input.foundationId?'foundation-record':input.connectionId?'connection-record':'reinforcement-record';
  const channel=input.foundationId?'foundations':input.connectionId?'connections':'reinforcement';
  const detail=latestDetails(row.model,channel).filter(x=>type==='reinforcement-record'?x.memberId===input.memberId:x.id===(input.foundationId||input.connectionId));
  if(!detail.length||detail.length>32||type!=='reinforcement-record'&&detail.length!==1)reject('CANDIDATE_DETAIL_SCOPE_REQUIRED');if(detail.some(d=>d.locked))reject('DETAIL_LOCKED');
  if(input.sectionCandidates!==undefined){if(!Array.isArray(input.sectionCandidates)||!input.sectionCandidates.length||input.sectionCandidates.length>8)reject('SECTION_CANDIDATE_LIMIT');for(const x of input.sectionCandidates){object(x,['B','H']);if(![x.B,x.H].every(v=>Number.isFinite(v)&&v>=50&&v<=3000))reject('SECTION_CANDIDATE_DIMENSIONS_INVALID');}}
  for(const key of ['spacings','diameters'])if(input[key]!==undefined&&(!Array.isArray(input[key])||!input[key].length||input[key].length>8||input[key].some(x=>!Number.isFinite(x)||x<=0||x>(key==='spacings'?500:50))))reject('CANDIDATE_CONSTRAINT_INVALID');
  const maxCandidates=input.maxCandidates??8,maxMillis=input.maxMillis??3000;
  if(!Number.isInteger(maxCandidates)||maxCandidates<1||maxCandidates>limits.maxCandidates||!Number.isFinite(maxMillis)||maxMillis<1||maxMillis>limits.maxCandidateMillis)reject('CANDIDATE_BUDGET_INVALID');
  const originalCommands=detail.map(d=>practicalCommandFromRecord(type,d)),command=originalCommands[0];
  validateRegionConstraints(input.regionConstraints,originalCommands);
  const dependentCommands=[];
  if(input.dependentCandidates!==undefined){
   if(type!=='reinforcement-record')reject('CANDIDATE_TARGET_CONSTRAINT_MISMATCH');
   if(!Array.isArray(input.dependentCandidates)||!input.dependentCandidates.length||input.dependentCandidates.length>8)reject('DEPENDENT_CANDIDATE_CONSTRAINT_INVALID');
   for(const [channel,kind] of [['connections','connection-record'],['foundations','foundation-record']])for(const record of latestDetails(row.model,channel)){
    if(input.dependentCandidates.some(r=>r?.[kind==='connection-record'?'connectionId':'foundationId']===record.id)){if(record.locked)reject('DETAIL_LOCKED');dependentCommands.push(practicalCommandFromRecord(kind,record));}
   }
   validateDependentCandidates(row.model,input.memberId,input.dependentCandidates,dependentCommands);
  }
  let generation=null,additionalCommands=[];
  if(type==='reinforcement-record'&&['regionConstraints','spacings','diameters','barsPerFace','covers','sectionCandidates','dependentCandidates'].every(k=>input[k]===undefined)){
   generation=memberReinforcementProposal(originalCommands,row.checks,row.model);
   function* connectedCommands(){for(const [channel,kind] of [['connections','connection-record'],['foundations','foundation-record']])for(const record of latestDetails(row.model,channel))yield practicalCommandFromRecord(kind,record);}
   const connected=automaticDependentProposals(row.model.members.find(m=>m.id===input.memberId),connectedCommands(),row.checks,row.model);
   if(connected.dependentCandidates.length){
    input={...input,dependentCandidates:connected.dependentCandidates};dependentCommands.push(...connected.selectedCommands);
    validateDependentCandidates(row.model,input.memberId,input.dependentCandidates,dependentCommands);
    generation={ok:true,version:'p25-member-connected-proposal-v2-catalog',productChoices:generation.productChoices||[],sectionCandidates:generation.sectionCandidates,sectionChangeRequired:generation.sectionChangeRequired,sectionSearchOrder:generation.sectionSearchOrder,spliceRepairs:generation.spliceRepairs,regionConstraints:generation.ok?generation.regionConstraints:undefined,memberProposalUnavailable:generation.ok?null:generation.reason,components:[generation,...connected.components],basisCheckIds:[...new Set([...(generation.basisCheckIds||[]),...connected.basisCheckIds])],requiresCandidateEvaluation:true,automaticApplicationAllowed:false};
   }
   generation={...generation,dependentProposalUnavailable:connected.unavailable,dependentProposalUnavailableCount:connected.unavailableCount,dependentProposalTruncated:connected.truncated};
   if(generation.ok){input={...input,regionConstraints:generation.regionConstraints,...(generation.sectionCandidates?{sectionCandidates:generation.sectionCandidates}:{})};validateRegionConstraints(input.regionConstraints,originalCommands);}
  }
  if(type==='foundation-record'&&input.detailCandidates===undefined){
   generation=foundationRepairProposal(command,row.checks,row.model);
   if(generation.ok)input={...input,detailCandidates:generation.edits};
   else reject(generation.reason,{proposalFailure:{ok:false,code:generation.reason,generation:clone(generation),inputHash:row.inputHash,designTransferAllowed:false}});
  }
  if(type==='connection-record'&&input.detailCandidates===undefined){
   const previewOwner=budget.nextOwner('joint-support-preview');
   try{
    budget.reserve(previewOwner,retainedBytes(row.model)*3);
    const generated=jointRepairProposal(command,row.checks,row.model);
    additionalCommands=generated.additionalCommands||[];
    originalCommands.push(...(generated.originalAdditionalCommands||[]));
    const {additionalCommands:nextCommands,originalAdditionalCommands:priorCommands,...publicGeneration}=generated;
    generation=publicGeneration;
   }finally{budget.release(previewOwner);} 
   if(generation.ok)input={...input,detailCandidates:generation.edits};
   else reject(generation.reason,{proposalFailure:{ok:false,code:generation.reason,generation:clone(generation),inputHash:row.inputHash,designTransferAllowed:false}});
  }
  if(type!=='reinforcement-record'){
   if(['regionConstraints','spacings','diameters','barsPerFace','covers','sectionCandidates'].some(k=>input[k]!==undefined))reject('CANDIDATE_TARGET_CONSTRAINT_MISMATCH');
   const allowed=type==='foundation-record'?['B','L','thickness','columnEmbedmentLength','columnDevelopmentAbove','bottomSpacingB','bottomSpacingL','topSpacingB','topSpacingL','bottomDiameterB','bottomDiameterL','topDiameterB','topDiameterL','barDistribution']:['jointWidth','jointDepth','jointPanelHeight','tieDiameter','tieSpacing','tieLegs','anchorageLength','jointFirstStart','jointFirstEnd','jointHookTail','jointBendInsideRadius','jointCrossTiePlaneOffsets','jointCrossTieBarPairs','jointCrossTieHookSides'];
   if(!Array.isArray(input.detailCandidates)||!input.detailCandidates.length||input.detailCandidates.length>8)reject('DETAIL_CANDIDATES_REQUIRED');
   for(const edit of input.detailCandidates){object(edit,allowed);if(!Object.keys(edit).length||Object.entries(edit).some(([key,x])=>key==='jointCrossTieHookSides'?!validJointHookSides(x):key==='jointCrossTieBarPairs'?!validJointBarPairs(x):key==='jointCrossTiePlaneOffsets'?!validJointPlaneOffsets(x):key==='barDistribution'?!['uniform','kds-centered-band'].includes(x):!Number.isFinite(x)||(['jointFirstStart','jointFirstEnd'].includes(key)?x<0:x<=0)))reject('DETAIL_CANDIDATE_CONSTRAINT_INVALID');}
   // Reject unavailable products before reserving or running candidate analysis.
   // Commands retain the selected catalogue; staging supplies its nominal area.
   validateDetailCandidateProducts(command,input.detailCandidates);
  }else if(input.detailCandidates!==undefined)reject('CANDIDATE_TARGET_CONSTRAINT_MISMATCH');
  for(const c of originalCommands){
   const localDiameters=input.regionConstraints?.find(r=>r.detailId===c.id)?.diameters;
   if(localDiameters){if(c.barCatalogId)for(const d of localDiameters)rebarCatalogProduct({diameter:d});else if(c.barAreaBasis==='specified-nominal'&&localDiameters.some(d=>c.bars.some(b=>b.diameter!==d)))reject('NOMINAL_PRODUCT_CANDIDATE_REQUIRED');}
   if(c.barAreaBasis==='specified-nominal'&&!c.barCatalogId&&input.diameters?.some(d=>c.bars.some(b=>b.diameter!==d)))reject('NOMINAL_PRODUCT_CANDIDATE_REQUIRED');
   if(c.barCatalogId&&input.diameters)for(const d of input.diameters)rebarCatalogProduct({diameter:d});
  }
  const regionCandidateOrder=type==='reinforcement-record'&&generation?.ok?'diagonal-first':'cartesian';
  if(generation?.ok)generation={...generation,regionCandidateOrder};
  const sectionFoundations=type==='reinforcement-record'&&input.sectionCandidates?.some(Boolean)?sectionFoundationCommands(row.model,input.memberId):[];
  const sectionJoints=type==='reinforcement-record'&&input.sectionCandidates?.some(Boolean)?sectionJointCommands(row.model,input.memberId):[];
  for(const c of [...sectionFoundations,...sectionJoints]){if(c.locked)reject('DETAIL_LOCKED');if(!dependentCommands.some(d=>d.type===c.type&&d.id===c.id))dependentCommands.push(c);}
  if(dependentCommands.length>8)reject('AUTOMATIC_DEPENDENT_LIMIT');
  const core={...clone(input),generation,sectionFoundations,sectionJoints,regionCandidateOrder,strategyVersion:CANDIDATE_STRATEGY_VERSION,inputHash:row.inputHash,command,originalCommands,dependentCommands,additionalCommands,maxCandidates,maxMillis,spacings:type==='reinforcement-record'?(input.spacings||[null]):[null],diameters:input.diameters||[null]};
  if(type==='reinforcement-record'&&!input.spacings&&originalCommands.some(c=>{const local=input.regionConstraints?.find(r=>r.detailId===c.id),endOnly=local&&(local.startExtensions||local.endExtensions)&&Object.keys(local).every(k=>['detailId','startExtensions','endExtensions'].includes(k));return !Number.isFinite(c.stirrupSpacing)&&!local?.spacings&&!endOnly;}))reject('STIRRUP_CONSTRAINT_REQUIRED');
  const planId=`candidate-plan-${stableHash(core)}`;plans.set(planId,core);
  return {ok:true,planId,generation:clone(generation),regionCandidateOrder,inputHash:row.inputHash,maxCandidates,maxMillis,scope:type,regionCount:detail.length,affectedDetailIds:[...detail.map(d=>d.id),...dependentCommands.map(d=>d.id),...additionalCommands.filter(c=>c.id).map(c=>c.id)],affectedMemberIds:[...new Set(additionalCommands.flatMap(c=>c.memberIds||[c.memberId].filter(Boolean)))],relatedReinforcementCount:additionalCommands.filter(c=>c.type==='reinforcement-record').length,relatedSpliceCount:additionalCommands.filter(c=>c.type==='splice-record').length,dependentDetailCount:dependentCommands.length,sectionChanges:'REANALYSIS_REQUIRED',designTransferAllowed:false};
  }finally{budget.release(proposalOwner);}
 }
 function startCandidates({planId,requestId}) {
  const plan=plans.get(planId);if(!plan)reject('CANDIDATE_PLAN_REQUIRED');if(plan.strategyVersion!==CANDIDATE_STRATEGY_VERSION)reject('CANDIDATE_STRATEGY_STALE');
  if(typeof requestId!=='string'||!requestId||requestId.length>128)reject('REQUEST_ID_REQUIRED');
  const jobId=`candidate-job-${stableHash({planId,requestId})}`;
  if(jobs.has(jobId))return getCandidateJob({jobId});
  current(plan.inputHash);if(stale(read(plan.evaluationId)))reject('STALE_INPUT');if(busy)reject('WORKFLOW_BUSY');
  const row={jobId,planId,generation,status:'running',candidateCount:0,candidates:[],best:null,cancelled:false,nextCursor:plan.startCursor||0,previousJobId:plan.previousJobId||null};jobs.set(jobId,row);busy=true;
  void execute(row,plan).catch(error=>{if(row.generation!==generation)return;busy=false;row.status='failed';row.error=error.code||error.message;row.candidates=[];row.best=null;if(!disposed)try{jobs.set(jobId,row);}catch{jobs.delete(jobId);}});
  return getCandidateJob({jobId});
 }
 function resumeCandidates({jobId,requestId,maxCandidates=8,maxMillis=10000}){
  const previous=jobs.get(jobId);if(!previous)reject('JOB_REQUIRED');
  const plan=plans.get(previous.planId);if(!plan)reject('CANDIDATE_PLAN_REQUIRED');
  if(plan.strategyVersion!==CANDIDATE_STRATEGY_VERSION)reject('CANDIDATE_STRATEGY_STALE');
  if(!Number.isInteger(maxCandidates)||maxCandidates<1||maxCandidates>16||!Number.isFinite(maxMillis)||maxMillis<1||maxMillis>10000)reject('CANDIDATE_BUDGET_INVALID');
  if(typeof requestId!=='string'||!requestId||requestId.length>128)reject('REQUEST_ID_REQUIRED');
  const completedHashes=[...new Set([...(plan.completedHashes||[]),...previous.candidates.map(c=>c.candidateId)])];
  if(completedHashes.length>4096)reject('CANDIDATE_CONTINUATION_HISTORY_LIMIT');
  const resumed={...clone(plan),maxCandidates,maxMillis,startCursor:previous.nextCursor,previousJobId:jobId,completedHashes};
  const planId=`candidate-plan-${stableHash(resumed)}`,nextId=`candidate-job-${stableHash({planId,requestId})}`;
  if(jobs.has(nextId))return getCandidateJob({jobId:nextId});
  if(!['BUDGET_EXHAUSTED','cancelled','interrupted'].includes(previous.status)||previous.applicationRequest||previous.application||previous.workerTerminationUnconfirmedAtFailure||!Number.isSafeInteger(previous.nextCursor)||previous.nextCursor<0||previous.nextCursor>=100000)reject('CANDIDATE_CONTINUATION_UNAVAILABLE');
  current(plan.inputHash);if(stale(read(plan.evaluationId)))reject('STALE_INPUT');requireCurrentDesignSources(bridge,read(plan.evaluationId).sets);
  if(busy)reject('WORKFLOW_BUSY');plans.set(planId,resumed);return startCandidates({planId,requestId});
 }
 async function execute(job,plan) {
  const start=performance.now(),base=read(plan.evaluationId),seen=new Set(plan.completedHashes||[]),controller=new AbortController();let ordinal=0;
  candidateControllers.set(job.jobId,controller);
  const stageTiming=createCandidateStageTiming(job);stageTiming.enter('preparation');
  try {
   for(const spacing of plan.spacings)for(const diameter of plan.diameters)for(const section of plan.sectionCandidates||[null])for(const count of plan.barsPerFace||[null])for(const cover of plan.covers||[null])for(const edit of plan.detailCandidates||[null])for(const regionEdits of regionCandidateVariants(plan.regionConstraints,{order:plan.regionCandidateOrder}))for(const dependent of dependentCandidateVariants(plan.dependentCandidates,plan.dependentCommands)) {
    const cursor=ordinal++;if(cursor>=100000){job.status='SEARCH_LIMIT_EXCEEDED';return;}if(cursor<(plan.startCursor||0)){if(cursor%256===0){await new Promise(resolve=>setTimeout(resolve,0));if(disposed||job.cancelled||job.generation!==generation){job.status='cancelled';return;}if(performance.now()-start>=plan.maxMillis){job.status='BUDGET_EXHAUSTED';return;}}continue;}job.nextCursor=cursor;
    await new Promise(resolve=>setTimeout(resolve,0));
    if(disposed||job.cancelled||job.generation!==generation){job.status='cancelled';return;}
    current(plan.inputHash);requireCurrentDesignSources(bridge,base.sets);
    if(job.candidateCount>=plan.maxCandidates||performance.now()-start>=plan.maxMillis){job.status='BUDGET_EXHAUSTED';return;}
    const command=clone(plan.command);command.version++;if(command.type!=='reinforcement-record')Object.assign(command,edit);
    const commands=command.type==='reinforcement-record'?[]:changedDetailCommands([command],plan.originalCommands||[plan.command]);
    const changedDependent=changedDetailCommands(dependent,plan.dependentCommands||[]);
    commands.push(...changedDependent);
    if(section){const id=`P24-SEC-${stableHash({inputHash:plan.inputHash,memberId:plan.memberId}).slice(0,20)}`;commands.unshift({type:'section-record',id,name:'Bounded RC section candidate',version:1,shape:'RECT',dimensionUnit:'mm',...section,sourceNote:plan.generation?.sectionCandidates?'Recorded design NG: bounded automatic section alternative; architectural fit unverified':'Explicit dimension constraint'},{type:'member-assignment',memberIds:[plan.memberId],secId:`${id}@1`});}
    let hash=stableHash({commands,barsPerFace:count,spacing,diameter,cover,regionEdits});let counted=false;
    const candidateOwner=budget.nextOwner('candidate-transient');
    try {
     budget.reserve(candidateOwner,Math.ceil(retainedBytes(base.model)*3+retainedBytes(base.sets)*2));
     commands.push(...clone(plan.additionalCommands||[]));
     let layoutCount=count,endDevelopment=[],spliceLengthChanges=[],spliceDevelopment=[];
     if(command.type==='reinforcement-record'){
      stageTiming.enter('geometry');
      const built=await runCandidateGeometry({model:base.model,settings:{originalCommands:plan.originalCommands||[plan.command],options:{spacing,diameter,cover,section,barsPerFace:count,regionEdits,omitUnchanged:true,coupleEndDevelopment:!!plan.generation?.ok,spliceRepairs:plan.generation?.spliceRepairs}},budget,workerReservationBytes:Math.ceil(retainedBytes(base.model)*3+16*1024**2),timeoutMs:plan.maxMillis-(performance.now()-start),signal:controller.signal});
      current(plan.inputHash);requireCurrentDesignSources(bridge,base.sets);
      spliceDevelopment=built.spliceDevelopment||[];endDevelopment=built.endDevelopment||[];spliceLengthChanges=built.spliceLengthChanges||[];commands.push(...built.commands);Object.assign(command,built.commands.find(c=>c.type==='reinforcement-record')||plan.command);
      layoutCount=built.layoutCounts.length&&built.layoutCounts.every(n=>n===built.layoutCounts[0])?built.layoutCounts[0]:null;
     }
     for(const f of [...(plan.sectionFoundations||[]),...(plan.sectionJoints||[])])if(!dependent.some(d=>d.type===f.type&&d.id===f.id))dependent.push(f);
     const sectionCoupled=[...coupleSectionFoundations(base.model,plan.memberId,section,plan.sectionFoundations||[],commands),...coupleSectionJoints(base.model,plan.memberId,section,plan.sectionJoints||[],commands)];
     for(const c of sectionCoupled){const i=changedDependent.findIndex(d=>d.type===c.type&&d.id===c.id);if(i<0)changedDependent.push(c);else changedDependent[i]=c;}
     const differentialDependencies=rebindDifferentialPeerCommands(base.model,commands);
     commands.splice(0,commands.length,...differentialDependencies.commands);
     if(command.type==='foundation-record')Object.assign(command,commands.find(c=>c.type==='foundation-record'&&c.id===command.id)||command);
     if(!commands.length)reject('CANDIDATE_NO_CHANGE');
     if(commands.length>100)reject('CANDIDATE_COMMAND_LIMIT');
     hash=stableHash(commands);if(seen.has(hash))continue;seen.add(hash);const initialCandidateHash=hash;job.candidateCount++;counted=true;
     stageTiming.enter('preparation');
     let model=clone(base.model);for(const c of commands)stageDesignInputCommand(model,c,{},[]);if(!validateModel(model).ok)reject('CANDIDATE_GEOMETRY_INVALID');
     let impact=designInputImpact(base.model,model,bridge.getWorkflowInputIdentity({model:base.model}),bridge.getWorkflowInputIdentity({model}));
     if(plan.additionalCommands?.length)impact.decision='REANALYSIS_REQUIRED';
     let candidateSets,analysisProof,checks,summary,preparedDetails;const spliceRefinement=[];
     for(let refinementPass=0;;refinementPass++){
     stageTiming.enter('analysis');
     candidateSets=base.sets;analysisProof=[];
     const rcPolicy=rcIterationPolicy(base.sets);
     if(rcPolicy?.kind==='rc-splice'){
      impact.decision='REANALYSIS_REQUIRED';candidateSets=[];
      const owner=budget.nextOwner('candidate-splice-staging');
      try{
       budget.reserve(owner,retainedBytes(model)*3+rcSpliceWorkingBytes(model));
       for(const origin of base.sets){
        current(plan.inputHash);requireCurrentDesignSources(bridge,base.sets);
        const result=await runRcSpliceWorker({budget,workerReservationBytes:budget.snapshot().owners[owner],model,settings:{...origin.splicePolicy,comboId:origin.source.comboId,frameConvergence:true},timeoutMs:plan.maxMillis-(performance.now()-start),signal:controller.signal});
        candidateSets.push({...origin,set:result.set,analysisProof:result.proof});
        budget.reserve(owner,retainedBytes(model)*3+rcSpliceWorkingBytes(model)+retainedBytes(candidateSets)*3);
        analysisProof.push({...result.proof,comboId:origin.source.comboId,method:'rc-splice-frame',resultHash:stableHash(result.set),candidateInputHash:bridge.getWorkflowInputIdentity({model}).inputHash,isolated:true});
       }
      }finally{budget.release(owner);}
     }else if(rcPolicy){
      impact.decision='REANALYSIS_REQUIRED';
      if(model.nodes.length>limits.maxReanalysisNodes||(model.shells||[]).length||(model.slabs||[]).some(x=>x.type==='shell'))reject('CANDIDATE_REANALYSIS_SIZE_LIMIT');
      const owner=budget.nextOwner('candidate-rc-staging');
      budget.reserve(owner,estimateRcIterationWorkingSet(model,rcPolicy).estimatedBytes);
      try{
       const result=await runRcServiceWorker({budget,workerReservationBytes:budget.snapshot().owners[owner],model,settings:rcPolicy,timeoutMs:plan.maxMillis-(performance.now()-start),signal:controller.signal});
       if(!result.ok||!result.converged)reject(result.reason||'RC_CANDIDATE_ITERATION_FAILED');
       candidateSets=base.sets.map(origin=>{
        const set=result.analysis?.byCombo?.[origin.source.comboId];if(!set?.ok)reject('RC_ITERATION_COMBINATION_REQUIRED');
        const snapshot=designSetSnapshot(set);
        analysisProof.push({comboId:origin.source.comboId,method:'rc-service-iteration',resultHash:stableHash(snapshot),candidateInputHash:bridge.getWorkflowInputIdentity({model}).inputHash,converged:true,stiffnessProvenance:snapshot.stiffnessProvenance,profileHash:stableHash(result.profilesByCombo?.[origin.source.comboId]??result.profiles),pDeltaMethod:result.pDeltaMethod??'off',timeEffect:result.timeEffect??null,secondOrderTrace:result.secondOrderByCombo?.[origin.source.comboId]??null,isolated:true,globalMethodQualified:false});
        return {...origin,set:snapshot};
       });
      }finally{budget.release(owner);}
     } else if(impact.decision==='REANALYSIS_REQUIRED') {
      if(model.nodes.length>limits.maxReanalysisNodes||(model.shells||[]).length||(model.slabs||[]).some(x=>x.type==='shell'))reject('CANDIDATE_REANALYSIS_SIZE_LIMIT');
      candidateSets=[];
      for(const origin of base.sets){
       if(!origin.analysisCase)reject('CANDIDATE_ANALYSIS_PROVENANCE_REQUIRED');
       const settings=normalizeProductAnalysisCaseSettings('static',{...origin.analysisCase.settings,comboId:origin.source.comboId});
       if(!['off','direct'].includes(settings.pDeltaMethod))reject('CANDIDATE_ANALYSIS_METHOD_UNSUPPORTED');
       const owner=budget.nextOwner('candidate-analysis-staging'),dofs=model.nodes.length*6;
       budget.reserve(owner,Math.ceil(dofs*dofs*8*8+retainedBytes(model)*4));
       try {
        const set=await runCandidateAnalysis({budget,workerReservationBytes:budget.snapshot().owners[owner],model,settings,timeoutMs:plan.maxMillis-(performance.now()-start),signal:controller.signal});
        candidateSets.push({...origin,set:designSetSnapshot(set)});
        analysisProof.push({comboId:origin.source.comboId,method:settings.pDeltaMethod,resultHash:stableHash(designSetSnapshot(set)),candidateInputHash:bridge.getWorkflowInputIdentity({model}).inputHash,isolated:true});
       }finally{budget.release(owner);}
       await new Promise(resolve=>setTimeout(resolve,0));
       if(disposed||job.cancelled||job.generation!==generation){job.status='cancelled';return;}
       current(plan.inputHash);requireCurrentDesignSources(bridge,base.sets);if(performance.now()-start>=plan.maxMillis){job.status='BUDGET_EXHAUSTED';return;}
      }
     }
     const reserveEvaluation=result=>budget.reserve(candidateOwner,estimateCandidateEvaluationWorkingSet({model,sets:candidateSets,analysisProof,result}).estimatedBytes);
     reserveEvaluation();
     stageTiming.enter('evaluation');
     ({checks,summary,preparedDetails}=await runCandidateEvaluation({budget,workerReservationBytes:budget.snapshot().owners[candidateOwner],model,sets:candidateSets,mechanicsLaw:base.mechanicsLaw,timeoutMs:plan.maxMillis-(performance.now()-start),signal:controller.signal}));
     reserveEvaluation({checks,summary,preparedDetails});
     requireCurrentDesignSources(bridge,base.sets);
     current(plan.inputHash);if(job.generation!==generation||job.cancelled){job.status='cancelled';return;}
     if((plan.generation?.ok||plan.repairSpliceLengths===true)&&command.type==='reinforcement-record'&&refinementPass<MAX_SPLICE_REFINEMENT_PASSES&&classALengthDeficits(checks)>0){
      stageTiming.enter('geometry');
      const refined=await runCandidateSpliceRefinement({model,settings:{commands,checks},budget,workerReservationBytes:budget.snapshot().owners[candidateOwner],timeoutMs:plan.maxMillis-(performance.now()-start),signal:controller.signal});
      current(plan.inputHash);requireCurrentDesignSources(bridge,base.sets);
      if(refined.ok){
       spliceRefinement.push({pass:refinementPass+1,...refined,commands:undefined});delete spliceRefinement.at(-1).commands;
       commands.splice(0,commands.length,...refined.commands);if(commands.length>100)reject('CANDIDATE_COMMAND_LIMIT');
       hash=stableHash(commands);
       model=clone(base.model);for(const c of commands)stageDesignInputCommand(model,c,{},[]);if(!validateModel(model).ok)reject('CANDIDATE_GEOMETRY_INVALID');
       impact=designInputImpact(base.model,model,bridge.getWorkflowInputIdentity({model:base.model}),bridge.getWorkflowInputIdentity({model}));
       if(plan.additionalCommands?.length)impact.decision='REANALYSIS_REQUIRED';
       checks=null;summary=null;preparedDetails=null;candidateSets=null;analysisProof=null;
       continue;
      }
      spliceRefinement.push({pass:refinementPass+1,...refined});
     }
     break;
     }
     if(hash!==initialCandidateHash){if(seen.has(hash))continue;seen.add(hash);}
     stageTiming.enter('quantity');
     let objective;
     if(command.type==='reinforcement-record'){
     const member=model.members.find(x=>x.id===command.memberId),a=model.nodes.find(x=>x.id===member.n1),b=model.nodes.find(x=>x.id===member.n2);
     const length=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z),records=latestDetails(model,'reinforcement').filter(d=>d.memberId===member.id);
     let longitudinalVolume=0,geometricLongitudinalVolume=0,longitudinalQuantityComplete=true,secondaryFallback=0,secondaryFallbackComplete=true,transverseVolume=0,quantityComplete=true;
     for(const record of records){
      const geometry=preparedDetails.reinforcement[`${record.id}@${record.version}`];
      if(!geometry)reject('CANDIDATE_QUANTITY_REQUIRED');
      if(record.stirrups&&!Number.isSafeInteger(geometry.stirrupCount))reject('CANDIDATE_QUANTITY_REQUIRED');
      longitudinalVolume+=geometry.bars.reduce((sum,b)=>sum+b.bodyVolume,0);
      if(geometry.longitudinalQuantity?.status==='OK')geometricLongitudinalVolume+=geometry.longitudinalQuantity.volume;else longitudinalQuantityComplete=false;
      if(!record.stirrups){quantityComplete=false;secondaryFallbackComplete=false;continue;}
      secondaryFallback+=record.stirrups.legs*(record.stirrups.area??Math.PI*record.stirrups.diameter**2/4)*geometry.stirrupCount;
      if(geometry.transverseQuantity?.status==='OK')transverseVolume+=geometry.transverseQuantity.volume;else quantityComplete=false;
     }
     longitudinalVolume+=Object.values(preparedDetails.splices||{}).filter(s=>s.status==='OK'&&s.memberId===member.id).reduce((sum,s)=>sum+s.additionalVolume,0);
     if(longitudinalQuantityComplete)longitudinalVolume=geometricLongitudinalVolume;
     const sec=resolveSectionRecord(model,member.secId),concreteVolume=sec?.params?.B*(sec?.params?.H||sec?.params?.B)/1e6*length;
     objective={name:quantityComplete&&longitudinalQuantityComplete?'total-nominal-steel-volume-then-transverse-volume-then-concrete-volume':'incomplete-geometry-longitudinal-proxy',value:quantityComplete&&longitudinalQuantityComplete?longitudinalVolume+transverseVolume:longitudinalVolume,longitudinalVolume:longitudinalQuantityComplete?longitudinalVolume:null,unit:'m3',secondary:quantityComplete?transverseVolume:null,secondaryUnit:'m3',quantityComplete:quantityComplete&&longitudinalQuantityComplete,transverseQuantityComplete:quantityComplete,longitudinalQuantityComplete,longitudinalBasis:longitudinalQuantityComplete?'prepared-end-and-splice-pieces':'body-plus-lap-proxy',estimatedSteelVolume:quantityComplete&&longitudinalQuantityComplete?longitudinalVolume+transverseVolume:null,...(!quantityComplete?{secondaryFallback:secondaryFallbackComplete?secondaryFallback:null,secondaryFallbackComplete,secondaryFallbackUnit:'m2',quantityReason:'TRANSVERSE_GEOMETRY_INCOMPLETE; AREA_COUNT_PROXY_ONLY'}:{}),concreteVolume,fabricationQuantity:false,scope:'all-member-reinforcement-regions'};
     }else{
      const channel=command.type==='foundation-record'?'foundations':'connections',record=model.designDetails[channel].find(x=>x.id===command.id&&x.version===command.version);
      let steelVolume=0,concreteVolume=0,connectionQuantity;
      if(command.type==='foundation-record'){
       concreteVolume=record.B*record.L*record.thickness;
       const quantity=preparedDetails.foundations?.[`${record.id}@${record.version}`]?.reinforcementQuantity;
       if(quantity?.status!=='OK')reject(quantity?.reason||'CANDIDATE_QUANTITY_REQUIRED');
       steelVolume=quantity.steelVolume;
      }else{connectionQuantity=connectionCandidateQuantity(preparedDetails.connections?.[`${record.id}@${record.version}`]);steelVolume=connectionQuantity.steelVolume;}
      if(!Number.isFinite(steelVolume)||steelVolume<=0)reject('CANDIDATE_QUANTITY_REQUIRED');
      objective={quantityComplete:command.type!=='connection-record',...(connectionQuantity||{}),name:'approximate-steel-volume-then-concrete-volume',value:steelVolume,unit:'m3',secondary:concreteVolume,secondaryUnit:'m3',concreteVolume,fabricationQuantity:false};
     }
     // Cost compares the same requested scope in every variant, even when an
     // unchanged detail was omitted from the mutation list.
     if(dependent.length){
      const quantities=dependent.map(c=>{
       const record=latestDetails(model,c.type==='foundation-record'?'foundations':'connections').find(r=>r.id===c.id);
       let steelVolume=0,concreteVolume=0,connectionQuantity;
       if(c.type==='foundation-record'){
        concreteVolume=record.B*record.L*record.thickness;
       const quantity=preparedDetails.foundations?.[`${record.id}@${record.version}`]?.reinforcementQuantity;
       if(quantity?.status!=='OK')reject(quantity?.reason||'CANDIDATE_QUANTITY_REQUIRED');
       steelVolume=quantity.steelVolume;
       }else{connectionQuantity=connectionCandidateQuantity(preparedDetails.connections?.[`${record.id}@${record.version}`]);steelVolume=connectionQuantity.steelVolume;}
       if(!Number.isFinite(steelVolume)||steelVolume<=0||!Number.isFinite(concreteVolume))reject('CANDIDATE_QUANTITY_REQUIRED');
       return {id:c.id,type:c.type,version:record.version,changed:changedDependent.some(d=>d.type===c.type&&d.id===c.id),steelVolume,concreteVolume,quantityComplete:c.type!=='connection-record',...(connectionQuantity||{}),unit:'m3',fabricationQuantity:false};
      });
      objective={...objective,nominalGeometryAvailable:(objective.nominalGeometryAvailable??objective.quantityComplete!==false)&&quantities.every(q=>q.nominalGeometryAvailable??q.quantityComplete!==false),quantityComplete:objective.quantityComplete!==false&&quantities.every(q=>q.quantityComplete),name:'member-and-dependent-approximate-steel-volume',value:objective.value+quantities.reduce((s,q)=>s+q.steelVolume,0),estimatedSteelVolume:objective.estimatedSteelVolume==null||quantities.some(q=>!q.quantityComplete)?null:objective.estimatedSteelVolume+quantities.reduce((s,q)=>s+q.steelVolume,0),concreteVolume:objective.concreteVolume+quantities.reduce((s,q)=>s+q.concreteVolume,0),dependentQuantities:quantities,scope:'member-and-explicit-connected-details'};
     }
     if(plan.additionalCommands?.length){
      const related=relatedLongitudinalQuantity(plan.additionalCommands,preparedDetails);
      objective={...objective,name:'joint-and-related-longitudinal-steel-volume',value:objective.value+related.steelVolume,quantityComplete:false,nominalGeometryAvailable:objective.nominalGeometryAvailable===true&&related.nominalGeometryAvailable,relatedReinforcementQuantities:related.rows,quantityScope:'joint-transverse-and-related-longitudinal',scope:'joint-and-all-modified-continuous-column-records'};
     }
     const codeBasis=[...new Map(checks.map(x=>{const basis={checkId:x.checkId,...x.codeBasis};return [stableHash(basis),basis];})).values()];
     stageTiming.enter('comparison');
     const affectedScope=assessCandidateScope({model,commands,impact:impact.decision,baselineChecks:base.checks,checks,combinationCoverage:summary.combinationCoverage});
     const candidate={completionBlockers:candidateCompletionBlockers(checks,affectedScope.entityIds),engineeringSeverity:candidateEngineeringSeverity(checks,affectedScope.entityIds),affectedScope,candidateId:hash,candidateInputHash:bridge.getWorkflowInputIdentity({model}).inputHash,command,commands,changes:{kind:command.type,differentialReferences:differentialDependencies.rewired,regionCount:(plan.originalCommands||[plan.command]).length,changedRegionCount:commands.filter(c=>c.type==='reinforcement-record').length,regionPolicy:'local-constraints-override-global; omitted-fields-preserved-per-region',regionEdits,endDevelopment,spliceLengthChanges,spliceDevelopment,spliceRefinement,spliceRefinementState:spliceRefinementState(!!plan.generation?.ok||plan.repairSpliceLengths===true,spliceRefinement,checks),dependentDetails:changedDependent.map(c=>({id:c.id,type:c.type,version:c.version})),detailEdit:edit,stirrupSpacing:spacing,barDiameter:diameter,barsPerFace:layoutCount,cover,section},summary,objective,impact:impact.decision,analysisProof,codeBasis};
     job.candidates.push(candidate);
     if(!job.best||compare(candidateScore(candidate),candidateScore(job.best))<0)job.best=candidate;
    }catch(error){if(isCandidateWorkerFailure(error)){if(!counted)job.candidateCount++;recordCandidateWorkerFailure(job,error);return;}if(invalidatedSource(error))throw error;if(!counted)job.candidateCount++;if(error.code==='CANCELLED'){job.status='cancelled';return;}if(error.code==='CANDIDATE_TIMEOUT'){job.status='BUDGET_EXHAUSTED';return;}job.candidates.push({candidateId:hash,status:'rejected',reason:error.code||error.message});}finally{budget.release(candidateOwner);if(job.status==='running')job.nextCursor=cursor+1;}
    jobs.set(job.jobId,job);
   }
   job.status=!job.best?'NO_FEASIBLE_DESIGN':job.best.summary.complete?'completed':job.best.affectedScope.complete?'scope-completed':((job.best.summary.incompleteCheckCount??job.best.summary.counts.NOT_CHECKED)||job.best.summary.combinationCoverage.missingIds.length||job.best.summary.combinationCoverage.missingPurposes.length||job.best.summary.combinationCoverage.projectProfile?.status!=='OK')?'NEEDS_INPUT':'NO_FEASIBLE_DESIGN';
   if(plan.autoApply&&['completed','scope-completed'].includes(job.status)&&job.best.affectedScope.complete){stageTiming.enter('application');await runCandidateAutoApplication({job,apply:applyCandidateAndReview,publish:()=>jobs.set(job.jobId,job),isCurrent:()=>!disposed&&job.generation===generation});}
  }catch(error){if(isCandidateWorkerFailure(error))recordCandidateWorkerFailure(job,error);job.status=invalidatedSource(error)?'STALE_INPUT':'failed';job.error=error.code||error.message;if(invalidatedSource(error)){job.best=null;job.candidates=[];}}
  finally {stageTiming.finish();candidateControllers.delete(job.jobId);if(job.generation===generation){busy=false;if(!disposed){job.elapsedMs=performance.now()-start;jobs.set(job.jobId,job);}}}
 }
 function getCandidateJob({jobId,offset=0,limit=4}) {
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>4)reject('PAGINATION_INVALID');
  const job=jobs.get(jobId);if(!job)reject('JOB_REQUIRED');
  const summary=(c,includeProof=false)=>candidateQuerySummary(c,{jobId,includeProof});
  return {ok:true,jobId:job.jobId,status:job.status,stageTiming:candidateStageSnapshot(job),previousJobId:job.previousJobId||null,nextCursor:job.nextCursor??null,continuationAvailable:['BUDGET_EXHAUSTED','cancelled','interrupted'].includes(job.status)&&!job.applicationRequest&&!job.application&&!job.workerTerminationUnconfirmedAtFailure&&Number.isSafeInteger(job.nextCursor)&&job.nextCursor<100000,workerTerminationUnconfirmedAtFailure:!!job.workerTerminationUnconfirmedAtFailure,discardedCandidateCount:job.discardedCandidateCount||0,applicationRequest:clone(job.applicationRequest||null),application:clone(job.application||null),candidateCount:job.candidateCount,offset,total:job.candidates.length,nextOffset:offset+limit<job.candidates.length?offset+limit:null,candidates:job.candidates.slice(offset,offset+limit).map(c=>summary(c)),best:summary(job.best,true),elapsedMs:job.elapsedMs||0,error:job.error||null,stale:plans.get(job.planId)?.strategyVersion!==CANDIDATE_STRATEGY_VERSION||!evaluations.has(plans.get(job.planId).evaluationId)||stale(evaluations.get(plans.get(job.planId).evaluationId)),designTransferAllowed:false};
 }
 function getCandidateDetail({jobId,candidateId,offset=0,limit=4096}) {
  const job=jobs.get(jobId);if(!job)reject('JOB_REQUIRED');
  const candidate=job.candidates.find(c=>c.candidateId===candidateId);if(!candidate)reject('CANDIDATE_REQUIRED');
  const plan=plans.get(job.planId),base=plan&&evaluations.get(plan.evaluationId);
  return {ok:true,jobId,candidateId,inputHash:base?.inputHash||null,candidateInputHash:candidate.candidateInputHash||null,stale:plan?.strategyVersion!==CANDIDATE_STRATEGY_VERSION||!base||stale(base),...candidateDetailReader.read(`${jobId}:${candidateId}:${base?.id}`,candidate,{offset,limit,baselineSplices:base?.model?.designDetails?.splices||[],baselineReinforcement:base?.model?.designDetails?.reinforcement||[],baselineFoundations:base?.model?.designDetails?.foundations||[],baselineConnections:base?.model?.designDetails?.connections||[]}),designTransferAllowed:false};
 }
 function getCandidateBasis({jobId,candidateId,offset=0,limit=2}) {
  const job=jobs.get(jobId);if(!job)reject('JOB_REQUIRED');
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>2)reject('PAGINATION_INVALID');
  const candidate=job.candidates.find(x=>x.candidateId===candidateId&&x.codeBasis);if(!candidate)reject('CANDIDATE_REQUIRED');
  const plan=plans.get(job.planId),base=plan&&evaluations.get(plan.evaluationId);
  return {ok:true,jobId,candidateId,inputHash:base?.inputHash||null,candidateInputHash:candidate.candidateInputHash||null,stale:plan?.strategyVersion!==CANDIDATE_STRATEGY_VERSION||!base||stale(base),offset,total:candidate.codeBasis.length,rows:clone(candidate.codeBasis.slice(offset,offset+limit)),nextOffset:offset+limit<candidate.codeBasis.length?offset+limit:null,designTransferAllowed:false};
 }
 function releaseCandidates(input){
  finiteJson(input);object(input,['jobId','planId']);
  if(['jobId','planId'].filter(k=>input[k]!==undefined).length!==1||!['jobId','planId'].some(k=>typeof input[k]==='string'&&input[k].length>0&&input[k].length<=128))reject('SINGLE_CANDIDATE_RESOURCE_REQUIRED');
  const before=budget.snapshot().totalBytes;let releasedJobs=0,releasedPlans=0,releasedCacheEntries=0;
  if(input.jobId){
   const job=jobs.get(input.jobId);
   if(job){
    if(['running','applying'].includes(job.status)||candidateControllers.has(job.jobId)||job.workerTerminationUnconfirmedAtFailure||applicationReviews.size)reject('CANDIDATE_RESOURCES_IN_USE');
    const fingerprints=new Set(job.candidates.map(c=>stableHash({jobId:job.jobId,candidateId:c.candidateId})));
    for(const application of applications.values())if((application.jobId===job.jobId||fingerprints.has(application.fingerprint))&&application.receipt?.followUp?.status!=='completed')reject('CANDIDATE_FOLLOW_UP_REQUIRED');
    releasedCacheEntries=candidateDetailReader.releaseJob(job.jobId);jobs.delete(job.jobId);releasedJobs=1;
    if(![...jobs.values()].some(other=>other.planId===job.planId))releasedPlans=plans.delete(job.planId)?1:0;
   }
  }else{
   if([...jobs.values()].some(job=>job.planId===input.planId))reject('CANDIDATE_PLAN_REFERENCED');
   releasedPlans=plans.delete(input.planId)?1:0;
  }
  return {ok:true,releasedJobs,releasedPlans,releasedCacheEntries,releasedManagedBytes:before-budget.snapshot().totalBytes,accounting:'conservative-retained-data-estimate',applicationReceiptsPreserved:true,modelChanged:false,designTransferAllowed:false};
 }
 function cancelCandidates({jobId}) {const job=jobs.get(jobId);if(!job)reject('JOB_REQUIRED');if(job.status==='applying')return {ok:false,jobId,code:'CANDIDATE_APPLICATION_IN_PROGRESS',status:job.status,applicationRequest:clone(job.applicationRequest)};job.cancelled=true;candidateControllers.get(jobId)?.abort();return {ok:true,jobId,status:job.status==='running'?'cancelling':job.status};}
 function applyCandidate({jobId,candidateId,requestId}) {
  if(typeof requestId!=='string'||!requestId||requestId.length>128)reject('REQUEST_ID_REQUIRED');
  const fingerprint=stableHash({jobId,candidateId}),prior=applications.get(requestId);
  if(prior){if(prior.fingerprint!==fingerprint)reject('REQUEST_ID_CONFLICT');return {...clone(prior.receipt),replayed:true};}
  const job=jobs.get(jobId),plan=plans.get(job?.planId);if(!plan)reject('CANDIDATE_PLAN_REQUIRED');if(plan.strategyVersion!==CANDIDATE_STRATEGY_VERSION)reject('CANDIDATE_STRATEGY_STALE');current(plan.inputHash);
  if(stale(read(plan.evaluationId)))reject('STALE_EVALUATOR_OR_INPUT');
  const candidate=job.candidates.find(x=>x.candidateId===candidateId&&x.command);if(!candidate)reject('CANDIDATE_REQUIRED');
  const preview=bridge.previewDesignInputChanges({requestId,units:clone(DESIGN_INPUT_UNITS),commands:candidate.commands||[candidate.command]});if(!preview.ok)return preview;
  applications.set(requestId,{fingerprint,jobId,receipt:null});
  try {
   const applied=bridge.applyDesignInputChanges(preview);
   if(!applied.ok){applications.delete(requestId);return applied;}
   const receipt={ok:true,changed:applied.changed,requestId,transactionId:applied.transactionId,inputIdentity:applied.inputIdentity,requiredNext:candidate.impact==='REANALYSIS_REQUIRED'?'new-analysis-and-design-evaluation':'explicit-analysis-reuse-and-new-design-evaluation',designTransferAllowed:false};
   applications.set(requestId,{fingerprint,jobId,receipt});return clone(receipt);
  }catch(error){applications.delete(requestId);throw error;}
 }
 function applyCandidateAndReview(args) {
  const {requestId,jobId,candidateId}=args;
  const fingerprint=stableHash({jobId,candidateId});
  const prior=applications.get(requestId);
  if(prior&&prior.fingerprint!==fingerprint)reject('REQUEST_ID_CONFLICT');
  if(applicationReviews.has(requestId))return applicationReviews.get(requestId);
  if(prior?.receipt?.followUp?.status==='completed')return Promise.resolve({...clone(prior.receipt),replayed:true});
  const job=jobs.get(jobId),plan=plans.get(job?.planId),base=plan&&read(plan.evaluationId);
  if(!base)reject('CANDIDATE_PLAN_REQUIRED');
  const candidate=job.candidates.find(x=>x.candidateId===candidateId&&x.command);if(!candidate)reject('CANDIDATE_REQUIRED');
  const rcPolicy=rcIterationPolicy(base.sets);
  if(!rcPolicy&&candidate.impact==='REANALYSIS_REQUIRED')for(const origin of base.sets){
   const currentCase=bridge.getCurrentModel().analysisCases?.find(x=>x.id===origin.analysisCase?.id);
   if(currentCase?.kind!=='static'||currentCase.settings?.comboId!==origin.source.comboId)reject('REANALYSIS_CASE_MAPPING_REQUIRED');
  }
  const task=(async()=>{
   const receipt=applyCandidate(args);if(!receipt.ok)return receipt;
   const generationAtStart=generation,attempt=(receipt.followUp?.attempt||0)+1;
   const verify=()=>{if(generationAtStart!==generation)reject('SESSION_DISPOSED');current(receipt.inputIdentity.inputHash);};
   const save=followUp=>{verify();const summary=followUp.summary?{complete:followUp.summary.complete,counts:followUp.summary.counts,checkCount:followUp.summary.checkCount,failedEntityCount:followUp.summary.failedEntityCount,uncheckedEntityCount:followUp.summary.uncheckedEntityCount}:undefined;
    const updated={...receipt,followUp:{...followUp,...(summary?{summary}:{}),attempt},requiredNext:followUp.status==='completed'?(summary?.complete?'independent-review-and-artifacts':'resolve-remaining-design-checks'):receipt.requiredNext};
    const entry={fingerprint,jobId,receipt:updated};
    if(retainedBytes(entry)>16000&&updated.followUp.comparison){
     const comparison=updated.followUp.comparison,budget=16000-(retainedBytes(entry)-retainedBytes(comparison))-128;
     updated.followUp.comparison=compactApplicationComparisonSummary(comparison,budget);
    }
    if(retainedBytes(entry)>16000)reject('APPLICATION_RECEIPT_SIZE_LIMIT');
    applications.set(requestId,entry);return clone(updated);};
   try {
    verify();let sources=receipt.followUp?.sources||[];
    save({status:'running',sources});
    if(rcPolicy?.kind==='rc-splice'){
     for(const origin of base.sets.slice(sources.length)){
      verify();const run=await bridge.solveRcSpliceModel({inputHash:receipt.inputIdentity.inputHash,...origin.splicePolicy,comboId:origin.source.comboId,frameConvergence:true});
      verify();if(!run.ok||!run.frameRefinement?.convergenceVerified||!run.elasticRangeSatisfied)reject(run.reason||'POST_APPLY_RC_SPLICE_FAILED');
      sources.push({rcSpliceId:run.sourceId,comboId:origin.source.comboId});save({status:'running',sources});
     }
    }else if(rcPolicy){
     if(!sources.length){
      const run=await bridge.runRcServiceIteration({inputHash:receipt.inputIdentity.inputHash,...rcPolicy});
      verify();if(!run.ok||!run.converged||run.stale)reject(run.reason||'POST_APPLY_RC_ITERATION_FAILED');
      sources=base.sets.map(origin=>({rcIterationId:run.iterationId,comboId:origin.source.comboId}));
      save({status:'running',sources});
     }
    }else if(candidate.impact==='REANALYSIS_REQUIRED'){
     if(!sources.length){
      const workflowPlan=bridge.planElasticWorkflow({caseIds:[...new Set(base.sets.map(x=>x.analysisCase.id))]});
      if(!workflowPlan.ok)reject(workflowPlan.code||'POST_APPLY_PLAN_FAILED');
      const run=await bridge.runElasticWorkflow({plan:workflowPlan,requestId:`followup-${stableHash({requestId,fingerprint,attempt}).slice(0,40)}`});
      verify();if(!run.ok)reject(run.code||'POST_APPLY_ANALYSIS_FAILED');
      sources=base.sets.map(origin=>{const step=run.steps.find(x=>x.caseId===origin.analysisCase.id);if(!step?.analysisRunId)reject('POST_APPLY_RESULT_REQUIRED');return {analysisRunId:step.analysisRunId,comboId:origin.source.comboId};});
      save({status:'running',sources});
     }
    } else {
     for(const origin of base.sets.slice(sources.length)){
      verify();const reused=bridge.reuseDesignAnalysis({analysisRunId:origin.source.analysisRunId,inputHash:receipt.inputIdentity.inputHash});
      if(!reused.ok)reject(reused.code||'POST_APPLY_REUSE_FAILED');sources.push({analysisRunId:reused.analysisRunId,comboId:origin.source.comboId});save({status:'running',sources});
     }
    }
    verify();const evaluated=await evaluate({inputHash:receipt.inputIdentity.inputHash,sources,...(base.mechanicsLaw?{mechanicsLaw:base.mechanicsLaw}:{})});
    const after=read(evaluated.evaluationId);
    const actualScope=assessCandidateScope({model:after.model,commands:candidate.commands||[candidate.command],impact:candidate.impact,baselineChecks:base.checks,checks:after.checks,combinationCoverage:after.summary.combinationCoverage});
    const comparison={...compareDesignChecks(base.checks,after.checks),connectedGeometryChanges:connectedGeometryChanges(base.model,after.model,candidate.commands||[candidate.command]),completionBlockers:candidateCompletionBlockers(after.checks,actualScope.entityIds),repairOutcome:designRepairOutcome({checks:after.checks,commands:candidate.commands||[candidate.command],originalRegions:plan.originalCommands?.filter(c=>c.type==='reinforcement-record'),entityIds:actualScope.entityIds}),proposalProvenance:proposalProvenance(plan.generation,base),beforeEvaluationId:base.id,afterEvaluationId:after.id,beforeInputHash:base.inputHash,afterInputHash:after.inputHash,
     affectedScope:{complete:actualScope.complete,projectComplete:actualScope.projectComplete,basis:actualScope.basis,unaffectedRegressionCount:actualScope.unaffectedRegressionCount,unaffectedSourceRecordChangeCount:actualScope.unaffectedSourceRecordChangeCount,missingCheckCount:actualScope.missingCheckCount,missingEntityCount:actualScope.missingEntityIds.length},
     detailQuery:{tool:'get_practical_design_result',beforeEvaluationId:base.id,afterEvaluationId:after.id},checkDetailTool:'get_practical_design_check'};
    const comparisonSummary=applicationComparisonSummary(comparison);
    evaluations.set(after.id,{...after,designComparison:comparisonSummary,designComparisonDetails:comparison});
    return save({status:'completed',sources,evaluationId:evaluated.evaluationId,summary:evaluated.summary,...(evaluated.remainingRepairs?{remainingRepairs:evaluated.remainingRepairs}:{}),comparison:comparisonSummary,designTransferAllowed:false});
   }catch(error){
    if(generationAtStart===generation&&!disposed&&receipt.inputIdentity.inputHash===identity().inputHash){const currentReceipt=applications.get(requestId)?.receipt||receipt;applications.set(requestId,{fingerprint,jobId,receipt:{...currentReceipt,followUp:{...currentReceipt.followUp,status:'failed',code:error.code||error.message}}});}
    return {...receipt,ok:false,applied:true,code:error.code||error.message,requiredNext:'retry-follow-up-or-undo-input',designTransferAllowed:false};
   }
  })();
  applicationReviews.set(requestId,task);void task.finally(()=>{if(applicationReviews.get(requestId)===task)applicationReviews.delete(requestId);}).catch(()=>{});return task;
 }
 function exportState() {
  const body={version:PRACTICAL_WORKFLOW_VERSION,evaluations:[...evaluations],plans:[...plans],jobs:[...jobs].map(([id,row])=>[id,{...row,status:['running','applying'].includes(row.status)?'interrupted':row.status,cancelled:true}]),applications:[...applications]};
  return {...clone(body),checksum:stableHash(body)};
 }
 function restoreState(state) {
  if(evaluations.size||plans.size||jobs.size||applications.size||busy||evaluationController)reject('PRACTICAL_RESTORE_REQUIRES_EMPTY_RUNTIME');
  if(!state){disposed=false;return {ok:true,evaluations:0};}
  const {checksum,...body}=state;
  if(body.version!==PRACTICAL_WORKFLOW_VERSION||stableHash(body)!==checksum)reject('PRACTICAL_CHECKPOINT_INVALID');
  const limits={evaluations:8,plans:16,jobs:16,applications:64};
  for(const [key,max] of Object.entries(limits))if(!Array.isArray(body[key])||body[key].length>max||new Set(body[key].map(x=>x[0])).size!==body[key].length)reject('PRACTICAL_CHECKPOINT_INVALID');
  for(const [id,row] of body.evaluations)if(id!==row.id||!validIdentity(row.inputIdentity)||row.inputIdentity.inputHash!==row.inputHash||!validateModel(row.model).ok||stableHash(summarizePracticalChecks(row.checks,row.summary?.combinationCoverage?designCombinationCoverage(row.model,Object.fromEntries(row.sets.map(x=>[x.source.comboId,x.set]))):undefined))!==stableHash(row.summary))reject('PRACTICAL_CHECKPOINT_INVALID');
  for(const [id,row] of body.evaluations)if(row.designComparison&&(row.designComparison.afterEvaluationId!==id||row.designComparison.afterInputHash!==row.inputHash||row.designComparison.afterChecksHash!==stableHash(row.checks)))reject('PRACTICAL_COMPARISON_CHECKPOINT_INVALID');
  for(const [,row] of body.evaluations)if(row.designComparison?.detailHash&&(!row.designComparisonDetails||stableHash(row.designComparisonDetails)!==row.designComparison.detailHash))reject('PRACTICAL_COMPARISON_CHECKPOINT_INVALID');
  const evaluationIds=new Set(body.evaluations.map(x=>x[0])),planIds=new Set(body.plans.map(x=>x[0]));
  for(const [,row] of body.plans)if(!evaluationIds.has(row.evaluationId))reject('PRACTICAL_CHECKPOINT_INVALID');
  for(const [,row] of body.plans)if(row.startCursor!==undefined&&(!Number.isSafeInteger(row.startCursor)||row.startCursor<0||row.startCursor>=100000)||row.completedHashes!==undefined&&(!Array.isArray(row.completedHashes)||row.completedHashes.length>4096||row.completedHashes.some(h=>typeof h!=='string'||!/^[a-f0-9]{64}$/.test(h))))reject('PRACTICAL_CHECKPOINT_INVALID');
  for(const [,row] of body.jobs)if(row.nextCursor!==undefined&&(!Number.isSafeInteger(row.nextCursor)||row.nextCursor<0||row.nextCursor>100000))reject('PRACTICAL_CHECKPOINT_INVALID');
  for(const [id,row] of body.jobs)if(id!==row.jobId||!planIds.has(row.planId)||!Array.isArray(row.candidates)||row.candidates.length>16)reject('PRACTICAL_CHECKPOINT_INVALID');
  for(const [,row] of body.applications)if(!row.receipt?.ok||!validIdentity(row.receipt.inputIdentity)||retainedBytes(row)>16000)reject('PRACTICAL_CHECKPOINT_INVALID',{reason:'APPLICATION_RECEIPT_INVALID',receiptBytes:retainedBytes(row),comparisonBytes:retainedBytes(row.receipt?.followUp?.comparison)});
  const staged=new BudgetMap(budget,'practical-restore',{maxEntries:104});
  try {
   for(const [key] of Object.entries(limits))for(const [id,row] of body[key])staged.setCopy(`${key}:${id}`,row);
   generation++;disposed=false;
   for(const [id,row] of body.evaluations)evaluations.setCopy(id,{...row,restoredWithoutBuild:!row.inputIdentity.buildBound,designTransferAllowed:false});
   for(const [id,row] of body.plans)plans.setCopy(id,row);
   for(const [id,row] of body.jobs)jobs.setCopy(id,{...row,generation,status:['running','applying'].includes(row.status)?'interrupted':row.status});
   for(const [id,row] of body.applications)applications.setCopy(id,row);
  }catch(error){evaluations.clear();plans.clear();jobs.clear();applications.clear();throw error;}finally{staged.clear();}
  return {ok:true,evaluations:evaluations.size,interruptedJobs:[...jobs.values()].filter(x=>x.status==='interrupted').length};
 }
 return {evaluate,cancelEvaluation(){const active=!!evaluationController;evaluationController?.abort();return {ok:true,cancelRequested:active};},getEvaluation,getEvaluationStatus,releaseEvaluation,getCheckDetail,planCandidates,startCandidates,resumeCandidates,getCandidateJob,getCandidateDetail,getCandidateBasis,cancelCandidates,releaseCandidates,applyCandidate,applyCandidateAndReview,exportState,restoreState,resume(){disposed=false;},
  getContext:()=>({ok:true,version:PRACTICAL_WORKFLOW_VERSION,candidateStrategyVersion:CANDIDATE_STRATEGY_VERSION,loadScopeHash:profileLoadScopeHash(bridge.getCurrentModel()),projectProfile:evaluateProjectProfile(bridge.getCurrentModel()),evaluations:[...evaluations.values()].map(x=>({evaluationId:x.id,inputHash:x.inputHash,...currentness(x),sources:clone((x.sets||[]).map(set=>set.source)),summary:clone(x.summary)})),jobs:[...jobs.keys()],plans:[...plans].map(([planId,p])=>({planId,evaluationId:p.evaluationId,referenced:[...jobs.values()].some(job=>job.planId===planId)})),limits:{...limits},evaluationExecution:{mode:'module-worker',active:!!evaluationController,timeoutMs:10000},memory:budget.snapshot(),candidateDetailCache:candidateDetailReader.stats(),rules:'CLAUSE_PARTIAL_IMPLEMENTED',designTransferAllowed:false}),
  hasRetainedState:()=>!!(evaluations.size||plans.size||jobs.size||applications.size||evaluationController||busy||candidateControllers.size||applicationReviews.size),
  drawingSnapshotBytes:evaluationId=>retainedBytes(selectDrawingSnapshot(read(evaluationId))),readDrawingSnapshot:evaluationId=>clone(selectDrawingSnapshot(read(evaluationId))),
  snapshotBytes:evaluationId=>retainedBytes(read(evaluationId)),readSnapshot:evaluationId=>clone(read(evaluationId)),dispose(){candidateDetailReader.clear();evaluationController?.abort();disposed=true;generation++;busy=false;for(const controller of candidateControllers.values())controller.abort();candidateControllers.clear();applicationReviews.clear();for(const job of jobs.values())job.cancelled=true;evaluations.clear();plans.clear();jobs.clear();applications.clear();}};
}
function compare(a,b){for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;}

function rcIterationPolicy(sets){
 if(sets.some(r=>r.source.rcSpliceId)){
  if(sets.some(r=>!r.source.rcSpliceId))reject('RC_SPLICE_CANDIDATE_MIXED_SOURCE_UNSUPPORTED');
  if(sets.some(r=>!r.splicePolicy||r.splicePolicy.frameConvergence!==true))reject('RC_SPLICE_CANDIDATE_POLICY_REQUIRED');
  return {kind:'rc-splice'};
 }
 const rows=sets.filter(r=>r.source.rcIterationId);if(!rows.length)return null;
 if(rows.length!==sets.length||new Set(rows.map(r=>r.source.rcIterationId)).size!==1)reject('RC_CANDIDATE_SINGLE_ITERATION_REQUIRED');
 const policy=rows[0].iterationPolicy;
 if(!(['fully-cracked-elastic','kds-elastic-second-order'].includes(policy?.stiffnessMode)?policy.comboIds?.length:policy?.liveComboId)||rows.some(r=>stableHash(r.iterationPolicy)!==stableHash(policy)))reject('RC_CANDIDATE_POLICY_REQUIRED');
 return policy;
}
