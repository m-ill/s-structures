import assert from 'node:assert/strict';
import {kdsJointShear,evaluateProvidedJointShear} from '../src/design/connection/kdsJointShear.js';
import {createModel} from '../src/core/model.js';
const x={fck:25,area:0.2,confinement:'three-or-opposite-two',demand:100};
assert.equal(kdsJointShear(x).capacity,937.5);
assert.equal(kdsJointShear({...x,demand:1000}).status,'NG');
const model=createModel();
model.nodes=[{id:'J',x:0,y:0,z:3},{id:'C',x:0,y:0,z:0},{id:'L',x:-3,y:0,z:3},{id:'R',x:3,y:0,z:3}];
model.members=[{id:'COL',n1:'C',n2:'J',matId:'concrete',secId:'rc3060'},{id:'BL',n1:'L',n2:'J',matId:'concrete',secId:'rc3060'},{id:'BR',n1:'J',n2:'R',matId:'concrete',secId:'rc3060'}];
const j={nodeId:'J',memberIds:['COL','BL','BR'],restraint:'rigid',jointDesignStandard:'KDS-142080-2021-special-frame',columnMemberId:'COL',jointMaterialId:'concrete@1',concreteWeight:'normal',capacityDemandBasis:'1.25fy-capacity-design',capacityDemandReference:'synthetic demand oracle',capacityDesignShearX:100,capacityDesignShearY:0};
const result=evaluateProvidedJointShear(model,j,{memberResults:{}});
assert.equal(result.status,'OK');assert.ok(result.axes[0].effectiveWidth>0);
assert.ok(result.codeReferences.some(x=>x.code==='KDS 14 20 80'));
assert.equal(evaluateProvidedJointShear(model,{...j,capacityDemandReference:''},{}).status,'NOT_CHECKED');
assert.equal(evaluateProvidedJointShear(model,{...j,jointDesignStandard:undefined},{}).reason,'JOINT_DESIGN_SYSTEM_REQUIRED');
console.log('PASS special-frame joint shear source, geometry, explicit capacity demand and scope gates');

for(const id of ['COL','BL','BR']) {
 for(const patch of [{endOffset:{i:.1}},{insertionPoint:'top-center'},{taper:{profile:'linear',sectionIdJ:'rc3060'}}]) {
  const changed=structuredClone(model);Object.assign(changed.members.find(m=>m.id===id),patch);
  const check=evaluateProvidedJointShear(changed,j,{memberResults:{}});
  assert.equal(check.status,'NOT_CHECKED',id+JSON.stringify(patch));
  assert.ok(check.codeReferences.length);
 }
 const zero=structuredClone(model);Object.assign(zero.members.find(m=>m.id===id),{endOffset:{i:0,j:0},insertionPoint:{position:'centroid'}});
 assert.deepEqual(evaluateProvidedJointShear(zero,j,{memberResults:{}}),result);
}
const disconnected=structuredClone(model);disconnected.members.find(m=>m.id==='BL').n2='R';
assert.equal(evaluateProvidedJointShear(disconnected,j,{}).reason,'JOINT_MEMBER_CONNECTIVITY_REQUIRED');
console.log('PASS joint shear current geometry admission, zero offset equivalence and disconnected member rejection');
