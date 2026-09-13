import assert from 'node:assert/strict';
import {transverseReinforcementQuantity} from '../src/design/rc/transverseReinforcementQuantity.js';
const detail={stirrups:{diameter:.01,area:.00008},crossTieBarPairs:['1:2']};
const prepared={stirrupDistribution:{status:'OK',count:1000000},outerHoop:{closureGeometry:{path:{status:'OK',centerlineLength:1.5,primitives:[{kind:'line',length:1},{kind:'arc',length:.5,radius:.25,sweep:2}]},codeReferences:[{code:'source'}]}},crossTies:{pieces:[{mark:'CT1',cutLength:.8,diameter:.01}],codeReferences:[]}};
const q=transverseReinforcementQuantity(detail,prepared);
assert.equal(q.status,'OK');assert.equal(q.rows.length,2);assert.equal(q.rows[0].geometricLength,1.5);
assert.equal(q.totalLength,2300000);assert.ok(Math.abs(q.volume-184)<1e-12);assert.equal(q.fabricationApproved,false);
const changed=structuredClone(prepared);changed.outerHoop.closureGeometry.path.centerlineLength=1.6;changed.outerHoop.closureGeometry.path.primitives[0].length=1.1;
assert.ok(transverseReinforcementQuantity(detail,changed).volume>q.volume);
const missing=structuredClone(prepared);missing.crossTies.pieces=[];assert.equal(transverseReinforcementQuantity(detail,missing).volume,null);
assert.equal(transverseReinforcementQuantity(detail,{}).status,'NOT_CHECKED');
assert.equal(transverseReinforcementQuantity({...detail,stirrups:{diameter:.01,area:NaN}},prepared).status,'NOT_CHECKED');
console.log('PASS common transverse geometric quantities, explicit nominal area, missing shape refusal and million-count constant rows');

const product=transverseReinforcementQuantity({...detail,stirrups:{...detail.stirrups,unitMassKgPerM:.56}},prepared);
assert.equal(product.rows[0].massQuantity.pieceCount,1000000);
assert.ok(Math.abs(product.rows[0].massQuantity.totalMassKg-840000)<1e-8);
assert.ok(Math.abs(product.rows[1].massQuantity.totalMassKg-448000)<1e-8);
assert.equal(product.rows.length,2,'mass calculation must not expand repeated pieces');
