import {requiresOffsetAwareDesign} from '../../core/memberDesignGeometry.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
import {memberAxes} from '../../core/memberAxes.js';
import {reinforcementRegionsAt} from '../rc/reinforcementRegions.js';
export function deriveJointProbableForces(model,joint){
 const base={codeReferences:getKcscRuleSources(['142080']).map(r=>({...r,clause:'4.6.1(1)'})),qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(joint.jointDesignStandard!=='KDS-142080-2021-special-frame'||joint.capacityDemandBasis!=='derived-1.25fy-no-column-shear-credit'||joint.capacityBeamScope!=='rectangular-no-slab-participation')return nc('DERIVED_JOINT_PROBABLE_FORCE_SCOPE_REQUIRED');
 if(model.shells?.length)return nc('SLAB_PARTICIPATION_REQUIRES_JOINT_FORCE_MODEL');
 const connected=Array.isArray(joint.memberIds)?joint.memberIds.map(id=>model.members.find(m=>m.id===id)):[];
 if(!model.nodes.some(n=>n.id===joint.nodeId)||!connected.length||new Set(joint.memberIds).size!==connected.length||connected.some(m=>!m||![m.n1,m.n2].includes(joint.nodeId)))return nc('JOINT_MEMBER_CONNECTIVITY_REQUIRED');
 if(connected.some(m=>m.taper!=null))return nc('JOINT_PRISMATIC_MEMBERS_REQUIRED');
 const latest=new Map();for(const r of model.designDetails?.reinforcement||[])if(!latest.has(r.id)||latest.get(r.id).version<r.version)latest.set(r.id,r);
 const members=[],axes={X:0,Y:0};
 for(const m of connected){
  const nodes=[m.n1,m.n2].map(id=>model.nodes.find(n=>n.id===id));if(!nodes.every(Boolean))return nc('JOINT_MEMBER_GEOMETRY_REQUIRED');
  const a=memberAxes(nodes[0],nodes[1],m.localAxis);if(Math.abs(a.x[2])>1-1e-9)continue;
  const axis=Math.abs(a.x[0])>1-1e-9?'X':Math.abs(a.x[1])>1-1e-9?'Y':null,s=resolveSectionRecord(model,m.secId);
  if(!axis||!['RECT','SQUARE'].includes(s?.shape)||requiresOffsetAwareDesign(m)||m.releases?.spring)return nc('CENTERED_ORTHOGONAL_BEAM_PROBABLE_FORCE_REQUIRED');
  const selected=reinforcementRegionsAt([...latest.values()].filter(r=>r.memberId===m.id),m.n1===joint.nodeId?0:1),d=selected[0];
  if(selected.length!==1||d.reinforcementForm!=='single-deformed')return nc('JOINT_BEAM_END_REINFORCEMENT_REQUIRED');
  const fy=resolveMaterialRecord(model,d.barMaterialId)?.strength?.steel?.Fy;
  if(!(fy>0&&fy<=600))return nc('JOINT_BEAM_REBAR_STRENGTH_REQUIRED');
  const area=sign=>d.bars.filter(b=>sign*(a.y[2]*b.y+a.z[2]*b.z)>1e-10).reduce((sum,b)=>sum+b.area,0),topArea=area(1),bottomArea=area(-1);
  if(!(topArea>0&&bottomArea>0))return nc('JOINT_BEAM_BOTH_FACE_BARS_REQUIRED');
  const topForce=1.25*fy*topArea*1000,bottomForce=1.25*fy*bottomArea*1000,envelopeForce=Math.max(topForce,bottomForce);
  members.push({memberId:m.id,detailId:d.id,detailVersion:d.version,axis,fy,topArea,bottomArea,topForce,bottomForce,envelopeForce});axes[axis]+=envelopeForce;
 }
 if(!members.length)return nc('JOINT_BEAMS_REQUIRED');
 return {...base,status:'OK',ratio:null,members,axes,stressMultiplier:1.25,units:{force:'kN',area:'m2',fy:'MPa'},panelDemandMethod:{id:'sum-beam-face-envelopes-no-column-shear-credit',methodReviewRequired:true,reason:'column-shear sign and slab participation require independent method review'},scope:'computed beam longitudinal forces; panel demand bound separately qualified'};
}
