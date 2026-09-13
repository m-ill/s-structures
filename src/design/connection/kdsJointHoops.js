import {rectangularTieRequirements} from '../rc/rectangularTieRequirements.js';
import {prepareJointHoopGeometry} from './jointHoopGeometry.js';
import {jointHoopDistribution} from './jointHoopDistribution.js';
import {kdsRectangularTies} from '../rc/kdsConfinement.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
import {reinforcementRegionsAt} from '../rc/reinforcementRegions.js';
export function kdsJointHoopQuantity({B,H,cover,diameter,spacing,longitudinalDiameter,fck,fy,area,transverseCredit}){
 const base={codeReferences:getKcscRuleSources(['142080']).map(r=>({...r,clause:'4.1.4; 4.1.5; 4.5.4; Eq.4.5-3; Eq.4.5-4; Eq.4.5-5; 4.6.2'})),qualification:'clause-scoped-not-whole-design',scope:'full rectangular hoop amount and spacing; no four-face reduction; physical detailing separate',designTransferAllowed:false};
 if(![B,H,cover,diameter,spacing,longitudinalDiameter,fck,fy].every(x=>Number.isFinite(x)&&x>0)||fck>90)return {...base,status:'NOT_CHECKED',ratio:null,reason:'JOINT_HOOP_INPUT_REQUIRED'};
 const coreB=B-2*cover,coreH=H-2*cover,hcB=coreB-diameter,hcH=coreH-diameter;
 if(Math.min(hcB,hcH)<=0)return {...base,status:'NG',ratio:null,reason:'JOINT_HOOP_CORE_GEOMETRY_INVALID'};
 const credit=transverseCredit?.status==='OK'?transverseCredit:null;
 if(credit&&(!Number.isFinite(credit.diameter)||!Number.isFinite(credit.spacing)||!Number.isFinite(credit.hx)||credit.hx<=0||credit.hx>Math.max(hcB,hcH)+1e-10||Math.abs(credit.diameter-diameter)>1e-10||Math.abs(credit.spacing-spacing)>1e-10||!Array.isArray(credit.directions)||credit.directions.length!==2||new Set(credit.directions.map(d=>d.steelDirection)).size!==2||credit.directions.some(d=>!['B','H'].includes(d.steelDirection)||!Number.isFinite(d.additionalArea)||d.additionalArea<0)))return {...base,status:'NOT_CHECKED',ratio:null,reason:'JOINT_TRANSVERSE_CREDIT_INVALID'};
 const Ag=B*H,Ach=coreB*coreH,hx=credit?.hx??Math.max(hcB,hcH),sx=Math.min(.15,Math.max(.1,.1+(.35-hx)/3));
 const spacingLimit=Math.min(B/4,H/4,6*longitudinalDiameter,sx),outerProvidedArea=2*(area??Math.PI*diameter**2/4);
 if(!(Number.isFinite(outerProvidedArea)&&outerProvidedArea>0))return {...base,status:'NOT_CHECKED',ratio:null,reason:'JOINT_HOOP_AREA_REQUIRED'};
 // KDS 14 20 80 symbol Ash: transverse steel perpendicular to dimension hc.
 // Each outer hoop contributes two legs in each direction; additional ties need
 // the current support/anchorage eligibility proof before their area is credited.
 const directions=[['B','H',hcH],['H','B',hcB]].map(([steelDirection,coreDimension,hc])=>{
  const additionalAreaCredited=credit?.directions.find(d=>d.steelDirection===steelDirection).additionalArea??0,providedArea=outerProvidedArea+additionalAreaCredited;
  const equations=[{id:'4.5-3',requiredArea:.3*spacing*hc*fck/fy*(Ag/Ach-1)},{id:'4.5-4',requiredArea:.09*spacing*hc*fck/fy}];
  const governing=equations.reduce((a,b)=>b.requiredArea>a.requiredArea?b:a),requiredArea=governing.requiredArea,ratio=requiredArea/providedArea;
  return {steelDirection,coreDimension,hc,providedArea,requiredArea,ratio,status:ratio<=1+1e-10?'OK':'NG',equations,governingEquation:governing.id,additionalAreaCredited,spacingRepairLimit:spacing/ratio};
 });
 const areaGoverning=directions.reduce((a,b)=>b.ratio>a.ratio?b:a),requiredArea=areaGoverning.requiredArea,providedArea=areaGoverning.providedArea;
 const criteria=[
  {id:'hoop-area',provided:providedArea,limit:requiredArea,relation:'minimum',ratio:requiredArea/providedArea,unit:'m2',clause:'4.5.4(1)②',repairKind:'spacing-or-area',reason:'JOINT_HOOP_AREA_INSUFFICIENT'},
  {id:'vertical-spacing',provided:spacing,limit:spacingLimit,relation:'maximum',ratio:spacing/spacingLimit,unit:'m',clause:'4.5.4(2)',repairKind:'spacing',reason:'JOINT_HOOP_VERTICAL_SPACING_EXCEEDED'},
  {id:'horizontal-spacing',provided:hx,limit:.35,relation:'maximum',ratio:hx/.35,unit:'m',clause:'4.5.4(3)',repairKind:'hoop-topology',reason:'JOINT_TRANSVERSE_HORIZONTAL_SPACING_EXCEEDED'},
  {id:'unconfined-cover',provided:cover,limit:.1,relation:'maximum',ratio:cover/.1,unit:'m',clause:'4.5.4(1)⑤',repairKind:'additional-confinement',reason:'JOINT_UNCONFINED_COVER_EXCEEDED'},
  {id:'concrete-strength-scope',provided:fck,limit:21,relation:'minimum',ratio:21/fck,unit:'MPa',clause:'4.1.4',repairKind:'material-scope',reason:'JOINT_CONCRETE_STRENGTH_SCOPE'},
  {id:'steel-strength-scope',provided:fy,limit:500,relation:'maximum',ratio:fy/500,unit:'MPa',clause:'4.1.5',repairKind:'material-scope',reason:'JOINT_HOOP_STEEL_STRENGTH_SCOPE'},
 ].map(c=>({...c,status:c.ratio<=1+1e-10?'OK':'NG'}));
 const governing=criteria.reduce((a,b)=>b.ratio>a.ratio?b:a),ratio=governing.ratio;
 return {...base,status:ratio<=1+1e-10?'OK':'NG',reason:ratio<=1+1e-10?null:governing.reason,ratio,criteria,governingCriterion:governing.id,failedCriteria:criteria.filter(c=>c.status==='NG').map(c=>c.id),directions,areaGoverningDirection:areaGoverning.steelDirection,...(transverseCredit?{transverseCredit}:{}),hxBasis:credit?'qualified-cross-tie-phase-spacing':'single-closed-hoop-centerline-spacing',requiredArea,providedArea,spacing,spacingLimit,spacingRepairLimit:Math.min(spacingLimit,...directions.map(d=>d.spacingRepairLimit)),hx,Ag,Ach,hcB,hcH,fck,fy,reductionApplied:false,units:{area:'m2',length:'m',strength:'MPa'}};
}
export function evaluateProvidedJointHoops(model,joint,{transverseCredit}={}){
 const nc=reason=>({status:'NOT_CHECKED',ratio:null,reason});
 if(joint.jointDesignStandard!=='KDS-142080-2021-special-frame'||joint.jointHoopForm!=='closed-rectangular-two-leg'||joint.reinforcement?.legs!==2||joint.concreteWeight!=='normal')return nc('SPECIAL_FRAME_RECTANGULAR_JOINT_HOOP_SCOPE_REQUIRED');
 const column=model.members.find(m=>m.id===joint.columnMemberId&&joint.memberIds.includes(m.id)),section=resolveSectionRecord(model,column?.secId);
 if(!column||!['RECT','SQUARE'].includes(section?.shape))return nc('JOINT_COLUMN_REFERENCE_REQUIRED');
 const latest=new Map();for(const r of model.designDetails?.reinforcement||[])if(!latest.has(r.id)||latest.get(r.id).version<r.version)latest.set(r.id,r);
 const selected=reinforcementRegionsAt([...latest.values()].filter(r=>r.memberId===column.id),column.n1===joint.nodeId?0:1),detail=selected[0];
 if(selected.length!==1||!detail.bars?.length)return nc('JOINT_COLUMN_LONGITUDINAL_REINFORCEMENT_REQUIRED');
 return {...kdsJointHoopQuantity({transverseCredit,B:section.params.B/1000,H:(section.params.H||section.params.B)/1000,cover:joint.jointCover,diameter:joint.reinforcement.diameter,spacing:joint.reinforcement.spacing,area:joint.reinforcement.area,longitudinalDiameter:Math.min(...detail.bars.map(b=>b.diameter)),fck:resolveMaterialRecord(model,joint.jointMaterialId)?.strength?.concrete?.fck,fy:resolveMaterialRecord(model,joint.reinforcement.materialId)?.strength?.steel?.Fy}),columnMemberId:column.id,columnDetailId:detail.id,columnDetailVersion:detail.version};
}

