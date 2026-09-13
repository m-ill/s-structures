import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {jointTopology} from './jointTopology.js';
import {jointConstraintActions} from './jointConstraintActions.js';
import {jointSpliceLayoutProof} from './jointSpliceLayoutProof.js';
import {finalizeJointHoopDetail,jointHoopDimensionChecks} from './finalizeJointHoopDetail.js';
import {jointLongitudinalSupport} from './jointLongitudinalSupport.js';
import {jointCrossTieCredit} from './jointCrossTieCredit.js';
import {jointCrossTieTopology} from './jointCrossTieTopology.js';
import {jointHoopSupport} from './jointHoopSupport.js';
import {jointColumnContactPaths} from './jointColumnContactPaths.js';
import {jointCrossTieSupport} from './jointCrossTieSupport.js';
import {jointTransverseLongitudinalAssembly} from './jointTransverseLongitudinalAssembly.js';
import {prepareJointHoopGeometry} from './jointHoopGeometry.js';
import {evaluateJointCongestion} from './jointCongestion.js';
import {evaluateJointStrengthRelation} from './jointStrengthRelation.js';
import {evaluateJointHookAnchorage} from './jointHookAnchorage.js';
import {deriveJointProbableForces} from './jointProbableForces.js';
import {evaluateProvidedJointHoops,evaluateProvidedJointHoopDetail} from './kdsJointHoops.js';
import {memberAxes} from '../../core/memberAxes.js';
import {memberReleaseState} from '../../core/memberReleaseContract.js';
import {evaluateProvidedJointShear} from './kdsJointShear.js';
const missing=reason=>({status:'NOT_CHECKED',ratio:null,reason});
function evaluateRcJointChecks(model,joint,set,{preparedJoint}={}) {
 const result={'joint-equilibrium':missing('JOINT_ACTIONS_REQUIRED'),'joint-shear':missing('JOINT_PANEL_SHEAR_RULE_REQUIRED'),'joint-confinement':missing('JOINT_CONFINEMENT_RULE_REQUIRED'),'joint-anchorage':missing('ANCHORAGE_RULE_REQUIRED'),'joint-stiffness':missing('STIFFNESS_MAPPING_REQUIRED')};
 if(joint.connectionType!=='rc-joint')return result;
 const probable=deriveJointProbableForces(model,joint);result['joint-probable-forces']=probable;
 result['joint-confinement']=evaluateProvidedJointHoops(model,joint);
 result['joint-hoop-detail']=evaluateProvidedJointHoopDetail(model,joint,{preparedJoint});
 result['joint-anchorage']=evaluateJointHookAnchorage(model,joint);
 result['joint-bar-congestion']=evaluateJointCongestion(model,joint);
 if(result['joint-hoop-detail'].spatialClosure){
  const geometry=preparedJoint||prepareJointHoopGeometry(model,joint),assembly=jointTransverseLongitudinalAssembly(geometry,result['joint-bar-congestion']);
  const detail=result['joint-hoop-detail'];detail.transverseLongitudinalAssembly=assembly;
  const mappedPaths=jointColumnContactPaths(model,geometry,result['joint-bar-congestion']);
  detail.outerHoopSupport=jointHoopSupport(model,geometry,result['joint-bar-congestion'],{mappedPaths});
  if(geometry.crossTies?.pieces?.length)detail.crossTieSupport=jointCrossTieSupport(model,joint,geometry,result['joint-bar-congestion'],{mappedPaths});
  detail.longitudinalSupport=jointLongitudinalSupport(joint,geometry,detail,mappedPaths);
  if(geometry.crossTies?.pieces?.length){
   const topology=jointCrossTieTopology(geometry,result['joint-confinement']);
   topology.supportAndAssembly=[['outer-hoop-support',detail.outerHoopSupport],['cross-tie-support',detail.crossTieSupport],['longitudinal-assembly',assembly],['outer-hoop-self-assembly',geometry.outerHoop?.closureGeometry?.selfAssembly],['hoop-cross-tie-assembly',geometry.outerHoop?.closureGeometry?.crossTieAssembly],['cross-tie-assembly',geometry.crossTies.assembly]].map(([id,r])=>({id,status:r?.status||'NOT_CHECKED',reason:r?.reason||null}));
   const credit=jointCrossTieCredit(geometry,topology,{...detail,checks:jointHoopDimensionChecks(detail)},joint.reinforcement);
   if(credit.status==='OK'){result['joint-confinement']=evaluateProvidedJointHoops(model,joint,{transverseCredit:credit});topology.creditApplied=true;}
   else result['joint-confinement'].transverseCredit=credit;
   result['joint-confinement'].crossTieTopology=topology;
  }

  result['joint-hoop-detail']=finalizeJointHoopDetail(joint,geometry,detail,result['joint-confinement'].transverseCredit);
 }

 const spliceProof=jointSpliceLayoutProof(model,joint);
 if(spliceProof.status!=='N_A')for(const key of ['joint-confinement','joint-hoop-detail'])result[key]={...result[key],spliceLayoutProof:spliceProof,spliceLayoutEvaluated:spliceProof.status==='OK'};
 result['joint-member-strength-ratio']=evaluateJointStrengthRelation(model,joint,set);
 const incident=(model.members||[]).filter(m=>m.n1===joint.nodeId||m.n2===joint.nodeId);
 if(incident.length!==joint.memberIds.length||incident.some(m=>!joint.memberIds.includes(m.id))){result['joint-equilibrium']=missing('INCOMPLETE_JOINT_MEMBERS');return result;}
 if((model.shells||[]).length||(model.links||[]).some(x=>x.n1===joint.nodeId||x.n2===joint.nodeId)){result['joint-equilibrium']=missing('SHELL_OR_LINK_JOINT_MAPPING_REQUIRED');return result;}
 const actions=[],sum=Array(6).fill(0),expected=Array(6).fill(0);let mismatch=false;
 for(const member of incident) {
  const at=member.n1===joint.nodeId?0:6,side=at===0?'i':'j',release=memberReleaseState(member)[side];
  if(joint.restraint==='semi-rigid'||member.releases?.spring)result['joint-stiffness']=missing('SEMI_RIGID_DETAIL_MAPPING_REQUIRED');
  else mismatch||=(joint.restraint==='pinned'?release!=='pin':release!=='rigid');
  const recovered=set?.memberResults?.[member.id];
  if(recovered?.foundation?.enabled){result['joint-equilibrium']=missing('FOUNDATION_MEMBER_ACTION_MAPPING_REQUIRED');return result;}
  const end=recovered?.structuralEnd||recovered?.end;
  if(!Array.isArray(end)||end.length!==12||!end.every(Number.isFinite))return result;
  const a=model.nodes.find(n=>n.id===member.n1),b=model.nodes.find(n=>n.id===member.n2),ax=recovered.ax||memberAxes(a,b,member.localAxis);
  const rotate=values=>[0,1,2].map(k=>values[0]*ax.x[k]+values[1]*ax.y[k]+values[2]*ax.z[k]);
  if(recovered.globalEquilibriumEnd!==undefined&&(!Array.isArray(recovered.globalEquilibriumEnd)||recovered.globalEquilibriumEnd.length!==12||!recovered.globalEquilibriumEnd.every(Number.isFinite))){result['joint-equilibrium']=missing('JOINT_GLOBAL_END_ACTION_INVALID');return result;}
  const vector=recovered.globalEquilibriumEnd?.slice(at,at+6)||recovered.offset?.jointEndGlobal?.slice(at,at+6)||[...rotate(end.slice(at,at+3)),...rotate(end.slice(at+3,at+6))];
  if(vector.length!==6||!vector.every(Number.isFinite))return result;
  vector.forEach((v,i)=>sum[i]+=v);actions.push({memberId:member.id,end:side,global:vector,actionSource:recovered.globalEquilibriumEnd?'consistent-global-equilibrium-end':recovered.offset?.jointEndGlobal?'offset-joint-end':'rotated-structural-end',offsetTransferred:!!recovered.offset?.applied});
 }
 if(joint.restraint!=='semi-rigid'&&!incident.some(m=>m.releases?.spring))result['joint-stiffness']={status:mismatch?'NG':'OK',ratio:mismatch?null:0,reason:mismatch?'ANALYSIS_DETAIL_RESTRAINT_MISMATCH':null};
 if(!sum.every(Number.isFinite)){result['joint-equilibrium']=missing('JOINT_MEMBER_ACTION_NONFINITE');return result;}
 const combo=model.loadCombinations?.find(x=>x.id===set?.combo?.id);if(!combo)return result;
 for(const load of model.loads||[])if(load.node===joint.nodeId) {
  const factor=Object.hasOwn(combo.factors||{},load.case)?combo.factors[load.case]:0;
  if(!Number.isFinite(factor)){result['joint-equilibrium']=missing('JOINT_COMBINATION_FACTOR_INVALID');return result;}
  if(factor===0)continue;
  if(load.type==='nmoment'){const direction=resolveMomentDirection(load);if(!direction.ok||!Number.isFinite(load.M)){result['joint-equilibrium']=missing('NODAL_LOAD_MAPPING_REQUIRED');return result;}direction.global.forEach((v,k)=>expected[k+3]+=v*load.M*factor);continue;}
  if(!['nodal','nmoment'].includes(load.type)||!/^[-+][xyz]$/.test(load.dir)){result['joint-equilibrium']=missing('NODAL_LOAD_MAPPING_REQUIRED');return result;}
  const index='xyz'.indexOf(load.dir[1])+(load.type==='nmoment'?3:0);
  const value=load.type==='nodal'?load.P:load.M;if(!Number.isFinite(value))return result;
  expected[index]+=value*factor*(load.dir[0]==='-'?-1:1);
 }
 const constraintAction=jointConstraintActions(model,joint.nodeId,set);
 if(constraintAction.status==='NOT_CHECKED'){result['joint-equilibrium']={...missing(constraintAction.reason),constraintAction};return result;}
 constraintAction.global.forEach((value,i)=>expected[i]+=value);
 const reaction=set.reactions?.[joint.nodeId];if(reaction)for(const [i,key] of ['rx','ry','rz','rmx','rmy','rmz'].entries()){if(!Number.isFinite(reaction[key]))return result;expected[i]+=reaction[key];}
 if(!expected.every(Number.isFinite)){result['joint-equilibrium']=missing('JOINT_EXTERNAL_ACTION_NONFINITE');return result;}
 const residual=sum.map((x,i)=>x-expected[i]);
 if(!residual.every(Number.isFinite)){result['joint-equilibrium']=missing('JOINT_EQUILIBRIUM_NONFINITE');return result;}
 const relative=Math.max(...residual.map((x,i)=>Math.abs(x)/Math.max(1,Math.abs(sum[i]),Math.abs(expected[i]))));
 result['joint-equilibrium']={status:relative<=1e-8?'OK':'NG',ratio:relative/1e-8,reason:relative<=1e-8?null:'JOINT_EQUILIBRIUM_RESIDUAL',actions,residual,constraintAction,externalAction:expected,comboId:set.combo.id};
 if(relative<=1e-8&&result['joint-stiffness'].status==='OK')result['joint-shear']=evaluateProvidedJointShear(model,joint,set,probable);
 return result;
}
import {resolveMomentDirection} from '../../loads/momentDirection.js';

// Explain an unmet calculation dependency without treating it as an absent KDS rule.
export function evaluateRcJoint(model,joint,set,options={}) {
 const result=evaluateRcJointChecks(model,joint,set,options);
 const topology=jointTopology(model,joint);
 for(const row of Object.values(result))row.jointTopology=topology;
 if(joint.connectionType!=='rc-joint'||result['joint-shear']?.reason!=='JOINT_PANEL_SHEAR_RULE_REQUIRED')return result;
 const blockingChecks=['joint-equilibrium','joint-stiffness'].filter(id=>result[id]?.status!=='OK').map(checkId=>({checkId,status:result[checkId]?.status||'NOT_CHECKED',reason:result[checkId]?.reason||null}));
 if(blockingChecks.length)result['joint-shear']={...result['joint-shear'],incomplete:true,reason:blockingChecks[0].checkId==='joint-equilibrium'?'JOINT_SHEAR_EQUILIBRIUM_REQUIRED':'JOINT_SHEAR_RESTRAINT_REQUIRED',blockingChecks,codeReferences:getKcscRuleSources(['142080']).map(r=>({...r,clause:'4.6.1; 4.6.3'}))};
 return result;
}
