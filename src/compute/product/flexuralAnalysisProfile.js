import {stableHash} from '../../core/stableHash.js';
import {workflowModelInput} from '../../core/workflowIdentity.js';
import {sectionOf} from '../../core/catalogs.js';
import {invertPositiveMatrix} from '../../solver/coupledFrameFlexibility.js';

export const FLEXURAL_ANALYSIS_PROFILE_VERSION='p25-flexural-profile-v3-initial-deformation';
// Private analysis projection. Profiles are explicit SI inertias; this adapter
// does not choose a cracking law, grant code compliance or edit physical details.
export function prepareFlexuralAnalysisModel(source,{sourceModelHash,profiles}={}){
 if(!Array.isArray(profiles)||!profiles.length||profiles.length>1000)throw Error('FLEXURAL_PROFILE_REQUIRED');
 if(stableHash(workflowModelInput(source))!==sourceModelHash)throw Error('STALE_FLEXURAL_PROFILE');
 const ids=new Set(),validated=[];
 for(const profile of profiles){
  if(ids.has(profile.memberId))throw Error('DUPLICATE_FLEXURAL_PROFILE');
  ids.add(profile.memberId);
  const member=source.members?.find(m=>m.id===profile.memberId);
  if(!member||member.taper||member.customProps||['truss','tensionOnly','compressionOnly'].includes(member.behavior||member.type))throw Error('FLEXURAL_PROFILE_MEMBER_CONFLICT');
  const section=sectionOf(source,member.secId),segments=profile.segments;
  if(section.Iyz&&Math.abs(section.Iyz)>1e-12*Math.sqrt(section.Iy*section.Iz))throw Error('FLEXURAL_PROFILE_COUPLED_SECTION');
  if(!Array.isArray(segments)||!segments.length||segments.length>100)throw Error('FLEXURAL_PROFILE_COVERAGE');
  let end=0;
  for(const row of segments){
   if(row.initialGeneralizedStrain!=null&&(!row.axialBendingFlexibility||!Array.isArray(row.initialGeneralizedStrain)||row.initialGeneralizedStrain.length!==3||!row.initialGeneralizedStrain.every(Number.isFinite)))throw Error('FLEXURAL_PROFILE_INITIAL_STRAIN');
   if(![row.start,row.end].every(Number.isFinite)||row.start!==end||row.end<=row.start||row.end>1)throw Error('FLEXURAL_PROFILE_COVERAGE');
   if(row.axialBendingFlexibility!=null){
    if(row.Iy!=null||row.Iz!=null||!invertPositiveMatrix(row.axialBendingFlexibility,3))throw Error('FLEXURAL_PROFILE_COMPLIANCE');
   }else if(![row.Iy,row.Iz].every(v=>Number.isFinite(v)&&v>0)||row.Iy>section.Iy||row.Iz>section.Iz)throw Error('FLEXURAL_PROFILE_INERTIA');
   end=row.end;
  }
  if(end!==1)throw Error('FLEXURAL_PROFILE_COVERAGE');
  validated.push({memberId:member.id,section,segments:segments.map(snapshotFlexuralSegment)});
 }
 validated.sort((a,b)=>String(a.memberId).localeCompare(String(b.memberId)));
 const profileHash=stableHash({version:FLEXURAL_ANALYSIS_PROFILE_VERSION,sourceModelHash,profiles:validated.map(({memberId,segments})=>({memberId,segments}))});
 const model=structuredClone(source);
 model.sections||=[];
 const reserved=new Set([...(model.sections||[]),...(model.globalSections||[]),...(model.officeSections||[])].map(s=>s.id));
 for(const [i,{memberId,section,segments}] of validated.entries()){
  const member=model.members.find(m=>m.id===memberId);
  member.taper={profile:'segments',gaussPoints:5,segments:segments.map((row,j)=>{
   const id=`p25-flexural-${profileHash}-${i}-${j}`;
   if(reserved.has(id))throw Error('FLEXURAL_PROFILE_SECTION_COLLISION');
   reserved.add(id);
   // Fresh direct record: no parametric contract or stale principal/radius data.
   const properties=Object.fromEntries(['A','Ay','Az','J','Zy','Zz'].filter(k=>Number.isFinite(section[k])).map(k=>[k,section[k]]));
   properties.Iy=row.Iy??section.Iy;properties.Iz=row.Iz??section.Iz;
   if(row.axialBendingFlexibility)properties.axialBendingFlexibility=structuredClone(row.axialBendingFlexibility);
   if(row.initialGeneralizedStrain)properties.initialGeneralizedStrain=[...row.initialGeneralizedStrain];
   const dimensions={};
   for(const key of ['H','B']){const value=section[key]??(Number.isFinite(section.params?.[key])?section.params[key]/1000:null);if(Number.isFinite(value)&&value>0)dimensions[key]=value;}
   model.sections.push({id,version:1,name:`Analysis stiffness ${memberId} ${j+1}`,kind:'direct',shape:'GENERAL',...dimensions,properties,source:{scope:'project',analysisOnly:true,sourceModelHash,profileHash,memberId,physicalSectionId:member.secId}});
   return {start:row.start,end:row.end,sectionId:id};
  })};
 }
 return {version:FLEXURAL_ANALYSIS_PROFILE_VERSION,sourceModelHash,profileHash,model,memberIds:validated.map(r=>r.memberId),designTransferAllowed:false,scope:'explicit-flexural-inertias-or-coupled-axial-bending-compliance; gross-shear-torsion-and-mass; cracking-policy-owned-by-caller'};
}
export function snapshotFlexuralSegment({start,end,Iy,Iz,axialBendingFlexibility,initialGeneralizedStrain}){
 return axialBendingFlexibility?{start,end,axialBendingFlexibility:structuredClone(axialBendingFlexibility),...(initialGeneralizedStrain?{initialGeneralizedStrain:[...initialGeneralizedStrain]}:{})}:{start,end,Iy,Iz};
}
