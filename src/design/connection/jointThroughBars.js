import {jointTopology} from './jointTopology.js';
import {memberAxes} from '../../core/memberAxes.js';
import {requiresOffsetAwareDesign} from '../../core/memberDesignGeometry.js';
import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
import {reinforcementRegionsAt} from '../rc/reinforcementRegions.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
export function jointThroughBars(model,joint){
 const base={codeReferences:getKcscRuleSources(['142080']).map(r=>({...r,clause:'4.6.1(4); Eq.4.6-1a; Eq.4.6-1b'})),methodReviewRequired:true,designTransferAllowed:false,scope:'explicit paired straight beam bars meeting at joint plane; normal concrete special frame; external anchorage and fabrication review separate'};
 const no=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason,continuityVerified:false});
 const mixed=joint.jointAnchorageMode==='special-frame-beam-mixed';
 if(!['special-frame-beam-through-bars','special-frame-beam-mixed'].includes(joint.jointAnchorageMode)||joint.jointBeamContinuity!=='aligned-through-bars'||joint.jointDesignStandard!=='KDS-142080-2021-special-frame'||joint.concreteWeight!=='normal'||joint.restraint!=='rigid')return no('JOINT_THROUGH_BAR_SCOPE_REQUIRED');
 const topology=jointTopology(model,joint);
 if(topology.status!=='OK')return no('JOINT_OPPOSITE_BEAM_PAIRS_REQUIRED');
 if(mixed&&!['X','Y'].includes(joint.jointThroughAxis))return no('JOINT_THROUGH_AXIS_REQUIRED');
 const faces=mixed?topology.beamFaces.filter(f=>f.axis===joint.jointThroughAxis):topology.beamFaces;
 if(mixed?(faces.length!==2||faces[0].side===faces[1].side||topology.beamFaces.length===faces.length):!['two-opposite','four-sided'].includes(topology.beamArrangement))return no('JOINT_OPPOSITE_BEAM_PAIRS_REQUIRED');
 const column=model.members.find(m=>m.id===joint.columnMemberId&&joint.memberIds.includes(m.id)),section=resolveSectionRecord(model,column?.secId);
 if(!column||column.taper||requiresOffsetAwareDesign(column)||!['RECT','SQUARE'].includes(section?.shape))return no('JOINT_THROUGH_COLUMN_GEOMETRY_REQUIRED');
 const cn=[column.n1,column.n2].map(id=>model.nodes.find(n=>n.id===id));if(!cn.every(Boolean))return no('JOINT_THROUGH_COLUMN_GEOMETRY_REQUIRED');
 const ca=memberAxes(...cn,column.localAxis);if(Math.abs(ca.x[2])<1-1e-8)return no('VERTICAL_RECTANGULAR_COLUMN_REQUIRED');
 if(!['y','z'].every(key=>ca[key].some(v=>Math.abs(v)>1-1e-8)))return no('ORTHOGONAL_JOINT_CORE_REQUIRED');
 const latest=new Map();for(const r of model.designDetails?.reinforcement||[])if(!latest.has(r.id)||latest.get(r.id).version<r.version)latest.set(r.id,r);
 const groups=new Map(),pairs=[],checks=[];
 for(const face of faces){
  const member=model.members.find(m=>m.id===face.memberId),at=member.n1===joint.nodeId?0:1;
  if(member.taper||requiresOffsetAwareDesign(member))return no('CENTERED_PRISMATIC_THROUGH_BEAMS_REQUIRED');
  const selected=reinforcementRegionsAt([...latest.values()].filter(r=>r.memberId===member.id),at),detail=selected[0],side=at===0?'start':'end';
  if(selected.length!==1||detail.reinforcementForm!=='single-deformed'||detail.barCoating!=='uncoated'||!detail.bars?.length||detail.bars.length>100)return no('JOINT_THROUGH_BAR_DETAIL_REQUIRED');
  if((detail[`${side}FabricationShape`]??detail.fabricationShape)!=='straight'||detail[at===0?'endSetbackStart':'endSetbackEnd']!==0||(detail[`${side}Extension`]??0)!==0)return no('JOINT_THROUGH_BAR_GAP_OR_TERMINATION');
  if(model.designDetails?.splices?.some(s=>s.memberId===member.id&&(s.reinforcementId===detail.id||s.reinforcementId?.startsWith(`${detail.id}@`))))return no('JOINT_THROUGH_BAR_SPLICE_REVIEW_REQUIRED');
  const material=resolveMaterialRecord(model,detail.barMaterialId),fy=material?.strength?.steel?.Fy;
  if(!Number.isFinite(fy)||fy<=0||fy>600)return no('JOINT_THROUGH_BAR_STEEL_REQUIRED');
  const nodes=[member.n1,member.n2].map(id=>model.nodes.find(n=>n.id===id)),axes=memberAxes(...nodes,member.localAxis);
  const bars=detail.bars.map((bar,i)=>({memberId:member.id,barIndex:i+1,detailId:detail.id,detailVersion:detail.version,materialId:detail.barMaterialId,catalogId:detail.barCatalogId??null,designation:bar.designation??null,fy,diameter:bar.diameter,area:bar.area,point:axes.y.map((v,k)=>v*bar.y+axes.z[k]*bar.z)}));
  if(bars.some(b=>![b.diameter,b.area,...b.point].every(Number.isFinite)||b.diameter<=0||b.area<=0))return no('JOINT_THROUGH_BAR_PRODUCT_REQUIRED');
  groups.set(face.face,bars);
 }
 for(const axis of ['X','Y']){
  if(!groups.has(`${axis}+`))continue;
  const a=groups.get(`${axis}+`),b=groups.get(`${axis}-`);if(a.length!==b?.length)return no('JOINT_THROUGH_BAR_MATCH_REQUIRED');
  const remaining=new Set(b),k=axis==='X'?0:1,h=Math.abs(ca.y[k])*(section.params.H||section.params.B)/1000+Math.abs(ca.z[k])*section.params.B/1000;
  if(!Number.isFinite(h)||h<=0)return no('JOINT_THROUGH_COLUMN_GEOMETRY_REQUIRED');
  for(const left of a){
   const matches=[...remaining].filter(right=>right.materialId===left.materialId&&right.catalogId===left.catalogId&&right.designation===left.designation&&Math.abs(right.diameter-left.diameter)<1e-10&&Math.abs(right.area-left.area)<1e-12&&Math.hypot(...right.point.map((v,i)=>v-left.point[i]))<1e-9);
   if(matches.length!==1)return no('JOINT_THROUGH_BAR_MATCH_REQUIRED');
   const right=matches[0];remaining.delete(right);pairs.push({axis,a:left,b:right});
   const minimumRatio=left.fy<=400?20:25,required=minimumRatio*left.diameter,ratio=required/h;
   checks.push({axis,memberId:left.memberId,barIndex:left.barIndex,fy:left.fy,diameter:left.diameter,columnDepth:h,minimumRatio,requiredDepth:required,ratio,status:ratio<=1+1e-10?'OK':'NG',units:{length:'m',stress:'MPa'}});
  }
 }
 const ratio=Math.max(...checks.map(c=>c.ratio));
 return {...base,status:ratio<=1+1e-10?'OK':'NG',ratio,reason:ratio>1+1e-10?'JOINT_THROUGH_COLUMN_DEPTH_INSUFFICIENT':null,continuityVerified:true,pairs,checks};
}
