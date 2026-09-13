import {RC_SPLICE_MODEL_VERSION,rcSpatialRelativeChange,RC_SPATIAL_ABSOLUTE_TOLERANCES} from '../../metadata/rcSplicePolicy.js';
import {memberAxes} from '../../core/memberAxes.js';
import {prepareRcMemberForceSources} from './rcMemberForceSources.js';
import {compareRcFrameMeshes} from './rcFrameConvergence.js';
import {prepareRcSegmentDisplacements} from './rcSegmentDisplacementRecovery.js';
import {prepareRcSegmentForces} from './rcSegmentForceRecovery.js';
import {prepareRcModelNetwork} from './rcModelNetwork.js';
import {solveRcLapNetwork} from '../../solver/rcLapNetwork.js';
import {resolveMaterialRecord} from '../../materials/registry.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {compareFirstSecondOrderMoments} from '../../solver/pdelta/momentComparison.js';
import {stableHash} from '../../core/stableHash.js';
function solveRcSpliceModelAtMesh(model,{comboId,maxIterations=30,frameDivisions=1}){
 let previous=null,last=null,network=null;const spatialTrace=[];
 const base={version:RC_SPLICE_MODEL_VERSION,comboId,sourceSupportsUsed:true,sourceCombinationUsed:true,designTransferAllowed:false,globalMethodQualified:false,pDeltaIncluded:false,distributedLoadsIncluded:false,codeReferences:getKcscRuleSources(['142030','142052',...(model.analysisSettings?.pDeltaMethod==='direct'?['142020']:[])]).map(r=>({...r,governsCalculation:false,...(r.id==='142020'?{clause:'4.4.2(2)',comparisonLimitReference:true,relationship:'first/second-order moment increase comparison; numerical method qualification separate'}:{relationship:'related RC serviceability/lap detailing; numerical method qualification pending'})}))};
 for(const subdivisions of [8,16,32]){
  network=prepareRcModelNetwork(model,{comboId,subdivisions,frameDivisions,slipOrder:2});const result=solveRcLapNetwork({...network,maxIterations,tolerance:1e-10});
  if(!result.ok)return {...base,ok:false,status:'NOT_CHECKED',reason:result.reason,trace:result.trace,spatialTrace};
  // Mesh topology is unchanged between quadrature/slip refinement levels.
  // Include virtual boundary nodes, not just the original model nodes.
  const length=Math.max(...network.sources.map(s=>s.endX-s.startX)),vector=[...result.displacements.map((v,i)=>i%6>=3?v*length:v),...result.slipResults.map(s=>s.value)],scale=Math.max(1e-12,...vector.map(Math.abs));
  const displacementChange=previous?Math.max(...vector.map((v,i)=>Math.abs(v-previous[i])))/scale:null;
  const relative=rcSpatialRelativeChange;
  const stressChange=last?Math.max(...result.elementResults.flatMap((r,i)=>[relative(r.maximumSteelStress,last.elementResults[i].maximumSteelStress,'stressMPa'),...r.lapResponses.flatMap((lap,j)=>lap.maximumBarForces.map((v,k)=>relative(v,last.elementResults[i].lapResponses[j].maximumBarForces[k],'forceKN')))])):null;
  const slipChange=last?Math.max(...result.elementResults.flatMap((r,i)=>[relative(r.maximumRelativeSlip,last.elementResults[i].maximumRelativeSlip,'slipM'),...r.lapResponses.map((lap,j)=>relative(lap.maximumRelativeSlip,last.elementResults[i].lapResponses[j].maximumRelativeSlip,'slipM'))])):null;
  const change=previous?Math.max(displacementChange,stressChange,slipChange):null;
  spatialTrace.push({subdivisions,workUnits:network.elements.reduce((n,e)=>n+e.subdivisions*(e.slipOrder??1)*Math.max(1,e.laps.length),0),cellsPerElement:network.elements.map(e=>e.subdivisions),displacementChange,stressChange,slipChange,change,iterations:result.trace.length});previous=vector;last=result;
  if(change!==null&&change<=.002)break;
 }
 if(spatialTrace.at(-1).change>.002)return {...base,ok:false,status:'NOT_CHECKED',reason:'RC_MODEL_SPATIAL_REFINEMENT_LIMIT',spatialTrace};
 const segments=last.elementResults.map((r,i)=>{
  const source=network.sources[i],detail=model.designDetails.reinforcement.find(d=>d.id===source.detailId&&d.version===source.detailVersion),steel=resolveMaterialRecord(model,detail.barMaterialId);
  const slipLimits=network.elements[i].laps.map(l=>model.designDetails.splices.find(s=>s.id===l.spliceId&&s.version===l.spliceVersion)?.transferElasticSlipLimit);
  const elasticRangeSatisfied=Number.isFinite(steel?.strength?.steel?.Fy)&&r.maximumSteelStress<=steel.strength.steel.Fy&&slipLimits.every(limit=>Number.isFinite(limit)&&r.maximumRelativeSlip<=limit);
  return {...source,displacementRecovery:prepareRcSegmentDisplacements({source,localDisplacements:r.localDisplacements}),forceRecovery:prepareRcSegmentForces({source,localEndForces:r.boundaryEndForces,...(last.pDeltaIncluded?{geometricEndForces:r.geometricEndForces}:{}),memberLoads:network.elements[i].memberLoads||[]}),localDisplacements:r.localDisplacements,localEndForces:r.boundaryEndForces,memberLoads:network.elements[i].memberLoads||[],maximumSteelStress:r.maximumSteelStress,maximumRelativeSlip:r.maximumRelativeSlip,elasticRangeSatisfied};
 });
 const elasticRangeSatisfied=segments.every(s=>s.elasticRangeSatisfied);
 const memberForceSources=prepareRcMemberForceSources(segments);
 for(const [id,row] of Object.entries(memberForceSources)){
  const member=model.members.find(m=>m.id===id);row.ax=memberAxes(model.nodes.find(n=>n.id===member.n1),model.nodes.find(n=>n.id===member.n2),member.localAxis);
 }
 let firstOrderMomentComparison=null,momentComparisonSummary=null;
 if(last.pDeltaIncluded){
  if(!Array.isArray(last.firstOrderBoundaryEndForces)||last.firstOrderBoundaryEndForces.length!==network.sources.length)throw Error('RC_SPLICE_FIRST_ORDER_BOUNDARIES_REQUIRED');
  const firstSegments=network.sources.map((source,i)=>({ ...source,localEndForces:last.firstOrderBoundaryEndForces[i],forceRecovery:prepareRcSegmentForces({source,localEndForces:last.firstOrderBoundaryEndForces[i],memberLoads:network.elements[i].memberLoads||[]}) }));
  const firstMemberResults=prepareRcMemberForceSources(firstSegments);
  for(const [id,row] of Object.entries(firstMemberResults))row.ax=memberForceSources[id].ax;
  firstOrderMomentComparison=compareFirstSecondOrderMoments({ok:true,memberResults:firstMemberResults},{ok:true,memberResults:memberForceSources});
  firstOrderMomentComparison.basis='same RC splice network and integration mesh; zero-geometric-stiffness first iterate versus converged Direct result';
  const rows=Object.values(firstOrderMomentComparison.members);
  momentComparisonSummary={version:firstOrderMomentComparison.version,comparedMemberCount:rows.length,continuousMemberCount:rows.filter(r=>r.intervalCoverageVerified).length,exceedingMemberCount:rows.filter(r=>['EXCEEDS_IN_RECOVERY_INTERVALS','EXCEEDS_AT_RECORDED_STATIONS'].includes(r.status)).length,comparisonHash:stableHash(firstOrderMomentComparison),additionalAnalysisCount:0,fullMemberQualified:false};
 }

 return {...base,ok:true,firstOrderMomentComparison,momentComparisonSummary,generalConstraintsIncluded:last.generalConstraintsIncluded,generalConstraints:last.generalConstraints,constraintHash:last.constraintHash,constraintForces:last.constraintForces,springSupportsIncluded:last.springSupportsIncluded,springDofs:last.springDofs,springReactions:last.springReactions,temperatureIncluded:network.temperatureIncluded,prescribedDisplacementsIncluded:last.prescribedDisplacementsIncluded,prescribedDofs:last.prescribedDofs,pDeltaIncluded:last.pDeltaIncluded,pDeltaMethod:network.pDeltaMethod,secondOrderTrace:last.secondOrderTrace??[],status:elasticRangeSatisfied?'CALCULATED':'NOT_CHECKED',reason:elasticRangeSatisfied?null:'RC_MODEL_ELASTIC_RANGE_EXCEEDED',elasticRangeSatisfied,distributedLoadsIncluded:network.distributedLoadsIncluded,concentratedMemberLoadsIncluded:network.concentratedMemberLoadsIncluded,selfWeightIncluded:network.selfWeightIncluded,selfWeightBasis:network.selfWeightBasis,frameMeshRefinementIncluded:false,frameRefinement:{requestedDivisions:frameDivisions,nonLapIntervalsSubdivided:frameDivisions>1,lapIntervalsRefined:last.sharedSlipAssemblyIncluded,convergenceVerified:false},rigidDiaphragmIncluded:last.rigidDiaphragmIncluded,diaphragmGroups:network.diaphragmGroups,reducedDofCount:last.reducedDofCount,diaphragmConstraintForces:last.diaphragmConstraintForces,sharedSlipAssemblyIncluded:last.sharedSlipAssemblyIncluded,slipResults:last.slipResults.map(s=>({...s,source:network.slipSources.find(p=>p.id===s.id)})),combination:network.combination,loadSources:network.loadSources,originalNodes:network.nodeSources.slice(0,network.originalNodeCount).map((s,i)=>({...s,displacements:last.displacements.slice(6*i,6*i+6),reactions:last.reactions.slice(6*i,6*i+6)})),memberForceSources,segments,trace:last.trace,spatialTrace,spatialTolerance:.002,spatialAbsoluteTolerances:RC_SPATIAL_ABSOLUTE_TOLERANCES,spatialConvergenceQuantities:['host displacement and rotation','shared boundary slip','each element maximum steel stress','each lap bar maximum force','each lap maximum relative slip'],stressIntegrationConvergenceVerified:true,lapSlipOrder:2,units:{length:'m',translation:'m',rotation:'rad',force:'kN',moment:'kNm',stress:'MPa'},endForceConvention:'local boundary forces (internal minus consistent member loads) [Fx,Fy,Fz,Mx,My,Mz] at start then end; not solver-native section resultants',interiorForceRecoveryIncluded:true,interiorDisplacementFieldIncluded:true,standardDesignRecoveryIncluded:false};
}

