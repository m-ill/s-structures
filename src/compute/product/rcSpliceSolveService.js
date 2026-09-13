import {solveRcLapNetwork} from '../../solver/rcLapNetwork.js';
import {spliceGeometry} from '../../design/rc/spliceGeometry.js';
import {validateElasticLapInput} from '../../design/rc/elasticLapTransfer.js';
import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
const fail=code=>{throw Object.assign(Error(code),{code});};
export function solveRcSpliceInterval(model,{spliceId,endLoads,maxIterations=30}){
 if(typeof spliceId!=='string'||!spliceId||spliceId.length>128||!Array.isArray(endLoads)||endLoads.length!==6||endLoads.some(v=>!Number.isFinite(v)||Math.abs(v)>1e9)||!Number.isInteger(maxIterations)||maxIterations<1||maxIterations>30)fail('RC_SPLICE_INTERVAL_INPUT_INVALID');
 const latest=new Map();for(const s of model.designDetails?.splices||[])if(!latest.has(s.id)||latest.get(s.id).version<s.version)latest.set(s.id,s);
 const splice=latest.get(spliceId);if(!splice)fail('SPLICE_RECORD_REQUIRED');validateElasticLapInput(splice);
 if(splice.transferStiffness===undefined)fail('SPLICE_TRANSFER_INPUT_REQUIRED');
 if([...latest.values()].some(s=>s.id!==splice.id&&s.memberId===splice.memberId&&s.start<splice.end&&s.end>splice.start))fail('RC_LAP_OVERLAPPING_RECORDS_REQUIRE_INTERVAL_ASSEMBLY');
 const geometry=spliceGeometry(model,splice);if(geometry.status!=='OK')fail(geometry.reason);
 const member=model.members.find(m=>m.id===splice.memberId),section=resolveSectionRecord(model,member.secId),concrete=resolveMaterialRecord(model,member.matId),detail=model.designDetails.reinforcement.find(d=>d.id===geometry.detailId&&d.version===geometry.detailVersion),steel=resolveMaterialRecord(model,detail.barMaterialId);
 if(!['RECT','SQUARE'].includes(section?.shape)||concrete?.kind!=='concrete')fail('RC_LAP_RECTANGULAR_HOST_REQUIRED');
 // The legacy section resolver does not own rectangular torsion here. Use
 // the explicitly resolved section's property, never a guessed J formula.
 const J=section.properties?.J??section.J;
 if(!Number.isFinite(J)||J<=0||!Number.isFinite(concrete.elastic?.G)||concrete.elastic.G<=0)fail('RC_SPLICE_TORSION_PROPERTIES_REQUIRED');
 const element={nodes:[0,1],localAxis:{refVector:[0,1,0]},B:section.params.B/1000,H:(section.params.H||section.params.B)/1000,Ec:concrete.elastic.E,Es:steel?.elastic?.E,GJ:concrete.elastic.G*1000*J,bars:detail.bars,laps:geometry.bars.map(b=>({barIndex:b.originalIndex,offset:b,transferStiffness:splice.transferStiffness,continuationSide:splice.continuationSide}))};
 const codeReferences=getKcscRuleSources(['142052','142030']).map(r=>({...r,governsCalculation:false,relationship:'related detailing/serviceability; this numerical method is not code-qualified'}));
 const base={spliceId,spliceVersion:splice.version,memberId:member.id,detailId:detail.id,detailVersion:detail.version,endLoads,loadSource:'explicit-local-nodal-end-loads',boundary:'clamped-start; loaded-free-end of splice interval; not building support conditions',codeReferences,designTransferAllowed:false,buildingAnalysisIncluded:false};
 let previous=null,last=null;const spatialTrace=[];
 for(const subdivisions of [16,32,64]){
  const result=solveRcLapNetwork({nodes:[{x:0,y:0,z:0},{x:geometry.length,y:0,z:0}],elements:[{...element,subdivisions}],fixedDofs:[0,1,2,3,4,5],loads:[0,0,0,0,0,0,...endLoads],maxIterations});
  if(!result.ok)return {...base,ok:false,status:'NOT_CHECKED',reason:result.reason,trace:result.trace,spatialTrace};
  const vector=result.displacements.slice(6).map((v,i)=>i>=3?v*geometry.length:v),scale=Math.max(1e-12,...vector.map(Math.abs));
  const change=previous?Math.max(...vector.map((v,i)=>Math.abs(v-previous[i])))/scale:null;
  spatialTrace.push({subdivisions,change,iterations:result.trace.length});previous=vector;last=result;
  if(change!==null&&change<=.002)break;
 }
 if(spatialTrace.at(-1).change>.002)return {...base,ok:false,status:'NOT_CHECKED',reason:'RC_SPLICE_SPATIAL_REFINEMENT_LIMIT',spatialTrace};
 const response=last.elementResults[0],elasticRangeSatisfied=response.maximumSteelStress<=steel.strength?.steel?.Fy&&response.maximumRelativeSlip<=splice.transferElasticSlipLimit;
 return {...base,ok:true,status:elasticRangeSatisfied?'CALCULATED':'NOT_CHECKED',reason:elasticRangeSatisfied?null:'RC_LAP_HOST_ELASTIC_RANGE_EXCEEDED',elasticRangeSatisfied,displacements:last.displacements,reactions:last.reactions,trace:last.trace,spatialTrace,spatialTolerance:.002,elementResponse:{endForces:response.endForces,components:response.components,strainEnergy:response.strainEnergy,maximumSteelStress:response.maximumSteelStress,maximumRelativeSlip:response.maximumRelativeSlip,originalSteelReplaced:true},networkVersion:last.version,pDeltaIncluded:false,distributedLoadsIncluded:false};
}
