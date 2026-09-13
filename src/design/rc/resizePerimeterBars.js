const fail=code=>{throw Object.assign(new Error(code),{code});};
function frame(x){
 if(![x.B,x.H,x.cover,x.tieDiameter,x.insideRadius].every(v=>Number.isFinite(v)&&v>0))fail('PERIMETER_RESIZE_GEOMETRY_REQUIRED');
 const cy=x.H/2-x.cover-x.tieDiameter-x.insideRadius,cz=x.B/2-x.cover-x.tieDiameter-x.insideRadius;
 if(cy<=0||cz<=0)fail('PERIMETER_RESIZE_BEND_OUTSIDE_SECTION');
 return {cy,cz};
}
// Command units: diameter mm, section geometry m. Keep each bar's identity and
// order; cross-tie and splice references must never follow a regenerated order.
export function resizePerimeterBars(original,target,{prior,next}){
 if(!Array.isArray(original)||!original.length||original.length>100||!Array.isArray(target)||target.length!==original.length)fail('PERIMETER_RESIZE_BAR_MAPPING_REQUIRED');
 const before=frame(prior),after=frame(next);
 return original.map((bar,i)=>{
  const output=target[i];
  if(![bar.y,bar.z,bar.diameter,output.diameter].every(Number.isFinite)||bar.diameter<=0||output.diameter<=0)fail('PERIMETER_RESIZE_BAR_INPUT_REQUIRED');
  const r=prior.insideRadius-bar.diameter/2000,R=next.insideRadius-output.diameter/2000,y=Math.abs(bar.y),z=Math.abs(bar.z),dy=y-before.cy,dz=z-before.cz;
  if(r<0||R<0)fail('PERIMETER_RESIZE_BAR_TOO_LARGE_FOR_BEND');
  let yy,zz;
  if(dy>=-1e-8&&dz>=-1e-8&&Math.abs(Math.hypot(dy,dz)-r)<=1e-6){
   if(r<=1e-12&&R>1e-12)fail('PERIMETER_RESIZE_CORNER_ANGLE_REQUIRED');
   const angle=r<=1e-12?0:Math.atan2(Math.max(0,dz),Math.max(0,dy));
   yy=Math.sign(bar.y)*(after.cy+R*Math.cos(angle));zz=Math.sign(bar.z)*(after.cz+R*Math.sin(angle));
  }else if(z<=before.cz+1e-9&&Math.abs(y-before.cy-r)<=1e-6){
   yy=Math.sign(bar.y)*(after.cy+R);zz=bar.z/before.cz*after.cz;
  }else if(y<=before.cy+1e-9&&Math.abs(z-before.cz-r)<=1e-6){
   yy=bar.y/before.cy*after.cy;zz=Math.sign(bar.z)*(after.cz+R);
  }else fail('PERIMETER_RESIZE_ORIGINAL_CONTACT_REQUIRED');
  return {...structuredClone(output),y:yy,z:zz};
 });
}
