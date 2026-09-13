import assert from 'node:assert/strict';
import {foundationFootprintProposal} from '../src/compute/product/foundationFootprintProposal.js';
const command={id:'F2',version:1,nodeId:'C',B:2,L:2};
const pair={id:'PAIR',checkId:'foundation-differential-settlement',status:'NG',basis:'primary-ultimate',settlementLimit:.005,rotationLimit:.0015,pairs:[{status:'NG',sourceId:'F1',sourceVersion:1,peerId:'F2',peerVersion:1,sourceSettlement:.01,peerSettlement:.03,distance:5}]};
const p=foundationFootprintProposal(command,[pair]);assert.equal(p.ok,true);assert.deepEqual(p.basisCheckIds,['PAIR']);assert.ok(p.edits.every(e=>e.B>2&&e.B<=3&&e.L>2&&e.L<=3));assert.equal(p.siteFitVerified,false);
assert.equal(foundationFootprintProposal({...command,id:'F1'},[pair]).ok,false);
assert.equal(foundationFootprintProposal({...command,version:2},[pair]).ok,false);
const own={id:'S',entityId:'foundation:C',checkId:'foundation-settlement',status:'NG',detailVersion:1,method:'layered-constrained-modulus',demand:.04,capacity:.02,layers:[{displacement:.04}],loadLedger:{ok:true},contact:{ok:true}};
assert.equal(foundationFootprintProposal(command,[own]).ok,true);
assert.equal(foundationFootprintProposal(command,[{...own,status:'NOT_CHECKED'}]).ok,false);
assert.equal(foundationFootprintProposal(command,[{...own,secondaryCompression:{status:'CALCULATED',displacementAtTime:.03}}]).ok,false);
console.log('PASS footprint suggestions from own or incoming differential NG, direction/version and irreducible secondary guards');

const limited=foundationFootprintProposal({...command,footprintLimitB:2,footprintLimitL:3,footprintLimitReference:'synthetic clear rectangle'},[pair]);assert.equal(limited.ok,true);assert.ok(limited.edits.every(e=>e.B===2&&e.L>2&&e.L<=3));
assert.equal(foundationFootprintProposal({...command,footprintLimitB:2,footprintLimitL:2,footprintLimitReference:'synthetic'},[pair]).ok,false);
assert.equal(foundationFootprintProposal({...command,footprintLimitB:1.9,footprintLimitL:3,footprintLimitReference:'synthetic'},[pair]).reason,'CURRENT_FOOTPRINT_EXCEEDS_DECLARED_LIMIT');
assert.equal(foundationFootprintProposal({...command,footprintLimitB:2},[pair]).ok,false);
const {evaluateFootprintFit}=await import('../src/design/foundation/footprintFit.js');
assert.equal(evaluateFootprintFit({...command,footprintLimitB:2,footprintLimitL:3,footprintLimitReference:'synthetic'}).status,'OK');
assert.equal(evaluateFootprintFit({...command,B:2.1,footprintLimitB:2,footprintLimitL:3,footprintLimitReference:'synthetic'}).status,'NG');
assert.equal(evaluateFootprintFit({...command,footprintLimitB:2}).status,'NOT_CHECKED');
console.log('PASS declared footprint caps, one-axis expansion, exceeded/missing constraints and fit checks');

assert.equal(evaluateFootprintFit({...command,footprintLimitB:1e-323,footprintLimitL:3,footprintLimitReference:'synthetic'}).ratio,null);

const neighbor={id:'F1',version:1,nodeId:'A',B:2,L:2,footprintClearance:2,footprintClearanceReference:'synthetic'};
const model={nodes:[{id:'A',x:0,y:0},{id:'C',x:4,y:3}],designDetails:{foundations:[neighbor,command]}};
const screened=foundationFootprintProposal(command,[pair],model);
assert.equal(screened.ok,true);
assert.equal(screened.planClearanceScreening.status,'OK');
assert.ok(screened.planClearanceScreening.rejectedCount>0);
assert.ok(screened.edits.some(e=>e.L===3&&e.B<2.2));
for(const e of screened.edits)assert.ok(Math.hypot(Math.max(0,4-(2+e.B)/2),Math.max(0,3-(2+e.L)/2))>=2);
const unknown=foundationFootprintProposal(command,[pair],{...model,nodes:[]});
assert.equal(unknown.planClearanceScreening.status,'NOT_CHECKED');
assert.equal(unknown.siteFitVerified,false);
console.log('PASS automatic axis alternatives respect neighbor clearance and missing geometry remains unverified');

const {foundationRepairProposal}=await import('../src/compute/product/foundationRepairProposal.js');
const closed={...model,designDetails:{foundations:[{...neighbor,footprintClearance:4},command]}};
const exhausted=foundationRepairProposal(command,[pair],closed);
assert.equal(exhausted.ok,false);
assert.equal(exhausted.reason,'FOOTPRINT_CLEARANCE_SEARCH_EXHAUSTED');
assert.ok(exhausted.proposalFailures.find(p=>p.component==='footprint').planClearanceScreening.rejectedCount>0);
assert.ok(exhausted.proposalFailures.length<=5);
assert.equal(exhausted.designTransferAllowed,false);
console.log('PASS exhausted repair preserves footprint cause and bounded component diagnoses');

const anchor={id:'ANCHOR',entityId:'foundation:C',checkId:'foundation-anchorage',status:'NG',checks:[{axis:'B',status:'NG',available:.5,required:.7}]};
const anchored=foundationFootprintProposal(command,[anchor]);assert.equal(anchored.ok,true);assert.ok(anchored.edits[0].B>=2.4-1e-10);assert.equal(anchored.edits[0].L,2);assert.ok(anchored.basisCheckIds.includes('ANCHOR'));
assert.equal(foundationFootprintProposal(command,[{...anchor,detailVersion:2}]).ok,false);
const extension={id:'EXTENSION',entityId:'foundation:C',checkId:'foundation-punching',status:'NG',extensions:[{axis:'L',available:.3,required:.55}]};const extended=foundationFootprintProposal(command,[extension]);assert.equal(extended.ok,true);assert.ok(extended.edits[0].L>=2.5-1e-10);
console.log('PASS own straight development and punching extension deficits produce directional footprint candidates');
