import {polygonMoments,pressureIntegral} from './compressionContact.js';
// Admissible balanced shear couples provide a sufficient friction bound, not
// the exact combined capacity or a KDS design resistance. No passive resistance.
export function baseFrictionBounds({contact,normal,friction,Hx,Hy,torsion}){
 const base={version:'p25-base-friction-bounds-v1',capacityQualified:false,methodReviewRequired:true,designTransferAllowed:false,units:{force:'kN',moment:'kN.m',length:'m'},assumptions:['prescribed nonnegative linear contact pressure','uniform specified Coulomb friction','no cohesion or passive resistance','no code resistance or safety factors']};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason});
 const polygon=contact?.polygon,plane=contact?.pressurePlane;
 if(contact?.ok!==true||![normal,friction,Hx,Hy,torsion].every(Number.isFinite)||normal<=0||friction<0||!Array.isArray(polygon)||polygon.length<3||polygon.length>16||polygon.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))||!Array.isArray(plane)||plane.length!==3||!plane.every(Number.isFinite))return nc('BASE_FRICTION_CONTACT_INPUT_REQUIRED');
 const span=Math.max(...[0,1].map(k=>Math.max(...polygon.map(p=>p[k]))-Math.min(...polygon.map(p=>p[k]))));
 if(!(span>0)||polygon.some((p,i)=>{const q=polygon[(i+1)%polygon.length];return polygon.some(r=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])< -1e-12*span*span);}))return nc('BASE_FRICTION_CONVEX_CONTACT_REQUIRED');
 const [a,b,c]=plane,m=polygonMoments(polygon),N=a*m.A+b*m.X+c*m.Y;
 if(!Number.isFinite(N)||N<=0||m.A<=0||Math.abs(N-normal)>1e-8*Math.max(1,normal))return nc('BASE_FRICTION_NORMAL_EQUILIBRIUM_REQUIRED');
 const pressures=polygon.map(([x,y])=>a+b*x+c*y),scale=Math.max(1,...pressures.map(Math.abs));
 if(pressures.some(p=>!Number.isFinite(p)||p< -1e-10*scale))return nc('BASE_FRICTION_NONNEGATIVE_PRESSURE_REQUIRED');
 const centroid=[(a*m.X+b*m.XX+c*m.XY)/N,(a*m.Y+b*m.XY+c*m.YY)/N];
 if(!centroid.every(Number.isFinite))return nc('BASE_FRICTION_MOMENTS_INVALID');
 const couples=[];
 for(const [i,axis] of ['B','L'].entries()){
  const cut=centroid[i],positive=pressureIntegral(contact,axis,1,cut),negative=pressureIntegral(contact,axis,-1,-cut);
  if(![positive.force,positive.moment,negative.force,negative.moment].every(Number.isFinite)||positive.force<0||negative.force<0||Math.abs(positive.force+negative.force-N)>1e-8*Math.max(1,N))return nc('BASE_FRICTION_PARTITION_EQUILIBRIUM_REQUIRED');
  const balancedNormal=Math.min(positive.force,negative.force),gap=balancedNormal>1e-12*N?positive.moment/positive.force+negative.moment/negative.force:0;
  couples.push({axis,cut,positiveNormal:positive.force,negativeNormal:negative.force,balancedNormal,centroidGap:gap,positiveTractionFraction:positive.force>0?balancedNormal/positive.force:0,negativeTractionFraction:negative.force>0?balancedNormal/negative.force:0,capacity:friction*balancedNormal*gap});
 }
 const translationCapacity=friction*N,torsionLowerCapacity=Math.max(...couples.map(x=>x.capacity)),radiusUpper=Math.max(...polygon.map(([x,y])=>Math.hypot(x-centroid[0],y-centroid[1]))),torsionUpperCapacity=translationCapacity*radiusUpper;
 const horizontal=Math.hypot(Hx,Hy),translationMoment=centroid[0]*Hy-centroid[1]*Hx,residualTorsion=torsion-translationMoment;
 if(![translationCapacity,torsionLowerCapacity,torsionUpperCapacity,horizontal,translationMoment,residualTorsion].every(Number.isFinite))return nc('BASE_FRICTION_NUMERIC_RANGE_REQUIRED');
 const ratio=(d,c)=>c>0?d/c:d===0?0:Infinity,h=ratio(horizontal,translationCapacity),t=ratio(Math.abs(residualTorsion),torsionLowerCapacity),upper=ratio(Math.abs(residualTorsion),torsionUpperCapacity),sufficient=h+t;
 const necessaryFailure=h>1+1e-10||upper>1+1e-10;
 return {...base,status:'CALCULATED',mechanicsStatus:necessaryFailure?'NG':sufficient<=1?'FEASIBLE_BOUND':'UNRESOLVED',normal:N,pressureCentroid:centroid,horizontal,translationMoment,residualTorsion,translationCapacity,torsionLowerCapacity,torsionUpperCapacity,sufficientUtilization:Number.isFinite(sufficient)?sufficient:null,necessaryUtilization:Number.isFinite(Math.max(h,upper))?Math.max(h,upper):null,couples,scope:'balanced half-plane friction couples and uniform translation field; sufficient bound plus necessary force/radius bounds; outside sufficient bound alone is not failure'};
}
