import assert from 'node:assert/strict';
import {prepareRcSegmentForces} from '../src/compute/product/rcSegmentForceRecovery.js';
import {memberForceFromRecovery} from '../src/solver/memberForceField.js';
import {verifyRecoverySource} from '../src/compute/product/recoverySourceVerification.js';
const elastic=[0,2,0,0,0,0,0,-2,0,0,0,8],geometric=[0,.3,0,0,0,1,0,-.3,0,0,0,-3],total=elastic.map((v,i)=>v+geometric[i]);
const r=prepareRcSegmentForces({source:{memberId:'A',startX:0,endX:4},localEndForces:total,geometricEndForces:geometric});assert.equal(r.forceRecoveryInput.version,'member-force-recovery-v2-geometric');assert.ok(r.forceRecoveryInput.endForces.every((v,i)=>Math.abs(v-elastic[i])<1e-12));assert.deepEqual(r.forceRecoveryInput.geometricEndForces,geometric);assert.ok(r.equilibriumResidual<1e-12);const at=memberForceFromRecovery(r.forceRecoveryInput,2);assert.ok(Math.abs(at.Mz-2)<1e-12);assert.equal(verifyRecoverySource(r.forceRecoveryInput,r.stations.map(s=>({...s,T:s.Tq})),4).status,'OK');
// Uniform transverse load plus a linear geometric moment shifts the extremum.
const ends=[0,2,0,0,0,0,0,2,0,0,0,0],g=[0,0,0,0,0,0,0,0,0,0,0,2];
const ext=prepareRcSegmentForces({source:{memberId:'A',startX:0,endX:4},localEndForces:ends.map((v,i)=>v+g[i]),geometricEndForces:g,memberLoads:[{type:'distributed-linear',a:0,b:4,q1:[0,-1,0],q2:[0,-1,0]}]});assert.ok(ext.stations.some(s=>Math.abs(s.x-2.5)<1e-10));assert.ok(Math.abs(ext.envelope.Mz.maximum.value-3.125)<1e-10);
assert.throws(()=>prepareRcSegmentForces({source:{startX:0,endX:4},localEndForces:total,geometricEndForces:[NaN]}));
console.log('PASS RC geometric force decomposition, independent interior moment and shifted polynomial extremum');

import {solveRcLapNetwork} from '../src/solver/rcLapNetwork.js';
const loads=Array(12).fill(0);loads[6]=-100;loads[8]=.01;
const result=solveRcLapNetwork({nodes:[{x:0,y:0,z:0},{x:3,y:0,z:0}],elements:[{nodes:[0,1],B:.3,H:.6,Ec:25000,Es:200000,bars:[-.2,.2].flatMap(y=>[-.08,.08].map(z=>({y,z,area:.0003}))),GJ:1000,laps:[],subdivisions:8}],loads,fixedDofs:[0,1,2,3,4,5],pDeltaMethod:'direct',tolerance:1e-10});assert.equal(result.ok,true);
const e=result.elementResults[0];const actual=prepareRcSegmentForces({source:{memberId:'AB',startX:0,endX:3},localEndForces:e.boundaryEndForces,geometricEndForces:e.geometricEndForces});assert.ok(actual.equilibriumResidual<1e-6);assert.equal(verifyRecoverySource(actual.forceRecoveryInput,actual.stations.map(s=>({...s,T:s.Tq})),3).status,'OK');assert.ok(actual.stations.every(s=>Number.isFinite(s.My)));
console.log('PASS actual direct RC kernel material/geometric recovery and standard source verification');
