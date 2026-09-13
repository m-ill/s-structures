import {alternatingJointCrossTies} from './alternatingJointCrossTies.js';
import {spatialHoopSelfAssembly} from '../rc/spatialHoopSelfAssembly.js';
import {spatialHoopCrossTieAssembly} from '../rc/spatialHoopCrossTieAssembly.js';
import {crossTieGeometry} from '../rc/crossTieGeometry.js';
import {reinforcementRegionsAt} from '../rc/reinforcementRegions.js';
import {resolveSectionRecord} from '../../materials/registry.js';
import {outerHoopClosure} from '../rc/outerHoopClosure.js';
import {transverseReinforcementQuantity} from '../rc/transverseReinforcementQuantity.js';
import {jointHoopDistribution} from './jointHoopDistribution.js';
// One shared shape and a bounded position list; do not expand a path per hoop.
export function prepareJointHoopGeometry(model,joint){
 const hoops=jointHoopDistribution(joint),base={hoops,nominalQuantity:{status:'NOT_CHECKED',reason:'JOINT_HOOP_SHAPE_INPUT_REQUIRED'}};
 const column=model.members?.find(m=>m.id===joint.columnMemberId&&joint.memberIds?.includes(m.id)),section=resolveSectionRecord(model,column?.secId);
 if(!column||![column.n1,column.n2].includes(joint.nodeId)||joint.connectionType!=='rc-joint'||joint.jointHoopForm!=='closed-rectangular-two-leg'||joint.reinforcement?.legs!==2||joint.jointTieClosure!=='seismic-135'||!['RECT','SQUARE'].includes(section?.shape))return base;
 if(joint.jointCrossTiePattern!==undefined&&!['fixed-hook-side','alternating-hook-side'].includes(joint.jointCrossTiePattern))return {...base,nominalQuantity:{status:'NOT_CHECKED',reason:'JOINT_CROSS_TIE_PATTERN_REQUIRED'}};
 const B=section.params.B/1000,H=(section.params.H||section.params.B)/1000;
 const detail={cover:joint.jointCover,stirrups:joint.reinforcement,tieClosure:'standard-135',tieClosureCorner:joint.jointClosureCorner,tieClosureSeparation:joint.jointClosureSeparation,tieHookTail:joint.jointHookTail,tieBendInsideRadius:joint.jointBendInsideRadius};
 const crossTieDeclared=['jointCrossTieBarPairs','jointCrossTieHookSides','jointCrossTiePlaneOffsets','jointCrossTiePattern'].some(k=>joint[k]!==undefined);
 const latest=new Map();for(const r of model.designDetails?.reinforcement||[])if(!latest.has(r.id)||latest.get(r.id).version<r.version)latest.set(r.id,r);
 const selected=reinforcementRegionsAt([...latest.values()].filter(r=>r.memberId===column.id),column.n1===joint.nodeId?0:1),columnDetail=selected.length===1&&selected[0].bars?.length?selected[0]:null;
 if(crossTieDeclared){
  if(!columnDetail||!Array.isArray(joint.jointCrossTieBarPairs)||!joint.jointCrossTieBarPairs.length)return {...base,nominalQuantity:{status:'NOT_CHECKED',reason:'JOINT_COLUMN_CROSS_TIE_REFERENCE_REQUIRED'}};
  Object.assign(detail,{bars:columnDetail.bars,crossTieBarPairs:joint.jointCrossTieBarPairs,crossTieHookSides:joint.jointCrossTieHookSides,crossTiePlaneOffsets:joint.jointCrossTiePlaneOffsets,start:0,end:1,tieFirstStart:joint.jointFirstStart,tieFirstEnd:joint.jointFirstEnd});
 }
 const closureGeometry=outerHoopClosure(detail,{B,H}),prepared={...base,B,H,columnMemberId:column.id,outerHoop:{closureGeometry},stirrupDistribution:{...hoops,first:hoops.start,last:hoops.end,explicitEnds:hoops.status==='OK'}};
 if(columnDetail){prepared.columnDetailId=columnDetail.id;prepared.columnDetailVersion=columnDetail.version;}
 if(crossTieDeclared){prepared.crossTies=joint.jointCrossTiePattern==='alternating-hook-side'?alternatingJointCrossTies(detail,prepared,{B,H,length:joint.jointPanelHeight}):crossTieGeometry(detail,{B,H,length:joint.jointPanelHeight});}
 closureGeometry.selfAssembly=spatialHoopSelfAssembly(closureGeometry,prepared.stirrupDistribution);
 closureGeometry.crossTieAssembly=spatialHoopCrossTieAssembly(detail,prepared);
 const assemblies=[closureGeometry.selfAssembly,closureGeometry.crossTieAssembly,...(prepared.crossTies?[prepared.crossTies.assembly]:[])].filter(Boolean);
 closureGeometry.assemblyStatus=assemblies.some(r=>r.status==='NG')?'NG':'NOT_CHECKED';
 closureGeometry.assemblyReason=closureGeometry.assemblyStatus==='NG'?'JOINT_TRANSVERSE_ASSEMBLY_COLLISION':'JOINT_LONGITUDINAL_AND_TRANSVERSE_ASSEMBLY_REQUIRED';
 prepared.nominalQuantity=prepared.crossTies?.nominalQuantity||transverseReinforcementQuantity(detail,prepared);
 return prepared;
}
