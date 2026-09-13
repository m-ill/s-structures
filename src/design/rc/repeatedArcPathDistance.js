import {repeatedSpatialPathDistance} from './repeatedSpatialPathDistance.js';
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),vector=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
// Conservative geometric bounds relative to circular arcs (roundoff tolerance is
// separate). Refinement covers every candidate station without expanding it.
export function repeatedArcPathDistance({arc,c,d,distribution,from=0,to=arc?.sweep,tolerance=1e-10,maxIntervals=128}){
 const nc=reason=>({status:'NOT_CHECKED',reason,lower:null,upper:null});
 if(!arc||!vector(arc.center)||!vector(arc.u)||!vector(arc.v)||!vector(c)||!vector(d)||!Number.isFinite(arc.radius)||arc.radius<=0||Math.abs(dot(arc.u,arc.u)-1)>1e-10||Math.abs(dot(arc.v,arc.v)-1)>1e-10||Math.abs(dot(arc.u,arc.v))>1e-10||![from,to,tolerance].every(Number.isFinite)||from===to||Math.abs(to-from)>2*Math.PI||tolerance<=0||!Number.isInteger(maxIntervals)||maxIntervals<1||maxIntervals>4096)return nc('ARC_DISTANCE_INPUT_REQUIRED');
 if(!Number.isFinite(arc.sweep)||Math.abs(arc.sweep)>2*Math.PI||Math.sign(to-from)!==Math.sign(arc.sweep)||Math.min(from,to)<Math.min(0,arc.sweep)-1e-12||Math.max(from,to)>Math.max(0,arc.sweep)+1e-12)return nc('ARC_DISTANCE_INTERVAL_INVALID');
 const point=t=>arc.center.map((x,i)=>x+arc.radius*(arc.u[i]*Math.cos(t)+arc.v[i]*Math.sin(t)));
 let stationEvaluations=0,evaluatedIntervals=0,upper=Infinity,witness;
 const distance=(a,b)=>{const r=repeatedSpatialPathDistance({a,b,c,d,distribution});stationEvaluations+=r.stationCandidates||0;return r;};
 const sample=t=>{const p=point(t),r=distance(p,p);if(r.status!=='OK')return r;if(r.distance<upper){upper=r.distance;witness={angle:t,station:r.index,plane:r.plane};}return r;};
 // A transverse circle and an axial straight bar separate into axial and
 // radial distances, including finite bar endpoints and shortened last ties.
 if(arc.u[0]===0&&arc.v[0]===0&&c[1]===d[1]&&c[2]===d[2]){
  const delta=[0,c[1]-arc.center[1],c[2]-arc.center[2]],theta=Math.atan2(dot(delta,arc.v),dot(delta,arc.u)),lo=Math.min(from,to),hi=Math.max(from,to),angles=[from,to];
  for(let k=-3;k<=3;k++)if(theta+2*k*Math.PI>=lo&&theta+2*k*Math.PI<=hi)angles.push(theta+2*k*Math.PI);
  for(const t of angles){const r=sample(t);if(r.status!=='OK')return nc(r.reason);}
  return {status:'OK',lower:upper,upper,witness,stationEvaluations,evaluatedIntervals:0,method:'analytic-transverse-circle-axial-segment'};
 }
 const intervals=[];
 const add=(a,b)=>{
  const p=point(a),q=point(b),r=distance(p,q);if(r.status!=='OK')return r;
  for(const t of [a,(a+b)/2,b]){const s=sample(t);if(s.status!=='OK')return s;}
  intervals.push({a,b,lower:Math.max(0,r.distance-2*arc.radius*Math.sin((b-a)/4)**2)});evaluatedIntervals++;
  return {status:'OK'};
 };
 const initial=Math.ceil(Math.abs(to-from)/(Math.PI/2));
 if(initial>maxIntervals)return nc('ARC_REFINEMENT_BUDGET');
 for(let i=0;i<initial;i++){const r=add(from+(to-from)*i/initial,from+(to-from)*(i+1)/initial);if(r.status!=='OK')return nc(r.reason);}
 while(true){
  let index=0;for(let i=1;i<intervals.length;i++)if(intervals[i].lower<intervals[index].lower)index=i;
  const lower=intervals[index].lower;
  if(upper-lower<=tolerance)return {status:'OK',lower,upper,witness,stationEvaluations,evaluatedIntervals,method:'adaptive-circular-arc-distance-bounds'};
  if(intervals.length>=maxIntervals)return {status:'NOT_CHECKED',reason:'ARC_REFINEMENT_BUDGET',lower,upper,witness,stationEvaluations,evaluatedIntervals};
  const current=intervals[index];intervals[index]=intervals.at(-1);intervals.pop();const mid=(current.a+current.b)/2;
  for(const [a,b] of [[current.a,mid],[mid,current.b]]){const r=add(a,b);if(r.status!=='OK')return nc(r.reason);}
 }
}
