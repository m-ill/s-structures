import {prepareRcPostAttachmentReview} from './rcPostAttachmentReview.js';
import {formatRcPostAttachmentReview} from '../../report/phase24/rcPostAttachmentReport.js';
import {integratedStageExtrema} from './rcIntegratedExtrema.js';
import {rcStageTimeState} from './rcStageTimeState.js';
import {combineRcIntegratedDisplacements} from './rcIntegratedDisplacements.js';
import {combineRcMemberServiceResponses} from '../../design/rc/frameServiceResponse.js';
import {validIdentity} from '../../core/workflowIdentity.js';
import {designSetSnapshot} from './candidateAnalysisSnapshot.js';
import {runRcServiceWorker} from './candidateAnalysisClient.js';
import {RC_SERVICE_ITERATION_VERSION,KDS_SECOND_ORDER_STIFFNESS_VERSION} from '../../metadata/rcServicePolicy.js';
import {stableHash} from '../../core/stableHash.js';
import {BudgetMap,retainedBytes} from '../../core/resourceBudget.js';
import {jsonTextWindow} from '../../core/jsonTextWindow.js';
import {finiteJson,object} from '../../modeling/designInputCommands.js';
import {PRACTICAL_DESIGN_LIMITS as limits} from '../../metadata/practicalDesignLimits.js';
import {estimateRcIterationWorkingSet} from './rcIterationWorkingSet.js';
import {verifyRefinedFrameServiceResponses} from './refinedFrameServiceResponses.js';

