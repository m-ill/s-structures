import {getRcSpliceCapabilities} from '../../metadata/rcSpliceCapabilities.js';
import {rcSpliceDesignSource} from './rcSpliceDesignSource.js';
import {RC_SPLICE_MODEL_VERSION,rcSpliceWorkingBytes,validRcSpliceSecondOrder,validRcSpliceSpatialProof} from '../../metadata/rcSplicePolicy.js';
import {stableHash} from '../../core/stableHash.js';
import {createModuleWorker,runBoundedWorkerTask} from '../../core/boundedWorkerTask.js';
import {BudgetMap,retainedBytes} from '../../core/resourceBudget.js';
import {finiteJson,object} from '../../modeling/designInputCommands.js';
export function createRcSpliceExecution({bridge,budget,workerFactory=()=>createModuleWorker(new URL('./rcSpliceWorker.js',import.meta.url)),timeoutMs=10000}){
 let active=null,disposed=false,latestSourceId=null;const records=new BudgetMap(budget,'rc-splice-model-results',{maxEntries:8,maxBytes:32*1024**2});
 const unboundRestored=new Set();
 const clear=()=>{latestSourceId=null;records.clear();unboundRestored.clear();};
 const remove=id=>{if(latestSourceId===id)latestSourceId=null;unboundRestored.delete(id);return records.delete(id);};
 const fail=code=>{throw Object.assign(Error(code),{code});};
 const current=hash=>{if(disposed)fail('SESSION_DISPOSED');if(hash!==bridge.getWorkflowInputIdentity().inputHash){const actual=bridge.getWorkflowInputIdentity().inputHash;for(const [id,r] of records)if(r.inputHash!==actual)remove(id);fail('STALE_INPUT');}};
 const page=({inputHash,sourceId=latestSourceId,offset=0,limit=3})=>{
  current(inputHash);const retained=records.get(sourceId);if(!retained)fail('RC_SPLICE_MODEL_RESULT_REQUIRED');current(retained.inputHash);
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>3)fail('RC_SPLICE_RESULT_PAGE_INVALID');
  const total=retained.segments.length,segments=retained.segments.slice(offset,offset+limit),end=offset+segments.length;
  const {memberForceSources,firstOrderMomentComparison,...summary}=retained;
  return structuredClone({...summary,preparedMemberForceSourceIds:Object.keys(memberForceSources||{}),segments,segmentPage:{offset,total,returned:segments.length,nextOffset:end<total?end:null}});
 };
 const metadata=sourceId=>{
  const retained=records.get(sourceId);if(!retained)fail('RC_SPLICE_SOURCE_REQUIRED');
  return {ok:true,sourceId,inputHash:retained.inputHash,resultHash:retained.resultHash,policySettings:structuredClone(retained.solveSettings||null),pDeltaMethod:retained.pDeltaMethod??'off',analysisProof:structuredClone({version:retained.version,generalConstraintsIncluded:retained.generalConstraintsIncluded,generalConstraints:retained.generalConstraints,constraintHash:retained.constraintHash,springSupportsIncluded:retained.springSupportsIncluded,springDofs:retained.springDofs,temperatureIncluded:retained.temperatureIncluded,temperatureSources:retained.loadSources?.filter(s=>['temperature','tgradient'].includes(s.type)),prescribedDisplacementsIncluded:retained.prescribedDisplacementsIncluded,prescribedDofs:retained.prescribedDofs,pDeltaIncluded:retained.pDeltaIncluded,momentComparisonSummary:retained.momentComparisonSummary,secondOrderTrace:retained.secondOrderTrace,rigidDiaphragmIncluded:retained.rigidDiaphragmIncluded,diaphragmGroups:retained.diaphragmGroups,reducedDofCount:retained.reducedDofCount,stressIntegrationConvergenceVerified:retained.stressIntegrationConvergenceVerified,spatialTolerance:retained.spatialTolerance,spatialAbsoluteTolerances:retained.spatialAbsoluteTolerances,spatialTrace:retained.spatialTrace,frameRefinement:retained.frameRefinement,frameTrace:retained.frameTrace,elasticRangeSatisfied:retained.elasticRangeSatisfied,globalMethodQualified:false,codeReferences:retained.codeReferences}),stale:disposed||unboundRestored.has(sourceId)||retained.version!==RC_SPLICE_MODEL_VERSION||retained.inputHash!==bridge.getWorkflowInputIdentity().inputHash,comboId:retained.comboId,converged:validRcSpliceSecondOrder(retained)&&validRcSpliceSpatialProof(retained),elasticRangeSatisfied:retained.elasticRangeSatisfied===true,retainedSizeEstimateBytes:retainedBytes(retained.memberForceSources),globalMethodQualified:false};
 };
 return {
  exportState(){
   if(active)fail('RC_SPLICE_BUSY');
   const body={version:'p25-rc-splice-state-v1',latestSourceId,records:[...records]};
   return {...structuredClone(body),checksum:stableHash(body)};
  },
  restoreState(state){
   if(active||records.size)fail('RC_SPLICE_RESTORE_REQUIRES_EMPTY_RUNTIME');
   if(!state){disposed=false;return {ok:true,count:0};}
   const invalid=()=>fail('RC_SPLICE_CHECKPOINT_INVALID');
   const {checksum,...body}=state;
   if(body.version!=='p25-rc-splice-state-v1'||!Array.isArray(body.records)||body.records.length>8||stableHash(body)!==checksum)invalid();
   const ids=new Set(),combos=new Set();
   for(const entry of body.records){
    if(!Array.isArray(entry)||entry.length!==2||!entry[1]||typeof entry[1]!=='object')invalid();
    const [id,row]=entry,{inputHash,inputIdentity,sourceId,resultHash,execution,solveSettings,...result}=row;
    if(ids.has(id)||combos.has(row.comboId)||id!==sourceId||typeof row.comboId!=='string'||!row.comboId||inputIdentity?.inputHash!==inputHash||row.version!==RC_SPLICE_MODEL_VERSION||!row.ok||stableHash(result)!==resultHash||id!==`rc-splice-${stableHash({inputHash,comboId:row.comboId,resultHash})}`)invalid();
    if(row.designTransferAllowed!==false||row.globalMethodQualified!==false||!Array.isArray(row.segments)||row.segments.length>20||!Array.isArray(row.originalNodes)||row.originalNodes.length>20||!row.memberForceSources||row.combination?.id!==row.comboId)invalid();
    if(!validRcSpliceSecondOrder(row))invalid();
    if(!validRcSpliceSpatialProof(row,{requireFrame:false}))invalid();
    if(solveSettings){
     if(typeof solveSettings.frameConvergence!=='boolean'||!Number.isInteger(solveSettings.frameDivisions)||solveSettings.frameDivisions<1||solveSettings.frameDivisions>8||!Number.isInteger(solveSettings.maxIterations)||solveSettings.maxIterations<1||solveSettings.maxIterations>30)invalid();
     if(solveSettings.frameConvergence!==row.frameRefinement?.convergenceVerified||(solveSettings.frameConvergence?row.frameTrace?.[0]?.frameDivisions:row.frameRefinement.requestedDivisions)!==solveSettings.frameDivisions)invalid();
    }
    ids.add(id);combos.add(row.comboId);
   }
   if(body.latestSourceId!==null&&!ids.has(body.latestSourceId))invalid();
   try{for(const [id,row] of body.records){records.setCopy(id,row);if(!row.inputIdentity.buildBound)unboundRestored.add(id);}}
   catch(error){clear();throw error;}
   latestSourceId=body.latestSourceId;disposed=false;return {ok:true,count:records.size};
  },
  metadata,
  readCombination(sourceId,comboId){
   const meta=metadata(sourceId);if(meta.stale)fail('STALE_INPUT');current(meta.inputHash);const retained=records.get(sourceId);
   if(!meta.converged||!meta.elasticRangeSatisfied)fail('RC_SPLICE_DESIGN_SOURCE_CONVERGENCE_REQUIRED');
   if(meta.comboId!==comboId)fail('RC_SPLICE_DESIGN_COMBINATION_REQUIRED');
   return structuredClone(rcSpliceDesignSource(retained));
  },
  memberSource(input){
   finiteJson(input);object(input,['inputHash','memberId','sourceId']);current(input.inputHash);const retained=records.get(input.sourceId??latestSourceId);
   if(!retained)fail('RC_SPLICE_MODEL_RESULT_REQUIRED');
   current(retained.inputHash);
   if(typeof input.memberId!=='string'||!Object.hasOwn(retained.memberForceSources||{},input.memberId))fail('RC_SPLICE_MEMBER_SOURCE_REQUIRED');
   return structuredClone({ok:true,sourceId:retained.sourceId,resultHash:retained.resultHash,inputHash:input.inputHash,comboId:retained.comboId,memberId:input.memberId,memberResult:retained.memberForceSources[input.memberId],momentComparison:retained.firstOrderMomentComparison?.members?.[input.memberId]??null,codeReferences:retained.codeReferences,stressIntegrationConvergenceVerified:retained.stressIntegrationConvergenceVerified,frameRefinement:retained.frameRefinement,designTransferAllowed:false,globalMethodQualified:false});
  },
  query(input){finiteJson(input);object(input,['inputHash','offset','limit','sourceId']);return page(input);},
  async run(input,kind='interval'){
   finiteJson(input);object(input,kind==='model'?['inputHash','comboId','maxIterations','frameDivisions','frameConvergence']:['inputHash','spliceId','endLoads','maxIterations']);current(input.inputHash);
   if(kind==='model'&&(typeof(input.frameConvergence??false)!=='boolean'||!Number.isInteger(input.frameDivisions??1)||(input.frameDivisions??1)<1||(input.frameDivisions??1)>8||typeof input.comboId!=='string'||!input.comboId||input.comboId.length>128||!Number.isInteger(input.maxIterations??30)||(input.maxIterations??30)<1||(input.maxIterations??30)>30))fail('RC_SPLICE_MODEL_INPUT_INVALID');
   if(kind!=='model'&&(typeof input.spliceId!=='string'||!input.spliceId||input.spliceId.length>128||!Array.isArray(input.endLoads)||input.endLoads.length!==6||input.endLoads.some(v=>!Number.isFinite(v)||Math.abs(v)>1e9)||!Number.isInteger(input.maxIterations??30)||(input.maxIterations??30)<1||(input.maxIterations??30)>30))fail('RC_SPLICE_INTERVAL_INPUT_INVALID');
   if(active)fail('RC_SPLICE_BUSY');
   if(kind==='model'){if([...records.values()].some(r=>r.inputHash!==input.inputHash))clear();for(const [id,r] of records)if(r.comboId===input.comboId)remove(id);if(records.size>=8)fail('RC_SPLICE_SOURCE_LIMIT');}
   const controller=new AbortController(),owner=budget.nextOwner('rc-splice-worker');active=controller;
   try{
    const source=bridge.getCurrentModel(),sourceBytes=retainedBytes(source);
    // Source snapshot/clone copies plus bounded 200-DOF matrices (120 host + 80 shared slip), lap
    // condensation and result transfer. Conservative estimate, not peak heap.
    const admission=sourceBytes*3+rcSpliceWorkingBytes(source);budget.reserve(owner,admission);
    const payload={model:structuredClone(source),input:structuredClone(input),kind};
    const {workerMemory=null,...result}=await runBoundedWorkerTask({payload,timeoutMs,signal:controller.signal,workerFactory,onTerminationUnconfirmed:()=>budget.quarantine(owner,'RC_SPLICE_WORKER_EXIT_UNCONFIRMED'),onTerminationConfirmed:()=>budget.confirmTermination(owner)});
    if(controller.signal.aborted)fail('CANCELLED');current(input.inputHash);
    budget.reserve(owner,admission+retainedBytes(result)*2);
    const published={...result,inputIdentity:bridge.getWorkflowInputIdentity(),inputHash:input.inputHash,...(kind==='model'?{solveSettings:{frameConvergence:input.frameConvergence??false,frameDivisions:input.frameDivisions??1,maxIterations:input.maxIterations??30}}:{}),execution:{worker:true,timeoutMs,workingSetEstimateBytes:admission,measuredHeap:workerMemory?.measuredHeap===true,memory:workerMemory}};
    if(kind==='model'&&result.ok){published.comboId=input.comboId;published.resultHash=stableHash(result);published.sourceId=`rc-splice-${stableHash({inputHash:input.inputHash,comboId:input.comboId,resultHash:published.resultHash})}`;records.set(published.sourceId,published);latestSourceId=published.sourceId;return page({inputHash:input.inputHash,sourceId:latestSourceId});}
    return published;
   }finally{budget.release(owner);if(active===controller)active=null;}
  },
  cancel(){const cancelled=!!active;active?.abort();return {ok:true,cancelled};},
  hasRetainedState:()=>!!(active||records.size),
  release({sourceId}){if(active)fail('RC_SPLICE_BUSY');return {ok:true,released:remove(sourceId)};},
  context:()=>({workerTerminationUnconfirmed:Object.keys(budget.snapshot().quarantinedOwners||{}).some(owner=>owner.startsWith('rc-splice-worker:')),capabilities:getRcSpliceCapabilities(),active:!!active,disposed,modelResultAvailable:records.size>0,latestSource:latestSourceId?metadata(latestSourceId):null,sources:[...records.keys()].map(metadata),maxSources:8,retainedBytes:records.bytes}),
  dispose(){disposed=true;active?.abort();clear();},
  resume(){disposed=false;clear();},
 };
}
