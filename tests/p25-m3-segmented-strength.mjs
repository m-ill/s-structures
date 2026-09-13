import {memberForceFromRecovery} from '../src/solver/memberForceField.js';
import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {stageDesignInputCommand} from '../src/modeling/designInputCommands.js';
import {sectionOf} from '../src/core/catalogs.js';
import {resolveMemberTaper} from '../src/solver/taperedMember.js';
import {evaluateSegmentedRcStrength,evaluateSegmentedRcChecks} from '../src/design/rc/segmentedStrength.js';
const model=createModel();model.nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:3,y:0,z:0}];
for(const [id,size] of [['S1',400],['S2',600]])stageDesignInputCommand(model,{type:'section-record',id,version:1,name:id,shape:'RECT',dimensionUnit:'mm',B:size,H:size,sourceNote:'synthetic'},{},[]);
const member={id:'M',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'S1@1',taper:{profile:'segments',segments:[{start:0,end:.5,sectionId:'S1@1'},{start:.5,end:1,sectionId:'S2@1'}]}};model.members=[member];
stageDesignInputCommand(model,{type:'reinforcement-record',id:'R',version:1,name:'R',memberId:'M',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:.1*y,z:.1*z,diameter:20}))),stirrupDiameter:10,stirrupSpacing:100,stirrupLegs:2,strengthStandard:'KDS-142020-2022',reinforcementForm:'single-deformed',sourceNote:'synthetic'},{},[]);
const profile=resolveMemberTaper(model,member,sectionOf(model,member.secId));assert.equal(profile.ok,true);
const source={ax:{L:3,x:[1,0,0],y:[0,0,1],z:[0,-1,0]},taper:profile,forceRecoveryInput:{version:'member-force-recovery-v1',L:3,endForces:[2500,0,0,0,0,0,-2500,0,0,0,0,0],spanLoads:[]}};
const tuples=[0,3].map(x=>({x,side:'point',N:-2500,Vy:0,Vz:0,T:0,My:0,Mz:0,memberId:'M',comboId:'U',signConvention:'solver-native'}));
const result=evaluateSegmentedRcStrength(model,member,model.designDetails.reinforcement,source,tuples);
assert.equal(result.status,'NG');assert.equal(result.sectionProfileEvaluation,true);assert.equal(result.segmentChecks.length,2);
const As=4*Math.PI*.02**2/4,cap=A=>.8*.65*(.85*24*(A-As)+235*As)*1000;
for(const [i,A] of [[0,.16],[1,.36]])assert.ok(Math.abs(result.segmentChecks[i].check.capacity-cap(A))<1e-8);
assert.equal(result.segmentChecks[0].check.status,'NG');assert.equal(result.segmentChecks[1].check.status,'OK');
assert.ok(result.segmentChecks[0].locations.some(t=>t.x===1.5&&t.side==='left'));assert.ok(result.segmentChecks[1].locations.some(t=>t.x===1.5&&t.side==='right'));
assert.ok(result.codeReferences.length);assert.equal(result.profileHash,profile.hash);
const corrupt=structuredClone(source);corrupt.taper.segments[1].section.A*=2;assert.equal(evaluateSegmentedRcStrength(model,member,model.designDetails.reinforcement,corrupt,tuples).status,'NOT_CHECKED');
console.log('PASS actual native segment definitions, independent tied axial capacities, both boundary sides and source mismatch rejection');

assert.equal(evaluateSegmentedRcStrength(model,member,model.designDetails.reinforcement,source,[{...tuples[0],N:-2000}]).reason,'SEGMENTED_RC_FORCE_RECOVERY_MISMATCH');
const wrongAxes=structuredClone(source);wrongAxes.ax.y=[0,1,0];assert.equal(evaluateSegmentedRcStrength(model,member,model.designDetails.reinforcement,wrongAxes,tuples).reason,'SEGMENTED_RC_FORCE_AXES_MISMATCH');

const shearDetails=structuredClone(model.designDetails.reinforcement);
Object.assign(shearDetails[0],{shearStandard:'KDS-142022-2022',shearScope:'ordinary-prismatic-no-opening',concreteWeight:'normal',stirrupForm:'closed-rectangular-two-leg'});
const all=evaluateSegmentedRcChecks(model,member,shearDetails,source,tuples);
assert.equal(all['rc-section-strength'].status,'NG');
for(const id of ['rc-shear-y','rc-shear-z']){
 const shear=all[id];
 assert.equal(shear.sectionProfileEvaluation,true);
 assert.equal(shear.status,'NOT_CHECKED');
 assert.equal(shear.reason,'SECTION_TRANSITION_SHEAR_REVIEW_REQUIRED');
 assert.equal(shear.segmentChecks.length,2);
 for(const [i,depth] of [[0,.3],[1,.4]]){
  assert.ok(Math.abs(shear.segmentChecks[i].check.effectiveDepth-depth)<1e-12);
  assert.ok(shear.segmentChecks[i].check.codeReferences.length);
 }
 assert.ok(shear.segmentChecks[0].locations.some(t=>t.side==='left'&&t.x===1.5));
 assert.ok(shear.segmentChecks[1].locations.some(t=>t.side==='right'&&t.x===1.5));
 assert.equal(shear.sectionTransitions.length,1);
 assert.equal(shear.incomplete,true);
}
const sameModel=structuredClone(model),sameMember=sameModel.members[0];
sameMember.taper.segments[1].sectionId='S1@1';
const sameSource={...source,taper:resolveMemberTaper(sameModel,sameMember,sectionOf(sameModel,sameMember.secId))};
const same=evaluateSegmentedRcChecks(sameModel,sameMember,shearDetails,sameSource,tuples);
assert.equal(same['rc-shear-y'].status,'OK');
assert.equal(same['rc-shear-y'].sectionTransitions.length,0);
console.log('PASS mapped segment shear, both boundary sides, physical transition qualification and equal-section continuity');

const loadedSource=structuredClone(source);loadedSource.forceRecoveryInput.endForces=[0,300,0,0,0,0,0,-300,0,0,0,900];
const loadedTuples=[0,3].map(x=>{const f=memberForceFromRecovery(loadedSource.forceRecoveryInput,x);return {...tuples[0],x,N:f.N,Vy:f.Vy,Vz:f.Vz,T:f.Tq,My:f.My,Mz:f.Mz};});
const loaded=evaluateSegmentedRcChecks(model,member,shearDetails,loadedSource,loadedTuples)['rc-shear-y'];
for(const [i,bw,d] of [[0,400,300],[1,600,400]]){
 const Vc=Math.sqrt(24)*bw*d/6000,Vs=Math.min(2*Math.PI*10**2/4*235*d/100/1000,.2*(1-24/250)*24*bw*d/1000);
 assert.ok(Math.abs(loaded.segmentChecks[i].check.capacity-.75*(Vc+Vs))<1e-8);
 assert.equal(loaded.segmentChecks[i].check.demand,300);
}
assert.equal(loaded.status,'NG');assert.equal(loaded.incomplete,true);
