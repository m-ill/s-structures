import {prepareFlexuralAnalysisModel} from './flexuralAnalysisProfile.js';
import {prepareKdsSecondOrderProfiles} from '../../design/rc/kdsSecondOrderStiffness.js';
import {stableHash} from '../../core/stableHash.js';
import {workflowModelInput} from '../../core/workflowIdentity.js';
import {runSecondOrderPDelta} from '../../solver/pdelta/secondOrder.js';
import {refineDirectFrameModel} from '../../solver/pdelta/refineFrameModel.js';
import {collapseDirectFrameResult} from '../../solver/pdelta/collapseFrameResult.js';
import {compareFrameRefinements} from '../../solver/pdelta/refinementComparison.js';
import {compareFirstSecondOrderMoments} from '../../solver/pdelta/momentComparison.js';
import {resolveAnalysisCriteria} from '../../core/analysisCriteria.js';
import {prepareRefinedFrameServiceResponses} from './refinedFrameServiceResponses.js';
export async function runKdsSecondOrderIteration(source,{comboIds,maxIterations=20,tolerance=1e-6,signal,spatialTolerance=.002,maxRefinements=2}={}){
 if(source.analysisSettings?.pDeltaMethod!=='direct')throw Error('KDS_SECOND_ORDER_DIRECT_SETTING_REQUIRED');
 if(!Array.isArray(comboIds)||!comboIds.length||comboIds.length>8||new Set(comboIds).size!==comboIds.length||comboIds.some(id=>!source.loadCombinations?.some(c=>c.id===id&&c.enabled!==false)))throw Error('KDS_SECOND_ORDER_COMBINATIONS_REQUIRED');
 if(!Number.isFinite(spatialTolerance)||spatialTolerance<=0||spatialTolerance>.02||!Number.isInteger(maxRefinements)||maxRefinements<1||maxRefinements>3)throw Error('RC_SPATIAL_OPTIONS_INVALID');
 if(!Number.isInteger(maxIterations)||maxIterations<1||maxIterations>30||!Number.isFinite(tolerance)||tolerance<=0||tolerance>.01)throw Error('FLEXURAL_ITERATION_OPTIONS_INVALID');
 const policy=prepareKdsSecondOrderProfiles(source),byCombo={},profilesByCombo={},trace=[],secondOrderByCombo={},spatialTrace={};
 const sourceModelHash=stableHash(workflowModelInput(source)),prepared=prepareFlexuralAnalysisModel(source,{sourceModelHash,profiles:policy.profiles});
 const check=()=>{if(signal?.aborted)throw Error('FLEXURAL_ITERATION_CANCELLED');if(stableHash(workflowModelInput(source))!==sourceModelHash)throw Error('STALE_FLEXURAL_ITERATION');};
 for(const comboId of comboIds){
  const combo=source.loadCombinations.find(c=>c.id===comboId),levels=[];let previous=null,selected=null;
  for(let level=0;level<=maxRefinements;level++){
   check();const mesh=refineDirectFrameModel(prepared.model,{divisions:2**level});
   const resolved=resolveAnalysisCriteria(mesh.model);
   mesh.model.analysisCriteria={...mesh.model.analysisCriteria,criteria:{...resolved.criteria,pdelta:{...resolved.criteria.pdelta,maxIter:Math.min(maxIterations,resolved.criteria.pdelta.maxIter),eU:Math.min(tolerance,resolved.criteria.pdelta.eU),eR:Math.min(tolerance,resolved.criteria.pdelta.eR)}}};
   const run=runSecondOrderPDelta(mesh.model,combo.factors,{maxIterations,tolerance,onProgress:check});
   if(!run.ok||!run.converged||!run.designEligibility?.eligible)throw Error(run.reason||'RC_DIRECT_PDELTA_NOT_CONVERGED');
   const set=collapseDirectFrameResult(mesh,run.result),first=collapseDirectFrameResult(mesh,run.linear);
   set.memberServiceResponses=prepareRefinedFrameServiceResponses(mesh,run.result);
   set.combo=structuredClone(combo);set.method='direct';set.solverMethod=run.method;
   set.firstOrderMomentComparison=compareFirstSecondOrderMoments(first,set);
   const comparison=previous?compareFrameRefinements(previous,set,spatialTolerance):null;
   levels.push({divisions:mesh.divisions,fullDofs:mesh.model.nodes.length*6,...comparison});
   set.secondOrderTrace={method:run.method,solverVersion:run.version,productVersion:run.productVersion,converged:run.converged,iterations:run.iterations.length,stability:run.stability?.status,limitationCodes:run.designEligibility.limitationCodes||[],frameDivisions:mesh.divisions,criteria:run.criteria};
   if(comparison?.converged){selected=set;break;}
   previous=set;await new Promise(resolve=>setTimeout(resolve,0));
  }
  spatialTrace[comboId]=levels;
  if(!selected)return {ok:false,converged:false,sourceModelHash,trace,spatialTrace,reason:'KDS_SECOND_ORDER_FRAME_REFINEMENT_LIMIT',comboId,globalMethodQualified:false,designTransferAllowed:false};
  selected.stiffnessProvenance={version:'p25-applied-flexural-stiffness-v1',sourceModelHash,appliedProfileHash:prepared.profileHash,basis:'explicit-applied-profile',profileCount:policy.profiles.length,segmentCount:policy.profiles.length,coupledAxialBendingIncluded:false,originalShearTorsionAndMass:true,globalMethodQualified:false,kdsSecondOrderPolicy:policy.version,memberFactors:policy.members,localMagnifierApplied:false,frameRefinement:{converged:true,...levels.at(-1)}};
  byCombo[comboId]=selected;profilesByCombo[comboId]=policy.profiles;secondOrderByCombo[comboId]=selected.secondOrderTrace;
  trace.push({comboId,iterations:levels.length,appliedProfileHash:prepared.profileHash,profileResidual:0,displacementResidual:levels.at(-1).maximumNormalizedChange});
 }
 check();return {ok:true,converged:true,sourceModelHash,analysis:{ok:true,pDeltaMethod:'direct',byCombo},profilesByCombo,trace,spatialTrace,spatialTolerance,spatialConverged:true,secondOrderByCombo,pDeltaMethod:'direct',method:'KDS-142020-4.4.4-specified-inertia',codeReferences:policy.codeReferences,memberFactors:policy.members,globalMethodQualified:false,designTransferAllowed:false,qualification:'KDS inertia factors and frame refinement applied; full-member stability applicability and global method verification remain separate'};
}
