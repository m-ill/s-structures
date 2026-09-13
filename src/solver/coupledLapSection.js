import {elasticLapElement} from './elasticLapElement.js';
import {invertPositiveMatrix} from './coupledFrameFlexibility.js';
export const COUPLED_LAP_SECTION_VERSION='p25-coupled-lap-section-v1';
// q=[u,psiY,psiZ] at each end; bar strain = [1,-z,y]*q' + s'.
// s is slip relative to the rotating section, not absolute axial displacement.
// Constant section strains plus the exact relative-slip field define this
// element. It contains the two steel pieces/interface, no concrete stiffness.
export function coupledLapSection({length:L,transferStiffness:k,bars,endSectionDisplacements:q,samples=17}){
 const fail=code=>{throw Object.assign(new Error(code),{code});};
 if(!Array.isArray(bars)||bars.length!==2||bars.some(b=>![b.EA,b.y,b.z].every(Number.isFinite)||b.EA<=0)||!Array.isArray(q)||q.length!==6||!q.every(Number.isFinite))fail('LAP_SECTION_COUPLING_INPUT_INVALID');
 const slipZero=elasticLapElement({length:L,EA1:bars[0].EA,EA2:bars[1].EA,transferStiffness:k,endDisplacements:[0,0,0,0],samples:2});
 const matrix=Array.from({length:10},()=>Array(10).fill(0)),r=bars.map(b=>[1,-b.z,b.y]),g=r.map(row=>[...row.map(v=>-v/L),...row.map(v=>v/L)]),d=[[-1,0,1,0],[0,-1,0,1]];
 for(let i=0;i<4;i++)for(let j=0;j<4;j++)matrix[6+i][6+j]=slipZero.stiffness[i][j];
 for(let bar=0;bar<2;bar++)for(let i=0;i<6;i++){
  for(let j=0;j<6;j++)matrix[i][j]+=bars[bar].EA*L*g[bar][i]*g[bar][j];
  for(let j=0;j<4;j++){const value=bars[bar].EA*g[bar][i]*d[bar][j];matrix[i][6+j]+=value;matrix[6+j][i]+=value;}
 }
 // Incoming bar 1 is attached at the start, outgoing bar 2 at the end.
 // The other two tips carry no axial force and are statically condensed.
 const free=[7,8],inverse=invertPositiveMatrix(free.map(i=>free.map(j=>matrix[i][j])),2);
 if(!inverse)fail('LAP_SECTION_COUPLING_SINGULAR');
 const recovery=inverse.map(row=>Array.from({length:6},(_,j)=>-row.reduce((sum,v,i)=>sum+v*matrix[free[i]][j],0)));
 const condensedStiffness=Array.from({length:6},(_,i)=>Array.from({length:6},(_,j)=>matrix[i][j]+free.reduce((sum,f,a)=>sum+matrix[i][f]*recovery[a][j],0)));
 const delta=q.slice(3).map((v,i)=>v-q[i]),relativeQ=[0,0,0,...delta],slips=[0,...recovery.map(row=>row.reduce((sum,v,i)=>sum+v*relativeQ[i],0)),0];
 const slipState=elasticLapElement({length:L,EA1:bars[0].EA,EA2:bars[1].EA,transferStiffness:k,endDisplacements:slips,samples});
 const c=r.map(row=>row.reduce((sum,v,i)=>sum+v*delta[i]/L,0)),baseForces=c.map((v,i)=>v*bars[i].EA);
 const generalized=[...relativeQ,...slips];
 const sectionEndForces=matrix.slice(0,6).map(row=>row.reduce((sum,v,i)=>sum+v*generalized[i],0));
 const slipEndForces=slipState.endForces.map((v,i)=>v+(i<2?-1:1)*baseForces[i%2]);
 const strainEnergy=slipState.strainEnergy+bars.reduce((sum,b,i)=>sum+b.EA*(L*c[i]*c[i]/2+c[i]*(slips[i+2]-slips[i])),0);
 const stations=slipState.stations.map(s=>{
  const section=q.slice(0,3).map((v,i)=>v+delta[i]*s.x/L);
  return {...s,u1:s.u1+r[0].reduce((sum,v,i)=>sum+v*section[i],0),u2:s.u2+r[1].reduce((sum,v,i)=>sum+v*section[i],0),force1:s.force1+baseForces[0],force2:s.force2+baseForces[1]};
 });
 if(![...matrix.flat(),...condensedStiffness.flat(),...sectionEndForces,...slipEndForces,strainEnergy,...stations.flatMap(s=>Object.values(s))].every(Number.isFinite))fail('LAP_SECTION_COUPLING_NUMERIC_RANGE');
 return {version:COUPLED_LAP_SECTION_VERSION,fullStiffness:matrix,condensedStiffness,slipRecovery:recovery,sectionEndForces,slipEndForces,slipEndDisplacements:slips,strainEnergy,stations,sectionDofOrder:['u-start','psiY-start','psiZ-start','u-end','psiY-end','psiZ-end'],fullDofOrder:['u-start','psiY-start','psiZ-start','u-end','psiY-end','psiZ-end','s1-start','s2-start','s1-end','s2-end'],sectionStrainBasis:'epsilon-z*kappaY+y*kappaZ; kappa=dpsi/dx',slipBasis:'relative-to-section-motion',concreteIncluded:false,globalAssemblyIncluded:false,designTransferAllowed:false};
}
