import {requiresOffsetAwareDesign} from '../../core/memberDesignGeometry.js';
import {memberAxes} from '../../core/memberAxes.js';
import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
import {reinforcementRegionsAt} from '../rc/reinforcementRegions.js';
import {evaluateKdsSection,kdsStressBlock} from '../rc/kdsStrength.js';
import {sectionCapacityAtAxial} from '../rc/providedSection.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {torsionSteelAllocation} from '../rc/torsionAllocation.js';
function latest(rows=[]){const m=new Map();for(const r of rows)if(!m.has(r.id)||r.version>m.get(r.id).version)m.set(r.id,r);return [...m.values()];}
export function jointStrengthBound(columns,beams){
 if(!columns.length||!beams.length||[...columns,...beams].some(pair=>pair.length!==2||pair.some(x=>!Number.isFinite(x)||x<=0)))return {status:'NOT_CHECKED',ratio:null,reason:'JOINT_STRENGTH_CAPACITIES_REQUIRED'};
 const columnLowerBound=columns.reduce((s,pair)=>s+Math.min(...pair),0),beamUpperBound=beams.reduce((s,pair)=>s+Math.max(...pair),0),ratio=1.2*beamUpperBound/columnLowerBound;
 return {status:ratio<=1+1e-10?'OK':'NG',ratio,columnLowerBound,beamUpperBound,factor:1.2,reason:ratio>1?'CONSERVATIVE_COLUMN_BEAM_BOUND_NOT_SATISFIED':null};
}
export function evaluateJointStrengthRelation(model,joint,set){
 const base={codeReferences:getKcscRuleSources(['142080','142020','142010']).map(r=>({...r,clause:r.id==='142080'?'4.5.2(2); Eq.4.5-1':r.id==='142020'?'4.1.1; 4.1.2':'4.2.3(2)'})),qualification:'conservative-sufficient-strength-bound-not-whole-design',designTransferAllowed:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(joint.jointStrengthMode!=='conservative-column-design-beam-nominal'||joint.jointDesignStandard!=='KDS-142080-2021-special-frame'||joint.capacityBeamScope!=='rectangular-no-slab-participation'||joint.restraint!=='rigid'||joint.concreteWeight!=='normal'||model.shells?.length)return nc('JOINT_STRENGTH_SCOPE_REQUIRED');
 const members=[];
 for(const id of joint.memberIds){
  const member=model.members?.find(m=>m.id===id),nodes=[member?.n1,member?.n2].map(id=>model.nodes?.find(n=>n.id===id));if(!nodes.every(Boolean))return nc('JOINT_STRENGTH_MEMBER_REQUIRED');
  if(member.taper!=null)return nc('JOINT_STRENGTH_PRISMATIC_MEMBERS_REQUIRED');
  if(requiresOffsetAwareDesign(member))return nc('JOINT_STRENGTH_CENTERED_MEMBERS_REQUIRED');
  const axes=memberAxes(...nodes,member.localAxis),column=Math.abs(axes.x[2])>1-1e-8;
  if(!column&&(Math.abs(axes.x[2])>1e-8||Math.max(Math.abs(axes.x[0]),Math.abs(axes.x[1]))<1-1e-8))return nc('JOINT_STRENGTH_ORTHOGONAL_FRAME_REQUIRED');
  const at=member.n1===joint.nodeId?0:member.n2===joint.nodeId?1:null;if(at===null)return nc('JOINT_STRENGTH_NODE_MISMATCH');
  const details=reinforcementRegionsAt(latest(model.designDetails?.reinforcement).filter(d=>d.memberId===id),at),d=details[0],section=resolveSectionRecord(model,member.secId),concrete=resolveMaterialRecord(model,member.matId),steel=resolveMaterialRecord(model,d?.barMaterialId),source=set?.memberResults?.[id];
  if(details.length!==1||d.strengthStandard!=='KDS-142020-2022'||!['RECT','SQUARE'].includes(section?.shape))return nc('JOINT_STRENGTH_PROVIDED_SECTION_REQUIRED');
  if(!source?.N?.length||source.N.length!==source.xs?.length||!Array.from(source.N).every(Number.isFinite)||!Array.from(source.xs).every(Number.isFinite))return nc('JOINT_COLUMN_CONCURRENT_AXIAL_REQUIRED');
  const xs=source.xs,sides=source.stationSides,tolerance=1e-8;
  if(!(axes.L>0)||!Number.isFinite(axes.L)||xs.length<2||xs.length>600||Math.abs(xs[0])>tolerance||Math.abs(xs.at(-1)-axes.L)>tolerance||
   (sides!==undefined&&(!Array.isArray(sides)||sides.length!==xs.length||sides.some(side=>!['point','left','right'].includes(side))))||
   Array.from(xs).some((x,i)=>x < -tolerance||x > axes.L+tolerance||i>0&&(x<xs[i-1]||x===xs[i-1]&&!(sides?.[i-1]==='left'&&sides[i]==='right'))))return nc('JOINT_AXIAL_STATION_GRID_INVALID');
  const axial=[...new Set(Array.from(source.N))];if(axial.length>16)return nc('JOINT_AXIAL_CAPACITY_SET_LIMIT');
  if(!column&&axial.some(n=>Math.abs(n)>1e-7))return nc('AXIAL_BEAM_STRENGTH_MAPPING_REQUIRED');
  const material={fc:concrete?.strength?.concrete?.fck,fy:steel?.strength?.steel?.Fy,Es:steel?.elastic?.E};
  if(![material.fc,material.fy,material.Es].every(x=>Number.isFinite(x)&&x>0)||material.fy>600||!kdsStressBlock(material.fc))return nc('JOINT_STRENGTH_MATERIAL_REQUIRED');
  let bars=d.bars;try{if(column)bars=torsionSteelAllocation(d).bars;}catch{return nc('TORSION_LONGITUDINAL_ALLOCATION_REQUIRED');}
  members.push({id,axes,column,bars,section:{B:section.params.B/1000,H:(section.params.H||section.params.B)/1000},material,axial});
 }
 const axesChecks=[];
 for(const axis of [0,1]){
  const beams=members.filter(m=>!m.column&&Math.abs(m.axes.x[axis])>1-1e-8),columns=members.filter(m=>m.column);if(!beams.length)continue;if(!columns.length)return nc('JOINT_COLUMN_STRENGTH_REQUIRED');
  const globalMoment=axis===0?[0,1,0]:[1,0,0],columnPairs=[],beamPairs=[],trace=[];
  for(const member of [...columns,...beams]){
   const dot=v=>v.reduce((sum,x,i)=>sum+x*globalMoment[i],0),pair=[];
   for(const sign of [-1,1]){
    const direction={My:sign*dot(member.axes.y),Mz:sign*dot(member.axes.z)},values=[];
    for(const N of member.column?member.axial:[0]){
     const result=member.column?evaluateKdsSection(member.section,member.bars,member.material,{N,...direction}):sectionCapacityAtAxial(member.section,member.bars,member.material,kdsStressBlock(member.material.fc),N,direction);
     if(!(result.capacity>0)||!Number.isFinite(result.capacity)||(member.column?!result.equilibrium:!result.ok))return nc('JOINT_SECTION_CAPACITY_UNRESOLVED');
     values.push(result.capacity);
    }
    pair.push(Math.min(...values));
   }
   (member.column?columnPairs:beamPairs).push(pair);trace.push({memberId:member.id,basis:member.column?'minimum-design-strength-over-supplied-axial-stations':'nominal-zero-axial-strength',negative:pair[0],positive:pair[1],axialValues:member.axial});
  }
  axesChecks.push({...jointStrengthBound(columnPairs,beamPairs),axis:axis===0?'X':'Y',members:trace});
 }
 if(!axesChecks.length)return nc('ORTHOGONAL_JOINT_BEAMS_REQUIRED');
 const worst=axesChecks.reduce((a,b)=>b.ratio>a.ratio?b:a);
 return {...base,...worst,axesChecks,scope:'column design-strength lower bound versus beam nominal-strength upper bound; both signs; no slab credit',methodReviewRequired:true};
}
