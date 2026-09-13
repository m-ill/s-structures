import {requiresOffsetAwareDesign} from '../../core/memberDesignGeometry.js';
import {jointThroughBars} from './jointThroughBars.js';
import {jointTopology} from './jointTopology.js';
import {memberAxes} from '../../core/memberAxes.js';
import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
import {reinforcementRegionsAt} from '../rc/reinforcementRegions.js';
import {buildBarFabrication} from '../rc/barGeometry.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
function latest(rows=[]){const m=new Map();for(const r of rows)if(!m.has(r.id)||r.version>m.get(r.id).version)m.set(r.id,r);return [...m.values()];}
export function evaluateJointHookAnchorage(model,joint){
 if(joint.jointAnchorageMode==='special-frame-beam-through-bars')return jointThroughBars(model,joint);
 if(joint.jointAnchorageMode==='special-frame-beam-mixed'){
  const through=jointThroughBars(model,joint),topology=jointTopology(model,joint);
  if(!through.continuityVerified)return {...through,throughBars:through};
  const paired=new Set(topology.beamFaces.filter(f=>f.axis===joint.jointThroughAxis).map(f=>f.memberId));
  const hooks=evaluateJointHookAnchorage(model,{...joint,jointAnchorageMode:'special-frame-beam-90-hooks',memberIds:joint.memberIds.filter(id=>!paired.has(id))});
  const rows=[through,hooks],failed=rows.find(r=>r.status==='NG'),pending=rows.find(r=>r.status!=='OK'&&r.status!=='NG'),status=failed?'NG':pending?'NOT_CHECKED':'OK';
  return {status,ratio:rows.some(r=>Number.isFinite(r.ratio))?Math.max(...rows.filter(r=>Number.isFinite(r.ratio)).map(r=>r.ratio)):null,reason:(failed||pending)?.reason??null,incomplete:!!pending,methodReviewRequired:true,designTransferAllowed:false,throughBars:through,hooks,checks:[...(through.checks||[]).map(r=>({...r,anchoragePath:'through'})),...(hooks.checks||[]).map(r=>({...r,anchoragePath:'90-hook'}))],codeReferences:[...through.codeReferences,...(hooks.codeReferences||[])],scope:'explicit through axis plus perpendicular 90-degree hooked beam ends; full joint checks remain required'};
 }
 const codeReferences=getKcscRuleSources(['142080','142050']).map(r=>({...r,clause:r.id==='142080'?'4.6.1(3); 4.6.4(1); Eq.4.6-3':'4.1.1; 4.1.2'}));
 const base={codeReferences,qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(joint.jointAnchorageMode!=='special-frame-beam-90-hooks'||joint.jointDesignStandard!=='KDS-142080-2021-special-frame'||joint.concreteWeight!=='normal'||joint.restraint!=='rigid')return nc('SPECIAL_FRAME_90_HOOK_SCOPE_REQUIRED');
 const node=model.nodes?.find(n=>n.id===joint.nodeId),column=model.members?.find(m=>m.id===joint.columnMemberId),cs=resolveSectionRecord(model,column?.secId),fc=resolveMaterialRecord(model,joint.jointMaterialId||column?.matId)?.strength?.concrete?.fck;
 const cn=[column?.n1,column?.n2].map(id=>model.nodes?.find(n=>n.id===id));
 if(column?.taper!=null)return nc('PRISMATIC_COLUMN_CORE_REQUIRED');
 if(column&&requiresOffsetAwareDesign(column))return nc('CENTERED_COLUMN_CORE_REQUIRED');
 if(!node||!cn.every(Boolean)||!['RECT','SQUARE'].includes(cs?.shape)||!(fc>=21&&fc<=90)||!(joint.jointPanelHeight>0&&joint.jointCover>0&&joint.reinforcement?.diameter>0))return nc('JOINT_CORE_GEOMETRY_REQUIRED');
 const ca=memberAxes(...cn,column.localAxis),halfY=(cs.params.H||cs.params.B)/2000-joint.jointCover-joint.reinforcement.diameter,halfZ=cs.params.B/2000-joint.jointCover-joint.reinforcement.diameter;
 if(Math.abs(ca.x[2])<1-1e-8||Math.min(halfY,halfZ)<=0)return nc('VERTICAL_RECTANGULAR_COLUMN_REQUIRED');
 const rows=[];
 for(const id of joint.memberIds){
  const member=model.members?.find(m=>m.id===id),nodes=[member?.n1,member?.n2].map(id=>model.nodes?.find(n=>n.id===id));if(!nodes.every(Boolean))return nc('JOINT_MEMBER_GEOMETRY_REQUIRED');
  const axes=memberAxes(...nodes,member.localAxis);if(Math.abs(axes.x[2])>1-1e-8)continue;
  if(member.taper!=null)return nc('PRISMATIC_BEAM_HOOK_SCOPE_REQUIRED');
  if(Math.abs(axes.x[2])>1e-8||Math.abs(axes.y[2])<1-1e-8||requiresOffsetAwareDesign(member))return nc('CENTERED_HORIZONTAL_BEAM_HOOK_SCOPE_REQUIRED');
  const alignment=[Math.abs(dot(axes.x,ca.y)),Math.abs(dot(axes.x,ca.z))];if(Math.max(...alignment)<1-1e-8)return nc('ORTHOGONAL_JOINT_CORE_REQUIRED');
  const atStart=member.n1===joint.nodeId;if(!atStart&&member.n2!==joint.nodeId)return nc('JOINT_MEMBER_NODE_MISMATCH');
  const details=reinforcementRegionsAt(latest(model.designDetails?.reinforcement).filter(d=>d.memberId===id),atStart?0:1),d=details[0],bs=resolveSectionRecord(model,member.secId);
  if(details.length!==1||!['RECT','SQUARE'].includes(bs?.shape)||d.reinforcementForm!=='single-deformed'||d.barCoating!=='uncoated')return nc('JOINT_BEAM_END_REINFORCEMENT_REQUIRED');
  const fy=resolveMaterialRecord(model,d.barMaterialId)?.strength?.steel?.Fy,side=atStart?'start':'end',length=axes.L*(d.end-d.start),halfAlong=alignment[0]>.5?(cs.params.H||cs.params.B)/2000:cs.params.B/2000,coreAlong=alignment[0]>.5?halfY:halfZ;
  if(!(fy>0&&fy<=600)||d[`${side}FabricationShape`]!=='L90')return nc('JOINT_90_HOOK_AND_STEEL_REQUIRED');
  for(const [index,bar] of d.bars.entries()){
   if(bar.diameter<.006||bar.diameter>.0349)return nc('JOINT_HOOK_D6_TO_D35_REQUIRED');
   const geometry=buildBarFabrication(d,bar,{length,H:(bs.params.H||bs.params.B)/1000}),points=geometry.ends?.[side]?.bendPoints;
   if(geometry.cutLength===null||!points?.length)return nc('JOINT_STANDARD_HOOK_GEOMETRY_REQUIRED');
   const coordinates=points.map(([x,y])=>[0,1,2].map(k=>[nodes[0].x,nodes[0].y,nodes[0].z][k]+axes.x[k]*(d.start*axes.L+x)+axes.y[k]*y+axes.z[k]*bar.z-[node.x,node.y,node.z][k]));
   const contained=coordinates.every(p=>Math.abs(dot(p,ca.y))+bar.diameter/2<=halfY+1e-9&&Math.abs(dot(p,ca.z))+bar.diameter/2<=halfZ+1e-9&&Math.abs(p[2])+bar.diameter/2<=joint.jointPanelHeight/2+1e-9);
   const farReach=Math.max(...coordinates.map(p=>dot(p,axes.x)*(atStart?-1:1)))+bar.diameter/2,required=Math.max(8*bar.diameter,.15,fy*bar.diameter/(5.4*Math.sqrt(fc))),available=halfAlong+farReach,ratio=required/available,farFaceReached=farReach>=coreAlong-1e-8;
   rows.push({memberId:id,barIndex:index+1,end:side,status:contained&&farFaceReached&&ratio<=1+1e-10?'OK':'NG',ratio,contained,farFaceReached,farReach,required,available,reason:!contained?'HOOK_OUTSIDE_CONFINED_CORE':!farFaceReached?'HOOK_NOT_EXTENDED_TO_OPPOSITE_CORE_FACE':ratio>1?'JOINT_HOOK_DEVELOPMENT_INSUFFICIENT':null,units:{length:'m'}});
  }
 }
 if(!rows.length)return nc('JOINT_BEAM_HOOKS_REQUIRED');
 const worst=rows.find(x=>x.status==='NG')||rows.reduce((a,b)=>b.ratio>a.ratio?b:a);
 return {...base,...worst,checks:rows,scope:'normal-concrete-orthogonal-beam-90-hooks-in-explicit-core; confinement capacity and crossing-bar congestion separate'};
}
