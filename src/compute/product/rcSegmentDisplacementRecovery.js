import {normalizedQuadraticRoots} from '../../core/normalizedQuadraticRoots.js';

// Recover the actual frame trial field: axial/twist linear, transverse cubic.
// Do not superimpose an elastic gross-EI load correction on the cracked/lap field.
export function prepareRcSegmentDisplacements({source,localDisplacements:d,samples=5}){
 const L=source?.endX-source?.startX;
 const fail=()=>{throw new Error('RC_SEGMENT_DISPLACEMENT_INPUT_INVALID');};
 if(!Number.isFinite(source?.startX)||!Number.isFinite(L)||L<=0||!Array.isArray(d)||d.length!==12||!d.every(Number.isFinite)||!Number.isInteger(samples)||samples<2||samples>17)fail();
 const polynomials=rcFrameDisplacementPolynomials(d,L);
 const positions=new Set(Array.from({length:samples},(_,i)=>i/(samples-1)));
 for(const p of Object.values(polynomials))for(const t of normalizedQuadraticRoots(3*(p[3]||0),2*(p[2]||0),p[1]||0))if(Number.isFinite(t)&&t>0&&t<1)positions.add(t);
 const stations=[...positions].sort((a,b)=>a-b).map(t=>({memberId:source.memberId,detailId:source.detailId,detailVersion:source.detailVersion,x:source.startX+L*t,localX:L*t,displacements:Object.fromEntries(Object.entries(polynomials).map(([k,p])=>[k,p.reduceRight((a,b)=>a*t+b,0)]))}));
 if(!stations.every(s=>Number.isFinite(s.x)&&Object.values(s.displacements).every(Number.isFinite)))fail();
 const envelope=Object.fromEntries(Object.keys(polynomials).map(k=>{
  const min=stations.reduce((a,b)=>b.displacements[k]<a.displacements[k]?b:a),max=stations.reduce((a,b)=>b.displacements[k]>a.displacements[k]?b:a),at=s=>({value:s.displacements[k],x:s.x,localX:s.localX});
  return [k,{minimum:at(min),maximum:at(max),maximumAbsolute:at(Math.abs(min.displacements[k])>Math.abs(max.displacements[k])?min:max)}];
 }));
 return {version:'p25-rc-segment-displacement-v1',stations,envelope,coordinateSystem:'member-local',rotationConvention:'ry=-dw/dx; rz=dv/dx',basis:'finite-element trial field; linear axial/twist and cubic Hermite transverse',loadParticularSolutionIncluded:false,frameMeshRefinementRequired:true,standardDesignTransferAllowed:false};
}

export function rcFrameDisplacementPolynomials(d,L){
 const fail=()=>{throw new Error('RC_SEGMENT_DISPLACEMENT_INPUT_INVALID');};
 if(!Number.isFinite(L)||L<=0||!Array.isArray(d)||d.length!==12||!d.every(Number.isFinite))fail();
 const cubic=(a,b,sa,sb)=>[a,L*sa,3*(b-a)-L*(2*sa+sb),2*(a-b)+L*(sa+sb)];
 const v=cubic(d[1],d[7],d[5],d[11]),w=cubic(d[2],d[8],-d[4],-d[10]);
 const polynomials={u:[d[0],d[6]-d[0]],v,w,rx:[d[3],d[9]-d[3]],ry:[-w[1]/L,-2*w[2]/L,-3*w[3]/L],rz:[v[1]/L,2*v[2]/L,3*v[3]/L]};
 if(!Object.values(polynomials).flat().every(Number.isFinite))fail();
 return polynomials;
}
export function rcFrameDisplacementsAt(d,L,x){
 if(!Number.isFinite(x)||x<0||x>L)throw new Error('RC_SEGMENT_DISPLACEMENT_INPUT_INVALID');
 const p=rcFrameDisplacementPolynomials(d,L),t=x/L;return Object.values(p).map(row=>row.reduceRight((a,b)=>a*t+b,0));
}
