import {independentRepeatedPairDistance} from './independentRepeatedPairDistance.js';
import {outerHoopPerimeter} from './outerHoopPerimeter.js';
import {repeatedTieDistance} from './repeatedTieDistance.js';
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
function pointSegment(p,a,b){
 const ab=sub(b,a),ap=sub(p,a),den=dot(ab,ab),t=den?Math.max(0,Math.min(1,dot(ap,ab)/den)):0;
 return Math.hypot(ap[0]-t*ab[0],ap[1]-t*ab[1]);
}
function segmentDistance(a,b,c,d){
 const u=sub(b,a),v=sub(d,c),w=sub(c,a),den=cross(u,v);
 if(Math.abs(den)>1e-20){const s=cross(w,v)/den,t=cross(w,u)/den;if(s>=0&&s<=1&&t>=0&&t<=1)return 0;}
 return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));
}
function pointPath(point,path){
 let distance=Math.min(...path.lines.map(([a,b])=>pointSegment(point,a,b)));
 for(const arc of path.arcs){
  const delta=sub(point,arc.center),s=dot(delta,path.u),t=dot(delta,path.n),phi=Math.atan2(t,s);
  for(let k=-1;k<=1;k++){const angle=phi+2*k*Math.PI;if(angle>=arc.lo&&angle<=arc.hi)distance=Math.min(distance,Math.abs(Math.hypot(s,t)-arc.radius));}
  for(const angle of [arc.lo,arc.hi])distance=Math.min(distance,Math.hypot(s-arc.radius*Math.cos(angle),t-arc.radius*Math.sin(angle)));
 }
 return distance;
}
function separation(a,b,dz){
 const required=(a.diameter+b.diameter)/2;let lower=Infinity,upper=Infinity;
 if(dz>=required)return {centerlineLowerBound:dz,centerlineUpperBound:null,requiredDistance:required,status:'OK'};
 for(let k=1;k<a.points.length;k++)for(let l=1;l<b.points.length;l++){
  const distance=segmentDistance(a.points[k-1],a.points[k],b.points[l-1],b.points[l]),error=a.segmentErrors[k-1]+b.segmentErrors[l-1];
  lower=Math.min(lower,Math.hypot(Math.max(0,distance-error),dz));upper=Math.min(upper,Math.hypot(distance+error,dz));
 }
 return {centerlineLowerBound:lower,centerlineUpperBound:upper,requiredDistance:required,status:lower>=required-1e-9?'OK':upper<required-1e-9?'NG':'NOT_CHECKED'};
}
export function crossTieAssembly({pieces,bars,distribution,length,hoopGeometry}){
 const checks=[];
 for(const p of pieces){
  const parts=p.partRanges.map(([name,start,end])=>({name,points:p.points.slice(start,end+1),segmentErrors:p.segmentErrors.slice(start,end),diameter:p.diameter}));
  for(let i=0;i<parts.length;i++)for(let j=0;j<i-1;j++)checks.push({kind:'self-intersection',mark:p.mark,parts:[parts[j].name,parts[i].name],...separation(parts[j],parts[i],0)});
 }
 for(const p of pieces)for(const [i,bar] of bars.entries()){
  const clearance=pointPath([bar.y,bar.z],p.path)-(p.diameter+bar.diameter)/2,isEnd=p.bars.includes(i+1);
  checks.push({kind:isEnd?'hook-contact':'longitudinal-collision',mark:p.mark,bar:i+1,clearance,status:isEnd?(Math.abs(clearance)<=1e-9?'OK':clearance<0?'NG':'NOT_CHECKED'):(clearance>=-1e-9?'OK':'NG')});
 }
 const axial=repeatedTieDistance(distribution,0,0);
 const pd=p=>p.distribution||distribution;
 const distance=(A,a,B,b)=>A===B?repeatedTieDistance(A,a,b):independentRepeatedPairDistance({a:[a,0,0],b:[a,0,0],c:[b,0,0],d:[b,0,0],distributionA:A,distributionB:B});
 if(axial.status!=='OK'||!Number.isFinite(length))checks.push({kind:'axial-distribution',status:'NOT_CHECKED',reason:'EXPLICIT_TIE_DISTRIBUTION_REQUIRED'});
 else {
  for(const p of pieces){const repeat=repeatedTieDistance(pd(p),0,0);if(repeat.status!=='OK')checks.push({kind:'cross-tie-repeat',mark:p.mark,status:'NOT_CHECKED',reason:repeat.reason});else if(repeat.minimumRepeatDistance!==null)checks.push({kind:'cross-tie-repeat',mark:p.mark,minimumPlaneDistance:repeat.minimumRepeatDistance,requiredDistance:p.diameter,status:repeat.minimumRepeatDistance>=p.diameter-1e-9?'OK':'NG'});}
  for(const p of pieces)checks.push({kind:'axial-extent',mark:p.mark,status:pd(p).first+p.planeOffset>=p.diameter/2&&pd(p).last+p.planeOffset<=length-p.diameter/2?'OK':'NG'});
  const hoop=hoopGeometry?outerHoopPerimeter(hoopGeometry):null;
  for(const p of pieces){
   const pair=distance(pd(p),p.planeOffset,distribution,0),dz=pair.distance;if(pair.status!=='OK'){checks.push({kind:'outer-hoop-perimeter',mark:p.mark,status:'NOT_CHECKED',reason:pair.reason});continue;}
   checks.push({kind:'outer-hoop-perimeter',mark:p.mark,nearestPlaneDistance:dz,...(hoop?.status==='OK'?separation(p,hoop,dz):{status:'NOT_CHECKED',reason:'OUTER_HOOP_GEOMETRY_REQUIRED'})});
  }
  for(let i=0;i<pieces.length;i++)for(let j=0;j<i;j++){
   const a=pieces[i],b=pieces[j],pair=distance(pd(a),a.planeOffset,pd(b),b.planeOffset),dz=pair.distance;if(pair.status!=='OK'){checks.push({kind:'cross-tie-pair',marks:[a.mark,b.mark],status:'NOT_CHECKED',reason:pair.reason});continue;}
   checks.push({kind:'cross-tie-pair',marks:[a.mark,b.mark],nearestPlaneDistance:dz,...separation(a,b,dz)});
  }
 }
 return {status:checks.some(c=>c.status==='NG')?'NG':checks.some(c=>c.status==='NOT_CHECKED')?'NOT_CHECKED':'OK',checks,method:'analytic point-to-line/arc; segment distance bounds with arc sagitta; closed-form actual repeated axial stations',scope:'cross-ties against straight longitudinal bars, other cross-ties and rounded outer-hoop perimeter',remaining:['outer-hoop-closure','end-hook-and-splice-bar-geometry'],fabricationApproved:false};
}
