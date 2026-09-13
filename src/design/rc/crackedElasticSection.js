import {clipPolygon,polygonMoments} from '../../core/polygonMoments.js';
export const CRACKED_ELASTIC_SECTION_VERSION='p25-cracked-elastic-section-v3-initial-strains';
const box=[[-1,-1],[1,-1],[1,1],[-1,1]];
function solve(matrix,rhs){
 const a=matrix.map((row,i)=>[...row,rhs[i]]),scale=Math.max(...matrix.flat().map(Math.abs));
 if(!(scale>0)||!Number.isFinite(scale))return null;
 for(let k=0;k<3;k++){
  let p=k;for(let i=k+1;i<3;i++)if(Math.abs(a[i][k])>Math.abs(a[p][k]))p=i;
  if(!Number.isFinite(a[p][k])||Math.abs(a[p][k])<1e-13*scale)return null;
  [a[p],a[k]]=[a[k],a[p]];const pivot=a[k][k];for(let j=k;j<4;j++)a[k][j]/=pivot;
  for(let i=0;i<3;i++)if(i!==k){const f=a[i][k];for(let j=k;j<4;j++)a[i][j]-=f*a[k][j];}
 }
 const result=a.map(row=>row[3]);return result.every(Number.isFinite)?result:null;
}
// m, MPa, kN, kNm. Positive N is tension; strain=epsilon-z*kappaY+y*kappaZ.
// Elastic point steel fibres displace compressive concrete. No tensile concrete,
// yielding, creep, bond slip or tension stiffening. This is not a KDS Ie policy.
// Optional uniform constituent initial strains are specified, not predicted.
// Returned strain is total; stress uses total minus that constituent's strain.
export function solveCrackedElasticSection({B,H,Ec,Es,bars,demand,includeBarForces=false,initialStrains={concrete:0,steel:0}}={}){
 const fail=(reason,extra={})=>({ok:false,reason,...extra,version:CRACKED_ELASTIC_SECTION_VERSION,designTransferAllowed:false});
 if(typeof includeBarForces!=='boolean')return fail('CRACKED_ELASTIC_INPUT_INVALID');
 if(!initialStrains||Array.isArray(initialStrains)||typeof initialStrains!=='object'||Object.keys(initialStrains).some(k=>!['concrete','steel'].includes(k))||![initialStrains.concrete,initialStrains.steel].every(v=>Number.isFinite(v)&&Math.abs(v)<=.02))return fail('CRACKED_ELASTIC_INITIAL_STRAINS_INVALID');
 const concreteInitial=initialStrains.concrete,steelInitial=initialStrains.steel;
 if(![B,H,Ec,Es].every(x=>Number.isFinite(x)&&x>0)||Es<=Ec||!['N','My','Mz'].every(k=>Number.isFinite(demand?.[k])))return fail('CRACKED_ELASTIC_INPUT_INVALID');
 if(!Array.isArray(bars)||!bars.length||bars.length>100||bars.some(p=>![p.y,p.z,p.area].every(Number.isFinite)||p.area<=0||Math.abs(p.y)>=H/2||Math.abs(p.z)>=B/2)||bars.reduce((s,p)=>s+p.area,0)>=B*H)return fail('CRACKED_ELASTIC_BARS_INVALID');
 const h=H/2,b=B/2,factor=h*b*1000,target=[demand.N,demand.Mz/h,-demand.My/b],normScale=Math.max(1,Math.hypot(...target));
 function response(e){
  const mechanical=[e[0]-concreteInitial,e[1],e[2]];
  const p=polygonMoments(clipPolygon(box,-mechanical[0],-mechanical[1],-mechanical[2]));
  const J=[[p.A,p.X,p.Y],[p.X,p.XX,p.XY],[p.Y,p.XY,p.YY]].map(row=>row.map(x=>x*Ec*factor));
  const values=J.map(row=>row.reduce((s,x,j)=>s+x*mechanical[j],0));
  const grossConcrete=[...values];
  for(const bar of bars){
   const v=[1,bar.y/h,bar.z/b],strain=v.reduce((s,x,i)=>s+x*e[i],0),modulus=Es-(strain-concreteInitial<=0?Ec:0),f=bar.area*modulus*1000;
   const force=bar.area*1000*(Es*(strain-steelInitial)-Ec*Math.min(0,strain-concreteInitial));
   for(let i=0;i<3;i++){values[i]+=force*v[i];for(let j=0;j<3;j++)J[i][j]+=f*v[i]*v[j];}
  }
  const residual=values.map((x,i)=>x-target[i]);
  return {J,values,residual,norm:Math.hypot(...residual)/normScale,compressionArea:p.A*h*b,grossConcrete};
 }
 let e=[0,0,0],state=response(e),iterations=0;
 for(;iterations<60&&state.norm>1e-11;iterations++){
  const step=solve(state.J,state.residual.map(x=>-x));if(!step)return fail('CRACKED_ELASTIC_TANGENT_SINGULAR',{iterations,residual:state.norm});
  let accepted=false;
  for(let damping=1;damping>=1/65536;damping/=2){
   const next=e.map((x,i)=>x+damping*step[i]),candidate=response(next);
   if(candidate.norm<state.norm){e=next;state=candidate;accepted=true;break;}
  }
  if(!accepted)break;
 }
 if(!Number.isFinite(state.norm)||state.norm>1e-10)return fail('CRACKED_ELASTIC_EQUILIBRIUM_NOT_CONVERGED',{iterations,residual:state.norm});
 const inverse=[0,1,2].map(k=>solve(state.J,[0,1,2].map(i=>i===k?1:0)));
 if(inverse.some(x=>!x))return fail('CRACKED_ELASTIC_TANGENT_SINGULAR',{iterations,residual:state.norm});
 const indices=[0,2,1],factors=[1,-1/b,1/h];
 const strain=indices.map((k,i)=>e[k]*factors[i]);
 const flexibility=indices.map((k,i)=>indices.map((l,j)=>inverse[l][k]*factors[i]*factors[j]));
 const tangent=indices.map((k,i)=>indices.map((l,j)=>state.J[k][l]/(factors[i]*factors[j])));
 if(![...strain,...flexibility.flat(),...tangent.flat()].every(Number.isFinite))return fail('CRACKED_ELASTIC_RESULT_NONFINITE');
 let forceDetails;
 if(includeBarForces){
  const steel={N:0,My:0,Mz:0},displacedConcrete={N:0,My:0,Mz:0};
  const steelForces=bars.map(bar=>{
   const eps=strain[0]-bar.z*strain[1]+bar.y*strain[2],force=Es*bar.area*1000*(eps-steelInitial),removed=Ec*bar.area*1000*Math.min(0,eps-concreteInitial);
   steel.N+=force;steel.My-=bar.z*force;steel.Mz+=bar.y*force;
   displacedConcrete.N+=removed;displacedConcrete.My-=bar.z*removed;displacedConcrete.Mz+=bar.y*removed;
   return force;
  });
  const concreteGross={N:state.grossConcrete[0],My:-state.grossConcrete[2]*b,Mz:state.grossConcrete[1]*h};
  const concreteNet=Object.fromEntries(['N','My','Mz'].map(k=>[k,concreteGross[k]-displacedConcrete[k]]));
  if(![...steelForces,...Object.values(steel),...Object.values(concreteNet)].every(Number.isFinite))return fail('CRACKED_ELASTIC_RESULT_NONFINITE');
  forceDetails={steelForces,sectionComponents:{steel,concreteGross,displacedConcrete,concreteNet},barForceBasis:'gross-elastic-steel; displaced-compressive-concrete-accounted-separately'};
 }
 return {ok:true,version:CRACKED_ELASTIC_SECTION_VERSION,strain,strainCoordinates:'epsilon,kappaY,kappaZ',initialStrains:{concrete:concreteInitial,steel:steelInitial},tangent,flexibility,...forceDetails,
  recovered:{N:state.values[0],My:-state.values[2]*b,Mz:state.values[1]*h},compressionArea:state.compressionArea,
  iterations,residual:state.norm,basis:'plane-sections; perfect-bond; elastic-steel; compression-only-elastic-concrete',
  globalRedistributionIncluded:false,designTransferAllowed:false};
}
