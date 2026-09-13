import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {stageDesignInputCommand} from '../src/modeling/designInputCommands.js';
import {coupleSectionFoundations} from '../src/compute/product/sectionFoundationCoupling.js';
const model=createModel();stageDesignInputCommand(model,{type:'section-record',id:'S',version:1,name:'S',shape:'RECT',dimensionUnit:'mm',B:300,H:600,sourceNote:'fixture'},{},[]);
model.nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:0,y:0,z:3}];model.members=[{id:'M',type:'frame',n1:'A',n2:'B',secId:'S@1'}];
const source={type:'foundation-record',id:'F',version:2,columnWidth:.6,columnDepth:.3,B:2,L:2,thickness:.5};
const commands=[{...source,version:3,thickness:.7}];
const changed=coupleSectionFoundations(model,'M',{B:350,H:650},[source],commands);
assert.equal(commands.length,1);assert.equal(changed[0].columnWidth,.65);assert.equal(changed[0].columnDepth,.35);assert.equal(changed[0].version,3);assert.equal(changed[0].thickness,.7);assert.equal(source.columnWidth,.6);
assert.throws(()=>coupleSectionFoundations(model,'M',{B:350,H:650},[{...source,locked:true}],[]),/DETAIL_LOCKED/);
assert.throws(()=>coupleSectionFoundations(model,'M',{B:350,H:650},[{...source,columnWidth:.4}],[]),/SOURCE_DIMENSION_MISMATCH/);
assert.deepEqual(coupleSectionFoundations(model,'M',null,[source],[]),[]);
console.log('PASS section/footing axis mapping, merged version, independent edits, source mismatch and lock');

const {coupleSectionJoints}=await import('../src/compute/product/sectionJointCoupling.js');
const joint={type:'connection-record',id:'J',version:1,jointWidth:.3,jointDepth:.6,tieSpacing:150};
const jointCommands=[{...joint,version:2,tieSpacing:100}];
const paired=coupleSectionJoints(model,'M',{B:350,H:650},[joint],jointCommands);
assert.equal(paired[0].jointWidth,.35);assert.equal(paired[0].jointDepth,.65);assert.equal(paired[0].tieSpacing,100);assert.equal(paired[0].version,2);assert.equal(jointCommands.length,1);
assert.throws(()=>coupleSectionJoints(model,'M',{B:350,H:650},[{...joint,jointWidth:.4}],[]),/SOURCE_DIMENSION_MISMATCH/);
assert.throws(()=>coupleSectionJoints(model,'M',{B:350,H:650},[{...joint,locked:true}],[]),/DETAIL_LOCKED/);
assert.deepEqual(coupleSectionJoints(model,'M',null,[joint],[]),[]);
console.log('PASS joint local-section mapping, preserved hoop edit, source mismatch and lock');

model.nodes.push({id:'C',x:3,y:0,z:3});model.members.push({id:'BEAM',type:'frame',n1:'B',n2:'C',secId:'S@1'});
const beamJoint={...joint,columnMemberId:'M',memberIds:['M','BEAM'],nodeId:'B',jointPanelHeight:.6};
const beamCommands=[];const beamChanged=coupleSectionJoints(model,'BEAM',{B:350,H:700},[beamJoint],beamCommands);
assert.equal(beamChanged[0].jointPanelHeight,.7);assert.equal(beamChanged[0].jointWidth,.3);assert.equal(beamChanged[0].jointDepth,.6);
assert.throws(()=>coupleSectionJoints(model,'BEAM',{B:350,H:700},[{...beamJoint,jointPanelHeight:.5}],[]),/SOURCE_PANEL_HEIGHT_MISMATCH/);
console.log('PASS beam section updates the joint panel height without changing the column plan dimensions');

model.nodes.push({id:'D',x:0,y:3,z:3});stageDesignInputCommand(model,{type:'section-record',id:'S2',version:1,name:'S2',shape:'RECT',dimensionUnit:'mm',B:300,H:800,sourceNote:'fixture'},{},[]);model.members.push({id:'OTHER',type:'frame',n1:'B',n2:'D',secId:'S2@1'});
const multi={...beamJoint,memberIds:['M','BEAM','OTHER'],jointPanelHeight:.8};
assert.equal(coupleSectionJoints(model,'BEAM',{B:350,H:700},[multi],[])[0].jointPanelHeight,.8);
assert.equal(coupleSectionJoints(model,'BEAM',{B:350,H:900},[multi],[])[0].jointPanelHeight,.9);
model.members.find(m=>m.id==='BEAM').offsets={};assert.throws(()=>coupleSectionJoints(model,'BEAM',{B:350,H:900},[multi],[]),/BEAM_MAPPING_REQUIRED/);
console.log('PASS maximum connected beam depth and unsupported offsets');

delete model.members.find(m=>m.id==='BEAM').offsets;
model.members.find(m=>m.id==='BEAM').endOffset={i:{dy:.05},j:0};
assert.throws(()=>coupleSectionJoints(model,'BEAM',{B:350,H:900},[multi],[]),/BEAM_MAPPING_REQUIRED/);
model.members[0].insertionPoint='top-center';
assert.throws(()=>coupleSectionFoundations(model,'M',{B:350,H:650},[source],[]),/MAPPING_REQUIRED/);
console.log('PASS solver endOffset and insertionPoint fields cannot bypass centered coupling guards');

const {requiresOffsetAwareDesign}=await import('../src/core/memberDesignGeometry.js');
const {resolveMemberOffsetKinematics}=await import('../src/solver/memberOffsets.js');
for(const spec of [{},{endOffset:{i:0,j:{dx:0,dy:0,dz:0}}},{insertionPoint:{position:'centroid'}},{endOffset:{i:.1}},{endOffset:{frame:'global',j:{dz:.05}}},{insertionPoint:'top-center'}]){
 const actual=resolveMemberOffsetKinematics(spec,{x:0,y:0,z:0},{x:3,y:0,z:0},{B:.3,H:.6});assert.equal(actual.ok,true);assert.equal(requiresOffsetAwareDesign(spec),actual.applied);
}
assert.equal(requiresOffsetAwareDesign({endOffset:{i:NaN}}),true);
console.log('PASS centered-design admission agrees with actual solver offset activation for supported input forms');
