import {clipPolygon,polygonMoments} from '../core/polygonMoments.js';
import {coupledLapFrame} from './coupledLapFrame.js';
import {frameAxialBendingRows,withoutFrameRigidMotion} from './frameAxialBending.js';
export const RC_LAP_FRAME_VERSION='p25-rc-lap-frame-v5-initial-strain';
// Rectangular compression-only host; elastic point steel fibres displace
// host concrete at their physical coordinates, irrespective of steel slip.
// A spliced original is replaced, not supplemented, by its two-piece system.
export function rcLapFrame({length:L,B,H,Ec,Es,bars,laps,endDisplacements:u,subdivisions:n=16,slipOrder=1,initialStrains={}}){
 const fail=code=>{throw Object.assign(Error(code),{code});};
 if(![L,B,H,Ec,Es].every(v=>Number.isFinite(v)&&v>0)||Es<=Ec||!Array.isArray(u)||u.length!==12||!u.every(Number.isFinite)||!Number.isInteger(n)||n<1||n>64)fail('RC_LAP_INPUT_INVALID');
 if(![1,2].includes(slipOrder)||n*slipOrder>64)fail('RC_LAP_INPUT_INVALID');
 const validBar=b=>[b?.y,b?.z,b?.area].every(Number.isFinite)&&b.area>0&&Math.abs(b.y)<H/2&&Math.abs(b.z)<B/2;
 if(!Array.isArray(bars)||!bars.length||bars.length>100||!bars.every(validBar)||!Array.isArray(laps)||laps.length*n*slipOrder>256)fail('RC_LAP_INPUT_INVALID');
 const selected=new Set();for(const lap of laps){
  if(!Number.isInteger(lap.barIndex)||lap.barIndex<0||lap.barIndex>=bars.length||selected.has(lap.barIndex)||!validBar(lap.offset)||!Number.isFinite(lap.transferStiffness)||lap.transferStiffness<=0||!['offset-toward-start','offset-toward-end'].includes(lap.continuationSide))fail('RC_LAP_ASSIGNMENT_INVALID');
  selected.add(lap.barIndex);
 }
 const physical=[...bars,...laps.map(l=>l.offset)];if(physical.reduce((s,b)=>s+b.area,0)>=B*H)fail('RC_LAP_CONCRETE_AREA_INVALID');
 if(!initialStrains||typeof initialStrains!=='object'||Array.isArray(initialStrains)||Object.keys(initialStrains).some(k=>!['concrete','steel'].includes(k))||Object.values(initialStrains).some(v=>!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite)))fail('RC_LAP_INITIAL_STRAIN_INVALID');
 // Generalized free strains [u', w'', v'']; rotations ry=-w', rz=v'.
 const mechanical=(strain=[0,0,0])=>{const q=withoutFrameRigidMotion(u,L);q[6]-=strain[0]*L;q[8]-=strain[1]*L*L/2;q[10]+=strain[1]*L;q[7]-=strain[2]*L*L/2;q[11]-=strain[2]*L;return q;};
 const qc=mechanical(initialStrains.concrete),qs=mechanical(initialStrains.steel),zero=()=>({forces:Array(12).fill(0),matrix:Array.from({length:12},()=>Array(12).fill(0)),energy:0});
 const parts={concreteGross:zero(),displacedConcrete:zero(),retainedSteel:zero(),lapSteel:zero()},lapResponses=[],portBlocks=[];
 let maximumSteelStress=0,maximumRelativeSlip=0;
 for(const lap of laps){
  const original=bars[lap.barIndex],pair=lap.continuationSide==='offset-toward-start'?[lap.offset,original]:[original,lap.offset];
  const r=coupledLapFrame({length:L,transferStiffness:lap.transferStiffness,bars:pair.map(b=>({EA:Es*b.area*1000,y:b.y,z:b.z})),endDisplacements:qs,subdivisions:n,slipOrder,boundarySlips:lap.boundarySlips});
  if(r.boundarySlipForces)portBlocks.push({lapIndex:laps.indexOf(lap),barIndex:lap.barIndex,spliceId:lap.spliceId,spliceVersion:lap.spliceVersion,response:r});
  parts.lapSteel.energy+=r.strainEnergy;
  for(let i=0;i<12;i++){parts.lapSteel.forces[i]+=r.endForces[i];for(let j=0;j<12;j++)parts.lapSteel.matrix[i][j]+=r.stiffness[i][j];}
  lapResponses.push({barIndex:lap.barIndex,maximumBarForces:r.maximumBarForces,maximumRelativeSlip:r.maximumRelativeSlip,internalResidual:r.internalResidual,integrationPoints:r.integrationPoints,slips:r.slips});
  maximumRelativeSlip=Math.max(maximumRelativeSlip,r.maximumRelativeSlip);
  maximumSteelStress=Math.max(maximumSteelStress,...r.maximumBarForces.map((force,b)=>force/(pair[b].area*1000)));
 }
 for(const x of [0,L]){
  const A=frameAxialBendingRows(L,x),strain=A.map(row=>row.reduce((s,v,i)=>s+v*qs[i],0));
  bars.forEach((b,i)=>{if(!selected.has(i))maximumSteelStress=Math.max(maximumSteelStress,Math.abs(Es*(strain[0]-b.z*strain[1]-b.y*strain[2])));});
 }
 const polygon=[[-H/2,-B/2],[H/2,-B/2],[H/2,B/2],[-H/2,B/2]],h=L/n;
 for(let e=0;e<n;e++)for(const g of [-1/Math.sqrt(3),1/Math.sqrt(3)]){
  const x=(e+(1+g)/2)*h,w=h/2,A=frameAxialBendingRows(L,x),strain=A.map(row=>row.reduce((s,v,i)=>s+v*qc[i],0));
  const p=polygonMoments(clipPolygon(polygon,-strain[0],strain[2],strain[1]));
  const J=[[p.A,-p.Y,-p.X],[-p.Y,p.YY,p.XY],[-p.X,p.XY,p.XX]].map(row=>row.map(v=>v*Ec*1000));
  const gross=parts.concreteGross,force=J.map(row=>row.reduce((s,v,i)=>s+v*strain[i],0));
  gross.energy+=w*strain.reduce((s,v,i)=>s+v*force[i],0)/2;
  for(let i=0;i<12;i++){
   gross.forces[i]+=w*A.reduce((s,row,a)=>s+row[i]*force[a],0);
   for(let j=0;j<12;j++)for(let a=0;a<3;a++)for(let b=0;b<3;b++)gross.matrix[i][j]+=w*A[a][i]*J[a][b]*A[b][j];
  }
  const addBar=(bar,part,E,compressionOnly)=>{
   const q=compressionOnly?qc:qs;
   const row=A[0].map((v,i)=>v-bar.z*A[1][i]-bar.y*A[2][i]),eps=row.reduce((s,v,i)=>s+v*q[i],0);
   if(compressionOnly&&eps>0)return;const factor=w*E*bar.area*1000;
   part.energy+=factor*eps**2/2;
   for(let i=0;i<12;i++){part.forces[i]+=factor*eps*row[i];for(let j=0;j<12;j++)part.matrix[i][j]+=factor*row[i]*row[j];}
  };
  physical.forEach(b=>addBar(b,parts.displacedConcrete,Ec,true));
  bars.forEach((b,i)=>{if(!selected.has(i))addBar(b,parts.retainedSteel,Es,false);});
 }
 const entries=Object.entries(parts),sign=name=>name==='displacedConcrete'?-1:1;
 const endForces=Array.from({length:12},(_,i)=>entries.reduce((s,[name,p])=>s+sign(name)*p.forces[i],0));
 const tangent=Array.from({length:12},(_,i)=>Array.from({length:12},(_,j)=>entries.reduce((s,[name,p])=>s+sign(name)*p.matrix[i][j],0)));
 // Host block already contains each lap exactly once. Append only the
 // host/slip and slip/slip blocks; concrete sees the host strain alone.
 let slipAssembly=null;
 if(portBlocks.length){
  const size=12+4*portBlocks.length,expanded=Array.from({length:size},(_,i)=>Array.from({length:size},(_,j)=>i<12&&j<12?tangent[i][j]:0)),forces=[...endForces],ports=[];
  portBlocks.forEach(({lapIndex,barIndex,spliceId,spliceVersion,response:r},p)=>{
   const offset=12+4*p;forces.push(...r.boundarySlipForces);
   ports.push({lapIndex,barIndex,spliceId,spliceVersion,offset,order:r.boundarySlipOrder});
   for(let a=0;a<4;a++){
    for(let i=0;i<12;i++){expanded[i][offset+a]=r.stiffness[i][12+a];expanded[offset+a][i]=r.stiffness[12+a][i];}
    for(let b=0;b<4;b++)expanded[offset+a][offset+b]=r.stiffness[12+a][12+b];
   }
  });
  if(!forces.every(Number.isFinite)||!expanded.every(row=>row.every(Number.isFinite)))fail('RC_LAP_NUMERIC_RANGE');
  slipAssembly={version:'p25-rc-lap-slip-assembly-v1',tangent:expanded,forces,ports,hostDofCount:12,boundaryConditionsApplied:false};
 }
 const strainEnergy=entries.reduce((s,[name,p])=>s+sign(name)*p.energy,0);
 if(![maximumSteelStress,maximumRelativeSlip,...endForces,...tangent.flat(),strainEnergy].every(Number.isFinite))fail('RC_LAP_NUMERIC_RANGE');
 return {version:RC_LAP_FRAME_VERSION,initialStrainIncluded:Object.values(initialStrains).some(v=>v.some(x=>x!==0)),initialStrains:structuredClone(initialStrains),maximumSteelStress,maximumRelativeSlip,stressUnit:"MPa",slipAssembly,tangent,endForces,strainEnergy,components:Object.fromEntries(entries.map(([name,p])=>[name,{forces:p.forces,energy:p.energy,assemblySign:sign(name)}])),lapResponses,subdivisions:n,slipOrder,originalSteelReplaced:true,physicalSteelPieceCount:physical.length,concreteIncluded:true,concreteDisplacementBasis:'point-fibres at host plane-section strain; both physical lap pieces',shearTorsionIncluded:false,globalAssemblyIncluded:false,designTransferAllowed:false};
}
