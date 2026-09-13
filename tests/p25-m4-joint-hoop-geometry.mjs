import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {prepareJointHoopGeometry} from '../src/design/connection/jointHoopGeometry.js';
import {jointHoopQuantity} from '../src/design/connection/jointHoopQuantity.js';
const model=createModel();model.members=[{id:'C',n1:'A',n2:'B',secId:'rc3060'}];
const joint={nodeId:'B',connectionType:'rc-joint',columnMemberId:'C',memberIds:['C'],jointHoopForm:'closed-rectangular-two-leg',jointTieClosure:'seismic-135',jointClosureCorner:'+y+z',jointClosureSeparation:.04,jointCover:.04,jointBendInsideRadius:.032,jointHookTail:.096,jointPanelHeight:.6,jointFirstStart:.025,jointFirstEnd:.025,reinforcement:{diameter:.016,spacing:.1,legs:2}};
const prepared=prepareJointHoopGeometry(model,joint);
assert.equal(prepared.B,.3);assert.equal(prepared.H,.6);assert.equal(prepared.outerHoop.closureGeometry.path.status,'OK');
assert.equal(prepared.nominalQuantity.status,'OK');assert.equal(prepared.nominalQuantity.rows[0].bends.length,5);
const quantity=jointHoopQuantity(joint,prepared);
assert.equal(quantity.basis,'prepared-nominal-centerline');assert.equal(quantity.quantityComplete,false);assert.equal(quantity.steelVolume,prepared.nominalQuantity.volume);
assert.ok(Math.abs(quantity.steelVolume-prepared.hoops.count*prepared.outerHoop.closureGeometry.path.centerlineLength*Math.PI*.016**2/4)<1e-12);
assert.equal(prepareJointHoopGeometry(model,{...joint,jointClosureCorner:undefined}).nominalQuantity.status,'NOT_CHECKED');
assert.equal(jointHoopQuantity({...joint,jointClosureCorner:undefined},prepareJointHoopGeometry(model,{...joint,jointClosureCorner:undefined})).status,'NOT_CHECKED','partial explicit shape must not fall back to panel proxy');
console.log('PASS joint closure actual path, five bends, nominal quantity and missing-shape rejection');

const {evaluateProvidedJointHoopDetail}=await import('../src/design/connection/kdsJointHoops.js');
model.designDetails={reinforcement:[{id:'R',version:1,memberId:'C',start:0,end:1,bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:.02})))}]};
const configured={...joint,nodeId:'B',jointDesignStandard:'KDS-142080-2021-special-frame',concreteWeight:'normal',jointMaterialId:'concrete@1',reinforcement:{...joint.reinforcement,materialId:'steel@1'}};
const reviewed=evaluateProvidedJointHoopDetail(model,configured,{preparedJoint:prepared});
assert.ok(reviewed.spatialClosure);assert.equal(reviewed.incomplete,true);assert.ok(reviewed.incompleteReasons.includes('JOINT_HOOP_CAGE_ASSEMBLY_REQUIRED'));
assert.equal(reviewed.spatialClosure.geometricLength,prepared.outerHoop.closureGeometry.path.centerlineLength);

const tied={...configured,jointCrossTieBarPairs:['1:3'],jointCrossTieHookSides:['left'],jointCrossTiePlaneOffsets:['0.02']};
const tiedShape=prepareJointHoopGeometry(model,tied);
assert.equal(tiedShape.crossTies?.pieces.length,1);
assert.equal(tiedShape.columnDetailId,'R');assert.equal(tiedShape.columnDetailVersion,1);
assert.equal(tiedShape.nominalQuantity.rows.length,2);
assert.ok(Math.abs(tiedShape.nominalQuantity.volume-prepared.nominalQuantity.volume-tiedShape.crossTies.pieces[0].cutLength*prepared.hoops.count*Math.PI*.016**2/4)<1e-12);
assert.equal(prepareJointHoopGeometry(model,{...tied,jointCrossTieHookSides:undefined}).nominalQuantity.status,'NOT_CHECKED');
assert.equal(prepareJointHoopGeometry(model,{...tied,jointCrossTieBarPairs:['1:99']}).nominalQuantity.status,'NOT_CHECKED');
assert.equal(jointHoopQuantity(tied,tiedShape).rows.length,2);
console.log('PASS joint cross-tie mapped bars, exact additional nominal quantity, missing and invalid mapping rejection');

const tiedReview=evaluateProvidedJointHoopDetail(model,tied,{preparedJoint:tiedShape});assert.equal(tiedReview.crossTies.pieceChecks.length,1);assert.ok(tiedReview.crossTies.codeReferences.length>0);assert.equal(tiedReview.incomplete,true);

assert.equal(prepareJointHoopGeometry(model,{...tied,nodeId:'UNRELATED'}).nominalQuantity.status,'NOT_CHECKED');

assert.ok(tiedShape.outerHoop.closureGeometry.crossTieAssembly,'actual spatial hoop versus cross-tie checks are prepared');
assert.ok(tiedShape.outerHoop.closureGeometry.selfAssembly);
assert.equal(tiedShape.stirrupDistribution.first,tiedShape.hoops.start);
assert.equal(tiedShape.stirrupDistribution.last,tiedShape.hoops.end);
assert.ok(tiedShape.outerHoop.closureGeometry.crossTieAssembly.segmentPairs>0);
assert.ok(tiedShape.outerHoop.closureGeometry.crossTieAssembly.segmentPairs<=200001);
assert.notEqual(tiedShape.outerHoop.closureGeometry.selfAssembly.reason,'REPEATED_TIE_DISTRIBUTION_INVALID');
const colliding=prepareJointHoopGeometry(model,{...configured,jointClosureSeparation:0});
assert.equal(colliding.outerHoop.closureGeometry.selfAssembly.status,'NG');
assert.equal(evaluateProvidedJointHoopDetail(model,{...configured,jointClosureSeparation:0},{preparedJoint:colliding}).status,'NG');
console.log('PASS joint repeated hoop self-contact and spatial hoop/cross-tie assembly');