export function createRcServiceWorkflow({bridge,budget,workerFactory}){
 const records=new BudgetMap(budget,'rc-service-iterations',{maxEntries:2});
 let active=null,disposed=false;
 const fail=code=>{throw Object.assign(Error(code),{code});};
 const current=hash=>{if(disposed)fail('SESSION_DISPOSED');if(hash!==bridge.getWorkflowInputIdentity().inputHash)fail('STALE_INPUT');};
 const get=({iterationId}={})=>{
  const row=records.get(iterationId);if(!row)fail('RC_ITERATION_REQUIRED');
  return {ok:true,iterationId,inputHash:row.inputHash,workingSetEstimate:structuredClone(row.workingSetEstimate??null),stiffnessByCombo:Object.fromEntries(Object.entries(row.result.analysis?.byCombo||{}).map(([id,set])=>[id,structuredClone(set.stiffnessProvenance??null)])),serviceabilitySummary:Object.fromEntries(Object.entries(row.result.serviceabilityByMember||{}).map(([id,r])=>[id,{status:r.status,serviceabilityMode:r.serviceabilityMode,demand:r.demand,capacity:r.capacity,ratio:r.ratio,globalCreepRedistributionIncluded:false}])),stale:row.restoredWithoutBuild===true||row.result.rcPolicyVersion!==RC_SERVICE_ITERATION_VERSION||row.inputHash!==bridge.getWorkflowInputIdentity().inputHash,stiffnessMode:row.result.stiffnessMode??'effective-inertia',timeEffect:row.result.timeEffect??null,globalEffectiveModulusRedistributionIncluded:row.result.globalEffectiveModulusRedistributionIncluded??false,timeHistoryCreepRedistributionIncluded:false,specifiedShrinkageIncluded:row.result.specifiedShrinkageIncluded===true,pDeltaMethod:row.result.pDeltaMethod??'off',secondOrderByCombo:structuredClone(row.result.secondOrderByCombo||{}),method:row.result.method??null,qualification:row.result.qualification??null,spatialDiscretizationQualified:row.result.spatialDiscretizationQualified??null,spatialConverged:row.result.spatialConverged??false,spatialTolerance:row.result.spatialTolerance??null,spatialTrace:structuredClone(row.result.spatialTrace||{}),converged:row.result.converged,comboIds:Object.keys(row.result.analysis?.byCombo||{}),reason:row.result.reason??null,trace:structuredClone(row.result.trace),codeReferences:structuredClone(row.result.codeReferences||[]),globalMethodQualified:false,designTransferAllowed:false};
 };
 return {
  async run(input){
   finiteJson(input);object(input,['inputHash','liveComboId','maxIterations','tolerance','stiffnessMode','comboIds','spatialTolerance','maxRefinements','timeEffect']);current(input.inputHash);
   const mode=input.stiffnessMode??'effective-inertia';
   if(!['effective-inertia','fully-cracked-elastic','kds-elastic-second-order'].includes(mode))fail('RC_STIFFNESS_MODE_INVALID');
   if(mode==='effective-inertia'&&(typeof input.liveComboId!=='string'||!input.liveComboId.length||input.liveComboId.length>128))fail('RC_SERVICE_LIVE_SOURCE_REQUIRED');
   if(mode!=='effective-inertia'&&(!Array.isArray(input.comboIds)||!input.comboIds.length||input.comboIds.length>8||input.comboIds.some(id=>typeof id!=='string'||!id.length||id.length>128)||new Set(input.comboIds).size!==input.comboIds.length))fail('RC_COUPLED_COMBINATIONS_REQUIRED');
   if(mode==='effective-inertia'&&input.comboIds!==undefined||mode!=='effective-inertia'&&input.liveComboId!==undefined)fail('RC_STIFFNESS_MODE_INPUT_CONFLICT');
   if(mode==='effective-inertia'&&(input.spatialTolerance!==undefined||input.maxRefinements!==undefined))fail('RC_STIFFNESS_MODE_INPUT_CONFLICT');
   if(mode!=='effective-inertia'&&(!Number.isFinite(input.spatialTolerance??.002)||(input.spatialTolerance??.002)<=0||(input.spatialTolerance??.002)>.02||!Number.isInteger(input.maxRefinements??2)||(input.maxRefinements??2)<1||(input.maxRefinements??2)>3))fail('RC_SPATIAL_OPTIONS_INVALID');
   if(input.timeEffect!==undefined&&(mode!=='fully-cracked-elastic'||!['instantaneous','sustained-effective-modulus','attachment-effective-modulus'].includes(input.timeEffect)))fail('RC_TIME_EFFECT_MODE_CONFLICT');
   if(active)fail('RC_ITERATION_BUSY');
   const controller=new AbortController(),owner=budget.nextOwner('rc-iteration-transient');active=controller;
   try{
    const source=bridge.getCurrentModel();
    if((source.members||[]).length>limits.maxMembers||(source.loadCombinations||[]).length>8)fail('FOCUSED_DESIGN_SIZE_LIMIT');
    const settings={...(mode==='kds-elastic-second-order'?{stiffnessMode:mode,comboIds:structuredClone(input.comboIds),spatialTolerance:input.spatialTolerance??.002,maxRefinements:input.maxRefinements??2}:mode==='fully-cracked-elastic'?{stiffnessMode:mode,timeEffect:input.timeEffect??'instantaneous',comboIds:structuredClone(input.comboIds),spatialTolerance:input.spatialTolerance??.002,maxRefinements:input.maxRefinements??2}:{liveComboId:input.liveComboId}),maxIterations:input.maxIterations??20,tolerance:input.tolerance??1e-6};
    const workingSetEstimate=estimateRcIterationWorkingSet(source,settings);budget.reserve(owner,workingSetEstimate.estimatedBytes);
    const model=structuredClone(source);
    const result=await runRcServiceWorker({model,settings,signal:controller.signal,timeoutMs:10000,workerFactory,budget,workerReservationBytes:workingSetEstimate.estimatedBytes,workerReservationOwner:owner});
    current(input.inputHash);if(controller.signal.aborted)fail('CANCELLED');
    const iterationId=`rc-iteration-${stableHash({inputHash:input.inputHash,settings,version:RC_SERVICE_ITERATION_VERSION})}`;
    const row={inputHash:input.inputHash,inputIdentity:bridge.getWorkflowInputIdentity(),settings,result,workingSetEstimate};row.resultHash=stableHash(result);records.set(iterationId,row);
    return get({iterationId});
   }finally{if(active===controller)active=null;budget.release(owner);}
  },
  get,
  barForces(input){
   finiteJson(input);object(input,['iterationId','comboId','stationIndex','offset','limit']);
   const state=get(input);current(state.inputHash);if(state.stale)fail('STALE_INPUT');
   if(!state.converged)fail('RC_ITERATION_CONVERGENCE_REQUIRED');
   const index=input.stationIndex,offset=input.offset??0,limit=input.limit??25;
   if(!Number.isInteger(index)||index<0||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>25)fail('PAGINATION_INVALID');
   const row=records.get(input.iterationId),stations=row.result.stationsByCombo?.[input.comboId],station=stations?.[index];
   if(!station||!Array.isArray(station.steelForces)||station.steelForces.length>100||!station.steelForces.every(Number.isFinite)||!station.sectionComponents)fail('RC_BAR_FORCE_STATION_REQUIRED');
   if(offset>station.steelForces.length)fail('PAGINATION_INVALID');
   const end=Math.min(offset+limit,station.steelForces.length);
   return {ok:true,iterationId:input.iterationId,inputHash:state.inputHash,resultHash:row.resultHash,comboId:input.comboId,policyVersion:row.result.rcPolicyVersion,timeEffect:row.result.timeEffect??'instantaneous',codeReferences:structuredClone(row.result.codeReferences||[]),stationIndex:index,stationCount:stations.length,nextStationIndex:index+1<stations.length?index+1:null,memberId:station.memberId,detailId:station.detailId,detailVersion:station.detailVersion,start:station.start,end:station.end,xi:station.xi,demand:structuredClone(station.demand),sectionDemand:structuredClone(station.sectionDemand),frameStrain:structuredClone(station.frameStrain),frameConventionVersion:station.frameConventionVersion,strain:[...station.strain],initialStrains:structuredClone(station.initialStrains??{concrete:0,steel:0}),initialGeneralizedStrain:structuredClone(station.initialGeneralizedStrain??[0,0,0]),strainConvention:'RC-section epsilon,kappaY,kappaZ; frame v curvature is -kappaZ',componentConvention:'RC-section N,My,Mz; frame Mz is -section Mz',sectionComponents:structuredClone(station.sectionComponents),basis:station.barForceBasis,offset,total:station.steelForces.length,nextOffset:end<station.steelForces.length?end:null,rows:station.steelForces.slice(offset,end).map((force,i)=>({barIndex:offset+i+1,force})),units:{force:'kN',moment:'kNm',position:'member length fraction'},forceSign:'positive-tension',perfectBondAssumed:true,lapTransferIncluded:false,globalMethodQualified:false,designTransferAllowed:false};
  },
  exportState(){if(active)fail('RC_ITERATION_BUSY');const body={version:'p25-rc-service-state-v1',records:[...records]};return {...structuredClone(body),checksum:stableHash(body)};},
  restoreState(state){
   if(active||records.size)fail('RC_RESTORE_REQUIRES_EMPTY_RUNTIME');
   if(!state){disposed=false;return {ok:true,count:0};}
   const {checksum,...body}=state;
   if(body.version!=='p25-rc-service-state-v1'||stableHash(body)!==checksum||!Array.isArray(body.records)||body.records.length>2||body.records.some(e=>!Array.isArray(e)||e.length!==2||!e[1]||typeof e[1]!=='object')||new Set(body.records.map(r=>r[0])).size!==body.records.length)fail('RC_CHECKPOINT_INVALID');
   for(const entry of body.records){
    if(!Array.isArray(entry)||entry.length!==2)fail('RC_CHECKPOINT_INVALID');
    const [id,row]=entry;
    if(typeof id!=='string'||!id.startsWith('rc-iteration-')||!validIdentity(row.inputIdentity)||row.inputIdentity.inputHash!==row.inputHash||row.result?.sourceModelHash!==row.inputIdentity.modelHash||stableHash(row.result)!==row.resultHash)fail('RC_CHECKPOINT_INVALID');
    if(!Array.isArray(row.result.trace)||row.result.trace.length>31||row.result.designTransferAllowed!==false||row.result.globalMethodQualified!==false)fail('RC_CHECKPOINT_INVALID');
    if(row.settings){
     if(typeof row.settings!=='object'||Array.isArray(row.settings)||id!==`rc-iteration-${stableHash({inputHash:row.inputHash,settings:row.settings,version:row.result.rcPolicyVersion})}`)fail('RC_CHECKPOINT_INVALID');
    }else if(row.result.rcPolicyVersion===RC_SERVICE_ITERATION_VERSION)fail('RC_CHECKPOINT_INVALID');
    if(row.result.rcPolicyVersion===RC_SERVICE_ITERATION_VERSION&&row.settings.stiffnessMode==='fully-cracked-elastic'){
     if(row.result.stiffnessMode!=='fully-cracked-elastic')fail('RC_CHECKPOINT_INVALID');
     if(row.result.converged){
      const ids=row.settings.comboIds,result=row.result;
      if(!result.ok||result.spatialConverged!==true||result.spatialTolerance!==row.settings.spatialTolerance||!Array.isArray(ids)||stableHash([...ids].sort())!==stableHash(Object.keys(result.analysis?.byCombo||{}).sort()))fail('RC_CHECKPOINT_INVALID');
      if(ids.some(id=>{const trace=result.spatialTrace?.[id];return !Array.isArray(trace)||trace.length<2||trace.length>row.settings.maxRefinements+1||!Number.isFinite(trace.at(-1).residual)||trace.at(-1).residual>result.spatialTolerance;}))fail('RC_CHECKPOINT_INVALID');
     }
    }
    if(row.result.rcPolicyVersion===RC_SERVICE_ITERATION_VERSION&&row.settings.stiffnessMode==='kds-elastic-second-order'){
     const result=row.result,ids=row.settings.comboIds;
     if(result.stiffnessMode!=='kds-elastic-second-order'||!Array.isArray(ids)||!ids.length||ids.length>8||new Set(ids).size!==ids.length)fail('RC_CHECKPOINT_INVALID');
     if(result.converged){
      if(!result.ok||result.pDeltaMethod!=='direct'||result.spatialConverged!==true||result.spatialTolerance!==row.settings.spatialTolerance||stableHash([...ids].sort())!==stableHash(Object.keys(result.analysis?.byCombo||{}).sort())||result.trace.length!==ids.length)fail('RC_CHECKPOINT_INVALID');
      for(const comboId of ids){
       const set=result.analysis.byCombo[comboId],proof=set?.stiffnessProvenance,trace=result.trace.find(t=>t.comboId===comboId);
       const levels=result.spatialTrace?.[comboId],last=levels?.at(-1);
       if(!verifyRefinedFrameServiceResponses(set,last?.divisions))fail('RC_CHECKPOINT_INVALID');
       if(!Array.isArray(levels)||levels.length<2||levels.length>row.settings.maxRefinements+1||levels.some((l,i)=>l.divisions!==2**i)||!last?.converged||!Number.isFinite(last.maximumNormalizedChange)||last.maximumNormalizedChange>1||last.tolerance!==result.spatialTolerance||stableHash(proof?.frameRefinement)!==stableHash({converged:true,...last}))fail('RC_CHECKPOINT_INVALID');
       if(!set?.ok||set.method!=='direct'||set.secondOrderTrace?.converged!==true||proof?.stiffnessMode!=='kds-elastic-second-order'||proof.kdsSecondOrderPolicy!==KDS_SECOND_ORDER_STIFFNESS_VERSION||proof.sourceModelHash!==result.sourceModelHash||proof.localMagnifierApplied!==false||proof.globalMethodQualified!==false||typeof proof.appliedProfileHash!=='string'||!trace||trace.appliedProfileHash!==proof.appliedProfileHash||!Array.isArray(proof.memberFactors)||!proof.memberFactors.length||stableHash(proof.memberFactors)!==stableHash(result.memberFactors))fail('RC_CHECKPOINT_INVALID');
      }
     }
    }
   }
   try{for(const [id,row] of body.records)records.setCopy(id,{...row,restoredWithoutBuild:!row.inputIdentity.buildBound});}catch(error){records.clear();throw error;}
   disposed=false;return {ok:true,count:records.size};
  },
  composeStages(input){
   finiteJson(input);object(input,['inputHash','memberId','stages','positions','extrema','boundary','postAttachment']);current(input.inputHash);
   if(typeof input.memberId!=='string'||!input.memberId||input.memberId.length>128||!Array.isArray(input.stages)||!input.stages.length||input.stages.length>3)fail('RC_SERVICE_STAGE_INPUT_INVALID');
   const sources=[],fields=[],references=new Map();
   for(const stage of input.stages){
    object(stage,['iterationId','comboId','factor']);
    if(typeof stage.iterationId!=='string'||typeof stage.comboId!=='string'||!Number.isFinite(stage.factor)||Math.abs(stage.factor)>1)fail('RC_SERVICE_STAGE_INPUT_INVALID');
    const row=records.get(stage.iterationId);if(!row)fail('RC_ITERATION_REQUIRED');
    if(row.restoredWithoutBuild||row.result.rcPolicyVersion!==RC_SERVICE_ITERATION_VERSION||row.inputHash!==input.inputHash)fail('STALE_INPUT');
    if(!row.result.ok||!row.result.converged)fail('RC_ITERATION_CONVERGENCE_REQUIRED');
    const set=row.result.analysis?.byCombo?.[stage.comboId];if(!set?.ok||set.combo?.type!=='service')fail('RC_SERVICE_STAGE_COMBINATION_REQUIRED');
    const response=set.memberIntegratedDisplacements?.[input.memberId]??set.memberServiceResponses?.[input.memberId];if(!response)fail('RC_SERVICE_STAGE_FIELD_REQUIRED');
    fields.push({response,factor:stage.factor});
    for(const reference of row.result.codeReferences||[])references.set(stableHash(reference),reference);
    const timeEffect=row.result.timeEffect??'instantaneous';
    const timeState=rcStageTimeState(timeEffect,set.creepEffects?.[input.memberId]);
    sources.push({...stage,resultHash:row.resultHash,stiffnessMode:row.result.stiffnessMode,timeEffect,timeState,...(input.postAttachment?{frameTimeStates:Object.fromEntries(Object.entries(set.creepEffects||{}).map(([id,effect])=>[id,rcStageTimeState(timeEffect,effect)]))}:{}),method:set.method});
   }
   if(new Set(sources.map(s=>s.method)).size!==1)fail('RC_SERVICE_STAGE_METHOD_MISMATCH');
   const owner=budget.nextOwner('rc-stage-composition');
   try{
    budget.reserve(owner,retainedBytes(fields)*4+65536);
    const integrated=fields.every(s=>!!s.response.field);
    if(!integrated&&fields.some(s=>!!s.response.field))fail('RC_SERVICE_STAGE_FIELD_KIND_MISMATCH');
    if(!integrated&&input.positions!==undefined)fail('RC_SERVICE_TRIAL_POSITIONS_UNSUPPORTED');
    if(input.extrema!==undefined&&typeof input.extrema!=='boolean')fail('RC_SERVICE_STAGE_INPUT_INVALID');
    if(input.boundary!==undefined&&!input.extrema)fail('RC_SERVICE_STAGE_INPUT_INVALID');
    if(input.extrema&&!integrated)fail('RC_SERVICE_EXTREMA_FIELD_KIND_REQUIRED');
    const response=input.extrema?integratedStageExtrema(fields,{boundary:input.boundary}):integrated?combineRcIntegratedDisplacements(fields,input.positions):combineRcMemberServiceResponses(fields);
    if(input.extrema&&input.positions!==undefined)response.samples=combineRcIntegratedDisplacements(fields,input.positions).samples;
    const postAttachmentReview=input.postAttachment?prepareRcPostAttachmentReview({sources,response,input:input.postAttachment}):null;
    const result={...(postAttachmentReview?{postAttachmentReview,report:{format:'markdown',content:formatRcPostAttachmentReview(postAttachmentReview)}}:{}),ok:true,version:'p25-stage-source-composition-v5-attachment-review',inputHash:input.inputHash,memberId:input.memberId,sources,response,codeReferences:structuredClone([...references.values()]),codeBasisStatus:'SOURCE_REFERENCES_ONLY',scope:postAttachmentReview?'constant-sustained-endpoint-difference; specified-limit-acceptance':'numerical-source-field-composition; chronology and long-term acceptance not evaluated',timeHistoryQualified:false,designTransferAllowed:false};
    return {...result,resultHash:stableHash(result)};
   }finally{budget.release(owner);}
  },
  metadata(iterationId){const state=get({iterationId}),row=records.get(iterationId);return {...state,resultHash:row.resultHash,retainedSizeEstimateBytes:retainedBytes(row.result.analysis),kind:'rc-service-iteration',policySettings:structuredClone(row.settings||{liveComboId:row.result.liveComboId,maxIterations:20,tolerance:row.result.tolerance??1e-6})};},
  readCombination(iterationId,comboId){const state=get({iterationId});current(state.inputHash);if(state.stale)fail('STALE_INPUT');const row=records.get(iterationId);if(!row.result.ok||!row.result.converged)fail('RC_ITERATION_CONVERGENCE_REQUIRED');const set=row.result.analysis?.byCombo?.[comboId];if(!set?.ok)fail('RC_ITERATION_COMBINATION_REQUIRED');return designSetSnapshot(set);},
  hasRetainedState:()=>!!(active||records.size),
  context:()=>({active:!!active,iterations:[...records.keys()].map(iterationId=>get({iterationId})),maxEntries:2,timeoutMs:10000}),
  release({iterationId}={}){return {ok:true,released:records.delete(iterationId)};},
  detail(input){
   finiteJson(input);object(input,['iterationId','offset','limit']);
   const state=get(input),row=records.get(input.iterationId),offset=input.offset??0,limit=input.limit??4096;
   if(!Number.isSafeInteger(limit)||limit<1||limit>4096)fail('PAGINATION_INVALID');
   return {ok:true,iterationId:input.iterationId,stale:state.stale,resultHash:row.resultHash,encoding:'json-text-utf16',offset,...jsonTextWindow(row.result,{offset,limit})};
  },
  cancel(){const cancelled=!!active;active?.abort();return {ok:true,cancelled};},
  dispose(){disposed=true;active?.abort();records.clear();},
  resume(){disposed=false;},
 };
}
