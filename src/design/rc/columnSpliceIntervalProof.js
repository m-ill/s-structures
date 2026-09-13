import {memberAxes} from '../../core/memberAxes.js';
import {resolveSectionRecord,parseVersionedId} from '../../materials/registry.js';
import {spliceGeometry} from './spliceGeometry.js';
import {spliceBarPath} from './spliceBarPath.js';
const latest=records=>{const map=new Map();for(const r of records||[])if(!map.has(r.id)||map.get(r.id).version<r.version)map.set(r.id,r);return [...map.values()];};
// This proves only that remote splices leave the entire joint-panel column
// layout identical. It does not qualify lap transfer, member strength or beams.
export function columnSpliceIntervalProof(model,{nodeId,memberIds,interval,scope}){
 const joint={nodeId,memberIds};
 const base={version:'p25-column-splice-interval-v1',scope,strengthTransferQualified:false},rows=[];
 const nc=(reason,details)=>({...base,status:'NOT_CHECKED',reason,details,rows});
 if(!Array.isArray(memberIds)||typeof interval!=='function')return nc('COLUMN_SPLICE_INTERVAL_REQUIRED');
 const splices=latest(model.designDetails?.splices),records=latest(model.designDetails?.reinforcement);
 const incidentIds=new Set((model.members||[]).filter(m=>[m.n1,m.n2].includes(joint.nodeId)).map(m=>m.id));
 const affected=splices.filter(s=>s.continuationSide&&incidentIds.has(s.memberId));
 if(affected.some(s=>!joint.memberIds.includes(s.memberId)))return nc('INCOMPLETE_JOINT_SPLICE_MEMBERS');
 if(!affected.length)return {...base,status:'N_A',reason:'NO_INCIDENT_SPLICE_CONTINUATION',rows};
 if(affected.length>16)return nc('JOINT_SPLICE_LAYOUT_LIMIT');
 for(const id of new Set(affected.map(s=>s.memberId))){
  const member=model.members?.find(m=>m.id===id),nodes=[member?.n1,member?.n2].map(n=>model.nodes?.find(x=>x.id===n));
  if(!member||!nodes.every(Boolean))return nc('JOINT_SPLICE_MEMBER_REQUIRED');
  const axes=memberAxes(...nodes,member.localAxis),at=member.n1===joint.nodeId?0:member.n2===joint.nodeId?1:null,section=resolveSectionRecord(model,member.secId);
  if(at===null||Math.abs(axes.x[2])<1-1e-8||!['RECT','SQUARE'].includes(section?.shape))return nc('JOINT_SPLICE_COLUMN_INTERVAL_REQUIRED');
  const bounds=interval({at,length:axes.L});
  if(!bounds||![bounds.from,bounds.to].every(Number.isFinite)||bounds.from>=bounds.to)return nc('COLUMN_SPLICE_INTERVAL_REQUIRED');
  const {from,to}=bounds,H=(section.params.H||section.params.B)/1000;
  for(const detailId of new Set(affected.filter(s=>s.memberId===id).map(s=>parseVersionedId(s.reinforcementId).id))){
   const detail=records.find(r=>r.id===detailId&&r.memberId===id),selected=splices.filter(s=>s.memberId===id&&parseVersionedId(s.reinforcementId).id===detailId);
   if(!detail||selected.some(s=>s.reinforcementId!==`${detail.id}@${detail.version}`))return nc('CURRENT_JOINT_SPLICE_DETAIL_REQUIRED');
   if(detail.start*axes.L>Math.max(0,from)||detail.end*axes.L<Math.min(axes.L,to)||detail.bars.length>100)return nc('JOINT_SPLICE_REGION_COVERAGE_REQUIRED');
   const geometry=new Map();
   for(const splice of selected){const g=spliceGeometry(model,splice);if(g.status!=='OK')return nc(g.reason,{spliceId:splice.id});geometry.set(splice.id,g);}
   for(const [i,bar] of detail.bars.entries()){
    const selectedBar=selected.filter(s=>s.barIndices.some(index=>Number(index)===i+1));if(!selectedBar.length)continue;
    if(rows.length>=200)return nc('JOINT_SPLICE_LAYOUT_LIMIT');
    const path=spliceBarPath({detail,bar,memberLength:axes.L,H,splices:selectedBar.map(s=>({...s,startX:geometry.get(s.id).startX,endX:geometry.get(s.id).endX}))});
    if(path.status!=='OK')return nc(path.reason,{detailId,barIndex:i+1});
    const relevant=path.pieces.filter(p=>p.bodyEndX>=from&&p.bodyStartX<=to);
    if(relevant.length!==1)return nc('JOINT_SPLICE_PANEL_OVERLAP_OR_GAP',{detailId,barIndex:i+1});
    const p=relevant[0];
    for(const other of path.pieces){
     if(other===p)continue;
     if(!Array.isArray(other.points)||!other.points.length||other.points.some(v=>!Array.isArray(v)||!v.every(Number.isFinite))||!Array.isArray(other.segmentErrors)||other.segmentErrors.some(e=>!Number.isFinite(e)||e<0))return nc('JOINT_SPLICE_PATH_BOUNDS_REQUIRED');
     const error=Math.max(0,...other.segmentErrors),xs=other.points.map(v=>v[0]+detail.start*axes.L);
     if(Math.max(...xs)+error>=from&&Math.min(...xs)-error<=to)return nc('JOINT_SPLICE_OTHER_PIECE_ENTERS_PANEL',{detailId,barIndex:i+1,pieceMark:other.mark});
    }
    if(p.bodyStartX>from+1e-10||p.bodyEndX<to-1e-10||Math.abs(p.y-bar.y)>1e-10||Math.abs(p.z-bar.z)>1e-10)return nc('JOINT_SPLICE_PANEL_LAYOUT_CHANGED',{detailId,barIndex:i+1});
    rows.push({memberId:id,detailId,detailVersion:detail.version,barIndex:i+1,interval:{from,to},pieceMark:p.mark,spliceSources:selectedBar.map(s=>({id:s.id,version:s.version}))});
   }
  }
 }
 return {...base,status:'OK',reason:null,rows,basis:'exact straight-body coverage and unchanged local transverse coordinates throughout requested interval; remote lap mechanics excluded'};
}
