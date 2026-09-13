// Each interval owns its two one-sided curvatures. Curvature may jump at
// reinforcement/load interfaces; displacement and rotation remain continuous.
export function integrateCurvatureSegments(segments,boundary){
 if(!Array.isArray(segments)||!segments.length||segments.length>1200||!['chord','cantilever-start','cantilever-end'].includes(boundary))throw Error('CURVATURE_INPUT_INVALID');
 for(let i=0;i<segments.length;i++){
  const s=segments[i];if(![s.x0,s.x1,s.k0,s.k1].every(Number.isFinite)||s.x1<=s.x0)throw Error('CURVATURE_INPUT_INVALID');
  if(i&&s.x0!==segments[i-1].x1)throw Error('CURVATURE_INTERVALS_MUST_BE_CONTIGUOUS');
 }
 const xs=[segments[0].x0],slopes=[0],displacements=[0];
 for(const s of segments){
  const h=s.x1-s.x0,dk=s.k1-s.k0;
  displacements.push(displacements.at(-1)+slopes.at(-1)*h+h*h*(s.k0/2+dk/6));
  slopes.push(slopes.at(-1)+h*(s.k0+s.k1)/2);xs.push(s.x1);
 }
 if(boundary==='chord'){
  const rotation=displacements.at(-1)/(xs.at(-1)-xs[0]);
  for(let i=0;i<xs.length;i++){displacements[i]-=rotation*(xs[i]-xs[0]);slopes[i]-=rotation;}
 }
 if(boundary==='cantilever-end'){
  const rotation=slopes.at(-1),translation=displacements.at(-1),end=xs.at(-1);
  for(let i=0;i<xs.length;i++){displacements[i]-=translation+rotation*(xs[i]-end);slopes[i]-=rotation;}
 }
 if(![...slopes,...displacements].every(Number.isFinite))throw Error('CURVATURE_RESULT_NONFINITE');
 const extrema=[];
 for(const [i,s] of segments.entries()){
  const h=s.x1-s.x0;
  // Solve in u=t/h, normalizing rotation coefficients before the discriminant.
  // No absolute curvature cutoff: scaling loads must scale deflection, not erase it.
  const A=(s.k1/2-s.k0/2)*h,B=s.k0*h,C=slopes[i],scale=Math.max(Math.abs(A),Math.abs(B),Math.abs(C));
  if(!Number.isFinite(scale))throw Error('CURVATURE_RESULT_NONFINITE');
  if(scale===0)continue;
  const a=A/scale,b=B/scale,c=C/scale;
  let roots=[];
  if(a===0){if(b!==0)roots=[-c/b];}
  else{
   const disc=b*b-4*a*c;
   if(disc>=0){
    // The companion root c/q avoids subtraction of almost equal numbers.
    const q=-.5*(b+(b>=0?1:-1)*Math.sqrt(disc));
    roots=q===0?[-b/(2*a)]:[q/a,c/q];
   }
  }
  for(const u of new Set(roots))if(u>0&&u<1){
   const displacement=displacements[i]+h*u*(C+u*(B/2+u*A/3));
   if(!Number.isFinite(displacement))throw Error('CURVATURE_RESULT_NONFINITE');
   extrema.push({x:s.x0+u*h,displacement});
  }
 }
 return {xs,displacements,slopes,extrema,maxAbs:Math.max(...displacements.map(Math.abs),...extrema.map(x=>Math.abs(x.displacement))),intervals:segments.map(s=>({...s})),sampling:'piecewise-linear-curvature-exact-interval-extrema; one-sided interfaces'};
}
