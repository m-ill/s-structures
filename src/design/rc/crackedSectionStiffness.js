// Geometry m, elastic moduli MPa, inertia m^4. This is the existing transformed
// cracked-section law shared across the two local bending planes. Plane sections,
// perfect bond, zero axial force, no tensile concrete, no global redistribution.
export const CRACKED_SECTION_STIFFNESS_VERSION='p25-cracked-section-v1';
export function crackedRectangularStiffness({B,H,bars,Ec,Es}){
 if(![B,H,Ec,Es].every(x=>Number.isFinite(x)&&x>0)||Es<=Ec)throw Error('CRACKED_SECTION_INPUT_INVALID');
 if(!Array.isArray(bars)||!bars.length||bars.length>100)throw Error('CRACKED_SECTION_REINFORCEMENT_REQUIRED');
 if(bars.some(p=>![p.y,p.z,p.area].every(Number.isFinite)||p.area<=0||Math.abs(p.y)>H/2||Math.abs(p.z)>B/2))throw Error('CRACKED_SECTION_BAR_INVALID');
 const n=Es/Ec;
 const plane=(width,depth,coordinate)=>{
  const faces=[-1,1].map(sign=>{
   const rows=bars.map(p=>({d:depth/2-sign*p[coordinate],A:p.area}));
   const first=c=>width*c*c/2+rows.reduce((sum,p)=>sum+(p.d<c?n-1:n)*p.A*(c-p.d),0);
   let lo=0,hi=depth;
   for(let i=0;i<70;i++){const mid=(lo+hi)/2;if(first(mid)>0)hi=mid;else lo=mid;}
   const neutralAxis=(lo+hi)/2;
   const Icr=width*neutralAxis**3/3+rows.reduce((sum,p)=>sum+(p.d<neutralAxis?n-1:n)*p.A*(p.d-neutralAxis)**2,0);
   if(!Number.isFinite(Icr)||!(Icr>0))throw Error('CRACKED_SECTION_RESULT_INVALID');
   return {compressionFaceSign:sign,neutralAxis,Icr};
  });
  return {Ig:width*depth**3/12,faces};
 };
 return {version:CRACKED_SECTION_STIFFNESS_VERSION,modularRatio:n,y:plane(H,B,'z'),z:plane(B,H,'y'),basis:'transformed-cracked-section; zero-axial-force; perfect-bond; elastic-steel; no-tensile-concrete',globalRedistributionIncluded:false};
}
