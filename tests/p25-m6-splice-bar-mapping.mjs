import assert from 'node:assert/strict';
import {remapSpliceBars,remapSplicePartition} from '../src/design/rc/remapSpliceBars.js';
const original=[{y:-.2,z:.08},{y:-.2,z:-.08}],target=[-1,1].flatMap(sign=>[-.14,0,.14].map(z=>({y:sign*.24,z})));
assert.deepEqual(remapSpliceBars(original,target,['1']),['3']);
assert.deepEqual(remapSpliceBars(original,target,['2','1']),['1','2','3']);
const row3=[-.1,0,.1].map(z=>({y:-.2,z})),row4=[-.15,-.05,.05,.15].map(z=>({y:-.2,z}));
assert.throws(()=>remapSpliceBars(row3,row4,['2']),/MAPPING/);
assert.deepEqual(remapSpliceBars(row3,row4,['1','3']),['1','4']);
assert.deepEqual(remapSpliceBars(original,target,['1','2'],{perimeterChange:true}),['1','2','3','4','5','6']);
assert.throws(()=>remapSpliceBars(original,target,['1'],{perimeterChange:true}),/MAPPING/);
assert.throws(()=>remapSpliceBars(original,[],['1']),/MAPPING/);
console.log('PASS full-row remapping, arbitrary original order, partial endpoints and ambiguous selection rejection');

const groups=[{id:'S1',barIndices:['1','3']},{id:'S2',barIndices:['2','4']}];
const old=[-1,1].flatMap(y=>[-.1,.1].map(z=>({y:y*.2,z}))),next=[-1,1].flatMap(y=>[-.15,0,.15].map(z=>({y:y*.24,z})));
const partition=remapSplicePartition(old,next,groups);assert.ok(partition);assert.deepEqual([...partition.values()].flat().map(Number).sort((a,b)=>a-b),[1,2,3,4,5,6]);assert.ok(partition.get('S1').includes('1'));assert.ok(partition.get('S2').includes('3'));
assert.equal(remapSplicePartition(old,next,[groups[0]]),null);assert.equal(remapSplicePartition(old,next,[groups[0],{...groups[1],barIndices:['1','2','4']}]),null);
assert.throws(()=>remapSplicePartition(next,old,[{id:'ALL',barIndices:['1','2','3','4','5','6']}]),/MAPPING/);
console.log('PASS complete staggered partitions cover newly generated bars once; incomplete/overlapping partitions do not infer a mapping');

// Automatic version rebinding is a modification even when bar geometry stays fixed.
const {memberCandidateCommands}=await import('../src/design/rc/memberCandidateCommands.js');
const {practicalInputFields,practicalCommandFromRecord,validatePracticalCommand}=await import('../src/modeling/practicalInputContract.js');
const reinforcement={type:'reinforcement-record',id:'R',version:1,memberId:'M',bars:old.map(b=>({...b,diameter:20})),stirrupSpacing:150};
const lockedSplice={name:'S',sourceNote:'synthetic lock regression',start:.2,end:.4,offsetY:.02,offsetZ:0,spliceType:'tension-B',spliceSystem:'ordinary-no-seismic-detail',id:'S',version:1,memberId:'M',reinforcementId:'R@1',barIndices:['1'],locked:true};
const lockModel={designDetails:{splices:[lockedSplice]}};
const frozenBefore=JSON.stringify({lockModel,reinforcement});
assert.throws(()=>memberCandidateCommands(lockModel,[reinforcement],{spacing:100}),e=>e.code==='DETAIL_LOCKED');
assert.equal(JSON.stringify({lockModel,reinforcement}),frozenBefore);
assert.deepEqual(memberCandidateCommands(lockModel,[reinforcement],{spacing:150,omitUnchanged:true}).commands,[]);
assert.equal(memberCandidateCommands({designDetails:{splices:[{...lockedSplice,reinforcementId:'OTHER@1'}]}},[reinforcement],{spacing:100}).commands.length,1);
assert.equal(memberCandidateCommands({designDetails:{splices:[lockedSplice,{...lockedSplice,version:2,reinforcementId:'OTHER@1'}]}},[reinforcement],{spacing:100}).commands.length,1);
assert.ok(practicalInputFields('splice-record').some(f=>f.key==='locked'&&f.kind==='boolean'));
console.log('PASS locked current splice blocks rebinding atomically; unchanged, unrelated and superseded records do not block');

assert.equal(practicalCommandFromRecord('splice-record',lockedSplice).locked,true);
assert.throws(()=>validatePracticalCommand({...practicalCommandFromRecord('splice-record',lockedSplice),locked:'false'}),e=>e.code==='PRACTICAL_INPUT_INVALID');

const {resizeSpliceOffset}=await import('../src/design/rc/resizeSpliceOffset.js');
for(const [y,z,oldD,newD] of [[.02,0,20,25],[0,-.06,20,25],[.036,-.048,20,16]]){
 const r=resizeSpliceOffset(y,z,oldD,newD);
 assert.ok(Math.abs((Math.hypot(r.offsetY,r.offsetZ)-newD/1000)-(Math.hypot(y,z)-oldD/1000))<1e-12);
 assert.ok(Math.abs(r.offsetY*z-r.offsetZ*y)<1e-12);assert.ok(r.offsetY*y+r.offsetZ*z>0);
 assert.equal(r.requiresGeometryReview,true);
}
for(const args of [[0,0,20,25],[.01,0,20,25],[NaN,0,20,25],[.02,0,0,25],[.02,0,20,-25],[1.7e308,1.7e308,20,25]])assert.throws(()=>resizeSpliceOffset(...args),/SPLICE_OFFSET_STRATEGY_REQUIRED/);
console.log('PASS contact/noncontact signed offset preserves physical gap for increase/decrease; malformed/overlapping originals rejected');
