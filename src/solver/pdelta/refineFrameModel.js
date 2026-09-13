import {memberAxes} from '../../core/memberAxes.js';
import {requiresOffsetAwareDesign} from '../../core/memberDesignGeometry.js';
import {memberReleaseDofs,memberRotationalSpringEntries} from '../../core/memberReleaseContract.js';
export const DIRECT_FRAME_REFINEMENT_VERSION='p25-direct-frame-refinement-v1';
// Private analysis topology. No original support, load, section or member is edited.
export function refineDirectFrameModel(source,{divisions=2}={}){
 if(!Number.isInteger(divisions)||divisions<1||divisions>16)throw Error('REFINEMENT_DIVISIONS_INVALID');
 if(source.panels?.length||source.slabs?.length)throw Error('REFINEMENT_PANEL_MAPPING_REQUIRED');
 const model=structuredClone(source),nodes=new Map((model.nodes||[]).map(n=>[n.id,n]));
 const reserved=new Set([...(model.nodes||[]),...(model.members||[]),...(model.loads||[])].map(r=>r.id));
 const allocate=id=>{if(reserved.has(id))throw Error('REFINEMENT_ID_COLLISION');reserved.add(id);return id;};
 const members=[],mapping=[];
 for(const member of model.members||[]){
  if(member.type!=='frame'||requiresOffsetAwareDesign(member)||memberReleaseDofs(member).length||memberRotationalSpringEntries(member).length||member.partialFixity!=null||member.foundation!=null||member.customProps!=null)throw Error('REFINEMENT_MEMBER_KINEMATICS_REQUIRED');
  if(member.taper!=null&&!(member.taper.profile==='segments'&&member.taper.segments?.length===1&&member.taper.segments[0].start===0&&member.taper.segments[0].end===1))throw Error('REFINEMENT_PRISMATIC_SECTION_REQUIRED');
  const a=nodes.get(member.n1),b=nodes.get(member.n2);if(!a||!b)throw Error('REFINEMENT_MEMBER_NODES_REQUIRED');
  const axes=memberAxes(a,b,member.localAxis);if(!(axes.L>0))throw Error('REFINEMENT_MEMBER_LENGTH_INVALID');
  const ids=[a.id];
  for(let i=1;i<divisions;i++){
   const id=allocate(`p25-refine-node:${member.id}:${i}/${divisions}`),t=i/divisions;
   model.nodes.push({id,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});ids.push(id);
  }
  ids.push(b.id);const parts=[];
  for(let i=0;i<divisions;i++){
   const id=divisions===1?member.id:allocate(`p25-refine-member:${member.id}:${i}/${divisions}`);
   members.push({...member,id,n1:ids[i],n2:ids[i+1]});
   parts.push({id,start:i/divisions,end:(i+1)/divisions,startX:axes.L*i/divisions,endX:axes.L*(i+1)/divisions});
  }
  mapping.push({memberId:member.id,axes,length:axes.L,parts});
 }
 const loads=[];
 for(const load of model.loads||[]){
  const target=load.member??load.memberId;
  if(target===undefined){loads.push(load);continue;}
  const row=mapping.find(r=>r.memberId===target);if(!row)throw Error('REFINEMENT_LOAD_MEMBER_REQUIRED');
  const emit=(part,values)=>{const next={...load,...values,id:allocate(`p25-refine-load:${load.id}:${part.id}`),member:part.id};delete next.memberId;loads.push(next);};
  if(['point','mmoment'].includes(load.type)){
   const t=load.type==='point'?(load.t??load.at??.5):(load.at??load.t??.5);
   if(!Number.isFinite(t)||t<0||t>1)throw Error('REFINEMENT_LOAD_POSITION_INVALID');
   const part=row.parts[Math.min(divisions-1,Math.floor(t*divisions))],position=(t-part.start)/(part.end-part.start);
   emit(part,{t:position,at:position});continue;
  }
  if(['temperature','tgradient'].includes(load.type)){for(const part of row.parts)emit(part,{});continue;}
  if(!['udl','udl-partial','trapezoid'].includes(load.type))throw Error('REFINEMENT_LOAD_MAPPING_REQUIRED');
  const start=load.type==='udl'?0:load.from,end=load.type==='udl'?1:load.to;
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>1||end<=start)throw Error('REFINEMENT_LOAD_RANGE_INVALID');
  if(load.type==='udl'&&![undefined,'uniform','asc','desc'].includes(load.shape))throw Error('REFINEMENT_LOAD_SHAPE_REQUIRED');
  const w1=load.type==='trapezoid'?load.w1:load.shape==='asc'?0:load.w,w2=load.type==='trapezoid'?load.w2:load.shape==='desc'?0:load.w;
  if(![w1,w2].every(Number.isFinite))throw Error('REFINEMENT_LOAD_MAGNITUDE_INVALID');
  const value=t=>w1+(w2-w1)*(t-start)/(end-start);
  for(const part of row.parts){
   const left=Math.max(start,part.start),right=Math.min(end,part.end);if(right<=left)continue;
   emit(part,{type:'trapezoid',from:(left-part.start)/(part.end-part.start),to:(right-part.start)/(part.end-part.start),w1:value(left),w2:value(right),shape:'uniform'});
  }
 }
 model.members=members;model.loads=loads;
 return {version:DIRECT_FRAME_REFINEMENT_VERSION,model,mapping,divisions,originalNodeIds:source.nodes.map(n=>n.id),physicalModelChanged:false};
}
