import {prepareRcIntegratedDisplacements} from './rcIntegratedDisplacements.js';
import {frameDemandToRcSection,rcSectionFlexibilityToFrame,rcSectionStrainToFrame,RC_FRAME_CONVENTION_VERSION} from '../adapters/rcFrameConvention.js';
import {runFlexuralIteration} from './flexuralIteration.js';
import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
import {solveCrackedElasticSection} from '../../design/rc/crackedElasticSection.js';
import {memberForceFromRecovery} from '../../solver/memberForceField.js';
import {stableHash} from '../../core/stableHash.js';
import {workflowModelInput} from '../../core/workflowIdentity.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {captureSpatialResponse,compareSpatialResponse} from './spatialResponse.js';
import {concreteEffectiveModulus} from '../../materials/concreteCreep.js';
export const RC_COUPLED_ITERATION_VERSION='p25-rc-coupled-iteration-v8-attachment-state';
// Fully cracked elastic state, not a replacement for KDS effective inertia.
// Each combination owns its own state. Piecewise-constant midpoint compliance
// is an explicit spatial approximation, separate from iteration convergence.
export function calculateRcCoupledProfiles(source,analysis,comboId,{subdivisions=1,timeEffect='instantaneous'}={}){
 if(!['instantaneous','sustained-effective-modulus','attachment-effective-modulus'].includes(timeEffect))throw Error('RC_TIME_EFFECT_INVALID');
 if(!Number.isInteger(subdivisions)||subdivisions<1||subdivisions>8)throw Error('RC_COUPLED_SUBDIVISIONS_INVALID');
 const set=analysis.byCombo?.[comboId];if(!set?.ok)throw Error('RC_COUPLED_SOURCE_REQUIRED');
 const current=new Map();for(const d of source.designDetails?.reinforcement||[])if(!current.has(d.id)||current.get(d.id).version<d.version)current.set(d.id,d);
 const profiles=[],stations=[],creepEffects={};
 for(const member of source.members||[]){
  const material=resolveMaterialRecord(source,member.matId);if(material?.kind!=='concrete')continue;
  const creep=timeEffect!=='instantaneous'?concreteEffectiveModulus(material,{state:timeEffect==='attachment-effective-modulus'?'attachment':'final'}):null;
  if(creep)creepEffects[member.id]={...creep,materialId:material.id,materialVersion:material.version};
  if((source.designDetails?.splices||[]).some(s=>s.memberId===member.id))throw Error('RC_SERVICE_SPLICE_STIFFNESS_REQUIRED');
  const section=resolveSectionRecord(source,member.secId),details=[...current.values()].filter(d=>d.memberId===member.id).sort((a,b)=>a.start-b.start);
  if(section?.shape!=='RECT')throw Error('RC_COUPLED_RECTANGULAR_SECTION_REQUIRED');
  if(!details.length||details.length>100||details[0].start!==0||details.at(-1).end!==1||details.some((d,i)=>!Number.isFinite(d.start)||!Number.isFinite(d.end)||d.end<=d.start||i>0&&d.start!==details[i-1].end))throw Error('RC_COUPLED_REINFORCEMENT_COVERAGE');
  const row=set.memberResults?.[member.id],recovery=row?.forceRecoveryInput;
  const ends=[member.n1,member.n2].map(id=>source.nodes?.find(n=>n.id===id));
  const L=ends.every(Boolean)?Math.hypot(ends[1].x-ends[0].x,ends[1].y-ends[0].y,ends[1].z-ends[0].z):0;
  if(!(L>0)||!['member-force-recovery-v1','member-force-recovery-v2-geometric'].includes(recovery?.version)||Math.abs(recovery.L-L)>1e-8||!Array.isArray(recovery.spanLoads)||recovery.endForces?.length!==12||!recovery.endForces.every(Number.isFinite))throw Error('RC_COUPLED_FORCE_RECOVERY_REQUIRED');
  const xs=Array.from(row.xs||[]);
  if(xs.length<2||xs.length>600||xs.some((x,i)=>!Number.isFinite(x)||x<0||x>L||i>0&&x<xs[i-1])||Math.abs(xs[0])>1e-8||Math.abs(xs.at(-1)-L)>1e-8)throw Error('RC_COUPLED_STATION_GRID_INVALID');
  const baseGrid=[...new Set([0,1,...xs.map(x=>x/L),...details.flatMap(d=>[d.start,d.end]),...recovery.spanLoads.flatMap(l=>[l.a,l.b]).filter(x=>Number.isFinite(x)&&x>0&&x<L).map(x=>x/L)])].sort((a,b)=>a-b);
  if((baseGrid.length-1)*subdivisions>100)throw Error('RC_COUPLED_SEGMENT_LIMIT');
  const grid=[0];for(let i=1;i<baseGrid.length;i++)for(let j=1;j<=subdivisions;j++)grid.push(j===subdivisions?baseGrid[i]:baseGrid[i-1]+(baseGrid[i]-baseGrid[i-1])*j/subdivisions);
  const segments=[];
  for(let i=1;i<grid.length;i++){
   const start=grid[i-1],end=grid[i],xi=(start+end)/2,detail=details.find(d=>xi>=d.start&&xi<d.end);
   if(!detail)throw Error('RC_COUPLED_REINFORCEMENT_COVERAGE');
   const steel=resolveMaterialRecord(source,detail.barMaterialId),forces=memberForceFromRecovery(recovery,xi*L);
   const demand={N:forces.N,My:forces.My,Mz:forces.Mz},sectionDemand=frameDemandToRcSection(demand);
   const initialStrains={concrete:creep?.shrinkageInitialStrain??0,steel:0};
   const result=solveCrackedElasticSection({B:section.params?.B/1000,H:section.params?.H/1000,Ec:creep?.effectiveE??material.elastic?.E,Es:steel?.elastic?.E,bars:detail.bars,demand:sectionDemand,includeBarForces:true,initialStrains});
   if(!result.ok)throw Error(result.reason);
   const forcesVector=[sectionDemand.N,sectionDemand.My,sectionDemand.Mz];
   const offset=result.strain.map((v,i)=>v-result.flexibility[i].reduce((sum,f,j)=>sum+f*forcesVector[j],0));
   segments.push({start,end,axialBendingFlexibility:rcSectionFlexibilityToFrame(result.flexibility),...(creep?.shrinkageIncluded?{initialGeneralizedStrain:rcSectionStrainToFrame(offset)}:{})});
   stations.push({memberId:member.id,detailId:detail.id,detailVersion:detail.version,start,end,xi,demand,sectionDemand,frameStrain:rcSectionStrainToFrame(result.strain),frameConventionVersion:RC_FRAME_CONVENTION_VERSION,strain:result.strain,initialStrains:result.initialStrains,initialGeneralizedStrain:creep?.shrinkageIncluded?rcSectionStrainToFrame(offset):[0,0,0],compressionArea:result.compressionArea,residual:result.residual,steelForces:result.steelForces,sectionComponents:result.sectionComponents,barForceBasis:result.barForceBasis});
  }
  profiles.push({memberId:member.id,segments});
 }
 if(!profiles.length)throw Error('RC_SERVICE_MEMBERS_REQUIRED');
 return {profiles,stations,creepEffects,method:'fully-cracked-elastic-biaxial-midpoint-compliance',codeReferences:[...getKcscRuleSources(['142030']).map(r=>({...r,applicationScope:'related-serviceability-standard; coupled-method-clause-mapping-pending',governsCalculation:false})),...Object.values(creepEffects).flatMap(r=>r.codeReferences)]};
}
export async function runRcCoupledIteration(source,{comboIds,maxIterations=20,tolerance=1e-6,signal,spatialTolerance=.002,maxRefinements=2,timeEffect='instantaneous'}={}){
 const sourceModelHash=stableHash(workflowModelInput(source)),base={version:RC_COUPLED_ITERATION_VERSION,sourceModelHash,globalMethodQualified:false,designTransferAllowed:false};
 const trace=[],profilesByCombo={},stationsByCombo={},tracesByCombo={},byCombo={},spatialTrace={},creepEffectsByCombo={},references=new Map();
 const check=()=>{if(signal?.aborted)throw Error('FLEXURAL_ITERATION_CANCELLED');if(stableHash(workflowModelInput(source))!==sourceModelHash)throw Error('STALE_FLEXURAL_ITERATION');};
 try{
  check();if(!['instantaneous','sustained-effective-modulus','attachment-effective-modulus'].includes(timeEffect))throw Error('RC_TIME_EFFECT_INVALID');
  if(!Number.isFinite(spatialTolerance)||spatialTolerance<=0||spatialTolerance>.02||!Number.isInteger(maxRefinements)||maxRefinements<1||maxRefinements>3)throw Error('RC_SPATIAL_OPTIONS_INVALID');
  const enabled=(source.loadCombinations||[]).filter(c=>c.enabled!==false),ids=comboIds??enabled.map(c=>c.id);
  if(!Array.isArray(ids)||!ids.length||ids.length>8||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!enabled.some(c=>c.id===id)))throw Error('RC_COUPLED_COMBINATIONS_REQUIRED');
  for(const id of ids){
   const combo=enabled.find(c=>c.id===id),factors=Object.values(combo.factors||{});
   if(combo.type!=='service'||!factors.some(x=>x!==0)||factors.some(x=>!Number.isFinite(x)||Math.abs(x)>1))throw Error('RC_COUPLED_SERVICE_COMBINATIONS_REQUIRED');
   if(timeEffect!=='instantaneous'&&((source.loadCases||[]).some(c=>c.type==='dead'&&combo.factors?.[c.id]!==1)||Object.entries(combo.factors||{}).some(([caseId,v])=>v!==0&&(v<0||!source.loadCases?.some(c=>c.id===caseId&&['dead','live'].includes(c.type))))))throw Error('RC_CREEP_SUSTAINED_GRAVITY_REQUIRED');
   let previous=null,accepted=false;spatialTrace[id]=[];
   for(let level=0;level<=maxRefinements;level++){
    let lastStations,lastEffects,lastReferences;
    const result=await runFlexuralIteration(source,{comboId:id,maxIterations,tolerance,signal,calculateProfiles:({analysis})=>{
     const policy=calculateRcCoupledProfiles(source,analysis,id,{subdivisions:2**level,timeEffect});lastStations=policy.stations;lastEffects=policy.creepEffects;lastReferences=policy.codeReferences;return policy;
    }});
    check();
    if(!result.ok)return {...base,ok:false,converged:false,reason:result.reason,trace,spatialTrace};
    const response=captureSpatialResponse(result.analysis.byCombo[id]),comparison=previous?compareSpatialResponse(previous,response):null;
    spatialTrace[id].push({level,subdivisions:2**level,segmentCount:result.profiles.reduce((n,p)=>n+p.segments.length,0),residual:comparison?.residual??null,controlling:comparison?.controlling??null,iterations:result.trace.length});
    if(comparison?.compatible&&comparison.residual<=spatialTolerance){
     byCombo[id]=result.analysis.byCombo[id];byCombo[id].memberIntegratedDisplacements=prepareRcIntegratedDisplacements(source,byCombo[id]);profilesByCombo[id]=result.profiles;stationsByCombo[id]=lastStations;tracesByCombo[id]=result.trace;
     creepEffectsByCombo[id]=lastEffects;for(const r of lastReferences)references.set(`${r.code}/${r.edition}/${r.clause??''}`,r);
     trace.push({comboId:id,converged:true,iterations:result.trace.length,...result.trace.at(-1)});accepted=true;break;
    }
    previous=response;
   }
   if(!accepted)return {...base,ok:false,converged:false,reason:'RC_SPATIAL_REFINEMENT_LIMIT',trace,spatialTrace};
  }
  check();
  return {...base,ok:true,converged:true,analysis:{ok:true,byCombo},pDeltaMethod:Object.values(byCombo).some(set=>set.method==='direct')?'direct':'off',secondOrderByCombo:Object.fromEntries(Object.entries(byCombo).filter(([,set])=>set.secondOrderTrace).map(([id,set])=>[id,set.secondOrderTrace])),profilesByCombo,stationsByCombo,tracesByCombo,trace,tolerance,spatialTrace,spatialTolerance,spatialConverged:true,
   method:'fully-cracked-elastic-biaxial-midpoint-compliance',timeEffect,creepEffectsByCombo,specifiedShrinkageIncluded:Object.values(creepEffectsByCombo).some(rows=>Object.values(rows).some(r=>r.shrinkageIncluded)),globalEffectiveModulusRedistributionIncluded:timeEffect!=='instantaneous',timeHistoryCreepRedistributionIncluded:false,spatialDiscretizationQualified:false,
   qualification:timeEffect!=='instantaneous'?'specified-creep-effective-modulus-and-optional-uniform-shrinkage; no-ageing-load-history-tension-stiffening-slip-yielding; global-method-qualification-pending':'elastic-section-equilibrium; no-tension-stiffening-creep-slip-yielding; global-method-and-spatial-qualification-pending',
   codeReferences:[...references.values()]};
 }catch(error){return {...base,ok:false,converged:false,reason:error.code||error.message,trace,spatialTrace};}
}
