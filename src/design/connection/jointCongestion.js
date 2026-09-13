import {requiresOffsetAwareDesign} from '../../core/memberDesignGeometry.js';
import {jointThroughBars} from './jointThroughBars.js';
import {memberAxes} from '../../core/memberAxes.js';
import {resolveSectionRecord} from '../../materials/registry.js';
import {reinforcementRegionsAt} from '../rc/reinforcementRegions.js';
import {buildBarFabrication} from '../rc/barGeometry.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
const sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),clamp=x=>Math.max(0,Math.min(1,x));
export function segmentDistance(p,q,r,t){
 const u=sub(q,p),v=sub(t,r),w=sub(p,r),a=dot(u,u),b=dot(u,v),c=dot(v,v),d=dot(u,w),e=dot(v,w);let s,z;
 if(a<1e-24&&c<1e-24)return Math.hypot(...w);
 if(a<1e-24){s=0;z=clamp(e/c);}else if(c<1e-24){z=0;s=clamp(-d/a);}else{const den=a*c-b*b;s=den>1e-24?clamp((b*e-c*d)/den):0;z=(b*s+e)/c;if(z<0){z=0;s=clamp(-d/a);}else if(z>1){z=1;s=clamp((b-d)/a);}}
 return Math.hypot(...w.map((x,i)=>x+s*u[i]-z*v[i]));
}
export function checkBarPathClearance(bars,minimumClearance){
 if(!Array.isArray(bars)||bars.some(b=>!Number.isFinite(b.diameter)||b.diameter<=0||!Number.isFinite(b.sagitta??0)||(b.sagitta??0)<0||!Array.isArray(b.segments)||b.segments.some(s=>!Array.isArray(s)||s.length!==2||s.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)))))return {status:'NOT_CHECKED',ratio:null,reason:'JOINT_BAR_PATH_INVALID'};
 if(!Number.isFinite(minimumClearance)||minimumClearance<0||bars.length>100||bars.reduce((s,b)=>s+b.segments.length,0)>1000)return {status:'NOT_CHECKED',ratio:null,reason:'JOINT_CLEARANCE_INPUT_OR_SIZE_LIMIT'};
 const pairs=[];let minimum=null;
 for(let i=0;i<bars.length;i++)for(let j=0;j<i;j++){
  const a=bars[i],b=bars[j];let distance=Infinity;
  for(const [p,q] of a.segments)for(const [r,t] of b.segments)distance=Math.min(distance,segmentDistance(p,q,r,t));
  if(!Number.isFinite(distance))continue;
  const clearance=distance-(a.diameter+b.diameter)/2-(a.sagitta||0)-(b.sagitta||0),row={bars:[a.id,b.id],clearance,required:minimumClearance};
  if(!minimum||clearance<minimum.clearance)minimum=row;if(clearance+1e-9<minimumClearance)pairs.push(row);
 }
 return {status:pairs.length?'NG':'OK',ratio:null,reason:pairs.length?'JOINT_LONGITUDINAL_BAR_CLEARANCE_NOT_SATISFIED':null,minimum,failedPairs:pairs,pairCount:bars.length*(bars.length-1)/2,barCount:bars.length,minimumClearance,units:{length:'m'}};
}
function clipSegment(a,b,half){
 let lo=0,hi=1;const v=sub(b,a);
 for(let k=0;k<3;k++){if(Math.abs(v[k])<1e-12){if(Math.abs(a[k])>half[k])return null;continue;}const u=(-half[k]-a[k])/v[k],w=(half[k]-a[k])/v[k];lo=Math.max(lo,Math.min(u,w));hi=Math.min(hi,Math.max(u,w));if(lo>hi)return null;}
 return [a.map((x,k)=>x+lo*v[k]),a.map((x,k)=>x+hi*v[k])];
}
function latest(rows=[]){const m=new Map();for(const r of rows)if(!m.has(r.id)||r.version>m.get(r.id).version)m.set(r.id,r);return [...m.values()];}
export function evaluateJointCongestion(model,joint){
 const base={qualification:'longitudinal-bar-geometry-review',methodReviewRequired:true,designTransferAllowed:false,codeReferences:getKcscRuleSources(['142050','142080']).map(r=>({...r,clause:r.id==='142050'?'4.2.2':'4.6.1; 4.6.4'}))};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 const through=['special-frame-beam-through-bars','special-frame-beam-mixed'].includes(joint.jointAnchorageMode)?jointThroughBars(model,joint):null;
 if(through&&!through.continuityVerified)return nc(through.reason);
 const throughMembers=new Set((through?.pairs||[]).flatMap(p=>[p.a.memberId,p.b.memberId]));
 if(joint.jointCongestionMode!=='longitudinal-paths'||!Number.isFinite(joint.jointMinimumClearance)||joint.jointMinimumClearance<0||!(joint.jointPanelHeight>0))return nc('JOINT_PATH_CLEARANCE_SCOPE_REQUIRED');
 const node=model.nodes?.find(n=>n.id===joint.nodeId),column=model.members?.find(m=>m.id===joint.columnMemberId),cs=resolveSectionRecord(model,column?.secId),cn=[column?.n1,column?.n2].map(id=>model.nodes?.find(n=>n.id===id));
 if(!node||!cn.every(Boolean)||!['RECT','SQUARE'].includes(cs?.shape))return nc('JOINT_CORE_GEOMETRY_REQUIRED');
 if(column.taper!=null)return nc('JOINT_NONPRISMATIC_BAR_PATHS_REQUIRED');
 if(requiresOffsetAwareDesign(column))return nc('JOINT_OFFSET_BAR_PATHS_REQUIRED');
 const ca=memberAxes(...cn,column.localAxis),half=[(cs.params.H||cs.params.B)/2000,cs.params.B/2000,joint.jointPanelHeight/2],origin=[node.x,node.y,node.z],bars=[];
 if(Math.abs(ca.x[2])<1-1e-8)return nc('VERTICAL_COLUMN_CLEARANCE_SCOPE_REQUIRED');
 const local=p=>{const v=sub(p,origin);return [dot(v,ca.y),dot(v,ca.z),dot(v,ca.x)];};
 const columnGroups=[];
 for(const id of joint.memberIds){
  const member=model.members?.find(m=>m.id===id),nodes=[member?.n1,member?.n2].map(id=>model.nodes?.find(n=>n.id===id));if(!nodes.every(Boolean))return nc('JOINT_MEMBER_GEOMETRY_REQUIRED');
  if(member.taper!=null)return nc('JOINT_NONPRISMATIC_BAR_PATHS_REQUIRED');
  if(requiresOffsetAwareDesign(member))return nc('JOINT_OFFSET_BAR_PATHS_REQUIRED');
  const axes=memberAxes(...nodes,member.localAxis),vertical=Math.abs(axes.x[2])>1-1e-8,at=member.n1===joint.nodeId?0:member.n2===joint.nodeId?1:null;
  if(at===null)return nc('JOINT_MEMBER_NODE_MISMATCH');
  if(vertical&&columnGroups.length>=2)return nc('COLUMN_CONTINUITY_TWO_MEMBERS_ONLY');
  const details=reinforcementRegionsAt(latest(model.designDetails?.reinforcement).filter(d=>d.memberId===id),at),d=details[0],section=resolveSectionRecord(model,member.secId);
  if(details.length!==1||!['RECT','SQUARE'].includes(section?.shape))return nc('JOINT_BAR_PATH_DETAILS_REQUIRED');
  const group=vertical?{memberId:id,side:Math.sign(dot(axes.x,ca.x))*(at===0?1:-1),bars:[]}:null;
  if(group){
   // A through-bar declaration must not override a hook, termination or splice.
   const shape=d[at===0?'startFabricationShape':'endFabricationShape']??d.fabricationShape??'straight';
   if(shape!=='straight'||latest(model.designDetails?.splices).some(s=>s.memberId===id&&s.reinforcementId===`${d.id}@${d.version}`&&(at===0?s.start*axes.L<=half[2]:(1-s.end)*axes.L<=half[2])))return nc('COLUMN_CONTINUITY_STRAIGHT_UNSPLICED_PATH_REQUIRED');
   columnGroups.push(group);
  }
  for(const [i,bar] of d.bars.entries()){
   if(bars.length>=100)return nc('JOINT_CLEARANCE_INPUT_OR_SIZE_LIMIT');
   let points,sagitta=0,sourceErrors;
   if(vertical){const plan=origin.map((x,k)=>x+axes.y[k]*bar.y+axes.z[k]*bar.z);points=[plan.map((x,k)=>x-ca.x[k]*half[2]),plan.map((x,k)=>x+ca.x[k]*half[2])];}
   else{
    const g=buildBarFabrication(d,bar,{length:axes.L*(d.end-d.start),H:(section.params.H||section.params.B)/1000,interiorStart:throughMembers.has(id)&&at===0,interiorEnd:throughMembers.has(id)&&at===1});if(g.cutLength===null||!g.points?.length)return nc('JOINT_ACTUAL_BAR_PATH_REQUIRED');
    points=g.points.map(([x,y])=>[0,1,2].map(k=>[nodes[0].x,nodes[0].y,nodes[0].z][k]+axes.x[k]*(d.start*axes.L+x)+axes.y[k]*y+axes.z[k]*bar.z));
    sourceErrors=g.segmentErrors;
    const ends=g.ends?Object.values(g.ends):[g];sagitta=Math.max(0,...ends.map(e=>e.centerlineRadius?e.centerlineRadius*(1-Math.cos((e.shape==='J180'?Math.PI:Math.PI/2)/48)):0));
   }
   const coordinates=points.map(local),segments=[],segmentErrors=[];for(let j=1;j<coordinates.length;j++){const segment=clipSegment(coordinates[j-1],coordinates[j],half);if(segment){segments.push(segment);segmentErrors.push(sourceErrors?.[j-1]??sagitta);}}
   if(bars.reduce((sum,b)=>sum+b.segments.length,0)+segments.length>1000)return nc('JOINT_CLEARANCE_INPUT_OR_SIZE_LIMIT');
   if(segments.length){const path={id:`${id}:B${i+1}`,diameter:bar.diameter,sagitta,segments,segmentErrors};bars.push(path);if(group)group.bars.push({path,materialId:d.barMaterialId,area:bar.area,plan:coordinates[0].slice(0,2)});}
  }
 }
 let columnContinuity=null;
 if(columnGroups.length===2){
  if(joint.jointColumnContinuity!=='aligned-through-bars')return nc('PAIRED_COLUMN_BAR_CONTINUITY_REQUIRED');
  const [a,b]=columnGroups;
  if(a.side===b.side)return nc('COLUMN_CONTINUITY_OPPOSITE_MEMBERS_REQUIRED');
  if(!a.bars.length||a.bars.length!==b.bars.length)return nc('COLUMN_CONTINUITY_BAR_MATCH_REQUIRED');
  const unmatched=new Set(b.bars),pairs=[];
  for(const x of a.bars){
   const matches=[...unmatched].filter(y=>x.materialId===y.materialId&&Math.abs(x.path.diameter-y.path.diameter)<1e-9&&Number.isFinite(x.area)&&Number.isFinite(y.area)&&Math.abs(x.area-y.area)<1e-12&&Math.hypot(...sub(x.plan,y.plan))<1e-8);
   if(matches.length!==1)return nc('COLUMN_CONTINUITY_BAR_MATCH_REQUIRED');
   const y=matches[0];unmatched.delete(y);pairs.push([x.path.id,y.path.id]);
   x.path.continuationIds=[x.path.id,y.path.id];bars.splice(bars.indexOf(y.path),1);
  }
  columnContinuity={mode:joint.jointColumnContinuity,pairCount:pairs.length,pairs,qualification:'explicit aligned straight bars; physical continuity requires detailing review'};
 }
 if(bars.length<2)return nc('JOINT_MULTIPLE_BAR_PATHS_REQUIRED');
 if(through)for(const pair of through.pairs){
  const a=bars.find(b=>b.id===`${pair.a.memberId}:B${pair.a.barIndex}`),b=bars.find(b=>b.id===`${pair.b.memberId}:B${pair.b.barIndex}`);
  if(!a||!b)return nc('JOINT_THROUGH_BAR_PATH_REQUIRED');
  a.segments.push(...b.segments);a.segmentErrors.push(...b.segmentErrors);a.continuationIds=[a.id,b.id];bars.splice(bars.indexOf(b),1);
 }
 return {...base,...checkBarPathClearance(bars,joint.jointMinimumClearance),columnContinuity,barPaths:bars,pathCoordinates:'column-local-y,z,x; metres from joint node',pathDimensions:{u:2*half[0],v:2*half[1],w:2*half[2]},scope:'explicit clearance between longitudinal paths only; hoop contacts and aggregate placement separate'};
}
