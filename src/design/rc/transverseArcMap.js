// Match analytic arcs to their actual sampled segments before using refinement.
// A missing or inconsistent mapping keeps the conservative chord bounds.
export function transverseArcMap(shape,crossTie){
 const map=Array(Math.max(0,(shape.points?.length||0)-1)).fill(null),groups=[];
 if(crossTie){
  const {u,n,arcs}=crossTie.path||{};
  if(!u||!n||arcs?.length!==2)return map;
  for(const [i,name] of ['start-hook','end-hook'].entries()){
   const range=crossTie.partRanges?.find(r=>r[0]===name),source=arcs[i];
   if(!range)continue;
   const start=source.hi,sweep=source.lo-source.hi;
   const arc={center:[crossTie.planeOffset,...source.center],radius:source.radius,u:[0,...u.map((v,k)=>v*Math.cos(start)+n[k]*Math.sin(start))],v:[0,...u.map((v,k)=>-v*Math.sin(start)+n[k]*Math.cos(start))],sweep};
   groups.push({key:i,arc,indices:Array.from({length:range[2]-range[1]},(_,j)=>range[1]+j)});
  }
 }else if(shape.primitiveIndices?.length===map.length){
  for(const [key,arc] of (shape.primitives||[]).entries())if(arc.kind==='arc')groups.push({key,arc,indices:shape.primitiveIndices.flatMap((k,i)=>k===key?[i]:[])});
 }
 const vector=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
 for(const {key,arc,indices} of groups){
  if(!indices.length||![arc.center,arc.u,arc.v].every(vector)||!Number.isFinite(arc.radius)||!Number.isFinite(arc.sweep))continue;
  const at=f=>arc.center.map((c,k)=>c+arc.radius*(arc.u[k]*Math.cos(arc.sweep*f)+arc.v[k]*Math.sin(arc.sweep*f)));
  const matches=(i,f)=>vector(shape.points[i])&&Math.hypot(...at(f).map((v,k)=>v-shape.points[i][k]))<=1e-10;
  if(indices.some((i,j)=>i<0||i>=map.length||j>0&&i!==indices[j-1]+1||!matches(i,j/indices.length)||!matches(i+1,(j+1)/indices.length)))continue;
  for(const i of indices)map[i]={key,arc,firstSegment:indices[0],segmentCount:indices.length};
 }
 return map;
}
