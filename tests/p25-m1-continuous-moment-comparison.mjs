import assert from 'node:assert/strict';
import {continuousMomentComparisonPoints} from '../src/solver/pdelta/continuousMomentComparison.js';
const input=(endForces,spanLoads=[])=>({version:'member-force-recovery-v1',L:2,endForces,spanLoads});
const end=Array(12).fill(0);end[5]=-1;end[11]=1;
const a={forceRecoveryInput:input(end),xs:[0,2],My:[0,0],Mz:[1,1]};
const secondEnd=[...end];secondEnd[1]=2;secondEnd[7]=2;
const b={...a,forceRecoveryInput:input(secondEnd,[{type:'udl',shape:'uniform',q:[0,-2,0]}])};
const result=continuousMomentComparisonPoints(a,b,1.4);
assert.equal(result.status,'OK',JSON.stringify(result));
const peak=result.points.find(p=>Math.abs(p.x-1)<1e-10);assert.ok(peak,'interior extremum must be included even with only end stations');
assert.ok(Math.abs(peak.second.Mz-2)<1e-12);assert.equal(peak.first.Mz,1);
const zeroEnd=Array(12).fill(0);zeroEnd[5]=1;zeroEnd[1]=1;zeroEnd[11]=1;
const zero={...a,Mz:[-1,1],forceRecoveryInput:input(zeroEnd)};
const roots=continuousMomentComparisonPoints(zero,a,1.4);assert.equal(roots.status,'OK');assert.ok(roots.points.some(p=>Math.abs(p.first.Mz)<1e-12&&p.second.Mz===1));
const forged={...a,Mz:[2,1]};assert.equal(continuousMomentComparisonPoints(forged,b,1.4).reason,'CONTINUOUS_MOMENT_SOURCE_MISMATCH');
console.log('PASS independent interior parabola and reference-zero critical points; forged station source rejected');

const {compareFirstSecondOrderMoments}=await import('../src/solver/pdelta/momentComparison.js');
const ax={x:[1,0,0],y:[0,1,0],z:[0,0,1],L:2};
const compare=(f,s)=>compareFirstSecondOrderMoments({ok:true,memberResults:{M:{...f,ax}}},{ok:true,memberResults:{M:{...s,ax}}}).members.M;
const compared=compare(a,b);assert.equal(compared.status,'EXCEEDS_IN_RECOVERY_INTERVALS');assert.equal(compared.intervalCoverageVerified,true);
assert.equal(compare({...a,xs:[0,1,2],My:[0,0,0],Mz:[1,1,1]},b).status,'EXCEEDS_IN_RECOVERY_INTERVALS','different verified source grids can share one continuous recovery comparison');
const jump={...a,Mz:[1,2],forceRecoveryInput:input(end,[{type:'moment',a:1,axis:'z',M:-1}])};
const discontinuity=continuousMomentComparisonPoints(a,jump,1.4);assert.equal(discontinuity.status,'OK');
assert.equal(discontinuity.points.find(p=>p.x===1&&p.side==='left').second.Mz,1);
assert.equal(discontinuity.points.find(p=>p.x===1&&p.side==='right').second.Mz,2);
assert.equal(compare(a,jump).status,'EXCEEDS_IN_RECOVERY_INTERVALS');
assert.equal(compare(forged,b).reason,'CONTINUOUS_MOMENT_SOURCE_MISMATCH');
const unsupported={...b,forceRecoveryInput:{...b.forceRecoveryInput,spanLoads:[{type:'foundation-distributed'}]}};
const fallback=compare(a,unsupported);assert.equal(fallback.intervalCoverageVerified,false);assert.equal(fallback.status,'WITHIN_AT_RECORDED_STATIONS');
assert.equal(fallback.continuousComparisonReason,'CONTINUOUS_MOMENT_RECOVERY_SCOPE_REQUIRED');
console.log('PASS integrated continuous excess, differing grids, both sides of moment jump and explicit unsupported-field fallback');

const constant=(L,M)=>{const e=Array(12).fill(0);e[5]=-M;e[11]=M;return {...input(e),L};};
const pieces={version:'member-force-recovery-v3-piecewise',L:2,pieces:[{startX:0,endX:1,input:constant(1,1)},{startX:1,endX:2,input:constant(1,2)}]};
const split={...a,Mz:[1,2],forceRecoveryInput:pieces};
const splitComparison=compare(a,split);assert.equal(splitComparison.status,'EXCEEDS_IN_RECOVERY_INTERVALS');assert.equal(splitComparison.intervalCount,2);
const splitPoints=continuousMomentComparisonPoints(a,split,1.4);
assert.equal(splitPoints.points.find(p=>p.x===1&&p.side==='left').second.Mz,1);
assert.equal(splitPoints.points.find(p=>p.x===1&&p.side==='right').second.Mz,2);
const gap=structuredClone(split);gap.forceRecoveryInput.pieces[1].startX=1.1;
assert.equal(continuousMomentComparisonPoints(a,gap,1.4).reason,'CONTINUOUS_MOMENT_RECOVERY_SCOPE_REQUIRED');
console.log('PASS piecewise recovery boundary sides and malformed partition rejection');

