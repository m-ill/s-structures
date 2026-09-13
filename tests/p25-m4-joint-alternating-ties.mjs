import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {prepareJointHoopGeometry} from '../src/design/connection/jointHoopGeometry.js';
const m=createModel();m.members=[{id:'C',n1:'A',n2:'B',secId:'rc3060'}];m.designDetails={reinforcement:[{id:'R',version:1,memberId:'C',start:0,end:1,bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:.02})))}]};
const joint={nodeId:'B',connectionType:'rc-joint',columnMemberId:'C',memberIds:['C'],jointHoopForm:'closed-rectangular-two-leg',jointTieClosure:'seismic-135',jointClosureCorner:'+y+z',jointClosureSeparation:.04,jointCover:.04,jointBendInsideRadius:.032,jointHookTail:.096,jointPanelHeight:.6,jointFirstStart:.025,jointFirstEnd:.025,reinforcement:{diameter:.016,spacing:.1,legs:2},jointCrossTieBarPairs:['1:3'],jointCrossTieHookSides:['left'],jointCrossTiePlaneOffsets:['0.01']};
const fixed=prepareJointHoopGeometry(m,joint),alternate=prepareJointHoopGeometry(m,{...joint,jointCrossTiePattern:'alternating-hook-side'});
assert.equal(alternate.crossTies.pieces.length,2);assert.deepEqual(alternate.crossTies.pieces.map(p=>p.hookSide),['left','right']);
assert.equal(alternate.nominalQuantity.status,'OK');assert.equal(alternate.nominalQuantity.rows.length,3);
assert.equal(alternate.nominalQuantity.rows.filter(r=>r.kind==='cross-tie').reduce((n,r)=>n+r.count,0),fixed.hoops.count);
assert.ok(Math.abs(alternate.nominalQuantity.volume-fixed.nominalQuantity.volume)<1e-12);
assert.equal(alternate.crossTies.pieces[0].distribution.last,fixed.hoops.end);
assert.ok(alternate.outerHoop.closureGeometry.crossTieAssembly.segmentPairs>0);
assert.equal(alternate.crossTies.assembly.checks.filter(c=>c.kind==='cross-tie-pair').length,1);
console.log('PASS alternating hook-side templates, exact parity counts/last plane, quantities and all-phase assembly');

assert.equal(prepareJointHoopGeometry(m,{...joint,jointCrossTiePattern:'unknown'}).nominalQuantity.status,'NOT_CHECKED');assert.equal(prepareJointHoopGeometry(m,{...joint,jointCrossTiePattern:'alternating-hook-side',jointCrossTieHookSides:'left'}).nominalQuantity.status,'NOT_CHECKED');
const single=prepareJointHoopGeometry(m,{...joint,jointPanelHeight:.05,jointCrossTiePattern:'alternating-hook-side'});assert.equal(single.crossTies.pieces.length,1);assert.equal(single.nominalQuantity.rows.filter(r=>r.kind==='cross-tie')[0].count,1);

const withMass=prepareJointHoopGeometry(m,{...joint,jointCrossTiePattern:'alternating-hook-side',reinforcement:{...joint.reinforcement,unitMassKgPerM:1.56}});
for(const row of withMass.nominalQuantity.rows){assert.equal(row.massQuantity.pieceCount,row.count);assert.ok(Math.abs(row.massQuantity.totalMassKg-row.count*row.geometricLength*1.56)<1e-12);}
const {jointHoopQuantity}=await import('../src/design/connection/jointHoopQuantity.js');
const combined=jointHoopQuantity({...joint,reinforcement:{...joint.reinforcement,unitMassKgPerM:1.56}},withMass);
assert.ok(Math.abs(combined.massQuantity.totalMassKg-withMass.nominalQuantity.totalLength*1.56)<1e-12);
assert.equal(combined.massQuantity.scope,'prepared-joint-hoops-and-cross-ties');
