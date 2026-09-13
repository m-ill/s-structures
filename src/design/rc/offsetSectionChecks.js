import {sectionOf} from '../../core/catalogs.js';
import {resolveMemberOffsetKinematics,MEMBER_OFFSET_VERSION} from '../../solver/memberOffsets.js';
import {memberForceFromRecovery} from '../../solver/memberForceField.js';
import {evaluateProvidedMember} from './providedMember.js';
import {evaluateProvidedKdsShear} from './kdsShear.js';
import {mergeLocatedCheck} from '../evaluation/locationCoverage.js';
const ids=['rc-section-strength','rc-shear-y','rc-shear-z'];
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
// Reinforcement intervals use gross member x/L. Native forces use the flexible start.
// This maps parallel member axes; it does not rotate reinforcement or design rigid arms.
export function evaluateOffsetRcChecks(model,member,details,source,tuples){
 const nc=reason=>({mapping:{status:'NOT_CHECKED',reason,designStationMapped:false},checks:{},mappedDemands:[]});
 if(member.taper!=null||member.offsets||model.designDetails?.splices?.some(s=>s.memberId===member.id))return nc('OFFSET_SECTION_OR_SPLICE_MAPPING_REQUIRED');
 const nodes=[member.n1,member.n2].map(id=>model.nodes.find(n=>n.id===id));
 if(!nodes.every(Boolean))return nc('OFFSET_DESIGN_GEOMETRY_REQUIRED');
 const geometry=resolveMemberOffsetKinematics(member,...nodes,sectionOf(model,member.secId));
 if(!geometry.ok||!geometry.applied)return nc('OFFSET_DESIGN_GEOMETRY_REQUIRED');
 const {ax,grossAxes,vectors}=geometry,trace=source?.offset,recovery=source?.forceRecoveryInput;
 if(['x','y','z'].some(k=>ax[k].some((v,i)=>!near(v,grossAxes[k][i]))))return nc('OFFSET_ROTATED_SECTION_MAPPING_REQUIRED');
 const startOffset=vectors.global.i.reduce((sum,v,i)=>sum+v*grossAxes.x[i],0),endStation=startOffset+ax.L;
 if(startOffset<0||endStation>grossAxes.L||!(ax.L>0))return nc('OFFSET_OUTSIDE_GROSS_MEMBER_MAPPING_REQUIRED');
 if(trace?.version!==MEMBER_OFFSET_VERSION||trace.applied!==true||!near(trace.flexibleLength,ax.L)||!near(trace.grossLength,grossAxes.L)||!near(source.ax?.L,ax.L)||trace.insertionPoint!==geometry.insertionPoint||trace.frame!==geometry.frame)return nc('OFFSET_ANALYSIS_GEOMETRY_MISMATCH');
 for(const frame of ['global','local'])for(const end of ['i','j'])if(!Array.isArray(trace.vectors?.[frame]?.[end])||trace.vectors[frame][end].length!==3||trace.vectors[frame][end].some((v,i)=>!near(v,vectors[frame][end][i])))return nc('OFFSET_ANALYSIS_GEOMETRY_MISMATCH');
 if(['x','y','z'].some(k=>!Array.isArray(source.ax[k])||source.ax[k].length!==3||source.ax[k].some((v,i)=>!near(v,ax[k][i]))))return nc('OFFSET_ANALYSIS_AXES_MISMATCH');
 if(!near(recovery?.L,ax.L)||!['member-force-recovery-v1','member-force-recovery-v2-geometric'].includes(recovery?.version)||!Array.isArray(recovery.spanLoads)||recovery.spanLoads.length>100||!Array.isArray(tuples)||!tuples.length||tuples.length>600||details.length>100)return nc('OFFSET_FORCE_SOURCE_REQUIRED');
 const forceAt=(x,side)=>{const f=memberForceFromRecovery(recovery,x,side);return {N:f.N,Vy:f.Vy,Vz:f.Vz,T:f.Tq,My:f.My,Mz:f.Mz};};
 const points=new Map(),boundaries=new Set();
 for(const detail of details)for(const fraction of [detail.start,detail.end]){
  if(!Number.isFinite(fraction)||fraction<0||fraction>1)return nc('OFFSET_REINFORCEMENT_REGION_REQUIRED');
  const x=fraction*grossAxes.L;if(x>startOffset&&x<endStation)boundaries.add(x);
 }
 try{
  for(const t of tuples){
   if(!Number.isFinite(t.x)||t.x<0||t.x>ax.L||!['point','left','right'].includes(t.side||'point'))return nc('OFFSET_FORCE_STATION_REQUIRED');
   const force=forceAt(t.x,t.side||'point');
   if(Object.keys(force).some(k=>!near(force[k],t[k])))return nc('OFFSET_FORCE_RECOVERY_MISMATCH');
   const x=t.x+startOffset;
   if((t.side||'point')==='point'&&boundaries.has(x))continue;
   points.set(`${x}:${t.side||'point'}`,{...t,...force,x,analysisX:t.x,side:t.side||'point',signConvention:'solver-native',axes:'member-local',designStationMapped:true});
  }
  for(const x of boundaries)for(const side of ['left','right']){
   const analysisX=x-startOffset;points.set(`${x}:${side}`,{...tuples[0],...forceAt(analysisX,side),x,analysisX,side,signConvention:'solver-native',axes:'member-local',designStationMapped:true});
  }
 }catch{return nc('OFFSET_FORCE_RECOVERY_REQUIRED');}
 if(points.size>600)return nc('OFFSET_DESIGN_STATION_LIMIT');
 const mapping={status:'MAPPED_FOR_LOCAL_SECTION_CHECKS',reason:null,designStationMapped:true,startOffset,flexibleLength:ax.L,grossLength:grossAxes.L,reviewedRange:{start:startOffset,end:endStation},sourceStationCount:tuples.length,mappedStationCount:points.size,units:{length:'m'},equation:'x_design = x_analysis + startOffset',rigidRegionsReviewed:false};
 const hasUnreviewedRigidRegions=startOffset>0||endStation<grossAxes.L;
 const checks={},localChecks=Object.fromEntries(ids.map(id=>[id,[]])),mappedDemands=[...points.values()];
 try{for(const tuple of mappedDemands){
  const local={...evaluateProvidedMember(model,member,details,[tuple]),...evaluateProvidedKdsShear(model,member,details,[tuple],undefined,{clearLength:ax.L})};
  for(const id of ids){const check=local[id]||{status:'NOT_CHECKED',reason:'OFFSET_LOCAL_SECTION_INPUT_REQUIRED',ratio:null,concurrentDemand:tuple};checks[id]=mergeLocatedCheck(checks[id],check);if(localChecks[id].length<12)localChecks[id].push(check);}
 }}catch{return nc('OFFSET_LOCAL_SECTION_EVALUATION_FAILED');}
 for(const id of ids)checks[id]={...checks[id],localSectionStatus:checks[id].status,status:hasUnreviewedRigidRegions&&!['NG','FAILED'].includes(checks[id].status)?'NOT_CHECKED':checks[id].status,reason:hasUnreviewedRigidRegions?'OFFSET_RIGID_REGION_DESIGN_REQUIRED':checks[id].reason,incomplete:hasUnreviewedRigidRegions||checks[id].incomplete,rigidRegionsReviewed:false,fullLongitudinalRangeReviewed:!hasUnreviewedRigidRegions,offsetSectionEvaluation:true,localChecks:localChecks[id],localChecksTruncated:mappedDemands.length>12,designTransferAllowed:false,scope:'verified flexible-region section resistance; rigid-end regions and global stability separate'};
 return {mapping,checks,mappedDemands};
}
