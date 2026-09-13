import {memberForceFromRecovery,geometricForceAt} from '../../solver/memberForceField.js';
import {normalizedQuadraticRoots} from '../../core/normalizedQuadraticRoots.js';
// Called after validation/normalization by prepareRcSegmentForces. Within
// each load cell N/V are quadratic, My/Mz cubic and torque constant.
export function rcForceCriticalPositions(input){
 const {L,spanLoads}=input;
 const g0=input.version==='member-force-recovery-v2-geometric'?geometricForceAt(input.geometricEndForces,L,0):{},g1=input.version==='member-force-recovery-v2-geometric'?geometricForceAt(input.geometricEndForces,L,L):{};
 const derivative=key=>((g1[key]??0)-(g0[key]??0))/L;
 const bounds=[...new Set([0,L,...spanLoads.flatMap(r=>r.b===undefined?[r.a]:[r.a,r.b])])].sort((a,b)=>a-b),positions=[];
 for(let i=1;i<bounds.length;i++){
  const a=bounds[i-1],h=bounds[i]-a,mid=a+h/2,q=[0,0,0],slope=[0,0,0];
  for(const r of spanLoads)if(r.type==='distributed-linear'&&mid>r.a&&mid<r.b)for(let axis=0;axis<3;axis++){
   const gradient=(r.q2[axis]-r.q1[axis])/(r.b-r.a);q[axis]+=r.q1[axis]+gradient*(a-r.a);slope[axis]+=gradient;
  }
  const add=t=>{if(Number.isFinite(t)&&t>0&&t<1)positions.push(a+h*t);};
  // N'=-qx, Vy'=-qy, Vz'=-qz; component force extrema occur at q=0.
  for(let axis=0;axis<3;axis++)if(slope[axis]!==0)add((derivative(['N','Vy','Vz'][axis])-q[axis])/(slope[axis]*h));
  const start=memberForceFromRecovery({...input,version:'member-force-recovery-v1'},a,'right');
  // My'=-Vz and Mz'=-Vy, so moment extrema are shear zeroes.
  for(const [axis,key] of [[1,'Vy'],[2,'Vz']])for(const t of normalizedQuadraticRoots(-.5*slope[axis]*h*h,-q[axis]*h,start[key]-derivative(axis===1?'Mz':'My')))add(t);
 }
 return positions;
}