export function kdsJointHoopDetail(input){
 const references=getKcscRuleSources(['142001','142080']).map(r=>({...r,clause:r.id==='142001'?'1.4':'4.5.4, 4.6.2'}));
 if(input.closure!=='seismic-135'||!Number.isFinite(input.panelHeight)||input.panelHeight<=0)return {status:'NOT_CHECKED',ratio:null,reason:'JOINT_SEISMIC_HOOK_AND_PANEL_GEOMETRY_REQUIRED',codeReferences:references};
 const distribution=jointHoopDistribution({jointPanelHeight:input.panelHeight,jointFirstStart:input.firstStart,jointFirstEnd:input.firstEnd,reinforcement:{spacing:input.spacing}});
 if(distribution.status!=='OK')return {...distribution,ratio:null,codeReferences:references};
 const r=kdsRectangularTies({...input,closure:'standard-135',anchorBolts:false,system:'ordinary-tied-column'});
 if(r.status==='NOT_CHECKED'){
  const dimensions=rectangularTieRequirements(input),requiredSeismicTail=Math.max(6*input.diameter,.075);
  if(dimensions.status!=='OK')return {...r,distribution,...(Number.isFinite(requiredSeismicTail)?{requiredSeismicTail}:{})};
  const ratio=Math.max(requiredSeismicTail/input.tail,...dimensions.checks.map(c=>c.ratio));
  return {...r,status:ratio>1+1e-10?'NG':'NOT_CHECKED',ratio:ratio>1+1e-10?ratio:null,incomplete:true,incompleteReasons:[r.reason],checks:dimensions.checks,requiredSeismicTail,distribution,panelHeight:input.panelHeight,codeReferences:[...(r.codeReferences||[]),...references],scope:'independent tie dimensions; longitudinal support geometry remains unreviewed'};
 }
 const requiredTail=Math.max(6*input.diameter,.075),tailRatio=requiredTail/input.tail,panelRatio=(input.firstStart+input.firstEnd)/input.panelHeight;
 const ratio=Math.max(r.ratio??0,tailRatio,panelRatio);
 return {...r,status:r.status==='NG'||ratio>1+1e-10?'NG':'OK',ratio,requiredSeismicTail:requiredTail,distribution,panelHeight:input.panelHeight,codeReferences:[...(r.codeReferences||[]),...references],scope:'four-corner nominal hoop support, seismic hooks and end offsets; beam-bar congestion separate'};
}
export function evaluateProvidedJointHoopDetail(model,joint,{preparedJoint}={}){
 const quantity=evaluateProvidedJointHoops(model,joint);
 if(!quantity.columnDetailId)return {status:'NOT_CHECKED',ratio:null,reason:'JOINT_COLUMN_BAR_GEOMETRY_REQUIRED'};
 const detail=model.designDetails.reinforcement.find(d=>d.id===quantity.columnDetailId&&d.version===quantity.columnDetailVersion),column=model.members.find(m=>m.id===quantity.columnMemberId),section=resolveSectionRecord(model,column.secId);
 const result=kdsJointHoopDetail({B:section.params.B/1000,H:(section.params.H||section.params.B)/1000,cover:joint.jointCover,bars:detail.bars,diameter:joint.reinforcement.diameter,spacing:joint.reinforcement.spacing,firstStart:joint.jointFirstStart,firstEnd:joint.jointFirstEnd,closure:joint.jointTieClosure,tail:joint.jointHookTail,insideRadius:joint.jointBendInsideRadius,panelHeight:joint.jointPanelHeight});
 if(joint.jointClosureCorner===undefined&&joint.jointClosureSeparation===undefined&&!['jointCrossTieBarPairs','jointCrossTieHookSides','jointCrossTiePlaneOffsets','jointCrossTiePattern'].some(k=>joint[k]!==undefined))return result;
 const prepared=preparedJoint||prepareJointHoopGeometry(model,joint),closure=prepared.outerHoop?.closureGeometry;
 const shape={status:closure?.status||'NOT_CHECKED',reason:closure?.reason||prepared.nominalQuantity?.reason,assemblyStatus:closure?.assemblyStatus,assemblyReason:closure?.assemblyReason,selfAssembly:closure?.selfAssembly,crossTieAssembly:closure?.crossTieAssembly,coverStatus:closure?.coverStatus,hookPair:closure?.hookPair,geometricLength:closure?.path?.centerlineLength,codeReferences:closure?.codeReferences||[]};
 const crossTies=prepared.crossTies?{status:prepared.crossTies.status,assemblyStatus:prepared.crossTies.assemblyStatus,reason:prepared.crossTies.reason||prepared.crossTies.assemblyReason,pieceCount:prepared.crossTies.pieces?.length,pieceChecks:(prepared.crossTies.pieces||[]).map(p=>({mark:p.mark,status:p.status,failedChecks:p.checks.filter(c=>c.status==='NG').map(c=>c.kind)})),codeReferences:prepared.crossTies.codeReferences||[],columnDetailId:prepared.columnDetailId,columnDetailVersion:prepared.columnDetailVersion}:undefined;
 const knownFailure=result.status==='NG'||shape.status==='NG'||shape.assemblyStatus==='NG'||crossTies?.status==='NG',reason=result.status==='NG'?result.reason:shape.status==='NG'?shape.reason:shape.assemblyStatus==='NG'?shape.assemblyReason:crossTies?.status==='NG'?'JOINT_CROSS_TIE_GEOMETRY_OR_ASSEMBLY_FAILED':'JOINT_HOOP_CAGE_ASSEMBLY_REQUIRED';
 return {...result,status:knownFailure?'NG':'NOT_CHECKED',reason,incomplete:true,incompleteReasons:[...new Set([...(result.incompleteReasons||[]),'JOINT_HOOP_CAGE_ASSEMBLY_REQUIRED'])],spatialClosure:shape,...(crossTies?{crossTies}:{})};
}
