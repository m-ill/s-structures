import {elasticLapBasis} from '../core/elasticLapBasis.js';
export const ELASTIC_LAP_ELEMENT_VERSION='p25-elastic-lap-element-v1';
// Exact boundary element for two axial rods coupled by a distributed linear
// interbar spring. Endpoint DOFs: u1(0), u2(0), u1(L), u2(L).
// E = (EA1+EA2)/(2L)*(wL-w0)^2 + reducedEA/2 * [delta*delta']_0^L.
export function elasticLapElement({length:L,EA1,EA2,transferStiffness:k,endDisplacements:u,samples=17}){
 const fail=code=>{throw Object.assign(new Error(code),{code});};
 if(!Array.isArray(u)||u.length!==4||!u.every(Number.isFinite)||!Number.isInteger(samples)||samples<2||samples>33)fail('ELASTIC_LAP_ELEMENT_INPUT_INVALID');
 const {sum,beta,t,a,b,reducedEA,sinhRatio,coshRatio}=elasticLapBasis({length:L,EA1,EA2,transferStiffness:k});
 const m=[-a,-b,a,b],d0=[1,-1,0,0],dL=[0,0,1,-1],q=reducedEA*beta*coshRatio(0),extra=reducedEA*beta*Math.tanh(t/2),p=q+extra;
 const stiffness=m.map((mi,i)=>m.map((mj,j)=>sum/L*mi*mj+p*(d0[i]*d0[j]+dL[i]*dL[j])-q*(d0[i]*dL[j]+dL[i]*d0[j])));
 const delta0=u[0]-u[1],deltaL=u[2]-u[3],dw=a*(u[2]-u[0])+b*(u[3]-u[1]),N=sum/L*dw;
 // Differences avoid multiplying a large rigid translation by K. Separating
 // coth-csch=tanh(t/2) preserves constant slip with very small k.
 const g0=extra*delta0+q*(delta0-deltaL),gL=extra*deltaL+q*(deltaL-delta0);
 const endForces=[-a*N+g0,-b*N-g0,a*N+gL,b*N-gL];
 const strainEnergy=(N*dw+extra*(delta0*delta0+deltaL*deltaL)+q*(delta0-deltaL)**2)/2;
 const stations=Array.from({length:samples},(_,i)=>{
  const x=L*i/(samples-1),slip=delta0*sinhRatio(beta*(L-x))+deltaL*sinhRatio(beta*x),derivative=beta*(-delta0*coshRatio(beta*(L-x))+deltaL*coshRatio(beta*x));
  const force1=a*N+reducedEA*derivative,force2=b*N-reducedEA*derivative,w=u[0]-b*delta0+dw*x/L;
  return {x,slip,u1:w+b*slip,u2:w-a*slip,force1,force2,transferPerLength:-k*slip};
 });
 if(![...stiffness.flat(),...endForces,strainEnergy,...stations.flatMap(s=>Object.values(s))].every(Number.isFinite))fail('ELASTIC_LAP_ELEMENT_NUMERIC_RANGE');
 return {version:ELASTIC_LAP_ELEMENT_VERSION,stiffness,endForces,strainEnergy,stations,dofOrder:['u1-start','u2-start','u1-end','u2-end'],units:{displacement:'m',force:'kN',stiffness:'kN/m',energy:'kN m'},globalAssemblyIncluded:false,designTransferAllowed:false};
}
