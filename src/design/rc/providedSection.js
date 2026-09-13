import {parabolicConcreteResponse,parabolicStress} from './parabolicConcrete.js';
// Geometry in m, stresses in MPa, resultants kN/kN.m. The stress block law
// is explicit input; this kernel neither chooses a code nor grants approval.
export function sectionStressBlockResponse(section,bars,material,law,theta,c) {
 const {B,H}=section,{fc,fy,Es}=material,{alpha,beta,epscu}=law;
 if(![B,H,fc,fy,Es,alpha,beta,epscu,c].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0)||!Number.isFinite(theta)||alpha>1||beta>1)throw new Error('SECTION_LAW_INPUT_INVALID');
 if(!Array.isArray(bars)||!bars.length||bars.length>100)throw new Error('SECTION_REINFORCEMENT_REQUIRED');
 if(law.kind==='parabolic-linear'&&(![law.epsco,law.exponent].every(x=>Number.isFinite(x)&&x>0)||law.epsco>epscu))throw new Error('SECTION_LAW_INPUT_INVALID');
 const ny=Math.cos(theta),nz=Math.sin(theta),edge=Math.abs(ny)*H/2+Math.abs(nz)*B/2,cut=edge-beta*c;
 const rect=[[-H/2,-B/2],[H/2,-B/2],[H/2,B/2],[-H/2,B/2]];
 const polygon=[];
 for(let i=0;i<4;i++) {
  const a=rect[i],b=rect[(i+1)%4],qa=ny*a[0]+nz*a[1]-cut,qb=ny*b[0]+nz*b[1]-cut;
  if(qa>=0)polygon.push(a);
  if((qa>=0)!==(qb>=0)){const t=qa/(qa-qb);polygon.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
 }
 let twiceArea=0,cy6=0,cz6=0;
 for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],cross=a[0]*b[1]-b[0]*a[1];twiceArea+=cross;cy6+=(a[0]+b[0])*cross;cz6+=(a[1]+b[1])*cross;}
 const area=Math.abs(twiceArea)/2,cy=area>0?cy6/(3*twiceArea):0,cz=area>0?cz6/(3*twiceArea):0;
 const concrete=law.kind==='parabolic-linear'?parabolicConcreteResponse(section,fc,law,theta,c):null;
 let N=concrete?.N??-alpha*fc*area*1000,My=concrete?.My??-N*cz,Mz=concrete?.Mz??N*cy;
 let totalSteel=0;const steel=[];
 for(const bar of bars) {
  if(![bar.y,bar.z,bar.area].every(Number.isFinite)||bar.area<=0||Math.abs(bar.y)>H/2||Math.abs(bar.z)>B/2)throw new Error('SECTION_BAR_INVALID');
  totalSteel+=bar.area;
  const q=ny*bar.y+nz*bar.z,compressionStrain=epscu*(1-(edge-q)/c);
  const stress=Math.max(-fy,Math.min(fy,-Es*compressionStrain));
  const physicalArea=bar.physicalArea??bar.area;
  if(!Number.isFinite(physicalArea)||physicalArea<bar.area)throw new Error('SECTION_PHYSICAL_BAR_AREA_INVALID');
  const displaced=law.kind==='parabolic-linear'?-parabolicStress(compressionStrain,fc,law):q>=cut?-alpha*fc:0,force=(stress*bar.area-displaced*physicalArea)*1000;
  N+=force;My-=force*bar.z;Mz+=force*bar.y;
  steel.push({y:bar.y,z:bar.z,strain:-compressionStrain,stress});
 }
 if(totalSteel>=B*H)throw new Error('SECTION_STEEL_AREA_INVALID');
 return {N,My,Mz,theta,c,compressionArea:concrete?.compressionArea??area,steel,units:{N:'kN',My:'kN.m',Mz:'kN.m'},law:{...law},qualification:'explicit-law-mechanics'};
}
function axialPoint(section,bars,material,law,N,theta,transform) {
 const response=(angle,depth)=>transform(sectionStressBlockResponse(section,bars,material,law,angle,depth));
 let low=1e-10,high=Math.max(section.B,section.H)*1e9;
 let a=response(theta,low),b=response(theta,high);
 if(N>a.N+1e-6||N<b.N-1e-6)return null;
 for(let i=0;i<90;i++) {
  const c=(low+high)/2,r=response(theta,c);
  if(Math.abs(r.N-N)<=1e-7*Math.max(1,Math.abs(N)))return r;
  if(r.N>N)low=c;else high=c;
 }
 const r=response(theta,(low+high)/2);
 return Math.abs(r.N-N)<1e-5*Math.max(1,Math.abs(N))?r:null;
}
export function sectionCapacityAtAxial(section,bars,material,law,N,direction,transform=x=>x) {
 const magnitude=Math.hypot(direction.My,direction.Mz);
 if(!Number.isFinite(N)||!(magnitude>0))return {ok:false,reason:'NONZERO_MOMENT_DIRECTION_REQUIRED'};
 const cross=r=>r.My*direction.Mz-r.Mz*direction.My,dot=r=>r.My*direction.My+r.Mz*direction.Mz;
 let prior=axialPoint(section,bars,material,law,N,0,transform),best=null;
 if(!prior)return {ok:false,reason:'AXIAL_CAPACITY_EXCEEDED'};
 // A converged axial solution may already lie on the requested moment ray.
 // Do not bisect an endpoint root using the sign of floating-point roundoff.
 const aligned=r=>Math.abs(cross(r))<=1e-10*magnitude*Math.max(1,Math.hypot(r.My,r.Mz));
 const accept=r=>{if(dot(r)>0){const capacity=Math.hypot(r.My,r.Mz);if(!best||capacity<best.capacity)best={...r,capacity};}};
 if(aligned(prior))accept(prior);
 for(let i=1;i<=48;i++) {
  let lo=(i-1)*Math.PI/24,hi=i*Math.PI/24,next=axialPoint(section,bars,material,law,N,hi,transform);
  if(!next)return {ok:false,reason:'SECTION_EQUILIBRIUM_FAILED'};
  if(aligned(next))accept(next);
  if(!aligned(prior)&&!aligned(next)&&cross(prior)*cross(next)<=0) {
   let left=prior,mid=next;
   for(let j=0;j<32;j++){const theta=(lo+hi)/2;mid=axialPoint(section,bars,material,law,N,theta,transform);if(!mid)return {ok:false,reason:'SECTION_EQUILIBRIUM_FAILED'};if(cross(left)*cross(mid)<=0)hi=theta;else {lo=theta;left=mid;}}
   if(dot(mid)>0){const capacity=Math.hypot(mid.My,mid.Mz);if(!best||capacity<best.capacity)best={...mid,capacity};}
  }
  prior=next;
 }
 return best?{ok:true,...best,ratio:magnitude/best.capacity,designTransferAllowed:false}:{ok:false,reason:'SECTION_EQUILIBRIUM_FAILED'};
}
