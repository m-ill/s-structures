import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
import {sectionOf} from '../../core/catalogs.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {KDS_SECOND_ORDER_STIFFNESS_VERSION} from '../../metadata/rcServicePolicy.js';
export {KDS_SECOND_ORDER_STIFFNESS_VERSION} from '../../metadata/rcServicePolicy.js';
// Numerical profile construction, never a mutation of physical section dimensions.
export function prepareKdsSecondOrderProfiles(model){
 const latest=new Map();
 for(const d of model.designDetails?.reinforcement||[])if(!latest.has(d.id)||latest.get(d.id).version<d.version)latest.set(d.id,d);
 const profiles=[],members=[];
 for(const member of model.members||[]){
  if(resolveMaterialRecord(model,member.matId)?.kind!=='concrete')continue;
  if(member.type!=='frame'||member.taper!=null||!['RECT','SQUARE'].includes(resolveSectionRecord(model,member.secId)?.shape))throw Error('KDS_SECOND_ORDER_PRISMATIC_RC_FRAME_REQUIRED');
  if(model.designDetails?.splices?.some(s=>s.memberId===member.id))throw Error('KDS_SECOND_ORDER_SPLICE_STIFFNESS_REQUIRED');
  const rows=[...latest.values()].filter(d=>d.memberId===member.id).sort((a,b)=>a.start-b.start),d=rows[0];
  if(!d||rows[0].start!==0||rows.at(-1).end!==1||rows.some((r,i)=>!(r.end>r.start)||i&&r.start!==rows[i-1].end))throw Error('KDS_SECOND_ORDER_DETAIL_COVERAGE_REQUIRED');
  if(rows.some(r=>r.secondOrderStiffnessStandard!=='KDS-142020-2022'||!['flexural-member','compression-member'].includes(r.memberRole)||r.memberRole!==d.memberRole))throw Error('KDS_SECOND_ORDER_ROLE_AND_STANDARD_REQUIRED');
  const column=d.memberRole==='compression-member';
  if(column&&rows.some(r=>!Number.isFinite(r.lateralSustainedRatio)||r.lateralSustainedRatio<0||r.lateralSustainedRatio>1||!r.lateralSustainedReference?.trim()||r.lateralSustainedRatio!==d.lateralSustainedRatio))throw Error('KDS_LATERAL_SUSTAINED_BASIS_REQUIRED');
  const factor=column?.7/(1+d.lateralSustainedRatio):.35,gross=sectionOf(model,member.secId);
  if(![gross.Iy,gross.Iz].every(v=>Number.isFinite(v)&&v>0))throw Error('KDS_SECOND_ORDER_GROSS_INERTIA_REQUIRED');
  profiles.push({memberId:member.id,segments:[{start:0,end:1,Iy:gross.Iy*factor,Iz:gross.Iz*factor}]});
  members.push({memberId:member.id,memberRole:d.memberRole,physicalSectionId:member.secId,grossIy:gross.Iy,grossIz:gross.Iz,inertiaFactor:factor,axialAreaFactor:1,lateralSustainedRatio:column?d.lateralSustainedRatio:null,detailSources:rows.map(r=>({id:r.id,version:r.version,reference:column?r.lateralSustainedReference:null})),localMagnifierApplied:false});
 }
 if(!profiles.length)throw Error('KDS_SECOND_ORDER_RC_MEMBERS_REQUIRED');
 return {version:KDS_SECOND_ORDER_STIFFNESS_VERSION,profiles,members,codeReferences:getKcscRuleSources(['142020']).map(r=>({...r,clause:'4.4.4(1),(2),(3)',applicationScope:'specified elastic second-order inertia factors only'})),globalMethodQualified:false,designTransferAllowed:false};
}
