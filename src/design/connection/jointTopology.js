import {memberAxes} from '../../core/memberAxes.js';
// Connectivity classification does not qualify anchorage or confinement.
export function jointTopology(model,joint){
 const base={version:'p25-joint-topology-v1',classificationOnly:true},no=reason=>({...base,status:'NOT_CHECKED',reason});
 const node=model.nodes?.find(n=>n.id===joint.nodeId),ids=joint.memberIds;
 if(!node||!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)return no('JOINT_MEMBER_CONNECTIVITY_REQUIRED');
 const faces=new Map(),columns=[];
 for(const id of ids){
  const member=model.members?.find(m=>m.id===id),at=member?.n1===node.id?0:member?.n2===node.id?1:null;
  const other=model.nodes?.find(n=>n.id===(at===0?member?.n2:member?.n1));
  if(at===null||!other)return no('JOINT_MEMBER_CONNECTIVITY_REQUIRED');
  const axes=memberAxes(node,other),direction=axes.x;
  if(!Number.isFinite(axes.L)||axes.L<=0)return no('JOINT_MEMBER_GEOMETRY_REQUIRED');
  if(Math.abs(direction[2])>1-1e-8){columns.push({memberId:id,side:direction[2]>0?'above':'below'});continue;}
  const axis=Math.abs(direction[0])>1-1e-8?'X':Math.abs(direction[1])>1-1e-8?'Y':null;
  if(!axis)return no('ORTHOGONAL_JOINT_REQUIRED');
  const side=direction[axis==='X'?0:1]>0?'+':'-',face=`${axis}${side}`;
  if(faces.has(face))return no('JOINT_DUPLICATE_BEAM_FACE');
  faces.set(face,{face,axis,side,memberId:id,end:at===0?'i':'j'});
 }
 const incident=model.members?.filter(m=>m.n1===node.id||m.n2===node.id)||[];
 if(incident.length!==ids.length||incident.some(m=>!ids.includes(m.id)))return no('INCOMPLETE_JOINT_MEMBERS');
 const opposite=['X','Y'].some(axis=>faces.has(`${axis}+`)&&faces.has(`${axis}-`));
 const arrangement=faces.size===4?'four-sided':faces.size===3?'three-sided':faces.size===2?(opposite?'two-opposite':'two-adjacent'):faces.size===1?'one-sided':'column-only';
 return {...base,status:'OK',beamArrangement:arrangement,beamFaces:[...faces.values()].sort((a,b)=>a.face.localeCompare(b.face)),columns:columns.sort((a,b)=>a.side.localeCompare(b.side)||a.memberId.localeCompare(b.memberId)),oppositeBeamPair:opposite,anchorageMode:joint.jointAnchorageMode??null};
}
