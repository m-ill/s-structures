import {splitRepeatedDistribution} from '../rc/splitRepeatedDistribution.js';
// An internal eligibility proof, built from the current prepared geometry and
// its actual path checks. This is not an input override or whole-design approval.
export function jointCrossTieCredit(prepared,topology,detail,reinforcement){
 const base={designTransferAllowed:false,methodReviewRequired:true};
 const no=reason=>({...base,status:'NOT_CHECKED',reason});
 if(topology?.status!=='OK'||prepared?.crossTies?.pattern!=='alternating-hook-side')return no('JOINT_CROSS_TIE_TOPOLOGY_AND_ALTERNATION_REQUIRED');
 const closure=prepared.outerHoop?.closureGeometry,pieces=prepared.crossTies.pieces,db=reinforcement?.diameter,s=reinforcement?.spacing;
 if(![db,s].every(v=>Number.isFinite(v)&&v>0)||!pieces?.length||pieces.length>40)return no('JOINT_CROSS_TIE_PRODUCT_REQUIRED');
 const area=reinforcement.area??Math.PI*db**2/4;
 if(!Number.isFinite(area)||area<=0)return no('JOINT_CROSS_TIE_PRODUCT_REQUIRED');
 const reviews=[closure,closure?.selfAssembly,closure?.crossTieAssembly,prepared.crossTies.assembly,detail?.transverseLongitudinalAssembly,detail?.outerHoopSupport,detail?.crossTieSupport];
 if(reviews.some(r=>r?.status!=='OK'||r.incomplete))return no('JOINT_CROSS_TIE_SUPPORT_AND_ASSEMBLY_REQUIRED');
 if(!Array.isArray(detail.checks)||['tie-diameter','tie-spacing','start-first-tie','end-first-tie','135-hook-tail','inside-bend-radius'].some(kind=>!detail.checks.some(c=>c.kind===kind))||detail.checks.some(c=>c.status==='NG'||c.status==='NOT_CHECKED'||!Number.isFinite(c.ratio)||c.ratio>1+1e-10))return no('JOINT_TRANSVERSE_DIMENSIONS_REQUIRED');
 if(typeof prepared.columnDetailId!=='string'||!Number.isInteger(prepared.columnDetailVersion)||[detail.outerHoopSupport,detail.crossTieSupport].some(r=>r.columnDetailId!==prepared.columnDetailId||r.columnDetailVersion!==prepared.columnDetailVersion))return no('CURRENT_JOINT_SUPPORT_SOURCE_REQUIRED');
 const split=splitRepeatedDistribution(prepared.stirrupDistribution,2);
 if(split.status!=='OK'||Math.abs(prepared.stirrupDistribution.spacing-s)>1e-10)return no('JOINT_CROSS_TIE_DISTRIBUTION_REQUIRED');
 const faces=closure.path?.primitives?.filter(p=>p.kind==='line').slice(1,-1),membership=detail.outerHoopSupport.faceMembership;
 if(faces?.length!==4||membership?.status!=='OK'||!Array.isArray(membership.faces))return no('JOINT_OPPOSITE_FACE_ANCHORAGE_REQUIRED');
 const bySource=new Map();
 for(const p of pieces){
  const group=split.groups.find(g=>g.sourceIndexOffset===p.sourceIndexOffset),actual=p.distribution;
  if(!group||p.sourceIndexStride!==2||!actual||['count','spacing','first','last'].some(k=>!Number.isFinite(actual[k])||Math.abs(actual[k]-group.distribution[k])>1e-10))return no('JOINT_CROSS_TIE_DISTRIBUTION_REQUIRED');
  if(p.status!=='OK'||!Number.isFinite(p.diameter)||Math.abs(p.diameter-db)>1e-10||p.hookAngle!==135||!Number.isFinite(p.tail)||p.tail<Math.max(6*db,.075)-1e-10||!Number.isFinite(p.insideRadius)||p.insideRadius<(db<=.016?2:3)*db-1e-10)return no('JOINT_SEISMIC_CROSS_TIE_ENDS_REQUIRED');
  if(!Array.isArray(p.bars)||p.bars.length!==2||p.bars[0]===p.bars[1]||!['left','right'].includes(p.hookSide)||typeof p.sourceMark!=='string'||!Number.isFinite(p.planeOffset))return no('JOINT_CROSS_TIE_END_REFERENCES_REQUIRED');
  const line=p.path?.lines?.[1];
  if(!Array.isArray(line)||line.length!==2||line.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))return no('JOINT_CROSS_TIE_BODY_REQUIRED');
  // B-directed bodies span z and must anchor to the +/-z faces; H-directed
  // bodies span y and must anchor to the +/-y faces. Do not accept same-face bars.
  const axis=Math.abs(line[0][0]-line[1][0])<1e-10?2:1;
  const ends=p.bars.map(bar=>faces.flatMap((face,i)=>{
   if(!face.start?.every(Number.isFinite)||!face.end?.every(Number.isFinite)||Math.abs(face.start[axis]-face.end[axis])>1e-10)return [];
   return membership.faces?.find(f=>f.face===i+1)?.contactedBarIndices?.includes(bar)?[Math.sign(face.start[axis])]:[];
  }));
  if(!ends[0].some(a=>a!==0&&ends[1].includes(-a)))return no('JOINT_OPPOSITE_FACE_ANCHORAGE_REQUIRED');
  const existing=bySource.get(p.sourceMark)||[];
  if(existing.some(q=>q.sourceIndexOffset===p.sourceIndexOffset))return no('JOINT_CROSS_TIE_PHASE_DUPLICATE');
  existing.push(p);bySource.set(p.sourceMark,existing);
 }
 for(const group of bySource.values()){
  if(group.length!==split.groups.length)return no('JOINT_CROSS_TIE_PHASE_MISSING');
  if(group.length===2&&(group[0].hookSide===group[1].hookSide||group[0].bars.some((b,i)=>b!==group[1].bars[i])||Math.abs(group[0].planeOffset-group[1].planeOffset)>1e-10))return no('JOINT_CROSS_TIE_END_ALTERNATION_REQUIRED');
 }
 const directions=['B','H'].map(steelDirection=>({steelDirection,additionalArea:Math.min(...topology.phases.map(p=>p.directions.find(d=>d.steelDirection===steelDirection).ties.length))*area}));
 return {...base,status:'OK',reason:null,diameter:db,spacing:s,hx:topology.nominalHx,directions,sourceCount:bySource.size,basis:'current opposite-face hook contact, all-phase alternation and physical assembly; full design and fabrication qualification separate'};
}
