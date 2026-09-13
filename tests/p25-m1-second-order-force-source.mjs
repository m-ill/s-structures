import assert from 'node:assert/strict';
import {createCantileverTipLoad,runSecondOrderPDelta} from '../src/index.js';
import {memberForceFromRecovery} from '../src/solver/memberForceField.js';
import {verifyRecoverySource} from '../src/compute/product/recoverySourceVerification.js';
const m=createCantileverTipLoad().model,member=m.members[0];
m.loads.push({id:'axial',type:'nodal',node:member.n2,P:100,dir:'-x',case:'D'});
const direct=runSecondOrderPDelta(m,{D:1},{loadSteps:2});assert.equal(direct.ok,true,JSON.stringify(direct));
const r=direct.result.memberResults[member.id],input=r.forceRecoveryInput;
assert.equal(input.version,'member-force-recovery-v2-geometric');
assert.deepEqual(input.geometricEndForces,r.geometricEnd);
const tuples=r.xs.map((x,i)=>({x,N:r.N[i],Vy:r.Vy[i],Vz:r.Vz[i],T:r.Tq[i],My:r.My[i],Mz:r.Mz[i]}));
assert.equal(verifyRecoverySource(input,tuples,r.L).status,'OK');
for(let i=0;i<r.xs.length;i++){
 const f=memberForceFromRecovery(input,r.xs[i]);
 for(const key of ['N','Vy','Vz','Tq','My','Mz'])assert.ok(Math.abs(f[key]-r[key][i])<1e-9,`${key} at ${r.xs[i]}`);
}
const damaged=structuredClone(input);damaged.geometricEndForces[5]+=1;
assert.equal(verifyRecoverySource(damaged,tuples,r.L).status,'NOT_CHECKED');
delete damaged.geometricEndForces;assert.throws(()=>memberForceFromRecovery(damaged,r.L/2),/GEOMETRIC_FORCE_SOURCE_INVALID/);
console.log('PASS actual direct P-delta arbitrary-station recovery agrees with all reported second-order forces');
