import {requiresOffsetAwareDesign} from '../../core/memberDesignGeometry.js';
import {deriveJointProbableForces} from './jointProbableForces.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
import {memberAxes} from '../../core/memberAxes.js';
export function kdsJointShear({fck,area,confinement,demand}) {
 const codeReferences=getKcscRuleSources(['142080','142010']).map(x=>({...x,clause:x.id==='142080'?'1.5 Aj; 4.6.1(1),(2); 4.6.3(1)':'4.2.3(2)'}));
 const base={codeReferences,qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 if(![fck,area,demand].every(Number.isFinite)||fck<=0||area<=0||demand<0||!['four','three-or-opposite-two','other'].includes(confinement))return {...base,status:'NOT_CHECKED',ratio:null,reason:'JOINT_SHEAR_INPUT_REQUIRED'};
 const coefficient={four:1.7,'three-or-opposite-two':1.25,other:1}[confinement],nominal=coefficient*Math.sqrt(fck)*area*1000,capacity=0.75*nominal;
 return {...base,status:demand>capacity?'NG':'OK',ratio:demand/capacity,demand,capacity,nominalCapacity:nominal,coefficient,phi:0.75,area,unit:'kN'};
}
export function evaluateProvidedJointShear(model,joint,set,probableInput) {
 const nc=reason=>({status:'NOT_CHECKED',ratio:null,reason,codeReferences:getKcscRuleSources(['142080']).map(r=>({...r,clause:'1.5 Aj; 4.6.1; 4.6.3'}))});
 if(joint.jointDesignStandard!=='KDS-142080-2021-special-frame')return nc('JOINT_DESIGN_SYSTEM_REQUIRED');
 if(joint.restraint!=='rigid')return nc('RIGID_JOINT_REQUIRED');
 const connected=(joint.memberIds||[]).map(id=>model.members.find(m=>m.id===id));
 if(!model.nodes.some(n=>n.id===joint.nodeId)||!connected.length||connected.some(m=>!m||![m.n1,m.n2].includes(joint.nodeId)))return nc('JOINT_MEMBER_CONNECTIVITY_REQUIRED');
 if(connected.some(m=>m.taper))return nc('JOINT_PRISMATIC_MEMBERS_REQUIRED');
 if(connected.some(m=>requiresOffsetAwareDesign(m)))return nc('CENTERED_JOINT_GEOMETRY_REQUIRED');
 const derived=joint.capacityDemandBasis==='derived-1.25fy-no-column-shear-credit'?(probableInput||deriveJointProbableForces(model,joint)):null;
 if(derived&&derived.status!=='OK')return nc(derived.reason);
 if(!derived&&(joint.capacityDemandBasis!=='1.25fy-capacity-design'||!joint.capacityDemandReference||![joint.capacityDesignShearX,joint.capacityDesignShearY].every(x=>Number.isFinite(x)&&x>=0)))return nc('PROBABLE_STRENGTH_JOINT_DEMAND_REQUIRED');
 const demandX=derived?derived.axes.X:joint.capacityDesignShearX,demandY=derived?derived.axes.Y:joint.capacityDesignShearY;
 if(joint.concreteWeight!=='normal')return nc('NORMAL_CONCRETE_JOINT_REQUIRED');
 const column=model.members.find(x=>x.id===joint.columnMemberId&&joint.memberIds.includes(x.id));
 if(!column)return nc('JOINT_COLUMN_REFERENCE_REQUIRED');
 function geometry(member) {
  const section=resolveSectionRecord(model,member.secId),a=model.nodes.find(n=>n.id===member.n1),b=model.nodes.find(n=>n.id===member.n2);
  if(!['RECT','SQUARE'].includes(section?.shape)||!a||!b||set?.memberResults?.[member.id]?.offset?.applied)return null;
  const axes=memberAxes(a,b,member.localAxis),B=section.params.B/1000,H=(section.params.H||section.params.B)/1000;
  if(!['x','y','z'].every(key=>axes[key].some(value=>Math.abs(value)>1-1e-8)))return null;
  const projected=k=>Math.abs(axes.y[k])*H+Math.abs(axes.z[k])*B;
  return {axes,projected,a,b};
 }
 const cg=geometry(column);if(!cg||Math.abs(cg.axes.x[2])<1-1e-8)return nc('VERTICAL_RECTANGULAR_COLUMN_REQUIRED');
 const beams=[];
 for(const member of model.members.filter(x=>joint.memberIds.includes(x.id)&&x.id!==column.id)) {
  const g=geometry(member);if(!g)return nc('JOINT_GEOMETRY_MAPPING_REQUIRED');
  if(Math.abs(g.axes.x[2])>1-1e-8){if([0,1].some(k=>Math.abs(g.projected(k)-cg.projected(k))>1e-8))return nc('JOINT_COLUMN_TRANSITION_REQUIRED');continue;}
  const axis=Math.abs(g.axes.x[0])>1-1e-8?0:Math.abs(g.axes.x[1])>1-1e-8?1:null;
  if(axis===null)return nc('ORTHOGONAL_JOINT_REQUIRED');
  const other=member.n1===joint.nodeId?g.b:g.a,node=model.nodes.find(x=>x.id===joint.nodeId),sign=Math.sign(axis===0?other.x-node.x:other.y-node.y);
  beams.push({axis,sign,width:g.projected(1-axis),height:g.projected(2)});
 }
 if(!beams.length)return nc('JOINT_BEAMS_REQUIRED');
 const maxDepth=Math.max(...beams.map(x=>x.height)),faces=new Set(beams.filter(x=>Math.min(1,x.width/cg.projected(1-x.axis))*Math.min(1,x.height/maxDepth)>=0.75).map(x=>`${x.axis}:${x.sign}`));
 const opposite=[0,1].some(axis=>faces.has(`${axis}:-1`)&&faces.has(`${axis}:1`));
 const confinement=faces.size===4?'four':faces.size>=3||opposite?'three-or-opposite-two':'other';
 const fck=resolveMaterialRecord(model,joint.jointMaterialId)?.strength?.concrete?.fck,rows=[];
 if(!Number.isFinite(fck)||fck<=0)return nc('JOINT_CONCRETE_REFERENCE_REQUIRED');
 for(const axis of [0,1]) {
  const relevant=beams.filter(x=>x.axis===axis),demand=axis===0?demandX:demandY;
  if(!relevant.length){if(demand>0)return nc('JOINT_DEMAND_WITHOUT_BEAM_PLANE');continue;}
  const columnWidth=cg.projected(1-axis),columnDepth=cg.projected(axis),beamWidth=Math.min(...relevant.map(x=>x.width));
  const effectiveWidth=Math.min(columnWidth,beamWidth+columnDepth);
  rows.push({...kdsJointShear({fck,area:effectiveWidth*columnDepth,confinement,demand}),axis:axis===0?'X':'Y',effectiveWidth,columnDepth});
 }
 const worst=rows.reduce((a,b)=>!a||(b.ratio??Infinity)>(a.ratio??Infinity)?b:a,null);
 return worst?{...worst,...(derived?{probableForces:derived,methodReviewRequired:true}:{}),axes:rows,confinement,capacityDemandBasis:joint.capacityDemandBasis,capacityDemandReference:joint.capacityDemandReference,demandQualification:'explicit-capacity-design-input-independent-review-pending',scope:'centered-orthogonal-normal-concrete-special-moment-frame-joint'}:nc('JOINT_PLANE_REQUIRED');
}
