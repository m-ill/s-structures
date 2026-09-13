import assert from 'node:assert/strict';
import {evaluateGroundSettlement} from '../src/design/foundation/groundSettlement.js';
const ground={settlementMethod:'layered-constrained-modulus',settlementLayers:['2:10000:1','3:20000:0.5'],settlementReference:'synthetic layer tests and stress factors',settlementLimit:.1};
const input={ground,combo:{type:'service'},contact:{ok:true,qmax:100}};
const r=evaluateGroundSettlement(input);
assert.ok(Math.abs(r.demand-.0275)<1e-12,JSON.stringify(r));
assert.equal(r.layers.length,2);assert.equal(r.status,'NOT_CHECKED');assert.equal(r.mechanicsStatus,'OK');
assert.equal(evaluateGroundSettlement({...input,ground:{...ground,settlementLimit:.02}}).status,'NG');
assert.equal(evaluateGroundSettlement({...input,ground:{...ground,settlementLayers:['1:10000:1','1:10000:1','3:20000:0.5']}}).demand,r.demand);
assert.equal(evaluateGroundSettlement({...input,ground:{...ground,settlementLayers:['2:0:1']}}).status,'NOT_CHECKED');
assert.equal(evaluateGroundSettlement({...input,ground:{...ground,settlementReference:undefined}}).status,'NOT_CHECKED');
assert.equal(evaluateGroundSettlement({...input,contact:{ok:true,qmax:200}}).demand,2*r.demand);
console.log('PASS layer compression sum, splitting, pressure scaling, NG and invalid input');

const automatic={ground:{...ground,settlementMethod:'layered-two-to-one-gross',settlementLayers:['2:10000','3:20000']},combo:{type:'service'},footing:{B:2,L:2},ledger:{ok:true,totalN:400},contact:{ok:true,contact:'full',qmax:100,qmin:100}};
const a=evaluateGroundSettlement(automatic);
assert.ok(Math.abs(a.demand-(.01+400*(1/4-1/7)/20000))<1e-12,JSON.stringify(a));
assert.equal(a.stressDistribution,'two-vertical-to-one-horizontal');
const split=evaluateGroundSettlement({...automatic,ground:{...automatic.ground,settlementLayers:['1:10000','1:10000','3:20000']}});assert.ok(Math.abs(split.demand-a.demand)<1e-14);
for(const L of [2,2+1e-12,3,1]){
 const q=400/(2*L),x=evaluateGroundSettlement({...automatic,footing:{B:2,L},contact:{ok:true,contact:'full',qmax:q,qmin:q}});
 let reference=0;const n=10000;
 for(const [top,bottom,M] of [[0,2,10000],[2,5,20000]]){const dz=(bottom-top)/n;for(let i=0;i<n;i++){const z=top+(i+.5)*dz;reference+=400/((2+z)*(L+z))/M*dz;}}
 assert.ok(Math.abs(x.demand-reference)<1e-9);
}
assert.equal(evaluateGroundSettlement({...automatic,contact:{...automatic.contact,qmin:90}}).reason,'SETTLEMENT_UNIFORM_FULL_CONTACT_REQUIRED');
assert.equal(evaluateGroundSettlement({...automatic,contact:{...automatic.contact,contact:'partial-x'}}).reason,'SETTLEMENT_UNIFORM_FULL_CONTACT_REQUIRED');
assert.equal(evaluateGroundSettlement({...automatic,ledger:{ok:true,totalN:500}}).reason,'SETTLEMENT_CONTACT_LOAD_MISMATCH');
assert.equal(evaluateGroundSettlement({...automatic,ground:{...automatic.ground,settlementLayers:['2:10000:1']}}).reason,'SETTLEMENT_LAYERS_INVALID');
console.log('PASS automatic 2:1 layer average against independent integration, square limit, splitting and scope rejection');

const {validatePracticalCommand}=await import('../src/modeling/practicalInputContract.js');
const command={type:'ground-record',id:'G',name:'synthetic',version:1,sourceNote:'fixture',sourceReference:'fixture',basisStatus:'specified',allowableBearing:200,bearingBasis:'gross',...automatic.ground};
assert.doesNotThrow(()=>validatePracticalCommand(command));
assert.throws(()=>validatePracticalCommand({...command,settlementLayers:['2:10000:1']}));
assert.throws(()=>validatePracticalCommand({...command,settlementMethod:'layered-constrained-modulus'}));

const {parseSettlementLayers}=await import('../src/metadata/settlementLayers.js');
assert.throws(()=>parseSettlementLayers(['1000:10000','1e-30:10000'],{automaticStress:true}));
const {twoToOneLayerStress}=await import('../src/design/foundation/twoToOneLayerStress.js');
assert.equal(twoToOneLayerStress({...automatic,layers:[{top:0,bottom:0,thickness:1}]}).ok,false);
