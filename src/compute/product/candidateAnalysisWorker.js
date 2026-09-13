import {candidateSpliceRefinement} from './candidateSpliceRefinement.js';
import {memberSpliceRepairCommands} from './memberSpliceRepairCommands.js';
import {coupleMemberCandidateDevelopment} from './memberCandidateDevelopment.js';
import {memberCandidateCommands} from '../../design/rc/memberCandidateCommands.js';
import {solveRcSpliceModel} from './rcSpliceModelSolve.js';
import {rcSpliceDesignSource} from './rcSpliceDesignSource.js';
import {runRcServiceIteration} from './rcServiceIteration.js';
import {preparePracticalResult} from '../../design/evaluation/practicalResultPreparation.js';
import {executeAnalysisCase} from './analysisCaseEngine.js';
import {selectDesignCombination} from './designCombinationSource.js';
import {designSetSnapshot} from './candidateAnalysisSnapshot.js';
let endpoint;
if(typeof self!=='undefined'&&typeof document==='undefined')endpoint=self;
else if(typeof process!=='undefined'&&process.versions?.node){const {parentPort}=await import('node:worker_threads');endpoint=parentPort;}
const handle=async event=>{
 const input=endpoint.addEventListener?event.data:event;
 try{
  if(input.operation==='candidate-splice-refinement'){endpoint.postMessage({ok:true,result:candidateSpliceRefinement(input.model,input.settings.commands,input.settings.checks)});return;}
  if(input.operation==='candidate-geometry'){const raw=memberCandidateCommands(input.model,input.settings.originalCommands,input.settings.options),built=input.settings.options.spliceRepairs?.length?memberSpliceRepairCommands(input.model,raw,input.settings.options.spliceRepairs):raw;endpoint.postMessage({ok:true,result:input.settings.options.coupleEndDevelopment?coupleMemberCandidateDevelopment(input.model,built,input.settings.options):built});return;}
  if(input.operation==='rc-splice-model'){const result=solveRcSpliceModel(input.model,input.settings);const set=rcSpliceDesignSource(result);endpoint.postMessage({ok:true,result:{set,proof:{version:result.version,generalConstraintsIncluded:result.generalConstraintsIncluded,generalConstraints:result.generalConstraints,constraintHash:result.constraintHash,springSupportsIncluded:result.springSupportsIncluded,springDofs:result.springDofs,temperatureIncluded:result.temperatureIncluded,temperatureSources:result.loadSources?.filter(s=>['temperature','tgradient'].includes(s.type)),prescribedDisplacementsIncluded:result.prescribedDisplacementsIncluded,prescribedDofs:result.prescribedDofs,pDeltaIncluded:result.pDeltaIncluded,momentComparisonSummary:result.momentComparisonSummary,secondOrderTrace:result.secondOrderTrace,rigidDiaphragmIncluded:result.rigidDiaphragmIncluded,diaphragmGroups:result.diaphragmGroups,reducedDofCount:result.reducedDofCount,spatialTrace:result.spatialTrace,spatialTolerance:result.spatialTolerance,spatialAbsoluteTolerances:result.spatialAbsoluteTolerances,frameTrace:result.frameTrace,frameRefinement:result.frameRefinement,elasticRangeSatisfied:result.elasticRangeSatisfied,globalMethodQualified:false}}});return;}
  if(input.operation==='rc-service-iteration'){endpoint.postMessage({ok:true,result:await runRcServiceIteration(input.model,input.settings)});return;}
  if(input.operation==='evaluation'){
   endpoint.postMessage({ok:true,result:preparePracticalResult(input.model,input.sets,{mechanicsLaw:input.mechanicsLaw})});return;
  }
  const result=executeAnalysisCase(input.model,{kind:'static'},input.settings);
  const set=selectDesignCombination(result,input.settings.comboId,input.settings.pDeltaMethod||'off');
  if(!result.ok||!set?.ok||!set.anyOk)throw Error('CANDIDATE_REANALYSIS_FAILED');
  endpoint.postMessage({ok:true,result:designSetSnapshot(set)});
 }catch(e){endpoint.postMessage({ok:false,code:e.code||e.message||'CANDIDATE_REANALYSIS_FAILED'});}
};
if(endpoint?.addEventListener)endpoint.addEventListener('message',handle);
else endpoint?.on('message',handle);
