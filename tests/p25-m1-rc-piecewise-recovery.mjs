import assert from 'node:assert/strict';
import {solveRcLapNetwork} from '../src/solver/rcLapNetwork.js';
import {prepareRcSegmentForces} from '../src/compute/product/rcSegmentForceRecovery.js';
import {prepareRcMemberForceSources} from '../src/compute/product/rcMemberForceSources.js';
import {memberForceFromRecovery} from '../src/solver/memberForceField.js';
import {verifyRecoverySource} from '../src/compute/product/recoverySourceVerification.js';
const nodes=[0,1.5,3].map(x=>({x,y:0,z:0})),bars=[-.2,.2].flatMap(y=>[-.08,.08].map(z=>({y,z,area:.0003}))),base={B:.3,H:.6,Ec:25000,Es:200000,bars,GJ:1000,laps:[],subdivisions:8},loads=Array(18).fill(0);loads[12]=-100;loads[14]=.01;
const r=solveRcLapNetwork({nodes,elements:[{...base,nodes:[0,1]},{...base,nodes:[1,2]}],fixedDofs:[0,1,2,3,4,5],loads,pDeltaMethod:'direct',tolerance:1e-10});assert.equal(r.ok,true);
const segments=r.elementResults.map((e,i)=>{const source={memberId:'AB',detailId:'R',detailVersion:1,startX:1.5*i,endX:1.5*(i+1)};return {...source,localEndForces:e.boundaryEndForces,forceRecovery:prepareRcSegmentForces({source,localEndForces:e.boundaryEndForces,geometricEndForces:e.geometricEndForces})};});
const m=prepareRcMemberForceSources(segments).AB;assert.equal(m.forceRecoveryInput.version,'member-force-recovery-v3-piecewise');assert.equal(m.forceRecoveryInput.pieces.length,2);
for(const x of [.25,1.5,2.75]){const index=x<1.5?0:1,a=memberForceFromRecovery(m.forceRecoveryInput,x),b=memberForceFromRecovery(segments[index].forceRecovery.forceRecoveryInput,x-index*1.5);for(const key of Object.keys(a))assert.ok(Math.abs(a[key]-b[key])<1e-12);}
const tuples=m.xs.map((x,i)=>({x,side:m.stationSides[i],...Object.fromEntries(['N','Vy','Vz','T','My','Mz'].map(k=>[k,m[k][i]]))}));assert.equal(verifyRecoverySource(m.forceRecoveryInput,tuples,3).status,'OK');
const corrupt=structuredClone(m.forceRecoveryInput);corrupt.pieces[1].startX=1.6;assert.throws(()=>memberForceFromRecovery(corrupt,2));
const mismatch=structuredClone(segments);mismatch[0].forceRecovery.stations[1].My+=1;assert.throws(()=>prepareRcMemberForceSources(mismatch),{code:'RC_MEMBER_SEGMENT_SOURCE_MISMATCH'});
console.log('PASS actual split direct RC piecewise forces, boundary sides, standard verification and corruption rejection');
