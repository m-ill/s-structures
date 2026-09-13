import {stableHash} from '../../core/stableHash.js';
import {workflowModelInput} from '../../core/workflowIdentity.js';
import {prepareElasticAnalysis,solveElasticCombination} from '../../solver/elastic/stages.js';
import {prepareFlexuralAnalysisModel,snapshotFlexuralSegment} from './flexuralAnalysisProfile.js';
import {runSecondOrderPDelta} from '../../solver/pdelta/secondOrder.js';
import {comboSnapshot} from '../../solver/linear3dPost.js';

export const FLEXURAL_ITERATION_VERSION='p25-flexural-iteration-v4-applied-profile-proof';
// Numerical coordinator only. The caller supplies the qualified constitutive
// policy; this loop cannot convert numerical convergence into design approval.
export async function runFlexuralIteration(source,{calculateProfiles,maxIterations=20,tolerance=1e-6,signal,comboId}={}){
 if(typeof calculateProfiles!=='function'||!Number.isInteger(maxIterations)||maxIterations<1||maxIterations>30||!Number.isFinite(tolerance)||tolerance<=0||tolerance>1e-2)throw Error('FLEXURAL_ITERATION_OPTIONS_INVALID');
 const sourceModelHash=stableHash(workflowModelInput(source)),trace=[];
 const check=()=>{if(signal?.aborted)throw Error('FLEXURAL_ITERATION_CANCELLED');if(stableHash(workflowModelInput(source))!==sourceModelHash)throw Error('STALE_FLEXURAL_ITERATION');};
 const base={version:FLEXURAL_ITERATION_VERSION,sourceModelHash,designTransferAllowed:false};
 let model=structuredClone(source),applied=null,appliedProfileHash=null,previousDisplacements=null;
 try{
  for(let iteration=0;iteration<=maxIterations;iteration++){
   check();
   const prepared=prepareElasticAnalysis(model);
   if(prepared.terminal)throw Error('FLEXURAL_ITERATION_MODEL_INVALID');
   if(!['off','direct'].includes(prepared.pDeltaMethod))throw Error('FLEXURAL_ITERATION_SECOND_ORDER_UNSUPPORTED');
   const combos=comboId===undefined?prepared.combos:prepared.combos.filter(c=>c.id===comboId);
   if(!combos.length)throw Error('FLEXURAL_ITERATION_COMBINATION_REQUIRED');
   const byCombo={},stiffnessProvenance={version:'p25-applied-flexural-stiffness-v1',sourceModelHash,appliedProfileHash,basis:applied?'explicit-applied-profile':'original-model-stiffness',profileCount:applied?.length??0,segmentCount:applied?.reduce((n,p)=>n+p.segments.length,0)??0,coupledAxialBendingIncluded:applied?.some(p=>p.segments.some(s=>!!s.axialBendingFlexibility))??false,originalShearTorsionAndMass:true,globalMethodQualified:false};
   for(const combo of combos){
    check();let result;
    if(prepared.pDeltaMethod==='direct'){
     const run=runSecondOrderPDelta(prepared.model,combo.factors,{...prepared.model.analysisSettings,pDeltaMethod:'direct',onProgress:()=>{if(signal?.aborted)throw Error('FLEXURAL_ITERATION_CANCELLED');}});
     if(!run.ok||!run.converged||!run.designEligibility?.eligible||!run.result?.ok)throw Error(run.reason||'RC_DIRECT_PDELTA_NOT_CONVERGED');
     result=run.result;result.combo=comboSnapshot(combo);result.method='direct';result.solverMethod=run.method;
     result.secondOrderTrace={method:run.method,solverVersion:run.version,productVersion:run.productVersion,converged:run.converged,iterations:run.iterations.length,amplification:run.amplification,stability:run.stability?.status,limitationCodes:run.designEligibility.limitationCodes||[]};
    }else result=solveElasticCombination(prepared,combo,{signal});
    if(result.ok!==true)throw Error('FLEXURAL_ITERATION_ANALYSIS_FAILED');
    result.stiffnessProvenance=stiffnessProvenance;
    byCombo[combo.id]=result;
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   check();
   const analysis={ok:true,byCombo,pDeltaMethod:prepared.pDeltaMethod},proposal=await calculateProfiles({sourceModel:source,analysis,iteration,sourceModelHash,signal});
   check();
   const projected=prepareFlexuralAnalysisModel(source,{sourceModelHash,profiles:proposal?.profiles});
   const profiles=normalizedProfiles(proposal.profiles),displacements=displacementVector(byCombo);
   const profileResidual=applied?profileDifference(applied,profiles):null;
   const displacementResidual=previousDisplacements?relativeDifference(previousDisplacements,displacements,1e-12):null;
   trace.push({iteration,appliedProfileHash,profileResidual,displacementResidual,maxDisplacement:displacements.maxTranslation,proposedProfileHash:projected.profileHash});
   if(profileResidual!==null&&profileResidual<=tolerance&&displacementResidual!==null&&displacementResidual<=tolerance){
    check();
    return {...base,ok:true,converged:true,analysis,profiles:applied,appliedProfileHash,trace,method:proposal.method??null,codeReferences:proposal.codeReferences??[],preparedResults:proposal.preparedResults??null,tolerance};
   }
   if(iteration===maxIterations)break;
   model=projected.model;applied=profiles;appliedProfileHash=projected.profileHash;previousDisplacements=displacements;
  }
  return {...base,ok:false,converged:false,reason:'FLEXURAL_ITERATION_LIMIT',trace};
 }catch(error){return {...base,ok:false,converged:false,reason:error.code||error.message||'FLEXURAL_ITERATION_FAILED',trace};}
}
function normalizedProfiles(profiles){
 return profiles.map(p=>({memberId:p.memberId,segments:p.segments.map(snapshotFlexuralSegment)})).sort((a,b)=>String(a.memberId).localeCompare(String(b.memberId)));
}
function profileDifference(a,b){
 const topology=p=>p.map(r=>[r.memberId,r.segments.map(s=>[s.start,s.end,!!s.axialBendingFlexibility])]);
 if(stableHash(topology(a))!==stableHash(topology(b)))return null;
 let residual=0;
 for(let i=0;i<a.length;i++)for(let j=0;j<a[i].segments.length;j++){
  const left=a[i].segments[j],right=b[i].segments[j];
  const li=left.initialGeneralizedStrain??[0,0,0],ri=right.initialGeneralizedStrain??[0,0,0];
  for(let k=0;k<3;k++)residual=Math.max(residual,Math.abs(li[k]-ri[k])/Math.max(1e-12,Math.abs(li[k]),Math.abs(ri[k])));
  if(left.axialBendingFlexibility){
   const x=left.axialBendingFlexibility,y=right.axialBendingFlexibility;
   for(let r=0;r<3;r++)for(let c=0;c<3;c++){
    const scale=Math.sqrt(Math.max(x[r][r],y[r][r]))*Math.sqrt(Math.max(x[c][c],y[c][c]));
    residual=Math.max(residual,Math.abs(x[r][c]-y[r][c])/scale);
   }
  }else for(const axis of ['Iy','Iz']){
   const x=left[axis],y=right[axis];residual=Math.max(residual,Math.abs(x-y)/Math.max(x,y));
  }
 }
 return residual;
}
function displacementVector(byCombo){
 const keys=[],values=[];let maxTranslation=0;
 for(const id of Object.keys(byCombo).sort())for(const node of Object.keys(byCombo[id].disp||{}).sort()){
  const row=byCombo[id].disp[node];
  for(let i=0;i<row.length;i++){if(!Number.isFinite(row[i]))throw Error('FLEXURAL_ITERATION_NONFINITE_DISPLACEMENT');keys.push(`${id}/${node}/${i}`);values.push(row[i]);if(i<3)maxTranslation=Math.max(maxTranslation,Math.abs(row[i]));}
 }
 return {keys,values,maxTranslation};
}
function relativeDifference(a,b,floor){
 if(a.keys.length!==b.keys.length||a.keys.some((k,i)=>k!==b.keys[i]))return null;
 let residual=0;
 for(let i=0;i<a.values.length;i++)residual=Math.max(residual,Math.abs(a.values[i]-b.values[i])/Math.max(floor,Math.abs(a.values[i]),Math.abs(b.values[i])));
 return residual;
}
