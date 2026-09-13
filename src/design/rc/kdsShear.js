import {createSpliceLayoutResolver} from './spliceStationLayout.js';
import {kdsTorsionThreshold} from './kdsTorsion.js';
import {mergeLocatedCheck} from '../evaluation/locationCoverage.js';
import {evaluateReinforcedTorsionAt} from './kdsReinforcedTorsion.js';
import {reinforcementRegionsAt} from './reinforcementRegions.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
const refs=()=>getKcscRuleSources(['142022','142010']).map(x=>({...x,clause:x.id==='142022'?'4.1.1(4); 4.2.1(1), Eq.4.2-1/2; 4.3.1(3); 4.3.2; 4.3.3(1),(3), Eq.4.3-1; 4.3.4(2),(9), Eq.4.3-3':'4.2.3(2)'}));
export function kdsMemberShear({fck,fy,bw,h,d,Ag,Av,s,N,V}) {
 const base={codeReferences:refs(),qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 if(![fck,fy,bw,h,d,Ag,Av,s,N,V].every(Number.isFinite)||![fck,fy,bw,h,d,Ag,s].every(x=>x>0)||Av<0||V<0||fy>500||fck<18||fck>90||d>=h)return {...base,status:'NOT_CHECKED',ratio:null,reason:'KDS_SHEAR_INPUT_RANGE'};
 // Solver recovery can leave signed machine-level forces on an unloaded
 // member. Do not let the discontinuous tensile branch amplify that noise.
 // This is a floating-point policy, not a KDS load or strength tolerance.
 const forceTolerance=64*Number.EPSILON*Math.max(1,fck*(Ag/1000));
 const axial=Math.abs(N)<=forceTolerance?0:N,shear=V<=forceTolerance?0:V;
 if(axial!==N||shear!==V)base.forceNormalization={version:'rc-shear-force-zero-v1',basis:'64*machine-epsilon*max(1kN,fck*Ag/1000)',tolerance:forceTolerance,units:'kN',rawAxial:N,rawShear:V,usedAxial:axial,usedShear:shear};
 N=axial;V=shear;
 const root=Math.min(Math.sqrt(fck),8.4),Vc=N>0?0:(1+Math.max(0,-N)*1000/(14*Ag))*root*bw*d/6000;
 const VsProvided=Av*fy*d/s/1000,VsUpperBound=0.2*(1-fck/250)*fck*bw*d/1000,Vs=Math.min(VsProvided,VsUpperBound);
 const minAv=Math.max(0.0625*Math.sqrt(fck),0.35)*bw*s/fy;
 const maxSpacing=Math.min(d/2,600)*(Vs>root*bw*d/3000?0.5:1);
 const concreteOnly=V<=0.75*Vc&&(h<=250||V<=0.75*Vc/2),capacity=0.75*(Vc+(concreteOnly?0:Vs));
 const inadequateMinimum=!concreteOnly&&Av<minAv,excessSpacing=!concreteOnly&&s>maxSpacing;
 const ratio=capacity>0?V/capacity:V===0?0:null;
 // Use the dense spacing limit: reducing spacing can cross the Vs threshold
 // that halves the ordinary limit. These bounds belong to this evaluated section.
 const requiredVs=Math.max(0,V/0.75-Vc);
 const spacingRepair=concreteOnly?{maxSpacing:null,reason:'CONCRETE_ONLY'}:requiredVs>VsUpperBound?{maxSpacing:null,reason:'SECTION_SHEAR_CAPACITY_EXCEEDED'}:Av<=0?{maxSpacing:null,reason:'TRANSVERSE_AREA_REQUIRED'}:{maxSpacing:Math.min(d/4,300,Av*fy/(Math.max(0.0625*Math.sqrt(fck),0.35)*bw),requiredVs>0?Av*fy*d/(requiredVs*1000):300),requiredVs,reason:null};
 // Twenty candidate values are represented by one bounded integer. Test each
 // value: feasibility need not be monotone across the Vs spacing threshold.
 let feasibleSpacingMask=0;
 for(let i=0;i<20;i++){
  const spacing=(i+1)*25,provided=Math.min(Av*fy*d/spacing/1000,VsUpperBound),cap=0.75*(Vc+(concreteOnly?0:provided));
  const utilization=cap>0?V/cap:V===0?0:null;
  if(utilization!==null&&utilization<=1&&(concreteOnly||(Av>=Math.max(0.0625*Math.sqrt(fck),0.35)*bw*spacing/fy&&spacing<=Math.min(d/2,600)*(provided>root*bw*d/3000?0.5:1))))feasibleSpacingMask|=1<<i;
 }
 spacingRepair.feasibleSpacingMask=feasibleSpacingMask;
 base.spacingRepair=spacingRepair;
 return {...base,status:(ratio!==null&&ratio<=1&&!inadequateMinimum&&!excessSpacing)?'OK':'NG',ratio,demand:V,capacity,Vc,Vs,VsProvided,VsUpperBound,minAv,maxSpacing,usedConcreteOnly:concreteOnly,phi:0.75,reason:inadequateMinimum?'MINIMUM_SHEAR_REINFORCEMENT_NOT_SATISFIED':excessSpacing?'SHEAR_REINFORCEMENT_SPACING_EXCEEDED':null,units:{force:'kN',length:'mm',area:'mm2'},scope:'ordinary-normal-concrete-prismatic-member-shear; stirrup anchorage separate'};
}
export function evaluateProvidedKdsShear(model,member,details,tuples,layoutResolver,options={}) {
 const out={},repairRegions={};
 const put=(key,value)=>{
  const truncated=out[key]?.spacingRepairRegionsTruncated;
  out[key]=mergeLocatedCheck(out[key],value);
  if(truncated)out[key].spacingRepairRegionsTruncated=true;
  if(!value.detailId)return;
  const regions=repairRegions[key]??=new Map(),id=JSON.stringify([value.detailId,value.detailVersion]);
  if(!regions.has(id)&&regions.size>=32){out[key].spacingRepairRegionsTruncated=true;return;}
  const record=regions.get(id)??{detailId:value.detailId,detailVersion:value.detailVersion,maxSpacing:null,feasibleSpacingMask:1048575,needsRepair:false,blocked:false,evaluatedLocations:0};
  record.evaluatedLocations++;record.needsRepair ||= value.status==='NG';
  record.blocked ||= !['OK','NG'].includes(value.status)||!!value.torsionReinforcement||(!value.usedConcreteOnly&&!(Number.isFinite(value.spacingRepair?.maxSpacing)&&value.spacingRepair.maxSpacing>0));
  if(Number.isFinite(value.spacingRepair?.maxSpacing))record.maxSpacing=Math.min(record.maxSpacing??Infinity,value.spacingRepair.maxSpacing);
  record.feasibleSpacingMask &= value.spacingRepair?.feasibleSpacingMask??0;
  regions.set(id,record);
 };
 const section=resolveSectionRecord(model,member.secId),concrete=resolveMaterialRecord(model,member.matId),nodes=[member.n1,member.n2].map(id=>model.nodes.find(x=>x.id===id));
 if(!['RECT','SQUARE'].includes(section?.shape)||!nodes.every(Boolean))return out;
 const B=section.params.B/1000,H=(section.params.H||section.params.B)/1000,L=Math.hypot(nodes[1].x-nodes[0].x,nodes[1].y-nodes[0].y,nodes[1].z-nodes[0].z);
 if(!details.some(x=>x.shearStandard==='KDS-142022-2022'))return out;
 const resolveLayout=layoutResolver||createSpliceLayoutResolver(model,member,details);
 for(const tuple of tuples)for(const [axis,coord,depth,width] of [['y','y',H,B],['z','z',B,H]]) {
  const found=reinforcementRegionsAt(details,tuple.x/L,tuple.side),key=`rc-shear-${axis}`;
  const nc=reason=>put(key,{status:'NOT_CHECKED',ratio:null,reason,concurrentDemand:tuple});
  if(found.length!==1){nc('UNIQUE_REINFORCEMENT_REGION_REQUIRED');continue;}
  const layout=resolveLayout(found[0],tuple.x,tuple.side);if(layout.status!=='OK'){put(key,{...layout,concurrentDemand:tuple});continue;}
  const detail=layout.detail,st=detail.stirrups,steel=resolveMaterialRecord(model,detail.stirrupMaterialId||detail.barMaterialId);
  if(detail.shearStandard!=='KDS-142022-2022'||detail.shearScope!=='ordinary-prismatic-no-opening'||detail.concreteWeight!=='normal'||detail.stirrupForm!=='closed-rectangular-two-leg'||st?.legs!==2){nc('KDS_SHEAR_SCOPE_AND_STIRRUP_GEOMETRY_REQUIRED');continue;}
  if(!Number.isFinite(options.clearLength??L)||(options.clearLength??L)<=0){nc('KDS_SHEAR_CLEAR_LENGTH_REQUIRED');continue;}
  if((options.clearLength??L)/depth<4){nc('DEEP_MEMBER_REQUIRES_SEPARATE_RULE');continue;}
  const torsionNeglect=Math.abs(tuple.T)>1e-9&&detail.torsionStandard==='KDS-142022-2022'?kdsTorsionThreshold({B,H,fck:concrete?.strength?.concrete?.fck,lambda:1,N:tuple.N,T:tuple.T}):null;
  const torsionReinforcement=Math.abs(tuple.T)>1e-9&&torsionNeglect?.status!=='OK'&&detail.torsionStandard==='KDS-142022-2022'?evaluateReinforcedTorsionAt(model,member,section,detail,tuple):null;
  if(Math.abs(tuple.T)>1e-9&&torsionNeglect?.status!=='OK'&&!['OK','NG'].includes(torsionReinforcement?.strengthStatus)){nc('TORSION_INTERACTION_REQUIRES_SEPARATE_RULE');continue;}
  const groups=[-1,1].map(sign=>detail.bars.filter(x=>sign*x[coord]>0));
  if(groups.some(x=>!x.length)){nc('BOTH_FACE_REINFORCEMENT_REQUIRED');continue;}
  const centers=groups.map(g=>g.reduce((s,b)=>s+b[coord]*b.area,0)/g.reduce((s,b)=>s+b.area,0)),d=Math.min(depth/2-centers[0],depth/2+centers[1]);
  const reservedAt=torsionReinforcement?.requiredAt||0;
  const result=kdsMemberShear({fck:concrete?.strength?.concrete?.fck,fy:steel?.strength?.steel?.Fy,bw:width*1000,h:depth*1000,d:d*1000,Ag:B*H*1e6,Av:Math.max(0,2*(st.area??Math.PI*st.diameter**2/4)*1e6-2*reservedAt),s:st.spacing*1000,N:tuple.N,V:Math.abs(tuple[axis==='y'?'Vy':'Vz'])});
  if(torsionReinforcement){result.torsionReinforcement=torsionReinforcement;result.reservedTorsionAreaPerLeg=reservedAt;result.methodReviewRequired=true;result.codeReferences=[...result.codeReferences,...torsionReinforcement.codeReferences];if(torsionReinforcement.strengthStatus==='NG'){result.status='NG';result.reason='TORSION_SHEAR_INTERACTION_NOT_SATISFIED';}}
  if(torsionNeglect)result.codeReferences=[...(result.codeReferences||[]),...torsionNeglect.codeReferences];
  put(key,{...result,...(layout.changed?{spliceLayoutEvaluated:true,pieceMarks:layout.pieceMarks}:{}),...(torsionNeglect?{torsionNeglect}:{}),transverseAreaBasis:st.areaBasis||'geometric-diameter',providedTransverseArea:2*(st.area??Math.PI*st.diameter**2/4),detailId:detail.id,detailVersion:detail.version,concurrentDemand:tuple,effectiveDepth:d});
 }
 for(const [key,regions] of Object.entries(repairRegions))out[key].spacingRepairRegions=[...regions.values()];
 return out;
}
