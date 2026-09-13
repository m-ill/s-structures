import assert from 'node:assert/strict';
import {classAMomentEnvelope} from '../src/compute/product/classAMomentEnvelope.js';
import {memberForceFromRecovery} from '../src/solver/memberForceField.js';
const input={version:'member-force-recovery-v1',L:10,endForces:[0,8,0,0,0,0,0,0,0,0,0,0],spanLoads:[{type:'udl',shape:'uniform',q:[0,-2,0]}]};
const tuple=x=>{const f=memberForceFromRecovery(input,x);return {memberId:'M',comboId:'U',x,...f,T:f.Tq,signConvention:'solver-native'};};
const tuples=[0,5,10].map(tuple),before=structuredClone(tuples);
const result=classAMomentEnvelope(input,tuples,10);assert.equal(result.status,'OK',JSON.stringify(result));assert.ok(result.tuples.some(t=>Math.abs(t.x-4)<1e-10&&Math.abs(t.Mz-16)<1e-10));assert.deepEqual(tuples,before);
assert.equal(classAMomentEnvelope(input,[{...tuples[0],Mz:2},...tuples.slice(1)],10).status,'NOT_CHECKED');
assert.equal(classAMomentEnvelope({...input,spanLoads:[{type:'unsupported',a:3,q:[0,-2,0]}]},tuples,10).status,'NOT_CHECKED');
console.log('PASS exact UDL interior moment maximum absent from input grid, immutable verified recovery and unsupported load rejection');

function envelope(r){const ts=[0,5,10].map(x=>{const f=memberForceFromRecovery(r,x);return {...tuples[0],...f,T:f.Tq,x};});return classAMomentEnvelope(r,ts,10);}
for(const [shape,x] of [['asc',Math.sqrt(80)],['desc',10-Math.sqrt(20)]]){const r=envelope({...input,spanLoads:[{...input.spanLoads[0],shape}]});assert.equal(r.status,'OK');assert.ok(r.positions.some(p=>Math.abs(p-x)<1e-9));}
const geometric=Array(12).fill(0);geometric[5]=-10;geometric[11]=20;const second=envelope({...input,version:'member-force-recovery-v2-geometric',geometricEndForces:geometric});assert.ok(second.tuples.some(t=>Math.abs(t.x-4.5)<1e-9&&Math.abs(t.Mz-30.25)<1e-9));
const scale=1e200,large=envelope({...input,endForces:input.endForces.map(v=>v*scale),spanLoads:input.spanLoads.map(l=>({...l,q:l.q.map(v=>v*scale)}))});assert.equal(large.status,'OK');assert.ok(large.positions.some(x=>Math.abs(x-4)<1e-9));
console.log('PASS ascending/descending cubic roots, geometric linear correction and overflow-resistant scaled derivative');

const partial=envelope({...input,spanLoads:[{type:'distributed-linear',a:2,b:8,q1:[0,-2,0],q2:[0,-2,0]}]});assert.equal(partial.status,'OK',JSON.stringify(partial));assert.ok(partial.tuples.some(t=>Math.abs(t.x-6)<1e-9&&Math.abs(t.Mz-32)<1e-9));
const point=envelope({...input,spanLoads:[{type:'point',a:4,q:[0,-16,0]},{type:'moment',a:4,axis:'z',M:20}]});assert.equal(point.status,'OK',JSON.stringify(point));assert.equal(point.tuples.find(t=>t.x===4&&t.side==='left').Mz,32);assert.equal(point.tuples.find(t=>t.x===4&&t.side==='right').Mz,12);
const trap=envelope({...input,spanLoads:[{type:'distributed-linear',a:2,b:8,q1:[0,-1,0],q2:[0,-3,0]}]});assert.equal(trap.status,'OK');assert.ok(trap.positions.some(x=>Math.abs(x-(2+(-6+Math.sqrt(228))/2))<1e-9));
console.log('PASS partial/trapezoid extrema and concentrated moment left/right discontinuity');

const axial=envelope({...input,spanLoads:[{type:'point',a:2,q:[1,0,0]},{type:'point',a:3,q:[-1,0,0]}]});assert.equal(axial.reason,'CLASS_A_CONSTANT_TENSION_REQUIRED','axial interval hidden between original stations must reject');
assert.equal(classAMomentEnvelope({...input,spanLoads:[{type:'distributed-linear',a:8,b:2,q1:[0,1,0],q2:[0,1,0]}]},tuples,10).status,'NOT_CHECKED');
const many=Array.from({length:100},(_,i)=>({type:'distributed-linear',a:i/20,b:5+i/20,q1:[0,1,0],q2:[0,1,0]}));assert.equal(classAMomentEnvelope({...input,spanLoads:many},Array(600).fill(tuples[0]),10).reason,'CLASS_A_ENVELOPE_WORK_LIMIT');
const terminal=envelope({...input,spanLoads:[{type:'moment',a:10,axis:'z',M:100}]});assert.equal(terminal.tuples.find(t=>t.x===10).Mz,80,'member interior uses left limit at terminal moment');
console.log('PASS hidden axial interval rejection, invalid load domain, bounded work and physical end limits');

const split={version:'member-force-recovery-v3-piecewise',L:10,pieces:[{startX:0,endX:5,input:{...input,L:5,spanLoads:[]}},{startX:5,endX:10,input:{...input,L:5,endForces:[0,8,0,0,0,-40,0,0,0,0,0,0],spanLoads:[{type:'udl',q:[0,-4,0]}]}}]};
const splitResult=envelope(split);assert.equal(splitResult.status,'OK',JSON.stringify(splitResult));assert.ok(splitResult.tuples.some(t=>Math.abs(t.x-7)<1e-9&&Math.abs(t.Mz-48)<1e-9));
assert.equal(classAMomentEnvelope({...split,pieces:[split.pieces[0],{...split.pieces[1],startX:4}]},tuples,10).status,'NOT_CHECKED');
console.log('PASS piecewise recovery uses local roots and global station coordinates');

for(const pieces of [null,{},[null],[]])assert.equal(classAMomentEnvelope({...split,pieces},tuples,10).status,'NOT_CHECKED');
const splitTuples=[0,5,10].map(x=>{const f=memberForceFromRecovery(split,x);return {...tuples[0],...f,T:f.Tq,x};});
assert.equal(classAMomentEnvelope(split,splitTuples.map(t=>t.x===5?{...t,Mz:t.Mz+1}:t),10).reason,'BOUNDARY_RECOVERY_SOURCE_MISMATCH');
assert.equal(classAMomentEnvelope(split,splitTuples,10,['unsupported']).reason,'BOUNDARY_RECOVERY_LOAD_ISSUES');
console.log('PASS malformed piece sources, boundary source mismatch and upstream load issues reject');

const tensionInput={...input,endForces:input.endForces.map((v,i)=>i===0?-5:v)};const tensionEnvelope=envelope(tensionInput);assert.equal(tensionEnvelope.status,'OK',JSON.stringify(tensionEnvelope));assert.ok(tensionEnvelope.tuples.every(t=>t.N===5));
