import {evaluateProvidedKdsShear} from './kdsShear.js';
import {computeSectionProperties} from '../../materials/sectionProperties.js';
import {memberAxes} from '../../core/memberAxes.js';
import {sectionOf} from '../../core/catalogs.js';
import {requiresOffsetAwareDesign} from '../../core/memberDesignGeometry.js';
import {resolveSectionRecord} from '../../materials/registry.js';
import {selectNativeSectionProfile} from '../../metadata/nativeSectionProfile.js';
import {memberForceFromRecovery} from '../../solver/memberForceField.js';
import {evaluateProvidedMember} from './providedMember.js';
import {mergeLocatedCheck} from '../evaluation/locationCoverage.js';
import {reinforcementRegionsAt} from './reinforcementRegions.js';
const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9*Math.max(Math.abs(a),Math.abs(b),1e-12);
const checkIds=['rc-section-strength','rc-shear-y','rc-shear-z'];
export function evaluateSegmentedRcStrength(...args){return evaluateSegmentedRcChecks(...args)['rc-section-strength'];}
export function evaluateSegmentedRcChecks(model,member,details,source,tuples){
 const nc=reason=>Object.fromEntries(checkIds.map(id=>[id,{status:'NOT_CHECKED',ratio:null,reason,sectionProfileEvaluation:false,designTransferAllowed:false}]));
 const profile=selectNativeSectionProfile(source),input=member.taper;
 if(input?.profile!=='segments'||profile?.profile!=='segments'||!/^[a-f0-9]{24}$/.test(profile.hash||'')||!Array.isArray(profile.segments)||!profile.segments.length||profile.segments.length>16||requiresOffsetAwareDesign(member))return nc('SEGMENTED_RC_STRENGTH_PROFILE_REQUIRED');
 if(model.designDetails?.splices?.some(s=>s.memberId===member.id))return nc('SEGMENTED_RC_SPLICE_MAPPING_REQUIRED');
 const ends=[member.n1,member.n2].map(id=>model.nodes.find(n=>n.id===id));
 if(!ends.every(Boolean))return nc('SEGMENTED_RC_GEOMETRY_REQUIRED');
 const L=Math.hypot(ends[0].x-ends[1].x,ends[0].y-ends[1].y,ends[0].z-ends[1].z),recovery=source.forceRecoveryInput;
 if(!(L>0)||!close(source.ax?.L,L)||!close(recovery?.L,L)||!['member-force-recovery-v1','member-force-recovery-v2-geometric'].includes(recovery?.version)||!Array.isArray(recovery.spanLoads)||recovery.spanLoads.length>100||!tuples.length||tuples.length>600)return nc('SEGMENTED_RC_FORCE_SOURCE_REQUIRED');
 const axes=memberAxes(ends[0],ends[1],member.localAxis);
 if(['x','y','z'].some(k=>!Array.isArray(source.ax[k])||source.ax[k].length!==3||source.ax[k].some((v,i)=>!Number.isFinite(v)||Math.abs(v-axes[k][i])>1e-9)))return nc('SEGMENTED_RC_FORCE_AXES_MISMATCH');
 const declared=(input.segments||[]).map((r,i,a)=>({start:Number(r.start??r.xi0??i/a.length),end:Number(r.end??r.xi1??(i+1)/a.length),sectionId:r.sectionId||r.secId})).sort((a,b)=>a.start-b.start);
 const segments=profile.segments;
 if(declared.length!==segments.length||profile.sectionIdI!==member.secId)return nc('SEGMENTED_RC_SECTION_SOURCE_MISMATCH');
 for(let i=0;i<segments.length;i++){
  const r=segments[i],d=declared[i],record=resolveSectionRecord(model,r.sectionId);
  if(!record||!['RECT','SQUARE'].includes(record.shape)||r.start!==d.start||r.end!==d.end||r.sectionId!==d.sectionId||r.end<=r.start||r.start<0||r.end>1||i===0&&r.start!==0||i===segments.length-1&&r.end!==1||i>0&&r.start!==segments[i-1].end)return nc('SEGMENTED_RC_SECTION_SOURCE_MISMATCH');
  const physical=sectionOf(model,r.sectionId),geometry=computeSectionProperties(record.shape,record.params);
  // Legacy catalogues round the Saint-Venant J; section resistance uses geometric A/I.
  // Still require the native J to match the actual analysis section below.
  if(!geometry||['A','Iy','Iz'].some(k=>!close(physical[k],geometry[k])))return nc('SEGMENTED_RC_PHYSICAL_SECTION_REQUIRED');
  if(['A','Iy','Iz','J'].some(k=>!close(r.section?.[k],physical[k])))return nc('SEGMENTED_RC_SECTION_SOURCE_MISMATCH');
 }
 try{for(const t of tuples){const force=memberForceFromRecovery(recovery,t.x,t.side||'point');for(const key of ['N','Vy','Vz','T','My','Mz']){const v=force[key==='T'?'Tq':key];if(!Number.isFinite(t[key])||!Number.isFinite(v)||Math.abs(t[key]-v)>1e-8*Math.max(1,Math.abs(v),Math.abs(t[key])))return nc('SEGMENTED_RC_FORCE_RECOVERY_MISMATCH');}}}catch{return nc('SEGMENTED_RC_FORCE_SOURCE_REQUIRED');}
 const points=new Map(),boundary=new Set(segments.slice(1).map(r=>r.start*L));
 for(const t of tuples){if(!Number.isFinite(t.x)||t.x<0||t.x>L||!['point','left','right'].includes(t.side||'point'))return nc('SEGMENTED_RC_STATION_REQUIRED');if((t.side||'point')==='point'&&boundary.has(t.x))continue;points.set(`${t.x}:${t.side||'point'}`,t);}
 for(const x of boundary)for(const side of ['left','right'])points.set(`${x}:${side}`,{...tuples[0],x,side});
 if(points.size>600)return nc('SEGMENTED_RC_STATION_LIMIT');
 const outputs=Object.fromEntries(checkIds.map(id=>[id,{segmentChecks:segments.map(r=>({start:r.start,end:r.end,sectionId:r.sectionId,check:null,locations:[],locationCount:0})),result:null}]));
 const sectionTransitions=segments.slice(1).flatMap((r,i)=>{const a=resolveSectionRecord(model,segments[i].sectionId),b=resolveSectionRecord(model,r.sectionId);return a.params.B===b.params.B&&(a.params.H||a.params.B)===(b.params.H||b.params.B)?[]:[{x:r.start*L,leftSectionId:segments[i].sectionId,rightSectionId:r.sectionId}];});
 try{
  for(const tuple of points.values()){
   const index=segments.findIndex(r=>tuple.x>=r.start*L&&(tuple.x<r.end*L||tuple.x===r.end*L&&(tuple.side==='left'||r.end===1)));
   if(index<0)return nc('SEGMENTED_RC_STATION_REQUIRED');
   const section=resolveSectionRecord(model,segments[index].sectionId),B=section.params.B/1000,H=(section.params.H||section.params.B)/1000;
   const matching=reinforcementRegionsAt(details,tuple.x/L,tuple.side||'point');
   const force=memberForceFromRecovery(recovery,tuple.x,tuple.side||'point'),demand={...tuple,signConvention:'solver-native',axes:'member-local',N:force.N,Vy:force.Vy,Vz:force.Vz,T:force.Tq,My:force.My,Mz:force.Mz};
   if(![demand.N,demand.Vy,demand.Vz,demand.T,demand.My,demand.Mz].every(Number.isFinite))return nc('SEGMENTED_RC_FORCE_SOURCE_REQUIRED');
   let checks;
   if(matching.length!==1||matching[0].bars.some(b=>!Number.isFinite(b.diameter)||Math.abs(b.y)+b.diameter/2>H/2||Math.abs(b.z)+b.diameter/2>B/2))checks=Object.fromEntries(checkIds.map(id=>[id,{status:'NOT_CHECKED',reason:'SEGMENTED_RC_BAR_SECTION_MAPPING_REQUIRED',ratio:null}]));
   else {
    const localMember={...member,secId:segments[index].sectionId,taper:undefined};
    checks={...evaluateProvidedMember(model,localMember,details,[demand]),...evaluateProvidedKdsShear(model,localMember,details,[demand])};
   }
   for(const id of checkIds){
    const check={...(checks[id]||{status:'NOT_CHECKED',reason:'SEGMENTED_RC_CHECK_INPUT_REQUIRED',ratio:null}),concurrentDemand:demand,sectionId:segments[index].sectionId};
    const output=outputs[id],row=output.segmentChecks[index];row.check=mergeLocatedCheck(row.check,check);row.locationCount++;if(row.locations.length<12)row.locations.push({x:tuple.x,side:tuple.side||'point'});
    output.result=mergeLocatedCheck(output.result,check);
   }
  }
 }catch(error){return nc(error.code||error.message||'SEGMENTED_RC_STRENGTH_FAILED');}
 const results={};
 for(const id of checkIds){
  const {result,segmentChecks}=outputs[id];
  if(segmentChecks.some(r=>!r.check))return nc('SEGMENTED_RC_UNVISITED_SECTION');
  results[id]={...result,sectionProfileEvaluation:true,profileHash:profile.hash,segmentChecks,designTransferAllowed:false,scope:'recorded stations and both section-boundary sides; global stability and detailing separate'};
  if(id.startsWith('rc-shear-')){
   results[id].sectionTransitions=sectionTransitions;
   if(sectionTransitions.length){
    // Local prismatic resistance is evidence, not qualification of a geometric discontinuity.
    results[id]={...results[id],status:['NG','FAILED'].includes(result.status)?result.status:'NOT_CHECKED',reason:'SECTION_TRANSITION_SHEAR_REVIEW_REQUIRED',incomplete:true,localSectionStatus:result.status,scope:'local prismatic section resistance only; section-transition disturbed regions require separate review'};
   }
  }
 }
 return results;
}