const decimal={version:'member-force-recovery-v3-piecewise',L:2,pieces:[{startX:0,endX:.1,input:constant(.1,1)},{startX:.1,endX:2,input:{...constant(1.9,1),spanLoads:[{type:'moment',axis:'z',M:-1,a:.2}]}}]};
const decimalRow={...a,Mz:[1,2],forceRecoveryInput:decimal};
const decimalResult=continuousMomentComparisonPoints(a,decimalRow,1.4);assert.equal(decimalResult.status,'OK',JSON.stringify(decimalResult));
const boundary=.1+.2;
assert.equal(decimalResult.points.find(p=>p.x===boundary&&p.side==='left').second.Mz,1,'global-to-local rounding must not cross a recorded point-load boundary');
assert.equal(decimalResult.points.find(p=>p.x===boundary&&p.side==='right').second.Mz,2);
console.log('PASS decimal piece origin preserves exact one-sided point-load boundary');

// Independent cubic soil load q=-20*x^3 on L=2 gives M=1+16*x-x^5.
// Both end stations equal 1; the interior maximum is at (16/5)^(1/4).
const soilD=Array(12).fill(0);soilD[7]=160;soilD[11]=240;
const soilEnd=[...end];soilEnd[1]=16;
const soil={...a,forceRecoveryInput:input(soilEnd,[{type:'foundation-distributed',foundation:{active:true,behavior:'linear-bilateral',length:2,lineStiffness:{localY:1,localZ:0}},localDisplacements:soilD}])};
const soilResult=continuousMomentComparisonPoints(a,soil,1.4);
assert.equal(soilResult.status,'OK',JSON.stringify(soilResult));
const soilPeak=Math.pow(16/5,.25);
const governing=soilResult.points.find(p=>Math.abs(p.x-soilPeak)<1e-8);
assert.ok(governing,'quintic moment derivative root must be included');
assert.ok(Math.abs(governing.second.Mz-(1+16*soilPeak-soilPeak**5))<1e-8);
assert.equal(compare(a,soil).status,'EXCEEDS_IN_RECOVERY_INTERVALS');
console.log('PASS independent quintic Winkler moment interior peak beyond recorded end stations');

for(const patch of [{behavior:'compression-only'},{length:3},{lineStiffness:{localY:-1,localZ:0}},{timoshenko:{enabled:true,phiY:NaN,phiZ:0}}]){
 const bad=structuredClone(soil);Object.assign(bad.forceRecoveryInput.spanLoads[0].foundation,patch);
 assert.equal(continuousMomentComparisonPoints(a,bad,1.4).reason,'CONTINUOUS_MOMENT_RECOVERY_SCOPE_REQUIRED');
}
// Swapping the Hermite displacement plane must preserve the same physical polynomial.
const soilZ=structuredClone(soil),dZ=Array(12).fill(0);dZ[8]=160;dZ[10]=-240;
soilZ.My=[1,1];soilZ.Mz=[0,0];soilZ.forceRecoveryInput.endForces=Array(12).fill(0);soilZ.forceRecoveryInput.endForces[4]=1;soilZ.forceRecoveryInput.endForces[2]=16;
soilZ.forceRecoveryInput.spanLoads[0].foundation.lineStiffness={localY:0,localZ:1};soilZ.forceRecoveryInput.spanLoads[0].localDisplacements=dZ;
const zBase={...a,My:[1,1],Mz:[0,0],forceRecoveryInput:input(Array.from({length:12},(_,i)=>i===4?1:0))};
const zPoints=continuousMomentComparisonPoints(zBase,soilZ,1.4);assert.equal(zPoints.status,'OK');
assert.ok(zPoints.points.some(p=>Math.abs(p.x-soilPeak)<1e-8&&Math.abs(p.second.My-(1+16*soilPeak-soilPeak**5))<1e-8));

const shearSoil=structuredClone(soil),phi=2;
shearSoil.forceRecoveryInput.spanLoads[0].foundation.timoshenko={enabled:true,phiY:phi,phiZ:phi};
const soilMoment=x=>-(x**5+5*phi*x**4-20/3*phi*x**3)/(1+phi);
const initialShear=-soilMoment(2)/2;
shearSoil.forceRecoveryInput.endForces[1]=initialShear;
const shearResult=continuousMomentComparisonPoints(a,shearSoil,1.4);assert.equal(shearResult.status,'OK');
for(const p of shearResult.points)assert.ok(Math.abs(p.second.Mz-(1+initialShear*p.x+soilMoment(p.x)))<1e-8);
const shearCritical=shearResult.points.filter(p=>p.x>1e-8&&p.x<2-1e-8&&Math.abs(initialShear-(5*p.x**4+20*phi*p.x**3-20*phi*p.x**2)/(1+phi))<1e-7);
assert.ok(shearCritical.length>0,'Timoshenko foundation polynomial interior extrema');
console.log('PASS both bending planes, Timoshenko polynomial and unsupported foundation policy rejection');
