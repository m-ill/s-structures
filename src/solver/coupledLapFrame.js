import {frameAxialBendingRows,withoutFrameRigidMotion} from './frameAxialBending.js';
import {invertPositiveMatrix} from './coupledFrameFlexibility.js';
export const COUPLED_LAP_FRAME_VERSION='p25-coupled-lap-frame-v3-quadratic-slip';
// Euler-Bernoulli frame u,v,w,rx,ry,rz, with ry=-w' and rz=v'.
// Each bar strain is u'-y*v''-z*w''+s'. Slips are section-relative.
// Linear slip elements and two-point Gauss integration minimize physical
// steel/interface energy for the prescribed cubic frame displacement field.
export function coupledLapFrame({length:L,transferStiffness:k,bars,endDisplacements:u,subdivisions:n=16,boundarySlips,slipOrder=1}){
 const fail=code=>{throw Object.assign(Error(code),{code});};
 if(![L,k].every(v=>Number.isFinite(v)&&v>0)||!Number.isInteger(n)||n<1||n>64||!Array.isArray(bars)||bars.length!==2||bars.some(b=>![b.EA,b.y,b.z].every(Number.isFinite)||b.EA<=0)||!Array.isArray(u)||u.length!==12||!u.every(Number.isFinite))fail('LAP_FRAME_INPUT_INVALID');
 if(![1,2].includes(slipOrder)||n*slipOrder>64)fail('LAP_FRAME_INPUT_INVALID');
 const intervals=n*slipOrder;
 const portMode=boundarySlips!==undefined;
 if(portMode&&(!Array.isArray(boundarySlips)||boundarySlips.length!==4||!boundarySlips.every(Number.isFinite)))fail('LAP_FRAME_INPUT_INVALID');
 const size=12+2*(intervals+1),matrix=Array.from({length:size},()=>Array(size).fill(0)),h=L/n,points=[];
 const slipIndex=(bar,node)=>12+2*node+bar;
 const add=(entries,factor)=>{for(const [i,a] of entries)for(const [j,b] of entries)matrix[i][j]+=factor*a*b;};
 const gauss=slipOrder===2?[[-Math.sqrt(3/5),5/9],[0,8/9],[Math.sqrt(3/5),5/9]]:[[-1/Math.sqrt(3),1],[1/Math.sqrt(3),1]];
 for(let e=0;e<n;e++)for(const [g,w] of gauss){
  const t=(1+g)/2,x=(e+t)*h,weight=w*h/2,A=frameAxialBendingRows(L,x);
  const shape=slipOrder===2?[2*t*t-3*t+1,4*t*(1-t),2*t*t-t]:[1-t,t],derivative=slipOrder===2?[(4*t-3)/h,(4-8*t)/h,(4*t-1)/h]:[-1/h,1/h];
  const strainRows=bars.map((bar,b)=>{
   const row=A[0].map((v,i)=>[i,v-bar.z*A[1][i]-bar.y*A[2][i]]).filter(([,v])=>v!==0);
   derivative.forEach((v,j)=>row.push([slipIndex(b,e*slipOrder+j),v]));
   add(row,weight*bar.EA);return row;
  });
  const slipRow=shape.flatMap((v,j)=>[[slipIndex(0,e*slipOrder+j),v],[slipIndex(1,e*slipOrder+j),-v]]);
  add(slipRow,weight*k);points.push({x,weight,strainRows,slipRow});
 }
 // Incoming bar attached at x=0; outgoing at x=L. All other slip DOFs
 // (including the opposite free tips) follow stationarity of total energy.
 const ends=[slipIndex(0,0),slipIndex(1,0),slipIndex(0,intervals),slipIndex(1,intervals)];
 const retained=[...Array.from({length:12},(_,i)=>i),...(portMode?ends:[])];
 const fixed=new Set(portMode?ends:[slipIndex(0,0),slipIndex(1,intervals)]),free=Array.from({length:size-12},(_,i)=>i+12).filter(i=>!fixed.has(i));
 const inverse=free.length?invertPositiveMatrix(free.map(i=>free.map(j=>matrix[i][j])),free.length):[];
 if(!inverse)fail('LAP_FRAME_CONDENSATION_SINGULAR');
 const recovery=inverse.map(row=>retained.map(j=>-row.reduce((sum,v,i)=>sum+v*matrix[free[i]][j],0)));
 const stiffness=retained.map(i=>retained.map((j,b)=>matrix[i][j]+free.reduce((sum,f,a)=>sum+matrix[i][f]*recovery[a][b],0)));
 // Remove only host rigid motion: section-relative slips remain unchanged.
 const q=[...withoutFrameRigidMotion(u,L),...(portMode?boundarySlips:[])];
 const state=Array(size).fill(0);retained.forEach((f,i)=>{state[f]=q[i];});
 free.forEach((f,a)=>{state[f]=recovery[a].reduce((s,v,i)=>s+v*q[i],0);});
 const dot=row=>row.reduce((sum,[i,v])=>sum+v*state[i],0);
 const endForces=Array(12).fill(0),residual=Array(size).fill(0);let strainEnergy=0;
 const integrationPoints=points.map(p=>{
  const forces=p.strainRows.map((row,b)=>bars[b].EA*dot(row)),slip=dot(p.slipRow);
  p.strainRows.forEach((row,b)=>row.forEach(([i,v])=>{residual[i]+=p.weight*v*forces[b];}));
  p.slipRow.forEach(([i,v])=>{residual[i]+=p.weight*v*k*slip;});
  strainEnergy+=p.weight*(forces[0]**2/bars[0].EA+forces[1]**2/bars[1].EA+k*slip**2)/2;
  return {x:p.x,weight:p.weight,force1:forces[0],force2:forces[1],slip};
 });
 const maximumBarForces=[0,0];let maximumRelativeSlip=0;
 for(let e=0;e<n;e++){
  const first=integrationPoints[e*gauss.length],last=integrationPoints[(e+1)*gauss.length-1],g=gauss.at(-1)[0];
  // Steel strain is linear in each cell for both interpolation orders.
  for(let b=0;b<2;b++){
   const f=first[`force${b+1}`],l=last[`force${b+1}`],mean=(f+l)/2,delta=(l-f)/(2*g);
   maximumBarForces[b]=Math.max(maximumBarForces[b],Math.abs(mean-delta),Math.abs(mean+delta));
  }
  const values=Array.from({length:slipOrder+1},(_,j)=>state[slipIndex(0,e*slipOrder+j)]-state[slipIndex(1,e*slipOrder+j)]);
  maximumRelativeSlip=Math.max(maximumRelativeSlip,...values.map(Math.abs));
  if(slipOrder===2){const [c,m,end]=values,a=2*(c+end-2*m),b=4*m-3*c-end,t=a===0?-1:-b/(2*a);if(t>0&&t<1)maximumRelativeSlip=Math.max(maximumRelativeSlip,Math.abs((a*t+b)*t+c));}
 }
 for(let i=0;i<12;i++)endForces[i]=residual[i];
 const internalResidual=Math.max(0,...free.map(i=>Math.abs(residual[i])));
 if(![...stiffness.flat(),...state,...endForces,...maximumBarForces,maximumRelativeSlip,strainEnergy,internalResidual].every(Number.isFinite))fail('LAP_FRAME_NUMERIC_RANGE');
 return {version:COUPLED_LAP_FRAME_VERSION,stiffness,stiffnessReferenceDiagonal:retained.map(i=>matrix[i][i]),boundarySlipForces:portMode?ends.map(i=>residual[i]):null,boundarySlipOrder:portMode?['bar1-start','bar2-start','bar1-end','bar2-end']:null,boundarySlipMode:portMode?'retained-for-shared-assembly':'attached-incoming-outgoing-free-opposite-tips',endForces,strainEnergy,internalResidual,maximumBarForces,maximumRelativeSlip,integrationPoints,slips:Array.from({length:intervals+1},(_,i)=>({x:i*h/slipOrder,bar1:state[slipIndex(0,i)],bar2:state[slipIndex(1,i)]})),subdivisions:n,slipOrder,internalDofCount:free.length,frameDofOrder:['u','v','w','rx','ry','rz','u-end','v-end','w-end','rx-end','ry-end','rz-end'],strainBasis:"u'-y*v''-z*w''+s'",method:slipOrder===2?'cubic-frame-quadratic-slip-Gauss3-static-condensation':'cubic-frame-linear-slip-Gauss2-static-condensation',concreteIncluded:false,globalAssemblyIncluded:false,designTransferAllowed:false};
}
