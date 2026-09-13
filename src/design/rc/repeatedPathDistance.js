import {repeatedTieDistance} from './repeatedTieDistance.js';
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),clamp=x=>Math.max(0,Math.min(1,x));
export function segmentClosest(a,b,c,d){
 const u=sub(b,a),v=sub(d,c),w=sub(a,c),uu=dot(u,u),uv=dot(u,v),vv=dot(v,v),uw=dot(u,w),vw=dot(v,w);
 let s=0,t=0;
 if(uu===0)t=vv?clamp(vw/vv):0;
 else if(vv===0)s=clamp(-uw/uu);
 else {
  const denominator=uu*vv-uv*uv;
  s=denominator>1e-14*uu*vv?clamp((uv*vw-vv*uw)/denominator):0;t=(uv*s+vw)/vv;
  if(t<0){t=0;s=clamp(-uw/uu);}else if(t>1){t=1;s=clamp((uv-uw)/uu);}
 }
 return {distance:Math.hypot(...w.map((x,i)=>x+s*u[i]-t*v[i])),s,t};
}
// Distance to a translated convex segment is convex in the plane coordinate.
// Bracket a continuous minimizer with the regular stations; also test the last
// (possibly shortened) station. This avoids expanding the repeated geometry.
export function repeatedPathDistance({a,b,c,d,distribution,offset=0}){
 if(repeatedTieDistance(distribution,0,0).status!=='OK'||![a,b].every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))||![c,d].every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite))||!Number.isFinite(offset))return {status:'NOT_CHECKED',reason:'REPEATED_PATH_GEOMETRY_REQUIRED'};
 const projected=segmentClosest([0,...a],[0,...b],[0,c[1],c[2]],[0,d[1],d[2]]),x=c[0]+projected.t*(d[0]-c[0]),{count,first,last,spacing}=distribution,indices=new Set([count-1]);
 if(count>1){const rank=(x-offset-first)/spacing;for(const k of [Math.floor(rank),Math.ceil(rank)])indices.add(Math.max(0,Math.min(count-2,k)));}
 let best;
 for(const index of indices){const plane=(index===count-1?last:first+index*spacing)+offset,r=segmentClosest([plane,...a],[plane,...b],c,d);if(!best||r.distance<best.distance)best={...r,index,plane};}
 return {status:'OK',...best,stationCandidates:indices.size};
}