export function solveRcSpliceModel(model,input){
 const {frameConvergence=false,frameDivisions=1}=input;
 if(typeof frameConvergence!=='boolean')throw Error('RC_MODEL_FRAME_CONVERGENCE_INPUT_INVALID');
 if(!frameConvergence)return solveRcSpliceModelAtMesh(model,input);
 if(!Number.isInteger(frameDivisions)||frameDivisions<1||frameDivisions>8)throw Error('RC_MODEL_FRAME_CONVERGENCE_INPUT_INVALID');
 const frameTrace=[],tolerance=.002;let previous=null;
 const failed=(reason,detail)=>({ok:false,status:'NOT_CHECKED',reason,detail,comboId:input.comboId,frameTrace,frameRefinement:{convergenceVerified:false,tolerance},designTransferAllowed:false,globalMethodQualified:false,codeReferences:previous?.codeReferences??[]});
 for(let divisions=frameDivisions;divisions<=8;divisions*=2){
  let result;
  try{result=solveRcSpliceModelAtMesh(model,{...input,frameDivisions:divisions});}
  catch(error){if(/LIMIT$/.test(error.code||error.message))return failed('RC_MODEL_FRAME_RESOURCE_LIMIT',error.code||error.message);throw error;}
  if(!result.ok)return failed(result.reason,result.spatialTrace);
  const comparison=previous?compareRcFrameMeshes(previous,result):{change:null};
  frameTrace.push({frameDivisions:divisions,segments:result.segments.length,...comparison});
  if(comparison.change!==null&&comparison.change<=tolerance)return {...result,frameTrace,frameMeshRefinementIncluded:true,frameRefinement:{...result.frameRefinement,convergenceVerified:true,tolerance,comparisonBasis:comparison.basis}};
  previous=result;
 }
 return failed('RC_MODEL_FRAME_REFINEMENT_LIMIT');
}
