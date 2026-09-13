import {rcLapFrame} from '../../solver/rcLapFrame.js';
import {rcSectionEndForcesToFrame,RC_FRAME_CONVENTION_VERSION} from '../adapters/rcFrameConvention.js';
import {coupledLapSection} from '../../solver/coupledLapSection.js';
import {coupledLapFrame} from '../../solver/coupledLapFrame.js';
import {elasticLapElement} from '../../solver/elasticLapElement.js';
import {solveElasticLapTransfer,validateElasticLapInput} from '../../design/rc/elasticLapTransfer.js';
import {spliceGeometry} from '../../design/rc/spliceGeometry.js';
import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function evaluateSpliceElasticTransfer(model,{spliceId,barIndex,force,samples=17}){
 if(typeof spliceId!=='string'||!spliceId||spliceId.length>128||!Number.isInteger(barIndex)||barIndex<1||barIndex>100||!Number.isFinite(force)||force<0||force>1e9)fail('SPLICE_TRANSFER_QUERY_INVALID');
 const splice=(model.designDetails?.splices||[]).filter(s=>s.id===spliceId).sort((a,b)=>b.version-a.version)[0];
 if(!splice)fail('SPLICE_RECORD_REQUIRED');
 validateElasticLapInput(splice);if(splice.transferStiffness===undefined)fail('SPLICE_TRANSFER_INPUT_REQUIRED');
 const geometry=spliceGeometry(model,splice);if(geometry.status!=='OK')fail(geometry.reason);
 const bar=geometry.bars.find(b=>b.originalIndex===barIndex-1);if(!bar)fail('SPLICE_TRANSFER_BAR_NOT_SELECTED');
 const detail=model.designDetails.reinforcement.find(d=>d.id===geometry.detailId&&d.version===geometry.detailVersion),steel=resolveMaterialRecord(model,detail.barMaterialId),E=steel?.elastic?.E,fy=steel?.strength?.steel?.Fy;
 if(![E,fy,bar.area].every(v=>Number.isFinite(v)&&v>0))fail('SPLICE_TRANSFER_STEEL_PROPERTIES_REQUIRED');
 const EA=E*bar.area*1000,result=solveElasticLapTransfer({length:geometry.length,EA1:EA,EA2:EA,transferStiffness:splice.transferStiffness,force,samples});
 const first=result.stations[0],last=result.stations.at(-1);
 const endDisplacements=[first.u1,first.u2,last.u1,last.u2];
 const element=elasticLapElement({length:geometry.length,EA1:EA,EA2:EA,transferStiffness:splice.transferStiffness,endDisplacements,samples:2});
 const boundaryElement={version:element.version,dofOrder:element.dofOrder,endDisplacements,stiffness:element.stiffness,endForces:element.endForces,strainEnergy:element.strainEnergy,units:element.units,globalAssemblyIncluded:false,freeTipIndices:[1,2],loadedEndIndices:[0,3]};
 const original=detail.bars[bar.originalIndex],pair=splice.continuationSide==='offset-toward-start'?[bar,original]:[original,bar];
 const pairBars=pair.map(b=>({EA,y:b.y,z:b.z})),endSectionDisplacements=[0,0,0,result.extension,0,0];
 const coupled=coupledLapSection({length:geometry.length,transferStiffness:splice.transferStiffness,bars:pairBars,endSectionDisplacements,samples:2});
 const endFrameDisplacements=Array(12).fill(0);endFrameDisplacements[6]=result.extension;
 const frameArgs={length:geometry.length,transferStiffness:splice.transferStiffness,bars:pairBars,endDisplacements:endFrameDisplacements};
 let frame=coupledLapFrame({...frameArgs,subdivisions:16});const refinementTrace=[];
 for(const subdivisions of [32,64]){
  const next=coupledLapFrame({...frameArgs,subdivisions});let relativeChange=0;
  for(let i=0;i<12;i++)for(let j=0;j<12;j++){
   const scale=Math.sqrt(Math.abs(next.stiffnessReferenceDiagonal[i]*next.stiffnessReferenceDiagonal[j]));
   if(scale>0)relativeChange=Math.max(relativeChange,Math.abs(next.stiffness[i][j]-frame.stiffness[i][j])/scale);
  }
  refinementTrace.push({subdivisions,relativeChange});frame=next;if(relativeChange<=.002)break;
 }
 const frameConverged=refinementTrace.at(-1).relativeChange<=.002;
 const frameCoupling={version:frame.version,status:frameConverged?'CALCULATED':'NOT_CHECKED',reason:frameConverged?null:'LAP_FRAME_REFINEMENT_LIMIT',stiffness:frame.stiffness,endForces:frame.endForces,endFrameDisplacements,strainEnergy:frame.strainEnergy,internalResidual:frame.internalResidual,subdivisions:frame.subdivisions,internalDofCount:frame.internalDofCount,frameDofOrder:frame.frameDofOrder,strainBasis:frame.strainBasis,method:frame.method,refinementTrace,refinementConverged:frameConverged,refinementTolerance:.002,concreteIncluded:false,globalAssemblyIncluded:false,designTransferAllowed:false,scope:'cubic frame displacement and section-relative slip; prescribed axial extension with all transverse end displacements and rotations held zero; not a global solution'};
 // The RC host response uses every bar selected by this splice, not only
 // the bar queried for the separate force-driven transfer calculation.
 let rcHostCoupling;
 try{
  const latestSplices=new Map();for(const s of model.designDetails.splices)if(!latestSplices.has(s.id)||latestSplices.get(s.id).version<s.version)latestSplices.set(s.id,s);
  if([...latestSplices.values()].some(s=>s.id!==splice.id&&s.memberId===splice.memberId&&s.start<splice.end&&s.end>splice.start))fail('RC_LAP_OVERLAPPING_RECORDS_REQUIRE_INTERVAL_ASSEMBLY');
  const member=model.members.find(m=>m.id===splice.memberId),section=resolveSectionRecord(model,member.secId),concrete=resolveMaterialRecord(model,member.matId);
  if(!['RECT','SQUARE'].includes(section?.shape)||concrete?.kind!=='concrete')fail('RC_LAP_RECTANGULAR_HOST_REQUIRED');
  if(!frameConverged)fail('LAP_FRAME_REFINEMENT_LIMIT');
  const host=rcLapFrame({length:geometry.length,B:section.params.B/1000,H:(section.params.H||section.params.B)/1000,Ec:concrete.elastic?.E,Es:E,bars:detail.bars,laps:geometry.bars.map(b=>({barIndex:b.originalIndex,offset:b,transferStiffness:splice.transferStiffness,continuationSide:splice.continuationSide})),endDisplacements:endFrameDisplacements,subdivisions:frame.subdivisions});
  const {lapResponses,...compactHost}=host;
  const hostElasticRange=host.maximumSteelStress<=fy&&host.maximumRelativeSlip<=splice.transferElasticSlipLimit;
  rcHostCoupling={...compactHost,status:hostElasticRange?'CALCULATED':'NOT_CHECKED',reason:hostElasticRange?null:'RC_LAP_HOST_ELASTIC_RANGE_EXCEEDED',elasticRangeSatisfied:hostElasticRange,materialId:concrete.id,detailId:detail.id,detailVersion:detail.version,lapBarIndices:geometry.bars.map(b=>b.originalIndex+1),endFrameDisplacements,scope:'current splice interval; all its selected bars replaced under prescribed axial extension; not a global solution',spatialConvergenceQualified:false};
 }catch(error){rcHostCoupling={status:'NOT_CHECKED',reason:error.code||error.message,globalAssemblyIncluded:false,designTransferAllowed:false};}
 const sectionCoupling={version:coupled.version,bars:pairBars,condensedStiffness:coupled.condensedStiffness,slipRecovery:coupled.slipRecovery,endSectionDisplacements,sectionEndForces:coupled.sectionEndForces,frameEndForces:rcSectionEndForcesToFrame(coupled.sectionEndForces),frameConventionVersion:RC_FRAME_CONVENTION_VERSION,slipEndForces:coupled.slipEndForces,slipEndDisplacements:coupled.slipEndDisplacements,strainEnergy:coupled.strainEnergy,sectionDofOrder:coupled.sectionDofOrder,sectionStrainBasis:coupled.sectionStrainBasis,slipBasis:coupled.slipBasis,concreteIncluded:false,globalAssemblyIncluded:false,scope:'constant generalized section strains; specified axial extension, both section rotations held zero',units:{sectionDisplacements:['m','rad','rad','m','rad','rad'],sectionForces:['kN','kNm','kNm','kN','kNm','kNm']}};
 const slipRatio=result.maximumSlip/splice.transferElasticSlipLimit,steelRatio=force/(bar.area*fy*1000),elasticRangeSatisfied=slipRatio<=1&&steelRatio<=1;
 return {ok:true,...result,boundaryElement,sectionCoupling,frameCoupling,rcHostCoupling,status:elasticRangeSatisfied?'CALCULATED':'NOT_CHECKED',reason:elasticRangeSatisfied?null:'SPLICE_TRANSFER_ELASTIC_RANGE_EXCEEDED',elasticRangeSatisfied,slipRatio,steelRatio,spliceId:splice.id,spliceVersion:splice.version,memberId:splice.memberId,reinforcementId:splice.reinforcementId,barIndex,barArea:bar.area,steelE:E,steelFy:fy,startX:geometry.startX,endX:geometry.endX,forceSource:'explicit-query-single-bar-tension; not recovered from member analysis',transferReference:splice.transferReference,transferElasticSlipLimit:splice.transferElasticSlipLimit,additionalStrengthCredit:false,referenceQualification:'user-specified-equivalent-stiffness; calibration-and-method-review-required',codeReferences:getKcscRuleSources(['142052']).map(r=>({...r,clause:'4.5.1; 4.5.2',governsCalculation:false,relationship:'related lap detailing; does not prescribe this elastic spring model'})),limitations:['concrete-mediated transfer condensed into supplied stiffness','no concrete cracking, splitting, yielding, cyclic damage or end bearing','no transverse equilibrium or eccentric lap moment; axial transfer only','no automatic member-strength credit or global stiffness substitution']};
}
